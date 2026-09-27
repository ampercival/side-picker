const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), nodeCrypto = require('node:crypto');
const base = 'https://example.test/side-picker/';
const sha = value => nodeCrypto.createHash('sha256').update(value).digest('hex');
const A = 'a'.repeat(64);

// Loads the real browser scripts against a scripted database and sign-in client.
function app({ responses = {}, session = { user: { id: 'u1', app_metadata: { provider: 'google' } } }, providers = ['google'] } = {}) {
    const storage = new Map([['side_picker_private_workspace_v1', JSON.stringify({ credential: A, ownerKey: 'A' })]]);
    const calls = [], signOuts = [], toasts = [];
    const client = {
        auth: { onAuthStateChange() {}, async getSession() { return { data: { session } }; }, async signOut(options) { signOuts.push(options); return {}; } },
        async rpc(fn, args) {
            calls.push({ fn, ...args });
            const reply = responses[fn === 'sp_account' ? args.action : fn + ':' + args.action];
            const value = typeof reply === 'function' ? reply(args) : reply;
            return value instanceof Error ? { data: null, error: value } : { data: value ?? {}, error: null };
        }
    };
    const ctx = vm.createContext({
        console, crypto: nodeCrypto.webcrypto, TextEncoder, URL, URLSearchParams, setTimeout, clearTimeout, navigator: { userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/140.0' },
        location: { href: base, origin: 'https://example.test', pathname: '/side-picker/' },
        localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k), key: () => null, length: 0 },
        sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
        window: { SUPABASE_CONFIG: { url: 'https://fixture.invalid', publishableKey: 'x', accountProviders: providers }, supabase: { createClient: () => client } },
        activeSessionName: null, state: {}, get: () => null, showToast: (type, title) => toasts.push([type, title]),
        showConfirm: (_title, _message, callback) => callback(), closeModals() {}, goHome: async () => {}, flushSession: async () => true,
        renderSaveStatus() {}, renderHomeSessions() {}, renderPresetOptions() {}, switchView() {}, updateWorkspaceIndicator() {}
    });
    for (const file of ['access.js', 'save-journal.js', 'rooms.js', 'accounts.js']) vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
    vm.runInContext('accountSession = { user: { id: "u1" } }', ctx);
    const local = () => JSON.parse(storage.get('side_picker_private_workspace_v1') || 'null');
    return { ctx, calls, signOuts, toasts, local, run: code => vm.runInContext(code, ctx) };
}

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
    for (const [providers, expected] of [[null, []], [[], []], [['google', 'evil', 'discord'], ['google', 'discord']]]) {
        const { run } = app({ providers });
        assert.deepEqual(Array.from(run('accountProviders()')), expected);
        assert.equal(run('accountsEnabled()'), expected.length > 0);
    }
    const { deviceLabel } = require('../accounts.js');
    assert.equal(deviceLabel('Mozilla/5.0 (Linux; Android 14) Chrome/140.0 Mobile Safari/537.36'), 'Chrome on Android');
    assert.equal(deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile/15E148 Safari/604.1'), 'Safari on iPhone or iPad');
    assert.equal(deviceLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0 Safari/537.36 Edg/140.0'), 'Edge on Windows');
});

test('opening account games sends only a key hash and stores the key after the server accepts it', async () => {
    const t = app({ responses: {
        open: { owner_key: 'B' },
        'sp_workspace:load': args => ({ owner_key: 'B', sessions: [], presets: [], seen: args.credential }),
        list: { workspaces: [] }
    } });
    t.run('accountWorkspaces = [{ owner_key: "A" }, { owner_key: "B" }]');
    await t.run('openAccountWorkspace("B")');
    const open = t.calls.find(c => c.action === 'open');
    const stored = t.local();
    assert.equal(stored.ownerKey, 'B');
    assert.match(stored.credential, /^[0-9a-f]{64}$/);
    assert.notEqual(stored.credential, A);
    assert.equal(open.payload.token_hash, sha(stored.credential));
    assert.ok(!JSON.stringify(open).includes(stored.credential), 'raw device key was sent to the account API');
    assert.equal(open.payload.label, 'Chrome on Windows');
    // The previous account-linked key is released so unused keys do not accumulate.
    const release = t.calls.find(c => c.action === 'forget_device');
    assert.equal(release.payload.credential, A);
});

test('a failed open leaves the current workspace untouched', async () => {
    const t = app({ responses: { open: Object.assign(new Error('These games are not in your account'), { code: '42501' }) } });
    t.run('accountWorkspaces = [{ owner_key: "A" }]');
    await t.run('openAccountWorkspace("B")');
    assert.deepEqual(t.local(), { credential: A, ownerKey: 'A' });
    assert.ok(t.calls.some(c => c.action === 'open'));
    assert.ok(!t.calls.some(c => c.fn === 'sp_workspace'));
    assert.equal(JSON.stringify(t.toasts.at(-1)), JSON.stringify(['error', 'Could not open these games']));
});

test('signing out forgets account games only when the server confirms they belong to the account', async () => {
    const kept = app({ responses: { forget_device: { forget: false } } });
    await kept.run('signOutAccount()');
    assert.deepEqual(kept.local(), { credential: A, ownerKey: 'A' });
    assert.equal(JSON.stringify(kept.signOuts), JSON.stringify([{ scope: 'local' }]));

    const forgotten = app({ responses: { forget_device: { forget: true }, 'sp_workspace:create': { owner_key: 'Fresh' } } });
    await forgotten.run('signOutAccount()');
    assert.equal(forgotten.local().ownerKey, 'Fresh');
    assert.notEqual(forgotten.local().credential, A);
    assert.equal(forgotten.calls.find(c => c.action === 'forget_device').payload.credential, A);

    const offline = app({ responses: { forget_device: Object.assign(new Error('offline'), { code: 'FETCH_ERROR' }) } });
    await offline.run('signOutAccount()');
    assert.equal(offline.signOuts.length, 0, 'signed out without removing this browser key');
    assert.deepEqual(offline.local(), { credential: A, ownerKey: 'A' });
});

test('games are added to an account only by the explicit choice made for this workspace', async () => {
    for (const [intent, attached] of [[{ attach: 'A' }, true], [{ attach: 'Other' }, false], [{ attach: '' }, false], [null, false]]) {
        const t = app({ responses: { attach: { owner_key: 'A' }, list: { workspaces: [] } } });
        t.ctx.sessionStorage.getItem = () => JSON.stringify(intent);
        t.run('openAccountModal = () => {}');
        await t.run('completeSignIn({ code: "c" })');
        const attach = t.calls.find(c => c.action === 'attach');
        assert.equal(!!attach, attached, JSON.stringify(intent));
        if (attach) assert.equal(attach.payload.credential, A);
    }
});
