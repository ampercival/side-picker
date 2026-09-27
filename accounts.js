// Optional accounts. Signing in only adds a list of workspaces this person has
// proven control of and per-device organizer keys; every game works without it.
const ACCOUNT_PROVIDER_NAMES = { google: 'Google', discord: 'Discord', github: 'GitHub' };
const ACCOUNT_INTENT_KEY = 'side_picker_account_intent';
let accountSession = null, accountWorkspaces = null, accountLoading = false;

function accountProviders() {
    const configured = window.SUPABASE_CONFIG?.accountProviders;
    return Array.isArray(configured) ? configured.filter(p => Object.hasOwn(ACCOUNT_PROVIDER_NAMES, p)) : [];
}
function accountsEnabled() { return accountProviders().length > 0 && isSupabaseConfigured(); }

// An OAuth return carries a PKCE code (or an error) in the query. Read it once
// and remove it from the address bar so a refresh cannot replay it.
function takeAuthCallback(href = location.href) {
    const url = new URL(href), hash = new URLSearchParams(url.hash.slice(1));
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error_description') || url.searchParams.get('error') || hash.get('error_description');
    if (!code && !error) return null;
    for (const key of ['code', 'error', 'error_code', 'error_description', 'state']) url.searchParams.delete(key);
    if (hash.has('error_description')) url.hash = '';
    if (typeof history !== 'undefined') history.replaceState(history.state, '', url.pathname + url.search + url.hash);
    return { code, error };
}
function deviceLabel(ua = '') {
    const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\/|FxiOS/.test(ua) ? 'Firefox' : /Chrome\/|CriOS/.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
    const system = /iPhone|iPad/.test(ua) ? 'iPhone or iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows'
        : /Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'this device';
    return `${browser} on ${system}`;
}
function accountName(session = accountSession) {
    const user = session?.user; if (!user) return '';
    const meta = user.user_metadata || {};
    return String(meta.full_name || meta.name || meta.user_name || user.email || 'your account').slice(0, 200);
}
function accountProviderName(session = accountSession) {
    return ACCOUNT_PROVIDER_NAMES[session?.user?.app_metadata?.provider] || 'your sign-in provider';
}
function accountError(error, title) {
    const denied = /permission denied for function/i.test(error?.message || '');
    showToast('error', title, denied ? 'Your sign-in expired. Sign in again.'
        : ['42501', '22023'].includes(error?.code) && error.message ? error.message
        : 'Check your connection and try again.');
}
async function accountRequest(action, payload = {}) {
    const { data, error } = await getSupabaseClient().rpc('sp_account', { action, payload });
    if (error) throw error; return data;
}
// Saves must be confirmed before a browser changes which workspace it holds.
async function settleSaves() {
    const saved = (await flushSession()) && (await (journal ? journal.flushAll() : true));
    if (!saved || journal?.storageError) {
        showToast('error', 'Finish saving first', 'Reconnect so your latest edits save, then try again.');
        return false;
    }
    return true;
}
function currentWorkspaceLinked() {
    return !!accountWorkspaces?.some(w => w.owner_key === getWorkspaceKey());
}

async function startAccount(callback) {
    if (!accountsEnabled()) { renderAccountEntry(); return; }
    const auth = getSupabaseClient().auth;
    // Keep this callback synchronous: supabase-js must not be re-entered here.
    auth.onAuthStateChange((event, session) => {
        accountSession = session;
        if (!session) accountWorkspaces = null;
        renderAccountEntry();
    });
    try {
        if (callback?.error) throw { message: callback.error };
        if (callback?.code) { const { error } = await auth.exchangeCodeForSession(callback.code); if (error) throw error; }
        accountSession = (await auth.getSession()).data.session;
    } catch (error) {
        showToast('error', 'Could not sign in', 'Sign-in was cancelled or failed. You can keep using Side Picker without an account.');
    }
    renderAccountEntry();
}
// Runs after the workspace loads, so an explicit "add these games" choice made
// before the provider redirect applies to the workspace it was made for.
async function completeSignIn(callback) {
    let intent = null;
    try { intent = JSON.parse(sessionStorage.getItem(ACCOUNT_INTENT_KEY)); sessionStorage.removeItem(ACCOUNT_INTENT_KEY); } catch { /* optional */ }
    if (!accountSession) return;
    if (!callback?.code) { await refreshAccount(true); return; }
    if (intent?.attach && intent.attach === getWorkspaceKey()) await attachCurrentWorkspace();
    else await refreshAccount();
    openAccountModal();
    showToast('success', 'Signed in', `Signed in with ${accountProviderName()}.`);
}

