import {normalizeRecipients} from './mail-recipients.js';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const HEADERS=['순번','출입날짜','이름','생년월일','휴대전화번호','차량번호','차종','운전자 해당여부','방문목적'];
export function buildMailDocument(rows,reviewer){
 if(!rows.length||rows.length>10)throw Error('제출할 신청을 1~10명 선택해 주세요.');
 const start=rows.map(r=>r.visit_date).sort()[0],end=rows.map(r=>r.visit_end_date||r.visit_date).sort().at(-1);
 const teams=[...new Set(rows.map(r=>r.team).filter(Boolean))].join(', '),gates=[...new Set(rows.map(r=>r.gate).filter(Boolean))].join(', ');
 const data=rows.map((r,i)=>[i+1,r.visit_date===(r.visit_end_date||r.visit_date)?r.visit_date:r.visit_date+' ~ '+r.visit_end_date,r.name,r.birth,r.phone,r.plate||'—',r.vehicle_type||'—',r.role,r.purpose]);
 const html=`<div style="font-family:Arial,'Malgun Gothic',sans-serif;color:#243d36;font-size:14px;line-height:1.8"><h2 style="margin:0 0 18px;color:#14624d;font-size:22px">Aurora Project 현장 출입신청 요청</h2><p>안녕하세요.<br>아래 방문 인원의 현장 출입 승인을 요청드립니다.<br>방문 일정과 목적을 확인하시어 출입 절차를 안내해 주시면 감사하겠습니다.</p><div style="padding:14px 18px;background:#eef5f1;border:1px solid #d5e3db;margin:18px 0"><strong>신청 인원:</strong> ${rows.length}명<br><strong>방문기간:</strong> ${escape(start===end?start:start+' ~ '+end)}<br><strong>요청팀:</strong> ${escape(teams||'—')}<br><strong>출입위치:</strong> ${escape(gates||'—')}</div><table style="width:100%;border-collapse:collapse;font-size:13px;text-align:center"><thead><tr>${HEADERS.map(h=>`<th style="border:1px solid #aebcb3;background:#e6ece8;padding:12px 8px;vertical-align:middle">${h}</th>`).join('')}</tr></thead><tbody>${data.map(row=>`<tr>${row.map(v=>`<td style="border:1px solid #bbc7bf;padding:12px 8px;vertical-align:middle;word-break:normal;overflow-wrap:anywhere">${escape(v)}</td>`).join('')}</tr>`).join('')}</tbody></table><p style="margin-top:20px">추가로 필요한 서류나 확인 사항이 있으면 회신 부탁드립니다.<br>감사합니다.</p><p style="border-top:1px solid #dde5df;padding-top:12px"><strong>출입신청 담당자</strong> ${escape(reviewer)}</p></div>`;
 const text=`Aurora Project 현장 출입신청 요청\n\n안녕하세요. 아래 방문 인원의 현장 출입 승인을 요청드립니다.\n\n신청 인원: ${rows.length}명\n방문시작일: ${start}\n방문종료일: ${end}\n요청팀: ${teams}\n출입위치: ${gates}\n\n${HEADERS.join('\t')}\n${data.map(r=>r.map(v=>String(v??'').replace(/[\t\r\n]+/g,' ')).join('\t')).join('\n')}\n\n추가로 필요한 서류나 확인 사항이 있으면 회신 부탁드립니다.\n감사합니다.\n출입신청 담당자: ${reviewer}`;
 return {html,text,subject:`[Aurora Project] 현장 출입신청 요청 (${rows.length}명)`};
}
const base64=text=>{const bytes=new TextEncoder().encode(text);let binary='';for(const b of bytes)binary+=String.fromCharCode(b);return btoa(binary);};
const encodedSubject=text=>{
 const chunks=[];let chunk='';for(const character of text){if(new TextEncoder().encode(chunk+character).length>36){chunks.push(chunk);chunk='';}chunk+=character;}if(chunk)chunks.push(chunk);
 return chunks.map(part=>'=?UTF-8?B?'+base64(part)+'?=').join('\r\n ');
};
export function buildDraftEmail(recipient,document){
 const addresses=normalizeRecipients(recipient).split(',').join(',\r\n ');
 return ['X-Unsent: 1','To: '+addresses,'Subject: '+encodedSubject(document.subject),'MIME-Version: 1.0','Content-Type: text/html; charset=UTF-8','Content-Transfer-Encoding: base64','',base64('<!doctype html><html><meta charset="utf-8"><body>'+document.html+'</body></html>').match(/.{1,76}/g).join('\r\n'),''].join('\r\n');
}
