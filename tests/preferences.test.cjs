const {test} = require('node:test');
const assert = require('node:assert/strict');
const {preferenceRanks,setPreferenceRank,setPreferenceOrder,getScore,validateOptimizerInput,findOptimalAssignment} = require('../optimizer.js');
const make = () => ({id:'p',name:'Player',preferences:['A','B','C','D','E','F'],bans:[]});

test('ties consume positions, split cleanly, and score every member equally', () => {
    const p = make();
    setPreferenceRank(p,'B',1);
    assert.deepEqual(preferenceRanks(p),[1,1,3,4,5,6]);
    setPreferenceRank(p,'D',3); setPreferenceRank(p,'E',3);
    assert.deepEqual(preferenceRanks(p),[1,1,3,3,3,6]);
    assert.deepEqual(p.preferences.map(f=>getScore(p,f)),[10,10,4,4,4,1]);
    setPreferenceRank(p,'B','separate');
    assert.deepEqual(preferenceRanks(p),[1,2,3,3,3,6]);
    assert.equal(validateOptimizerInput([p],make().preferences,'total'),null);
    p.noPreference=true;
    assert.deepEqual(p.preferences.map(f=>getScore(p,f)),[10,10,10,10,10,10]);
    p.noPreference=false;
    assert.equal(getScore(p,'C'),4);
});

test('removal, reordering and new preferences preserve only adjacent ties', () => {
    const p=make();setPreferenceRank(p,'B',1);setPreferenceRank(p,'D',3);
    setPreferenceOrder(p,['B','C','D','E','F']);
    assert.deepEqual(preferenceRanks(p),[1,2,2,4,5]);
    setPreferenceOrder(p,['B','C','D','E','F','A']);
    assert.deepEqual(preferenceRanks(p),[1,2,2,4,5,6]);
    setPreferenceOrder(p,['C','B','D','E','F','A']);
    assert.deepEqual(preferenceRanks(p),[1,2,3,4,5,6]);
});

test('invalid ranks cannot reach scoring and legacy saves keep their scores', () => {
    const p=make();
    assert.deepEqual(p.preferences.map(f=>getScore(p,f)),[10,7,4,2,1,1]);
    for (const ranks of [[1,1,2,4,5,6],[0,2,3,4,5,6],[1],{},[1,2,3,4,5,'6']]) {
        p.preferenceRanks=ranks;
        assert.match(validateOptimizerInput([p],make().preferences,'total'),/ranks/);
    }
});

test('both assignment goals value a tied first choice as first', () => {
    const p={id:'p',name:'P',preferences:['A','B'],preferenceRanks:[1,1],bans:[]};
    const q={id:'q',name:'Q',preferences:['A'],bans:['B']};
    for(const goal of ['total','fairness']) {
        const result=findOptimalAssignment([p,q],['A','B'],goal);
        assert.equal(result.success,true);assert.equal(result.score,20);
        assert.equal(result.assignment.p,'B');
    }
});
