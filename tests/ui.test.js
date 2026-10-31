import {defaultTeams,teamLabel,validateTeams} from '../functions/lib/directory.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {composeMailto} from '../src/mail-recipients.js';
import {buildMailDocument,buildDraftEmail} from '../src/mail-document.js';
import {publicRoster} from '../src/public-roster.js';
import ExcelJS from 'exceljs';
import {createApplicantWorkbook,createDetailedWorkbook} from '../src/xlsx-export.js';
const tick=()=>new Promise(resolve=>setTimeout(resolve,5));
const base={visit_date:'2026-10-15',purpose:'회의',team:'공무팀',gate:'서문',name:'가상방문자',birth:'1990-01-23',phone:'010-0000-0000',plate:'=formula',vehicle_type:'승용',vehicle_name:'캐스퍼',role:'운전자',shoes:'280',lunch:'미신청',reviewer:'',version:1,created:'2026-10-15T00:00:00Z'};
async function setup({draft=null,blocked=false,own=false}={}){
 const dom=new JSDOM(readFileSync('public/index.html','utf8'),{url:'https://permit.example',runScripts:'outside-only'}),w=dom.window,d=w.document;
 w.structuredClone=structuredClone;w.defaultTeams=defaultTeams;w.teamLabel=teamLabel;w.validateTeams=validateTeams;w.eval(readFileSync('src/directory-ui.js','utf8').replace(/import .*?;\n/,'').replace('export function createDirectoryUI','function createDirectoryUI').replace('export {defaultTeams,teamLabel};',''));
 const NativeDate=w.Date;w.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:['2026-10-15T03:00:00Z']));}};
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};w.confirm=()=>true;w.setInterval=()=>0;
 const realTimer=w.setTimeout.bind(w);w.setTimeout=(fn,ms)=>ms===350?realTimer(fn,0):0;w.Blob=Blob;
 if(draft)w.sessionStorage.setItem('permit-draft',JSON.stringify(draft));if(blocked)Object.defineProperty(w,'sessionStorage',{get(){throw Error('blocked');}});
 let signed=false,recipient='test@example.com',blob,directoryVersion=0,directoryRecords=structuredClone(defaultTeams),notifyResult={results:[{team:'관리팀',channel:'sms',status:'sent'},{team:'관리팀',channel:'email',status:'sent'}]};const calls=[],notifications=[];
 let records=[{...base,id:'one',status:'현장 제출',own,author_name:'최초 작성자'},{...base,id:'two',name:'예시방문자',status:'발주처 제출'},{...base,id:'three',name:'테스트방문자',status:'승인 완료'}];
 w.URL.createObjectURL=value=>{blob=value;return 'blob:test';};w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=function(){};
 w.composeMailto=composeMailto;w.buildMailDocument=buildMailDocument;w.buildDraftEmail=buildDraftEmail;
 w.loadApplicantExcel=()=>Promise.resolve({createApplicantWorkbook,createDetailedWorkbook});
 w.createPermitAPI=()=>({api:async(path,data)=>{
  if(path==='directory'){if(data&&!signed)throw Error('관리자만 수정');if(data){directoryRecords=structuredClone(data.teams);directoryVersion++;calls.push({path,data});}return {teams:structuredClone(directoryRecords),version:directoryVersion};}
  if(path==='notify'){notifications.push(data);return structuredClone(notifyResult);}
  if(path==='session')return {reviewer:signed};
  if(path==='login'){if(data.password!=='test-password')throw Error('비밀번호가 맞지 않습니다.');signed=true;return {};}
  if(path==='logout'){signed=false;return {};}
  if(path==='requests'&&!data)return records.map(row=>signed||row.own?{...row}:{id:row.id,...publicRoster(row)});
  if(path==='requests'){calls.push({path,data:structuredClone(data)});records.push(...data.items.map((row,index)=>({...row,own:true,author_name:data.author_name,id:'new'+index,status:'승인 대기',reviewer:'',version:1,created:'2026-10-15T01:00:00Z'})));return {count:data.items.length,ids:data.items.map((_,i)=>'new'+i)};}
  if(path==='owner-update'){
   const row=records.find(r=>r.id===data.id);if(!row?.own||!['승인 대기','현장 제출'].includes(row.status)||row.delivery_at)throw Error('본인 승인 대기만 수정할 수 있습니다.');calls.push({path,data:structuredClone(data)});Object.assign(row,data,{modified_by:data.reviewer,modified_at:'2026-10-16T00:00:00Z',version:row.version+1});return {};
  }
  if(path==='owner-delete'){
   if(data.items.some(i=>!records.find(r=>r.id===i.id)?.own))throw Error('본인 신청만 삭제');calls.push({path,data:structuredClone(data)});records=records.filter(r=>!data.items.some(i=>i.id===r.id));return {};
  }
  if(path==='approval'){
   const row=records.find(r=>r.id===data.id);if(!row||(!signed&&!row.own)||(data.stage==='final_approved'&&!signed))throw Error('권한이 없습니다.');if(row[data.stage])throw Error('이미 처리된 단계');
   calls.push({path,data:structuredClone(data)});row[data.stage]={by:signed?data.reviewer:row.author_name,at:'2026-10-15T03:04:05Z'};row.version++;if(data.stage==='final_approved')row.status='승인 완료';return {};
  }
  if(!signed)throw Error('관리자 로그인이 필요합니다.');
  if(path==='settings'){if(data)recipient=data.recipient;return {recipient};}
  if(path==='update'){calls.push({path,data:structuredClone(data)});const index=records.findIndex(row=>row.id===data.id);if(index<0||records[index].version!==data.version)throw Error('다른 담당자가 변경했습니다.');records[index]={...records[index],...data,version:data.version+1};return {};}
  if(path==='bulk'){calls.push({path,data:structuredClone(data)});for(const item of data.items){const row=records.find(row=>row.id===item.id);if(!row||row.version!==item.version)throw Error('선택 내역이 변경되었습니다.');}
   for(const item of data.items){const row=records.find(row=>row.id===item.id);if(data.action==='delete')records=records.filter(row=>row.id!==item.id);else{row.version++;row.reviewer=data.reviewer;if(data.action==='approve'){row.status='승인 완료';row.final_approved={by:data.reviewer,at:'2026-10-15T03:04:05Z'};}if(data.action==='delivered')row.delivery_at='2026-10-15T02:00:00Z';}}return {};}
 }});
 w.eval(readFileSync('src/app.js','utf8').replace("import {createDirectoryUI,defaultTeams,teamLabel} from './directory-ui.js';",'').replace("import {createPermitAPI} from './firebase-api.js';",'').replace("import {composeMailto} from './mail-recipients.js';",'').replace("import {buildMailDocument,buildDraftEmail} from './mail-document.js';",'').replace("import('/xlsx-export.js')",'loadApplicantExcel()'));await tick();d.querySelector('#authorName').value='테스트 작성자';d.querySelector('[name=lunch]').value='미신청';
 const enter=(key,value,index=0)=>{const input=d.querySelectorAll(`[name="${key}"]`)[index];input.value=key==='team'&&!defaultTeams.some(t=>t.name===value)?'관리팀':value;input.dispatchEvent(new w.Event('input',{bubbles:true}));return input;};
 const login=async()=>{await d.querySelector('#login').onclick();d.querySelector('#password').value='test-password';await d.querySelector('#loginForm').onsubmit({preventDefault(){}});await tick();};
 const change=(id,value)=>{d.querySelector('#'+id).value=value;d.querySelector('#'+id).dispatchEvent(new w.Event('change',{bubbles:true}));};
 const submit=()=>d.querySelector('#requestForm').onsubmit({preventDefault(){}});
 return {dom,w,d,calls,enter,login,change,submit,getBlob:()=>blob,records:()=>records,notifications,setNotifyResult:value=>{notifyResult=value;}};
}
test('one screen and two statuses; public names are visible while original birth and privileged controls are hidden',async()=>{
 const {dom,d}=await setup();try{assert.equal(d.querySelector('#requestPanel').hidden,false);assert.equal(d.querySelector('#adminControls').hidden,true);assert.equal(d.querySelector('#adminSettings').hidden,true);assert.equal(d.querySelectorAll('[data-select]').length,0);assert.equal(d.querySelectorAll('[data-edit]').length,0);assert.ok(d.querySelector('#list').textContent.includes('가상방문자'));assert.ok(!d.querySelector('#list').textContent.includes('1990-01-23'));assert.deepEqual([...d.querySelector('#statusFilter').options].map(option=>option.textContent),['전체','승인 대기','승인 완료']);assert.ok(!d.querySelector('#list').textContent.includes('현장 제출'));}finally{dom.window.close();}
});
test('numeric input autoformats, auto-saves and submits without manual draft commands',async()=>{
 const {dom,w,d,enter,calls,submit}=await setup();try{enter('purpose','테스트');enter('team','테스트팀');enter('name','가상방문자');assert.equal(enter('birth','19900123').value,'1990-01-23');assert.equal(enter('phone','01000000000').value,'010-0000-0000');await tick();assert.equal(JSON.parse(w.sessionStorage.getItem('permit-draft'))[0].birth,'1990-01-23');assert.match(d.querySelector('#draftStatus').textContent,/자동 임시저장됨/);await submit();assert.equal(calls[0].data.items[0].phone,'010-0000-0000');assert.equal(w.sessionStorage.getItem('permit-draft'),null);assert.equal(d.querySelector('[name="name"]').value,'');assert.match(d.querySelector('#list').textContent,/미처리/);}finally{dom.window.close();}
});
test('old tab drafts restore automatically with per-person visit details',async()=>{
 const saved=[{...base,purpose:'회의'},{...base,name:'다른방문자',purpose:'점검',team:'안전팀',gate:'정문',visit_date:'2026-10-16'}];const {dom,d}=await setup({draft:saved});try{assert.equal(d.querySelectorAll('.person').length,2);assert.equal(d.querySelectorAll('[name="purpose"]')[1].value,'점검');assert.equal(d.querySelectorAll('[name="gate"]')[1].value,'정문');assert.match(d.querySelector('#draftStatus').textContent,/복원/);}finally{dom.window.close();}
});
test('missing or invalid fields are shown above submit and focused',async()=>{
 const {dom,d,enter,submit,calls}=await setup();try{await submit();assert.equal(d.activeElement.name,'purpose');assert.match(d.querySelector('#formError').textContent,/방문목적/);assert.ok(d.querySelector('#formError').compareDocumentPosition(d.querySelector('.form-actions'))&4);enter('purpose','테스트');enter('team','팀');enter('name','가상방문자');enter('birth','19900230');enter('phone','01000000000');await submit();assert.equal(d.activeElement.name,'birth');enter('birth','19900123');enter('phone','01012');await submit();assert.equal(d.activeElement.name,'phone');assert.equal(calls.length,0);}finally{dom.window.close();}
});
test('per-person fields, vehicle selector and maximum ten visitors',async()=>{
 const {dom,d,enter,submit,calls}=await setup();try{enter('purpose','회의');enter('team','공무팀');enter('name','방문자1');enter('birth','19900123');enter('phone','01000000000');d.querySelector('#add').click();enter('purpose','점검',1);enter('team','안전팀',1);enter('name','방문자2',1);enter('lunch','중식신청',1);enter('birth','19800229',1);enter('phone','01000000001',1);enter('gate','정문',1);enter('visit_date','2026-10-16',1);enter('visit_end_date','2026-10-16',1);assert.deepEqual([...d.querySelector('[name="vehicle_type"]').options].map(o=>o.value),['승용','승합']);await submit();assert.equal(calls[0].data.items[1].purpose,'점검');assert.equal(calls[0].data.items[1].gate,'정문');for(let i=0;i<12;i++)d.querySelector('#add').click();assert.equal(d.querySelectorAll('.person').length,10);}finally{dom.window.close();}
});
test('blocked storage reports failure without discarding typed input',async()=>{
 const {dom,d,enter}=await setup({blocked:true});try{enter('name','보존할 내용');await tick();assert.equal(d.querySelector('[name="name"]').value,'보존할 내용');assert.match(d.querySelector('#draftStatus').textContent,/자동 임시저장 불가/);}finally{dom.window.close();}
});
test('admin selects and approves multiple rows, requires operator name and supports cancel',async()=>{
 const {dom,w,d,login,calls}=await setup();try{await login();assert.equal(d.querySelector('#adminControls').hidden,false);d.querySelector('[data-select="one"]').click();d.querySelector('[data-select="two"]').click();await d.querySelector('#approve').onclick();assert.equal(calls.length,0);assert.equal(d.activeElement.id,'reviewer');d.querySelector('#reviewer').value='담당자';w.confirm=()=>false;await d.querySelector('#approve').onclick();assert.equal(calls.length,0);w.confirm=()=>true;await d.querySelector('#approve').onclick();assert.equal(calls[0].data.action,'approve');assert.equal(calls[0].data.items.length,2);assert.equal(d.querySelectorAll('[data-approval=final_approved]:checked').length,3);assert.equal(d.querySelector('#selectedCount').textContent,'0명 선택 · 최대 10명');}finally{dom.window.close();}
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
test('admin workbook keeps phone zeros and literal values; logout removes original birth and admin controls',async()=>{
 const {dom,d,login,getBlob}=await setup();try{
  await login();await d.querySelector('#downloadExcel').onclick();const book=new ExcelJS.Workbook();await book.xlsx.load(await getBlob().arrayBuffer());const sheet=book.worksheets[0];assert.equal(sheet.getCell('E2').value,'010-0000-0000');assert.equal(sheet.getCell('F2').value,'=formula');assert.equal(sheet.getCell('F2').type,ExcelJS.ValueType.String);
  d.querySelector('[data-select="one"]').click();await d.querySelector('#login').onclick();assert.equal(d.querySelector('#adminControls').hidden,true);assert.ok(!d.querySelector('#list').textContent.includes('1990-01-23'));assert.equal(d.querySelector('#mailBody').value,'');assert.equal(d.querySelectorAll('[data-select]').length,0);
 }finally{dom.window.close();}
});
test('status and search filters clear selections and map legacy statuses without rewriting data',async()=>{
 const {dom,d,login,change,records}=await setup();try{await login();assert.ok(d.querySelector('.roster-table thead #selectAll'));assert.equal(d.querySelector('.bulk-toolbar #selectAll'),null);assert.equal(d.querySelectorAll('[data-select]:checked').length,0);d.querySelector('[data-select="one"]').click();change('statusFilter','승인 대기');assert.equal(d.querySelectorAll('[data-record]').length,2);assert.equal(d.querySelector('#selectedCount').textContent,'0명 선택 · 최대 10명');assert.match(d.querySelector('#list').textContent,/기존 전달 기록/);assert.equal(records()[0].status,'현장 제출');assert.equal(records()[1].status,'발주처 제출');change('statusFilter','승인 완료');assert.equal(d.querySelectorAll('[data-record]').length,1);}finally{dom.window.close();}
});

test('visit periods validate ordering, filter inclusive dates and survive edit, email and detailed Excel',async()=>{
 const {dom,w,d,enter,submit,calls,login,change,getBlob,records}=await setup({draft:[{...base,visit_date:'2026-10-20',visit_end_date:'2026-10-23'}]});
 try{
  assert.equal(d.querySelector('[name="visit_date"]').type,'date');assert.equal(d.querySelector('[name="visit_end_date"]').type,'date');
  enter('visit_end_date','2026-10-19');await submit();assert.equal(calls.length,0);assert.equal(d.activeElement.name,'visit_end_date');assert.match(d.querySelector('#formError').textContent,/같거나 이후/);
  enter('visit_end_date','2026-10-23');await submit();assert.equal(calls[0].data.items[0].visit_end_date,'2026-10-23');
  change('dateFilter','2026-10-22');assert.equal(d.querySelectorAll('[data-record]').length,1);assert.match(d.querySelector('#list').textContent,/2026-10-20 ~ 2026-10-23/);
  change('dateFilter','2026-10-24');assert.equal(d.querySelectorAll('[data-record]').length,0);
  change('dateFilter','2026-10-23');await login();d.querySelector('#reviewer').value='담당자';d.querySelector('[data-select]').click();await d.querySelector('#mail').onclick();assert.match(d.querySelector('#mailPreview').textContent,/2026-10-20 ~ 2026-10-23/);
  await d.querySelector('#downloadDetailedExcel').onclick();const book=new ExcelJS.Workbook();await book.xlsx.load(await getBlob().arrayBuffer());assert.equal(book.worksheets[0].getCell('C2').value,'2026-10-23');
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
test('applicant edit and confirmed deletion reuse stored author without processor input',async()=>{
 const {dom,w,d,submit,calls,enter,records}=await setup({own:true});try{
  assert.equal(d.querySelector('#mail').hidden,true);assert.equal(d.querySelector('#adminActor').hidden,true);
  d.querySelector('[data-edit]').click();assert.ok(d.querySelector('#list #requestForm'));enter('purpose','본인 수정');await submit();assert.equal(calls[0].data.reviewer,'최초 작성자');assert.equal(records()[0].author_name,'최초 작성자');
  d.querySelector('[data-select]').click();w.confirm=()=>false;await d.querySelector('#delete').onclick();assert.equal(calls.length,1);w.confirm=()=>true;await d.querySelector('#delete').onclick();assert.equal(calls[1].path,'owner-delete');assert.equal(d.querySelector('[data-record="one"]'),null);
 }finally{dom.window.close();}
});
test('delivered and approved own applications remain visible but cannot be selected or edited',async()=>{
 const {dom,d,records}=await setup({own:true});try{
  records()[0].delivery_at='2026-10-16T00:00:00Z';await d.querySelector('#refresh').onclick();assert.equal(d.querySelectorAll('[data-edit]').length,0);assert.equal(d.querySelectorAll('[data-select]').length,0);assert.match(d.querySelector('#list').textContent,/관리자에게 문의/);
 }finally{dom.window.close();}
});

test('row deletion requires confirmation while author search remains available',async()=>{
 const {dom,w,d,calls,records}=await setup({own:true});try{
  d.querySelector('#search').value='최초 작성자';await d.querySelector('#refresh').onclick();assert.equal(d.querySelectorAll('[data-record]').length,1);
  const click=()=>d.querySelector('#list').onclick({target:d.querySelector('[data-delete="one"]')});w.confirm=()=>false;await click();assert.equal(calls.length,0);w.confirm=()=>true;await click();assert.equal(calls[0].path,'owner-delete');assert.equal(records().length,2);
 }finally{dom.window.close();}
});
test('unowned requests cannot expose edit/delete actions or personal information',async()=>{
 const {dom,d}=await setup();try{assert.equal(d.querySelectorAll('.roster-table thead th:not([colspan])').length,14);assert.equal(d.querySelectorAll('[data-edit],[data-delete]').length,0);assert.equal(d.querySelector('#ownerHelp').hidden,false);assert.match(d.querySelector('#ownerHelp').textContent,/이전 신청/);}finally{dom.window.close();}
});

test('site map toggles independently of applicant draft, list refresh and administrator mode',async()=>{
 const {dom,d,enter,login}=await setup();try{
  const button=d.querySelector('#siteMapToggle'),panel=d.querySelector('#siteMapPanel'),image=d.querySelector('#siteMapImage');
  assert.equal(d.querySelector('.gate-maps').firstElementChild,d.querySelector('#contactsToggle'));assert.equal(button.previousElementSibling.id,'contactsToggle');
  assert.equal(d.querySelectorAll('.gate-maps a[target="_blank"]').length,2);
  assert.equal(panel.hidden,true);assert.equal(image.getAttribute('src'),null);
  enter('name','작성 중 방문자');button.click();
  assert.equal(panel.hidden,false);assert.equal(button.getAttribute('aria-expanded'),'true');
  assert.equal(image.getAttribute('src'),'/site-location-map.png');
  await d.querySelector('#refresh').onclick();
  assert.equal(panel.hidden,false);assert.equal(d.querySelector('[name="name"]').value,'작성 중 방문자');
  button.click();assert.equal(panel.hidden,true);assert.equal(button.getAttribute('aria-expanded'),'false');
  await login();button.click();assert.equal(panel.hidden,false);
  image.dispatchEvent(new dom.window.Event('error'));assert.equal(d.querySelector('#siteMapError').hidden,false);
  button.click();button.click();assert.equal(d.querySelector('#siteMapError').hidden,true);
  image.dispatchEvent(new dom.window.Event('load'));assert.equal(image.hidden,false);
  d.querySelector('#siteMapClose').click();assert.equal(panel.hidden,true);assert.equal(button.getAttribute('aria-expanded'),'false');assert.equal(d.activeElement,button);
  button.click();assert.equal(panel.hidden,false);assert.equal(d.querySelector('[name="name"]').value,'작성 중 방문자');
  d.querySelector('#siteMapClose').focus();d.querySelector('#siteMapClose').click();assert.equal(panel.hidden,true);
 }finally{dom.window.close();}
});

 test('download controls and handlers are administrator-only',async()=>{
 const {dom,d,getBlob,login}=await setup({own:true});try{
  assert.equal(d.querySelector('#applicantDownload').hidden,true);assert.equal(d.querySelector('#adminSettings').hidden,true);
  await d.querySelector('#downloadOwn').onclick();await d.querySelector('#downloadOwnExcel').onclick();await d.querySelector('#downloadExcel').onclick();assert.equal(d.querySelector('#download'),null);assert.equal(getBlob(),undefined);
  await login();assert.equal(d.querySelector('#adminSettings').hidden,false);await d.querySelector('#downloadExcel').onclick();const book=new ExcelJS.Workbook();await book.xlsx.load(await getBlob().arrayBuffer());assert.ok(book.worksheets[0].getColumn(3).values.includes('예시방문자'));
 }finally{dom.window.close();}
});
test('anonymous user without owned rows cannot export public rows as applicant CSV',async()=>{
 const {dom,d,getBlob}=await setup();try{
  assert.equal(d.querySelector('#applicantDownload').hidden,true);
  await d.querySelector('#downloadOwn').onclick();assert.equal(getBlob(),undefined);
  assert.equal(d.querySelector('#download'),null);assert.equal(getBlob(),undefined);
 }finally{dom.window.close();}
});

test('applicant edits without entering processor name and retains original author',async()=>{
 const {dom,d,enter,submit,calls}=await setup({own:true});try{
  assert.equal(d.querySelector('#adminActor').hidden,true);d.querySelector('[data-edit="one"]').click();assert.equal(d.querySelector('#cancelEdit').hidden,false);enter('name','김진동');await submit();assert.equal(calls[0].data.reviewer,'최초 작성자');assert.equal(calls[0].path,'owner-update');
 }finally{dom.window.close();}
});
test('administrator saves multiple recipient settings and displays the same recipient list for submission',async()=>{
 const {dom,d,login}=await setup();try{
  await login();d.querySelector('#recipient').value='first@example.com,second@example.com';await d.querySelector('#settingsForm').onsubmit({preventDefault(){}});
  d.querySelector('#reviewer').value='담당자';d.querySelector('[data-select="one"]').click();await d.querySelector('#mail').onclick();assert.match(d.querySelector('#mailRecipient').textContent,/first@example.com,second@example.com/);
 }finally{dom.window.close();}
});

test('applicant can edit after administrator corrects visitor name without changing author',async()=>{
 const {dom,d,login,enter,submit,records}=await setup({own:true});try{
  await login();d.querySelector('#reviewer').value='관리자';d.querySelector('[data-edit="one"]').click();enter('name','김진동');await submit();
  assert.equal(records().find(r=>r.id==='one').author_name,'최초 작성자');
  await d.querySelector('#login').onclick();d.querySelector('#reviewer').value='최초 작성자';d.querySelector('[data-edit="one"]').click();
  assert.equal(d.querySelector('[name="name"]').value,'김진동');enter('purpose','신청자가 다시 수정한 방문목적');await submit();
  assert.equal(records().find(r=>r.id==='one').purpose,'신청자가 다시 수정한 방문목적');
 }finally{dom.window.close();}
});

test('weekly unified roster keeps fourteen columns, masks others and preserves full administrator view',async()=>{
 const {dom,d,login,records}=await setup({own:true});try{
  assert.equal(d.querySelectorAll('.roster-table thead th:not([colspan])').length,14);assert.equal(d.querySelectorAll('[data-record]').length,3);assert.match(d.querySelector('#weekLabel').textContent,/2026-10-12 ~ 2026-10-18/);
  const other=d.querySelector('[data-record="two"]');assert.match(other.textContent,/19\*\*-\*\*-\*\*/);assert.ok(other.textContent.includes('010-0000-0000'));assert.ok(!other.textContent.includes('1990-01-23'));assert.match(d.querySelector('[data-record="one"]').textContent,/010-0000-0000/);
  records().push({...base,id:'spanning',visit_date:'2026-10-18',visit_end_date:'2026-10-20',status:'승인 대기'});await d.querySelector('#refresh').onclick();assert.ok(d.querySelector('[data-record="spanning"]'));
  d.querySelector('#weekNext').click();assert.ok(d.querySelector('[data-record="spanning"]'));assert.equal(d.querySelector('[data-record="one"]'),null);
  d.querySelector('#weekCurrent').click();await login();assert.ok(d.querySelector('[data-record="two"]').textContent.includes('1990-01-23'));assert.equal(d.querySelectorAll('.roster-table thead th:not([colspan])').length,14);
 }finally{dom.window.close();}
});

test('detailed Excel export is administrator-only and includes only filtered detailed records',async()=>{
 const {dom,d,login,change,getBlob}=await setup({own:true});try{
  await d.querySelector('#downloadDetailedExcel').onclick();assert.equal(getBlob(),undefined);
  await login();change('statusFilter','승인 완료');await d.querySelector('#downloadDetailedExcel').onclick();
  const book=new ExcelJS.Workbook();await book.xlsx.load(await getBlob().arrayBuffer());const sheet=book.worksheets[0];
  assert.equal(sheet.columnCount,22);assert.equal(sheet.getCell('G2').value,'테스트방문자');assert.ok(!sheet.getColumn(7).values.includes('예시방문자'));
  assert.equal(d.querySelector('#download'),null);assert.equal(d.querySelector('#downloadDetailedExcel').disabled,false);
 }finally{dom.window.close();}
});

test('header sorting toggles dates and Korean names without changing selected records or export order',async()=>{
 const {dom,d,login,records,getBlob}=await setup();try{
  await login();records()[0].visit_date='2026-10-13';records()[1].visit_date='2026-10-14';records()[2].visit_date='2026-10-15';await d.querySelector('#refresh').onclick();
  const ids=()=>[...d.querySelectorAll('[data-record]')].map(r=>r.dataset.record);
  assert.deepEqual(ids(),['three','two','one']);d.querySelector('[data-select="one"]').click();
  d.querySelector('.roster-table thead [data-sort="visit_date"]').click();assert.deepEqual(ids(),['one','two','three']);assert.equal(d.querySelector('[data-select="one"]').checked,true);assert.equal(d.querySelector('[data-sort-heading="visit_date"]').getAttribute('aria-sort'),'ascending');
  d.querySelector('.roster-table thead [data-sort="name"]').click();assert.deepEqual(ids(),['one','two','three']);
  d.querySelector('.roster-table thead [data-sort="name"]').click();assert.deepEqual(ids(),['three','two','one']);assert.equal(d.querySelector('[data-select="one"]').checked,true);
  await d.querySelector('#downloadExcel').onclick();const book=new ExcelJS.Workbook();await book.xlsx.load(await getBlob().arrayBuffer());assert.equal(book.worksheets[0].getCell('C2').value,'테스트방문자');
  d.querySelector('.mobile-sort [data-sort="name"]').click();assert.deepEqual(ids(),['one','two','three']);assert.ok(d.querySelector('.roster-table thead #selectAll'));assert.equal(d.querySelector('.bulk-toolbar #selectAll'),null);
 }finally{dom.window.close();}
});

test('header checkbox selects visible eligible records, supports mixed state, and clears without a toolbar checkbox',async()=>{
 const {dom,d,login}=await setup();try{
  assert.equal(d.querySelector('#selectAll').hidden,true);await login();const header=d.querySelector('.roster-table thead #selectAll');assert.equal(header.hidden,false);assert.equal(d.querySelector('.bulk-toolbar input[type=checkbox]'),null);
  header.click();assert.equal(d.querySelectorAll('[data-select]:checked').length,3);assert.equal(header.checked,true);header.click();assert.equal(d.querySelectorAll('[data-select]:checked').length,0);
  d.querySelector('[data-select=one]').click();assert.equal(header.indeterminate,true);header.click();assert.equal(d.querySelectorAll('[data-select]:checked').length,0);
 }finally{dom.window.close();}
});

test('roster displays purpose and approval status instead of shoes; approval remains admin-only',async()=>{
 const {dom,d,login,calls}=await setup({own:true});try{
  const headers=[...d.querySelectorAll('.roster-table thead th')].map(x=>x.textContent.trim());assert.ok(headers.includes('방문목적'));assert.ok(headers.includes('가이수'));for(const key of ['gaisu_requested','gaisu_approved','final_approved'])assert.ok(d.querySelector('.roster-table thead [data-sort='+key+']'));assert.ok(!headers.includes('안전화'));
  assert.equal(d.querySelector('[data-record="one"] [data-label="방문목적"]').textContent,'회의');assert.equal(d.querySelector('[data-record="one"] [data-approval=final_approved]').checked,false);
  assert.equal(d.querySelector('#approve').hidden,true);await d.querySelector('#approve').onclick();assert.equal(calls.length,0);
  await login();d.querySelector('#reviewer').value='승인 담당자';d.querySelector('[data-select="one"]').click();await d.querySelector('#approve').onclick();assert.equal(calls[0].data.action,'approve');assert.equal(d.querySelector('[data-record="one"] [data-approval=final_approved]').checked,true);assert.match(d.querySelector('[data-record="one"] [data-label="최종 승인"]').textContent,/승인 담당자/);
 }finally{dom.window.close();}
});

test('mail preview copies HTML plus plain fallback and downloads an unsent table email without marking delivery',async()=>{
 const {dom,w,d,login,calls,getBlob}=await setup();try{
  await d.querySelector('#downloadMail').onclick();assert.equal(getBlob(),undefined);
  await login();d.querySelector('#reviewer').value='가상 담당자';d.querySelector('[data-select=one]').click();await d.querySelector('#mail').onclick();
  assert.equal(d.querySelectorAll('#mailPreview th').length,9);assert.match(d.querySelector('#mailPreview').textContent,/현장 출입신청 요청/);
  let copied;w.ClipboardItem=class{constructor(data){this.data=data;}};Object.defineProperty(w.navigator,'clipboard',{configurable:true,value:{write:async items=>{copied=items[0].data;}}});
  await d.querySelector('#copyMail').onclick();assert.match(await copied['text/html'].text(),/<table/);assert.match(await copied['text/plain'].text(),/가상방문자/);assert.match(d.querySelector('#mailError').textContent,/표 포함 본문/);
  await d.querySelector('#downloadMail').onclick();assert.match(await getBlob().text(),/X-Unsent: 1/);assert.equal(calls.length,0);
  Object.defineProperty(w.navigator,'clipboard',{configurable:true,value:{writeText:async text=>{copied=text;}}});w.ClipboardItem=undefined;await d.querySelector('#copyMail').onclick();assert.match(copied,/가상방문자/);assert.match(d.querySelector('#mailError').textContent,/텍스트로 복사/);
  await d.querySelector('#login').onclick();assert.equal(d.querySelector('#mailPreview').innerHTML,'');assert.equal(d.querySelector('#mailBody').value,'');
 }finally{dom.window.close();}
});

test('gate column sorts ascending and descending on desktop and mobile without losing selection',async()=>{
 const {dom,d,login,records}=await setup();try{
  await login();records()[0].gate='정문';records()[1].gate='서문';records()[2].gate='정문';await d.querySelector('#refresh').onclick();
  d.querySelector('[data-select=one]').click();d.querySelector('.roster-table thead [data-sort=gate]').click();const gates=()=>[...d.querySelectorAll('[data-record] [data-label=출입위치]')].map(x=>x.textContent);
  assert.deepEqual(gates(),['서문','정문','정문']);assert.equal(d.querySelector('[data-sort-heading=gate]').getAttribute('aria-sort'),'ascending');
  d.querySelector('.mobile-sort [data-sort=gate]').click();assert.deepEqual(gates(),['정문','정문','서문']);assert.equal(d.querySelector('[data-select=one]').checked,true);assert.equal(d.querySelector('[data-sort-heading=gate]').getAttribute('aria-sort'),'descending');
  const headings=[...d.querySelectorAll('.roster-table thead th')].map(x=>x.textContent);assert.ok(headings[8].includes('방문목적'));assert.ok(headings[9].includes('출입위치'));assert.equal(headings[10],'가이수');
 }finally{dom.window.close();}
});

test('mail app launches a short empty-body link before clipboard completes and auto-copies the HTML table',async()=>{
 const {dom,w,d,login,calls}=await setup();try{
  await login();d.querySelector('#reviewer').value='담당자';d.querySelector('[data-select=one]').click();await d.querySelector('#mail').onclick();
  let finish,copied,launched;w.ClipboardItem=class{constructor(data){this.data=data;}};Object.defineProperty(w.navigator,'clipboard',{configurable:true,value:{write:items=>{copied=items[0].data;return new Promise(resolve=>{finish=resolve;});}}});
  w.HTMLAnchorElement.prototype.click=function(){launched=this.href;assert.ok(this.isConnected);};
  const pending=d.querySelector('#openMail').onclick();assert.ok(launched.startsWith('mailto:'));assert.ok(launched.length<500);assert.equal(new URL(launched).searchParams.has('body'),false);assert.match(await copied['text/html'].text(),/<table/);assert.equal(calls.length,0);
  finish();await pending;assert.match(d.querySelector('#mailError').textContent,/自動|자동 복사/);
 }finally{dom.window.close();}
});

test('lunch selection is required, saved per visitor and sortable with a legacy marker',async()=>{
 const {dom,d,enter,submit,calls}=await setup({own:true});try{
  d.querySelector('[name=lunch]').value='';enter('purpose','점검');enter('team','팀');enter('name','새 신청');enter('birth','19900123');enter('phone','01000000000');await submit();assert.equal(calls.length,0);assert.equal(d.activeElement.name,'lunch');
  enter('lunch','중식신청');await submit();assert.equal(calls[0].data.items[0].lunch,'중식신청');assert.match(d.querySelector('#list').textContent,/중식신청/);
  d.querySelector('.roster-table thead [data-sort=lunch]').click();assert.equal(d.querySelector('[data-sort-heading=lunch]').getAttribute('aria-sort'),'ascending');d.querySelector('.mobile-sort [data-sort=lunch]').click();assert.equal(d.querySelector('[data-sort-heading=lunch]').getAttribute('aria-sort'),'descending');
 }finally{dom.window.close();}
});
test('applicant checks own first two approval stages and sees immutable actor and Korean timestamp; final is admin-only',async()=>{
 const {dom,w,d,login,calls,records}=await setup({own:true});try{
  const control=stage=>d.querySelector('[data-record=one] [data-approval='+stage+']');
  assert.equal(control('gaisu_requested').disabled,false);assert.equal(control('gaisu_approved').disabled,false);assert.equal(control('final_approved').disabled,true);assert.equal(d.querySelector('[data-record=two] [data-approval=gaisu_requested]').disabled,true);
  w.confirm=()=>false;control('gaisu_requested').click();await tick();assert.equal(calls.length,0);
  w.confirm=()=>true;control('gaisu_requested').click();await tick();await tick();assert.equal(calls[0].path,'approval');assert.equal(calls[0].data.stage,'gaisu_requested');assert.equal(control('gaisu_requested').checked,true);assert.equal(control('gaisu_requested').disabled,true);assert.match(d.querySelector('[data-record=one] [data-label="가이수 신청"]').textContent,/최초 작성자/);assert.match(d.querySelector('[data-record=one] time').textContent,/12:04:05/);
  control('gaisu_approved').click();await tick();await tick();assert.ok(records()[0].gaisu_approved);await login();d.querySelector('#reviewer').value='최종 담당자';control('final_approved').click();await tick();await tick();assert.equal(records()[0].status,'승인 완료');assert.equal(records()[0].final_approved.by,'최종 담당자');assert.equal(control('final_approved').checked,true);
 }finally{dom.window.close();}
});


test('grouped approval header sorts each stage by completion and audit time in applicant and admin views',async()=>{
 const {dom,d,login,records}=await setup();try{
  const group=d.querySelector('.roster-table thead .approval-group');assert.equal(group.textContent,'가이수');assert.equal(group.colSpan,3);assert.equal(group.scope,'colgroup');
  assert.equal(d.querySelectorAll('.roster-table thead tr').length,2);assert.equal(d.querySelectorAll('.roster-table thead tr:first-child th[rowspan="2"]').length,11);
  const ids=()=>[...d.querySelectorAll('[data-record]')].map(r=>r.dataset.record);
  for(const admin of [false,true]){
   if(admin)await login();
   for(const stage of ['gaisu_requested','gaisu_approved','final_approved']){
    for(const row of records()){row.status='승인 대기';delete row[stage];}
    records()[0][stage]={by:'처리자',at:'2026-10-15T03:00:00Z'};records()[1][stage]={by:'처리자',at:'2026-10-14T03:00:00Z'};
    await d.querySelector('#refresh').onclick();if(admin)d.querySelector('[data-select=one]').click();
    d.querySelector('.roster-table thead [data-sort='+stage+']').click();assert.deepEqual(ids(),['three','two','one']);assert.equal(d.querySelector('[data-sort-heading='+stage+']').getAttribute('aria-sort'),'ascending');
    d.querySelector('.mobile-sort [data-sort='+stage+']').click();assert.deepEqual(ids(),['one','two','three']);assert.equal(d.querySelector('[data-sort-heading='+stage+']').getAttribute('aria-sort'),'descending');
    if(admin)assert.equal(d.querySelector('[data-select=one]').checked,true);
   }
  }
  // A legacy approval without a timestamp still sorts as complete.
  for(const row of records())delete row.final_approved;records()[2].status='승인 완료';await d.querySelector('#refresh').onclick();
  assert.equal(ids()[0],'three');
 }finally{dom.window.close();}
});


test('contact menu precedes map, shows two contacts and only admins can save synced team options',async()=>{
 const {dom,d,login,calls}=await setup();try{
  const team=d.querySelector('[name=team]');assert.equal(team.tagName,'SELECT');assert.equal(team.options[1].textContent,'관리팀 이재훈, 김성석');assert.ok(!team.textContent.includes('@'));assert.ok(!team.textContent.includes('010-'));
  await d.querySelector('#contactsToggle').onclick();assert.equal(d.querySelector('#contactsDialog').open,true);assert.equal(d.querySelectorAll('#contactsBody tr').length,11);assert.equal(d.querySelector('#editContacts').hidden,true);assert.match(d.querySelector('#contactsBody').textContent,/이재훈/);assert.match(d.querySelector('#contactsBody').textContent,/sskim07@gsenc.com/);
  await login();assert.equal(d.querySelector('#editContacts').hidden,false);d.querySelector('#editContacts').click();const inputs=d.querySelectorAll('#contactsBody tr:first-child input');inputs[1].value='새 담당자';await d.querySelector('#contactsForm').onsubmit({preventDefault(){}});assert.equal(calls.at(-1).path,'directory');assert.match(d.querySelector('[name=team]').options[1].textContent,/새 담당자, 김성석/);assert.match(d.querySelector('#contactsMessage').textContent,/저장/);
 }finally{dom.window.close();}
});
test('submission routes the saved IDs and separates registration from partial notification failure and retry',async()=>{
 const {dom,d,enter,submit,notifications,setNotifyResult}=await setup();try{
  setNotifyResult({results:[{team:'관리팀',channel:'sms',status:'sent'},{team:'관리팀',channel:'email',status:'failed',message:'메일 연결 필요',retryable:true}]});
  enter('purpose','회의');enter('team','관리팀');enter('name','가상방문자');enter('birth','19900101');enter('phone','01000000000');await submit();
  assert.equal(notifications.length,1);assert.equal(notifications[0].ids[0],'new0');assert.equal(d.querySelector('[name=name]').value,'');assert.match(d.querySelector('#notificationResult').textContent,/신청은 저장/);assert.match(d.querySelector('#notificationResult').textContent,/이메일: 메일 연결 필요/);assert.equal(d.querySelector('#retryNotifications').hidden,false);
  setNotifyResult({results:[{team:'관리팀',channel:'sms',status:'sent'},{team:'관리팀',channel:'email',status:'sent'}]});await d.querySelector('#retryNotifications').onclick();assert.equal(notifications.length,2);assert.match(d.querySelector('#notificationResult').textContent,/발송 요청이 접수/);assert.equal(d.querySelector('#retryNotifications').hidden,true);
 }finally{dom.window.close();}
});
