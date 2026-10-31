import {createNotifyHandler} from '../functions/lib/http.js';
import {getFirestore as getAdminFirestore,Timestamp as AdminTimestamp} from 'firebase-admin/firestore';
import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment, assertFails, assertSucceeds} from '@firebase/rules-unit-testing';
import {doc, getDoc, getDocs, collection, collectionGroup, setDoc, deleteDoc, writeBatch, serverTimestamp} from 'firebase/firestore';
import {deleteApp} from 'firebase/app';
import {createPermitAPI, ADMIN_UID} from '../src/firebase-api.js';
import {publicRoster} from '../src/public-roster.js';
import {initializeApp as initializeAdminApp, deleteApp as deleteAdminApp} from 'firebase-admin/app';
import {getAuth as getAdminAuth} from 'firebase-admin/auth';
let env,service,outsider,adminApp;
const project='demo-permit';
const item={visit_date:'2026-10-15',purpose:'회의',team:'안전팀',gate:'서문',name:'테스트 방문자',birth:'1990-01-01',phone:'010-0000-0000',plate:'',vehicle_type:'',vehicle_name:'',role:'도보',shoes:'필요없음'};
const pub=publicRoster;
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
 let rows=await outsider.api('requests');assert.equal(rows.length,10);assert.equal(rows[0].name,item.name);assert.equal(rows[0].phone,item.phone);assert.equal(rows[0].birth,undefined);assert.equal(rows[0].birth_mask,'19**-**-**');assert.equal(rows[0].owner_key,undefined);
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
 let publicRows=await outsider.api('requests');assert.ok(publicRows.some(r=>r.visit_end_date==='2026-10-20'));assert.ok(publicRows.every(r=>!r.birth&&!r.owner_key));
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
  assert.ok((await b.api('requests')).every(r=>!r.birth&&!r.owner_key&&!r.author_name));assert.equal((await resumed.api('requests')).filter(r=>r.own).length,10);
  const first=mine[0];await assert.rejects(()=>b.api('owner-update',{...first,reviewer:'다른 사람'}),/찾을 수/);await assert.rejects(()=>b.api('owner-delete',{items:[first],reviewer:'다른 사람'}),/변경/);
  const publicDb=env.unauthenticatedContext().firestore(),adminDb=env.authenticatedContext(ADMIN_UID).firestore();
  await assertFails(getDocs(collection(publicDb,'applicantCopies')));await assertFails(getDocs(collectionGroup(publicDb,'items')));await assertFails(getDoc(doc(publicDb,'requests',first.id)));await assertFails(getDoc(doc(publicDb,'requestDeletions',first.id)));
  const before=(await getDoc(doc(adminDb,'requests',first.id))).data();
  async function forged(changes){const record={...before,modified_by:'최초 작성 담당',modified_at:serverTimestamp(),version:before.version+1,...changes};const batch=writeBatch(publicDb);batch.set(doc(publicDb,'requests',first.id),record);batch.set(doc(publicDb,'publicRequests',first.id),pub(record));return batch.commit();}
  await assertFails(forged({modified_by:'다른 이름'}));await assertFails(forged({owner_key:'b'.repeat(64)}));await assertFails(forged({author_name:'바꾼 작성자'}));await assertFails(forged({status:'승인 완료'}));await assertFails(forged({delivery_at:serverTimestamp()}));
  await assert.rejects(()=>a.api('owner-update',{...first,reviewer:'다른 이름'}),/최초 작성자/);await assert.rejects(()=>a.api('owner-delete',{items:[first],reviewer:'다른 이름'}),/최초 작성자/);
  const forgedDelete=writeBatch(publicDb);forgedDelete.delete(doc(publicDb,'requests',first.id));forgedDelete.delete(doc(publicDb,'publicRequests',first.id));forgedDelete.delete(doc(publicDb,'applicantCopies','a'.repeat(64),'items',first.id));forgedDelete.set(doc(publicDb,'requestDeletions',first.id),{owner_key:'a'.repeat(64),author_name:'최초 작성 담당',actor_name:'다른 이름',version:first.version,deleted_at:serverTimestamp()});await assertFails(forgedDelete.commit());
  await a.api('owner-update',{...first,purpose:'본인 수정 회의',reviewer:'최초 작성 담당',author_name:'무시할 작성자',status:'승인 완료'});
  let changed=(await a.api('requests')).find(r=>r.id===first.id);assert.equal(changed.author_name,'최초 작성 담당');assert.equal(changed.modified_by,'최초 작성 담당');assert.ok(changed.modified_at);assert.equal(changed.status,'승인 대기');
  await assert.rejects(()=>a.api('owner-update',{...first,reviewer:'최초 작성 담당'}),/변경/);
  await service.api('login',{password:'test-only-password'});await service.api('update',{...changed,purpose:'관리자 수정',name:'김진동',reviewer:'관리 담당'});
  changed=(await a.api('requests')).find(r=>r.id===first.id);assert.equal(changed.purpose,'관리자 수정');assert.equal(changed.author_name,'최초 작성 담당');
  await a.api('owner-update',{...changed,purpose:'관리자 수정 후 본인 재수정',reviewer:'최초 작성 담당'});
  changed=(await a.api('requests')).find(r=>r.id===first.id);assert.equal(changed.purpose,'관리자 수정 후 본인 재수정');
  await service.api('bulk',{action:'delivered',items:[changed],reviewer:'발송 담당'});changed=(await a.api('requests')).find(r=>r.id===first.id);
  await assert.rejects(()=>a.api('owner-update',{...changed,reviewer:'수정 시도'}),/전달 전/);await assert.rejects(()=>a.api('owner-delete',{items:[changed],reviewer:'삭제 시도'}),/전달 전/);
  await assert.rejects(()=>a.api('bulk',{action:'approve',items:[changed],reviewer:'승인 시도'}),/관리자/);
  mine=(await a.api('requests')).filter(r=>r.own&&!r.delivery_at).slice(0,5);
  await assert.rejects(()=>a.api('owner-delete',{items:mine.map((r,i)=>({...r,version:i===4?999:r.version})),reviewer:'최초 작성 담당'}),/변경/);assert.ok((await a.api('requests')).some(r=>r.id===mine[0].id));
  await a.api('owner-delete',{items:mine,reviewer:'최초 작성 담당'});assert.ok(!(await a.api('requests')).some(r=>mine.some(m=>m.id===r.id)));
  assert.ok(!(await b.api('requests')).some(r=>mine.some(m=>m.id===r.id)));
  const log=(await getDoc(doc(adminDb,'requestDeletions',mine[0].id))).data();assert.equal(log.actor_name,'최초 작성 담당');assert.equal(log.author_name,'최초 작성 담당');
  assert.equal((await getDoc(doc(publicDb,'applicantCopies','a'.repeat(64),'items',mine[0].id))).exists(),false);
 }finally{await deleteApp(a.app);await deleteApp(b.app);await deleteApp(resumed.app);}
});

