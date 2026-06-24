// Side Picker — live rooms (Supabase-backed).
// Loaded after script.js; relies on its globals (get, state, showToast,
// setupDragAndDrop, refreshListsForCard, switchView, renderPlayers, autoSave,
// isGuestMode, escapeHtml, etc.).

let _supabase = null;

// Lazily create the Supabase client. Returns null if config.js isn't filled in
// or the CDN client failed to load.
function getSupabaseClient() {
    if (_supabase) return _supabase;
    const cfg = window.SUPABASE_CONFIG;
    if (!window.supabase || !cfg || !cfg.url || cfg.url.startsWith('YOUR_')) {
        return null;
    }
    _supabase = window.supabase.createClient(cfg.url, cfg.publishableKey);
    return _supabase;
}

function isSupabaseConfigured() {
    return getSupabaseClient() !== null;
}

// Quick connectivity check used during setup/verification.
async function testSupabaseConnection() {
    const sb = getSupabaseClient();
    if (!sb) return { ok: false, reason: 'not-configured' };
    try {
        const { error } = await sb.from('rooms').select('code').limit(1);
        if (error) return { ok: false, reason: error.message };
        return { ok: true };
    } catch (e) {
        return { ok: false, reason: String(e) };
    }
}

// ---------------------------------------------------------------------------
// Workspace key — scopes an organizer's sessions/presets across devices.
// ---------------------------------------------------------------------------
const WORKSPACE_KEY_LS = 'side_picker_workspace_key';

function getWorkspaceKey() {
    return (localStorage.getItem(WORKSPACE_KEY_LS) || '').trim();
}

function setWorkspaceKey(key) {
    localStorage.setItem(WORKSPACE_KEY_LS, (key || '').trim());
}

function hasWorkspaceKey() {
    return getWorkspaceKey().length > 0;
}

// ---------------------------------------------------------------------------
// Sessions — stored in Supabase, cached in memory for synchronous rendering.
// ---------------------------------------------------------------------------
let sessionsCache = {}; // name -> { factions, players, sessionName, gameTitle, roomCode, date }

function mapRowToSession(row) {
    return {
        factions: row.factions || [],
        players: row.players || [],
        sessionName: row.session_name || row.name,
        gameTitle: row.game_title || '',
        roomCode: row.room_code || '',
        results: row.results || null,
        date: row.updated_at || new Date().toISOString()
    };
}

function sessionRow(name, s) {
    return {
        owner_key: getWorkspaceKey(),
        name,
        session_name: s.sessionName || name,
        game_title: s.gameTitle || '',
        factions: s.factions || [],
        players: s.players || [],
        room_code: s.roomCode || null,
        results: s.results || null,
        updated_at: new Date().toISOString()
    };
}

// Forward-looking: record the organizer (workspace key) in the users table.
async function ensureUser() {
    const sb = getSupabaseClient();
    if (!sb || !hasWorkspaceKey()) return;
    await sb.from('users').upsert({ owner_key: getWorkspaceKey() }, { onConflict: 'owner_key' });
}

async function loadSessionsFromDb() {
    sessionsCache = {};
    const sb = getSupabaseClient();
    if (!sb || !hasWorkspaceKey()) return sessionsCache;

    const { data, error } = await sb.from('sessions').select('*').eq('owner_key', getWorkspaceKey());
    if (error) {
        showToast('error', 'Sessions Error', error.message);
        return sessionsCache;
    }
    (data || []).forEach(row => { sessionsCache[row.name] = mapRowToSession(row); });
    return sessionsCache;
}

async function upsertSessionToDb(name, s) {
    const sb = getSupabaseClient();
    if (!sb || !hasWorkspaceKey()) return;
    const { error } = await sb.from('sessions').upsert(sessionRow(name, s), { onConflict: 'owner_key,name' });
    if (error) showToast('error', 'Save Error', error.message);
}

async function deleteSessionFromDb(name) {
    const sb = getSupabaseClient();
    if (!sb || !hasWorkspaceKey()) return;
    const { error } = await sb.from('sessions').delete().eq('owner_key', getWorkspaceKey()).eq('name', name);
    if (error) showToast('error', 'Delete Error', error.message);
}

// ---------------------------------------------------------------------------
// Presets — stored in Supabase (scoped by workspace key), cached in memory.
// ---------------------------------------------------------------------------
let presetsCache = {}; // name -> factions[]

