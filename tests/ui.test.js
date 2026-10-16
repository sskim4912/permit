import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const tick=()=>new Promise(resolve=>setTimeout(resolve,5));
const base={visit_date:'2026-10-15',purpose:'회의',team:'공무팀',gate:'서문',name:'가상방문자',birth:'1990-01-23',phone:'010-0000-0000',plate:'=formula',vehicle_type:'승용',vehicle_name:'캐스퍼',role:'운전자',shoes:'280',reviewer:'',version:1,created:'2026-10-15T00:00:00Z'};
async function setup({draft=null,blocked=false,own=false}={}){
 const dom=new JSDOM(readFileSync('public/index.html','utf8'),{url:'https://permit.example',runScripts:'outside-only'}),w=dom.window,d=w.document;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};w.confirm=()=>true;w.setInterval=()=>0;
 const realTimer=w.setTimeout.bind(w);w.setTimeout=(fn,ms)=>ms===350?realTimer(fn,0):0;w.Blob=Blob;
 if(draft)w.sessionStorage.setItem('permit-draft',JSON.stringify(draft));if(blocked)Object.defineProperty(w,'sessionStorage',{get(){throw Error('blocked');}});
 let signed=false,recipient='test@example.com',blob;const calls=[];
 let records=[{...base,id:'one',status:'현장 제출',own,author_name:'최초 작성자'},{...base,id:'two',name:'예시방문자',status:'발주처 제출'},{...base,id:'three',name:'테스트방문자',status:'승인 완료'}];
 w.URL.createObjectURL=value=>{blob=value;return 'blob:test';};w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=function(){};
 w.createPermitAPI=()=>({api:async(path,data)=>{
  if(path==='session')return {reviewer:signed};
  if(path==='login'){if(data.password!=='test-password')throw Error('비밀번호가 맞지 않습니다.');signed=true;return {};}
  if(path==='logout'){signed=false;return {};}
  if(path==='requests'&&!data)return records.map(row=>signed||row.own?{...row}:Object.fromEntries(['id','visit_date','visit_end_date','purpose','team','status','reviewer','version','created'].map(key=>[key,row[key]])));
  if(path==='requests'){calls.push({path,data:structuredClone(data)});records.push(...data.items.map((row,index)=>({...row,own:true,author_name:data.author_name,id:'new'+index,status:'승인 대기',reviewer:'',version:1,created:'2026-10-15T01:00:00Z'})));return {count:data.items.length};}
  if(path==='owner-update'){
   const row=records.find(r=>r.id===data.id);if(!row?.own||!['승인 대기','현장 제출'].includes(row.status)||row.delivery_at)throw Error('본인 승인 대기만 수정할 수 있습니다.');calls.push({path,data:structuredClone(data)});Object.assign(row,data,{modified_by:data.reviewer,modified_at:'2026-10-16T00:00:00Z',version:row.version+1});return {};
  }
  if(path==='owner-delete'){
   if(data.items.some(i=>!records.find(r=>r.id===i.id)?.own))throw Error('본인 신청만 삭제');calls.push({path,data:structuredClone(data)});records=records.filter(r=>!data.items.some(i=>i.id===r.id));return {};
  }
  if(!signed)throw Error('관리자 로그인이 필요합니다.');
  if(path==='settings'){if(data)recipient=data.recipient;return {recipient};}
  if(path==='update'){calls.push({path,data:structuredClone(data)});const index=records.findIndex(row=>row.id===data.id);if(index<0||records[index].version!==data.version)throw Error('다른 담당자가 변경했습니다.');records[index]={...records[index],...data,version:data.version+1};return {};}
  if(path==='bulk'){calls.push({path,data:structuredClone(data)});for(const item of data.items){const row=records.find(row=>row.id===item.id);if(!row||row.version!==item.version)throw Error('선택 내역이 변경되었습니다.');}
   for(const item of data.items){const row=records.find(row=>row.id===item.id);if(data.action==='delete')records=records.filter(row=>row.id!==item.id);else{row.version++;row.reviewer=data.reviewer;if(data.action==='approve')row.status='승인 완료';if(data.action==='delivered')row.delivery_at='2026-10-15T02:00:00Z';}}return {};}
 }});
 w.eval(readFileSync('src/app.js','utf8').replace("import {createPermitAPI} from './firebase-api.js';",''));await tick();d.querySelector('#authorName').value='테스트 작성자';
 const enter=(key,value,index=0)=>{const input=d.querySelectorAll(`[name="${key}"]`)[index];input.value=value;input.dispatchEvent(new w.Event('input',{bubbles:true}));return input;};
 const login=async()=>{await d.querySelector('#login').onclick();d.querySelector('#password').value='test-password';await d.querySelector('#loginForm').onsubmit({preventDefault(){}});await tick();};
 const change=(id,value)=>{d.querySelector('#'+id).value=value;d.querySelector('#'+id).dispatchEvent(new w.Event('change',{bubbles:true}));};
 const submit=()=>d.querySelector('#requestForm').onsubmit({preventDefault(){}});
 return {dom,w,d,calls,enter,login,change,submit,getBlob:()=>blob,records:()=>records};
}
test('one screen and two displayed statuses; non-admin has no privileged controls or personal data',async()=>{
 const {dom,d}=await setup();try{assert.equal(d.querySelector('#requestPanel').hidden,false);assert.equal(d.querySelector('#adminControls').hidden,true);assert.equal(d.querySelector('#adminSettings').hidden,true);assert.equal(d.querySelectorAll('[data-select]').length,0);assert.equal(d.querySelectorAll('[data-edit]').length,0);assert.ok(!d.querySelector('#list').textContent.includes('가상방문자'));assert.deepEqual([...d.querySelector('#statusFilter').options].map(option=>option.textContent),['전체','승인 대기','승인 완료']);assert.ok(!d.querySelector('#list').textContent.includes('현장 제출'));}finally{dom.window.close();}
});
test('numeric input autoformats, auto-saves and submits without manual draft commands',async()=>{
 const {dom,w,d,enter,calls,submit}=await setup();try{enter('purpose','테스트');enter('team','테스트팀');enter('name','가상방문자');assert.equal(enter('birth','19900123').value,'1990-01-23');assert.equal(enter('phone','01000000000').value,'010-0000-0000');await tick();assert.equal(JSON.parse(w.sessionStorage.getItem('permit-draft'))[0].birth,'1990-01-23');assert.match(d.querySelector('#draftStatus').textContent,/자동 임시저장됨/);await submit();assert.equal(calls[0].data.items[0].phone,'010-0000-0000');assert.equal(w.sessionStorage.getItem('permit-draft'),null);assert.equal(d.querySelector('[name="name"]').value,'');assert.match(d.querySelector('#list').textContent,/승인 대기/);}finally{dom.window.close();}
});
test('old tab drafts restore automatically with per-person visit details',async()=>{
 const saved=[{...base,purpose:'회의'},{...base,name:'다른방문자',purpose:'점검',team:'안전팀',gate:'정문',visit_date:'2026-10-16'}];const {dom,d}=await setup({draft:saved});try{assert.equal(d.querySelectorAll('.person').length,2);assert.equal(d.querySelectorAll('[name="purpose"]')[1].value,'점검');assert.equal(d.querySelectorAll('[name="gate"]')[1].value,'정문');assert.match(d.querySelector('#draftStatus').textContent,/복원/);}finally{dom.window.close();}
});
test('missing or invalid fields are shown above submit and focused',async()=>{
 const {dom,d,enter,submit,calls}=await setup();try{await submit();assert.equal(d.activeElement.name,'purpose');assert.match(d.querySelector('#formError').textContent,/방문목적/);assert.ok(d.querySelector('#formError').compareDocumentPosition(d.querySelector('.form-actions'))&4);enter('purpose','테스트');enter('team','팀');enter('name','가상방문자');enter('birth','19900230');enter('phone','01000000000');await submit();assert.equal(d.activeElement.name,'birth');enter('birth','19900123');enter('phone','01012');await submit();assert.equal(d.activeElement.name,'phone');assert.equal(calls.length,0);}finally{dom.window.close();}
});
test('per-person fields, vehicle selector and maximum ten visitors',async()=>{
 const {dom,d,enter,submit,calls}=await setup();try{enter('purpose','회의');enter('team','공무팀');enter('name','방문자1');enter('birth','19900123');enter('phone','01000000000');d.querySelector('#add').click();enter('purpose','점검',1);enter('team','안전팀',1);enter('name','방문자2',1);enter('birth','19800229',1);enter('phone','01000000001',1);enter('gate','정문',1);enter('visit_date','2026-10-16',1);assert.deepEqual([...d.querySelector('[name="vehicle_type"]').options].map(o=>o.value),['승용','승합']);await submit();assert.equal(calls[0].data.items[1].purpose,'점검');assert.equal(calls[0].data.items[1].gate,'정문');for(let i=0;i<12;i++)d.querySelector('#add').click();assert.equal(d.querySelectorAll('.person').length,10);}finally{dom.window.close();}
});
test('blocked storage reports failure without discarding typed input',async()=>{
 const {dom,d,enter}=await setup({blocked:true});try{enter('name','보존할 내용');await tick();assert.equal(d.querySelector('[name="name"]').value,'보존할 내용');assert.match(d.querySelector('#draftStatus').textContent,/자동 임시저장 불가/);}finally{dom.window.close();}
});
test('admin selects and approves multiple rows, requires operator name and supports cancel',async()=>{
 const {dom,w,d,login,calls}=await setup();try{await login();assert.equal(d.querySelector('#adminControls').hidden,false);d.querySelector('[data-select="one"]').click();d.querySelector('[data-select="two"]').click();await d.querySelector('#approve').onclick();assert.equal(calls.length,0);assert.equal(d.activeElement.id,'reviewer');d.querySelector('#reviewer').value='담당자';w.confirm=()=>false;await d.querySelector('#approve').onclick();assert.equal(calls.length,0);w.confirm=()=>true;await d.querySelector('#approve').onclick();assert.equal(calls[0].data.action,'approve');assert.equal(calls[0].data.items.length,2);assert.equal(d.querySelectorAll('.badge.approved').length,3);assert.equal(d.querySelector('#selectedCount').textContent,'0명 선택 · 최대 10명');}finally{dom.window.close();}
});
test('mail opening alone never marks delivered; explicit sent confirmation records all selected rows',async()=>{
 const {dom,d,login,calls}=await setup();try{await login();d.querySelector('#reviewer').value='담당자';d.querySelector('[data-select="one"]').click();await d.querySelector('#mail').onclick();assert.equal(d.querySelector('#mailDialog').open,true);assert.match(d.querySelector('#mailBody').value,/가상방문자/);assert.equal(calls.length,0);await d.querySelector('#recordMail').onclick();assert.equal(calls[0].data.action,'delivered');assert.equal(d.querySelector('#mailDialog').open,false);assert.match(d.querySelector('#list').textContent,/10/);}finally{dom.window.close();}
});
test('administrator deletion requires confirmation and clears selected rows',async()=>{
 const {dom,w,d,login,calls}=await setup();try{await login();d.querySelector('#reviewer').value='담당자';d.querySelector('[data-select="one"]').click();w.confirm=()=>false;await d.querySelector('#delete').onclick();assert.equal(calls.length,0);w.confirm=()=>true;await d.querySelector('#delete').onclick();assert.equal(calls[0].data.action,'delete');assert.equal(d.querySelector('[data-record="one"]'),null);}finally{dom.window.close();}
});
test('inline editor retains unsaved edits across refresh and cancellation restores applicant draft',async()=>{
 const {dom,w,d,login,enter,calls,submit}=await setup();try{enter('name','작성중 방문자');await tick();await login();d.querySelector('[data-edit="one"]').click();assert.ok(d.querySelector('#list #requestForm'));assert.equal(d.querySelector('#formHome #requestForm'),null);enter('purpose','수정된 회의');await d.querySelector('#refresh').onclick();assert.equal(d.querySelector('[name="purpose"]').value,'수정된 회의');assert.equal(d.querySelectorAll('.inline-editor-row').length,1);d.querySelector('#cancelEdit').click();assert.equal(d.querySelector('[name="name"]').value,'작성중 방문자');d.querySelector('[data-edit="one"]').click();d.querySelector('#reviewer').value='담당자';enter('purpose','최종 수정');await submit();assert.equal(calls[0].path,'update');assert.equal(calls[0].data.purpose,'최종 수정');assert.equal(d.querySelectorAll('.inline-editor-row').length,0);assert.equal(JSON.parse(w.sessionStorage.getItem('permit-draft'))[0].name,'작성중 방문자');}finally{dom.window.close();}
});
test('CSV is admin-only and preserves phone text while escaping formulas; logout clears private UI',async()=>{
 const {dom,d,login,getBlob}=await setup();try{await login();await d.querySelector('#download').onclick();const csv=await getBlob().text();assert.match(csv,/010-0000-0000/);assert.ok(csv.includes("'=formula"));assert.match(csv,/기존 상태값/);d.querySelector('[data-select="one"]').click();await d.querySelector('#login').onclick();assert.equal(d.querySelector('#adminControls').hidden,true);assert.ok(!d.querySelector('#list').textContent.includes('가상방문자'));assert.equal(d.querySelector('#mailBody').value,'');assert.equal(d.querySelectorAll('[data-select]').length,0);}finally{dom.window.close();}
});
test('status and search filters clear selections and map legacy statuses without rewriting data',async()=>{
 const {dom,d,login,change,records}=await setup();try{await login();d.querySelector('#selectAll').click();assert.equal(d.querySelectorAll('[data-select]:checked').length,3);d.querySelector('#selectAll').click();assert.equal(d.querySelectorAll('[data-select]:checked').length,0);d.querySelector('[data-select="one"]').click();change('statusFilter','승인 대기');assert.equal(d.querySelectorAll('[data-record]').length,2);assert.equal(d.querySelector('#selectedCount').textContent,'0명 선택 · 최대 10명');assert.match(d.querySelector('#list').textContent,/기존 전달 기록/);assert.equal(records()[0].status,'현장 제출');assert.equal(records()[1].status,'발주처 제출');change('statusFilter','승인 완료');assert.equal(d.querySelectorAll('[data-record]').length,1);}finally{dom.window.close();}
});

