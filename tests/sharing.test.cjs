const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const {formatResultsSummary}=require('../sharing.js');
test('summary includes game, declared goal and explanations as plain text',()=>{
    const text=formatResultsSummary({t:'Friday',gm:'Example',g:'Fairest for Everyone',pct:70,r:[{n:'Alex',f:'A',note:'Choice #2',s:7},{n:'<img>',f:'B',note:'Neutral',s:0}]});
    assert.match(text,/Friday · Example/);assert.match(text,/Goal: Fairest for Everyone/);assert.match(text,/Alex: A — Choice #2 \(\+7 points\)/);assert.ok(!text.includes('#organizer'));
});
function workflow(){
    const elements=new Map(),ctx=vm.createContext({...require('../i18n.js'),console,setTimeout,clearTimeout,window:{matchMedia:()=>({matches:true})},localStorage:{getItem:()=>null},
        document:{documentElement:{removeAttribute(){}},addEventListener(){},getElementById:id=>{if(id==='theme-toggle')return null;if(!elements.has(id))elements.set(id,{style:{}});return elements.get(id);}},
        getWorkspaceKey:()=> 'workspace',setRoomStage:async()=>true});
    vm.runInContext(['optimizer.js','results.js','script.js','sharing.js'].map(f=>fs.readFileSync(f,'utf8')).join('\n'),ctx);
    vm.runInContext(`state.factions=['A','B'];state.players=[{id:'p',name:'Alex',preferences:['A'],bans:[]}];state.roomCode='ROOM';activeSessionName='game';
        var saves=0,toasts=[]; autoSave=()=>saves++;flushSession=async()=>true;closeModal=()=>{};switchView=()=>{};showToast=(...args)=>toasts.push(args);
        runOptimization=async(p,f,m)=>findOptimalAssignment(p,f,m);
        showGoalComparison=(results,snapshot)=>{goalComparison={results,snapshot}};
        displayResults=(result,snapshot,goal)=>{lastResults={g:goal,r:Object.values(result.assignment)}};`,ctx);
    return {ctx,run:code=>vm.runInContext(code,ctx)};
}
test('both goals are previewed without publication; only an explicit choice saves the selected goal',async()=>{
    const {run}=workflow();await run('calculateOptimization()');
    assert.equal(run('state.results'),null);assert.equal(run('saves'),0);
    assert.equal(run('goalComparison.results.total.success && goalComparison.results.fairness.success'),true);
    await run("publishGoalComparison('fairness')");assert.equal(run('saves'),1);assert.equal(run('state.results.g'),'Fairest for Everyone');
});
test('a stale preview cannot publish after choices change',async()=>{
    const {run}=workflow();await run('calculateOptimization()');run("state.players[0].preferences=['B']");
    await run("publishGoalComparison('total')");assert.equal(run('saves'),0);assert.equal(run('state.results'),null);
    assert.equal(run('toasts[0][1]'),'Picks changed');
});
test('vendored QR encoder retains the reviewed upstream bytes',()=>{
    const bytes=fs.readFileSync('vendor/qrcode-generator-1.4.4.js');
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),'18ae399f81182bc9de916e9c77b195df20cc58d6f2d55a62b085a299f1bf1780');
});
