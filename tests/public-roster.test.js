import {test} from 'node:test';
import assert from 'node:assert/strict';
import {maskBirth,publicRoster} from '../src/public-roster.js';
test('public projection exposes requested roster data without original birth or ownership capability',()=>{
 const p=publicRoster({name:'가상 이름',birth:'1990-01-02',phone:'010-0000-0000',plate:'시안0001',vehicle_type:'승용',role:'운전자',shoes:'270',owner_key:'secret',author_name:'최초 신청자',modified_by:'관리자'});
 assert.equal(p.name,'가상 이름');assert.equal(p.phone,'010-0000-0000');assert.equal(p.birth_mask,'19**-**-**');for(const key of ['birth','owner_key','author_name','modified_by'])assert.equal(key in p,false);
 assert.equal(maskBirth('2001-02-03'),'20**-**-**');assert.equal(maskBirth(''),'****-**-**');
});