async function loadPresetsFromDb() {
    presetsCache = {};
    const sb = getSupabaseClient();
    if (!sb || !hasWorkspaceKey()) return presetsCache;

    const { data, error } = await sb.from('presets').select('*').eq('owner_key', getWorkspaceKey());
    if (error) {
        showToast('error', 'Presets Error', error.message);
        return presetsCache;
    }
    (data || []).forEach(row => { presetsCache[row.name] = row.factions || []; });
    return presetsCache;
}

async function upsertPresetToDb(name, factions) {
    const sb = getSupabaseClient();
    if (!sb || !hasWorkspaceKey()) return;
    const { error } = await sb.from('presets').upsert({
        owner_key: getWorkspaceKey(),
        name,
        factions,
        updated_at: new Date().toISOString()
    }, { onConflict: 'owner_key,name' });
    if (error) showToast('error', 'Save Error', error.message);
}

async function deletePresetFromDb(name) {
    const sb = getSupabaseClient();
    if (!sb || !hasWorkspaceKey()) return;
    const { error } = await sb.from('presets').delete().eq('owner_key', getWorkspaceKey()).eq('name', name);
    if (error) showToast('error', 'Delete Error', error.message);
}

// ---------------------------------------------------------------------------
// Shared guest pick state (used by the guest faction-picker view)
// ---------------------------------------------------------------------------
let guestPick = { id: 'guest', name: '', preferences: [], bans: [], noPreference: false };
let guestSession = null; // { code, factions, roster, sessionName, gameTitle }
let guestShowingResults = false; // tracks whether the guest is on the results view

// ---------------------------------------------------------------------------
// Organizer: live room
// ---------------------------------------------------------------------------
let roomChannel = null;     // Realtime subscription
let roomStatus = {};        // player name -> true once they've submitted

function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O/1/I
    let s = '';
    for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
}

function roomLink(code) {
    return `${location.origin}${location.pathname}?room=${code}`;
}

async function openLiveRoom() {
    const sb = getSupabaseClient();
    if (!sb) {
        showToast('error', 'Not Configured', 'Live rooms need Supabase set up in config.js.');
        return;
    }
    if (!activeSessionName) {
        showToast('error', 'No Session', 'Start a session first.');
        return;
    }
    if (state.factions.length === 0) {
        showToast('error', 'No Factions', 'Add factions before opening a room.');
        return;
    }
    if (state.players.length === 0) {
        showToast('error', 'No Players', 'Add the player names first so they can pick theirs.');
        return;
    }
    const names = state.players.map(p => p.name);
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    if (dupes.length > 0) {
        showToast('error', 'Duplicate Names', `Rename players so each name is unique (e.g. "${dupes[0]}").`);
        return;
    }

    // A room is just a code on the session. Generate one if needed, then flush
    // the session so guests can resolve it by code.
    if (!state.roomCode) state.roomCode = generateRoomCode();
    sessionsCache[activeSessionName] = currentSessionObject();
    await upsertSessionToDb(activeSessionName, sessionsCache[activeSessionName]);
    autoSave();

    await activateRoomSync();
    showRoomModal();
}

function showRoomModal() {
    if (!state.roomCode) return;
    get('room-link-input').value = roomLink(state.roomCode);
    get('room-code-label').textContent = state.roomCode;
    renderRoomStatus();
    get('modal-overlay').classList.add('active');
    get('room-modal').classList.add('active');
}

async function copyRoomLink() {
    const ok = await copyToClipboard(get('room-link-input').value);
    if (ok) {
        showToast('success', 'Link Copied', 'Share it with your players.');
    } else {
        get('room-link-input').select();
        showToast('info', 'Copy Manually', 'Press Ctrl/Cmd+C to copy the selected link.');
    }
}

function renderRoomStatus() {
    const container = get('room-status-list');
    if (!container) return;
    container.innerHTML = '';

    const names = state.players.map(p => p.name);
    const submitted = names.filter(n => roomStatus[n]).length;
    get('room-banner-count').textContent = `${submitted}/${names.length} submitted`;

    names.forEach(name => {
        const row = document.createElement('div');
        row.className = 'room-status-row';
        const done = !!roomStatus[name];
        row.innerHTML = `
            <span class="rs-name">${escapeHtml(name)}</span>
            <span class="rs-state ${done ? 'done' : 'waiting'}">${done ? '✓ submitted' : 'waiting…'}</span>
        `;
        container.appendChild(row);
    });
}

