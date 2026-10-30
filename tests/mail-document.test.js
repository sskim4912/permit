import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {buildMailDocument,buildDraftEmail} from '../src/mail-document.js';
const rows=[{visit_date:'2026-11-05',visit_end_date:'2026-11-06',name:'<img src=x onerror=alert(1)>',birth:'1990-01-01',phone:'010-0000-0000',plate:'시안0001',vehicle_type:'승용',role:'운전자',purpose:'협의 & 점검',team:'관리팀',gate:'서문',owner_key:'never-export-this'}];
test('email renders nine-column summary table and escaped request content without capability keys',()=>{
 const message=buildMailDocument(rows,'담당자 <가상>');const dom=new JSDOM(message.html);try{
  assert.equal(dom.window.document.querySelectorAll('th').length,9);assert.equal(dom.window.document.querySelectorAll('tbody tr').length,1);assert.equal(dom.window.document.querySelector('img'),null);
  assert.ok(dom.window.document.body.textContent.includes(rows[0].name));assert.ok(dom.window.document.body.textContent.includes('협의 & 점검'));assert.ok(message.html.includes('2026-11-05 ~ 2026-11-06'));assert.ok(!message.html.includes('never-export-this'));assert.ok(!message.html.includes('안전화'));assert.ok(!message.html.includes('승인현황'));assert.ok(!message.html.includes('신청 인원:'));assert.ok(!message.html.includes('방문 일정과 목적'));assert.ok(!message.text.includes('요청팀:'));assert.ok(!message.text.includes('방문시작일:'));
 }finally{dom.window.close();}
});
test('eml is an unsent UTF-8 HTML draft with all recipients and valid encoded subject',()=>{
 const message=buildMailDocument(rows,'담당자');const eml=buildDraftEmail('one@example.com; two@example.com',message);const [headers,...parts]=eml.split('\r\n\r\n');assert.match(headers,/X-Unsent: 1/);assert.match(headers,/To: one@example.com,\r\n two@example.com/);assert.match(headers,/Content-Type: text\/html; charset=UTF-8/);
 const words=[...headers.matchAll(/=\?UTF-8\?B\?([^?]+)\?=/g)];assert.ok(words.every(word=>word[0].length<=75));assert.equal(words.map(word=>Buffer.from(word[1],'base64').toString('utf8')).join(''),message.subject);
 const html=Buffer.from(parts.join('\r\n\r\n').replace(/\s/g,''),'base64').toString('utf8');assert.ok(html.includes(message.html));assert.ok(!html.includes('never-export-this'));
 assert.throws(()=>buildDraftEmail('one@example.com\r\nBcc: hacker@example.com',message));
});