test('visit periods validate ordering, filter inclusive dates and survive edit, email and CSV',async()=>{
 const {dom,w,d,enter,submit,calls,login,change,getBlob,records}=await setup({draft:[{...base,visit_date:'2026-10-20',visit_end_date:'2026-10-23'}]});
 try{
  assert.equal(d.querySelector('[name="visit_date"]').type,'date');assert.equal(d.querySelector('[name="visit_end_date"]').type,'date');
  enter('visit_end_date','2026-10-19');await submit();assert.equal(calls.length,0);assert.equal(d.activeElement.name,'visit_end_date');assert.match(d.querySelector('#formError').textContent,/같거나 이후/);
  enter('visit_end_date','2026-10-23');await submit();assert.equal(calls[0].data.items[0].visit_end_date,'2026-10-23');
  change('dateFilter','2026-10-22');assert.equal(d.querySelectorAll('[data-record]').length,1);assert.match(d.querySelector('#list').textContent,/2026-10-20 ~ 2026-10-23/);
  change('dateFilter','2026-10-24');assert.equal(d.querySelectorAll('[data-record]').length,0);
  change('dateFilter','2026-10-23');await login();d.querySelector('#reviewer').value='담당자';d.querySelector('[data-select]').click();await d.querySelector('#mail').onclick();assert.match(d.querySelector('#mailBody').value,/방문시작일: 2026-10-20/);assert.match(d.querySelector('#mailBody').value,/방문종료일: 2026-10-23/);
  await d.querySelector('#download').onclick();const csv=await getBlob().text();assert.match(csv,/방문종료일/);assert.match(csv,/2026-10-23/);
  d.querySelector('[data-edit]').click();assert.equal(d.querySelector('[name="visit_end_date"]').value,'2026-10-23');enter('visit_end_date','2026-10-25');await submit();assert.equal(records().find(r=>r.id==='new0').visit_end_date,'2026-10-25');
 }finally{dom.window.close();}
});
test('legacy drafts and records use a same-day end; starting date changes keep same-day visits aligned',async()=>{
 const {dom,w,d,login,change}=await setup({draft:[{...base}]});try{
  assert.equal(d.querySelector('[name="visit_end_date"]').value,base.visit_date);
  const start=d.querySelector('[name="visit_date"]');start.value='2026-10-21';start.dispatchEvent(new w.Event('change',{bubbles:true}));assert.equal(d.querySelector('[name="visit_end_date"]').value,'2026-10-21');
  await login();d.querySelector('[data-edit]').click();assert.equal(d.querySelector('[name="visit_end_date"]').value,base.visit_date);
  change('dateFilter','2026-10-16');assert.equal(d.querySelectorAll('[data-record]').length,1); // unsaved editor remains visible
 }finally{dom.window.close();}
});

