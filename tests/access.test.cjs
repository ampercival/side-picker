const { test } = require('node:test');
const assert = require('node:assert/strict');
const { newPrivateToken, parseOrganizerLink, makePrivateLink, parsePlayerLink, privateTokenHash } = require('../access.js');
const fs = require('node:fs');
const vm = require('node:vm');
const base = 'https://example.test/side-picker/';
test('private links use strong tokens and never inherit other credentials or queries', async () => {
    const token = newPrivateToken(); assert.match(token, /^[0-9a-f]{64}$/); assert.notEqual(token, newPrivateToken());
    const organizer = makePrivateLink('organizer', token, {}, base + '?room=old#token=old');
    assert.equal(parseOrganizerLink(organizer, base), token); assert.equal(new URL(organizer).search, '');
    const player = makePrivateLink('player', token, { room: 'ABC', player: 'p/1' }, organizer);
    assert.ok(!player.includes('organizer')); assert.deepEqual(parsePlayerLink(new URL(player).hash), { token, player: 'p/1' });
    assert.equal(await privateTokenHash(token), require('node:crypto').createHash('sha256').update(token).digest('hex'));
});
test('rejects shortened tokens, unrelated origins and ambiguous organizer links', () => {
    for (const value of ['https://evil.test/#organizer=' + 'a'.repeat(64), base + '?room=ABC#organizer=' + 'a'.repeat(64), base + '#organizer=short']) {
        assert.throws(() => parseOrganizerLink(value, base));
    }
    assert.equal(parsePlayerLink('#token=short&player=p1'), null);
});
test('save requests capture immutable data and workspace credentials before queued writes', async () => {
    const requests = [], storage = new Map(); let resolveFirst;
    storage.set('side_picker_private_workspace_v1', JSON.stringify({credential:'a'.repeat(64),ownerKey:'A'}));
    const ctx = vm.createContext({...require('../i18n.js'),console, crypto:require("node:crypto").webcrypto, renderSaveStatus(){}, setTimeout, clearTimeout, URL, URLSearchParams,
        localStorage:{getItem:k=>storage.get(k)}, showToast(){}, window:{SUPABASE_CONFIG:{url:'https://fixture.invalid',publishableKey:'x'},
        supabase:{createClient:()=>({rpc:async (_,args)=>{ requests.push(args); if(requests.length===1)await new Promise(r=>resolveFirst=r); return {data:{},error:null}; }})}}});
    vm.runInContext(fs.readFileSync('access.js','utf8')+'\n'+fs.readFileSync('save-journal.js','utf8')+'\n'+fs.readFileSync('rooms.js','utf8'),ctx);
    const s = {players:[],factions:['A'],sessionName:'Before'}; ctx.s = s;
    const first = vm.runInContext("upsertSessionToDb('one',s)",ctx);
    const second = vm.runInContext("upsertSessionToDb('two',s)",ctx);
    s.sessionName='Changed'; s.factions.push('B');
    storage.set('side_picker_private_workspace_v1',JSON.stringify({credential:'b'.repeat(64),ownerKey:'B'}));
    await new Promise(r=>setImmediate(r)); resolveFirst(); await first; await second;
    assert.deepEqual(requests.map(x=>x.credential),['a'.repeat(64),'a'.repeat(64)]);
    assert.equal(requests[1].payload.session_name,'Before'); assert.deepEqual(Array.from(requests[1].payload.factions),['A']);
    // A later edit in the original tab must still use its original workspace.
    await vm.runInContext("upsertSessionToDb('three',s)",ctx);
    assert.equal(requests[2].credential,'a'.repeat(64));
});
test('revoked capability and network errors cannot report successful saves', async () => {
    const ctx = vm.createContext({...require('../i18n.js'),crypto:require('node:crypto').webcrypto,renderSaveStatus(){},setTimeout,clearTimeout,localStorage:{getItem:()=>JSON.stringify({credential:'a'.repeat(64),ownerKey:'A'})},showToast(){},
        window:{SUPABASE_CONFIG:{url:'https://fixture.invalid'},supabase:{createClient:()=>({rpc:async()=>({data:null,error:{code:'42501'}})})}}});
    vm.runInContext(fs.readFileSync('access.js','utf8')+'\n'+fs.readFileSync('save-journal.js','utf8')+'\n'+fs.readFileSync('rooms.js','utf8'),ctx);
    assert.equal(await vm.runInContext("upsertSessionToDb('one',{factions:[],players:[]})",ctx),false);
    assert.equal(await vm.runInContext("deleteSessionFromDb('one')",ctx),false);
});
test('a slow startup response cannot replace a workspace opened afterward', async () => {
    const storage=new Map([['side_picker_private_workspace_v1',JSON.stringify({credential:'a'.repeat(64),ownerKey:'A'})]]);
    let release;
    const ctx=vm.createContext({...require('../i18n.js'),crypto:require('node:crypto').webcrypto,URL,URLSearchParams,setTimeout,clearTimeout,
        location:{hash:'',href:base},activeSessionName:null,state:{},flushSession:async()=>true,
        localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},renderSaveStatus(){},renderHomeSessions(){},renderPresetOptions(){},closeModals(){},switchView(){},showToast(){},
        get:()=>({value:base+'#organizer='+'b'.repeat(64)}),
        window:{SUPABASE_CONFIG:{url:'https://fixture.invalid'},supabase:{createClient:()=>({rpc:async(_,args)=>{
            if(args.credential==='a'.repeat(64))await new Promise(r=>release=r);
            return {data:{owner_key:args.credential[0].toUpperCase(),sessions:[],presets:[]},error:null};
        }})}}});
    vm.runInContext(fs.readFileSync('access.js','utf8')+'\n'+fs.readFileSync('save-journal.js','utf8')+'\n'+fs.readFileSync('rooms.js','utf8'),ctx);
    const startup=vm.runInContext('initializePrivateWorkspace()',ctx);
    await vm.runInContext('importOrganizerLink()',ctx);release();await startup;
    assert.equal(vm.runInContext('getWorkspaceKey()',ctx),'B');
    assert.equal(JSON.parse(storage.get('side_picker_private_workspace_v1')).ownerKey,'B');
});
