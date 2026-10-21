const $ = selector => document.querySelector(selector);
async function api(path, data, method = 'POST') {
  const response = await fetch('/api'+path, data === undefined ? {} : {method,headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error), {status:response.status});
  return result;
}
async function run(action) {
  $('#error').hidden=true;
  document.querySelectorAll('button').forEach(b=>b.disabled=true);
  try {await action();} catch(e) {$('#error').textContent=e.message;$('#error').hidden=false;}
  finally {document.querySelectorAll('button').forEach(b=>b.disabled=false);}
}
async function refresh() {
  $('#status').textContent='불러오는 중입니다…';
  let member;
  try {({member}=await api('/me'));} catch(e) {
    if(e.status!==401) {$('#status').textContent='서버에 연결하지 못했습니다.';throw e;}
    $('#auth').hidden=false;$('#lounge').hidden=true;$('#status').textContent='로그인 후 로비를 이용할 수 있습니다.';return;
  }
  $('#auth').hidden=true;$('#lounge').hidden=false;$('#profile').textContent=member.username+' 님의 공간';
  const {characters}=await api('/characters'); const list=$('#characters');list.replaceChildren();
  if(!characters.length) {const li=document.createElement('li');li.textContent='아직 캐릭터가 없습니다. 첫 캐릭터를 추가해 주세요.';list.append(li);}
  for(const character of characters) {
    const li=document.createElement('li');const name=document.createElement('span');name.textContent=character.name;
    const button=document.createElement('button');button.className='noir-button noir-button--sm';button.textContent='이름 수정';button.setAttribute('aria-label',character.name+' 이름 수정');
    button.onclick=()=>{const next=prompt('새 캐릭터 이름',character.name);if(next!==null)run(async()=>{await api('/characters/'+character.id,{name:next},'PATCH');await refresh();});};
    li.append(name,button);list.append(li);
  }
  $('#status').textContent='서버와 데이터베이스에 연결되었습니다.';
}
$('#auth-form').onsubmit=e=>{e.preventDefault();const form=e.currentTarget;const action=e.submitter.value;run(async()=>{await api('/'+action,Object.fromEntries(new FormData(form)));form.reset();await refresh();});};
$('#character-form').onsubmit=e=>{e.preventDefault();const form=e.currentTarget;run(async()=>{await api('/characters',Object.fromEntries(new FormData(form)));form.reset();await refresh();});};
$('#logout').onclick=()=>run(async()=>{await api('/logout',{});await refresh();});
$('#retry').onclick=()=>run(refresh);
run(refresh);
