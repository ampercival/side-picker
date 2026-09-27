const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), nodeCrypto = require('node:crypto');
const base = 'https://example.test/side-picker/';
const sha = value => nodeCrypto.createHash('sha256').update(value).digest('hex');
const A = 'a'.repeat(64), T = 'f'.repeat(64);
const plain = value => JSON.parse(JSON.stringify(value));

// Loads the real browser scripts against a scripted database and sign-in client.
function app({ responses = {}, session = { user: { id: 'u1', app_metadata: { provider: 'google' } } }, providers = ['google'], choice = 'add', games = 0 } = {}) {
    const storage = new Map([['side_picker_private_workspace_v1', JSON.stringify({ credential: A, ownerKey: 'A' })]]);
    const calls = [], signOuts = [], toasts = [], visits = [];
    const client = {
        auth: { onAuthStateChange() {}, async getSession() { return { data: { session } }; }, async signOut(options) { signOuts.push(options); return {}; } },
        async rpc(fn, args) {
            calls.push({ fn, ...plain(args) });
            const reply = responses[fn === 'sp_account' ? args.action : fn + ':' + args.action];
            const value = typeof reply === 'function' ? reply(args) : reply;
            return value instanceof Error ? { data: null, error: value } : { data: value ?? {}, error: null };
        }
    };
    const ctx = vm.createContext({
        console, crypto: nodeCrypto.webcrypto, TextEncoder, URL, URLSearchParams, setTimeout, clearTimeout, navigator: { userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/140.0' },
        location: { href: base, origin: 'https://example.test', pathname: '/side-picker/', hash: '', assign: url => visits.push(url) },
        localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k), key: () => null, length: 0 },
        sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
        window: { SUPABASE_CONFIG: { url: 'https://fixture.invalid', publishableKey: 'x', accountProviders: providers }, supabase: { createClient: () => client } },
        isGuestMode: false, activeSessionName: null, state: {}, get: () => null, showToast: (type, title) => toasts.push([type, title]),
        showConfirm: (_title, _message, ok, _label, _style, cancel) => (choice === 'keep' ? cancel?.() : ok()),
        closeModals() {}, goHome: async () => {}, flushSession: async () => true, loadSessionsFromDb: async () => true,
        renderSaveStatus() {}, renderHomeSessions() {}, renderPresetOptions() {}, switchView() {}, updateWorkspaceIndicator() {}
    });
    for (const file of ['access.js', 'save-journal.js', 'rooms.js', 'accounts.js']) vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
    vm.runInContext('accountSession = { user: { id: "u1", app_metadata: { provider: "google" } } }', ctx);
    for (let i = 0; i < games; i++) vm.runInContext(`sessionsCache['Game ${i}'] = {}`, ctx);
    const local = () => JSON.parse(storage.get('side_picker_private_workspace_v1') || 'null');
    const parked = () => JSON.parse(storage.get('side_picker_parked_workspace_v1') || 'null');
    return { ctx, calls, signOuts, toasts, visits, local, parked, run: code => vm.runInContext(code, ctx), actions: () => calls.map(c => c.action) };
}
const accountList = (...owners) => ({ workspaces: owners.map(owner_key => ({ owner_key, sessions: [], presets: [], keys: [] })), invitations: [] });
const loads = args => ({ owner_key: args.credential === A ? 'A' : 'B', sessions: [], presets: [] });

test('sign-in returns are read once and removed without touching other link parts', () => {
    const { takeAuthCallback } = require('../accounts.js');
    assert.equal(takeAuthCallback(base), null);
    assert.equal(takeAuthCallback(base + '?room=ABC#player=p&token=' + A), null);
    assert.deepEqual(takeAuthCallback(base + '?code=xyz'), { code: 'xyz', error: null });
    assert.deepEqual(takeAuthCallback(base + '?error=access_denied&error_description=Cancelled'), { code: null, error: 'Cancelled' });
    const replaced = [];
    const ctx = vm.createContext({ URL, URLSearchParams, history: { state: { view: 1 }, replaceState: (_s, _t, url) => replaced.push(url) } });
    vm.runInContext(fs.readFileSync('accounts.js', 'utf8'), ctx);
    ctx.href = base + '?code=xyz&state=abc&keep=1#view';
    vm.runInContext('takeAuthCallback(href)', ctx);
    assert.deepEqual(replaced, ['/side-picker/?keep=1#view']);
});

