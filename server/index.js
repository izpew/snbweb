import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const digest = s => createHash('sha256').update(s).digest('hex');
export function createApp(db) {
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS members(id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS characters(id TEXT PRIMARY KEY, member_id TEXT NOT NULL REFERENCES members(id), name TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS characters_member ON characters(member_id);
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, member_id TEXT NOT NULL REFERENCES members(id), expires INTEGER NOT NULL);
    INSERT OR IGNORE INTO schema_migrations VALUES(1);`);
  const attempts = new Map();
  return async (req, res) => {
    const send = (status, value) => { res.writeHead(status, {'Content-Type':'application/json; charset=utf-8'}); res.end(JSON.stringify(value)); };
    const fail = (status, message) => { throw Object.assign(new Error(message), {status}); };
    const body = async () => {
      let raw = ''; for await (const chunk of req) { raw += chunk; if (Buffer.byteLength(raw)>8192) fail(413,'입력이 너무 큽니다.'); }
      try { return JSON.parse(raw); } catch { fail(400,'JSON 입력을 확인해 주세요.'); }
    };
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Content-Security-Policy',"default-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      const path = new URL(req.url,'http://localhost').pathname;
      if (!path.startsWith('/api/')) {
        const files = {'/':['../public/index.html','text/html'], '/app.js':['../public/app.js','text/javascript'], '/app.css':['../public/app.css','text/css'], '/design.css':['../DESIGN.css','text/css']};
        if (req.method!=='GET' || !files[path]) fail(404,'페이지를 찾을 수 없습니다.');
        const content = await readFile(new URL(files[path][0],import.meta.url));
        res.writeHead(200,{'Content-Type':files[path][1]+'; charset=utf-8'}); res.end(content); return;
      }
      if (req.method!=='GET') {
        if (req.headers.origin && req.headers.origin!==`http://${req.headers.host}`) fail(403,'허용되지 않은 요청 출처입니다.');
        if (!req.headers['content-type']?.startsWith('application/json')) fail(415,'JSON 형식이 필요합니다.');
      }
      if (path==='/api/health' && req.method==='GET') { db.prepare('SELECT 1').get(); send(200,{status:'ok',database:'ok'}); return; }
      const token = /(?:^|;\s*)snb_session=([a-f0-9]+)/.exec(req.headers.cookie||'')?.[1];
      const member = token && db.prepare('SELECT m.id,m.username FROM sessions s JOIN members m ON m.id=s.member_id WHERE s.token=? AND s.expires>?').get(digest(token),Date.now());
      if (['/api/register','/api/login'].includes(path) && req.method==='POST') {
        const now=Date.now(); for (const [key,rate] of attempts) if(rate.until<now) attempts.delete(key);
        const ip=req.socket.remoteAddress; const rate=attempts.get(ip)||{count:0,until:now+60000}; attempts.set(ip,rate);
        if (++rate.count>20) fail(429,'잠시 후 다시 시도해 주세요.');
        const {username,password}=await body();
        if(typeof username!=='string'|| !/^[a-zA-Z0-9_]{3,24}$/.test(username)||typeof password!=='string'||password.length<10||password.length>128) fail(400,'아이디: 영문·숫자·밑줄 3~24자 / 비밀번호: 10~128자');
        let user=db.prepare('SELECT * FROM members WHERE username=?').get(username);
        if(path==='/api/register') {
          if(user) fail(409,'이미 사용 중인 아이디입니다.');
          const salt=randomBytes(16).toString('hex'); user={id:randomUUID(),username};
          db.prepare('INSERT INTO members VALUES(?,?,?)').run(user.id,username,salt+':'+scryptSync(password,salt,64).toString('hex'));
        } else {
          const [salt,key]=(user?.password||'dummy:'+ '00'.repeat(64)).split(':');
          const valid=timingSafeEqual(scryptSync(password,salt,64),Buffer.from(key,'hex'));
          if(!user||!valid) fail(401,'아이디 또는 비밀번호를 확인해 주세요.');
        }
        const next=randomBytes(32).toString('hex');
        db.prepare('DELETE FROM sessions WHERE expires<=?').run(now);
        db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(digest(next),user.id,now+86400000);
        res.setHeader('Set-Cookie',`snb_session=${next}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400`);
        send(200,{member:{id:user.id,username:user.username}}); return;
      }
      if(!member) fail(401,'로그인이 필요합니다.');
      if(path==='/api/me'&&req.method==='GET') {send(200,{member});return;}
      if(path==='/api/logout'&&req.method==='POST') {
        db.prepare('DELETE FROM sessions WHERE token=?').run(digest(token));
        res.setHeader('Set-Cookie','snb_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'); send(200,{ok:true});return;
      }
      if(path==='/api/characters'&&req.method==='GET') {send(200,{characters:db.prepare('SELECT id,name FROM characters WHERE member_id=? ORDER BY rowid').all(member.id)});return;}
      const id=/^\/api\/characters\/([^/]+)$/.exec(path)?.[1];
      if((path==='/api/characters'&&req.method==='POST')||(id&&req.method==='PATCH')) {
        if(id&&!db.prepare('SELECT id FROM characters WHERE id=? AND member_id=?').get(id,member.id)) fail(403,'캐릭터 수정 권한이 없습니다.');
        const {name}=await body();
        if(typeof name!=='string'||!name.trim()||name.trim().length>40) fail(400,'이름은 1~40자로 입력해 주세요.');
        const character={id:id||randomUUID(),name:name.trim()};
        if(id) db.prepare('UPDATE characters SET name=? WHERE id=? AND member_id=?').run(character.name,id,member.id);
        else db.prepare('INSERT INTO characters VALUES(?,?,?)').run(character.id,member.id,character.name);
        send(id?200:201,{character});return;
      }
      fail(404,'요청한 기능을 찾을 수 없습니다.');
    } catch(error) {send(error.status||500,{error:error.status?error.message:'서버 오류가 발생했습니다.'});}
  };
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const path=process.env.DATABASE_PATH||fileURLToPath(new URL('../data/snbweb.sqlite',import.meta.url));
  mkdirSync(dirname(path),{recursive:true}); const db=new DatabaseSync(path);
  const server=createServer(createApp(db)); const port=Number(process.env.PORT||3000); const host=process.env.HOST||'127.0.0.1';
  server.listen(port,host,()=>console.log(`snbweb 실행: http://${host}:${port}`));
  for(const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>server.close(()=>{db.close();process.exit(0);}));
}
