import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function dialogs(w){w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};}
test('administrator navigation, date filtering, safe CSV and logout privacy',async()=>{
 const dom=new JSDOM(readFileSync('public/index.html','utf8'),{url:'http://localhost',runScripts:'outside-only'}),w=dom.window,d=w.document;
 let updates=[];let signed=false,blob,recipient='sskim07@gsenc.com';const records=[{id:'abc123',visit_date:'2026-10-15',purpose:'회의',team:'안전팀',name:'테스트',birth:'1990-01-01',phone:'010-0000-0000',gate:'서문',plate:'=malicious',vehicle_type:'승용',vehicle_name:'캐스퍼',role:'운전자',shoes:'285',status:'현장 제출',reviewer:'',version:1,created:'2026-10-14T10:00:00Z'},{id:'def456',visit_date:'2026-10-16',purpose:'점검',team:'공무팀',name:'테스트2',status:'현장 제출',reviewer:'',created:'2026-10-14T11:00:00Z'}];
 dialogs(w);w.createPermitAPI=()=>({api:async(path,data)=>{
  if(path==='session')return {reviewer:signed};
  if(path==='login'){if(data.password!=='test-password')throw Error('비밀번호가 맞지 않습니다.');signed=true;return {};}
  if(path==='logout'){signed=false;return {};}
  if(path==='requests')return signed?structuredClone(records):records.map(({id,visit_date,purpose,team,status,reviewer,version})=>({id,visit_date,purpose,team,status,reviewer,version}));
  if(path==='update'){assert.ok(signed);updates.push(data);return {};}
  if(path==='settings'){assert.ok(signed);if(data)recipient=data.recipient;return {recipient};}
 }});
 w.setInterval=()=>0;w.setTimeout=()=>0;w.Blob=Blob;w.URL.createObjectURL=b=>{blob=b;return 'blob:test';};w.HTMLAnchorElement.prototype.click=function(){};
 w.eval(readFileSync('src/app.js','utf8').replace("import {createPermitAPI} from './firebase-api.js';",''));await tick();
 assert.ok(!d.querySelector('#list').textContent.includes('테스트'));
 d.querySelector('#adminMenu').click();assert.ok(d.querySelector('#loginDialog').open);
 d.querySelector('#password').value='test-password';await d.querySelector('#loginForm').onsubmit({preventDefault(){}});await tick();
 assert.equal(d.querySelector('#adminTools').hidden,false);assert.equal(d.querySelector('#recipient').value,recipient);assert.match(d.querySelector('#list').textContent,/테스트/);
 d.querySelector('[data-day="2026-10-15"]').click();assert.match(d.querySelector('#list').textContent,/테스트/);
 assert.ok(!d.querySelector('#list').textContent.includes('테스트2'));
 await d.querySelector('#download').onclick();const csv=await blob.text();assert.match(csv,/테스트/);assert.ok(!csv.includes('테스트2'));assert.ok(csv.includes("'=malicious"));assert.match(csv,/010-0000-0000/);
 d.querySelector('#list [data-edit]').click();assert.equal(d.querySelector('#formDialog').hidden,false);assert.equal(d.querySelector('[name="purpose"]').value,'회의');d.querySelector('#reviewer').value='현장확인자';await d.querySelector('#requestForm').onsubmit({preventDefault(){}});assert.equal(updates.length,1);assert.equal(updates[0].name,'테스트');assert.equal(updates[0].reviewer,'현장확인자');
 d.querySelector('#recipient').value='changed@example.com';await d.querySelector('#settingsForm').onsubmit({preventDefault(){}});assert.equal(recipient,'changed@example.com');
 await d.querySelector('#login').onclick();assert.equal(d.querySelector('#adminTools').hidden,true);assert.ok(!d.querySelector('#list').textContent.includes('테스트'));
 dom.window.close();
});
test('app supports adding draft visitor rows and limits a submission to ten visitors',async()=>{
 const dom=new JSDOM(readFileSync('public/index.html','utf8'),{url:'http://localhost',runScripts:'outside-only'}),w=dom.window,d=w.document;
 dialogs(w);w.createPermitAPI=()=>({api:async path=>path==='session'?{reviewer:false}:[]});w.setInterval=()=>0;w.setTimeout=()=>0;
 w.eval(readFileSync('src/app.js','utf8').replace("import {createPermitAPI} from './firebase-api.js';",''));await tick();d.querySelector('#new').click();
 for(let i=0;i<12;i++)d.querySelector('#add').click();assert.equal(d.querySelectorAll('.person').length,10);
 assert.equal(d.querySelectorAll('[name="shoes"] option').length,160);
 d.querySelector('[name="name"]').value='임시 방문자';d.querySelector('#draft').click();assert.equal(JSON.parse(w.sessionStorage.getItem('permit-draft'))[0].name,'임시 방문자');
 dom.window.close();
});

