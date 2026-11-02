import {test} from 'node:test';
import assert from 'node:assert/strict';
import {requestFastNotification,notificationTriggerURL} from '../src/notification-trigger.js';
const proof={queue_id:'Q'.repeat(20),request_id:'R'.repeat(20),owner_key:'a'.repeat(64)};
test('sends only ownership proof using a simple POST without browser credentials',async()=>{
 let calls=0;
 await requestFastNotification(proof,{fetchImpl:async(url,options)=>{
  calls++;assert.equal(url,notificationTriggerURL);assert.equal(options.method,'POST');
  assert.equal(options.mode,'no-cors');assert.equal(options.credentials,'omit');
  assert.equal(options.referrerPolicy,'no-referrer');assert.equal(options.keepalive,true);
  assert.match(options.headers['Content-Type'],/^text\/plain/);assert.deepEqual(JSON.parse(options.body),proof);
  return {type:'opaque'};
 }});assert.equal(calls,1);
});
test('failed fast trigger preserves scheduled fallback without retry or failure of submission',async()=>{
 let calls=0;await requestFastNotification(proof,{fetchImpl:async()=>{calls++;throw Error('offline');}});assert.equal(calls,1);
});
test('never sends malformed ownership proof',async()=>{
 let calls=0;const fetchImpl=async()=>{calls++;};
 for(const bad of [{},{...proof,owner_key:'bad'},{...proof,request_id:'../wrong'},{...proof,queue_id:''}])await requestFastNotification(bad,{fetchImpl});
 assert.equal(calls,0);
});

import {readFileSync} from 'node:fs';
import vm from 'node:vm';
function bridge({fields={},status=200,dispatchStatus=204}={}){
 const calls=[],cache=new Map();let locked=false;
 const context={console,ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({setMimeType:()=>JSON.parse(text)})},
  PropertiesService:{getScriptProperties:()=>({getProperty:()=> 'test-token'})},
  CacheService:{getScriptCache:()=>({get:key=>cache.get(key),put:(key,value)=>cache.set(key,value)})},
  LockService:{getScriptLock:()=>({tryLock:()=>{locked=true;return true;},releaseLock:()=>{locked=false;}})},
  UrlFetchApp:{fetch:(url,options)=>{calls.push({url,options});return {getResponseCode:()=>url.startsWith('https://firestore.googleapis.com/')?status:dispatchStatus,getContentText:()=>JSON.stringify({fields})};}}
 };
 vm.createContext(context);vm.runInContext(readFileSync('apps-script/Code.gs','utf8'),context);
 return {post:body=>context.doPost({postData:{contents:JSON.stringify(body)}}),calls,locked:()=>locked};
}
const freshFields=()=>({owner_key:{stringValue:proof.owner_key},notification_queue_id:{stringValue:proof.queue_id},created:{timestampValue:new Date().toISOString()}});
test('bridge verifies real ownership before one fixed workflow dispatch and deduplicates repeats',()=>{
 const app=bridge({fields:freshFields()});assert.equal(app.post(proof).ok,true);assert.equal(app.post(proof).ok,true);
 const dispatches=app.calls.filter(c=>c.url.startsWith('https://api.github.com/'));
 assert.equal(dispatches.length,1);assert.equal(dispatches[0].url,'https://api.github.com/repos/sskim4912/permit/actions/workflows/notify-queue.yml/dispatches');
 assert.deepEqual(JSON.parse(dispatches[0].options.payload),{ref:'main'});assert.equal(app.locked(),false);
});
test('bridge rejects mismatched ownership, queue, stale time and denied proof without dispatching',()=>{
 for(const options of [{fields:{...freshFields(),owner_key:{stringValue:'b'.repeat(64)}}},{fields:{...freshFields(),notification_queue_id:{stringValue:'wrong'}}},{fields:{...freshFields(),created:{timestampValue:'2020-01-01'}}},{status:403}]){
  const app=bridge(options);assert.equal(app.post(proof).ok,false);assert.equal(app.calls.some(c=>c.url.startsWith('https://api.github.com/')),false);
 }
});
test('bridge does not mark a failed GitHub dispatch successful or retain its lock',()=>{
 const app=bridge({fields:freshFields(),dispatchStatus:403});assert.equal(app.post(proof).ok,false);assert.equal(app.locked(),false);
});
