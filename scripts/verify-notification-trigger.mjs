import assert from 'node:assert/strict';
import {notificationTriggerURL} from '../src/notification-trigger.js';
// Read-only health and invalid proof: neither request can dispatch a workflow or send SMS.
for(const options of [{method:'GET'},{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:'{}'}]){
 const response=await fetch(notificationTriggerURL,{...options,signal:AbortSignal.timeout(45000)});
 assert.equal(response.status,200,'Apps Script must be accessible without sign-in');
 let data;try{data=await response.json();}catch{throw Error('Apps Script did not return JSON; check web app access is Anyone');}
 assert.equal(data.ok,options.method==='GET','Apps Script health or invalid ownership proof rejection failed');
}
console.log('::notice title=Fast notification bridge verified::Public health and invalid ownership proof rejection passed. No messages were sent by this check.');