async function requestPage(){
 const dom=new JSDOM(readFileSync('public/index.html','utf8'),{url:'http://localhost',runScripts:'outside-only'}),w=dom.window,d=w.document,submitted=[],stored=[];
 dialogs(w);w.confirm=()=>true;w.setInterval=()=>0;w.setTimeout=()=>0;
 w.createPermitAPI=()=>({api:async(path,data)=>{if(path==='session')return {reviewer:false};if(path==='requests'&&data){submitted.push(structuredClone(data));stored.push(...data.items.map((item,index)=>({id:'record-'+index,visit_date:item.visit_date,purpose:item.purpose,team:item.team,status:'현장 제출',reviewer:'',version:1})));return {count:data.items.length};}return stored;}});
 w.eval(readFileSync('src/app.js','utf8').replace("import {createPermitAPI} from './firebase-api.js';",''));await tick();d.querySelector('#new').click();
 const enter=(name,value)=>{const input=d.querySelector(`[name="${name}"]`);input.value=value;input.dispatchEvent(new w.Event('input',{bubbles:true}));return input;};
 return {dom,w,d,submitted,enter};
}
test('numeric birthday and telephone are formatted and valid submission preserves their values',async()=>{
 const {dom,w,d,submitted,enter}=await requestPage();
 try{
  enter('purpose','기능 테스트');enter('team','테스트팀');enter('name','가상방문자');
  const birth=enter('birth','19900123'),phone=enter('phone','01000000000');
  assert.equal(birth.value,'1990-01-23');assert.equal(phone.value,'010-0000-0000');
  assert.equal(birth.checkValidity(),true);
  await d.querySelector('#requestForm').onsubmit({preventDefault(){}});
  assert.equal(submitted.length,1);assert.equal(submitted[0].items[0].birth,'1990-01-23');assert.equal(submitted[0].items[0].phone,'010-0000-0000');assert.equal(d.querySelector('[name="name"]').value,'');assert.equal(d.querySelector('#formDialog').hidden,false);
 }finally{dom.window.close();}
});
test('missing required field displays an inline error above the buttons and focuses the first blank',async()=>{
 const {dom,d,submitted,enter}=await requestPage();
 try{
  await d.querySelector('#requestForm').onsubmit({preventDefault(){}});
  assert.match(d.querySelector('#formError').textContent,/방문목적/);assert.equal(d.activeElement.name,'purpose');assert.equal(d.activeElement.getAttribute('aria-invalid'),'true');assert.equal(submitted.length,0);
  assert.ok(d.querySelector('#formError').compareDocumentPosition(d.querySelector('.dialog-actions'))&4);
  enter('purpose','테스트');await d.querySelector('#requestForm').onsubmit({preventDefault(){}});assert.equal(d.activeElement.name,'team');
 }finally{dom.window.close();}
});
test('impossible date, future birthday and incomplete phone are rejected with focus',async()=>{
 const {dom,d,submitted,enter}=await requestPage();
 try{
  enter('purpose','테스트');enter('team','테스트팀');enter('name','가상방문자');enter('birth','19900230');enter('phone','01000000000');
  await d.querySelector('#requestForm').onsubmit({preventDefault(){}});assert.equal(d.activeElement.name,'birth');assert.match(d.querySelector('#formError').textContent,/실제 날짜/);
  enter('birth','29990101');await d.querySelector('#requestForm').onsubmit({preventDefault(){}});assert.match(d.querySelector('#formError').textContent,/오늘 이후/);
  enter('birth','20000229');enter('phone','01012');await d.querySelector('#requestForm').onsubmit({preventDefault(){}});assert.equal(d.activeElement.name,'phone');assert.match(d.querySelector('#formError').textContent,/휴대전화번호/);assert.equal(submitted.length,0);
 }finally{dom.window.close();}
});
test('partial draft visibly saves, restores changes and reports storage failure inline',async()=>{
 const {dom,w,d,enter}=await requestPage();
 try{
  enter('name','임시 방문자');enter('birth','19780203');enter('phone','01000000000');d.querySelector('#draft').click();assert.match(d.querySelector('#draftMessage').textContent,/임시 저장 완료/);
  assert.equal(d.querySelector('#formError').textContent,'');enter('name','바뀐 이름');d.querySelector('#loadDraft').click();assert.equal(d.querySelector('[name="name"]').value,'임시 방문자');assert.equal(d.querySelector('[name="birth"]').value,'1978-02-03');assert.equal(d.querySelector('[name="phone"]').value,'010-0000-0000');
  Object.defineProperty(w,'sessionStorage',{get(){throw Error('storage blocked');}});d.querySelector('#draft').click();assert.match(d.querySelector('#formError').textContent,/임시 저장에 실패/);
 }finally{dom.window.close();}
});
test('phone accepts ten digits and hyphen editing retains a usable cursor',async()=>{
 const {dom,w,d,enter}=await requestPage();
 try{
  assert.equal(enter('phone','0110000000').value,'011-000-0000');
  const birth=enter('birth','19900123');birth.focus();birth.setSelectionRange(5,5);birth.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Backspace',bubbles:true}));assert.equal(birth.selectionStart,3);assert.equal(birth.selectionEnd,5);
 }finally{dom.window.close();}
});

