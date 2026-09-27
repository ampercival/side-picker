const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
function fixture(){
    const elements=new Map();
    const ctx=vm.createContext({window:{},setTimeout,clearTimeout,console,navigator:{onLine:true},
        get:id=>{if(!elements.has(id))elements.set(id,{style:{}});return elements.get(id);},state:{factions:['A','B']},
        renderGuestRoster(){},refreshListsForCard(){},validateResultsPayload:()=>null,showToast(){},
        localStorage:{getItem:()=>'{"ownerKey":"workspace"}'},renderPlayers(){},renderRoomStatus(){},updateRoomBanner(){},activeSessionName:'game',autoSave(){},
        document:{body:{classList:{remove(){}}}},switchView(){},isGuestMode:true});
    vm.runInContext(fs.readFileSync('rooms.js','utf8'),ctx);
    vm.runInContext("renderGuestRoster=()=>{}; updateRoomBanner=()=>{}; renderRoomStatus=()=>{}; guestAccess={player:'p1'};guestPick={id:'p1',name:'Alex',preferences:[],bans:[],noPreference:false};guestSession={code:'ROOM'};guestSavedChoices=pickSignature(guestPick);",ctx);
    return {ctx,elements,run:code=>vm.runInContext(code,ctx)};
}
const room={stage:'collecting',revision:'r1',factions:['A','B'],player_name:'Alex',players:[],mine:null,initial_choices:{preferences:[],bans:[],noPreference:false}};
test('neutral submissions count, host edits invalidate the submitted badge',()=>{
    const {run}=fixture();
    assert.equal(run("playerHasSubmitted({submittedAt:'now',preferences:[],bans:[],submittedChoices:[[],[],false]})"),true);
    assert.equal(run("playerSubmissionLabel({submittedAt:'now',preferences:['A'],bans:[],submittedChoices:[[],[],false]})"),'Edited since submission');
    assert.equal(run("playerSubmissionLabel({submittedAt:'now',submittedSource:'organizer'})"),'Organizer updated');
});
test('guest gets organizer changes when clean; dirty choices require an explicit decision',()=>{
    const {ctx,run,elements}=fixture();ctx.data=room;run('applyGuestRoom(data)');
    run("guestPick.preferences=['B']");
    ctx.data={...room,mine:{updated_at:'t1',source:'organizer',preferences:['A'],bans:[],no_preference:false}};
    run('applyGuestRoom(data)');assert.equal(run('guestDirtyConflict'),true);
    assert.equal(run('guestPick.preferences[0]'),'B');assert.equal(elements.get('guest-submit-button').disabled,true);
    run('useLatestGuestChoices()');assert.equal(run('guestPick.preferences[0]'),'A');assert.equal(run('guestDirtyConflict'),false);
    ctx.data={...ctx.data,mine:{...ctx.data.mine,updated_at:'t2',preferences:[]}};run('applyGuestRoom(data)');
    assert.equal(run('guestPick.preferences.length'),0);
    ctx.data={...ctx.data,stage:'locked'};run('applyGuestRoom(data)');assert.equal(elements.get('guest-submit-button').disabled,true);
});
test('late guest response cannot acknowledge another room and in-flight edits stay unsubmitted',async()=>{
    const {ctx,run}=fixture();ctx.data=room;run('applyGuestRoom(data)');
    let release;ctx.request=()=>new Promise(r=>release=r);run('guestRequest=request');
    const saving=run('submitMyPicks()');run("guestPick.preferences=['A']");
    release({...room,mine:{updated_at:'t1',source:'player',preferences:[],bans:[],no_preference:false}});await saving;
    assert.notEqual(run('guestSavedChoices'),run('pickSignature(guestPick)'));
    const second=run('submitMyPicks()');run('deactivateRoomSync();guestSavedChoices="other room"');
    release({...room,mine:{updated_at:'t2',preferences:['A'],bans:[],no_preference:false}});await second;
    assert.equal(run('guestSavedChoices'),'other room');
});
test('host polling does not overwrite pending edits or a different session',async()=>{
    const {ctx,run}=fixture();run("state.players=[{id:'p1',preferences:['A'],bans:[]}]; journal={entries:new Map([['session:game',{}]])}");
    ctx.response={stage:'collecting',picks:[{player_id:'p1',updated_at:'t1',preferences:['B'],bans:[],no_preference:false}]};
    run('workspaceRequest=async()=>response');await run('refreshRoomSubmissions()');assert.equal(run('state.players[0].preferences[0]'),'A');
    let release;ctx.request=()=>new Promise(r=>release=r);run('workspaceRequest=request;journal.entries.clear()');
    const pending=run('refreshRoomSubmissions()');run('activeSessionName="another"');release(ctx.response);await pending;
    assert.equal(run('state.players[0].preferences[0]'),'A');
});