test('admin saves multiple mail recipients with existing string schema and rules reject invalid lists',async()=>{
 const api=service.api;await api('login',{password:'test-only-password'});
 await api('settings',{recipient:'first@example.com; second@example.com, FIRST@example.com'});
 assert.equal((await api('settings')).recipient,'first@example.com,second@example.com');
 await assert.rejects(()=>api('settings',{recipient:'ok@example.com,invalid'}));
 const db=env.authenticatedContext(ADMIN_UID).firestore();
 await assertFails(setDoc(doc(db,'settings','mail'),{recipient:'ok@example.com,invalid'}));
 await assertFails(setDoc(doc(db,'settings','mail'),{recipient:Array.from({length:11},(_,i)=>`r${i}@example.com`).join(',')}));
 await api('settings',{recipient:'single@example.com'});assert.equal((await api('settings')).recipient,'single@example.com');await api('logout',{});
});

test('browser-owned batch deletion derives each original author without a second name entry',async()=>{
 const client=createPermitAPI({config:{apiKey:'demo-key',projectId:project},emulator:true,name:'multi-author-delete',ownerKey:'c'.repeat(64)});
 try{
  await client.api('requests',{author_name:'신청자 하나',items:[{...item,name:'작성자별 삭제1'}]});await client.api('requests',{author_name:'신청자 둘',items:[{...item,name:'작성자별 삭제2'}]});
  const mine=(await client.api('requests')).filter(r=>r.own);assert.equal(mine.length,2);
  await client.api('owner-delete',{items:mine.map(({id,version})=>({id,version}))});
  assert.equal((await client.api('requests')).filter(r=>r.own).length,0);
  const db=env.authenticatedContext(ADMIN_UID).firestore();for(const row of mine){const log=(await getDoc(doc(db,'requestDeletions',row.id))).data();assert.equal(log.actor_name,row.author_name);}
 }finally{await deleteApp(client.app);}
});

