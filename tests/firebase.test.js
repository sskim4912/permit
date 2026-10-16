import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment, assertFails, assertSucceeds} from '@firebase/rules-unit-testing';
import {doc, getDoc, setDoc, deleteDoc, writeBatch, serverTimestamp} from 'firebase/firestore';
import {deleteApp} from 'firebase/app';
import {createPermitAPI, ADMIN_UID} from '../src/firebase-api.js';
import {initializeApp as initializeAdminApp, deleteApp as deleteAdminApp} from 'firebase-admin/app';
import {getAuth as getAdminAuth} from 'firebase-admin/auth';
let env,service,adminApp;
const project='demo-permit';
const item={visit_date:'2026-10-15',purpose:'회의',team:'안전팀',gate:'서문',name:'테스트 방문자',birth:'1990-01-01',phone:'010-0000-0000',plate:'',vehicle_type:'',vehicle_name:'',role:'도보',shoes:'필요없음'};
const pub=d=>Object.fromEntries(['visit_date','visit_end_date','purpose','team','status','reviewer','version','created'].filter(k=>k in d).map(k=>[k,d[k]]));
before(async()=>{
 env=await initializeTestEnvironment({projectId:project,firestore:{host:'127.0.0.1',port:8080,rules:readFileSync('firestore.rules','utf8')}});
 process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';
 adminApp=initializeAdminApp({projectId:project},'emulator-admin');
 await getAdminAuth(adminApp).createUser({uid:ADMIN_UID,email:'sskim07@gsenc.com',password:'test-only-password',emailVerified:true});
 service=createPermitAPI({config:{apiKey:'demo-key',projectId:project},emulator:true,name:'integration'});
});
after(async()=>{await env?.cleanup();if(service)await deleteApp(service.app);if(adminApp)await deleteAdminApp(adminApp);});
test('anonymous batch submission, privacy, administrator login, settings and edit lifecycle',async()=>{
 const api=service.api;
 assert.equal((await api('session')).reviewer,false);
 await assert.rejects(()=>api('requests',{items:[item,{...item,birth:'2026-02-30'}]}));
 assert.equal((await api('requests')).length,0);
 assert.equal((await api('requests',{items:Array.from({length:10},()=>item)})).count,10);
 let rows=await api('requests');assert.equal(rows.length,10);assert.equal(rows[0].name,undefined);assert.equal(rows[0].phone,undefined);
 await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),'requests',rows[0].id)));
 await assert.rejects(()=>api('update',{id:rows[0].id,version:1,reviewer:'담당자'}));
 await assert.rejects(()=>api('login',{password:'wrong'}));
 await api('login',{password:'test-only-password'});assert.equal((await api('session')).reviewer,true);
 assert.equal((await api('settings')).recipient,'sskim07@gsenc.com');
 await api('settings',{recipient:'recipient@example.com'});assert.equal((await api('settings')).recipient,'recipient@example.com');
 rows=await api('requests');assert.equal(rows[0].name,item.name);
 const update={...rows[0],reviewer:'담당자',status:'현장 확인'};await api('update',update);await assert.rejects(()=>api('update',update),/다른 담당자/);
 const changed=(await api('requests')).find(r=>r.id===update.id);assert.equal(changed.version,2);assert.equal(changed.status,'현장 확인');
 await api('update',{...changed,action:'delete'});assert.equal((await api('requests')).length,9);
 await api('logout',{});assert.equal((await api('session')).reviewer,false);assert.equal((await api('requests')).some(r=>r.id===changed.id),false);
 await assert.rejects(()=>api('settings'));
});
test('rules reject non-admin access, forged public summaries and invalid submissions',async()=>{
 const publicDb=env.unauthenticatedContext().firestore(),other=env.authenticatedContext('other-user').firestore();
 const rows=await service.api('requests'),id=rows[0].id;
 await assertFails(getDoc(doc(other,'requests',id)));
 await assertFails(setDoc(doc(other,'settings','mail'),{recipient:'other@example.com'}));
 await assertFails(deleteDoc(doc(publicDb,'requests',id)));
 await assertFails(setDoc(doc(publicDb,'publicRequests','forged'),{...pub({...item,status:'승인 완료',reviewer:'',version:1,created:serverTimestamp()})}));
 async function submit(name,overrides={},summaryOverrides={}){
  const batch=writeBatch(publicDb),record={...item,status:'현장 제출',reviewer:'',version:1,created:serverTimestamp(),...overrides};
  batch.set(doc(publicDb,'requests',name),record);batch.set(doc(publicDb,'publicRequests',name),{...pub(record),...summaryOverrides});return batch.commit();
 }
 await assertFails(submit('forged-status',{status:'승인 완료'}));
 await assertFails(submit('invalid-shoes',{shoes:'999'}));
 await assertFails(submit('extra-field',{secret:'not allowed'}));
 await assertFails(submit('leaked-name',{}, {name:'개인정보'}));
 await assertFails(setDoc(doc(publicDb,'requests','no-summary'),{...item,status:'현장 제출',reviewer:'',version:1,created:serverTimestamp()}));
 await assertSucceeds(submit('valid-public'));
 const adminDb=env.authenticatedContext(ADMIN_UID).firestore();
 await assertSucceeds(getDoc(doc(adminDb,'requests','valid-public')));
 await assertFails(deleteDoc(doc(adminDb,'requests','valid-public'))); // summary must be deleted atomically
});

