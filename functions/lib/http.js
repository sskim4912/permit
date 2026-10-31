import {enabledChannels} from './config.js';
import {createHash} from 'node:crypto';
import {defaultTeams,validateTeams} from './directory.js';
import {jobId,validateInput,buildPlan,publicResults,dispatchTasks,sendTask} from './notifications.js';
const hash=value=>createHash('sha256').update(value).digest('hex');
export function createNotifyHandler({db,Timestamp,getConfig,send=sendTask,clock=Date.now}){return async(req,res)=>{

 res.set('Cache-Control','no-store');if(req.method!=='POST'){res.status(405).json({message:'POST 요청만 지원합니다.'});return;}
 try{
  const {ids,ownerKey}=validateInput(req.body),id=jobId(ids),jobRef=db.doc('notificationJobs/'+id),now=clock();
  let config={};try{config=getConfig();}catch(e){/* The per-channel handler reports missing configuration safely. */}
  const channels=enabledChannels(config);
  const meta=await db.doc('settings/contactDirectory').get();const directory=meta.exists?validateTeams((await db.collection('contactTeams').get()).docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>a.order-b.order)):defaultTeams;
  const result=await db.runTransaction(async tx=>{
   const originals=await tx.getAll(...ids.map(value=>db.doc('requests/'+value)));if(originals.some(d=>!d.exists||d.data().owner_key!==ownerKey))throw Error('신청한 브라우저의 본인 신청만 알림을 보낼 수 있습니다.');
   const job=await tx.get(jobRef);if(job.exists){const data=job.data();if(data.ownerHash!==hash(ownerKey))throw Error('알림 조회 권한이 없습니다.');if(data.leaseUntil?.toMillis()>now)return {running:true,tasks:data.tasks};tx.update(jobRef,{leaseUntil:Timestamp.fromMillis(now+300000)});return {tasks:data.tasks};}
   if(originals.some(d=>now-d.data().created.toMillis()>600000))throw Error('신청 후 10분 이내에 알림을 요청해 주세요. 기존 신청을 다시 등록하지 말고 관리자에게 문의해 주세요.');
   const claims=await tx.getAll(...ids.map(value=>db.doc('notificationClaims/'+value)));if(claims.some(d=>d.exists))throw Error('이미 발송을 요청한 신청이 포함되어 있습니다. 중복 발송은 제한됩니다.');
   const limits=[db.doc('notificationLimits/'+hash('owner:'+ownerKey+Math.floor(now/3600000))),db.doc('notificationLimits/'+hash('ip:'+req.ip+Math.floor(now/3600000)))];const snapshots=await tx.getAll(...limits);if(snapshots.some(d=>d.exists&&d.data().count>=30))throw Error('시간당 알림 요청 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.');
   const tasks=buildPlan(originals.map(d=>d.data()),directory).filter(task=>channels.includes(task.channel));tx.set(jobRef,{ownerHash:hash(ownerKey),tasks,createdAt:Timestamp.fromMillis(now),leaseUntil:Timestamp.fromMillis(now+300000)});for(const claim of claims)tx.set(claim.ref,{job:id});for(let i=0;i<limits.length;i++)tx.set(limits[i],{count:(snapshots[i].data()?.count||0)+1,expiresAt:Timestamp.fromMillis(now+7200000)});return {tasks};
  });
  if(result.running){res.json({results:publicResults(result.tasks).map(r=>r.status==='sent'?r:{...r,status:'pending',message:'발송을 처리 중입니다. 잠시 후 다시 확인해 주세요.',retryable:true})});return;}
  const results=await dispatchTasks({id,tasks:result.tasks,send:(task,key)=>send(task,config,{deliveryKey:key}),save:tasks=>jobRef.update({tasks})});await jobRef.update({leaseUntil:Timestamp.fromMillis(0),updatedAt:Timestamp.now()});res.json({results});
 }catch(e){res.status(400).json({message:e.code?'알림 서버 처리 중 오류가 발생했습니다. 잠시 후 다시 확인해 주세요.':e.message||'알림 처리 오류입니다.'});}
};}