test('public roster masks birth on server and administrator safely upgrades legacy summaries',async()=>{
 const config={apiKey:'demo-key',projectId:project},owner=createPermitAPI({config,emulator:true,name:'projection-owner',ownerKey:'d'.repeat(64)});
 try{
  await owner.api('requests',{author_name:'공개검증 작성자',items:[{...item,name:'공개검증',phone:'010-0000-1234',plate:'테스트0001',birth:'2001-02-03'}]});
  let mine=(await owner.api('requests')).find(r=>r.own);assert.equal(mine.birth,'2001-02-03');
  let pubRow=(await outsider.api('requests')).find(r=>r.id===mine.id);assert.equal(pubRow.birth_mask,'20**-**-**');assert.equal(pubRow.birth,undefined);assert.equal(pubRow.name,'공개검증');assert.equal(pubRow.phone,'010-0000-1234');assert.equal(pubRow.owner_key,undefined);
  const adminDb=env.authenticatedContext(ADMIN_UID).firestore(),ref=doc(adminDb,'publicRequests',mine.id),original=(await getDoc(doc(adminDb,'requests',mine.id))).data();
  await assertFails(setDoc(ref,{...pub(original),birth:original.birth}));await assertFails(setDoc(ref,{...pub(original),birth_mask:original.birth}));await assertFails(setDoc(ref,{...pub(original),owner_key:original.owner_key}));
  const legacy=Object.fromEntries(['visit_date','visit_end_date','purpose','team','status','reviewer','version','created'].filter(k=>k in original).map(k=>[k,original[k]]));
  await setDoc(ref,legacy);await service.api('login',{password:'test-only-password'});await service.api('requests');await service.api('requests');
  pubRow=(await outsider.api('requests')).find(r=>r.id===mine.id);assert.equal(pubRow.name,'공개검증');assert.equal(pubRow.birth_mask,'20**-**-**');
  const after=(await getDoc(doc(adminDb,'requests',mine.id))).data();assert.equal(after.birth,original.birth);assert.equal(after.version,original.version);assert.equal(after.owner_key,original.owner_key);await service.api('logout',{});
 }finally{await deleteApp(owner.app);}
});

