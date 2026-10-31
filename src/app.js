import {createDirectoryUI,defaultTeams,teamLabel} from './directory-ui.js';
import {buildMailDocument,buildDraftEmail} from './mail-document.js';
import {composeMailto} from './mail-recipients.js';
import {createPermitAPI} from './firebase-api.js';
const {api} = createPermitAPI();
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
let directoryTeams=structuredClone(defaultTeams),pendingNotificationIds=[];
const fields = [
 ['visit_date','방문시작일','date'],['visit_end_date','방문종료일','date'],['purpose','방문목적','text','회의 참석'],['team','요청팀','text','안전팀 / 공무팀 / 관리팀'],['gate','출입위치',['서문','정문']],
 ['name','이름','text','방문자 이름'],['birth','생년월일','text',today],['phone','휴대전화','tel','010-0000-0000'],['plate','차량번호','text','123가0000'],
 ['vehicle_type','차종',['승용','승합']],['vehicle_name','차명','text','차명 입력'],['role','탑승 구분',['운전자','동승자','도보']],['shoes','안전화',['필요없음',...Array.from({length:15},(_,i)=>String(230+i*5))]],['lunch','식사신청(중식)',['','중식신청','미신청']]];
const required = new Set(['visit_date','visit_end_date','purpose','team','name','birth','phone','lunch']);
let admin=false, rows=[], editing=null, busy=false, timer=null, refreshId=0, recipient='', mailItems=[], mailDocument=null, toastTimer;
const selected=new Map();
const canEdit=row=>admin||(row?.own&&['승인 대기','현장 제출'].includes(row.status)&&!row.delivery_at);
const selectionLimit=()=>admin?10:5;
const hasOwn=()=>rows.some(row=>row.own);
const columnCount=()=>14;
const statusLabel=row=>row.status==='승인 완료'?'승인 완료':'승인 대기';
const deliveryLabel=row=>row.delivery_at?new Date(row.delivery_at).toLocaleString('ko-KR',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):row.status==='발주처 제출'?'기존 전달 기록':'전달 전';
function toast(message){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').style.display='block';toastTimer=setTimeout(()=>{$('toast').style.display='none';},4000);}
function formatBirth(value){const d=value.replace(/\D/g,'').slice(0,8);return [d.slice(0,4),d.slice(4,6),d.slice(6,8)].filter(Boolean).join('-');}
function formatPhone(value){const d=value.replace(/\D/g,'').slice(0,11);if(d.length<=3)return d;if(d.length<=7)return d.slice(0,3)+'-'+d.slice(3);const split=d.length===11?7:6;return d.slice(0,3)+'-'+d.slice(3,split)+'-'+d.slice(split);}
function formatInput(input){const pos=input.selectionStart??input.value.length,digits=input.value.slice(0,pos).replace(/\D/g,'').length;input.value=(input.name==='birth'?formatBirth:formatPhone)(input.value);let cursor=0,count=0;while(cursor<input.value.length&&count<digits){if(/\d/.test(input.value[cursor]))count++;cursor++;}if(input.value[cursor]==='-')cursor++;input.setSelectionRange(cursor,cursor);}
function markup([key,label,type,hint],item){const value=item[key]??(key==='visit_end_date'?(item.visit_date??today):key==='visit_date'?today:'');let control;if(key==='team'){const known=directoryTeams.some(t=>t.name===value);control=`<select name="team" aria-label="요청팀" required><option value="">팀 선택</option>${value&&!known?`<option selected value="${esc(value)}">기존: ${esc(value)}</option>`:''}${directoryTeams.map(t=>`<option value="${esc(t.name)}" data-team-id="${esc(t.id)}" ${t.name===value?'selected':''}>${esc(teamLabel(t))}</option>`).join('')}</select>`;}else if(Array.isArray(type)){const legacy=value&&!type.includes(value)?`<option selected disabled value="${esc(value)}">기존값: ${esc(value)}</option>`:'';control=`<select name="${key}" aria-label="${label}" ${required.has(key)?'required':''}>${legacy}${type.map(v=>`<option value="${v}" ${v===value?'selected':''}>${key==='lunch'?(v===''?'선택해 주세요':v==='중식신청'?'중식 신청':'미신청'):key==='gate'&&v==='정문'?'정문 [VIP]':v}${key==='shoes'&&v!=='필요없음'?'mm':''}</option>`).join('')}</select>`;}else control=`<input name="${key}" type="${type}" aria-label="${label}" ${required.has(key)?'required':''} maxlength="200" placeholder="${hint||''}" value="${esc(value)}">`;return `<label><span>${label}${required.has(key)?' *':''}</span>${control}${key==='lunch'?'<small class="meal-hint">중식 신청 / 미신청 중 선택</small>':''}</label>`;}
function renumber(){[...$('people').children].forEach((box,index)=>box.querySelector('.person-title b').textContent='방문자 '+(index+1));}
function addPerson(item={},save=false){if($('people').children.length>=10){toast('한 번에 10명까지 신청할 수 있습니다.');return;}const box=document.createElement('section');box.className='person';box.innerHTML='<div class="person-title"><b></b><button type="button" aria-label="방문자 삭제">×</button></div><div class="person-fields">'+fields.map(field=>markup(field,item)).join('')+'</div>';
 for(const input of box.querySelectorAll('[name="birth"],[name="phone"]')){input.value=(input.name==='birth'?formatBirth:formatPhone)(input.value);input.inputMode='numeric';input.maxLength=input.name==='birth'?10:13;input.addEventListener('input',()=>formatInput(input));input.addEventListener('keydown',event=>{const pos=input.selectionStart;if(event.key==='Backspace'&&pos===input.selectionEnd&&pos>0&&input.value[pos-1]==='-')input.setSelectionRange(Math.max(0,pos-2),pos);});}
 const start=box.querySelector('[name="visit_date"]'),end=box.querySelector('[name="visit_end_date"]');let previousStart=start.value;end.min=start.value;start.addEventListener('change',()=>{if(end.value===previousStart)end.value=start.value;end.min=start.value;previousStart=start.value;});
 box.querySelector('button').onclick=()=>{if(editing)return;if($('people').children.length===1){toast('방문자 한 명 이상이 필요합니다.');return;}box.remove();renumber();saveDraft();};$('people').append(box);renumber();if(save)saveDraft();}
function collect(){return [...$('people').children].map(box=>{const item=Object.fromEntries([...box.querySelectorAll('[name]')].map(input=>[input.name,input.value.trim()]));const id=box.querySelector('[name=team]')?.selectedOptions[0]?.dataset.teamId;if(id)item.team_id=id;return item;});}
function setPeople(items){$('people').innerHTML='';(items.length?items:[{}]).forEach(item=>addPerson(item));}
function saveDraft(){clearTimeout(timer);if(editing)return;try{sessionStorage.setItem('permit-author-draft',$('authorName').value);const items=collect(),meaningful=items.some(item=>['purpose','team','name','birth','phone','plate','vehicle_name'].some(key=>item[key])||item.visit_date!==today||item.visit_end_date!==item.visit_date);if(meaningful){sessionStorage.setItem('permit-draft',JSON.stringify(items));$('draftStatus').textContent='✓ 입력 내용 자동 임시저장됨 · 이 탭에서 이어서 작성';}else{sessionStorage.removeItem('permit-draft');$('draftStatus').textContent='입력하면 이 탭에 자동 임시저장됩니다.';}}catch(e){$('draftStatus').textContent='자동 임시저장 불가 · 현재 입력은 유지됩니다. 브라우저 저장소를 허용해 주세요.';}}
function restoreDraft(){try{$('authorName').value=sessionStorage.getItem('permit-author-draft')||'';const stored=JSON.parse(sessionStorage.getItem('permit-draft')||'[]');if(!Array.isArray(stored)||stored.length>10||stored.some(item=>!item||typeof item!=='object'))throw Error();setPeople(stored);$('draftStatus').textContent=stored.length?'✓ 이 탭에 자동 임시저장된 내용을 복원했습니다.':'입력하면 이 탭에 자동 임시저장됩니다.';}catch(e){setPeople([]);$('draftStatus').textContent='이전 임시저장을 읽지 못했습니다. 새 입력은 작성할 수 있습니다.';}}
function fieldError(input,message){$('formError').textContent=message;input.setAttribute('aria-invalid','true');input.focus();input.scrollIntoView?.({block:'nearest'});return false;}
function reviewerName(){const value=$('reviewer').value.trim();if(!value||value.length>50){$('adminError').textContent=(admin?'실제 수정·삭제·처리하는 분의 이름을 입력해 주세요.':'수정·삭제하는 분의 이름 칸에 최초 작성자 이름을 입력한 뒤 수정 버튼을 눌러 주세요.');$('reviewer').focus();return null;}return value;}
function actionActor(items,errorTarget=$('adminError')){
 if(!admin){if(items.some(row=>!row.own||!row.author_name)){errorTarget.textContent='신청한 브라우저의 본인 신청만 관리할 수 있습니다.';return null;}return items[0]?.author_name||null;}
 const name=reviewerName();if(!name){errorTarget.textContent=$('adminError').textContent;return null;}errorTarget.textContent='';return name;
}
function validate(){ $('formError').textContent='';if(!editing&&(!$('authorName').value.trim()||$('authorName').value.trim().length>50))return fieldError($('authorName'),'작성자 이름을 50자 이내로 입력해 주세요.');$('requestForm').querySelectorAll('[aria-invalid]').forEach(input=>input.removeAttribute('aria-invalid'));
 for(const [index,box] of [...$('people').children].entries()){const prefix=`방문자 ${index+1}: `;for(const [key,label] of fields){const input=box.querySelector(`[name="${key}"]`);if(required.has(key)&&!input.value.trim())return fieldError(input,prefix+label+'을(를) 입력해 주세요.');}
 const birth=box.querySelector('[name="birth"]'),phone=box.querySelector('[name="phone"]');birth.value=formatBirth(birth.value);phone.value=formatPhone(phone.value);
 for(const [input,label] of [[box.querySelector('[name="visit_date"]'),'방문시작일'],[box.querySelector('[name="visit_end_date"]'),'방문종료일'],[birth,'생년월일']]){const value=input.value,date=new Date(value);if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number.isNaN(date.getTime())||date.toISOString().slice(0,10)!==value)return fieldError(input,prefix+label+'을(를) 실제 날짜로 입력해 주세요.');}
 const start=box.querySelector('[name="visit_date"]'),end=box.querySelector('[name="visit_end_date"]');if(end.value<start.value)return fieldError(end,prefix+'방문종료일은 방문시작일과 같거나 이후여야 합니다.');
 if(birth.value>today)return fieldError(birth,prefix+'생년월일은 오늘 이후일 수 없습니다.');if(!/^01[016789]-\d{3,4}-\d{4}$/.test(phone.value))return fieldError(phone,prefix+'휴대전화번호를 확인해 주세요. 예: 010-0000-0000');}
 if(!editing){for(const box of $('people').children){const input=box.querySelector('[name=team]');if(!input.selectedOptions[0]?.dataset.teamId)return fieldError(input,'요청팀을 목록에서 선택해 주세요.');}}
 if(editing&&!actionActor([editing],$('formError')))return false;return true;}
