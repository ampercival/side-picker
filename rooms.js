// Account-free workspaces. Every operation is authorized by the database RPC.
let _supabase = null;
async function databaseFetch(input, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try { return await fetch(input, { ...options, signal: controller.signal }); }
    finally { clearTimeout(timer); }
}
function getSupabaseClient() {
    const cfg = window.SUPABASE_CONFIG;
    if (!window.supabase || !cfg?.url || cfg.url.startsWith('YOUR_')) return null;
    return _supabase ||= window.supabase.createClient(cfg.url, cfg.publishableKey, {
        auth: { persistSession: false, detectSessionInUrl: false, autoRefreshToken: false },
        global: { fetch: databaseFetch }
    });
}
function isSupabaseConfigured() { return getSupabaseClient() !== null; }
const WORKSPACE_KEY_LS = 'side_picker_workspace_key'; // legacy label, never a credential
// Keep this tab bound to the workspace it loaded, even if another tab imports a link.
let workspaceAccess = null;
function privateWorkspace() {
    if (workspaceAccess) return workspaceAccess;
    try { return workspaceAccess = JSON.parse(localStorage.getItem(PRIVATE_WORKSPACE_KEY)) || {}; }
    catch { return workspaceAccess = {}; }
}
function getWorkspaceKey() { return privateWorkspace().ownerKey || ''; }
function hasWorkspaceKey() { return Boolean(getWorkspaceKey() && privateWorkspace().credential); }
function storeWorkspace(credential, ownerKey) {
    const next = { credential, ownerKey };
    localStorage.setItem(PRIVATE_WORKSPACE_KEY, JSON.stringify(next)); workspaceAccess = next;
}
function accessError(error, title = 'Could not save') {
    showToast('error', title, error?.code === '42501' ? 'This private link is no longer valid, or picking is closed. Open a current link or ask the organizer to reopen picking.'
        : error?.code === '40001' ? 'A newer saved version exists. Reload it before trying this action again.' : error?.code === '22023' ? error.message : 'Check your connection and try again. Changes have not been confirmed saved.');
}
async function workspaceRequest(action, payload = {}, credential = privateWorkspace().credential) {
    const sb = getSupabaseClient(); if (!sb) throw new Error('Unavailable');
    const { data, error } = await sb.rpc('sp_workspace', { action, credential, payload });
    if (error) throw error; return data;
}
let sessionsCache = Object.create(null), presetsCache = Object.create(null);
let journal = null, sessionVersions = Object.create(null), presetVersions = Object.create(null);
let loadGeneration = 0, workspaceLoadFailed = false;
function mapRowToSession(row) {
    return { id: row.id, factions: row.factions || [], players: row.players || [], sessionName: row.session_name || row.name,
        gameTitle: row.game_title || '', roomCode: row.room_code || '', results: row.results || null, date: row.updated_at };
}
function sessionRow(name, s) {
    const factions = s.factions || [];
    return { name, session_name: s.sessionName || name, game_title: s.gameTitle || '', factions,
        players: (s.players || []).map(p => ({ ...p, preferences: p.preferences.filter(f => factions.includes(f)), bans: p.bans.filter(f => factions.includes(f)) })), results: s.results || null };
}
function ensureJournal() {
    const owner = getWorkspaceKey(), credential = privateWorkspace().credential;
    if (!owner || !credential) return null;
    if (journal?.workspace === owner) return journal;
    journal = new SaveJournal({ storage: localStorage, workspace: owner,
        send: (action, payload) => workspaceRequest(action, payload, getWorkspaceKey() === owner ? privateWorkspace().credential : credential),
        changed: () => renderSaveStatus(),
        acknowledged: (key, row, req) => {
            if (getWorkspaceKey() !== owner) return;
            if (key.startsWith('session:')) {
                sessionVersions[req.payload.name] = row.save_version;
                if (sessionsCache[req.payload.name]) {
                    sessionsCache[req.payload.name].id = row.id;
                    sessionsCache[req.payload.name].roomCode = row.room_code || '';
                }
            } else {
                presetVersions[req.payload.name] = row.save_version;
                presetsCache[req.payload.name] = req.payload.factions;
                if (req.payload.original_name) {
                    delete presetVersions[req.payload.original_name]; delete presetsCache[req.payload.original_name];
                }
                if (typeof renderPresetOptions === 'function') renderPresetOptions();
            }
        }
    });
    return journal;
}
function applyWorkspaceData(data) {
    workspaceLoadFailed = false;
    const j = ensureJournal();
    sessionsCache = Object.create(null); presetsCache = Object.create(null);
    sessionVersions = Object.create(null); presetVersions = Object.create(null);
    (data.sessions || []).forEach(row => {
        sessionsCache[row.name] = mapRowToSession(row); sessionVersions[row.name] = row.save_version;
        if (!j?.entries.has('session:' + row.name)) j?.remember('session:' + row.name, row.save_version, sessionRow(row.name, sessionsCache[row.name]));
    });
    (data.presets || []).forEach(row => {
        presetsCache[row.name] = row.factions || []; presetVersions[row.name] = row.save_version;
        if (!j?.entries.has('preset:' + row.name)) j?.remember('preset:' + row.name, row.save_version, { name: row.name, factions: row.factions });
    });
    // Cloud refreshes cannot erase this tab's unsaved snapshots.
    for (const e of j?.entries.values() || []) if (e.key.startsWith('session:')) {
        const name = e.latest.payload.name, saved = sessionsCache[name];
        sessionsCache[name] = mapRowToSession({ ...e.latest.payload, id: saved?.id, room_code: saved?.roomCode, updated_at: e.updatedAt });
    }
    renderSaveStatus();
}
async function loadSessionsFromDb() {
    const credential = privateWorkspace().credential, generation = ++loadGeneration;
    try {
        const data = await workspaceRequest('load', {}, credential);
        if (generation === loadGeneration && credential === privateWorkspace().credential) applyWorkspaceData(data);
        return true;
    } catch (error) { workspaceLoadFailed = true; renderSaveStatus(); accessError(error, 'Could not load games'); return false; }
}
async function loadPresetsFromDb() { return presetsCache; }
function stageSessionSave(name, s) {
    const j = ensureJournal(); if (!j) return null;
    return j.stage('session:' + name, 'save_session', sessionRow(name, s), sessionVersions[name] ?? null);
}
async function upsertSessionToDb(name, s) {
    stageSessionSave(name, s); return await journal.flush('session:' + name);
}
const pendingActions = new Map();
async function checkedAction(action, payload) {
    const credential = privateWorkspace().credential;
    const key = JSON.stringify([credential,action,payload]);
    const request = pendingActions.get(key) || { ...payload, operation_id: crypto.randomUUID() };
    pendingActions.set(key, request);
    try { const result = await workspaceRequest(action, request, credential); pendingActions.delete(key); return result; }
    catch (error) { accessError(error, error?.code === '40001' ? 'Changed on another device' : 'Could not save'); return null; }
}
async function deleteSessionFromDb(name) {
    if (!(await journal.flush('session:' + name))) return false;
    const result = await checkedAction('delete_session', { name, expected_version: sessionVersions[name] ?? null });
    if (!result) return false;
    journal.bases.delete('session:' + name); delete sessionVersions[name]; return true;
}
async function upsertPresetToDb(name, factions, original = null) {
    const j = ensureJournal(), identity = original || name;
    const rename = original && original !== name;
    const payload = { name, factions, ...(rename ? { original_name: original, target_version: presetVersions[name] ?? null } : {}) };
    j.stage('preset:' + identity, rename ? 'rename_preset' : 'save_preset', payload, presetVersions[identity] ?? null);
    return await j.flush('preset:' + identity);
}
async function deletePresetFromDb(name) {
    const j = ensureJournal(); if (!(await j.flush('preset:' + name))) return false;
    const result = await checkedAction('delete_preset', { name, expected_version: presetVersions[name] ?? null });
    if (!result) return false;
    j.bases.delete('preset:' + name); delete presetVersions[name]; return true;
}
async function initializePrivateWorkspace() {
    if (new URLSearchParams(location.hash.slice(1)).has('organizer')) {
        const credential = parseOrganizerLink(location.href);
        history.replaceState(null, '', location.pathname);
        const data = await workspaceRequest('load', {}, credential);
        storeWorkspace(credential, data.owner_key); applyWorkspaceData(data); return;
    }
    const saved = privateWorkspace();
    if (saved.credential) {
        let data, credential = saved.credential;
        try { data = await workspaceRequest('load', {}, credential); }
        catch (error) {
            if (!saved.pendingCredential) throw error;
            credential = saved.pendingCredential; data = await workspaceRequest('load', {}, credential);
        }
        storeWorkspace(credential, data.owner_key); applyWorkspaceData(data); return;
    }
    if (localStorage.getItem(WORKSPACE_KEY_LS)) {
        openWorkspaceModal();
        get('workspace-help').textContent = 'Your older saved games are preserved. Open the private organizer link supplied during the upgrade, or start a separate workspace below.';
        return;
    }
    await createPrivateWorkspace();
}
async function createPrivateWorkspace(confirmed = false) {
    if (hasWorkspaceKey() && !confirmed) {
        showConfirm('Start a separate workspace?', 'Save your current organizer link first so you can return to these games. A separate workspace starts empty.', () => createPrivateWorkspace(true), 'Start workspace');
        return;
    }
    await flushSession();
    if (journal?.storageError) return;
    const credential = localStorage.getItem(PRIVATE_WORKSPACE_KEY + '_new') || newPrivateToken();
    localStorage.setItem(PRIVATE_WORKSPACE_KEY + '_new', credential);
    try {
        const data = await workspaceRequest('create', {}, credential);
        storeWorkspace(credential, data.owner_key); localStorage.removeItem(PRIVATE_WORKSPACE_KEY + '_new');
        activeSessionName = null; state.roomCode = ''; deactivateRoomSync();
        applyWorkspaceData({ sessions: [], presets: [] });
        closeModals(); updateWorkspaceIndicator(); renderHomeSessions(); renderPresetOptions();
    } catch (error) { accessError(error, 'Could not start workspace'); }
}
async function importOrganizerLink() {
    try {
        const credential = parseOrganizerLink(get('workspace-input').value);
        await flushSession();
        if (journal?.storageError) return;
        const data = await workspaceRequest('load', {}, credential);
        deactivateRoomSync(); activeSessionName = null; state.roomCode = '';
        storeWorkspace(credential, data.owner_key); applyWorkspaceData(data);
        closeModals(); renderHomeSessions(); renderPresetOptions(); switchView('view-home');
    } catch (error) { accessError(error, 'Could not open organizer link'); }
}
async function copyOrganizerLink() {
    if (await copyToClipboard(get('organizer-link').value)) showToast('success', 'Organizer link copied', 'Keep it private. It can edit all games in this workspace.');
    else { get('organizer-link').select(); showToast('info', 'Copy manually', 'Copy the selected private link.'); }
}
function replaceOrganizerLink() {
    showConfirm('Replace organizer link?', 'The old organizer link will stop working on every device. Save the replacement link afterward. Player links stay valid.', async () => {
        if (!(await flushSession())) return;
        if (!(await ensureJournal().flushAll())) return;
        const saved = privateWorkspace(), credential = newPrivateToken();
        localStorage.setItem(PRIVATE_WORKSPACE_KEY, JSON.stringify({ ...saved, pendingCredential: credential }));
        try {
            await workspaceRequest('rotate', { token_hash: await privateTokenHash(credential) }, saved.credential);
            storeWorkspace(credential, saved.ownerKey); openWorkspaceModal();
            showToast('success', 'Organizer link replaced', 'Save your new private link.');
        } catch (error) { accessError(error, 'Could not confirm replacement'); }
    }, 'Replace link', 'danger');
}