test('lunch and approval stages enforce owner/admin rights, server audit times, conflict checks and immutable history',async()=>{
 const config={apiKey:'demo-key',projectId:project};const owner=createPermitAPI({config,emulator:true,name:'stage-owner',ownerKey:'e'.repeat(64)}),stranger=createPermitAPI({config,emulator:true,name:'stage-stranger',ownerKey:'f'.repeat(64)});
 try{
  await assert.rejects(()=>owner.api('requests',{author_name:'단계 신청자',items:[{...item,lunch:'잘못된 선택'}]}),/중식/);
  await owner.api('requests',{author_name:'단계 신청자',items:[{...item,name:'단계 검증',lunch:'중식신청'}]});let mine=(await owner.api('requests')).find(r=>r.own);assert.equal(mine.lunch,'중식신청');
  await assert.rejects(()=>stranger.api('approval',{id:mine.id,version:mine.version,stage:'gaisu_requested'}),/본인/);
  await assert.rejects(()=>owner.api('approval',{id:mine.id,version:mine.version,stage:'final_approved'}),/관리자/);
  await owner.api('approval',{id:mine.id,version:mine.version,stage:'gaisu_requested',reviewer:'무시할 이름',at:'2000-01-01'});let changed=(await owner.api('requests')).find(r=>r.id===mine.id);assert.equal(changed.gaisu_requested.by,'단계 신청자');assert.ok(changed.gaisu_requested.at);assert.notEqual(changed.gaisu_requested.at,'2000-01-01');
  await assert.rejects(()=>owner.api('approval',{id:mine.id,version:mine.version,stage:'gaisu_approved'}),/변경/);
  await assert.rejects(()=>owner.api('approval',{id:changed.id,version:changed.version,stage:'gaisu_requested'}),/이미/);
  const adminDb=env.authenticatedContext(ADMIN_UID).firestore(),publicDb=env.unauthenticatedContext().firestore();let original=(await getDoc(doc(adminDb,'requests',mine.id))).data();
  async function forge(overrides){const record={...original,version:original.version+1,modified_by:original.author_name,modified_at:serverTimestamp(),...overrides};const batch=writeBatch(publicDb);batch.set(doc(publicDb,'requests',mine.id),record);batch.set(doc(publicDb,'publicRequests',mine.id),pub(record));batch.set(doc(publicDb,'applicantCopies','e'.repeat(64),'items',mine.id),record);return batch.commit();}
  await assertFails(forge({gaisu_approved:{by:'다른 이름',at:serverTimestamp()}}));await assertFails(forge({final_approved:{by:'단계 신청자',at:serverTimestamp()},status:'승인 완료'}));
  const {gaisu_requested,...removed}=original;await assertFails(forge({...removed,gaisu_requested:null}));
  await owner.api('owner-update',{...changed,lunch:'미신청',purpose:'중식 변경',reviewer:'단계 신청자'});changed=(await owner.api('requests')).find(r=>r.id===mine.id);assert.equal(changed.lunch,'미신청');assert.deepEqual(changed.gaisu_requested,{by:gaisu_requested.by,at:gaisu_requested.at.toDate().toISOString()});
  await service.api('login',{password:'test-only-password'});await service.api('bulk',{action:'delivered',items:[changed],reviewer:'발송 담당자'});changed=(await owner.api('requests')).find(r=>r.id===mine.id);
  await owner.api('approval',{id:changed.id,version:changed.version,stage:'gaisu_approved'});changed=(await owner.api('requests')).find(r=>r.id===mine.id);assert.equal(changed.gaisu_approved.by,'단계 신청자');
  await assert.rejects(()=>service.api('approval',{id:changed.id,version:changed.version,stage:'final_approved',reviewer:''}),/이름/);
  await service.api('approval',{id:changed.id,version:changed.version,stage:'final_approved',reviewer:'최종 담당자'});changed=(await owner.api('requests')).find(r=>r.id===mine.id);assert.equal(changed.status,'승인 완료');assert.equal(changed.final_approved.by,'최종 담당자');assert.ok(changed.final_approved.at);
  const publicRow=(await stranger.api('requests')).find(r=>r.id===mine.id);assert.equal(publicRow.final_approved.by,'최종 담당자');assert.equal(publicRow.lunch,'미신청');assert.equal(publicRow.owner_key,undefined);assert.equal(publicRow.birth,undefined);
  original=(await getDoc(doc(adminDb,'requests',mine.id))).data();await assertFails(forge({final_approved:{by:'위조',at:serverTimestamp()}}));
  await service.api('logout',{});
 }finally{await deleteApp(owner.app);await deleteApp(stranger.app);}
});

