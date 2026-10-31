export const defaultTeams = [
 ['management','관리팀','이재훈','010-9571-0010','leejaehun@gsenc.com','김성석','010-9445-4912','sskim07@gsenc.com'],
 ['construction','공무팀','이대진','010-2681-8985','djlee02@gsenc.com','배경훈','010-2394-6840','baekh@gsenc.com'],
 ['business','사업팀','홍영근','010-2546-3943','younggeunhong@gsenc.com','이영운','010-9761-4834','yulee@gsenc.com'],
 ['civil','토목건축팀','황규현','010-7491-9185','hgh@gsenc.com','김동오','010-4002-2889','dokim@gsenc.com'],
 ['piping','배관팀','김민석','010-4704-4321','mskim20@gsenc.com','최용길','010-3117-0482','ygchoi01@gsenc.com'],
 ['quality','품질팀','지영근','010-5232-6989','ykjee01@gsenc.com','서용진','010-2955-9683','yjseo@gsenc.com'],
 ['electrical','전기계장팀','손상림','010-9562-2557','Sornsanglim@gsenc.com','심원','010-5446-9272','wshim@gsenc.com'],
 ['mechanical','기계철골팀','이수빈','010-8001-3827','subeenlee@gsenc.com','나병욱','010-7288-0807','byungwookna@gsenc.com'],
 ['mc','MC팀','이재헌','010-2874-8161','thomas287488@gsenc.com','안석봉','010-3191-8655','sban@gsenc.com'],
 ['commissioning','시운전팀','김수민','010-9868-7110','sumin26@gsenc.com','조재민','010-9345-2385','chojmin@gsenc.com'],
 ['safety','안전팀','임춘택','010-6483-2147','ctlim@gsenc.com','서성빈','010-8794-5843','sbseo25@gsenc.com']
].map(([id,name,a,ap,ae,b,bp,be],order)=>({id,name,order,contacts:[{name:a,phone:ap,email:ae},{name:b,phone:bp,email:be}]}));
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
