// Optional accounts. While signed in, a browser always shows the account's games,
// through its own revocable device key; every game still works without an account.
const ACCOUNT_PROVIDER_NAMES = { google: 'Google', discord: 'Discord', github: 'GitHub' };
// Games that were in this browser before signing in, set aside until sign-out.
const PARKED_WORKSPACE_KEY = 'side_picker_parked_workspace_v1';
// A player signing in from an invitation returns here, then back to their room.
const PENDING_INVITE_KEY = 'side_picker_pending_invite';
let accountSession = null, accountWorkspaces = null, accountInvitations = [], accountLoading = false, accountSyncing = null;
let accountStarted = null;

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
function accountGames() { return accountWorkspaces?.[0] || null; }
function currentWorkspaceLinked() { return !!accountWorkspaces?.some(w => w.owner_key === getWorkspaceKey()); }
function localGameCount() { return Object.keys(sessionsCache).length + Object.keys(presetsCache).length; }
function readParked() {
    try { const parked = JSON.parse(localStorage.getItem(PARKED_WORKSPACE_KEY)); return parked?.credential ? parked : null; }
    catch { return null; }
}
function parkCurrentWorkspace() {
    const { credential, ownerKey } = privateWorkspace();
    if (!credential || readParked()) return;
    try { localStorage.setItem(PARKED_WORKSPACE_KEY, JSON.stringify({ credential, ownerKey })); } catch { /* reported by later saves */ }
}
function useWorkspace(credential, data) {
    deactivateRoomSync(); activeSessionName = null; state.roomCode = '';
    storeWorkspace(credential, data.owner_key); applyWorkspaceData(data);
    renderHomeSessions(); renderPresetOptions();
}
// This browser gets its own key for the account's games; only its hash is sent.
async function openAccountGames(ownerKey) {
    const credential = newPrivateToken(), generation = ++loadGeneration;
    await accountRequest('open', { owner_key: ownerKey, token_hash: await privateTokenHash(credential), label: deviceLabel(navigator.userAgent) });
    const data = await workspaceRequest('load', {}, credential);
    if (generation === loadGeneration) useWorkspace(credential, data);
}
async function startAccountGames() {
    const credential = newPrivateToken(), generation = ++loadGeneration;
    await accountRequest('start', { token_hash: await privateTokenHash(credential), label: deviceLabel(navigator.userAgent) });
    const data = await workspaceRequest('load', {}, credential);
    if (generation === loadGeneration) useWorkspace(credential, data);
}
// Games already in this browser are added only by choice: on someone else's
// device they should be kept separate and come back after signing out.
function askAboutLocalGames() {
    return new Promise(resolve => {
        let settled = false;
        const finish = choice => { if (!settled) { settled = true; observer?.disconnect(); resolve(choice); } };
        const modal = typeof document !== 'undefined' ? get('confirm-modal') : null;
        const observer = modal && typeof MutationObserver === 'function'
            ? new MutationObserver(() => { if (!modal.classList.contains('active')) finish('keep'); }) : null;
        const sessions = Object.keys(sessionsCache).length, presets = Object.keys(presetsCache).length;
        showConfirm('Add the games in this browser to your account?',
            `This browser has ${gameCounts(sessions, presets)} that ${sessions + presets === 1 ? 'is' : 'are'} not in your account. Add them to see them on all your devices. On someone else's device, keep them separate: they come back here when you sign out.`,
            () => finish('add'), 'Add to my account', 'primary', () => finish('keep'), 'Keep separate');
        observer?.observe(modal, { attributes: true, attributeFilter: ['class'] });
    });
}
// Make this browser show the account's games. Runs at startup and after sign-in.
function syncAccountGames() { return accountSyncing ||= runAccountSync().finally(() => { accountSyncing = null; }); }
async function runAccountSync() {
    if (!accountSession) return;
    try {
        const credential = privateWorkspace().credential;
        const listed = await accountRequest('list', credential ? { credential } : {});
        accountWorkspaces = listed.workspaces || []; accountInvitations = listed.invitations || [];
        const primary = accountGames()?.owner_key || null;
        // Keep one set of account games: fold any other account workspaces into the first.
        for (const extra of accountWorkspaces.slice(1)) await accountRequest('merge', { owner_key: primary, source_owner_key: extra.owner_key });
        const current = getWorkspaceKey();
        if (primary && current === primary && hasWorkspaceKey() && !workspaceLoadFailed) return;
        const local = hasWorkspaceKey() && !workspaceLoadFailed && !currentWorkspaceLinked() && localGameCount() > 0;
        const choice = local ? await askAboutLocalGames() : 'none';
        if (!(await settleSaves())) return;
        if (!primary && choice === 'add') {
            await accountRequest('attach', { credential });
            showToast('success', 'Games added to your account', 'They now appear on every device where you sign in.');
        } else {
            if (choice === 'add') {
                try {
                    const moved = await accountRequest('merge', { owner_key: primary, credential });
                    showToast('success', 'Games added to your account', `Moved in ${gameCounts(moved.sessions, moved.presets)}.`);
                } catch (error) { accountError(error, 'Could not add these games'); parkCurrentWorkspace(); }
            } else if (choice === 'keep') parkCurrentWorkspace();
            if (primary) await openAccountGames(primary); else await startAccountGames();
        }
    } catch (error) { accountError(error, 'Could not load your account games'); }
    finally { await refreshAccount(true); }
}

