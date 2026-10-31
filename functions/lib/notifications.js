import {createHash,createHmac,randomBytes} from 'node:crypto';
const hash=value=>createHash('sha256').update(value).digest('hex');
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const jobId=ids=>hash([...ids].sort().join(','));
export function validateInput(body){if(!body||!Array.isArray(body.ids)||body.ids.length<1||body.ids.length>10||new Set(body.ids).size!==body.ids.length||body.ids.some(id=>typeof id!=='string'||!/^[A-Za-z0-9]{20}$/.test(id))||typeof body.ownerKey!=='string'||!/^[a-f0-9]{64}$/.test(body.ownerKey))throw Error('신청 정보를 확인해 주세요.');return body;}
export function buildPlan(records,teams){
 const groups=new Map();for(const row of records){const team=teams.find(t=>t.id===row.team_id);if(!team||team.name!==row.team)throw Error('요청팀 담당자 정보가 변경되었거나 등록되지 않았습니다. 관리자에게 확인해 주세요.');if(!groups.has(team.id))groups.set(team.id,{team,rows:[]});groups.get(team.id).rows.push(row);}
 const tasks=[];for(const {team,rows} of groups.values()){
  const subject=`[출입신청] ${team.name} 방문 ${rows.length}명`;
  let text=`${subject}\n신청자: ${rows[0].author_name}\n`+rows.map(r=>`${r.visit_date}${r.visit_end_date!==r.visit_date?'~'+r.visit_end_date:''} ${r.name} / ${r.gate} / ${String(r.purpose).slice(0,60)}`).join('\n')+'\n신청 확인: https://permit-daesan-461e8.web.app';
  while(Buffer.byteLength(text,'utf8')>1800)text=text.slice(0,-1); // SOLAPI LMS limit, using a conservative UTF-8 bound.
  const fields=[['visit_date','방문시작일'],['visit_end_date','방문종료일'],['name','이름'],['birth','생년월일'],['phone','휴대전화'],['plate','차량번호'],['role','탑승 구분'],['purpose','방문목적'],['gate','출입위치'],['lunch','중식']];
  const html=`<div style="font-family:Arial,'Malgun Gothic',sans-serif;color:#234638"><h2>${esc(subject)}</h2><p>안녕하세요. 아래 방문 인원의 현장 출입 승인을 요청드립니다.</p><p>신청자: ${esc(rows[0].author_name)} · 요청팀: ${esc(team.name)}</p><table style="border-collapse:collapse;width:100%;font-size:13px"><thead><tr>${fields.map(([,label])=>`<th style="border:1px solid #cadbd0;padding:9px;background:#eaf3ee">${label}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${fields.map(([key])=>`<td style="border:1px solid #cadbd0;padding:9px;text-align:center">${esc(r[key]||'—')}</td>`).join('')}</tr>`).join('')}</tbody></table><p><a href="https://permit-daesan-461e8.web.app">출입신청 내역 확인</a></p></div>`;
  for(const channel of ['sms','email']){const targets=new Set();for(const contact of team.contacts){const to=channel==='sms'?contact.phone.replace(/\D/g,''):contact.email.toLowerCase();if(targets.has(to))continue;targets.add(to);tasks.push({id:hash(team.id+':'+channel+':'+to).slice(0,24),team:team.name,channel,to,recipient:contact.name,subject,text,html,status:'pending'});}}
 }return tasks;
}
export function publicResults(tasks){return tasks.map(({team,channel,recipient,status,message,retryable})=>({team,channel,recipient:recipient||'',status,message:message||'',retryable:!!retryable}));}
export class DeliveryError extends Error{constructor(message,{uncertain=false,retryable=true}={}){super(message);this.uncertain=uncertain;this.retryable=retryable;}}
export async function sendTask(task,config,{fetchImpl=fetch,deliveryKey}={}){
 let url,headers,body;
 if(task.channel==='sms'){
  if(!config.solapi?.apiKey||!config.solapi?.apiSecret||!/^0\d{8,10}$/.test(String(config.solapi?.from||'').replace(/\D/g,'')))throw new DeliveryError('솔라피 API 키와 등록된 발신번호 설정이 필요합니다.');
  const date=new Date().toISOString(),salt=randomBytes(16).toString('hex'),signature=createHmac('sha256',config.solapi.apiSecret).update(date+salt).digest('hex');
  url='https://api.solapi.com/messages/v4/send-many/detail';headers={Authorization:`HMAC-SHA256 apiKey=${config.solapi.apiKey}, date=${date}, salt=${salt}, signature=${signature}`};body={messages:[{to:task.to,from:config.solapi.from.replace(/\D/g,''),text:task.text,type:'LMS',subject:task.subject.slice(0,35)}]};
 }else{
  const mail=config.microsoft365;
  if(!mail?.tenantId||!mail?.clientId||!mail?.clientSecret||!mail?.sender)throw new DeliveryError('Microsoft 365 발송 계정과 앱 권한 설정이 필요합니다.');
  if(!/^[A-Za-z0-9.-]+$/.test(mail.tenantId))throw new DeliveryError('Microsoft 365 조직 ID를 확인해 주세요.');
  if(!config.graphToken){
   let tokenResponse;try{tokenResponse=await fetchImpl(`https://login.microsoftonline.com/${mail.tenantId}/oauth2/v2.0/token`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'client_credentials',client_id:mail.clientId,client_secret:mail.clientSecret,scope:'https://graph.microsoft.com/.default'}),signal:AbortSignal.timeout(12000)});}catch(e){throw new DeliveryError('Microsoft 365 인증 서버에 연결하지 못했습니다.');}
   if(!tokenResponse.ok)throw new DeliveryError(`Microsoft 365 인증 오류 (HTTP ${tokenResponse.status}). 조직 앱 설정을 확인해 주세요.`);
   const tokenData=await tokenResponse.json();if(!tokenData.access_token)throw new DeliveryError('Microsoft 365 인증 결과를 확인하지 못했습니다.');config.graphToken=tokenData.access_token;
  }
  url=`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mail.sender)}/sendMail`;headers={Authorization:'Bearer '+config.graphToken};body={message:{subject:task.subject,body:{contentType:'HTML',content:task.html},toRecipients:[{emailAddress:{address:task.to}}]},saveToSentItems:true};

 }
 let response;try{response=await fetchImpl(url,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body),signal:AbortSignal.timeout(12000)});}catch(e){throw new DeliveryError('발송 서버 응답을 확인하지 못했습니다.'+' 중복 방지를 위해 발송 내역 확인이 필요합니다.',{uncertain:true,retryable:false});}
 if(!response.ok)throw new DeliveryError(`발송 서비스 오류 (HTTP ${response.status}). 관리자에게 발신 설정을 확인해 주세요.`,{uncertain:response.status>=500,retryable:response.status<500});
 if(task.channel==='email')return response.headers?.get('request-id')||deliveryKey;
 let data;try{data=await response.json();}catch(e){throw new DeliveryError('발송 접수 결과를 확인하지 못했습니다.',{uncertain:true,retryable:false});}
 if(task.channel==='sms'){
  if(data.failedMessageList?.length||data.groupInfo?.count?.registeredFailed>0)throw new DeliveryError('솔라피에서 문자 접수를 거절했습니다. 발신번호·수신번호·잔액을 확인해 주세요.');
  if(!data.groupInfo?._id)throw new DeliveryError('솔라피 접수번호를 확인하지 못했습니다. 발송 내역 확인이 필요합니다.',{uncertain:true,retryable:false});
  return data.groupInfo._id;
 }
 throw new DeliveryError('발송 채널을 확인해 주세요.',{retryable:false});
}
export async function dispatchTasks({id,tasks,send,save}){
 let cursor=0,writing=Promise.resolve();const persist=()=>{const snapshot=structuredClone(tasks);writing=writing.then(()=>save(snapshot));return writing;};
 async function worker(){for(;;){const i=cursor++;if(i>=tasks.length)return;
  const task=tasks[i];if(task.status==='sent'||task.status==='unknown'||(task.status==='failed'&&!task.retryable))continue;
  if(task.status==='sending'){Object.assign(task,{status:'unknown',retryable:false,message:'이전 발송 결과가 확정되지 않았습니다. 발송 내역 확인이 필요합니다.'});await persist();continue;}
  Object.assign(task,{status:'sending',retryable:false});await persist();
  try{const providerId=await send(task,`${id}-${task.id}`);Object.assign(task,{status:'sent',message:'발송 요청이 접수되었습니다.',retryable:false,providerId});}
  catch(e){Object.assign(task,{status:e.uncertain?'unknown':'failed',message:e instanceof DeliveryError?e.message:'발송 처리 오류입니다. 관리자 확인이 필요합니다.',retryable:e instanceof DeliveryError?e.retryable:false});}
  await persist();
 }}await Promise.all([worker(),worker()]);return publicResults(tasks);
}