test('one author is required per submission and is saved with every visitor',async()=>{
 const {dom,d,submit,calls,enter}=await setup({draft:[{...base},{...base,name:'다른 방문자'}]});try{
  d.querySelector('#authorName').value='';await submit();assert.equal(d.activeElement.id,'authorName');assert.equal(calls.length,0);
  d.querySelector('#authorName').value='최초 작성 담당';await submit();assert.equal(calls[0].data.author_name,'최초 작성 담당');assert.equal(calls[0].data.items.length,2);
 }finally{dom.window.close();}
});
test('applicant must match original author to open, save or delete; a changed name is rechecked',async()=>{
 const {dom,w,d,submit,calls,enter,records}=await setup({own:true});try{
  assert.equal(d.querySelector('#mail').hidden,true);assert.equal(d.querySelector('#approve').hidden,true);assert.equal(d.querySelector('#adminSettings').hidden,true);
  assert.equal(d.querySelectorAll('[data-edit]').length,1);assert.equal(d.querySelectorAll('[data-select]').length,1);
  d.querySelector('[data-edit]').click();assert.equal(d.querySelector('#list #requestForm'),null);assert.equal(d.activeElement.id,'reviewer');
  d.querySelector('#reviewer').value='다른 이름';d.querySelector('[data-edit]').click();assert.equal(d.querySelector('#list #requestForm'),null);assert.match(d.querySelector('#adminError').textContent,/최초 작성자/);
  let confirmations=0;w.confirm=()=>{confirmations++;return true;};await d.querySelector('#list').onclick({target:d.querySelector('[data-delete]')});assert.equal(confirmations,0);assert.equal(calls.length,0);
  d.querySelector('#reviewer').value='최초 작성자';d.querySelector('[data-edit]').click();assert.ok(d.querySelector('#list #requestForm'));enter('purpose','본인 수정');
  d.querySelector('#reviewer').value='바뀐 이름';await submit();assert.equal(calls.length,0);assert.equal(d.activeElement.id,'reviewer');assert.match(d.querySelector('#formError').textContent,/일치/);
  d.querySelector('#reviewer').value='  최초 작성자  ';await submit();assert.equal(calls[0].path,'owner-update');assert.equal(calls[0].data.reviewer,'최초 작성자');assert.equal(records()[0].author_name,'최초 작성자');
  d.querySelector('[data-select]').click();d.querySelector('#reviewer').value='다른 이름';await d.querySelector('#delete').onclick();assert.equal(calls.length,1);assert.equal(confirmations,0);
  d.querySelector('#reviewer').value='최초 작성자';w.confirm=()=>false;await d.querySelector('#delete').onclick();assert.equal(calls.length,1);w.confirm=()=>true;await d.querySelector('#delete').onclick();assert.equal(calls[1].path,'owner-delete');assert.equal(d.querySelector('[data-record="one"]'),null);
 }finally{dom.window.close();}
});
test('delivered and approved own applications remain visible but cannot be selected or edited',async()=>{
 const {dom,d,records}=await setup({own:true});try{
  records()[0].delivery_at='2026-10-16T00:00:00Z';await d.querySelector('#refresh').onclick();assert.equal(d.querySelectorAll('[data-edit]').length,0);assert.equal(d.querySelectorAll('[data-select]').length,0);assert.match(d.querySelector('#list').textContent,/관리자에게 문의/);
 }finally{dom.window.close();}
});

