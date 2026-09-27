// Repeatable upper-bound benchmark. No network or production data.
const assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const {findOptimalAssignment}=require('../optimizer.js');
const factions=Array.from({length:100},(_,i)=>'F'+i);
const startRss=process.resourceUsage().maxRSS;
const cases={
    neutral:factions.map((_,i)=>({id:'P'+i,name:'Player '+i,preferences:[],bans:[]})),
    sharedRanks:factions.map((_,i)=>({id:'P'+i,name:'Player '+i,preferences:factions.slice(),bans:[]})),
    constrained:factions.map((_,i)=>({id:'P'+i,name:'Player '+i,preferences:[factions[i],factions[(i+1)%100]],bans:factions.filter((_,j)=>j!==i&&j%4===i%4)}))
};
for(const [name,players] of Object.entries(cases))for(const mode of ['total','fairness']){
    const start=performance.now();const result=findOptimalAssignment(players,factions,mode);
    const ms=performance.now()-start;
    assert.equal(result.success,true);assert.equal(new Set(Object.values(result.assignment)).size,100);
    assert.ok(players.every(p=>!p.bans.includes(result.assignment[p.id])));
    assert.ok(ms<2000,`${name}/${mode} exceeded the 2 second development budget`);
    console.log(`${name}/${mode}: ${ms.toFixed(1)} ms, score ${result.score}, minimum ${result.minimum}`);
}
const growth=(process.resourceUsage().maxRSS-startRss)/1024;
assert.ok(growth<32,`Peak process RSS growth ${growth.toFixed(1)} MiB exceeded 32 MiB`);
console.log(`Peak process RSS growth: ${growth.toFixed(1)} MiB (includes runtime/JIT allocation)`);
