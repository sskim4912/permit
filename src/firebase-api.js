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
const FIELDS = ['visit_date','purpose','gate','name','birth','phone','plate','vehicle_type','vehicle_name','role','shoes','team'];
const PUBLIC_FIELDS = ['visit_date','purpose','team','status','reviewer','version','created'];
const stages = ['승인 대기','현장 제출','현장 확인','발주처 제출','승인 완료'];
function payload(item) {
  const result=Object.fromEntries(FIELDS.map(key=>[key,String(item[key]??'').trim()]));
  for(const key of ['visit_date','birth']) {
    const value=result[key];
    if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number.isNaN(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value) throw Error('날짜를 YYYY-MM-DD 형식으로 확인해 주세요.');
  }
  if(['purpose','team','name','phone'].some(k=>!result[k])||Object.values(result).some(v=>v.length>200))throw Error('필수 항목을 입력하고 항목당 200자 이하로 작성해 주세요.');
  if(!['서문','정문'].includes(result.gate)||!['운전자','동승자','도보'].includes(result.role)||!['필요없음',...Array.from({length:15},(_,i)=>String(230+i*5))].includes(result.shoes))throw Error('출입위치, 탑승 구분, 안전화를 확인해 주세요.');
  return result;
}
const summary=item=>Object.fromEntries(PUBLIC_FIELDS.map(key=>[key,item[key]]));
const serialize=snapshot=>({id:snapshot.id,...snapshot.data(),created:snapshot.data().created?.toDate?.().toISOString()||'',...(snapshot.data().delivery_at?{delivery_at:snapshot.data().delivery_at.toDate().toISOString()}:{})});
export function createPermitAPI({config=firebaseConfig, emulator=false, name='permit'}={}) {
  const app=initializeApp(config,name),auth=getAuth(app),db=getFirestore(app);
  if(emulator){connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});connectFirestoreEmulator(db,'127.0.0.1',8080);}
  const ready=setPersistence(auth,typeof window==='undefined'?inMemoryPersistence:browserSessionPersistence).then(()=>auth.authStateReady());
  const isAdmin=()=>auth.currentUser?.uid===ADMIN_UID;
  const requireAdmin=()=>{if(!isAdmin())throw Error('관리자 로그인이 필요합니다.');};
  async function api(path,data){await ready;try{
    if(path==='session')return {reviewer:isAdmin()};
    if(path==='login'){
      await signInWithEmailAndPassword(auth,ADMIN_EMAIL,data.password);
      if(!isAdmin()){await signOut(auth);throw Error('관리자 권한이 없는 계정입니다.');}
      return {};
    }
    if(path==='logout'){await signOut(auth);return {};}
    if(path==='settings'){
      requireAdmin();const ref=doc(db,'settings','mail');
      if(data){const recipient=String(data.recipient||'').trim();if(recipient.length>254||!/^\S+@[^\s@]+\.[^\s@]+$/.test(recipient))throw Error('올바른 이메일 주소를 입력해 주세요.');await setDoc(ref,{recipient});return {recipient};}
      const snapshot=await getDoc(ref);return {recipient:snapshot.exists()?snapshot.data().recipient:ADMIN_EMAIL};
    }
    if(path==='requests'&&!data){const snapshot=await getDocs(collection(db,isAdmin()?'requests':'publicRequests'));return snapshot.docs.map(serialize).sort((a,b)=>b.created.localeCompare(a.created)||b.id.localeCompare(a.id));}
    if(path==='requests'){
      if(!Array.isArray(data.items)||data.items.length<1||data.items.length>10)throw Error('1~10명씩 제출해 주세요.');
      const items=data.items.map(payload),batch=writeBatch(db);
      for(const item of items){const ref=doc(collection(db,'requests'));const record={...item,status:'승인 대기',reviewer:'',version:1,created:serverTimestamp()};batch.set(ref,record);batch.set(doc(db,'publicRequests',ref.id),summary(record));}
      await batch.commit();return {count:items.length};
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
          if(data.action==='delete'){transaction.delete(reference);transaction.delete(publicRef);continue;}
          const record={...before,reviewer,version:before.version+1};
          if(data.action==='approve')record.status='승인 완료';
          if(data.action==='delivered')record.delivery_at=serverTimestamp();
          transaction.set(reference,record);transaction.set(publicRef,summary(record));
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
        if(data.action==='delete'){transaction.delete(ref);transaction.delete(publicRef);return;}
        if(!stages.includes(data.status))throw Error('상태를 확인해 주세요.');
        const record={...snapshot.data(),...payload(data),status:data.status,reviewer,version:data.version+1,created:snapshot.data().created};
        transaction.set(ref,record);transaction.set(publicRef,summary(record));
      });return {};
    }
    throw Error('지원하지 않는 요청입니다.');
  }catch(error){
    const messages={'auth/invalid-credential':'비밀번호가 맞지 않습니다.','auth/wrong-password':'비밀번호가 맞지 않습니다.','auth/user-not-found':'관리자 계정이 등록되지 않았습니다.','auth/too-many-requests':'로그인 시도가 많습니다. 잠시 후 다시 시도해 주세요.','auth/network-request-failed':'네트워크 연결을 확인해 주세요.','permission-denied':'접근 권한이 없습니다. Firestore 규칙과 관리자 계정을 확인해 주세요.','unavailable':'서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.'};
    throw Error(messages[error.code]||error.message);
  }}
  return {api,auth,db,app};
}