test('bulk delivery, approval and deletion enforce admin rights, preserve data and reject partial conflicts',async()=>{
 const api=service.api;
 await api('logout',{});
 await assert.rejects(()=>api('bulk',{action:'approve',items:[{id:'missing',version:1}],reviewer:'담당자'}),/관리자/);
 await api('requests',{items:Array.from({length:10},(_,i)=>({...item,name:'일괄검증'+i,team:i%2?'안전팀':'공무팀',visit_date:i%2?'2026-10-16':'2026-10-15'}))});
 await api('login',{password:'test-only-password'});
 let targets=(await api('requests')).filter(row=>row.name.startsWith('일괄검증'));
 assert.equal(targets.length,10);assert.ok(targets.every(row=>row.status==='승인 대기'));
 await assert.rejects(()=>api('bulk',{action:'approve',items:targets.map(({id,version},i)=>({id,version:i===9?999:version})),reviewer:'담당자'}),/변경/);
 assert.ok((await api('requests')).filter(row=>row.name.startsWith('일괄검증')).every(row=>row.status==='승인 대기'&&row.version===1));
 await api('bulk',{action:'delivered',items:targets.map(({id,version})=>({id,version})),reviewer:'메일담당자'});
 targets=(await api('requests')).filter(row=>row.name.startsWith('일괄검증'));assert.ok(targets.every(row=>row.delivery_at&&row.version===2&&row.status==='승인 대기'));
 const adminDb=env.authenticatedContext(ADMIN_UID).firestore();
 const protectedRef=doc(adminDb,'requests',targets[0].id),stored=(await getDoc(protectedRef)).data();
 const {delivery_at,...withoutDelivery}=stored;
 const removal=writeBatch(adminDb),dropped={...withoutDelivery,version:stored.version+1};removal.set(protectedRef,dropped);removal.set(doc(adminDb,'publicRequests',targets[0].id),pub(dropped));await assertFails(removal.commit());
 const outsider=env.authenticatedContext('other-user').firestore();const unauthorized=writeBatch(outsider),forgedApproval={...stored,status:'승인 완료',version:stored.version+1};unauthorized.set(doc(outsider,'requests',targets[0].id),forgedApproval);unauthorized.set(doc(outsider,'publicRequests',targets[0].id),pub(forgedApproval));await assertFails(unauthorized.commit());
 const first=targets[0],delivery=first.delivery_at;
 await api('update',{...first,purpose:'수정된 목적',reviewer:'수정담당자'});
 targets=(await api('requests')).filter(row=>row.name.startsWith('일괄검증'));assert.equal(targets.find(row=>row.id===first.id).delivery_at,delivery);
 await api('bulk',{action:'approve',items:targets.map(({id,version})=>({id,version})),reviewer:'승인담당자'});
 targets=(await api('requests')).filter(row=>row.name.startsWith('일괄검증'));assert.ok(targets.every(row=>row.status==='승인 완료'&&row.delivery_at));
 const publicDb=env.unauthenticatedContext().firestore();
 const forged=writeBatch(publicDb),record={...item,status:'승인 대기',reviewer:'',version:1,created:serverTimestamp(),delivery_at:serverTimestamp()};forged.set(doc(publicDb,'requests','forged-delivery'),record);forged.set(doc(publicDb,'publicRequests','forged-delivery'),pub(record));await assertFails(forged.commit());
 await api('bulk',{action:'delete',items:targets.map(({id,version})=>({id,version})),reviewer:'삭제담당자'});
 assert.ok(!(await api('requests')).some(row=>row.name.startsWith('일괄검증')));
 await api('logout',{});
 const summaries=await api('requests');assert.ok(!summaries.some(row=>targets.some(target=>target.id===row.id)));
});

test('multi-day periods persist privately and publicly, reject reversed dates and preserve legacy records',async()=>{
 const api=service.api;await api('logout',{});
 await assert.rejects(()=>api('requests',{items:[{...item,visit_end_date:'2026-10-14'}]}),/방문종료일/);
 await assert.rejects(()=>api('requests',{items:[{...item,visit_end_date:'2026-02-30'}]}),/날짜/);
 await api('requests',{items:[{...item,name:'기간검증',visit_end_date:'2026-10-20'}]});
 let publicRows=await api('requests');assert.ok(publicRows.some(r=>r.visit_end_date==='2026-10-20'));assert.ok(publicRows.every(r=>!r.name));
 await api('login',{password:'test-only-password'});let row=(await api('requests')).find(r=>r.name==='기간검증');assert.equal(row.visit_end_date,'2026-10-20');
 await api('update',{...row,visit_end_date:'2026-10-22',reviewer:'기간담당자'});row=(await api('requests')).find(r=>r.id===row.id);assert.equal(row.visit_end_date,'2026-10-22');
 await api('bulk',{action:'approve',items:[{id:row.id,version:row.version}],reviewer:'기간담당자'});row=(await api('requests')).find(r=>r.id===row.id);assert.equal(row.visit_end_date,'2026-10-22');
 const db=env.unauthenticatedContext().firestore();const invalid={...item,visit_end_date:'2026-10-14',status:'승인 대기',reviewer:'',version:1,created:serverTimestamp()};const batch=writeBatch(db);batch.set(doc(db,'requests','bad-period'),invalid);batch.set(doc(db,'publicRequests','bad-period'),pub(invalid));await assertFails(batch.commit());
 const legacy=(await api('requests')).find(r=>r.id==='valid-public');assert.equal(legacy.visit_end_date,undefined);await api('update',{...legacy,purpose:'기존 신청 수정',reviewer:'담당자'});const updated=(await api('requests')).find(r=>r.id===legacy.id);assert.equal(updated.visit_end_date,legacy.visit_date);
 await api('logout',{});publicRows=await api('requests');assert.equal(publicRows.find(r=>r.id===row.id).visit_end_date,'2026-10-22');
});
