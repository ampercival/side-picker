function emptyPlayer(name, uuid = () => crypto.randomUUID()) {
    return {id:'player-'+uuid(),name,preferences:[],bans:[],noPreference:false,locked:false,expanded:false};
}
function repeatGame(source, name, uuid = () => crypto.randomUUID()) {
    return {sessionName:name,gameTitle:source.gameTitle||'',factions:[...(source.factions||[])],
        players:(source.players||[]).map(p=>emptyPlayer(p.name,uuid)),roomCode:'',roomStage:null,results:null};
}
function parseBulkNames(text, existing = [], limit = 100) {
    if(typeof text!=='string' || text.length>60000)throw new Error('Paste a shorter list.');
    const seen=new Set(existing.map(name=>name.normalize('NFC').toLowerCase())), names=[];
    let duplicates=0;
    for(const value of text.split(/[\r\n,]+/)){
        const name=value.trim();if(!name)continue;
        if(name.length>500)throw new Error('Each name must be at most 500 characters.');
        const key=name.normalize('NFC').toLowerCase();
        if(seen.has(key)){duplicates++;continue;}
        seen.add(key);names.push(name);
    }
    if(existing.length+names.length>limit)throw new Error(`Use at most ${limit} entries in one session. Nothing was added.`);
    return {names,duplicates};
}
let repeatSessionSource = null, creatingSession = false, bulkKind = 'players';
function openRepeatSession(name) {
    const source=sessionsCache[name];if(!source)return;
    startNewSession();
    repeatSessionSource=JSON.parse(JSON.stringify(source));
    const base=((source.sessionName||name).slice(0,460))+t(' (next)');
    let next=base, index=2;while(sessionsCache[next])next=base+' '+index++;
    get('new-session-input').value=next;
    uiText(get('new-session-title'), 'Repeat this session');
    uiText(get('new-session-help'), 'Keep the game, factions, and player names. Start with empty choices, fresh player invitations, and no results. The original stays saved.');
    get('new-session-input').focus();get('new-session-input').select();
}
function openBulkEntry(kind) {
    bulkKind=kind;
    uiText(get('bulk-title'), kind==='players'?'Add several players':'Add several factions');
    get('bulk-input').value='';previewBulkEntry();
    get('modal-overlay').classList.add('active');get('bulk-modal').classList.add('active');get('bulk-input').focus();
}
function currentBulkNames(){return bulkKind==='players'?state.players.map(p=>p.name):state.factions;}
function previewBulkEntry(){
    try{
        const {names,duplicates}=parseBulkNames(get('bulk-input').value,currentBulkNames());
        uiText(get('bulk-preview'), () => t('{0} to add', names.length) + (duplicates ? ' · ' + t(duplicates === 1 ? '{0} duplicate entry skipped' : '{0} duplicate entries skipped', duplicates) : ''));
        get('bulk-add').disabled=!names.length;
    }catch(error){uiText(get('bulk-preview'), error.message);get('bulk-add').disabled=true;}
}
function applyBulkEntry(){
    try{
        const {names,duplicates}=parseBulkNames(get('bulk-input').value,currentBulkNames());
        if(!names.length)return;
        if(bulkKind==='players'){state.players.push(...names.map(name=>emptyPlayer(name)));renderPlayers();}
        else {state.factions.push(...names);get('game-select').value='custom';renderFactions();updateAllPlayerFactions();}
        autoSave();closeModals();showToast('success',`Added ${names.length} ${bulkKind}`,duplicates?`Skipped ${duplicates} duplicate entries.`:'Ready to use.');
    }catch(error){showToast('error','Could not add names',error.message);}
}
if(typeof module!=='undefined')module.exports={emptyPlayer,repeatGame,parseBulkNames};