test('accounts stay hidden unless a known provider is configured', () => {
    for (const [providers, expected] of [[null, []], [[], []], [['google', 'evil', 'github'], ['google', 'github']]]) {
        const { run } = app({ providers });
        assert.deepEqual(Array.from(run('accountProviders()')), expected);
        assert.equal(run('accountsEnabled()'), expected.length > 0);
    }
    const { deviceLabel } = require('../accounts.js');
    assert.equal(deviceLabel('Mozilla/5.0 (Linux; Android 14) Chrome/140.0 Mobile Safari/537.36'), 'Chrome on Android');
    assert.equal(deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile/15E148 Safari/604.1'), 'Safari on iPhone or iPad');
    assert.equal(deviceLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0 Safari/537.36 Edg/140.0'), 'Edge on Windows');
});

test('a signed-in browser opens the account games with its own key, sending only its hash', async () => {
    const t = app({ responses: { list: accountList('B'), open: { owner_key: 'B' }, 'sp_workspace:load': loads } });
    await t.run('syncAccountGames()');
    const stored = t.local(), open = t.calls.find(c => c.action === 'open');
    assert.equal(stored.ownerKey, 'B');
    assert.notEqual(stored.credential, A);
    assert.equal(open.payload.token_hash, sha(stored.credential));
    assert.ok(!JSON.stringify(open).includes(stored.credential), 'raw device key was sent when registering it');
    assert.equal(open.payload.label, 'Chrome on Windows');
    assert.equal(t.parked(), null, 'an empty browser workspace is not set aside');
});

test('games already in the browser join the account only by choice', async () => {
    const added = app({ games: 2, responses: { list: accountList('B'), merge: { sessions: 2, presets: 0 }, open: { owner_key: 'B' }, 'sp_workspace:load': loads } });
    await added.run('syncAccountGames()');
    assert.deepEqual(added.actions(), ['list', 'merge', 'open', 'load', 'list']);
    assert.deepEqual(added.calls.find(c => c.action === 'merge').payload, { owner_key: 'B', credential: A });
    assert.equal(added.local().ownerKey, 'B');
    assert.equal(added.parked(), null);

    const kept = app({ games: 1, choice: 'keep', responses: { list: accountList('B'), open: { owner_key: 'B' }, 'sp_workspace:load': loads, forget_device: { forget: true } } });
    await kept.run('syncAccountGames()');
    assert.ok(!kept.actions().includes('merge'));
    assert.deepEqual(kept.parked(), { credential: A, ownerKey: 'A' });
    assert.equal(kept.local().ownerKey, 'B');
    // Signing out removes this browser's key and brings the set-aside games back.
    await kept.run('signOutAccount()');
    assert.deepEqual(kept.local(), { credential: A, ownerKey: 'A' });
    assert.equal(kept.parked(), null);
    assert.equal(JSON.stringify(kept.signOuts), JSON.stringify([{ scope: 'local' }]));
});

test('a first sign-in either adopts the browser games or starts empty account games', async () => {
    const adopt = app({ games: 1, responses: { list: accountList(), attach: { owner_key: 'A' } } });
    await adopt.run('syncAccountGames()');
    assert.equal(adopt.calls.find(c => c.action === 'attach').payload.credential, A);
    assert.ok(!adopt.actions().some(a => a === 'open' || a === 'start'));
    assert.deepEqual(adopt.local(), { credential: A, ownerKey: 'A' });

    const fresh = app({ responses: { list: accountList(), start: { owner_key: 'B' }, 'sp_workspace:load': loads } });
    await fresh.run('syncAccountGames()');
    const start = fresh.calls.find(c => c.action === 'start');
    assert.equal(start.payload.token_hash, sha(fresh.local().credential));
    assert.equal(fresh.local().ownerKey, 'B');
});

test('failures leave the browser games and sign-in untouched', async () => {
    const t = app({ responses: { list: accountList('B'), open: Object.assign(new Error('These games are not in your account'), { code: '42501' }) } });
    await t.run('syncAccountGames()');
    assert.deepEqual(t.local(), { credential: A, ownerKey: 'A' });
    assert.ok(!t.calls.some(c => c.fn === 'sp_workspace'));
    assert.ok(t.toasts.some(([type, title]) => type === 'error' && title === 'Could not load your account games'));

    const offline = app({ responses: { forget_device: Object.assign(new Error('offline'), { code: 'FETCH_ERROR' }) } });
    await offline.run('signOutAccount()');
    assert.equal(offline.signOuts.length, 0, 'signed out without removing this browser key');
    assert.deepEqual(offline.local(), { credential: A, ownerKey: 'A' });
});

test('players save only personal invitations and reopen them from the account', async () => {
    const t = app({ responses: { save_invite: { saved: true }, open_invite: { room_code: 'ROOM', player_id: 'p/1', token: T } } });
    t.run(`guestAccess = { player: '', token: '${T}' }; guestSession = { code: 'ROOM' }`);
    await t.run('saveGuestInvitation()');
    assert.ok(!t.actions().includes('save_invite'), 'viewing links are not saved');
    t.run(`guestAccess = { player: 'p/1', token: '${T}' }`);
    await t.run('saveGuestInvitation()');
    assert.deepEqual(t.calls.find(c => c.action === 'save_invite').payload, { room: 'ROOM', player: 'p/1', token: T });
    await t.run(`openSavedInvitation({ session_id: 's1', player_id: 'p/1' })`);
    const url = new URL(t.visits[0]);
    assert.equal(url.searchParams.get('room'), 'ROOM');
    assert.deepEqual(Object.fromEntries(new URLSearchParams(url.hash.slice(1))), { player: 'p/1', token: T });
});