function applySubmissionToPlayer(row, { render = true } = {}) {
    const player = state.players.find(p => p.name === row.player_name);
    if (!player) return;
    const isValid = f => state.factions.includes(f);
    player.preferences = (row.preferences || []).filter(isValid);
    player.bans = (row.bans || []).filter(isValid);
    player.noPreference = !!row.no_preference;
    roomStatus[row.player_name] = true;
    if (render) {
        autoSave();
        renderPlayers();
    }
}

async function refreshRoomSubmissions() {
    const sb = getSupabaseClient();
    if (!sb || !state.roomCode) return;
    const { data, error } = await sb.from('submissions').select('*').eq('room_code', state.roomCode);
    if (error) {
        showToast('error', 'Room Error', error.message);
        return;
    }
    roomStatus = {};
    (data || []).forEach(row => applySubmissionToPlayer(row, { render: false }));
    autoSave();
    renderPlayers();
    renderRoomStatus();
}

async function activateRoomSync() {
    const sb = getSupabaseClient();
    if (!sb || !state.roomCode) return;

    await refreshRoomSubmissions();

    if (roomChannel) {
        sb.removeChannel(roomChannel);
        roomChannel = null;
    }
    roomChannel = sb.channel(`room-${state.roomCode}`)
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'submissions', filter: `room_code=eq.${state.roomCode}` },
            payload => {
                if (payload.new) {
                    applySubmissionToPlayer(payload.new);
                    renderRoomStatus();
                    showToast('info', 'Pick Received', `${payload.new.player_name} submitted.`);
                } else if (payload.old) {
                    roomStatus[payload.old.player_name] = false;
                    renderRoomStatus();
                }
            })
        .subscribe();

    updateRoomBanner();
}

function deactivateRoomSync() {
    const sb = getSupabaseClient();
    if (roomChannel && sb) {
        sb.removeChannel(roomChannel);
    }
    roomChannel = null;
    roomStatus = {};
    updateRoomBanner();
}

// Show/hide the "live room active" banner on the players view.
function updateRoomBanner() {
    const banner = get('room-banner');
    if (!banner) return;
    if (state.roomCode) {
        banner.style.display = 'flex';
        get('room-banner-code').textContent = state.roomCode;
        renderRoomStatus();
    } else {
        banner.style.display = 'none';
    }
}

// Called after load/resume to reconnect to a session's room if it has one.
function syncRoomForCurrentSession() {
    if (state.roomCode && isSupabaseConfigured()) {
        activateRoomSync();
    } else {
        deactivateRoomSync();
    }
}

// ---------------------------------------------------------------------------
// Guest: join a room and submit picks
// ---------------------------------------------------------------------------
function parseRoomFromUrl() {
    const params = new URLSearchParams(location.search);
    const code = params.get('room');
    return code ? code.trim().toUpperCase() : null;
}

function showGuestError(message) {
    document.body.classList.add('guest-mode');
    switchView('view-guest');
    get('guest-name-wrap').style.display = 'none';
    get('guest-pick-area').style.display = 'none';
    get('guest-banner').style.display = 'none';
    const err = get('guest-error');
    err.textContent = message;
    err.style.display = 'block';
}

async function enterRoomGuestMode(code) {
    isGuestMode = true;
    document.body.classList.add('guest-mode');
    switchView('view-guest');

    const sb = getSupabaseClient();
    if (!sb) {
        showGuestError('This room link needs Supabase configured to work.');
        return;
    }

    const { data: rows, error } = await sb.from('sessions').select('*').eq('room_code', code).limit(1);
    const session = rows && rows[0];
    if (error || !session) {
        showGuestError('Room not found. Ask the organizer for a fresh link.');
        return;
    }

    guestSession = {
        code,
        factions: session.factions || [],
        roster: (session.players || []).map(p => p.name),
        sessionName: session.session_name || '',
        gameTitle: session.game_title || '',
        results: session.results || null
    };
    state.factions = [...guestSession.factions]; // Lets the shared list/drag helpers work unchanged.

    // Banner with session name + game.
    const banner = get('guest-banner');
    const sessionName = (guestSession.sessionName || '').trim();
    const gameTitle = (guestSession.gameTitle || '').trim();
    if (sessionName || gameTitle) {
        get('guest-session-name').textContent = sessionName;
        get('guest-game-title').textContent = gameTitle ? `🎲 ${gameTitle}` : '';
        banner.style.display = 'block';
    } else {
        banner.style.display = 'none';
    }

    // Name dropdown from the roster + drag wiring — always set up so we can
    // toggle between picks and results live as the organizer optimizes/reopens.
    const select = get('guest-name-select');
    guestSession.roster.forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        select.appendChild(opt);
    });
    setupDragAndDrop(get('guest-available'), get('guest-preference'), get('guest-banned'), guestPick);

    // Stay in sync: flip between picks and results as the organizer optimizes/reopens.
    subscribeGuestToSession(code);

    if (guestResultsReady(guestSession.results)) {
        guestShowingResults = true;
        enterSharedResultsMode(guestSession.results);
    } else {
        guestShowingResults = false;
        renderGuestPicks(); // nothing shown until a name is picked
    }
}

