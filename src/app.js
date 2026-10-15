import {createPermitAPI} from './firebase-api.js';
const {api} = createPermitAPI();
const $ = id => document.getElementById(id);
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const stages = ['현장 제출','현장 확인','발주처 제출','승인 완료'];
let rows=[], admin=false, filter='', editing=null, adminView=false, pendingAdmin=false, recipient='';
const commonKeys=['visit_date','purpose','team','gate'];

function toast(message) {$('toast').textContent=message;$('toast').style.display='block';setTimeout(()=>{$('toast').style.display='none';},4000);}
async function refresh(){try{admin=(await api('session')).reviewer;rows=[];if(!admin){adminView=false;recipient='';if(editing)openForm();}rows=await api('requests');render();$('updated').textContent='최근 갱신 '+new Date().toLocaleTimeString('ko-KR');}catch(e){rows=[];render();toast(e.message);}}
function render(){updateDraftStatus();const pending=rows.filter(r=>r.status==='현장 제출').length;const approved=rows.filter(r=>r.status==='승인 완료').length;const visitors=rows.filter(r=>r.visit_date===today).length;
$('stats').innerHTML=[['전체 신청',rows.length,'전체 팀의 출입 요청'],['오늘 방문 예정',visitors,'오늘 방문일 기준'],['현장 확인 대기',pending,'담당자 확인이 필요해요'],['승인 완료',approved,'발주처 승인 확인 완료']].map(([label,n,note])=>`<div class="stat"><div class="stat-label">${label}</div><div class="stat-number">${n}<small>명</small></div><div class="stat-note">${note}</div></div>`).join('');
const search=$('search').value.toLowerCase();const source=[...rows,...(!adminView?draftRows():[])];const list=source.filter(r=>(!filter||r.status===filter)&&(!$('dateFilter').value||r.visit_date===$('dateFilter').value)&&[r.team||'',r.purpose||'',r.name||''].some(v=>v.toLowerCase().includes(search)));
$('count').textContent=list.length+'명';$('list').innerHTML=list.length ? list.map(r=>`<tr><td title="${r.id}">${r.localDraft?'임시':r.id.slice(0,6)}</td><td>${escapeHTML(r.visit_date)}</td><td>${escapeHTML(r.team)}</td><td>${r.localDraft||admin?escapeHTML(r.name||'미입력'):'담당자 전용'}</td><td>${escapeHTML(r.purpose)}</td><td><span class="badge b${stages.indexOf(r.status)}">${r.status}</span></td><td>${escapeHTML(r.reviewer||'—')}</td><td>${r.localDraft?`<button data-draft="true">이어서 작성</button>`:admin?`<button data-edit="${r.id}">확인 · 수정</button>`:'—'}</td></tr>`).join('') : '<tr><td colspan="8" class="empty">아직 저장된 신청이 없습니다.<br>위에서 방문자를 입력하고 임시저장 또는 현장제출을 눌러주세요.</td></tr>';
if(adminView && admin){
const columns=[['id','번호'],...definitions.map(([key,label])=>[key,label.replace(' *','')]),['status','진행 상태'],['reviewer','현장 확인자'],['created','등록일시']];
$('listHead').innerHTML='<tr>'+columns.map(([,label])=>'<th>'+escapeHTML(label)+'</th>').join('')+'<th>상세</th></tr>';
let previous='';$('list').innerHTML=list.sort((a,b)=>b.visit_date.localeCompare(a.visit_date)||b.id.localeCompare(a.id)).map(r=>{const heading=previous!==r.visit_date?`<tr><th class="day-group" colspan="${columns.length+1}">${escapeHTML(r.visit_date)} · ${list.filter(x=>x.visit_date===r.visit_date).length}명</th></tr>`:'';previous=r.visit_date;return heading+'<tr>'+columns.map(([key])=>'<td>'+escapeHTML(key==='created'?new Date(r[key]).toLocaleString('ko-KR'):key==='id'?r.id.slice(0,6):r[key])+'</td>').join('')+`<td><button data-edit="${r.id}">확인 · 수정</button></td></tr>`;}).join('')||`<tr><td colspan="${columns.length+1}" class="empty">해당 조건의 신청 내역이 없습니다.</td></tr>`;
const dates=[...new Set(rows.map(r=>r.visit_date))].sort().reverse();$('dateSummary').innerHTML=dates.map(date=>`<button type="button" data-day="${date}">${date} · ${rows.filter(r=>r.visit_date===date).length}명</button>`).join('');
}else{$('listHead').innerHTML='<tr><th>번호</th><th>방문일자</th><th>요청팀</th><th>방문자</th><th>방문목적</th><th>진행 상태</th><th>현장 확인자</th><th>상세</th></tr>';}
$('formDialog').hidden=adminView&&!editing;$('stats').hidden=!adminView;$('new').hidden=adminView;$('adminTools').hidden=!(adminView&&admin);$('adminMenu').classList.toggle('active',adminView);$('overviewMenu').classList.toggle('active',!adminView);
$('login').textContent=admin?'현장 담당자 · 로그아웃':'현장 담당자 로그인 ↗';$('privacy').textContent=admin?'현장 담당자 모드 · 신청 내용을 확인하고 진행 상태를 변경하세요.':'개인정보는 현장 담당자 로그인 후 확인할 수 있습니다.';
}
const definitions=[['visit_date','방문일자 *','date'],['purpose','방문목적 *','text','회의 참석'],['team','요청팀 *','text','안전팀 / 공무팀 / 관리팀'],['gate','출입위치 *',['서문','정문']],['name','이름 *','text','방문자 이름'],['birth','생년월일 *','text',today],['phone','휴대전화번호 *','tel','010-0000-0000'],['plate','차량번호','text','123가4567'],['vehicle_type','차종',['승용','승합']],['vehicle_name','차명','text','캐스퍼'],['role','탑승 구분 *',['운전자','동승자','도보']],['shoes','안전화 (mm) *',['필요없음',...Array.from({length:15},(_,i)=>String(230+i*5))]]];
function formatBirth(value){const digits=value.replace(/\D/g,'').slice(0,8);return [digits.slice(0,4),digits.slice(4,6),digits.slice(6,8)].filter(Boolean).join('-');}
function formatPhone(value){const digits=value.replace(/\D/g,'').slice(0,11);if(digits.length<=3)return digits;if(digits.length<=7)return digits.slice(0,3)+'-'+digits.slice(3);const middle=digits.length===11?7:6;return digits.slice(0,3)+'-'+digits.slice(3,middle)+'-'+digits.slice(middle);}
function formatInput(input){
  const format=input.name==='birth'?formatBirth:formatPhone;
  const position=input.selectionStart??input.value.length;
  const digitsBefore=input.value.slice(0,position).replace(/\D/g,'').length;
  const value=format(input.value);input.value=value;
  let cursor=0,count=0;while(cursor<value.length&&count<digitsBefore){if(/\d/.test(value[cursor]))count++;cursor++;}
  if(value[cursor]==='-')cursor++;input.setSelectionRange(cursor,cursor);
}
function attachFormatting(box){
  for(const input of box.querySelectorAll('[name="birth"],[name="phone"]')){
    input.value=(input.name==='birth'?formatBirth:formatPhone)(input.value);
    input.inputMode='numeric';input.maxLength=input.name==='birth'?10:13;
    input.addEventListener('input',()=>formatInput(input));
    input.addEventListener('keydown',event=>{const start=input.selectionStart;if(event.key==='Backspace'&&start===input.selectionEnd&&start>0&&input.value[start-1]==='-')input.setSelectionRange(Math.max(0,start-2),start);});
  }
}
function collectPeople(){const common=Object.fromEntries([...$('commonFields').querySelectorAll('[name]')].map(input=>[input.name,input.value.trim()]));return [...$('people').querySelectorAll('.person')].map(box=>({...common,...Object.fromEntries([...box.querySelectorAll('[name]')].map(input=>[input.name,input.value.trim()]))}));}
function savedDraft(){const value=JSON.parse(sessionStorage.getItem('permit-draft')||'null');return Array.isArray(value)?value:[];}
function draftRows(){try{return savedDraft().map((item,index)=>({...item,id:'draft-'+index,localDraft:true,status:'작성 중',reviewer:'',visit_date:item.visit_date||'',purpose:item.purpose||'',team:item.team||''}));}catch(e){return [];}}

