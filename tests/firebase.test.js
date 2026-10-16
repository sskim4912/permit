import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment, assertFails, assertSucceeds} from '@firebase/rules-unit-testing';
import {doc, getDoc, getDocs, collection, collectionGroup, setDoc, deleteDoc, writeBatch, serverTimestamp} from 'firebase/firestore';
import {deleteApp} from 'firebase/app';
import {createPermitAPI, ADMIN_UID} from '../src/firebase-api.js';
import {initializeApp as initializeAdminApp, deleteApp as deleteAdminApp} from 'firebase-admin/app';
import {getAuth as getAdminAuth} from 'firebase-admin/auth';
let env,service,outsider,adminApp;
const project='demo-permit';
const item={visit_date:'2026-10-15',purpose:'회의',team:'안전팀',gate:'서문',name:'테스트 방문자',birth:'1990-01-01',phone:'010-0000-0000',plate:'',vehicle_type:'',vehicle_name:'',role:'도보',shoes:'필요없음'};
const pub=d=>Object.fromEntries(['visit_date','visit_end_date','purpose','team','status','reviewer','version','created'].filter(k=>k in d).map(k=>[k,d[k]]));
before(async()=>{
 env=await initializeTestEnvironment({projectId:project,firestore:{host:'127.0.0.1',port:8080,rules:readFileSync('firestore.rules','utf8')}});
 process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';
 adminApp=initializeAdminApp({projectId:project},'emulator-admin');
 await getAdminAuth(adminApp).createUser({uid:ADMIN_UID,email:'sskim07@gsenc.com',password:'test-only-password',emailVerified:true});
 service=createPermitAPI({config:{apiKey:'demo-key',projectId:project},emulator:true,name:'integration'});outsider=createPermitAPI({config:{apiKey:'demo-key',projectId:project},emulator:true,name:'public-reader'});
});
after(async()=>{await env?.cleanup();if(service)await deleteApp(service.app);if(outsider)await deleteApp(outsider.app);if(adminApp)await deleteAdminApp(adminApp);});
test('anonymous batch submission, privacy, administrator login, settings and edit lifecycle',async()=>{
 const api=service.api;
 assert.equal((await api('session')).reviewer,false);
 await assert.rejects(()=>api('requests',{author_name:'검증 작성자',items:[item,{...item,birth:'2026-02-30'}]}));
 assert.equal((await api('requests')).length,0);
 assert.equal((await api('requests',{author_name:'검증 작성자',items:Array.from({length:10},()=>item)})).count,10);
 let rows=await outsider.api('requests');assert.equal(rows.length,10);assert.equal(rows[0].name,undefined);assert.equal(rows[0].phone,undefined);
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
 await api('requests',{author_name:'검증 작성자',items:Array.from({length:10},(_,i)=>({...item,name:'일괄검증'+i,team:i%2?'안전팀':'공무팀',visit_date:i%2?'2026-10-16':'2026-10-15'}))});
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
 await assert.rejects(()=>api('requests',{author_name:'검증 작성자',items:[{...item,visit_end_date:'2026-10-14'}]}),/방문종료일/);
 await assert.rejects(()=>api('requests',{author_name:'검증 작성자',items:[{...item,visit_end_date:'2026-02-30'}]}),/날짜/);
 await api('requests',{author_name:'검증 작성자',items:[{...item,name:'기간검증',visit_end_date:'2026-10-20'}]});
 let publicRows=await outsider.api('requests');assert.ok(publicRows.some(r=>r.visit_end_date==='2026-10-20'));assert.ok(publicRows.every(r=>!r.name));
 await api('login',{password:'test-only-password'});let row=(await api('requests')).find(r=>r.name==='기간검증');assert.equal(row.visit_end_date,'2026-10-20');
 await api('update',{...row,visit_end_date:'2026-10-22',reviewer:'기간담당자'});row=(await api('requests')).find(r=>r.id===row.id);assert.equal(row.visit_end_date,'2026-10-22');
 await api('bulk',{action:'approve',items:[{id:row.id,version:row.version}],reviewer:'기간담당자'});row=(await api('requests')).find(r=>r.id===row.id);assert.equal(row.visit_end_date,'2026-10-22');
 const db=env.unauthenticatedContext().firestore();const invalid={...item,visit_end_date:'2026-10-14',status:'승인 대기',reviewer:'',version:1,created:serverTimestamp()};const batch=writeBatch(db);batch.set(doc(db,'requests','bad-period'),invalid);batch.set(doc(db,'publicRequests','bad-period'),pub(invalid));await assertFails(batch.commit());
 const legacy=(await api('requests')).find(r=>r.id==='valid-public');assert.equal(legacy.visit_end_date,undefined);await api('update',{...legacy,purpose:'기존 신청 수정',reviewer:'담당자'});const updated=(await api('requests')).find(r=>r.id===legacy.id);assert.equal(updated.visit_end_date,legacy.visit_date);
 await api('logout',{});publicRows=await api('requests');assert.equal(publicRows.find(r=>r.id===row.id).visit_end_date,'2026-10-22');
});

