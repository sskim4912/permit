import {createHash} from 'node:crypto';
import {defaultTeams,validateTeams} from './directory.js';
import {enabledChannels} from './config.js';
import {jobId,buildPlan,publicResults,dispatchTasks,sendTask} from './notifications.js';
const hash=value=>createHash('sha256').update(value).digest('hex');
export async function processNotificationQueue({db,Timestamp,config,send=sendTask,clock=Date.now,limit=5}){
 const meta=await db.doc('settings/contactDirectory').get();const teams=meta.exists?validateTeams((await db.collection('contactTeams').get()).docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>a.order-b.order)):defaultTeams;
 const queues=await db.collection('notificationQueue').where('status','in',['pending','retry','processing']).limit(limit).get();let processed=0;
 for(const snapshot of queues.docs){
  const queueRef=snapshot.ref,now=clock();let ownerKey,jobRef,started=false;
  try{
   const claim=await db.runTransaction(async tx=>{
    const q=await tx.get(queueRef);if(!q.exists)return null;const value=q.data();ownerKey=value.owner_key;
    if(value.status==='done'||value.leaseUntil?.toMillis()>now)return null;
    if(!/^[a-f0-9]{64}$/.test(ownerKey)||!Array.isArray(value.ids)||value.ids.length<1||value.ids.length>10)throw Error('알림 신청 정보가 올바르지 않습니다.');
    const originals=await tx.getAll(...value.ids.map(id=>db.doc('requests/'+id)));if(originals.some(d=>!d.exists||d.data().owner_key!==ownerKey))throw Error('신청이 삭제되었거나 알림 권한을 확인할 수 없습니다.');
    const id=jobId(value.ids);jobRef=db.doc('notificationJobs/'+id);const job=await tx.get(jobRef);const claims=await tx.getAll(...value.ids.map(id=>db.doc('notificationClaims/'+id)));
    if(claims.some(d=>d.exists&&d.data().job!==id))throw Error('이미 다른 묶음으로 발송 요청한 신청입니다.');
    const tasks=job.exists?job.data().tasks:buildPlan(originals.map(d=>d.data()),teams).filter(task=>enabledChannels(config).includes(task.channel));
    if(job.exists&&job.data().leaseUntil?.toMillis()>now)return null;
    if(!job.exists){tx.set(jobRef,{tasks,ownerHash:hash(ownerKey),createdAt:Timestamp.fromMillis(now)});for(const c of claims)tx.set(c.ref,{job:id});}
    tx.update(queueRef,{status:'processing',leaseUntil:Timestamp.fromMillis(now+600000),attempts:(value.attempts||0)+1});tx.set(jobRef,{leaseUntil:Timestamp.fromMillis(now+600000)},{merge:true});
    return {id,tasks,attempts:(value.attempts||0)+1};
   });
   if(!claim)continue;started=true;
   const receipt=db.doc(`applicantCopies/${ownerKey}/notificationReceipts/${queueRef.id}`);
   const save=async tasks=>{const batch=db.batch();batch.update(jobRef,{tasks});batch.set(receipt,{results:publicResults(tasks).map(r=>r.status==='sending'?{...r,status:'pending',message:'발송을 처리 중입니다.'}:r),updated_at:Timestamp.now()});await batch.commit();};
   await dispatchTasks({id:claim.id,tasks:claim.tasks,send:(task,key)=>send(task,config,{deliveryKey:key}),save});
   if(claim.attempts>=3)for(const task of claim.tasks)if(task.status==='failed'&&task.retryable){task.retryable=false;task.message+=' 재시도 한도에 도달했습니다. 관리자에게 문의해 주세요.';}
   await save(claim.tasks);const retry=claim.tasks.some(t=>t.status==='failed'&&t.retryable);const batch=db.batch();batch.update(queueRef,{status:retry?'retry':'done',leaseUntil:Timestamp.fromMillis(0),updated_at:Timestamp.now()});batch.update(jobRef,{leaseUntil:Timestamp.fromMillis(0)});await batch.commit();processed++;
  }catch(error){
   // A write failure after dispatch keeps its lease and audit state for safe recovery.
   if(error.code)throw error;
   if(started)throw Error('알림 기록 처리 오류입니다. 다음 실행에서 중복 없이 확인합니다.');
   const batch=db.batch();batch.update(queueRef,{status:'done',error:'신청 정보 또는 담당자 정보를 확인해 주세요.',leaseUntil:Timestamp.fromMillis(0)});if(ownerKey&&/^[a-f0-9]{64}$/.test(ownerKey))batch.set(db.doc(`applicantCopies/${ownerKey}/notificationReceipts/${queueRef.id}`),{results:[{team:'담당자',channel:'sms',status:'failed',retryable:false,message:error.message}],updated_at:Timestamp.now()});await batch.commit();processed++;
  }
 }
 return {processed,scanned:queues.size};
}
