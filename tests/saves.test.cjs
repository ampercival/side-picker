const {test}=require('node:test');
const assert=require('node:assert/strict');
const {SaveJournal}=require('../save-journal.js');
function storage(){const map=new Map();return {get length(){return map.size;},key:i=>[...map.keys()][i],getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};}
function journal(options={}){return new SaveJournal({storage:storage(),workspace:'A',send:async()=>({save_version:'v1'}),...options});}
const payload=n=>({name:'game',factions:[n],players:[]});
test('draft survives before debounce and is isolated by workspace and tab',()=>{
 const store=storage(),a=journal({storage:store}),b=journal({storage:store}),c=journal({storage:store,workspace:'B'});
 const p=payload('one');a.stage('session:game','save_session',p,'v0');p.factions.push('mutated');
 b.stage('session:game','save_session',payload('other tab'),'v0');
 assert.equal(a.drafts().length,2);assert.equal(c.drafts().length,0);
 const recovered=journal({storage:store});assert.equal(recovered.entries.size,0);
 assert.deepEqual(recovered.drafts()[0].latest.payload.factions,['one']);
});
test('lost response retries identical operation before sending newer edits',async()=>{
 let serverVersion='v0',serverValue,calls=[],receipts=new Map(),lose=true;
 const j=journal({send:async(action,body)=>{
  calls.push(structuredClone(body));
  if(receipts.has(body.operation_id))return receipts.get(body.operation_id);
  if(body.expected_version!==serverVersion)throw {code:'40001'};
  serverValue=body.factions[0];serverVersion=serverValue;const result={save_version:serverVersion};receipts.set(body.operation_id,result);
  if(lose){lose=false;throw new Error('lost');}return result;
 }});
 j.stage('session:game','save_session',payload('one'),'v0');assert.equal(await j.flushAll(),false);
 j.stage('session:game','save_session',payload('two'),'v0');assert.equal(await j.flushAll(),true);
 assert.deepEqual(calls[0],calls[1]);assert.notEqual(calls[1].operation_id,calls[2].operation_id);
 assert.equal(calls[2].expected_version,'one');assert.equal(serverValue,'two');assert.equal(j.drafts().length,0);
});
test('editing during an in-flight save keeps latest draft until both writes acknowledge',async()=>{
 let release;const calls=[];const j=journal({send:async(a,p)=>{calls.push(structuredClone(p));if(calls.length===1)await new Promise(r=>release=r);return {save_version:'v'+calls.length};}});
 j.stage('session:game','save_session',payload('one'),'v0');const saving=j.flushAll();
 j.stage('session:game','save_session',payload('two'),'v0');assert.equal(j.drafts()[0].latest.payload.factions[0],'two');
 release();assert.equal(await saving,true);assert.equal(calls.length,2);assert.equal(calls[1].expected_version,'v1');
});
test('concurrent cloud edits block retries while retaining recoverable local work',async()=>{
 let count=0;const j=journal({send:async()=>{count++;throw {code:'40001'};}});
 j.stage('session:game','save_session',payload('local'),'old');assert.equal(await j.flushAll(),false);
 j.stage('session:game','save_session',payload('more edits'),'new');assert.equal(await j.flushAll(),false);
 assert.equal(count,1);assert.equal(j.drafts()[0].status,'conflict');assert.equal(j.drafts()[0].latest.payload.factions[0],'more edits');
});
test('revoked access is not retried automatically, network failures are retryable',async()=>{
 let code='FETCH_ERROR';const j=journal({send:async()=>{throw {code};}});
 j.stage('session:game','save_session',payload('local'),'old');await j.flushAll();assert.equal(j.drafts()[0].status,'failed');
 code='42501';await j.flushAll();assert.equal(j.drafts()[0].status,'blocked');
});
test('storage failure never reports a durable draft and still allows an online save',async()=>{
 const broken={length:0,setItem(){throw Error('quota');},removeItem(){},key(){}};
 const j=journal({storage:broken});j.stage('session:game','save_session',payload('local'),null);
 assert.equal(j.storageError,true);assert.equal(j.entries.size,1);assert.equal(await j.flushAll(),true);assert.equal(j.entries.size,0);
});
test('unchanged snapshots are not written and acknowledgement cannot clear another tab draft',async()=>{
 const store=storage(),a=journal({storage:store}),b=journal({storage:store});
 a.remember('session:game','v0',payload('one'));assert.equal(a.stage('session:game','save_session',payload('one'),'v0'),null);
 a.stage('session:game','save_session',payload('two'),'v0');b.stage('session:game','save_session',payload('three'),'v0');
 await a.flushAll();assert.equal(a.drafts().length,1);assert.equal(a.drafts()[0].latest.payload.factions[0],'three');
});