function guestResultsReady(results) {
    return results && Array.isArray(results.r) && results.r.length > 0;
}

// Switch the guest back to the pick UI (e.g. when the organizer reopens the room).
function showGuestPicks() {
    isSharedMode = false;
    document.body.classList.remove('shared-mode');
    switchView('view-guest');
    renderGuestPicks();
}

// Guests watch their session row so results appear/clear live.
function subscribeGuestToSession(code) {
    const sb = getSupabaseClient();
    if (!sb) return;
    if (roomChannel) { sb.removeChannel(roomChannel); roomChannel = null; }
    roomChannel = sb.channel(`guest-${code}`)
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'sessions', filter: `room_code=eq.${code}` },
            payload => {
                const results = payload.new && payload.new.results;
                if (guestResultsReady(results)) {
                    guestShowingResults = true;
                    enterSharedResultsMode(results); // show/refresh results
                } else if (guestShowingResults) {
                    guestShowingResults = false;
                    showGuestPicks(); // organizer reopened the room for changes
                }
            })
        .subscribe();
}

async function onGuestNameChange() {
    const name = get('guest-name-select').value;
    guestPick.name = name;
    get('guest-submitted').style.display = 'none';

    if (!name) {
        guestPick.preferences = [];
        guestPick.bans = [];
        guestPick.noPreference = false;
        renderGuestPicks();
        return;
    }

    // Load this player's current submission from the database so a returning
    // player sees and can change what they last submitted.
    const sb = getSupabaseClient();
    let saved = null;
    if (sb && guestSession) {
        const { data } = await sb.from('submissions').select('*')
            .eq('room_code', guestSession.code).eq('player_name', name).maybeSingle();
        saved = data;
    }

    const isValid = f => guestSession.factions.includes(f);
    guestPick.preferences = saved ? (saved.preferences || []).filter(isValid) : [];
    guestPick.bans = saved ? (saved.bans || []).filter(isValid) : [];
    guestPick.noPreference = saved ? !!saved.no_preference : false;

    get('guest-no-preference').checked = !!guestPick.noPreference;
    renderGuestPicks();
}

function onGuestNoPreferenceChange() {
    guestPick.noPreference = get('guest-no-preference').checked;
}

function renderGuestPicks() {
    const area = get('guest-pick-area');
    if (!guestPick.name) {
        area.style.display = 'none';
        return;
    }
    area.style.display = 'block';
    get('guest-no-preference').checked = !!guestPick.noPreference;
    refreshListsForCard(guestPick, get('guest-available'), get('guest-preference'), get('guest-banned'));
}

async function submitMyPicks() {
    if (!guestPick.name) {
        showToast('error', 'Pick Your Name', 'Select your name first.');
        return;
    }
    const sb = getSupabaseClient();
    if (!sb || !guestSession) {
        showToast('error', 'Not Connected', 'Cannot reach the room right now.');
        return;
    }

    const { error } = await sb.from('submissions').upsert({
        room_code: guestSession.code,
        player_name: guestPick.name,
        preferences: guestPick.preferences,
        bans: guestPick.bans,
        no_preference: guestPick.noPreference,
        updated_at: new Date().toISOString()
    }, { onConflict: 'room_code,player_name' });

    if (error) {
        showToast('error', 'Submit Failed', error.message);
        return;
    }

    get('guest-submitted').style.display = 'block';
    showToast('success', 'Submitted', 'Your picks were sent. You can change them and submit again.');
}