let guestPick = { id: 'guest', name: '', preferences: [], bans: [], noPreference: false };
let guestSession = null, guestShowingResults = false, guestAccess = null, guestSavedChoices = '';
let roomTimer = null, roomEpoch = 0;
function pickSignature(p) { return JSON.stringify([p.preferences, p.bans, !!p.noPreference]); }
function playerHasSubmitted(player) { return Boolean(player?.submitted || player?.submittedAt); }
function updateRoomBanner() {
    const banner = get('room-banner'); if (!banner) return;
    banner.style.display = state.roomCode ? 'flex' : 'none'; get('room-banner-code').textContent = state.roomCode ? 'Active' : '';
    renderRoomStatus();
}
function deactivateRoomSync() { ++roomEpoch; clearTimeout(roomTimer); roomTimer = null; }
function startRoomPolling(work) {
    deactivateRoomSync(); const epoch = roomEpoch;
    async function tick() {
        if (epoch !== roomEpoch) return;
        if (!document.hidden) {
            try { await work(epoch); if (epoch === roomEpoch) setRoomConnection(true); }
            catch { if (epoch === roomEpoch) setRoomConnection(false); }
        }
        if (epoch === roomEpoch) roomTimer = setTimeout(tick, 3000);
    }
    tick();
}
function setRoomConnection(ok) {
    const el = get(isGuestMode ? 'guest-connection' : 'room-connection');
    if (el) el.textContent = ok ? 'Live updates connected' : 'Connection interrupted — retrying…';
}
async function refreshRoomSubmissions(epoch = roomEpoch) {
    const name = activeSessionName, workspace = getWorkspaceKey();
    const rows = await workspaceRequest('submissions', { name });
    if (epoch !== roomEpoch || name !== activeSessionName || workspace !== getWorkspaceKey()) return;
    let changed = false;
    for (const row of rows) {
        const player = state.players.find(p => p.id === row.player_id);
        if (!player || player.submittedAt === row.updated_at) continue;
        player.preferences = row.preferences.filter(f => state.factions.includes(f)); player.bans = row.bans.filter(f => state.factions.includes(f));
        player.noPreference = row.no_preference; player.submittedAt = row.updated_at; changed = true;
    }
    if (changed) { autoSave(); renderPlayers(); renderRoomStatus(); }
}
function syncRoomForCurrentSession() {
    if (state.roomCode) startRoomPolling(refreshRoomSubmissions); else deactivateRoomSync(); updateRoomBanner();
}
async function openLiveRoom() {
    if (!activeSessionName || !(await flushSession())) return;
    try {
        const row = await workspaceRequest('open_room', { name: activeSessionName });
        state.roomCode = row.room_code; sessionsCache[activeSessionName] = currentSessionObject();
        syncRoomForCurrentSession(); await showRoomModal();
    } catch (error) { accessError(error, 'Could not open room'); }
}
async function invitation(player = '') {
    const data = await workspaceRequest('invite', { name: activeSessionName, player_id: player });
    return makePrivateLink('player', data.token, { room: data.room_code, player: data.player_id });
}
async function showRoomModal() {
    if (!state.roomCode) return; const name = activeSessionName;
    try {
        const link = await invitation(); if (name !== activeSessionName) return;
        get('room-link-input').value = link; get('room-code-label').textContent = ''; renderRoomStatus();
        get('modal-overlay').classList.add('active'); get('room-modal').classList.add('active');
    } catch (error) { accessError(error, 'Could not load invitations'); }
}
async function copyPlayerLink(id) {
    try {
        if (!(await flushSession())) return;
        const link = await invitation(id); get('room-link-input').value = link;
        if (await copyToClipboard(link)) showToast('success', 'Player link copied', 'Send this invitation only to this player.');
        else { get('room-link-input').select(); showToast('info', 'Copy manually', 'Copy the selected player link.'); }
    } catch (error) { accessError(error, 'Could not copy invitation'); }
}
async function copyRoomLink() {
    try {
        get('room-link-input').value = await invitation();
        if (await copyToClipboard(get('room-link-input').value)) showToast('success', 'Viewing link copied', 'This link can view the room but cannot submit picks.');
        else get('room-link-input').select();
    } catch (error) { accessError(error, 'Could not copy viewing link'); }
}
function replaceRoomLinks() {
    showConfirm('Replace player links?', 'All current player and viewing links for this game will stop working. Send new invitations afterward. Saved picks are kept.', async () => {
        try { await workspaceRequest('reset_room_links', { name: activeSessionName }); await showRoomModal(); }
        catch (error) { accessError(error, 'Could not replace invitations'); }
    }, 'Replace links', 'danger');
}
function renderRoomStatus() {
    const container = get('room-status-list'); if (!container) return; container.replaceChildren();
    const players = state.players || [], count = get('room-banner-count');
    if (count) count.textContent = `${players.filter(playerHasSubmitted).length}/${players.length} submitted`;
    for (const p of players) {
        const row = document.createElement('div'); row.className = 'room-status-row';
        const name = document.createElement('span'); name.className = 'rs-name'; name.textContent = p.name;
        const status = document.createElement('span'); status.className = 'rs-state'; status.textContent = playerHasSubmitted(p) ? '✓ submitted' : 'waiting';
        const button = document.createElement('button'); button.className = 'btn secondary'; button.textContent = 'Copy player link'; button.onclick = () => copyPlayerLink(p.id);
        row.append(name, status, button); container.appendChild(row);
    }
}

