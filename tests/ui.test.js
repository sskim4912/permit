import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function dialogs(w){w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};}
test('administrator navigation, date filtering, safe CSV and logout privacy',async()=>{
 const dom=new JSDOM(readFileSync('public/index.html','utf8'),{url:'http://localhost',runScripts:'outside-only'}),w=dom.window,d=w.document;
 let signed=false,blob,recipient='sskim07@gsenc.com';const records=[{id:'abc123',visit_date:'2026-10-15',purpose:'회의',team:'안전팀',name:'테스트',birth:'1990-01-01',phone:'010-0000-0000',gate:'서문',plate:'=malicious',vehicle_type:'승용',vehicle_name:'캐스퍼',role:'운전자',shoes:'285',status:'현장 제출',reviewer:'',version:1,created:'2026-10-14T10:00:00Z'},{id:'def456',visit_date:'2026-10-16',purpose:'점검',team:'공무팀',name:'테스트2',status:'현장 제출',reviewer:'',created:'2026-10-14T11:00:00Z'}];
 dialogs(w);w.createPermitAPI=()=>({api:async(path,data)=>{
  if(path==='session')return {reviewer:signed};
  if(path==='login'){if(data.password!=='test-password')throw Error('비밀번호가 맞지 않습니다.');signed=true;return {};}
  if(path==='logout'){signed=false;return {};}
  if(path==='requests')return signed?structuredClone(records):records.map(({id,visit_date,purpose,team,status,reviewer,version})=>({id,visit_date,purpose,team,status,reviewer,version}));
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