function updateDraftStatus(){try{const saved=savedDraft();$('draftStatus').textContent=saved.length?`이 탭에 임시 저장된 신청이 있습니다. (방문자 ${saved.length}명) 아래 작성 중 목록에서 이어서 작성할 수 있습니다.`:'이 탭에 임시 저장된 신청이 없습니다.';}catch(e){$('draftStatus').textContent='임시저장 상태를 확인할 수 없습니다. 브라우저 저장소 설정을 확인해 주세요.';}}
function clearErrors(){for(const input of $('requestForm').querySelectorAll('[aria-invalid]'))input.removeAttribute('aria-invalid');$('formError').textContent='';$('draftMessage').textContent='';updateDraftStatus();}
function fieldError(input,message){$('formError').textContent=message;input.setAttribute('aria-invalid','true');input.focus();input.scrollIntoView?.({block:'nearest',behavior:'smooth'});return false;}
function validateForm(){
  clearErrors();
  for(const [key,label] of definitions.filter(([key])=>commonKeys.includes(key))){const input=$('commonFields').querySelector(`[name="${key}"]`);if(input.required&&!input.value.trim())return fieldError(input,label.replace(' *','')+'을(를) 입력해 주세요.');}
  const boxes=[...$('people').querySelectorAll('.person')];
  for(let index=0;index<boxes.length;index++){
    const box=boxes[index],prefix=`방문자 ${index+1}: `;
    for(const [key,label] of definitions.filter(([key])=>!commonKeys.includes(key))){const input=box.querySelector(`[name="${key}"]`);if(input.required&&!input.value.trim())return fieldError(input,prefix+label.replace(' *','')+'을(를) 입력해 주세요.');}
    const birth=box.querySelector('[name="birth"]');birth.value=formatBirth(birth.value);
    const visit=box.querySelector('[name="visit_date"]')||$('commonFields').querySelector('[name="visit_date"]');
    for(const [input,label] of [[visit,'방문일자'],[birth,'생년월일']]){
      const value=input.value,date=new Date(value);
      if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number.isNaN(date.getTime())||date.toISOString().slice(0,10)!==value)return fieldError(input,prefix+label+'을(를) 실제 날짜로 입력해 주세요. 예: 1990-01-23');
    }
    if(birth.value>today)return fieldError(birth,prefix+'생년월일은 오늘 이후일 수 없습니다.');
    const phone=box.querySelector('[name="phone"]');phone.value=formatPhone(phone.value);
    if(!/^01[016789]-[0-9]{3,4}-[0-9]{4}$/.test(phone.value))return fieldError(phone,prefix+'휴대전화번호를 확인해 주세요. 예: 010-1234-5678');
  }
  if(editing&&!$('reviewer').value.trim())return fieldError($('reviewer'),'현장 확인자 이름을 입력해 주세요.');
  return true;
}
function inputMarkup([key,label,type,hint],item={}){
  const value=item[key]??(key==='visit_date'?today:'');
  const control=Array.isArray(type)?`<select name="${key}" aria-label="${label.replace(' *','')}">${type.map(v=>`<option value="${v}" ${value===v?'selected':''}>${v}${key==='shoes'&&v!=='필요없음'?'mm':''}</option>`).join('')}</select>`:`<input name="${key}" aria-label="${label.replace(' *','')}" type="${type}" ${label.includes('*')?'required':''} maxlength="200" placeholder="${hint||''}" value="${escapeHTML(value)}">`;
  return `<label class="field-${key}"><span>${label}</span>${control}</label>`;
}
function setCommon(item={}){$('commonFields').innerHTML=definitions.filter(([key])=>commonKeys.includes(key)).map(def=>inputMarkup(def,item)).join('');}
function restoreDraft(){
  try{const saved=savedDraft();if(!saved.length){$('draftMessage').textContent='이 탭에 임시 저장된 신청이 없습니다.';return;}
    // Old drafts could use different shared fields per visitor; preserve them for editing.
    openForm();setCommon(saved[0]);$('people').innerHTML='';saved.forEach(item=>addPerson(item,true));clearErrors();$('draftMessage').textContent=`임시 저장된 방문자 ${saved.length}명을 불러왔습니다.`;
    $('formDialog').scrollIntoView?.({behavior:'smooth',block:'start'});
  }catch(e){$('formError').textContent='임시 저장을 불러오지 못했습니다. 브라우저 저장소 설정을 확인해 주세요.';}
}
function addPerson(item={},preserveCommon=false){
  if($('people').children.length>=10){toast('한 번에 10명까지 제출할 수 있습니다.');return;}
  const box=document.createElement('section');box.className='person';
  box.innerHTML=definitions.filter(([key])=>!commonKeys.includes(key)).map(def=>inputMarkup(def,item)).join('')+'<button type="button" class="remove" aria-label="방문자 행 삭제">×</button>';
  if(preserveCommon){const differences=commonKeys.filter(key=>item[key]!==undefined&&item[key]!==$('commonFields').querySelector(`[name="${key}"]`).value);if(differences.length){const extra=document.createElement('div');extra.className='legacy-common';extra.innerHTML='<small>이전 저장본의 개별 방문 정보</small>'+definitions.filter(([key])=>differences.includes(key)).map(def=>inputMarkup(def,item)).join('');box.append(extra);}}
  const pair=document.createElement('div');pair.className='vehicle-pair';const vehicleType=box.querySelector('.field-vehicle_type');vehicleType.before(pair);pair.append(vehicleType,box.querySelector('.field-vehicle_name'));box.querySelector('.remove').onclick=()=>{if($('people').children.length>1)box.remove();else toast('방문자 한 명 이상이 필요합니다.');};$('people').append(box);attachFormatting(box);
}
function openForm(item=null){editing=item;setCommon(item||{});$('people').innerHTML='';addPerson(item||{});$('add').hidden=!!item;$('draft').hidden=!!item;$('loadDraft').hidden=!!item;$('reviewFields').hidden=!item;$('editingLabel').hidden=!item;$('reviewer').required=!!item;$('reviewer').value=item?.reviewer||'';$('status').value=item?.status||'현장 제출';$('formTitle').textContent=item?'신청 확인 및 수정':'출입 신청 작성';$('submit').textContent=item?'변경사항 저장':'현장제출 →';clearErrors();$('formDialog').hidden=false;}
function formItem(){return collectPeople()[0];}
$('new').onclick=()=>{openForm();try{const saved=JSON.parse(sessionStorage.getItem('permit-draft')||'null');if(saved?.length&&confirm('이 탭에 임시 저장한 신청을 불러올까요?')){restoreDraft();}}catch(e){toast('임시 저장을 불러올 수 없습니다. 새로 작성해 주세요.');}};$('add').onclick=()=>addPerson();$('refresh').onclick=refresh;
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
$('tabs').onclick=e=>{if(!e.target.matches('[data-status]'))return;filter=e.target.dataset.status;document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('selected',b===e.target));render();};
$('search').oninput=render;$('dateFilter').onchange=render;
$('list').onclick=e=>{if(e.target.closest('[data-draft]')){if(confirm('임시 저장한 내용을 불러올까요?'))restoreDraft();return;}const button=e.target.closest('[data-edit]');if(button){openForm(rows.find(r=>r.id===button.dataset.edit));$('formDialog').scrollIntoView?.({behavior:'smooth',block:'start'});}};
$('login').onclick=async()=>{if(admin){await api('logout',{});admin=false;rows=[];adminView=false;if(editing)openForm();render();await refresh();toast('로그아웃했습니다.');}else{$('password').value='';$('loginError').textContent='';$('loginDialog').showModal();}};
$('loginForm').onsubmit=async e=>{e.preventDefault();try{await api('login',{password:$('password').value});admin=true;$('password').value='';$('loginDialog').close();if(pendingAdmin){adminView=true;pendingAdmin=false;await loadSettings();}await refresh();toast('로그인했습니다.');}catch(err){$('loginError').textContent=err.message;}};
$('requestForm').onsubmit=async e=>{e.preventDefault();if(!validateForm())return;$('submit').disabled=true;try{if(editing){await api('update',{...formItem(),id:editing.id,version:editing.version,reviewer:$('reviewer').value,status:$('status').value});}else{const items=collectPeople();await api('requests',{items});sessionStorage.removeItem('permit-draft');} const wasEditing=!!editing;if(!wasEditing){filter='현장 제출';$('dateFilter').value='';$('search').value='';document.querySelectorAll('.tab').forEach(button=>button.classList.toggle('selected',button.dataset.status===filter));}openForm();toast(wasEditing?'변경사항을 저장했습니다.':'현장 제출이 완료되었습니다.');await refresh();}catch(err){$('formError').textContent=err.message;}finally{$('submit').disabled=false;}};
$('delete').onclick=async()=>{if(!confirm('이 신청을 삭제할까요? 삭제 후 복구할 수 없습니다.'))return;try{await api('update',{id:editing.id,version:editing.version,action:'delete',reviewer:$('reviewer').value});openForm();await refresh();toast('삭제했습니다.');}catch(err){$('formError').textContent=err.message;}};
$('email').onclick=async()=>{try{recipient=(await api('settings')).recipient;}catch(e){toast(e.message);return;}if(!recipient){toast('관리자 화면에서 수신 이메일을 먼저 저장해 주세요.');return;}const item=formItem();const body='출입 승인 요청드립니다.\n\n'+definitions.map(([key,label])=>label.replace(' *','')+': '+item[key]).join('\n')+'\n현장 확인자: '+$('reviewer').value;location.href='mailto:'+encodeURIComponent(recipient)+'?subject='+encodeURIComponent('[출입 승인 요청] '+item.visit_date+' '+item.name)+'&body='+encodeURIComponent(body);toast('메일 앱에서 수신자를 확인하고 전송해 주세요.');};
openForm();
(async()=>{try{admin=(await api('session')).reviewer;await refresh();}catch(e){toast(e.message);}})();setInterval(refresh,30000);