test('team directory is public, admin-managed, versioned and validates both contacts',async()=>{
 const defaults=await outsider.api('directory');assert.equal(defaults.version,0);assert.equal(defaults.teams.length,11);
 await assert.rejects(()=>outsider.api('directory',{teams:defaults.teams,version:0}),/관리자/);
 const publicDb=env.unauthenticatedContext().firestore();await assertFails(setDoc(doc(publicDb,'contactTeams','forged'),{name:'위조',order:0,contacts:defaults.teams[0].contacts}));
 await assertFails(getDoc(doc(publicDb,'notificationJobs','private-job')));await assertFails(setDoc(doc(publicDb,'notificationClaims','forged'),{job:'forged'}));
 await service.api('login',{password:'test-only-password'});const teams=structuredClone(defaults.teams);teams[0].contacts[0].name='변경 담당자';
 const saved=await service.api('directory',{teams,version:0});assert.equal(saved.version,1);assert.equal((await outsider.api('directory')).teams[0].contacts[0].name,'변경 담당자');
 await assert.rejects(()=>service.api('directory',{teams,version:0}),/변경/);
 const adminDb=env.authenticatedContext(ADMIN_UID).firestore();await assertFails(setDoc(doc(adminDb,'contactTeams','invalid'),{name:'잘못된 팀',order:0,contacts:[{name:'',phone:'bad',email:'bad'},teams[0].contacts[1]]}));
 await service.api('requests',{author_name:'팀 선택 검증',items:[{...item,team:teams[0].name,team_id:teams[0].id,lunch:'미신청'}]});const own=(await service.api('requests')).find(r=>r.author_name==='팀 선택 검증');assert.equal(own.team_id,'management');
 await service.api('logout',{});
});


test('notification HTTP handler verifies ownership and atomically prevents duplicate or overlapping delivery',async()=>{
 const owner=createPermitAPI({config:{apiKey:'demo-key',projectId:project},emulator:true,name:'notification-owner',ownerKey:'1'.repeat(64)});const db=getAdminFirestore(adminApp);let sends=0;
 const invoke=async(handler,ids,key)=>{let status=200,result;const res={set(){return this;},status(value){status=value;return this;},json(value){result=value;}};await handler({method:'POST',body:{ids,ownerKey:key},ip:'test-ip'},res);return {status,result};};
 try{
  const submitted=await owner.api('requests',{author_name:'알림 검증',items:[{...item,team:'관리팀',team_id:'management'}]});
  const missing=createNotifyHandler({db,Timestamp:AdminTimestamp,getConfig:()=>({})});
  assert.equal((await invoke(missing,submitted.ids,'2'.repeat(64))).status,400);
  const failed=await invoke(missing,submitted.ids,'1'.repeat(64));assert.equal(failed.status,200);assert.equal(failed.result.results.length,4);assert.ok(failed.result.results.every(r=>r.status==='failed'&&r.retryable));
  const configured=createNotifyHandler({db,Timestamp:AdminTimestamp,getConfig:()=>({}),send:async()=>{sends++;return 'fake-receipt';}});
  const done=await invoke(configured,submitted.ids,'1'.repeat(64));assert.equal(done.status,200);assert.ok(done.result.results.every(r=>r.status==='sent'));assert.equal(sends,4);assert.equal(done.result.results[0].to,undefined);assert.equal(done.result.results[0].html,undefined);
  await invoke(configured,submitted.ids,'1'.repeat(64));assert.equal(sends,4);
  const smsOnly=await owner.api('requests',{author_name:'문자 단독 검증',items:[{...item,team:'관리팀',team_id:'management'}]});const smsHandler=createNotifyHandler({db,Timestamp:AdminTimestamp,getConfig:()=>({solapi:{}}),send:async task=>{assert.equal(task.channel,'sms');return 'fake-sms';}});const smsDone=await invoke(smsHandler,smsOnly.ids,'1'.repeat(64));assert.equal(smsDone.status,200);assert.equal(smsDone.result.results.length,2);assert.ok(smsDone.result.results.every(r=>r.status==='sent'&&r.channel==='sms'));
  const another=await owner.api('requests',{author_name:'알림 검증',items:[{...item,team:'관리팀',team_id:'management'}]});const overlap=await invoke(configured,[...submitted.ids,...another.ids],'1'.repeat(64));assert.equal(overlap.status,400);assert.match(overlap.result.message,/이미 발송/);assert.equal(sends,4);
 }finally{await deleteApp(owner.app);await db.terminate();}
});

