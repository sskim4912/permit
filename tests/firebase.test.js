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
const pub=d=>Object.fromEntries(['visit_date','purpose','team','status','reviewer','version','created'].map(k=>[k,d[k]]));
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
