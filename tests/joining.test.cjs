const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), nodeCrypto = require('node:crypto');
const T = 'f'.repeat(64), T2 = 'e'.repeat(64);
const plain = value => JSON.parse(JSON.stringify(value));

// Loads the real room code with a scripted database and simple page elements.
function room(responses, elements = {}) {
    const calls = [], saves = [], replaced = [];
    const storage = new Map([['side_picker_private_workspace_v1', JSON.stringify({ credential: 'a'.repeat(64), ownerKey: 'A' })]]);
    const ctx = vm.createContext({
        console, crypto: nodeCrypto.webcrypto, TextEncoder, URL, URLSearchParams, setTimeout, clearTimeout,
        location: { href: 'https://example.test/side-picker/?room=ROOM', replace: url => replaced.push(url), reload: () => replaced.push('reload') },
        localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) },
        sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
        window: { SUPABASE_CONFIG: { url: 'https://fixture.invalid', publishableKey: 'x' }, supabase: { createClient: () => ({
            async rpc(fn, args) { calls.push({ fn, ...plain(args) }); const reply = responses[fn + ':' + (args.action || 'read')];
                return reply instanceof Error ? { data: null, error: reply } : { data: reply ?? {}, error: null }; } }) } },
        activeSessionName: 'Session', state: { players: [], factions: ['A', 'B', 'C'], roomCode: 'ROOM' }, isGuestMode: false,
        get: id => elements[id] || null, showToast() {}, autoSave: () => saves.push(1), renderPlayers() {}
    });
    for (const file of ['access.js', 'save-journal.js', 'optimizer.js', 'rooms.js']) vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
    return { ctx, calls, saves, replaced, run: code => vm.runInContext(code, ctx) };
}

test('the organizer picks up joined players once, with their picks, and never revives a removed one', async () => {
    const status = { stage: 'collecting', join: { open: true, min: 2, max: 3 },
        joins: [{ id: 'j1', name: 'Sam' }, { id: 'j2', name: 'Kim' }],
        picks: [{ player_id: 'j1', preferences: ['A'], bans: ['C'], no_preference: false, updated_at: 't1', source: 'player' }] };
    const t = room({ 'sp_workspace:room_status': status });
    t.run('removedPlayerIds.add("j2")');
    await t.run('refreshRoomSubmissions(roomEpoch)');
    const players = plain(t.run('state.players'));
    assert.deepEqual(players.map(p => [p.id, p.name, p.joined]), [['j1', 'Sam', true]]);
    assert.deepEqual([players[0].preferences, players[0].bans], [['A'], ['C']]);
    assert.equal(t.saves.length, 1, 'the new player is saved so the server knows this device has seen them');
    assert.deepEqual(plain(t.run('state.roomJoin')), { open: true, min: 2, max: 3 });
    await t.run('refreshRoomSubmissions(roomEpoch)');
    assert.equal(t.run('state.players.length'), 1, 'no duplicate on the next poll');
});

test('joining sends only the name through the group link and continues as the new player', async () => {
    const elements = { 'guest-join-name': { value: '  Sam  ', focus() {} }, 'guest-join-button': { disabled: false } };
    const t = room({ 'sp_room:join': { player_id: 'player-x', player_name: 'Sam', token: T2 } }, elements);
    t.run(`guestAccess = { player: '', token: '${T}' }; guestSession = { code: 'ROOM' }`);
    await t.run('joinSession()');
    const join = t.calls.find(c => c.action === 'join');
    assert.deepEqual([join.room, join.player, join.credential, join.payload], ['ROOM', '', T, { name: 'Sam' }]);
    const url = new URL(t.replaced[0]);
    assert.equal(url.searchParams.get('room'), 'ROOM');
    assert.deepEqual(Object.fromEntries(new URLSearchParams(url.hash.slice(1))), { player: 'player-x', token: T2 });
    assert.equal(t.replaced[1], 'reload', 'a fragment-only change must be followed by a reload');
});

test('the join panel shows only on an open group link, and says when the session is full', () => {
    const el = () => ({ hidden: false, textContent: '' });
    const elements = { 'guest-join': el(), 'guest-join-status': el(), 'guest-join-form': el() };
    const t = room({}, elements);
    t.run(`guestSession = { code: 'ROOM' }`);
    const show = (access, join) => { t.run(`guestAccess = ${JSON.stringify(access)}`); t.ctx.data = { join }; t.run('renderGuestJoin(data)'); };
    show({ player: 'p1', token: T }, { open: true, taken: 1, max: 3 });
    assert.equal(elements['guest-join'].hidden, true, 'players with a seat do not see it');
    show({ player: '', token: T }, { open: false, taken: 1, max: 3 });
    assert.equal(elements['guest-join'].hidden, true, 'closed joining is view only');
    show({ player: '', token: T }, { open: true, taken: 1, max: 3, min: 2 });
    assert.equal(elements['guest-join'].hidden, false);
    assert.equal(elements['guest-join-form'].hidden, false);
    assert.match(elements['guest-join-status'].textContent, /1 of 3 seats taken; the organizer needs at least 2/);
    show({ player: '', token: T }, { open: true, taken: 3, max: 3 });
    assert.equal(elements['guest-join-form'].hidden, true);
    assert.match(elements['guest-join-status'].textContent, /This session is full \(3 of 3 seats\)/);
});