test('free scheduled queue is atomic for ten visitors, private, deduplicated and readable only through browser receipts',async()=>{
 const {processNotificationQueue}=await import('../functions/lib/queue.js');const queueApp=initializeAdminApp({projectId:project},'queue-tests'),db=getAdminFirestore(queueApp);const owner=createPermitAPI({config:{apiKey:'demo-key',projectId:project},emulator:true,name:'queue-owner',ownerKey:'3'.repeat(64)}),other=createPermitAPI({config:{apiKey:'demo-key',projectId:project},emulator:true,name:'queue-other',ownerKey:'4'.repeat(64)});const sent=[];
 try{
  const created=await owner.api('requests',{author_name:'예약 알림 검증',items:Array.from({length:10},(_,i)=>({...item,name:'예약방문자'+i,team:'관리팀',team_id:'management'}))});assert.ok(created.queue_id);assert.equal(created.ids.length,10);
  const pending=await owner.api('notify',{queue_id:created.queue_id});assert.equal(pending.results[0].status,'pending');
  const publicDb=env.unauthenticatedContext().firestore();await assertFails(getDoc(doc(publicDb,'notificationQueue',created.queue_id)));await assertFails(setDoc(doc(publicDb,'applicantCopies','3'.repeat(64),'notificationReceipts',created.queue_id),{results:[{status:'sent'}]}));
  await assertFails(setDoc(doc(publicDb,'notificationQueue','z'.repeat(20)),{ids:created.ids,owner_key:'3'.repeat(64),status:'pending',created:serverTimestamp()}));
  const worker=()=>processNotificationQueue({db,Timestamp:AdminTimestamp,config:{solapi:{}},send:async task=>{sent.push(task);return 'fake-solapi-receipt';},limit:100});
  await worker();const done=await owner.api('notify',{queue_id:created.queue_id});assert.equal(done.results.length,2);assert.ok(done.results.every(r=>r.status==='sent'&&r.channel==='sms'));assert.equal(done.results[0].to,undefined);assert.equal(done.results[0].providerId,undefined);assert.equal((await other.api('notify',{queue_id:created.queue_id})).results[0].status,'pending');
  const before=sent.length;const queue=(await db.doc('notificationQueue/'+created.queue_id).get()).data();await db.doc('notificationQueue/'+'d'.repeat(20)).set({...queue,status:'pending',leaseUntil:AdminTimestamp.fromMillis(0)});await worker();assert.equal(sent.length,before);
  const deleted=await owner.api('requests',{author_name:'삭제 알림 검증',items:[{...item,team:'관리팀',team_id:'management'}]});const row=(await owner.api('requests')).find(r=>r.id===deleted.ids[0]);await owner.api('owner-delete',{items:[row]});await worker();assert.equal(sent.length,before);assert.equal((await owner.api('notify',{queue_id:deleted.queue_id})).results[0].status,'failed');
 }finally{await deleteApp(owner.app);await deleteApp(other.app);await db.terminate();await deleteAdminApp(queueApp);}
});
