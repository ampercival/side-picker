const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { findOptimalAssignment } = require('../optimizer.js');
const { describeResultRows } = require('../results.js');
const player = (id, preferences = [], bans = [], noPreference = false) => ({ id, name: id, preferences, bans, noPreference });

// Independent enumeration: generate faction permutations, discard forbidden
// assignments, then compare the two objectives without using production scoring.
function reference(players, factions, mode) {
    let best = null;
    function walk(chosen, remaining) {
        if (chosen.length === players.length) {
            if (players.some((p, i) => p.bans.includes(chosen[i]))) return;
            const scores = players.map((p, i) => {
                const rank = p.preferences.indexOf(chosen[i]);
                return rank < 0 ? 0 : p.noPreference ? 10 : ([10, 7, 4, 2][rank] ?? 1);
            });
            const total = scores.reduce((a, b) => a + b, 0), minimum = Math.min(...scores);
            const metric = mode === 'total' ? [total, minimum] : [minimum, total];
            if (!best || metric[0] > best[0] || metric[0] === best[0] && metric[1] > best[1]) best = metric;
            return;
        }
        remaining.forEach((f, i) => walk([...chosen, f], remaining.filter((_, j) => i !== j)));
    }
    walk([], factions);
    return best;
}

test('bans are absolute and conflicts identify the affected players', () => {
    for (const mode of ['total', 'fairness']) {
        const single = findOptimalAssignment([player('Alex', [], ['A'])], ['A'], mode);
        assert.equal(single.success, false); assert.match(single.reason, /Alex.*banned every/);
        const group = findOptimalAssignment([player('Alex', ['A'], ['B']), player('Jordan', ['A'], ['B'])], ['A', 'B'], mode);
        assert.equal(group.success, false); assert.match(group.reason, /Alex/); assert.match(group.reason, /Jordan/);
        assert.match(group.reason, /only 1 available/);
    }
});

test('both goals and secondary tie-breaks match an independent reference over 400 cases', () => {
    let seed = 913;
    const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
    for (let c = 0; c < 200; c++) {
        const factions = Array.from({ length: 2 + c % 5 }, (_, i) => 'F' + i);
        const players = Array.from({ length: 1 + c % Math.min(5, factions.length) }, (_, i) => {
            const order = factions.map(f => ({ f, key: random() })).sort((a, b) => a.key - b.key).map(x => x.f);
            const preferences = [], bans = [];
            order.forEach(f => { const r = random(); if (r < .2) bans.push(f); else if (r < .8) preferences.push(f); });
            return player('P' + i, preferences, bans, random() < .2);
        });
        const before = JSON.stringify(players);
        for (const mode of ['total', 'fairness']) {
            const expected = reference(players, factions, mode);
            const actual = findOptimalAssignment(players, factions, mode);
            assert.equal(actual.success, expected !== null);
            if (!actual.success) continue;
            const chosen = players.map(p => actual.assignment[p.id]);
            assert.equal(new Set(chosen).size, players.length);
            assert.ok(players.every((p, i) => factions.includes(chosen[i]) && !p.bans.includes(chosen[i])));
            const scores = players.map((p, i) => { const rank = p.preferences.indexOf(chosen[i]); return rank < 0 ? 0 : p.noPreference ? 10 : ([10, 7, 4, 2][rank] ?? 1); });
            const total = scores.reduce((a, b) => a + b, 0), min = Math.min(...scores);
            assert.deepEqual(mode === 'total' ? [total, min] : [min, total], expected);
            assert.equal(actual.score, total);
        }
        assert.equal(JSON.stringify(players), before);
    }
});

test('malformed inputs fail clearly, neutral and unranked choices remain valid', () => {
    for (const [players, factions, mode] of [
        [[], ['A'], 'total'], [[player('P')], ['A', 'A'], 'total'],
        [[player('P', ['missing'])], ['A'], 'total'], [[player('P', ['A'], ['A'])], ['A'], 'total'],
        [[player('P'), player('P')], ['A', 'B'], 'total'], [[player('P')], ['A'], 'unknown']
    ]) assert.equal(findOptimalAssignment(players, factions, mode).success, false);
    assert.equal(findOptimalAssignment([player('__proto__')], ['A'], 'total').assignment.__proto__, 'A');
    assert.equal(findOptimalAssignment([player('P', ['B', 'A'], [], true)], ['A', 'B'], 'total').score, 10);
    assert.equal(findOptimalAssignment([player('P')], ['A'], 'fairness').score, 0);
});

function loadRunner() {
    const elements = new Map();
    const context = vm.createContext({ console, Blob, TextEncoder, TextDecoder, atob, btoa,
        localStorage: { getItem: () => null }, window: { matchMedia: () => ({ matches: true }) },
        document: { documentElement: { removeAttribute() {} }, addEventListener() {},
            getElementById: id => { if (id === 'theme-toggle') return null; if (!elements.has(id)) elements.set(id, { style: {} }); return elements.get(id); } },
        getWorkspaceKey: () => 'test', URL: { createObjectURL: blob => { context.workerBlob = blob; return 'blob:test'; }, revokeObjectURL() {} },
        Worker: class { constructor() { context.worker = this; } postMessage(data) { this.input = data; } terminate() { this.terminated = true; } }
    });
    vm.runInContext(['optimizer.js', 'results.js', 'script.js'].map(f => fs.readFileSync(f, 'utf8')).join('\n'), context);
    vm.runInContext("state.factions=['A','B']; state.players=[{id:'p',name:'Alex',preferences:['A'],bans:[]}];", context);
    return context;
}

test('worker includes validation/conflict helpers and cancellation terminates the pending solve', async () => {
    const context = loadRunner();
    const pending = vm.runInContext("runOptimization(state.players, state.factions, 'total')", context);
    const rejected = assert.rejects(pending, /cancelled/);
    const self = { postMessage(value) { this.result = value; } };
    vm.runInNewContext(await context.workerBlob.text(), { self });
    self.onmessage({ data: context.worker.input });
    assert.equal(self.result.ok, true); assert.equal(self.result.result.assignment.p, 'A');
    vm.runInContext('cancelOptimization()', context);
    await rejected;
    assert.equal(context.worker.terminated, true);
});

test('snapshot guard rejects changed picks/session, while display-only changes do not invalidate it', () => {
    const context = loadRunner();
    vm.runInContext('const snapshot = optimizationSnapshot(); state.players[0].expanded=true;', context);
    assert.equal(vm.runInContext('optimizationSnapshotIsCurrent(snapshot)', context), true);
    vm.runInContext("state.players[0].preferences=['B'];", context);
    assert.equal(vm.runInContext('optimizationSnapshotIsCurrent(snapshot)', context), false);
    assert.equal(vm.runInContext('snapshot.players[0].preferences[0]', context), 'A');
    vm.runInContext("state.players[0].preferences=['A']; activeSessionName='different';", context);
    assert.equal(vm.runInContext('optimizationSnapshotIsCurrent(snapshot)', context), false);
});

test('summary counts unranked choices separately from ranked top-three picks', () => {
    const text = describeResultRows([{ note: 'Choice #1', s: 10 }, { note: 'Choice #3', s: 4 }, { note: 'Choice', s: 10 }, { note: 'Neutral', s: 0 }]);
    assert.match(text, /First choices: 1/); assert.match(text, /including first\): 2/);
    assert.match(text, /Unranked preferences: 1/); assert.match(text, /Neutral: 1/);
});