async function signInWithProvider(provider) {
    if (!accountProviders().includes(provider)) return;
    if (!(await settleSaves())) return;
    const attach = !!get('account-attach-choice')?.checked && hasWorkspaceKey();
    try { sessionStorage.setItem(ACCOUNT_INTENT_KEY, JSON.stringify({ attach: attach ? getWorkspaceKey() : '' })); } catch { /* optional */ }
    const { error } = await getSupabaseClient().auth.signInWithOAuth({
        provider, options: { redirectTo: location.origin + location.pathname, ...(provider === 'google' ? { queryParams: { prompt: 'select_account' } } : {}) }
    });
    if (error) accountError(error, 'Could not start sign-in');
}
async function refreshAccount(quiet = false) {
    if (!accountSession) { accountWorkspaces = null; renderAccountBody(); return; }
    accountLoading = true; renderAccountBody();
    try {
        const credential = privateWorkspace().credential;
        accountWorkspaces = (await accountRequest('list', credential ? { credential } : {})).workspaces || [];
    } catch (error) { if (!quiet) accountError(error, 'Could not load your account'); }
    accountLoading = false; renderAccountEntry();
}
async function attachCurrentWorkspace() {
    const credential = privateWorkspace().credential; if (!credential) return;
    try {
        await accountRequest('attach', { credential });
        showToast('success', 'Games added to your account', 'Open them from Account on any device.');
    } catch (error) { accountError(error, 'Could not add these games'); }
    await refreshAccount();
}
// A switched-away device key is removed, so keys do not pile up unseen.
async function releaseAccountKey(credential) {
    if (!credential || !accountSession) return;
    try { await accountRequest('forget_device', { credential }); } catch { /* still listed; removable under Devices */ }
}
async function openAccountWorkspace(ownerKey, confirmed = false) {
    if (ownerKey === getWorkspaceKey()) { closeModals(); await goHome(); return; }
    const hasLocalGames = Object.keys(sessionsCache).length + Object.keys(presetsCache).length > 0;
    if (!confirmed && hasWorkspaceKey() && hasLocalGames && !currentWorkspaceLinked()) {
        showConfirm('Leave the games in this browser?', 'They are not in your account. Add them first, or save their organizer link, so you can return to them.',
            () => openAccountWorkspace(ownerKey, true), 'Open anyway');
        return;
    }
    if (!(await settleSaves())) return;
    const previous = privateWorkspace().credential, wasLinked = currentWorkspaceLinked();
    const credential = newPrivateToken(), generation = ++loadGeneration;
    try {
        await accountRequest('open', { owner_key: ownerKey, token_hash: await privateTokenHash(credential), label: deviceLabel(navigator.userAgent) });
        const data = await workspaceRequest('load', {}, credential);
        if (generation !== loadGeneration) return;
        deactivateRoomSync(); activeSessionName = null; state.roomCode = '';
        storeWorkspace(credential, data.owner_key); applyWorkspaceData(data);
        closeModals(); renderHomeSessions(); renderPresetOptions(); switchView('view-home');
        showToast('success', 'Games opened', 'This browser now has its own key for these games.');
        if (wasLinked) await releaseAccountKey(previous);
        void refreshAccount();
    } catch (error) { accountError(error, 'Could not open these games'); }
}
// Forget the local workspace and start an empty one, as for a new visitor.
async function startFreshWorkspace() {
    activeSessionName = null; state.roomCode = ''; deactivateRoomSync();
    try { localStorage.removeItem(PRIVATE_WORKSPACE_KEY); } catch { /* createPrivateWorkspace reports storage errors */ }
    workspaceAccess = null;
    await createPrivateWorkspace(true);
    switchView('view-home');
}
async function signOutAccount() {
    if (!(await settleSaves())) return;
    const credential = privateWorkspace().credential;
    let forget = false;
    if (credential) {
        try { forget = !!(await accountRequest('forget_device', { credential })).forget; }
        catch (error) { accountError(error, 'Could not sign out'); return; }
    }
    await getSupabaseClient().auth.signOut({ scope: 'local' });
    accountSession = null; accountWorkspaces = null;
    closeModals();
    if (forget) await startFreshWorkspace();
    renderAccountEntry();
    showToast('success', 'Signed out', forget ? 'Your games stay in your account. This browser now starts empty.' : 'Games in this browser are unchanged.');
}
function revokeAccountKey(key) {
    showConfirm('Remove access?', key.current
        ? 'This browser will lose access to these games until you open them again from your account.'
        : 'That device or link will stop working. The games stay in your account.', async () => {
        if (key.current && !(await settleSaves())) return;
        try { await accountRequest('revoke_key', { id: key.id }); }
        catch (error) { accountError(error, 'Could not remove access'); return; }
        if (key.current) await startFreshWorkspace();
        await refreshAccount();
        if (key.current) openAccountModal();
    }, 'Remove access', 'danger');
}
function unlinkAccountWorkspace(ownerKey) {
    showConfirm('Remove these games from your account?', 'Nothing is deleted. Devices and organizer links that open these games keep working. You would need one of them to add the games back.', async () => {
        try { await accountRequest('unlink', { owner_key: ownerKey }); }
        catch (error) { accountError(error, 'Could not remove these games'); return; }
        await refreshAccount();
    }, 'Remove from account', 'danger');
}
function deleteAccount() {
    showConfirm('Delete your account?', 'Your sign-in and its list of games are deleted. Games are not: they still open through organizer links and on devices where they are open. Delete games first if you want them gone.', async () => {
        try { await accountRequest('delete_account'); }
        catch (error) { accountError(error, 'Could not delete your account'); return; }
        await getSupabaseClient().auth.signOut({ scope: 'local' });
        accountSession = null; accountWorkspaces = null;
        closeModals(); renderAccountEntry();
        showToast('success', 'Account deleted', 'Games in this browser are unchanged.');
    }, 'Delete account', 'danger');
}

