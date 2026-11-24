export const teamLabel=team=>`${team.name} ${team.contacts.map(c=>c.name).join(', ')}`;
export function validateTeams(teams){
 if(!Array.isArray(teams)||teams.length<1||teams.length>30)throw Error('담당 팀은 1~30개를 등록해 주세요.');
 const ids=new Set(),names=new Set();
 return teams.map((t,order)=>{
  const id=String(t.id||''),name=String(t.name||'').trim();
  if(!/^[a-zA-Z0-9_-]{1,60}$/.test(id)||ids.has(id)||!name||name.length>50||names.has(name))throw Error('팀명은 50자 이내로, 중복 없이 입력해 주세요.');ids.add(id);names.add(name);
  if(!Array.isArray(t.contacts)||t.contacts.length!==2)throw Error('팀별 담당자 두 명을 입력해 주세요.');
  const contacts=t.contacts.map(c=>{const contact={name:String(c.name||'').trim(),phone:String(c.phone||'').trim(),email:String(c.email||'').trim()};if(!contact.name||contact.name.length>50||!/^01[016789]-\d{3,4}-\d{4}$/.test(contact.phone)||contact.email.length>254||!/^[^\s@<>;,]+@[^\s@<>;,]+\.[^\s@<>;,]+$/.test(contact.email))throw Error('담당자 이름·휴대전화·이메일을 확인해 주세요.');return contact;});
  return {id,name,order,contacts};
 });
}