const endDate=row=>row.visit_end_date??row.visit_date;
const visitPeriod=row=>row.visit_date===endDate(row)?row.visit_date:row.visit_date+' ~ '+endDate(row);
let weekOffset=0,allWeeks=false;
function weekRange(){const d=new Date(today+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7)+weekOffset*7);const start=d.toISOString().slice(0,10);d.setUTCDate(d.getUTCDate()+6);return [start,d.toISOString().slice(0,10)];}
function renderWeek(){
 const [start,end]=weekRange();$('weekLabel').textContent=allWeeks?'기간 제한 없음':start+' ~ '+end;
 const active=allWeeks?'weekAll':weekOffset===0?'weekCurrent':weekOffset<0?'weekPrev':'weekNext';
 for(const id of ['weekPrev','weekCurrent','weekNext','weekAll']){$(id).classList.toggle('is-active',id===active);$(id).setAttribute('aria-pressed',String(id===active));}
}
function setWeekFor(value){const monday=value=>{const d=new Date(value+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return d.getTime();};weekOffset=Math.round((monday(value)-monday(today))/604800000);allWeeks=false;}
function matchesFilters(row){const [start,end]=weekRange();return (allWeeks||(row.visit_date<=end&&endDate(row)>=start))&&(!$('statusFilter').value||statusLabel(row)===$('statusFilter').value)&&(!$('dateFilter').value||(row.visit_date<=$('dateFilter').value&&endDate(row)>=$('dateFilter').value))&&[row.name||'',row.team,row.purpose,row.author_name||'',row.plate||''].some(value=>value.toLowerCase().includes($('search').value.toLowerCase()));}
let sortField='visit_date',sortDirection='desc';
const approvalSortLabels={gaisu_requested:'신청',gaisu_approved:'승인',final_approved:'최종승인'};
const approvalDone=(row,key)=>!!row[key]||(key==='final_approved'&&row.status==='승인 완료');
const nameCollator=new Intl.Collator('ko',{numeric:true,sensitivity:'base'});
function sortRows(data){return data.sort((a,b)=>{
 const primary=sortField in approvalSortLabels?(Number(approvalDone(a,sortField))-Number(approvalDone(b,sortField))||String(a[sortField]?.at||'').localeCompare(String(b[sortField]?.at||''))):sortField!=='visit_date'?nameCollator.compare(a[sortField]||'',b[sortField]||''):(a.visit_date||'').localeCompare(b.visit_date||'');
 return primary*(sortDirection==='asc'?1:-1)||(b.created||'').localeCompare(a.created||'')||String(a.id).localeCompare(String(b.id));
});}
function visibleRows(){return sortRows(rows.filter(matchesFilters));}
function renderSort(){
 for(const button of document.querySelectorAll('[data-sort]')){
  const field=button.dataset.sort,active=field===sortField,label=approvalSortLabels[field]?(button.closest('.mobile-sort')&&field!=='final_approved'?'가이수 ':'')+approvalSortLabels[field]:{name:'이름',gate:'출입위치',lunch:'식사신청(중식)',visit_date:'출입날짜'}[field];
  button.textContent=label+' '+(active?(sortDirection==='asc'?'▲':'▼'):'↕');button.classList.toggle('is-active',active);
  button.setAttribute('aria-label',(field in approvalSortLabels&&field!=='final_approved'?'가이수 '+approvalSortLabels[field]:label)+' '+(active&&sortDirection==='asc'?'내림차순':'오름차순')+'으로 정렬');
 }
 for(const heading of document.querySelectorAll('[data-sort-heading]'))heading.setAttribute('aria-sort',heading.dataset.sortHeading===sortField?(sortDirection==='asc'?'ascending':'descending'):'none');
}
function updateSelection(){
 document.querySelectorAll('#list [data-select]').forEach(input=>input.disabled=busy);const count=selected.size;$('selectedCount').textContent=count+'명 선택 · 최대 '+selectionLimit()+'명';
 for(const id of ['mail','approve','delete'])$(id).disabled=busy||!count||(id!=='delete'&&!admin);
 const eligible=visibleRows().filter(canEdit),visibleSelected=eligible.filter(row=>selected.has(row.id));
 $('selectAll').hidden=!(admin||hasOwn());$('selectAll').disabled=busy||!eligible.length;$('selectAll').checked=eligible.length>0&&visibleSelected.length===eligible.length;$('selectAll').indeterminate=visibleSelected.length>0&&!$('selectAll').checked;
 $('selectAll').setAttribute('aria-label','현재 명단 선택 또는 해제 (최대 '+selectionLimit()+'명)');
}

function attachEditor(){if(!editing)return;const row=[...$('list').querySelectorAll('[data-record]')].find(row=>row.dataset.record===editing.id);if(!row)return;const tr=document.createElement('tr');tr.className='inline-editor-row';const cell=document.createElement('td');cell.colSpan=columnCount();tr.append(cell);row.after(tr);cell.append($('requestPanel'));$('requestPanel').classList.add('inline-editor');}
const approvalStages=[['gaisu_requested','가이수 신청'],['gaisu_approved','가이수 승인'],['final_approved','최종 승인']];
function approvalCell(row,key,label){
 const record=row[key],done=approvalDone(row,key);
 const allowed=admin||(row.own&&key!=='final_approved'&&row.status!=='승인 완료'&&!row.final_approved);
 const stamp=record?`<strong>${esc(record.by)}</strong><time>${esc(new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(record.at?.toDate?.()||record.at)))}</time>`:done?'<small>기존 승인 기록</small>':'<small>미처리</small>';
 return `<td data-label="${label}" class="approval-cell"><div class="approval-record"><input type="checkbox" data-approval="${key}" data-id="${esc(row.id)}" aria-label="${esc(row.name||'신청')} ${label}" ${done?'checked':''} ${!allowed||done||busy?'disabled':''}><span>${stamp}</span></div></td>`;
}
async function processApproval(checkbox){
 const row=rows.find(r=>r.id===checkbox.dataset.id),stage=checkbox.dataset.approval,label=approvalStages.find(([key])=>key===stage)?.[1];checkbox.checked=false;
 if(!row||busy||row[stage]||(!admin&&(!row.own||stage==='final_approved')))return;
 const actor=admin?reviewerName():row.author_name;if(!actor){toast($('adminError').textContent||'최초 신청자 정보가 없는 신청은 관리자에게 요청해 주세요.');return;}
 if(!confirm(`${row.name||'선택한 신청'}의 ${label}을 처리할까요? 처리자 이름과 현재 시각을 기록하며 체크한 기록은 유지됩니다.`))return;
 busy=true;render();
 try{await api('approval',{id:row.id,version:row.version,stage,...(admin?{reviewer:actor}:{})});selected.delete(row.id);if(editing?.id===row.id)closeEditor();toast(label+' 처리 완료');await refresh();}
 catch(e){$('adminError').textContent=e.message;toast(e.message);}finally{busy=false;render();}
}
function render(){directoryUI.setAdmin(admin);const focused=$('requestPanel').contains(document.activeElement)?document.activeElement:null;if($('requestPanel').closest('#list'))$('formHome').append($('requestPanel'));
 renderWeek();renderSort();const managed=admin||hasOwn();document.body.classList.toggle('admin-mode',managed);$('adminControls').hidden=!managed;$('mail').hidden=!admin;$('approve').hidden=!admin;$('ownerHelp').hidden=managed;$('authorLine').hidden=!!editing;$('processorLabel').textContent='관리자 담당자 이름';$('modeHint').textContent=admin?'관리자 담당자 이름으로 수정·삭제·발주처 제출을 처리합니다.':'같은 브라우저의 본인 신청은 이름을 다시 입력하지 않고 수정·삭제할 수 있습니다. (최대 5명 선택)';$('adminSettings').hidden=!admin;$('applicantDownload').hidden=true;$('adminActor').hidden=!admin;document.querySelectorAll('.admin-only').forEach(element=>element.hidden=!admin);$('loginLabel').textContent=admin?'관리자 모드 · 로그아웃':'관리자 접속';
 const list=visibleRows();if(editing&&!list.some(row=>row.id===editing.id))list.unshift(editing);$('count').textContent=list.length+'명';
 const cell=(label,value,cls='')=>`<td data-label="${label}" class="${cls}">${value}</td>`;
 $('list').innerHTML=list.length?list.map((row,index)=>{
 const personal=admin||row.own, value=key=>key==='birth'&&!personal?esc(row.birth_mask||'****-**-**'):esc(row[key]||'—');
 const actions=canEdit(row)?`<div class="row-actions"><button type="button" class="edit-button" data-edit="${esc(row.id)}">수정</button><button type="button" class="row-delete danger" data-delete="${esc(row.id)}">삭제</button></div>`:`<small class="action-help">${row.own?'전달·승인 후에는 관리자에게 문의':'본인 신청만 가능'}</small>`;
 return `<tr data-record="${esc(row.id)}" class="${selected.has(row.id)?'selected':''}">${cell('순번',`<span class="number-choice"><span>${index+1}</span>${canEdit(row)?`<input type="checkbox" data-select="${esc(row.id)}" aria-label="${esc(row.name||'신청')} 선택" ${selected.has(row.id)?'checked':''}>`:''}</span>`,'number-cell')}${cell('출입날짜',esc(visitPeriod(row)))}${cell('이름',value('name')+`<details class="record-info"><summary>상세·관리</summary><div>요청팀: ${esc(row.team)}<br>목적: ${esc(row.purpose)}${personal?'<br>위치: '+esc(row.gate)+'<br>최초 신청자: '+esc(row.author_name||'기존 신청')+(row.modified_by?'<br>최근 수정: '+esc(row.modified_by)+' · '+esc(new Date(row.modified_at).toLocaleString('ko-KR')):''):''}${admin?'<br>발주처 전달: '+esc(deliveryLabel(row)):''}</div>${actions}</details>`)}${cell('생년월일',value('birth'))}${cell('휴대전화번호',value('phone'))}${cell('차량번호',value('plate'))}${cell('차종',value('vehicle_type'))}${cell('운전자 해당여부',value('role'))}${cell('방문목적',esc(row.purpose||'—'))}${cell('출입위치',esc(row.gate||'—'))}${approvalStages.map(([key,label])=>approvalCell(row,key,label)).join('')}${cell('식사신청(중식) 여부',esc(row.lunch||'미선택(기존 신청)'))}</tr>`;
 }).join(''):`<tr><td class="empty" colspan="14">해당 조건의 신청이 없습니다.</td></tr>`;
 attachEditor();if(editing&&focused)focused.focus({preventScroll:true});updateSelection();}
async function refresh(){const sequence=++refreshId;try{const session=await api('session');if(sequence!==refreshId)return;const wasAdmin=admin;admin=session.reviewer;if(wasAdmin&&!admin){selected.clear();if(editing)closeEditor();clearMail();}const data=await api('requests');if(sequence!==refreshId)return;rows=data;render();$('updated').textContent='최근 갱신 '+new Date().toLocaleTimeString('ko-KR');$('loadError').textContent='';}catch(e){if(sequence!==refreshId)return;rows=[];render();$('loadError').textContent='목록을 불러오지 못했습니다. '+e.message;}}
function openEditor(item){if(!canEdit(item))return;if(!admin&&!actionActor([item])){toast($('adminError').textContent);return;}if(!editing)saveDraft();$('formHome').append($('requestPanel'));document.querySelectorAll('.inline-editor-row').forEach(row=>row.remove());editing={...item};setPeople([item]);$('formTitle').textContent='선택한 신청 수정';$('submit').textContent='수정 저장';$('cancelEdit').hidden=false;$('formError').textContent='';render();$('requestPanel').scrollIntoView?.({block:'nearest'});}
function closeEditor(){if($('requestPanel').closest('#list'))$('formHome').append($('requestPanel'));document.querySelectorAll('.inline-editor-row').forEach(row=>row.remove());$('requestPanel').classList.remove('inline-editor');editing=null;$('formTitle').textContent='방문자 입력';$('submit').textContent='신청하기 →';$('cancelEdit').hidden=true;$('formError').textContent='';restoreDraft();}
function chosen(){return [...selected.values()].map(row=>({...row}));}
function clearMail(){$('mailDialog').close();$('mailBody').value='';$('mailPreview').innerHTML='';$('plainMail').open=false;mailDocument=null;$('mailRecipient').textContent='';mailItems=[];}
async function processBulk(action,items=chosen(),errorTarget=$('adminError')){if(busy)return;errorTarget.textContent='';if(!admin&&(action!=='delete'||items.some(row=>!canEdit(row)))){errorTarget.textContent='본인의 수정 가능한 신청만 선택해 주세요.';return;}const reviewer=actionActor(items,errorTarget);if(!reviewer)return;busy=true;updateSelection();$('recordMail').disabled=true;try{await api(admin?'bulk':'owner-delete',{action,items:items.map(({id,version})=>({id,version})),...(admin?{reviewer}:{})});selected.clear();if(editing&&items.some(row=>row.id===editing.id))closeEditor();if(action==='delivered')clearMail();toast(action==='delete'?items.length+'명 삭제 완료':action==='approve'?items.length+'명 승인 완료 처리':items.length+'명 발주처 전달 기록 완료');await refresh();}catch(e){errorTarget.textContent=e.message;}finally{busy=false;updateSelection();$('recordMail').disabled=false;}}
$('requestForm').addEventListener('input',event=>{event.target.removeAttribute('aria-invalid');$('formError').textContent='';if(!editing){clearTimeout(timer);timer=setTimeout(saveDraft,350);}});
$('requestForm').addEventListener('change',()=>{if(!editing){clearTimeout(timer);timer=setTimeout(saveDraft,350);}});
window.addEventListener('pagehide',()=>{if(!editing)saveDraft();});
$('add').onclick=()=>addPerson({},true);$('cancelEdit').onclick=()=>{closeEditor();render();};
$('requestForm').onsubmit=async event=>{event.preventDefault();if(busy||!validate())return;clearTimeout(timer);if(!editing)saveDraft();busy=true;$('requestForm').querySelectorAll('input,select,button').forEach(input=>input.disabled=true);updateSelection();try{if(editing){const item=editing;await api(admin?'update':'owner-update',{...collect()[0],id:item.id,version:item.version,status:item.status,reviewer:actionActor([item])});selected.delete(item.id);closeEditor();toast('수정 내용을 저장했습니다.');}else{const items=collect();setWeekFor(items[0].visit_date);const submitted=await api('requests',{items,author_name:$('authorName').value.trim()});pendingNotificationIds=submitted.ids||[];try{sessionStorage.setItem('permit-pending-notifications',JSON.stringify(pendingNotificationIds));}catch(e){}try{sessionStorage.removeItem('permit-draft');}catch(e){}setPeople([]);$('draftStatus').textContent='신청 완료 · 새 방문자를 입력할 수 있습니다.';selected.clear();$('statusFilter').value='승인 대기';$('dateFilter').value='';$('search').value='';toast(items.length+'명 신청이 접수되었습니다.');const notifying=notifySubmitted();await refresh();await notifying;}await refresh();}catch(e){$('formError').textContent=e.message;}finally{busy=false;$('requestForm').querySelectorAll('input,select,button').forEach(input=>input.disabled=false);updateSelection();}};
$('list').addEventListener('change',async event=>{const approval=event.target.closest('[data-approval]');if(approval){await processApproval(approval);return;}const checkbox=event.target.closest('[data-select]');if(!checkbox)return;const row=rows.find(item=>item.id===checkbox.dataset.select);if(!row||!canEdit(row))return;if(checkbox.checked){if(selected.size>=selectionLimit()){checkbox.checked=false;toast('한 번에 '+selectionLimit()+'명까지 선택할 수 있습니다.');return;}selected.set(row.id,{...row});}else selected.delete(row.id);checkbox.closest('tr').classList.toggle('selected',checkbox.checked);updateSelection();});
$('list').onclick=async event=>{const remove=event.target.closest('[data-delete]');if(remove){const row=rows.find(row=>row.id===remove.dataset.delete);if(row&&canEdit(row))return requestDelete([row]);return;}const button=event.target.closest('[data-edit]');if(button){const item=rows.find(row=>row.id===button.dataset.edit);if(item)openEditor(item);}};
$('selectAll').onchange=()=>{if(busy)return;const clear=selected.size>0;selected.clear();if(!clear)visibleRows().filter(canEdit).slice(0,selectionLimit()).forEach(row=>selected.set(row.id,{...row}));render();};
document.querySelectorAll('[data-sort]').forEach(button=>button.onclick=()=>{
 const field=button.dataset.sort;if(sortField===field)sortDirection=sortDirection==='asc'?'desc':'asc';else{sortField=field;sortDirection=field==='visit_date'?'desc':'asc';}render();
});
for(const id of ['statusFilter','dateFilter','search'])$(id).addEventListener(id==='search'?'input':'change',()=>{if(id==='dateFilter'&&$('dateFilter').value)setWeekFor($('dateFilter').value);selected.clear();render();});
$('reviewer').addEventListener('input',()=>{$('reviewer').removeAttribute('aria-invalid');$('adminError').textContent='';});
$('refresh').onclick=async()=>{if($('refresh').disabled)return;$('refresh').disabled=true;selected.clear();try{await refresh();}finally{$('refresh').disabled=false;}};
$('search').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();$('refresh').click();}});
$('login').onclick=async()=>{if(admin){await api('logout',{});refreshId++;admin=false;rows=[];selected.clear();if(editing)closeEditor();clearMail();$('recipient').value='';recipient='';$('adminError').textContent='';render();await refresh();}else{$('password').value='';$('loginError').textContent='';$('loginDialog').showModal();}};
$('loginForm').onsubmit=async event=>{event.preventDefault();const button=$('loginForm').querySelector('.primary');button.disabled=true;try{await api('login',{password:$('password').value});$('password').value='';$('loginDialog').close();await refresh();try{recipient=(await api('settings')).recipient;$('recipient').value=recipient;}catch(e){$('adminError').textContent=e.message;}}catch(e){$('loginError').textContent=e.message;}finally{button.disabled=false;}};
document.querySelectorAll('[data-close]').forEach(button=>button.onclick=()=>$(button.dataset.close).close());
$('approve').onclick=()=>{if(!admin||!selected.size)return;if(!reviewerName())return;if(confirm(`선택한 ${selected.size}명에 대해 발주처의 실제 승인을 확인하셨나요? 최종 승인으로 처리하고 처리자와 시각을 기록합니다.`))return processBulk('approve');};
function requestDelete(items){if(busy||!items.length||items.some(row=>!canEdit(row)))return;if(!actionActor(items))return;if(confirm(`선택한 ${items.length}명의 신청을 삭제할까요? 삭제 후 복구할 수 없습니다.`))return processBulk('delete',items);}
$('delete').onclick=()=>requestDelete(chosen());
$('mail').onclick=async()=>{if(!admin||!selected.size||!reviewerName())return;try{
 recipient=(await api('settings')).recipient;if(!admin)return;mailItems=sortRows(chosen());mailDocument=buildMailDocument(mailItems,reviewerName());
 $('mailRecipient').textContent='수신: '+recipient+' · '+mailItems.length+'명';$('mailBody').value=mailDocument.text;$('mailPreview').innerHTML=mailDocument.html;$('mailError').textContent='';$('mailDialog').showModal();
}catch(e){$('adminError').textContent=e.message;}};
async function copyMailBody(){
 if(!admin||!mailDocument)return false;
 try{
  if(navigator.clipboard?.write&&typeof ClipboardItem!=='undefined'){
   await navigator.clipboard.write([new ClipboardItem({'text/html':new Blob([mailDocument.html],{type:'text/html'}),'text/plain':new Blob([mailDocument.text],{type:'text/plain'})})]);
   if(admin&&mailDocument)$('mailError').textContent='표 포함 본문을 자동 복사했습니다. 메일 본문에 붙여넣기(Ctrl+V) 해 주세요.';
  }else{
   await navigator.clipboard.writeText(mailDocument.text);if(admin&&mailDocument)$('mailError').textContent='텍스트로 복사했습니다. 이 환경에서는 표 서식 복사가 지원되지 않습니다. 표는 이메일 파일로 저장해 주세요.';
  }
  return true;
 }catch(e){if(admin&&mailDocument){$('plainMail').open=true;$('mailBody').focus();$('mailBody').select();$('mailError').textContent='자동 복사 권한을 사용할 수 없습니다. 본문 복사를 다시 누르거나 이메일 파일을 저장해 주세요.';}return false;}
}
$('copyMail').onclick=copyMailBody;
$('openMail').onclick=()=>{
 if(!admin||!mailDocument)return;
 const href=composeMailto(recipient,mailDocument.subject);
 const copying=copyMailBody();
 // Keep the protocol launch inside the original click; never wait for clipboard permission.
 const link=document.createElement('a');link.href=href;$('mailDialog').append(link);link.click();link.remove();
 return copying;
};
$('downloadMail').onclick=()=>{
 if(!admin||!mailDocument)return;
 try{
  const eml=buildDraftEmail(recipient,mailDocument),url=URL.createObjectURL(new Blob([eml],{type:'message/rfc822'}));
  const link=document.createElement('a');link.href=url;link.download='현장_출입신청_요청.eml';$('mailDialog').append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  $('mailError').textContent='파일 저장을 요청했습니다. 브라우저 다운로드 목록에서 .eml 파일을 열어 주세요. 열리지 않으면 메일 앱 열기와 붙여넣기를 이용해 주세요.';
 }catch(e){$('mailError').textContent='이메일 파일을 저장하지 못했습니다. 메일 앱 열기와 붙여넣기를 이용해 주세요.';}
};
$('recordMail').onclick=()=>{if(!admin||!mailItems.length)return;if(confirm('메일 앱에서 실제로 전송하셨나요? 선택한 신청의 전달 시각을 기록합니다.'))return processBulk('delivered',mailItems,$('mailError'));};
$('settingsForm').onsubmit=async event=>{event.preventDefault();try{recipient=(await api('settings',{recipient:$('recipient').value})).recipient;$('settingsMessage').textContent='수신 주소를 저장했습니다.';}catch(e){$('settingsMessage').textContent=e.message;}};
$('downloadOwn').onclick=()=>{};
$('downloadOwnExcel').onclick=()=>{};
async function downloadWorkbook(detailed=false){
 if(!admin)return;const button=$(detailed?'downloadDetailedExcel':'downloadExcel');if(button.disabled)return;button.disabled=true;
 try{if(!(await api('session')).reviewer)throw Error('다시 관리자 로그인해 주세요.');const data=sortRows((await api('requests')).filter(matchesFilters));if(!admin)throw Error('다시 관리자 로그인해 주세요.');if(!data.length){toast('다운로드할 내역이 없습니다.');return;}
 const exporter=await import('/xlsx-export.js');const buffer=await (detailed?exporter.createDetailedWorkbook:exporter.createApplicantWorkbook)(data);if(!admin)return;
 const url=URL.createObjectURL(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));const link=document.createElement('a');link.href=url;link.download=detailed?'출입신청_상세내역.xlsx':'출입신청_명단.xlsx';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }catch(e){$('adminError').textContent=e.message;}finally{button.disabled=false;}
}
$('downloadExcel').onclick=()=>downloadWorkbook();
$('downloadDetailedExcel').onclick=()=>downloadWorkbook(true);
for(const [id,delta] of [['weekPrev',-1],['weekNext',1]])$(id).onclick=()=>{weekOffset+=delta;allWeeks=false;$('dateFilter').value='';selected.clear();render();};
$('weekCurrent').onclick=()=>{weekOffset=0;allWeeks=false;$('dateFilter').value='';selected.clear();render();};
$('weekAll').onclick=()=>{allWeeks=true;$('dateFilter').value='';selected.clear();render();};
$('siteMapToggle').onclick=()=>{
 const panel=$('siteMapPanel'),image=$('siteMapImage'),open=panel.hidden;
 panel.hidden=!open;$('siteMapToggle').setAttribute('aria-expanded',String(open));
 if(open&&(!image.getAttribute('src')||!$('siteMapError').hidden)){
  $('siteMapError').hidden=true;image.hidden=false;image.src=image.dataset.src;
 }
};
$('siteMapClose').onclick=()=>{$('siteMapPanel').hidden=true;$('siteMapToggle').setAttribute('aria-expanded','false');$('siteMapToggle').focus({preventScroll:true});};
$('siteMapImage').onerror=()=>{$('siteMapImage').hidden=true;$('siteMapError').hidden=false;};
$('siteMapImage').onload=()=>{$('siteMapImage').hidden=false;$('siteMapError').hidden=true;};
const directoryUI=createDirectoryUI({api,onChange(teams){directoryTeams=teams;for(const input of document.querySelectorAll('#people [name=team]')){const value=input.value;const holder=document.createElement('div');holder.innerHTML=markup(fields.find(f=>f[0]==='team'),{team:value});input.replaceWith(holder.querySelector('select'));}}});
async function notifySubmitted(){
 const result=$('notificationResult');result.hidden=false;result.className='notification-result';result.textContent='신청이 저장되었습니다. 담당자 문자·이메일 발송 결과를 확인하고 있습니다.';$('retryNotifications').hidden=true;
 try{if(!pendingNotificationIds.length)throw Error('알림 대상 신청을 확인하지 못했습니다.');const data=await api('notify',{ids:pendingNotificationIds});const errors=data.results.filter(r=>r.status!=='sent');result.classList.toggle('notification-error',errors.length>0);result.textContent=errors.length?'신청은 저장되었습니다. '+data.results.filter(r=>r.status==='sent').length+'건 발송 요청 접수 / '+errors.map(r=>`${r.team} ${r.recipient||''} ${r.channel==='sms'?'문자':'이메일'}: ${r.message}`).join(' / '):'신청 완료 · 담당자 문자와 이메일 발송 요청이 접수되었습니다.';$('retryNotifications').hidden=!errors.some(r=>r.retryable);if(!errors.length){pendingNotificationIds=[];try{sessionStorage.removeItem('permit-pending-notifications');}catch(e){}}
 }catch(e){result.classList.add('notification-error');result.textContent='신청은 저장되었습니다. 담당자 알림 오류: '+e.message;$('retryNotifications').hidden=false;}
}
$('retryNotifications').onclick=async()=>{$('retryNotifications').disabled=true;try{await notifySubmitted();}finally{$('retryNotifications').disabled=false;}};
try{const saved=JSON.parse(sessionStorage.getItem('permit-pending-notifications')||'[]');if(Array.isArray(saved)&&saved.length&&saved.length<=10&&saved.every(id=>typeof id==='string')){pendingNotificationIds=saved;$('notificationResult').hidden=false;$('notificationResult').textContent='이전 신청의 알림 결과 확인이 필요합니다. 신청을 다시 등록하지 말고 아래 버튼으로 확인해 주세요.';$('retryNotifications').hidden=false;}}catch(e){}
void directoryUI.load();
restoreDraft();render();refresh();setInterval(refresh,30000);