function parseRoomFromUrl() { return new URLSearchParams(location.search).get('room')?.trim().toUpperCase() || null; }
function showGuestError(message) {
    document.body.classList.add('guest-mode'); switchView('view-guest');
    get('guest-name-wrap').style.display = 'none'; get('guest-pick-area').style.display = 'none'; get('guest-banner').style.display = 'none';
    get('guest-error').textContent = message; get('guest-error').style.display = 'block';
}
async function guestRequest(action = 'read', payload = {}) {
    const { data, error } = await getSupabaseClient().rpc('sp_room', {
        room: guestSession.code, player: guestAccess.player, credential: guestAccess.token, action, payload
    });
    if (error) throw error; return data;
}
async function enterRoomGuestMode(code) {
    isGuestMode = true; document.body.classList.add('guest-mode'); switchView('view-guest');
    try {
        guestAccess = parsePlayerLink(location.hash); const storageKey = `side_picker_guest_${code}`;
        if (location.hash && !guestAccess) throw new Error('Invalid invitation');
        if (guestAccess) sessionStorage.setItem(storageKey, JSON.stringify(guestAccess));
        else guestAccess = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
        history.replaceState(null, '', location.pathname + location.search);
        if (!guestAccess || !PRIVATE_TOKEN_PATTERN.test(guestAccess.token)) throw new Error('Missing link');
        guestSession = { code }; const data = await guestRequest();
        guestPick.id = guestAccess.player || 'guest'; guestPick.name = data.player_name || '';
        guestPick.preferences = data.mine?.preferences || []; guestPick.bans = data.mine?.bans || []; guestPick.noPreference = !!data.mine?.no_preference;
        guestSavedChoices = data.mine ? pickSignature(guestPick) : '';
        get('guest-name-wrap').style.display = 'block';
        setupDragAndDrop(get('guest-available'), get('guest-preference'), get('guest-banned'), guestPick); applyGuestRoom(data);
        startRoomPolling(async epoch => { const fresh = await guestRequest(); if (epoch === roomEpoch) applyGuestRoom(fresh); });
    } catch { showGuestError('This room link is incomplete, expired, or unavailable. Ask the organizer for a fresh personal invitation.'); }
}
function applyGuestRoom(data) {
    const previous = guestSession?.lastResponse;
    const response = JSON.stringify(data);
    if (response === previous) return;
    guestSession = { ...guestSession, ...data }; state.factions = data.factions;
    guestSession.lastResponse = response;
    get('guest-banner').style.display = 'block'; get('guest-session-name').textContent = data.session_name || ''; get('guest-game-title').textContent = data.game_title || '';
    guestPick.name = data.player_name || '';
    get('guest-player-name').textContent = guestPick.name || 'Viewing only — ask the organizer for your personal player link to submit picks.';
    guestPick.preferences = guestPick.preferences.filter(f => data.factions.includes(f)); guestPick.bans = guestPick.bans.filter(f => data.factions.includes(f));
    renderGuestRoster();
    if (guestResultsReady(data.results)) { guestShowingResults = true; enterSharedResultsMode(data.results); }
    else { if (guestShowingResults) { guestShowingResults = false; showGuestPicks(); } renderGuestPicks(); }
}
function guestResultsReady(results) { return validateResultsPayload(results) !== null; }
function renderGuestRoster() {
    const el = get('guest-roster'), players = guestSession?.players || [];
    el.innerHTML = `<div class="gr-head">${players.filter(playerHasSubmitted).length}/${players.length} submitted</div><div class="gr-chips">${players.map(p => `<span class="gr-chip ${p.submitted ? 'done' : ''}">${p.submitted ? '✓ ' : ''}${escapeHtml(p.name)}</span>`).join('')}</div>`;
    el.style.display = players.length ? 'block' : 'none';
}
function showGuestPicks() { isSharedMode = false; document.body.classList.remove('shared-mode'); switchView('view-guest'); renderGuestPicks(); }
function onGuestNoPreferenceChange() { guestPick.noPreference = get('guest-no-preference').checked; updateGuestSubmitted(); }
function updateGuestSubmitted() { get('guest-submitted').style.display = guestSavedChoices && guestSavedChoices === pickSignature(guestPick) ? 'block' : 'none'; }
function renderGuestPicks() {
    get('guest-pick-area').style.display = guestPick.name ? 'block' : 'none'; get('guest-no-preference').checked = !!guestPick.noPreference;
    if (guestPick.name) refreshListsForCard(guestPick, get('guest-available'), get('guest-preference'), get('guest-banned')); updateGuestSubmitted();
}
async function submitMyPicks() {
    if (!guestPick.name || !guestAccess?.player) return;
    const signature = pickSignature(guestPick), payload = JSON.parse(JSON.stringify({ preferences: guestPick.preferences, bans: guestPick.bans, no_preference: guestPick.noPreference }));
    get('guest-submit-button').disabled = true;
    try {
        const data = await guestRequest('submit', payload); guestSavedChoices = signature; applyGuestRoom(data); updateGuestSubmitted();
        showToast('success', 'Submitted', 'Your choices were saved. You can edit and submit again until results are published.');
    } catch (error) { accessError(error, 'Could not submit picks'); }
    finally { get('guest-submit-button').disabled = false; }
}
