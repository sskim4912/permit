import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createSeetecWorkbook} from '../src/seetec-export.js';
const read=async rows=>{
 const file=await createSeetecWorkbook(rows);
 assert.deepEqual([...file.slice(0,8)],[0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1]);
 const result=spawnSync('python3',['tests/verify-seetec.py'],{input:JSON.stringify({file:Buffer.from(file).toString('base64')}),encoding:'utf8',maxBuffer:10*1024*1024});
 assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout);
};
test('original XLS column layout, required header colors and matched visitor data survive independent Excel decoding',async()=>{
 const result=await read([{name:'가상방문자',author_name:'신청자는다름',birth:'2001-02-03',purpose:'현장 점검',plate:'=1+1',vehicle_type:'승용',vehicle_name:'소나타',phone:'010-0123-4567',team:'요청팀은소속아님'}]);
 assert.equal(result.sheets,1);assert.equal(result.cols,13);assert.equal(result.rows,2);
 assert.deepEqual(result.headers,['성명','생년월일','방문목적','차량번호','차종','회사명','부서명','','주소','','전화번호지역','휴대폰','메일']);
 assert.deepEqual(result.data[0],['가상방문자','010203','현장 점검','=1+1','소나타','','','','','','','010-0123-4567','']);
 for(const c of [0,1,2,3,4,11])assert.equal(result.types[0][c],1,'mapped fields are strings, not formulas or numbers');
 assert.equal(result.headerColors[0],10);assert.deepEqual(result.borders,[1,1]);assert.equal(result.fill,0);
 assert.deepEqual(result.setup,{paper:9,width:1,height:1,landscape:true});assert.equal(result.fit,true);assert.equal(result.printArea,'Sheet1!$A$1:$M$2');
});
test('missing values stay blank and hundreds of people are retained on the one-page XLS print setting',async()=>{
 const rows=Array.from({length:500},(_,i)=>({name:'방문자'+i}));const result=await read(rows);
 assert.equal(result.rows,501);assert.equal(result.data[499][0],'방문자499');assert.ok(result.data.every(row=>row.slice(1).every(v=>v==='')));
 assert.equal(result.setup.height,1);assert.equal(result.setup.width,1);assert.equal(result.printArea,'Sheet1!$A$1:$M$501');
});
test('empty exports and the XLS row limit fail explicitly without truncating records',async()=>{
 await assert.rejects(()=>createSeetecWorkbook([]),/다운로드할 내역/);await assert.rejects(()=>createSeetecWorkbook(Array(65536)),/65,535/);
});
