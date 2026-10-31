import {defaultTeams,teamLabel,validateTeams} from '../functions/lib/directory.js';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function createDirectoryUI({api,onChange}){
 const $=id=>document.getElementById(id);let administrator=false,teams=structuredClone(defaultTeams),version=0,editing=false,loading=false;
 const field=(value,label,type='text')=>`<input aria-label="${escape(label)}" type="${type}" value="${escape(value)}" maxlength="${type==='email'?254:50}" required>`;
 function render(){
  $('contactActionsHeading').hidden=!editing;
  $('editContacts').hidden=!administrator||editing;$('saveContacts').hidden=!administrator||!editing;$('cancelContacts').hidden=!editing;$('addContactTeam').hidden=!editing;
  $('contactsBody').innerHTML=teams.map(t=>`<tr data-team-id="${escape(t.id)}"><td data-label="팀명">${editing?field(t.name,'팀명'):escape(t.name)}</td>${t.contacts.map((c,index)=>`<td data-label="담당자 ${index+1} 이름">${editing?field(c.name,'담당자 이름'):escape(c.name)}</td><td data-label="담당자 ${index+1} 전화번호">${editing?field(c.phone,'휴대전화','tel'):`<a href="tel:${escape(c.phone)}">${escape(c.phone)}</a>`}</td><td data-label="담당자 ${index+1} 이메일">${editing?field(c.email,'이메일','email'):`<a href="mailto:${escape(c.email)}">${escape(c.email)}</a>`}</td>`).join('')}${editing?'<td><button type="button" class="danger" data-remove-team>팀 삭제</button></td>':''}</tr>`).join('');
 }
 function read(){return [...$('contactsBody').querySelectorAll('[data-team-id]')].map(row=>{const values=[...row.querySelectorAll('input')].map(i=>i.value);return {id:row.dataset.teamId,name:values[0],contacts:[{name:values[1],phone:values[2],email:values[3]},{name:values[4],phone:values[5],email:values[6]}]};});}
 function apply(data){teams=validateTeams(data.teams);version=data.version;onChange(teams);render();}
 async function load(){if(loading)return;loading=true;$('contactsError').textContent='';try{apply(await api('directory'));}catch(e){$('contactsError').textContent='담당자 정보를 불러오지 못했습니다. '+e.message;}finally{loading=false;}}
 $('contactsToggle').onclick=async()=>{$('contactsDialog').showModal();if(!editing)await load();};
 $('editContacts').onclick=()=>{editing=true;$('contactsMessage').textContent='';render();};
 $('cancelContacts').onclick=async()=>{editing=false;await load();render();};
 $('addContactTeam').onclick=()=>{teams=read();if(teams.length>=30){$('contactsError').textContent='최대 30개 팀까지 등록할 수 있습니다.';return;}teams.push({id:crypto.randomUUID(),name:'',contacts:[{name:'',phone:'',email:''},{name:'',phone:'',email:''}]});render();};
 $('contactsBody').onclick=event=>{if(!event.target.closest('[data-remove-team]'))return;teams=read().filter(t=>t.id!==event.target.closest('[data-team-id]').dataset.teamId);render();};
 $('contactsForm').onsubmit=async event=>{event.preventDefault();if(!administrator||!editing)return;$('contactsError').textContent='';try{const data=validateTeams(read());$('saveContacts').disabled=true;const result=await api('directory',{teams:data,version});editing=false;apply(result);$('contactsMessage').textContent='담당자 정보를 저장했습니다. 요청팀 선택과 다음 신청 알림부터 적용됩니다.';}catch(e){$('contactsError').textContent=e.message;}finally{$('saveContacts').disabled=false;}};
 render();return {load,setAdmin(value){if(administrator===value)return;administrator=value;if(!value){editing=false;void load();}render();}};
}
export {defaultTeams,teamLabel};