test('row deletion requires actor and confirmation; lookup is labelled and preserves author search',async()=>{
 const {dom,w,d,calls,records}=await setup({own:true});try{
  assert.equal(d.querySelector('#refresh').textContent,'조회');assert.equal(d.querySelectorAll('[data-delete]').length,1);
  const clickDelete=()=>d.querySelector('#list').onclick({target:d.querySelector('[data-delete="one"]')});
  await clickDelete();assert.equal(d.activeElement.id,'reviewer');assert.equal(calls.length,0);
  d.querySelector('#search').value='최초 작성자';await d.querySelector('#refresh').onclick();assert.equal(d.querySelectorAll('[data-record]').length,1);assert.equal(d.querySelector('#search').value,'최초 작성자');
  d.querySelector('#reviewer').value='최초 작성자';w.confirm=()=>false;await clickDelete();assert.equal(calls.length,0);w.confirm=()=>true;await clickDelete();assert.equal(calls[0].path,'owner-delete');assert.equal(calls[0].data.items.length,1);assert.equal(records().some(r=>r.id==='one'),false);assert.equal(records().length,2);
 }finally{dom.window.close();}
});
test('unowned requests show disabled edit/delete actions without ownership escalation',async()=>{
 const {dom,d}=await setup();try{assert.equal(d.querySelector('#manageHead').hidden,false);assert.equal(d.querySelectorAll('.row-actions button:disabled').length,6);assert.equal(d.querySelectorAll('[data-edit],[data-delete]').length,0);assert.equal(d.querySelector('#ownerHelp').hidden,false);assert.match(d.querySelector('#ownerHelp').textContent,/이전 신청/);}finally{dom.window.close();}
});