function startAccount(callback) { return accountStarted ||= beginAccount(callback); }
async function beginAccount(callback) {
    if (!accountsEnabled()) { renderAccountEntry(); return; }
    const auth = getSupabaseClient().auth;
    // Keep this callback synchronous: supabase-js must not be re-entered here.
    auth.onAuthStateChange((event, session) => {
        accountSession = session;
        if (!session) { accountWorkspaces = null; accountInvitations = []; }
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
// Runs after the local workspace (if any) has loaded.
async function completeSignIn(callback) {
    if (!accountSession) return;
    await syncAccountGames();
    if (callback?.code) showToast('success', 'Signed in', `Your games are now on every device where you sign in with ${accountProviderName()}.`);
}
// A signed-in browser with no games of its own does not need a throwaway workspace.
function skipLocalWorkspace() {
    return !!accountSession && !hasWorkspaceKey() && !new URLSearchParams(location.hash.slice(1)).has('organizer');
}

async function signInWithProvider(provider) {
    if (!accountProviders().includes(provider)) return;
    if (isGuestMode) {
        // The allowed return address is the app itself; the room code and this tab's
        // invitation wait in session storage.
        try { sessionStorage.setItem(PENDING_INVITE_KEY, guestSession.code); } catch { return; }
    } else if (!(await settleSaves())) return;
    const { error } = await getSupabaseClient().auth.signInWithOAuth({
        provider, options: { redirectTo: location.origin + location.pathname, ...(provider === 'google' ? { queryParams: { prompt: 'select_account' } } : {}) }
    });
    if (error) accountError(error, 'Could not start sign-in');
}
async function refreshAccount(quiet = false) {
    if (!accountSession) { accountWorkspaces = null; renderAccountEntry(); return; }
    accountLoading = true; renderAccountBody();
    try {
        const credential = privateWorkspace().credential;
        const listed = await accountRequest('list', credential ? { credential } : {});
        accountWorkspaces = listed.workspaces || []; accountInvitations = listed.invitations || [];
    } catch (error) { if (!quiet) accountError(error, 'Could not load your account'); }
    accountLoading = false; renderAccountEntry();
}
// While signed in, an organizer link adds its games to the account.
function importIntoAccount(credential) {
    showConfirm('Add these games to your account?', 'The games from this organizer link move into your account and appear on all your devices. That link stops working, so anyone else using it loses access.', async () => {
        if (!(await settleSaves())) return;
        try {
            const moved = await accountRequest('merge', { owner_key: getWorkspaceKey(), credential });
            await loadSessionsFromDb(); closeModals(); renderHomeSessions(); renderPresetOptions(); switchView('view-home');
            showToast('success', 'Games added to your account', `Moved in ${gameCounts(moved.sessions, moved.presets)}.`);
            await refreshAccount(true);
        } catch (error) { accountError(error, 'Could not add these games'); }
    }, 'Add to my account');
}
// Forget the local workspace and start an empty one, as for a new visitor.
async function startFreshWorkspace() {
    activeSessionName = null; state.roomCode = ''; deactivateRoomSync();
    try { localStorage.removeItem(PRIVATE_WORKSPACE_KEY); } catch { /* createPrivateWorkspace reports storage errors */ }
    workspaceAccess = null;
    await createPrivateWorkspace(true);
    switchView('view-home');
}
// After signing out, bring back what this browser had before signing in.
async function restoreParkedWorkspace() {
    const parked = readParked();
    try { localStorage.removeItem(PARKED_WORKSPACE_KEY); } catch { /* optional */ }
    if (parked) {
        try {
            const generation = ++loadGeneration, data = await workspaceRequest('load', {}, parked.credential);
            if (generation === loadGeneration) { useWorkspace(parked.credential, data); switchView('view-home'); return; }
        } catch { /* the set-aside link no longer works */ }
    }
    await startFreshWorkspace();
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
    accountSession = null; accountWorkspaces = null; accountInvitations = [];
    closeModals();
    if (forget) await restoreParkedWorkspace();
    renderAccountEntry();
    showToast('success', 'Signed out', forget ? 'Your games stay in your account and left this browser.' : 'Games in this browser are unchanged.');
}
function revokeAccountKey(key) {
    showConfirm('Remove this device?', key.kind === 'device'
        ? 'That device stops showing your games until it signs in again.'
        : 'Anyone using this organizer link loses access. Your games stay in your account.', async () => {
        try { await accountRequest('revoke_key', { id: key.id }); }
        catch (error) { accountError(error, 'Could not remove access'); return; }
        await refreshAccount();
    }, 'Remove', 'danger');
}
function deleteAccount() {
    showConfirm('Delete your account?', 'Your sign-in is deleted. Your games are not: they stay in this browser, and on other devices where they are open, as an ordinary workspace. Delete games first if you want them gone.', async () => {
        try { await accountRequest('delete_account'); }
        catch (error) { accountError(error, 'Could not delete your account'); return; }
        await getSupabaseClient().auth.signOut({ scope: 'local' });
        accountSession = null; accountWorkspaces = null; accountInvitations = [];
        closeModals(); renderAccountEntry();
        showToast('success', 'Account deleted', 'Games in this browser are unchanged.');
    }, 'Delete account', 'danger');
}

// --- Account UI (DOM text only; names come from other people's input) ---
function renderAccountEntry() {
    const signedIn = !!accountSession;
    const button = get('account-button');
    if (button) button.hidden = !accountsEnabled();
    const hint = get('workspace-account-hint');
    if (hint) hint.hidden = !accountsEnabled() || signedIn;
    const separate = get('start-separate-workspace');
    if (separate) separate.hidden = signedIn;
    if (!isGuestMode) { updateWorkspaceIndicator(); renderAccountInvitations(); }
    else renderGuestAccount();
    if (get('account-modal')?.classList.contains('active')) renderAccountBody();
}
function openAccountModal() {
    if (!accountsEnabled()) return;
    closeModals(); renderAccountBody();
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
// "2 sessions and 1 saved game", leaving out whichever is zero.
function gameCounts(sessions, presets) {
    return [sessions ? plural(sessions, 'session') : '', presets ? plural(presets, 'saved game') : ''].filter(Boolean).join(' and ') || 'nothing';
}
function renderAccountBody() {
    const body = get('account-body'); if (!body) return;
    body.replaceChildren();
    if (!accountSession) {
        body.append(accountElement('p', 'Sign in to keep your games in your account. They appear on every device where you sign in, without saving organizer links. You never need an account to create games or join as a player.', 'account-note'));
        const providers = accountElement('div', undefined, 'account-providers');
        for (const provider of accountProviders()) providers.append(accountButton(`Continue with ${ACCOUNT_PROVIDER_NAMES[provider]}`, 'btn primary', () => signInWithProvider(provider)));
        body.append(providers, accountPrivacyLink());
        return;
    }
    body.append(accountElement('p', `Signed in as ${accountName()} with ${accountProviderName()}.`, 'account-note'));
    const games = accountGames();
    if (!games) {
        body.append(accountElement('p', accountLoading || accountSyncing ? 'Loading your games…' : 'Setting up your games…', 'subtitle'));
    } else {
        const summary = accountElement('div', undefined, 'account-workspace');
        summary.append(accountElement('p', `${plural(games.sessions?.length || 0, 'session')} · ${plural(games.presets?.length || 0, 'saved game')}`, 'account-workspace-title'),
            accountElement('p', 'Your games appear on every device where you are signed in.', 'account-workspace-names'));
        body.append(summary, accountElement('h4', 'Signed-in devices and links'));
        for (const key of games.keys || []) {
            const row = accountElement('div', undefined, 'account-key');
            const name = key.kind === 'device' ? (key.label || 'Device') : 'Organizer link';
            row.append(accountElement('span', `${name}${key.current ? ' (this device)' : ''} · added ${new Date(key.created_at).toLocaleDateString()}`));
            if (!key.current) row.append(accountButton('Remove', 'btn-sm', () => revokeAccountKey(key)));
            body.append(row);
        }
    }
    const actions = accountElement('div', undefined, 'actions account-actions');
    actions.append(accountButton('Sign out', 'btn secondary', signOutAccount), accountButton('Delete account', 'btn text', deleteAccount));
    body.append(actions, accountPrivacyLink());
}
function accountPrivacyLink() {
    const p = accountElement('p', undefined, 'account-privacy');
    const link = accountElement('a', 'Privacy and account data'); link.href = 'privacy.html'; link.target = '_blank'; link.rel = 'noopener';
    p.append(link); return p;
}

// --- Players: keep a personal invitation in an account ---
let guestInvitationSaved = false;
function pendingGuestInvitation() {
    try { return sessionStorage.getItem(PENDING_INVITE_KEY); } catch { return null; }
}
// Back from the provider: finish signing in, then return to the player's room.
async function finishGuestSignIn(callback) {
    const code = pendingGuestInvitation();
    try { sessionStorage.removeItem(PENDING_INVITE_KEY); } catch { /* optional */ }
    await startAccount(callback);
    const url = new URL(location.href); url.search = new URLSearchParams({ room: code }).toString(); url.hash = '';
    location.replace(url.href);
}
async function saveGuestInvitation() {
    if (!accountSession || !guestAccess?.player || !guestSession?.code) return;
    try {
        await accountRequest('save_invite', { room: guestSession.code, player: guestAccess.player, token: guestAccess.token });
        guestInvitationSaved = true;
    } catch (error) { accountError(error, 'Could not save this game to your account'); }
    renderGuestAccount();
}
// Called once the player's room has loaded.
async function startGuestAccount() {
    await startAccount(null);
    if (accountSession) await saveGuestInvitation(); else renderGuestAccount();
}
function renderGuestAccount() {
    const box = get('guest-account'); if (!box) return;
    box.replaceChildren();
    box.hidden = !accountsEnabled() || !guestAccess?.player;
    if (box.hidden) return;
    if (accountSession) {
        box.append(accountElement('p', guestInvitationSaved
            ? `Saved to your account. It is listed on your Side Picker home screen wherever you sign in with ${accountProviderName()}.`
            : 'Saving this game to your account…', 'account-note'),
            accountButton('Go to my home screen', 'btn secondary', () => location.assign(location.origin + location.pathname)));
        return;
    }
    box.append(accountElement('p', 'Optional: sign in to keep this game in your account and find it later without this link.', 'account-note'));
    const providers = accountElement('div', undefined, 'account-providers');
    for (const provider of accountProviders()) providers.append(accountButton(`Continue with ${ACCOUNT_PROVIDER_NAMES[provider]}`, 'btn secondary', () => signInWithProvider(provider)));
    box.append(providers);
}
// Home screen: games this person is playing in, reachable without the link.
function renderAccountInvitations() {
    const card = get('home-invitations'), list = get('home-invitation-list'); if (!card || !list) return;
    card.hidden = !accountSession || !accountInvitations.length;
    list.replaceChildren();
    for (const invite of accountInvitations) {
        const row = accountElement('div', undefined, 'invitation-row');
        const text = accountElement('div', undefined, 'invitation-text');
        const status = !invite.current ? 'invitation replaced' : invite.stage === 'published' ? 'results ready' : invite.stage === 'locked' ? 'picking closed' : 'picking open';
        text.append(accountElement('strong', invite.session_name || 'Game night'),
            accountElement('span', [invite.game_title, invite.player_name ? `as ${invite.player_name}` : '', status].filter(Boolean).join(' · ')));
        row.append(text);
        if (invite.current) row.append(accountButton('Open', 'btn primary', () => openSavedInvitation(invite)));
        row.append(accountButton('Remove', 'btn-sm', () => forgetSavedInvitation(invite)));
        list.append(row);
    }
}
async function openSavedInvitation(invite) {
    try {
        const data = await accountRequest('open_invite', { session_id: invite.session_id, player_id: invite.player_id });
        location.assign(makePrivateLink('player', data.token, { room: data.room_code, player: data.player_id }));
    } catch (error) { accountError(error, 'Could not open this game'); await refreshAccount(true); }
}
function forgetSavedInvitation(invite) {
    showConfirm('Remove this game from your list?', 'You can still open it from your invitation link.', async () => {
        try { await accountRequest('forget_invite', { session_id: invite.session_id, player_id: invite.player_id }); }
        catch (error) { accountError(error, 'Could not remove this game'); return; }
        await refreshAccount(true);
    }, 'Remove');
}
if (typeof module !== 'undefined' && module.exports) module.exports = { takeAuthCallback, deviceLabel, accountProviders };
