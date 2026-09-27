const {test}=require('node:test'),assert=require('node:assert/strict');
const {repeatGame,parseBulkNames}=require('../repeat-games.js');
test('repeat keeps setup but creates independent players with no picks, result or invitation identity',()=>{
    const original={id:'old',sessionName:'Old',gameTitle:'Game',factions:['A','B'],roomCode:'OLD',results:{v:1},players:[{id:'old-player',name:'Alex',preferences:['A'],bans:['B'],noPreference:true,locked:true,submittedAt:'yesterday',submittedSource:'player'}]};
    const before=JSON.stringify(original);let n=0;
    const copy=repeatGame(original,'Next',()=>String(++n));
    assert.equal(copy.sessionName,'Next');assert.equal(copy.gameTitle,'Game');assert.deepEqual(copy.factions,['A','B']);
    assert.deepEqual(copy.players,[{id:'player-1',name:'Alex',preferences:[],bans:[],noPreference:false,locked:false,expanded:false}]);
    assert.equal(copy.roomCode,'');assert.equal(copy.results,null);assert.equal(copy.id,undefined);
    copy.factions.push('C');copy.players[0].preferences.push('C');assert.equal(JSON.stringify(original),before);
});
test('bulk names trim, skip empty entries, deduplicate case and Unicode without mutating the existing list',()=>{
    const existing=['Alex'];
    assert.deepEqual(parseBulkNames(' Alex, Jordan\r\n  jordan  \n\nZoë,Zoe\u0308, Taylor ',existing),{names:['Jordan','Zoë','Taylor'],duplicates:3});
    assert.deepEqual(existing,['Alex']);
    assert.throws(()=>parseBulkNames('X'.repeat(501)),/500/);
    assert.throws(()=>parseBulkNames('B,C',['A'],2),/Nothing has been added/);
    assert.deepEqual(parseBulkNames('A',['A'],1),{names:[],duplicates:1});
});
