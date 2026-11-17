import {test} from 'node:test';
import assert from 'node:assert/strict';
import {lookupSolapiDelivery} from '../lib/history.js';
import {publicResults} from '../lib/notifications.js';
const config={solapi:{apiKey:'fake-key',apiSecret:'fake-secret'}};
test('delivery lookup is read-only and distinguishes provider success, failure and pending',async()=>{for(const [count,status] of [[{sentSuccess:1},'delivered'],[{sentFailed:1},'delivery_failed'],[{sentSuccess:0,sentPending:1},'pending']]){let call;const result=await lookupSolapiDelivery('G_TEST',config,{fetchImpl:async(url,options)=>{call={url,...options};return {ok:true,json:async()=>({count})};}});assert.equal(result.status,status);assert.equal(call.method,'GET');assert.equal(call.body,undefined);assert.equal(call.url,'https://api.solapi.com/messages/v4/groups/G_TEST');}const failed=await lookupSolapiDelivery('G_TEST',config,{fetchImpl:async()=>({ok:false,status:403})});assert.equal(failed.status,'unconfirmed');});
test('public receipt includes delivery state but excludes recipient numbers and provider IDs',()=>{const row=publicResults([{team:'관리팀',recipient:'담당자',channel:'sms',status:'sent',to:'01000000000',providerId:'PRIVATE',delivery_status:'delivered',delivery_message:'성공',delivery_checked_at:'2026-11-02T00:00:00Z'}])[0];assert.equal(row.delivery_status,'delivered');assert.equal(row.to,undefined);assert.equal(row.providerId,undefined);});
test('read-only provider rate limits are retried without sending or duplicating messages',async()=>{let calls=0,waits=0;const result=await lookupSolapiDelivery('G_TEST',config,{wait:async()=>{waits++;},fetchImpl:async(_,options)=>{assert.equal(options.method,'GET');calls++;return calls===1?{ok:false,status:429}:{ok:true,status:200,json:async()=>({count:{sentSuccess:1}})};}});assert.equal(result.status,'delivered');assert.equal(calls,2);assert.equal(waits,1);});

test('terminal provider results reuse the audited receipt without provider calls or writes; missing receipts recover',async()=>{
 const {reconcileNotificationHistory}=await import('../lib/history.js');const {jobId}=await import('../lib/notifications.js');
 const owner='a'.repeat(64),ids=['b'.repeat(20)],queue='q'.repeat(20),tasks=[{team:'관리팀',channel:'sms',status:'sent',providerId:'G_DONE',delivery_status:'delivered',delivery_checked_at:'2026-11-01T00:00:00Z'}];
 let receiptExists=true,lookups=0,writes=0,commits=0,reads=0;
 const data=new Map([['notificationJobs/'+jobId(ids),{tasks}],['requests/'+ids[0],{owner_key:owner,notification_queue_id:queue}],[`applicantCopies/${owner}/items/${ids[0]}`,{notification_queue_id:queue}],[`applicantCopies/${owner}/notificationReceipts/${queue}`,{request_ids:ids,results:publicResults(tasks)}]]);
 const doc=path=>({path,async get(){reads++;return {exists:data.has(path)&&(!path.includes('notificationReceipts')||receiptExists),data:()=>structuredClone(data.get(path)),ref:doc(path)};}});
 const db={doc,collection:()=>({orderBy:()=>({limit:()=>({get:async()=>({size:1,docs:[{id:queue,data:()=>({owner_key:owner,ids})}]})})})}),runTransaction:fn=>fn({getAll:(...refs)=>Promise.all(refs.map(r=>r.get())),update:()=>{writes++;}}),batch:()=>({update:()=>{writes++;},set:()=>{writes++;},commit:async()=>{commits++;}})};
 const run=()=>reconcileNotificationHistory({db,Timestamp:{now:()=>0},config,lookup:async()=>{lookups++;throw Error('terminal result must not be polled');}});
 await run();assert.equal(lookups,0);assert.equal(writes,0);assert.equal(commits,0);assert.equal(reads,4);
 receiptExists=false;await run();assert.equal(lookups,0);assert.equal(writes,1);assert.equal(commits,1);
});

test('empty queue avoids directory reads while retaining the pending queue query',async()=>{
 const {processNotificationQueue}=await import('../lib/queue.js');let queries=0;
 const db={doc:()=>{throw Error('idle queue must not load directory');},collection:name=>{assert.equal(name,'notificationQueue');return {where:()=>({limit:()=>({get:async()=>{queries++;return {size:0,docs:[]};}})})};}};
 assert.deepEqual(await processNotificationQueue({db}),{processed:0,scanned:0,attempted:0,accepted:0,failed:0,unknown:0});assert.equal(queries,1);
});

test('provider errors schedule increasing retry delays while unchanged audits do not call the provider',async()=>{
 const {reconcileNotificationHistory}=await import('../lib/history.js');let now=0,lookups=0;
 let tasks=[{team:'관리팀',channel:'sms',status:'sent',providerId:'G_WAIT'}];
 const owner='c'.repeat(64),ids=['d'.repeat(20)];let receipt;
 const doc=path=>({path,get:async()=>({exists:!path.includes('notificationReceipts')||!!receipt,data:()=>path.startsWith('notificationJobs')?{tasks:structuredClone(tasks)}:path.includes('notificationReceipts')?receipt:{owner_key:owner,notification_queue_id:'queue'}})});
 const db={doc,collection:()=>({orderBy:()=>({limit:()=>({get:async()=>({size:1,docs:[{id:'queue',data:()=>({owner_key:owner,ids})}]})})})}),runTransaction:fn=>fn({getAll:(...refs)=>Promise.all(refs.map(r=>r.get()))}),batch:()=>({update:(_,value)=>{tasks=structuredClone(value.tasks);},set:(_,value)=>{receipt=value;},commit:async()=>{}})};
 const run=()=>reconcileNotificationHistory({db,Timestamp:{now:()=>now},config,clock:()=>now,lookup:async()=>{lookups++;return {status:'unconfirmed',reason:'http_429',message:'rate limit'};}});
 await run();assert.equal(lookups,1);assert.equal(Date.parse(tasks[0].delivery_next_check_at),300000);
 now=299999;await run();assert.equal(lookups,1);
 now=300000;await run();assert.equal(lookups,2);assert.equal(Date.parse(tasks[0].delivery_next_check_at),900000);
 now=600000;await run();assert.equal(lookups,2);
});
