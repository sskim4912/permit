import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verifyHosting} from '../scripts/verify-hosting.mjs';
const homepage=()=>new Response('<title>대산 출입관리</title>');
test('waits for transient 404 and then verifies the deployed commit and script',async()=>{
 let homeCalls=0,waits=0;
 const result=await verifyHosting({commit:'abc',attempts:3,fetchImpl:async url=>{
  if(url.endsWith('/'))return ++homeCalls===1?new Response('Not found',{status:404}):homepage();
  if(url.endsWith('deployment.json'))return Response.json({commit:'abc'});
  return new Response('application();');
 },sleep:async()=>{waits++;},log:()=>{}});
 assert.equal(result,'https://permit-daesan-461e8.web.app');assert.equal(waits,1);
});
test('rejects a permanently missing page',async()=>{
 await assert.rejects(()=>verifyHosting({commit:'abc',attempts:2,fetchImpl:async()=>new Response('',{status:404}),sleep:async()=>{},log:()=>{}}),/Homepage HTTP 404/);
});
test('rejects an old deployment even if the homepage responds successfully',async()=>{
 await assert.rejects(()=>verifyHosting({commit:'abc',attempts:1,fetchImpl:async url=>url.endsWith('/')?homepage():Response.json({commit:'old'}),log:()=>{}}),/previous deployment/);
});
test('rejects missing JavaScript',async()=>{
 await assert.rejects(()=>verifyHosting({commit:'abc',attempts:1,fetchImpl:async url=>url.endsWith('/')?homepage():url.endsWith('deployment.json')?Response.json({commit:'abc'}):new Response('',{status:404}),log:()=>{}}),/script is missing/);
});