test('browser-owned applications enforce capability privacy, immutable authors, delivery locks and audited batch deletion',async()=>{
 const config={apiKey:'demo-key',projectId:project};const a=createPermitAPI({config,emulator:true,name:'owner-a',ownerKey:'a'.repeat(64)}),b=createPermitAPI({config,emulator:true,name:'owner-b',ownerKey:'b'.repeat(64)}),resumed=createPermitAPI({config,emulator:true,name:'owner-resumed',ownerKey:'a'.repeat(64)});
 try{
  await assert.rejects(()=>a.api('requests',{items:[item]}),/이름/);
  await a.api('requests',{author_name:'최초 작성 담당',items:Array.from({length:10},(_,i)=>({...item,name:'본인검증'+i}))});
  let mine=(await a.api('requests')).filter(r=>r.own);assert.equal(mine.length,10);assert.ok(mine.every(r=>r.author_name==='최초 작성 담당'));
  assert.ok((await b.api('requests')).every(r=>!r.name&&!r.owner_key&&!r.author_name));assert.equal((await resumed.api('requests')).filter(r=>r.own).length,10);
  const first=mine[0];await assert.rejects(()=>b.api('owner-update',{...first,reviewer:'다른 사람'}),/찾을 수/);await assert.rejects(()=>b.api('owner-delete',{items:[first],reviewer:'다른 사람'}),/변경/);
  const publicDb=env.unauthenticatedContext().firestore(),adminDb=env.authenticatedContext(ADMIN_UID).firestore();
  await assertFails(getDocs(collection(publicDb,'applicantCopies')));await assertFails(getDocs(collectionGroup(publicDb,'items')));await assertFails(getDoc(doc(publicDb,'requests',first.id)));await assertFails(getDoc(doc(publicDb,'requestDeletions',first.id)));
  const before=(await getDoc(doc(adminDb,'requests',first.id))).data();
  async function forged(changes){const record={...before,modified_by:'위조',modified_at:serverTimestamp(),version:before.version+1,...changes};const batch=writeBatch(publicDb);batch.set(doc(publicDb,'requests',first.id),record);batch.set(doc(publicDb,'publicRequests',first.id),pub(record));return batch.commit();}
  await assertFails(forged({owner_key:'b'.repeat(64)}));await assertFails(forged({author_name:'바꾼 작성자'}));await assertFails(forged({status:'승인 완료'}));await assertFails(forged({delivery_at:serverTimestamp()}));
  await a.api('owner-update',{...first,purpose:'본인 수정 회의',reviewer:'실제 수정자',author_name:'무시할 작성자',status:'승인 완료'});
  let changed=(await a.api('requests')).find(r=>r.id===first.id);assert.equal(changed.author_name,'최초 작성 담당');assert.equal(changed.modified_by,'실제 수정자');assert.ok(changed.modified_at);assert.equal(changed.status,'승인 대기');
  await assert.rejects(()=>a.api('owner-update',{...first,reviewer:'다시 수정'}),/변경/);
  await service.api('login',{password:'test-only-password'});await service.api('update',{...changed,purpose:'관리자 수정',reviewer:'관리 담당'});
  changed=(await a.api('requests')).find(r=>r.id===first.id);assert.equal(changed.purpose,'관리자 수정');assert.equal(changed.author_name,'최초 작성 담당');
  await service.api('bulk',{action:'delivered',items:[changed],reviewer:'발송 담당'});changed=(await a.api('requests')).find(r=>r.id===first.id);
  await assert.rejects(()=>a.api('owner-update',{...changed,reviewer:'수정 시도'}),/전달 전/);await assert.rejects(()=>a.api('owner-delete',{items:[changed],reviewer:'삭제 시도'}),/전달 전/);
  await assert.rejects(()=>a.api('bulk',{action:'approve',items:[changed],reviewer:'승인 시도'}),/관리자/);
  mine=(await a.api('requests')).filter(r=>r.own&&!r.delivery_at).slice(0,5);
  await assert.rejects(()=>a.api('owner-delete',{items:mine.map((r,i)=>({...r,version:i===4?999:r.version})),reviewer:'삭제 담당'}),/변경/);assert.ok((await a.api('requests')).some(r=>r.id===mine[0].id));
  await a.api('owner-delete',{items:mine,reviewer:'삭제 담당'});assert.ok(!(await a.api('requests')).some(r=>mine.some(m=>m.id===r.id)));
  assert.ok(!(await b.api('requests')).some(r=>mine.some(m=>m.id===r.id)));
  const log=(await getDoc(doc(adminDb,'requestDeletions',mine[0].id))).data();assert.equal(log.actor_name,'삭제 담당');assert.equal(log.author_name,'최초 작성 담당');
  assert.equal((await getDoc(doc(publicDb,'applicantCopies','a'.repeat(64),'items',mine[0].id))).exists(),false);
 }finally{await deleteApp(a.app);await deleteApp(b.app);await deleteApp(resumed.app);}
});
