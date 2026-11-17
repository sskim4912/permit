import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequestCache} from '../src/request-cache.js';
const row=(id,version=1)=>({id,version,created:'2026-11-01'});
test('measured mock: first load 100 reads, reuse zero, saving one rechecks one; TTL/manual see external changes',async()=>{
 let now=0,reads=0,queries=0;const source=new Map(Array.from({length:100},(_,i)=>[String(i),row(String(i))]));
 const cache=createRequestCache({clock:()=>now,loadAll:async()=>{queries++;reads+=source.size;return [...source.values()];},loadOne:async id=>{queries++;reads++;return source.get(id)||null;}});
 assert.equal((await cache.read('project/user/org/role')).length,100);assert.equal(reads,100);
 const reused=await cache.read('project/user/org/role');reused[0].version=99;assert.equal((await cache.read('project/user/org/role'))[0].version,1);assert.equal(reads,100);
 source.set('0',row('0',2));cache.changed(['0']);assert.equal((await cache.read('project/user/org/role')).find(r=>r.id==='0').version,2);assert.equal(reads,101);assert.equal(queries,2);
 source.delete('1');cache.changed(['1']);assert.equal((await cache.read('project/user/org/role')).length,99);assert.equal(reads,102);
 source.set('2',row('2',3));await cache.read('project/user/org/role',{force:true});assert.equal(reads,201);
 now=60001;assert.equal((await cache.read('project/user/org/role')).find(r=>r.id==='2').version,3);assert.equal(reads,300);
});
test('scope changes, logout clear and errors cannot reuse privileged records',async()=>{
 let count=0,fail=false;const cache=createRequestCache({loadAll:async()=>{count++;if(fail)throw Error('denied');return [row('a')];},loadOne:async()=>{throw Error('offline');}});
 await cache.read('admin');await cache.read('public');assert.equal(count,2);cache.clear();await cache.read('public');assert.equal(count,3);
 cache.changed(['a']);await assert.rejects(cache.read('public'),/offline/);fail=true;await assert.rejects(cache.read('public'),/denied/);fail=false;await cache.read('public');assert.equal(count,5);
});
test('concurrent reads coalesce and in-flight old identity is rejected',async()=>{
 let resolve,count=0;const cache=createRequestCache({loadAll:()=>{count++;return new Promise(r=>resolve=r);}});
 const first=cache.read('admin'),second=cache.read('admin');assert.equal(count,1);cache.clear();resolve([row('private')]);await assert.rejects(first,/세션/);await assert.rejects(second,/세션/);
});