// --- Account UI (DOM text only; names come from other people's input) ---
function renderAccountEntry() {
    const button = get('account-button');
    if (button) button.hidden = !accountsEnabled();
    const hint = get('workspace-account-hint');
    if (hint) hint.hidden = !accountsEnabled() || (!!accountSession && currentWorkspaceLinked());
    updateWorkspaceIndicator();
    if (get('account-modal')?.classList.contains('active')) renderAccountBody();
}
function openAccountModal(attachChoice = false) {
    if (!accountsEnabled()) return;
    closeModals(); renderAccountBody(attachChoice);
    get('modal-overlay').classList.add('active'); get('account-modal').classList.add('active');
    if (accountSession && !accountWorkspaces && !accountLoading) void refreshAccount();
}
function accountElement(tag, text, className) {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    if (className) el.className = className;
    return el;
}
function accountButton(text, className, onclick) {
    const button = accountElement('button', text, className); button.type = 'button'; button.onclick = onclick; return button;
}
function plural(count, word) { return `${count} ${word}${count === 1 ? '' : 's'}`; }
function renderAccountBody(attachChoice) {
    const body = get('account-body'); if (!body) return;
    const previousChoice = get('account-attach-choice')?.checked;
    body.replaceChildren();
    if (!accountSession) {
        body.append(accountElement('p', 'You never need an account to create games or join as a player. Signing in lets you find your games on any device without keeping organizer links.', 'account-note'));
        if (hasWorkspaceKey()) {
            const label = accountElement('label', undefined, 'account-choice');
            const box = document.createElement('input'); box.type = 'checkbox'; box.id = 'account-attach-choice';
            box.checked = attachChoice === true || (attachChoice === undefined && !!previousChoice);
            const games = Object.keys(sessionsCache).length;
            label.append(box, accountElement('span', `Add the ${games ? plural(games, 'game') : 'games'} in this browser to my account. Leave this off on someone else's device.`));
            body.append(label);
        }
        const providers = accountElement('div', undefined, 'account-providers');
        for (const provider of accountProviders()) providers.append(accountButton(`Continue with ${ACCOUNT_PROVIDER_NAMES[provider]}`, 'btn primary', () => signInWithProvider(provider)));
        body.append(providers, accountPrivacyLink());
        return;
    }
    body.append(accountElement('p', `Signed in as ${accountName()} with ${accountProviderName()}.`, 'account-note'));
    if (accountLoading && !accountWorkspaces) { body.append(accountElement('p', 'Loading your games…', 'subtitle')); return; }
    if (hasWorkspaceKey() && accountWorkspaces && !currentWorkspaceLinked()) {
        const row = accountElement('div', undefined, 'account-attach');
        row.append(accountElement('p', 'The games in this browser are not in your account.'),
            accountButton('Add the games in this browser', 'btn primary', () => attachCurrentWorkspace()));
        body.append(row);
    }
    body.append(accountElement('h4', 'My games'));
    if (!accountWorkspaces?.length) body.append(accountElement('p', 'No games in your account yet.', 'subtitle'));
    for (const workspace of accountWorkspaces || []) body.append(accountWorkspaceCard(workspace));
    const actions = accountElement('div', undefined, 'actions account-actions');
    actions.append(accountButton('Sign out', 'btn secondary', signOutAccount), accountButton('Delete account', 'btn text', deleteAccount));
    body.append(actions, accountPrivacyLink());
}
function accountWorkspaceCard(workspace) {
    const card = accountElement('div', undefined, 'account-workspace');
    const current = workspace.owner_key === getWorkspaceKey();
    const sessions = workspace.sessions || [], presets = workspace.presets || [];
    card.append(accountElement('p', `${plural(sessions.length, 'game')} · ${plural(presets.length, 'preset')}${current ? ' · open in this browser' : ''}`, 'account-workspace-title'));
    const names = sessions.slice(0, 3).map(s => (s.session_name || s.name || '').trim()).filter(Boolean);
    if (names.length) card.append(accountElement('p', names.join(', ') + (sessions.length > names.length ? ', …' : ''), 'account-workspace-names'));
    const actions = accountElement('div', undefined, 'actions');
    actions.append(current ? accountButton('Go to these games', 'btn secondary', () => openAccountWorkspace(workspace.owner_key))
        : accountButton('Open in this browser', 'btn primary', () => openAccountWorkspace(workspace.owner_key)),
        accountButton('Remove from account', 'btn text', () => unlinkAccountWorkspace(workspace.owner_key)));
    card.append(actions);
    const keys = workspace.keys || [];
    const details = document.createElement('details');
    details.append(accountElement('summary', `Devices and links (${keys.length})`));
    for (const key of keys) {
        const row = accountElement('div', undefined, 'account-key');
        const name = key.kind === 'device' ? (key.label || 'Device') : 'Organizer link';
        row.append(accountElement('span', `${name}${key.current ? ' (this browser)' : ''} · added ${new Date(key.created_at).toLocaleDateString()}`),
            accountButton('Remove', 'btn-sm', () => revokeAccountKey(key)));
        details.append(row);
    }
    card.append(details);
    return card;
}
function accountPrivacyLink() {
    const p = accountElement('p', undefined, 'account-privacy');
    const link = accountElement('a', 'Privacy and account data'); link.href = 'privacy.html'; link.target = '_blank'; link.rel = 'noopener';
    p.append(link); return p;
}
if (typeof module !== 'undefined' && module.exports) module.exports = { takeAuthCallback, deviceLabel, accountProviders };
