import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeRecipients,composeMailto} from '../src/mail-recipients.js';
test('multiple addresses normalize without changing legacy single address',()=>{
 assert.equal(normalizeRecipients('one@example.com'),'one@example.com');
 assert.equal(normalizeRecipients('one@example.com; two@example.com\nONE@example.com'),'one@example.com,two@example.com');
 for(const value of ['', 'ok@example.com,broken','x@example.com?bcc=bad@example.com',Array.from({length:11},(_,i)=>`r${i}@example.com`).join(',')])assert.throws(()=>normalizeRecipients(value));
});
test('mailto includes separate recipients and one safely encoded subject and body',()=>{
 const link=composeMailto('one@example.com,two@example.com','출입 신청','본문 & 추가\n동일 내용');
 assert.equal(link.split('?')[0],'mailto:one%40example.com,two%40example.com');const params=new URLSearchParams(link.split('?')[1]);assert.equal(params.get('subject'),'출입 신청');assert.equal(params.get('body'),'본문 & 추가\n동일 내용');
});