test('one shared header populates multiple visitors, draft appears below and submitted list replaces it',async()=>{
 const {dom,w,d,submitted,enter}=await requestPage();
 try{
  assert.equal(d.querySelector('#formDialog').tagName,'SECTION');assert.equal(d.querySelector('#formDialog').hidden,false);
  enter('purpose','공통 회의');enter('team','공무팀');enter('name','첫방문자');enter('birth','19900123');enter('phone','01000000000');
  d.querySelector('#add').click();const second=d.querySelectorAll('.person')[1];
  for(const [key,value] of [['name','두번째방문자'],['birth','19800229'],['phone','01000000001']]){const input=second.querySelector(`[name="${key}"]`);input.value=value;input.dispatchEvent(new w.Event('input',{bubbles:true}));}
  assert.equal(d.querySelectorAll('[name="purpose"]').length,1);
  d.querySelector('#draft').click();assert.equal(d.querySelectorAll('#list [data-draft]').length,2);assert.match(d.querySelector('#list').textContent,/작성 중/);
  enter('name','바뀐이름');d.querySelector('#list [data-draft]').click();assert.equal(d.querySelector('[name="name"]').value,'첫방문자');assert.equal(d.querySelectorAll('.person').length,2);
  await d.querySelector('#requestForm').onsubmit({preventDefault(){}});
  assert.equal(submitted[0].items.length,2);assert.ok(submitted[0].items.every(item=>item.purpose==='공통 회의'&&item.team==='공무팀'));
  assert.equal(w.sessionStorage.getItem('permit-draft'),null);assert.equal(d.querySelectorAll('#list [data-draft]').length,0);assert.match(d.querySelector('#list').textContent,/현장 제출/);assert.equal(d.querySelector('[name="name"]').value,'');
 }finally{dom.window.close();}
});
test('restoring a legacy draft preserves different visitor dates and purposes',async()=>{
 const {dom,w,d}=await requestPage();
 try{
  const saved=[{visit_date:'2026-10-15',purpose:'회의',team:'안전팀',gate:'서문',name:'방문자1'},{visit_date:'2026-10-16',purpose:'점검',team:'공무팀',gate:'정문',name:'방문자2'}];
  w.sessionStorage.setItem('permit-draft',JSON.stringify(saved));d.querySelector('#loadDraft').click();d.querySelector('#draft').click();
  const restored=JSON.parse(w.sessionStorage.getItem('permit-draft'));assert.equal(restored[1].visit_date,'2026-10-16');assert.equal(restored[1].purpose,'점검');assert.equal(restored[1].gate,'정문');
 }finally{dom.window.close();}
});
