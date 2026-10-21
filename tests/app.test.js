import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server/index.js';

test('인증·계정별 캐릭터 격리·소유권·저장 유지',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'snbweb-test-'));const path=join(dir,'test.sqlite');
  let db=new DatabaseSync(path);let server=createServer(createApp(db));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  async function request(route,data,cookie,method='POST') {
    const res=await fetch(base+route,{method:data===undefined?'GET':method,headers:{...(cookie?{Cookie:cookie}:{}),...(data!==undefined?{'Content-Type':'application/json'}:{})},body:data===undefined?undefined:JSON.stringify(data)});
    return {status:res.status,data:await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0]};
  }
  try {
    assert.equal((await request('/api/characters')).status,401);
    assert.equal((await request('/api/health')).data.database,'ok');
    assert.equal((await request('/api/register',{username:'bad',password:'short'})).status,400);
    const a=await request('/api/register',{username:'alice',password:'test-password-123'});assert.equal(a.status,200);
    const b=await request('/api/register',{username:'bobby',password:'test-password-456'});assert.equal(b.status,200);
    const created=await request('/api/characters',{name:'첫 캐릭터'},a.cookie);assert.equal(created.status,201);
    assert.equal((await request('/api/characters',undefined,b.cookie)).data.characters.length,0);
    assert.equal((await request('/api/characters/'+created.data.character.id,{name:'침입'},b.cookie,'PATCH')).status,403);
    assert.equal((await request('/api/characters/'+created.data.character.id,{name:'수정된 이름'},a.cookie,'PATCH')).status,200);
    assert.equal((await request('/api/login',{username:'alice',password:'wrong-password'})).status,401);
    await request('/api/logout',{},a.cookie);assert.equal((await request('/api/me',undefined,a.cookie)).status,401);
    await new Promise(resolve=>server.close(resolve));db.close();
    db=new DatabaseSync(path);server=createServer(createApp(db));
    assert.equal(db.prepare('SELECT name FROM characters').get().name,'수정된 이름');
    assert.notEqual(db.prepare('SELECT password FROM members WHERE username=?').get('alice').password,'test-password-123');
  } finally {
    if(server.listening) await new Promise(resolve=>server.close(resolve));db.close();rmSync(dir,{recursive:true,force:true});
  }
});
