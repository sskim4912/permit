import {defaultTeams,validateTeams} from '../functions/lib/directory.js';
import {publicRoster} from './public-roster.js';
import {normalizeRecipients} from './mail-recipients.js';
import {initializeApp} from 'firebase/app';
import {getAuth, setPersistence, browserSessionPersistence, inMemoryPersistence, signInWithEmailAndPassword, signOut, connectAuthEmulator} from 'firebase/auth';
import {getFirestore, collection, doc, getDocs, getDoc, setDoc, writeBatch, runTransaction, serverTimestamp, connectFirestoreEmulator} from 'firebase/firestore';

export const firebaseConfig = {
  apiKey: 'AIzaSyAVNKvKku3o-nvV0Dc80eB9W4DOJHhdnoU',
  authDomain: 'permit-daesan-461e8.firebaseapp.com',
  projectId: 'permit-daesan-461e8',
  storageBucket: 'permit-daesan-461e8.firebasestorage.app',
  messagingSenderId: '942050153369',
  appId: '1:942050153369:web:22f9fa44c63ea0e7a7b908'
};
export const ADMIN_UID = 'ICEik0y5U3aETq3mvW7sesAsNRB2';
const ADMIN_EMAIL = 'sskim07@gsenc.com';
const FIELDS = ['visit_date','visit_end_date','purpose','gate','name','birth','phone','plate','vehicle_type','vehicle_name','role','shoes','team'];
const stages = ['승인 대기','현장 제출','현장 확인','발주처 제출','승인 완료'];
const editable = row => ['승인 대기','현장 제출'].includes(row.status) && !row.delivery_at;
const personName = value => {const name=String(value||'').trim();if(!name||name.length>50)throw Error('작성·수정·삭제하는 분의 이름을 50자 이내로 입력해 주세요.');return name;};
function payload(item) {
  const result=Object.fromEntries(FIELDS.map(key=>[key,String(item[key]??(key==='visit_end_date'?item.visit_date:'')??'').trim()]));
  for(const key of ['visit_date','visit_end_date','birth']) {
    const value=result[key];
    if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number.isNaN(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value) throw Error('날짜를 YYYY-MM-DD 형식으로 확인해 주세요.');
  }
  if(result.visit_end_date<result.visit_date)throw Error('방문종료일은 방문시작일과 같거나 이후여야 합니다.');
  if(['purpose','team','name','phone'].some(k=>!result[k])||Object.values(result).some(v=>v.length>200))throw Error('필수 항목을 입력하고 항목당 200자 이하로 작성해 주세요.');
  if(!['서문','정문'].includes(result.gate)||!['운전자','동승자','도보'].includes(result.role)||!['필요없음',...Array.from({length:15},(_,i)=>String(230+i*5))].includes(result.shoes))throw Error('출입위치, 탑승 구분, 안전화를 확인해 주세요.');
  if('lunch' in item){if(!['중식신청','미신청'].includes(item.lunch))throw Error('중식 신청 또는 미신청을 선택해 주세요.');result.lunch=item.lunch;}
  if(item.team_id){if(!/^[a-zA-Z0-9_-]{1,60}$/.test(item.team_id))throw Error('요청팀을 확인해 주세요.');result.team_id=item.team_id;}
  return result;
}
const summary=publicRoster;
const APPROVAL_KEYS=['gaisu_requested','gaisu_approved','final_approved'];
const serialize=snapshot=>({id:snapshot.id,...snapshot.data(),...Object.fromEntries(APPROVAL_KEYS.filter(k=>snapshot.data()[k]).map(k=>[k,{...snapshot.data()[k],at:snapshot.data()[k].at?.toDate?.().toISOString()||snapshot.data()[k].at}])),created:snapshot.data().created?.toDate?.().toISOString()||'',...(snapshot.data().modified_at?{modified_at:snapshot.data().modified_at.toDate().toISOString()}:{}),...(snapshot.data().delivery_at?{delivery_at:snapshot.data().delivery_at.toDate().toISOString()}:{})});
export function createPermitAPI({config=firebaseConfig, emulator=false, name='permit',ownerKey=null}={}) {
  const app=initializeApp(config,name),auth=getAuth(app),db=getFirestore(app);
  if(emulator){connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});connectFirestoreEmulator(db,'127.0.0.1',8080);}
  const ready=setPersistence(auth,typeof window==='undefined'?inMemoryPersistence:browserSessionPersistence).then(()=>auth.authStateReady());
  const isAdmin=()=>auth.currentUser?.uid===ADMIN_UID;
  let memoryKey=ownerKey;
  function browserKey(create=false){
    if(memoryKey)return memoryKey;
    try{
      const existing=typeof window!=='undefined'?window.localStorage.getItem('permit-owner-key'):null;
      if(existing&&/^[a-f0-9]{64}$/.test(existing))return memoryKey=existing;
      if(!create)return null;
      const key=Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');
      if(typeof window!=='undefined'){window.localStorage.setItem('permit-owner-key',key);if(window.localStorage.getItem('permit-owner-key')!==key)throw Error();}
      return memoryKey=key;
    }catch(e){if(create)throw Error('본인 신청 관리에 필요한 브라우저 저장소를 허용해 주세요. 입력 내용은 유지됩니다.');return null;}
  }
  const copyRef=(key,id)=>doc(db,'applicantCopies',key,'items',id);
  function mirror(writer,ref,record){if(record.owner_key)writer.set(copyRef(record.owner_key,ref.id),record);}
  function erase(writer,ref,before,actor){
    writer.delete(ref);writer.delete(doc(db,'publicRequests',ref.id));
    if(before.owner_key)writer.delete(copyRef(before.owner_key,ref.id));
    writer.set(doc(db,'requestDeletions',ref.id),{actor_name:actor,deleted_at:serverTimestamp(),author_name:before.author_name||'',owner_key:before.owner_key||'',version:before.version});
  }
  const requireAdmin=()=>{if(!isAdmin())throw Error('관리자 로그인이 필요합니다.');};
  async function api(path,data){await ready;try{
    if(path==='session')return {reviewer:isAdmin()};
    if(path==='login'){
      await signInWithEmailAndPassword(auth,ADMIN_EMAIL,data.password);
      if(!isAdmin()){await signOut(auth);throw Error('관리자 권한이 없는 계정입니다.');}
      return {};
    }
    if(path==='logout'){await signOut(auth);return {};}
    if(path==='directory'){
      const metaRef=doc(db,'settings','contactDirectory');
      if(data){requireAdmin();const teams=validateTeams(data.teams);const existing=await getDocs(collection(db,'contactTeams'));await runTransaction(db,async tx=>{const meta=await tx.get(metaRef);if((meta.exists()?meta.data().version:0)!==data.version)throw Error('담당자 정보가 변경되었습니다. 창을 닫고 다시 열어 주세요.');for(const old of existing.docs)if(!teams.some(t=>t.id===old.id))tx.delete(old.ref);for(const team of teams){const {id,...record}=team;tx.set(doc(db,'contactTeams',id),record);}tx.set(metaRef,{version:data.version+1,modified_at:serverTimestamp()});});return {teams,version:data.version+1};}
      const meta=await getDoc(metaRef);if(!meta.exists())return {teams:structuredClone(defaultTeams),version:0};const snapshot=await getDocs(collection(db,'contactTeams'));return {teams:snapshot.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>a.order-b.order),version:meta.data().version};
    }
    if(path==='notify'){
      const key=browserKey();if(!key)throw Error('신청한 브라우저에서 확인해 주세요.');if(!/^[A-Za-z0-9]{20}$/.test(data.queue_id||''))throw Error('이전 방식으로 접수된 신청입니다. 새 신청부터 주기적 문자 발송이 적용됩니다.');
      const receipt=await getDoc(doc(db,'applicantCopies',key,'notificationReceipts',data.queue_id));return receipt.exists()?receipt.data():{results:[{team:'담당자',channel:'sms',status:'pending',retryable:true,message:'문자 발송 대기 중입니다. 약 5분 간격으로 확인하며 GitHub 실행 대기에 따라 더 늦어질 수 있습니다.'}]};
    }
    if(path==='settings'){
      requireAdmin();const ref=doc(db,'settings','mail');
      if(data){const recipient=normalizeRecipients(data.recipient);await setDoc(ref,{recipient});return {recipient};}
      const snapshot=await getDoc(ref);return {recipient:snapshot.exists()?snapshot.data().recipient:ADMIN_EMAIL};
    }
    if(path==='requests'&&!data){
      const snapshot=await getDocs(collection(db,isAdmin()?'requests':'publicRequests'));
      if(isAdmin()){
        const published=await getDocs(collection(db,'publicRequests')),byId=new Map(published.docs.map(d=>[d.id,d.data()]));
        const equal=(a,b)=>{if(a===b)return true;if(a?.isEqual)return a.isEqual(b);if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(k=>equal(a[k],b[k]));};
        const stale=snapshot.docs.filter(d=>!equal(summary(d.data()),byId.get(d.id)));
        for(let offset=0;offset<stale.length;offset+=10){
          const chunk=stale.slice(offset,offset+10);
          await runTransaction(db,async transaction=>{
            const originals=[];for(const item of chunk)originals.push(await transaction.get(doc(db,'requests',item.id)));
            for(const original of originals)if(original.exists())transaction.set(doc(db,'publicRequests',original.id),summary(original.data()));
          });
        }
      }
      let rows=snapshot.docs.map(serialize);const key=browserKey();
      if(!isAdmin()&&key){const own=await getDocs(collection(db,'applicantCopies',key,'items'));const copies=new Map(own.docs.map(s=>[s.id,serialize(s)]));rows=rows.map(row=>{const copy=copies.get(row.id);return copy&&copy.version===row.version?{...copy,own:true}:row;});}
      return rows.sort((a,b)=>b.created.localeCompare(a.created)||b.id.localeCompare(a.id));
    }
    if(path==='requests'){
      if(!Array.isArray(data.items)||data.items.length<1||data.items.length>10)throw Error('1~10명씩 제출해 주세요.');
      const author_name=personName(data.author_name),owner_key=browserKey(true),items=data.items.map(payload),batch=writeBatch(db),ids=[];
      for(const item of items){const ref=doc(collection(db,'requests'));ids.push(ref.id);const record={...item,author_name,owner_key,status:'승인 대기',reviewer:'',version:1,created:serverTimestamp()};batch.set(ref,record);batch.set(doc(db,'publicRequests',ref.id),summary(record));mirror(batch,ref,record);}
      let queue_id=null;if(items.every(item=>item.team_id)){const queue=doc(collection(db,'notificationQueue'));queue_id=queue.id;batch.set(queue,{ids,owner_key,status:'pending',created:serverTimestamp()});}
      await batch.commit();return {count:items.length,ids,queue_id};
    }
    if(path==='owner-update'){
      const key=browserKey();if(!key)throw Error('신청한 브라우저에서만 수정할 수 있습니다.');
      const actor=personName(data.reviewer),ref=doc(db,'requests',String(data.id));
      await runTransaction(db,async transaction=>{
        const snapshot=await transaction.get(copyRef(key,ref.id));if(!snapshot.exists())throw Error('본인 신청을 찾을 수 없습니다.');const before=snapshot.data();
        if(!editable(before))throw Error('발주처 전달 전인 승인 대기 신청만 수정할 수 있습니다.');
        if(actor!==before.author_name)throw Error('최초 작성자 이름과 일치해야 수정·삭제할 수 있습니다.');
        if(before.version!==data.version)throw Error('신청이 변경되었습니다. 새로고침 후 확인해 주세요.');
        const record={...before,...payload(data),modified_by:actor,modified_at:serverTimestamp(),version:before.version+1};
        transaction.set(ref,record);transaction.set(doc(db,'publicRequests',ref.id),summary(record));mirror(transaction,ref,record);
      });return {};
    }
    if(path==='owner-delete'){
      const key=browserKey();if(!key)throw Error('신청한 브라우저에서만 삭제할 수 있습니다.');const actor=data.reviewer?personName(data.reviewer):null;
      if(!Array.isArray(data.items)||!data.items.length||data.items.length>5||new Set(data.items.map(i=>i.id)).size!==data.items.length)throw Error('본인 신청은 한 번에 1~5명을 선택해 주세요.');
      await runTransaction(db,async transaction=>{
        const snapshots=[];for(const item of data.items)snapshots.push(await transaction.get(copyRef(key,String(item.id))));
        for(let i=0;i<snapshots.length;i++){const s=snapshots[i];if(!s.exists()||s.data().version!==data.items[i].version)throw Error('신청이 변경되었거나 삭제되었습니다. 새로고침해 주세요.');if(!editable(s.data()))throw Error('발주처 전달 전인 승인 대기 신청만 삭제할 수 있습니다.');if(actor&&actor!==s.data().author_name)throw Error('최초 작성자 이름과 일치해야 수정·삭제할 수 있습니다.');}
        snapshots.forEach(s=>erase(transaction,doc(db,'requests',s.id),s.data(),s.data().author_name));
      });return {count:data.items.length};
    }
    if(path==='approval'){
      if(!APPROVAL_KEYS.includes(data.stage))throw Error('승인 단계를 확인해 주세요.');
      const administrator=isAdmin(),key=administrator?null:browserKey();
      if(data.stage==='final_approved'&&!administrator)throw Error('최종 승인은 관리자만 처리할 수 있습니다.');
      if(!administrator&&!key)throw Error('신청한 브라우저에서 본인 신청만 처리할 수 있습니다.');
      const reference=doc(db,'requests',String(data.id));
      await runTransaction(db,async transaction=>{
        const snapshot=await transaction.get(administrator?reference:copyRef(key,reference.id));
        if(!snapshot.exists())throw Error('본인 신청을 찾을 수 없습니다.');const before=snapshot.data();
        if(before.version!==data.version)throw Error('신청이 변경되었습니다. 새로고침 후 다시 처리해 주세요.');
        if(before[data.stage]||(data.stage==='final_approved'&&before.status==='승인 완료'))throw Error('이미 처리된 단계입니다.');
        if(!administrator&&(before.owner_key!==key||before.status==='승인 완료'||before.final_approved))throw Error('본인 신청만 처리할 수 있으며 최종 승인 후에는 관리자에게 요청해 주세요.');
        const actor=personName(administrator?data.reviewer:before.author_name);
        const record={...before,[data.stage]:{by:actor,at:serverTimestamp()},modified_by:actor,modified_at:serverTimestamp(),version:before.version+1};
        if(administrator)record.reviewer=actor;
        if(data.stage==='final_approved')record.status='승인 완료';
        transaction.set(reference,record);transaction.set(doc(db,'publicRequests',reference.id),summary(record));mirror(transaction,reference,record);
      });return {};
    }
    if(path==='bulk'){
      requireAdmin();
      if(!['approve','delete','delivered'].includes(data.action))throw Error('처리 방법을 확인해 주세요.');
      const reviewer=String(data.reviewer||'').trim();if(!reviewer||reviewer.length>50)throw Error('처리자 이름을 입력해 주세요.');
      if(!Array.isArray(data.items)||data.items.length<1||data.items.length>10||new Set(data.items.map(item=>item.id)).size!==data.items.length)throw Error('한 번에 1~10명을 선택해 주세요.');
      await runTransaction(db,async transaction=>{
        const references=data.items.map(item=>doc(db,'requests',String(item.id)));
        const snapshots=[];
        for(const reference of references)snapshots.push(await transaction.get(reference));
        for(let index=0;index<snapshots.length;index++){
          const snapshot=snapshots[index],item=data.items[index];
          if(!snapshot.exists()||snapshot.data().version!==item.version)throw Error('선택 내역이 변경되었거나 삭제되었습니다. 새로고침 후 다시 선택해 주세요.');
        }
        for(let index=0;index<snapshots.length;index++){
          const before=snapshots[index].data(),reference=references[index],publicRef=doc(db,'publicRequests',reference.id);
          if(data.action==='delete'){erase(transaction,reference,before,reviewer);continue;}
          const record={...before,reviewer,version:before.version+1};
          if(data.action==='approve'){record.status='승인 완료';if(before.status!=='승인 완료'&&!before.final_approved)record.final_approved={by:reviewer,at:serverTimestamp()};}
          if(data.action==='delivered')record.delivery_at=serverTimestamp();
          transaction.set(reference,record);transaction.set(publicRef,summary(record));mirror(transaction,reference,record);
        }
      });return {count:data.items.length};
    }
    if(path==='update'){
      requireAdmin();const reviewer=String(data.reviewer||'').trim();if(!reviewer||reviewer.length>50)throw Error('현장 확인자 이름을 입력해 주세요.');
      const ref=doc(db,'requests',String(data.id)),publicRef=doc(db,'publicRequests',String(data.id));
      await runTransaction(db,async transaction=>{
        const snapshot=await transaction.get(ref);
        if(!snapshot.exists())throw Error('신청 내역이 없습니다.');
        if(snapshot.data().version!==data.version)throw Error('다른 담당자가 변경했습니다. 새로고침 후 다시 시도해 주세요.');
        if(data.action==='delete'){erase(transaction,ref,snapshot.data(),reviewer);return;}
        if(!stages.includes(data.status))throw Error('상태를 확인해 주세요.');
        const record={...snapshot.data(),...payload(data),status:data.status,reviewer,modified_by:reviewer,modified_at:serverTimestamp(),version:data.version+1,created:snapshot.data().created};
        transaction.set(ref,record);transaction.set(publicRef,summary(record));mirror(transaction,ref,record);
      });return {};
    }
    throw Error('지원하지 않는 요청입니다.');
  }catch(error){
    const messages={'auth/invalid-credential':'비밀번호가 맞지 않습니다.','auth/wrong-password':'비밀번호가 맞지 않습니다.','auth/user-not-found':'관리자 계정이 등록되지 않았습니다.','auth/too-many-requests':'로그인 시도가 많습니다. 잠시 후 다시 시도해 주세요.','auth/network-request-failed':'네트워크 연결을 확인해 주세요.','permission-denied':'접근 권한이 없습니다. Firestore 규칙과 관리자 계정을 확인해 주세요.','unavailable':'서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.'};
    throw Error(messages[error.code]||error.message);
  }}
  return {api,auth,db,app};
}