$('draft').onclick=()=>{clearErrors();try{const items=collectPeople();sessionStorage.setItem('permit-draft',JSON.stringify(items));filter='작성 중';$('dateFilter').value='';$('search').value='';document.querySelectorAll('.tab').forEach(button=>button.classList.toggle('selected',button.dataset.status===filter));$('draftMessage').textContent=`방문자 ${items.length}명 임시 저장 완료. 빈칸이 있어도 저장됩니다. 이 탭에서 다시 불러올 수 있으며, 현장에는 아직 제출되지 않았습니다.`;render();$('draft').textContent='임시 저장 완료 ✓';setTimeout(()=>{$('draft').textContent='임시 저장';},2500);}catch(e){$('formError').textContent='임시 저장에 실패했습니다. 브라우저에서 사이트 저장소를 허용해 주세요.';}};
$('loadDraft').onclick=()=>{if(confirm('현재 입력 내용을 임시 저장본으로 바꿀까요?'))restoreDraft();};
$('requestForm').addEventListener('input',event=>{event.target.removeAttribute('aria-invalid');$('formError').textContent='';$('draftMessage').textContent='';$('draft').textContent='임시 저장';});


async function loadSettings(){try{recipient=(await api('settings')).recipient;$('recipient').value=recipient;}catch(e){toast(e.message);}}
$('adminMenu').onclick=async()=>{if(!admin){pendingAdmin=true;$('password').value='';$('loginError').textContent='';$('loginDialog').showModal();return;}adminView=true;await loadSettings();render();};
$('overviewMenu').onclick=()=>{adminView=false;pendingAdmin=false;render();};
$('allDates').onclick=()=>{$('dateFilter').value='';render();};
$('dateSummary').onclick=e=>{const button=e.target.closest('[data-day]');if(button){$('dateFilter').value=button.dataset.day;render();}};
$('settingsForm').onsubmit=async e=>{e.preventDefault();try{recipient=(await api('settings',{recipient:$('recipient').value})).recipient;$('settingsMessage').textContent='저장했습니다. 이후 제출 메일에 적용됩니다.';}catch(err){$('settingsMessage').textContent=err.message;}};
$('download').onclick=async()=>{try{if(!(await api('session')).reviewer)throw Error('관리자 로그인이 필요합니다.');const source=await api('requests');const selected=source.filter(r=>(!filter||r.status===filter)&&(!$('dateFilter').value||r.visit_date===$('dateFilter').value)&&[r.team,r.purpose,r.name||''].some(v=>v.toLowerCase().includes($('search').value.toLowerCase()))).sort((a,b)=>b.visit_date.localeCompare(a.visit_date)||b.id.localeCompare(a.id));if(!selected.length){toast('다운로드할 내역이 없습니다.');return;}const columns=[['id','번호'],...definitions.map(([key,label])=>[key,label.replace(' *','')]),['status','진행 상태'],['reviewer','현장 확인자'],['created','등록일시']];const cell=value=>{let text=String(value??'');if(/^[\s]*[=+@-]/.test(text)||/^[\t\r\n]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};const csv='\uFEFF'+[columns.map(([,label])=>cell(label)).join(','),...selected.map(row=>columns.map(([key])=>cell(row[key])).join(','))].join('\r\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download='출입신청_'+($('dateFilter').value||'전체일자')+'.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast(selected.length+'명 내역을 다운로드했습니다.');}catch(e){toast(e.message);}};
