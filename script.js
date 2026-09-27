// Initialization and State
const state = {
    factions: [],
    players: [], // { id, name, preferences: [], bans: [] }
    sessionName: '', // Label for this game night (shown to players)
    gameTitle: '', // The game being played (shown to players)
    roomCode: '', // Live-room code (Supabase), if a room is open for this session
    results: null // Last optimization snapshot (published to the room)
};


// --- Theme Management ---
function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    // Default is dark if no save and no preference, or if preference is dark
    // So distinct 'light' preference is needed to go light
    if (savedTheme === 'light' || (!savedTheme && !prefersDark)) {
        document.documentElement.setAttribute('data-theme', 'light');
        updateThemeIcon('light');
    } else {
        document.documentElement.removeAttribute('data-theme');
        updateThemeIcon('dark');
    }
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';

    if (newTheme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
        localStorage.setItem('theme', 'light');
    } else {
        document.documentElement.removeAttribute('data-theme');
        localStorage.setItem('theme', 'dark');
    }

    updateThemeIcon(newTheme);
}

function updateThemeIcon(theme) {
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;

    const sun = btn.querySelector('.icon-sun');
    const moon = btn.querySelector('.icon-moon');

    if (theme === 'light') {
        sun.style.display = 'none';
        moon.style.display = 'block';
        btn.setAttribute('aria-label', 'Switch to Dark Mode');
        btn.title = 'Switch to Dark Mode';
    } else {
        sun.style.display = 'block';
        moon.style.display = 'none';
        btn.setAttribute('aria-label', 'Switch to Light Mode');
        btn.title = 'Switch to Light Mode';
    }
}

// Initialize immediately
initTheme();

// --- DOM Helpers ---
function get(id) { return document.getElementById(id); }

// Escape a string for safe interpolation into innerHTML.
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Fisher-Yates: unbiased in-place shuffle.
function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// --- Toast Notifications ---
function showToast(type, title, message) {
    const container = get('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    // Icons based on type
    let icon = '';
    if (type === 'success') icon = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>';
    else if (type === 'error') icon = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';
    else icon = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';

    toast.innerHTML = `
        ${icon}
        <div class="toast-content">
            <div class="toast-title">${escapeHtml(title)}</div>
            <div class="toast-message">${escapeHtml(message)}</div>
        </div>
    `;

    container.appendChild(toast);

    // Auto remove
    setTimeout(() => {
        toast.classList.add('hiding');
        toast.addEventListener('animationend', () => toast.remove());
    }, 4000);
}

// --- View Navigation ---
function nextStep(viewId) {
    if (viewId === 'view-players') {
        if (state.factions.length === 0) {
            showToast('error', 'No Factions', "Please add at least one faction.");
            return;
        }
    }
    switchView(viewId);
}

function prevStep(viewId) {
    switchView(viewId);
}

function switchView(viewId) {
    const changed = !get(viewId).classList.contains('active');
    document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
    get(viewId).classList.add('active');
    if (changed && typeof onViewChanged === 'function') onViewChanged(viewId);
}

function handleEnter(e, callback) {
    if (e.key === 'Enter') callback();
}

// --- Presets ---
// Preset games are stored in Supabase (scoped by workspace key); presetsCache
// lives in rooms.js. getPresets() returns that in-memory cache for rendering.
function getPresets() {
    return presetsCache;
}

// Populate the "Select Game" dropdown from cached presets, preserving the
// current selection when possible.
function renderPresetOptions() {
    const select = get('game-select');
    const current = select.value;
    const presets = getPresets();
    const names = Object.keys(presets).sort((a, b) => a.localeCompare(b));

    select.innerHTML = '<option value="custom">Custom (no game)</option>';
    names.forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        select.appendChild(opt);
    });

    select.value = [...select.options].some(o => o.value === current) ? current : 'custom';

    // Hint that points users at Manage when they have no games yet.
    const hint = get('game-select-hint');
    if (hint) {
        hint.textContent = names.length === 0
            ? 'No games yet — add one with Manage.'
            : 'Add or edit games with Manage.';
    }
}

// --- Modal Management ---
function openInfoModal() {
    get('modal-overlay').classList.add('active');
    get('info-modal').classList.add('active');
}

function showConfirm(title, message, callback, btnText = 'Confirm', btnClass = 'primary', onCancel = null) {
    get('confirm-title').textContent = title;
    get('confirm-message').textContent = message;

    const confirmBtn = get('confirm-btn');
    confirmBtn.textContent = btnText;
    confirmBtn.className = `btn ${btnClass}`;
    confirmBtn.onclick = () => {
        closeModal('confirm-modal');
        callback();
    };

    // Cancel closes only this modal (so it can stack over e.g. the preset modal).
    get('confirm-cancel-btn').onclick = () => {
        closeModal('confirm-modal');
        if (onCancel) onCancel();
    };

    get('modal-overlay').classList.add('active');
    get('confirm-modal').classList.add('active');
}

function closeModal(id) {
    const modal = get(id);
    if (modal) modal.classList.remove('active');

    // Only close the overlay once no other modals remain active.
    const active = document.querySelectorAll('.modal.active');
    if (active.length === 0) {
        get('modal-overlay').classList.remove('active');
    }
}

// --- Faction Setup ---
function loadPreset() {
    const select = get('game-select');
    const name = select.value;

    if (name === 'custom') return;

    const presets = getPresets();
    const factions = presets[name];
    if (!factions) {
        renderPresetOptions();
        return;
    }

    const applyPreset = () => {
        state.factions = [...factions];
        state.gameTitle = name; // Preset name doubles as the game title.
        syncSessionMetaInputs();
        autoSave();
        renderFactions();
        updateAllPlayerFactions();
        showToast('success', 'Preset Loaded', `Loaded ${factions.length} factions.`);
    };

    if (state.factions.length > 0) {
        showConfirm(
            'Overwrite Factions?',
            `Loading "${name}" will replace all current factions. This cannot be undone.`,
            applyPreset,
            'Load Preset',
            'accent',
            () => { select.value = 'custom'; } // Revert the dropdown if cancelled
        );
    } else {
        applyPreset();
    }
}

// --- Session Metadata (name + game) ---
function onSessionMetaInput() {
    state.sessionName = get('session-name-input').value;
    state.gameTitle = get('game-title-input').value;
    autoSave();
}

function syncSessionMetaInputs() {
    const nameInput = get('session-name-input');
    const gameInput = get('game-title-input');
    if (nameInput) nameInput.value = state.sessionName || '';
    if (gameInput) gameInput.value = state.gameTitle || '';
}

function addFaction() {
    const input = get('faction-input');
    const name = input.value.trim();
    if (name.length > 500 || state.factions.length >= 100) return showToast('error', 'Faction limit', 'Use up to 100 factions, with names at most 500 characters.');

    if (name && !state.factions.includes(name)) {
        state.factions.push(name);
        autoSave();
        // Switch element back to custom if we edit manually
        const select = get('game-select');
        if (select.value !== 'custom') select.value = 'custom';

        renderFactions();
        input.value = '';
        updateAllPlayerFactions(); // If players exist, update their lists
    } else if (state.factions.includes(name)) {
        showToast('error', 'Duplicate', "Faction already exists!");
    }
    input.focus();
}

function removeFaction(btn) {
    const tag = btn.closest('.tag');
    const name = tag.querySelector('.name').textContent;
    state.factions = state.factions.filter(f => f !== name);
    autoSave();

    // Switch to custom since we modified it
    const select = get('game-select');
    if (select.value !== 'custom') select.value = 'custom';

    renderFactions();
    updateAllPlayerFactions();
}

function renderFactions() {
    const container = get('faction-list');
    container.innerHTML = '';

    // Sort Alphabetically
    state.factions.sort((a, b) => a.localeCompare(b));

    if (state.factions.length === 0) {
        container.innerHTML = '<div class="empty-state">No factions added yet</div>';
        return;
    }

    const template = get('template-faction-tag');
    state.factions.forEach(faction => {
        const clone = template.content.cloneNode(true);
        clone.querySelector('.name').textContent = faction;
        clone.querySelector('.remove-btn').setAttribute('aria-label', `Remove ${faction}`);
        container.appendChild(clone);
    });
}

// --- Player Setup ---
function addPlayer() {
    const input = get('player-input');
    const name = input.value.trim();
    if (name.length > 500 || state.players.length >= 100) return showToast('error', 'Player limit', 'Use up to 100 players, with names at most 500 characters.');

    if (name) {
        const id = 'player-' + crypto.randomUUID();
        state.players.push({
            id: id,
            name: name,
            preferences: [], // Ordered list of favored factions
            bans: [], // List of unwanted factions
            locked: false,
            noPreference: false, // New flag: if true, all preferences have equal weight (10)
            expanded: true // Default to open when added
        });

        autoSave();
        renderPlayers();
        input.value = '';
    }
    input.focus();
}

function removePlayer(event, btn) {
    event.stopPropagation(); // prevent toggle
    const card = btn.closest('.player-card');
    const id = card.getAttribute('data-player-id');
    state.players = state.players.filter(p => p.id !== id);
    autoSave();
    renderPlayers();
}

function updatePlayerName(element) {
    const card = element.closest('.player-card');
    const id = card.getAttribute('data-player-id');
    const newName = element.textContent.trim();

    // Find player
    const player = state.players.find(p => p.id === id);

    if (!newName) {
        // Revert to old name if empty
        if (player) element.textContent = player.name;
        return;
    }

    if (player && player.name !== newName) {
        player.name = newName;
        autoSave();
    }
}

function handleNameEdit(event, element) {
    if (event.key === 'Enter') {
        event.preventDefault();
        element.blur(); // Trigger commit
    }
}

function clearPlayerChoices(btn) {
    const card = btn.closest('.player-card');
    const id = card.getAttribute('data-player-id');
    const player = state.players.find(p => p.id === id);

    if (player) {
        showConfirm(
            'Reset Choices?',
            `Are you sure you want to clear all preferences for ${player.name}?`,
            () => {
                player.preferences = [];
                player.bans = [];
                autoSave();
                const availableList = card.querySelector('.available-list');
                const prefList = card.querySelector('.preference-list');
                const banList = card.querySelector('.banned-list');
                refreshListsForCard(player, availableList, prefList, banList);
                showToast('info', 'Choices Cleared', `Reset for ${player.name}`);
            },
            'Clear Choices',
            'secondary' // Not super dangerous
        );
    }
}

function togglePlayerLock(event, btn) {
    event.stopPropagation();
    const card = btn.closest('.player-card');
    const id = card.getAttribute('data-player-id');
    const player = state.players.find(p => p.id === id);

    if (player) {
        player.locked = !player.locked;
        autoSave();
        renderPlayers(); // Re-render to update icon
    }
}

function togglePlayerNoPreference(event, btn) {
    event.stopPropagation();
    const card = btn.closest('.player-card');
    const id = card.getAttribute('data-player-id');
    const player = state.players.find(p => p.id === id);

    if (player) {
        player.noPreference = !player.noPreference;
        autoSave();
        // Update UI state - check the checkbox
        // Since we are re-rendering often, we might need to rely on renderPlayers or manual toggle
        // Ideally renderPlayers should handle the checked state
        renderPlayers();
    }
}

function togglePlayerCard(header) {
    const card = header.closest('.player-card');
    const id = card.getAttribute('data-player-id');
    const player = state.players.find(p => p.id === id);

    if (player) {
        player.expanded = !player.expanded;
        autoSave();
        // Toggle the class directly to avoid a full re-render on a simple click;
        // the saved state keeps the next render consistent.
        card.classList.toggle('active');
        card.querySelector('.expand-player').setAttribute('aria-expanded', String(player.expanded));
    }
}


function renderPlayers() {
    const container = get('players-container');

    // Full re-render from state. Simple and correct for this scale.
    container.innerHTML = '';

    if (state.players.length === 0) {
        container.innerHTML = '<div class="empty-state">No players added yet</div>';
        return;
    }

    const template = get('template-player-card');

    state.players.forEach(player => {
        const clone = template.content.cloneNode(true);
        const card = clone.querySelector('.player-card');
        card.setAttribute('data-player-id', player.id);

        // Restore expanded state
        if (player.expanded) {
            card.classList.add('active');
        }

        clone.querySelector('.player-name').textContent = player.name;
        const expand = clone.querySelector('.expand-player');
        expand.setAttribute('aria-label', `Choices for ${player.name}`);
        expand.setAttribute('aria-expanded', String(!!player.expanded));
        clone.querySelector('.player-name').setAttribute('aria-label', `Player name: ${player.name}`);

        // Lock State
        const lockBtn = clone.querySelector('.unlock');
        if (player.locked) {
            lockBtn.querySelector('.locked').style.display = 'inline';
            lockBtn.querySelector('.unlocked').style.display = 'none';
            lockBtn.title = "Unlock randomization";
            card.classList.add('locked-mode');
        } else {
            lockBtn.querySelector('.locked').style.display = 'none';
            lockBtn.querySelector('.unlocked').style.display = 'inline';
            lockBtn.title = "Lock randomization";
            card.classList.remove('locked-mode');
        }

        // Populate Lists
        const availableList = clone.querySelector('.available-list');
        const prefList = clone.querySelector('.preference-list');
        const banList = clone.querySelector('.banned-list');

        refreshListsForCard(player, availableList, prefList, banList);

        // Setup Drag and Drop
        setupDragAndDrop(availableList, prefList, banList, player);

        // No Preference Toggle
        const npCheckbox = clone.querySelector('.no-preference-check');
        if (npCheckbox) {
            npCheckbox.checked = player.noPreference || false;
            npCheckbox.onchange = (e) => togglePlayerNoPreference(e, e.target);
        }

        container.appendChild(clone);
    });
}

function refreshListsForCard(player, availableList, prefList, banList) {
    if (isGuestMode && typeof updateGuestSubmitted === 'function') updateGuestSubmitted();
    // Clear lists
    availableList.innerHTML = '';
    prefList.innerHTML = '';
    banList.innerHTML = '';

    // Re-render after a button action (autoSave is a no-op in guest mode).
    const rerender = () => {
        refreshListsForCard(player, availableList, prefList, banList);
        autoSave();
    };

    // Move a faction between lists (drag-free, keyboard/tap accessible).
    const moveTo = (faction, dest) => {
        player.preferences = player.preferences.filter(f => f !== faction);
        player.bans = player.bans.filter(f => f !== faction);
        if (dest === 'pref') player.preferences.push(faction);
        else if (dest === 'ban') player.bans.push(faction);
        rerender();
    };

    // Reorder within the ranked preference list (dir: -1 up, +1 down).
    const reorder = (faction, dir) => {
        const i = player.preferences.indexOf(faction);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= player.preferences.length) return;
        [player.preferences[i], player.preferences[j]] = [player.preferences[j], player.preferences[i]];
        rerender();
    };

    const makeBtn = (label, title, onClick) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'li-action';
        b.innerHTML = label;
        b.title = title;
        b.setAttribute('aria-label', title);
        b.draggable = false;
        b.onclick = (e) => {
            e.stopPropagation();
            const faction = b.closest('li').dataset.faction;
            onClick();
            const item = [availableList,prefList,banList].flatMap(list => [...list.children]).find(li => li.dataset.faction === faction);
            const buttons = [...(item?.querySelectorAll('button') || [])];
            (buttons.find(button => button.getAttribute('aria-label') === title) || buttons[0])?.focus({preventScroll:true});
            if (typeof announce === 'function') announce(`${faction}: ${player.bans.includes(faction) ? 'banned' : player.preferences.includes(faction) ? `preference ${player.preferences.indexOf(faction)+1}` : 'available'}`);
        };
        return b;
    };

    const createLi = (name, listType) => {
        const li = document.createElement('li');
        li.draggable = true;
        li.dataset.faction = name; // Read by drag commit instead of textContent.
        const handle = document.createElement('span'); handle.className = 'drag-handle'; handle.textContent = '⠿';
        handle.setAttribute('aria-hidden','true'); handle.title = 'Drag from here, or use the buttons'; li.appendChild(handle);

        const label = document.createElement('span');
        label.className = 'li-label';
        label.textContent = name;
        li.appendChild(label);

        const actions = document.createElement('span');
        actions.className = 'li-actions';

        if (listType === 'available') {
            actions.appendChild(makeBtn('♥', `Prefer ${name}`, () => moveTo(name, 'pref')));
            actions.appendChild(makeBtn('⊘', `Ban ${name}`, () => moveTo(name, 'ban')));
        } else if (listType === 'pref') {
            actions.appendChild(makeBtn('↑', `Move ${name} up`, () => reorder(name, -1)));
            actions.appendChild(makeBtn('↓', `Move ${name} down`, () => reorder(name, 1)));
            actions.appendChild(makeBtn('✕', `Remove ${name} from preferences`, () => moveTo(name, 'available')));
        } else { // banned
            actions.appendChild(makeBtn('✕', `Unban ${name}`, () => moveTo(name, 'available')));
        }

        li.appendChild(actions);
        return li;
    };

    // 1. Preferences
    player.preferences.forEach(f => {
        if (state.factions.includes(f)) {
            prefList.appendChild(createLi(f, 'pref'));
        }
    });

    // 2. Bans
    player.bans.forEach(f => {
        if (state.factions.includes(f)) {
            banList.appendChild(createLi(f, 'ban'));
        }
    });

    // 3. Available (Rest)
    state.factions.forEach(f => {
        if (!player.preferences.includes(f) && !player.bans.includes(f)) {
            availableList.appendChild(createLi(f, 'available'));
        }
    });
}

function updateAllPlayerFactions() {
    // When factions change (added/removed), we need to update player data structures
    // to remove deleted factions or make new ones available.
    // For simplicity, re-rendering triggers `refreshListsForCard` which handles display.
    // But we should clean the underlying model objects first.
    state.players.forEach(p => {
        p.preferences = p.preferences.filter(f => state.factions.includes(f));
        p.bans = p.bans.filter(f => state.factions.includes(f));
    });
    renderPlayers();
}

// --- Randomization ---
function randomizeAllPreferences() {
    if (state.players.length === 0) {
        showToast('error', 'No Players', "Add players first!");
        return;
    }

    showConfirm(
        'Randomize Everything?',
        'This will randomly assign preferences and bans for ALL players (except locked ones). Existing choices will be lost.',
        () => {
            let count = 0;
            state.players.forEach(player => {
                if (player.locked) return;

                count++;
                const shuffled = shuffle([...state.factions]);
                const total = shuffled.length;
                const numPrefs = Math.floor(Math.random() * total) + 1;
                const remaining = total - numPrefs;
                const numBans = Math.floor(Math.random() * (remaining + 1));

                player.preferences = shuffled.slice(0, numPrefs);
                player.bans = shuffled.slice(numPrefs, numPrefs + numBans);
            });

            autoSave();
            renderPlayers();
            showToast('success', 'Randomized', `Updated choices for ${count} players.`);
        },
        'Randomize',
        'accent'
    );
}

// --- Drag and Drop Logic ---
const touchDragState = {
    item: null,
    ghost: null,
    offsetX: 0,
    offsetY: 0,
    allLists: null,
    player: null,
    lastTargetList: null,
    lastAfterElement: null,
    rafId: null,
    lastTouch: null
};

function setupDragAndDrop(list1, list2, list3, playerObj) {
    const lists = [list1, list2, list3];

    lists.forEach(list => {
        // Desktop Drag
        list.addEventListener('dragstart', e => {
            const li = e.target.closest('li');
            if (li) li.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });

        list.addEventListener('dragend', e => {
            const li = e.target.closest('li');
            if (li) li.classList.remove('dragging');
            updatePlayerStateFromDOM(playerObj, list1, list2, list3);
        });

        list.addEventListener('dragover', e => {
            e.preventDefault();
            const afterElement = getDragAfterElement(list, e.clientY);
            const draggable = document.querySelector('.dragging');
            if (!draggable || !lists.includes(draggable.parentElement)) return;
            if (afterElement == null) {
                list.appendChild(draggable);
            } else {
                list.insertBefore(draggable, afterElement);
            }
        });

        // Touch Drag
        setupTouchDrag(list, [list1, list2, list3], playerObj);
    });
}

function setupTouchDrag(list, allLists, playerObj) {
    list.addEventListener('touchstart', e => {
        // Let taps on the action buttons through (accessible, no-drag path).
        if (!e.target.closest('.drag-handle')) return;

        const li = e.target.closest('li');
        if (!li) return;

        if (touchDragState.item) return;
        e.preventDefault();
        const touch = e.touches[0];
        if (!touch) return;
        startTouchDrag(li, allLists, playerObj, touch);
    }, { passive: false });
}

function startTouchDrag(li, allLists, playerObj, touch) {
    cleanupTouchDrag();

    touchDragState.item = li;
    touchDragState.allLists = allLists;
    touchDragState.player = playerObj;
    touchDragState.lastTargetList = null;
    touchDragState.lastAfterElement = null;
    touchDragState.lastTouch = touch;

    li.classList.add('dragging');

    const rect = li.getBoundingClientRect();
    const ghost = li.cloneNode(true);
    ghost.classList.add('drag-ghost');
    ghost.style.position = 'fixed';
    ghost.style.left = '0px';
    ghost.style.top = '0px';
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    ghost.style.zIndex = '10000';
    ghost.style.opacity = '0.9';
    ghost.style.pointerEvents = 'none';
    ghost.style.background = '#3b82f6';
    ghost.style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0) scale(1.05)`;
    ghost.style.transformOrigin = 'top left';
    ghost.style.boxShadow = '0 10px 20px rgba(0,0,0,0.3)';
    ghost.style.willChange = 'transform';
    document.body.appendChild(ghost);

    touchDragState.ghost = ghost;
    touchDragState.offsetX = touch.clientX - rect.left;
    touchDragState.offsetY = touch.clientY - rect.top;

    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd, { passive: false });
    document.addEventListener('touchcancel', onTouchEnd, { passive: false });
}

function onTouchMove(e) {
    if (!touchDragState.item || !touchDragState.ghost) return;
    const touch = e.touches[0];
    if (!touch) return;
    e.preventDefault();
    touchDragState.lastTouch = touch;

    if (touchDragState.rafId) return;
    touchDragState.rafId = requestAnimationFrame(updateTouchDragPosition);
}

function updateTouchDragPosition() {
    touchDragState.rafId = null;
    const touch = touchDragState.lastTouch;
    if (!touch || !touchDragState.item || !touchDragState.ghost) return;

    const x = touch.clientX - touchDragState.offsetX;
    const y = touch.clientY - touchDragState.offsetY;
    touchDragState.ghost.style.transform = `translate3d(${x}px, ${y}px, 0) scale(1.05)`;

    const target = document.elementFromPoint(touch.clientX, touch.clientY);
    if (!target) return;

    const targetList = target.closest('.sortable-list');
    if (!targetList || !touchDragState.allLists.includes(targetList)) return;

    const afterElement = getDragAfterElement(targetList, touch.clientY);
    if (targetList === touchDragState.lastTargetList && afterElement === touchDragState.lastAfterElement) {
        return;
    }

    if (afterElement == null) {
        targetList.appendChild(touchDragState.item);
    } else if (afterElement !== touchDragState.item) {
        targetList.insertBefore(touchDragState.item, afterElement);
    }

    touchDragState.lastTargetList = targetList;
    touchDragState.lastAfterElement = afterElement;
}

function onTouchEnd(event) {
    cleanupTouchDrag(event?.type !== 'touchcancel');
}

function cleanupTouchDrag(commit = true) {
    if (touchDragState.rafId) {
        cancelAnimationFrame(touchDragState.rafId);
        touchDragState.rafId = null;
    }

    if (touchDragState.item) {
        touchDragState.item.classList.remove('dragging');
    }

    if (touchDragState.ghost) {
        touchDragState.ghost.remove();
    }

    document.querySelectorAll('.drag-ghost').forEach(el => el.remove());

    if (touchDragState.player && touchDragState.allLists) {
        const [l1, l2, l3] = touchDragState.allLists;
        if (commit) updatePlayerStateFromDOM(touchDragState.player, l1, l2, l3);
        else refreshListsForCard(touchDragState.player, l1, l2, l3);
    }

    touchDragState.item = null;
    touchDragState.ghost = null;
    touchDragState.allLists = null;
    touchDragState.player = null;
    touchDragState.lastTargetList = null;
    touchDragState.lastAfterElement = null;
    touchDragState.lastTouch = null;

    document.removeEventListener('touchmove', onTouchMove);
    document.removeEventListener('touchend', onTouchEnd);
    document.removeEventListener('touchcancel', onTouchEnd);
}

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('li:not(.dragging)')];

    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function updatePlayerStateFromDOM(player, availableList, prefList, banList) {
    // Read names from DOM lists and update state object. Use the data attribute
    // (not textContent) since each item now also contains action buttons.
    player.preferences = [...prefList.querySelectorAll('li')].map(li => li.dataset.faction);
    player.bans = [...banList.querySelectorAll('li')].map(li => li.dataset.faction);
    autoSave();
}

// --- Optimization Engine ---

// --- Solver runner (Web Worker) ---
// The solver is pure, so we build a Worker
// from the existing functions via .toString() — no duplicated logic to drift.
let _optimizerWorker = null;
let _optimizerReject = null;

function buildOptimizerWorker() {
    const src = `
        const SCORES = ${JSON.stringify(SCORES)};
        ${getScore.toString()}
        ${validateOptimizerInput.toString()}
        ${findAssignmentConflict.toString()}
        ${findOptimalAssignment.toString()}
        self.onmessage = function (e) {
            try {
                const { players, factions, mode } = e.data;
                self.postMessage({ ok: true, result: findOptimalAssignment(players, factions, mode) });
            } catch (err) {
                self.postMessage({ ok: false, error: String(err) });
            }
        };
    `;
    const blob = new Blob([src], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    try { return new Worker(url); }
    finally { URL.revokeObjectURL(url); }
}

// Keep solving cancellable. A blocked/broken Worker never starts work on the UI
// thread; timeout also releases the worker if a browser cannot complete it.
function runOptimization(players, factions, mode) {
    return new Promise((resolve, reject) => {
        let worker;
        try {
            worker = buildOptimizerWorker();
        } catch (e) {
            reject(new Error('This browser could not start the optimizer. Refresh or try another browser.'));
            return;
        }

        _optimizerWorker = worker;
        let timer;
        const teardown = () => {
            clearTimeout(timer);
            if (_optimizerWorker === worker) _optimizerWorker = null;
            _optimizerReject = null;
            worker.terminate();
        };
        _optimizerReject = error => { teardown(); reject(error); };
        timer = setTimeout(() => { teardown(); reject(new Error('Optimization took too long. Try again or use fewer players and factions.')); }, 15000);

        worker.onmessage = (e) => {
            teardown();
            if (e.data && e.data.ok) resolve(e.data.result);
            else reject(new Error((e.data && e.data.error) || 'Optimization failed'));
        };
        worker.onerror = () => {
            teardown();
            reject(new Error('The optimizer could not run. Refresh or try another browser.'));
        };

        try { worker.postMessage({ players, factions, mode }); }
        catch (error) { teardown(); reject(error); }
    });
}

// Cancel button on the spinner: kill the worker and reject the pending promise.
function cancelOptimization() {
    if (_optimizerWorker) { _optimizerWorker.terminate(); _optimizerWorker = null; }
    hideOptimizerSpinner();
    if (_optimizerReject) {
        const reject = _optimizerReject;
        _optimizerReject = null;
        reject(new Error('cancelled'));
    }
}

function showOptimizerSpinner() {
    const el = get('opt-spinner');
    if (el) el.style.display = 'flex';
}

function hideOptimizerSpinner() {
    const el = get('opt-spinner');
    if (el) el.style.display = 'none';
}

// Single-flight guard: a run owns the optimizer globals (worker/reject) for its
// whole async span, so re-entry is ignored rather than orphaning a worker.
let _optimizing = false;

function optimizationSnapshot() {
    return JSON.parse(JSON.stringify({
        activeSessionName, workspace: getWorkspaceKey(),
        factions: state.factions, sessionName: state.sessionName, gameTitle: state.gameTitle,
        roomCode: state.roomCode,
        players: state.players.map(({ id, name, preferences, bans, noPreference }) =>
            ({ id, name, preferences, bans, noPreference: noPreference ?? false }))
    }));
}

function optimizationSnapshotIsCurrent(snapshot) {
    return JSON.stringify(snapshot) === JSON.stringify(optimizationSnapshot());
}

async function calculateOptimization() {
    if (state.players.length === 0) {
        showToast('error', 'No Players', "Add players first!");
        return;
    }

    if (state.factions.length < state.players.length) {
        showToast('error', 'Not Enough Factions', `You have ${state.factions.length} factions for ${state.players.length} players.`);
        return;
    }

    if (_optimizing) return; // a run is already in progress

    _optimizing = true;
    try {
        if (state.roomCode && !(await setRoomStage('locked'))) return;
        const snapshot = optimizationSnapshot();
        showOptimizerSpinner();
        let result, comparison;
        try {
            result = await runOptimization(snapshot.players, snapshot.factions, 'total');
            if (result.success) {
                const fairness = await runOptimization(snapshot.players, snapshot.factions, 'fairness');
                comparison = { total: result, fairness };
                if (!fairness.success) result = fairness;
            }
        } catch (e) {
            hideOptimizerSpinner();
            if (e && e.message !== 'cancelled') {
                showToast('error', 'Optimization Failed', e.message || 'Something went wrong.');
            }
            return;
        }
        hideOptimizerSpinner();

        if (!optimizationSnapshotIsCurrent(snapshot)) {
            showToast('info', 'Picks Changed', 'The setup or player choices changed while calculating. Run Optimize again to include the latest picks.');
            return;
        }

        if (result.success) {
            showGoalComparison(comparison, snapshot);
        } else {
            showToast('error', 'No Valid Assignment', result.reason || 'No assignment respects all bans. Add factions or revise the conflicting choices.');
        }
    } finally {
        _optimizing = false;
    }
}

// Clear the published results and reopen the picker. Clearing flips any guests
// back from the results view to the picker. Confirm first, since it discards the
// results everyone is currently viewing (they can be regenerated by optimizing).
function reopenForChanges() {
    if (!state.results) {
        switchView('view-players');
        return;
    }
    showConfirm(
        'Clear Results?',
        'This clears the current results and reopens the picker so players can change their picks. You can optimize again afterward.',
        async () => {
            state.results = null;
            state.roomStage = 'collecting';
            autoSave();
            if (activeSessionName) {
                if (!(await flushSession())) showToast('info', 'Reopen not saved yet', 'Guests can change picks after saving succeeds.');
            }
            updateRoomBanner();
            switchView('view-players');
        },
        'Clear & Reopen',
        'danger'
    );
}

// Most recent optimization, captured for the shareable results link.
let lastResults = null;

function displayResults(result, input = state, goalOverride = null) {
    const container = get('results-container');
    container.innerHTML = '';

    const maxPossible = input.players.length * SCORES.rank1;
    const percent = maxPossible > 0 ? Math.round((result.score / maxPossible) * 100) : 0;

    get('total-score').textContent = `${percent}%`;

    const sessionName = (input.sessionName || '').trim();
    const gameTitle = (input.gameTitle || '').trim();
    const subtitleParts = [sessionName, gameTitle].filter(Boolean);
    get('results-subtitle').textContent =
        subtitleParts.length ? subtitleParts.join(' · ') : 'The happiness algorithm has spoken.';

    const goalEl = document.querySelector('input[name="opt-mode"]:checked');
    const goalText = goalOverride || (goalEl ? goalEl.parentElement.querySelector('strong').textContent : '');

    const shareRows = [];

    input.players.forEach((p, index) => {
        const assignedFaction = result.assignment[p.id];
        const score = getScore(p, assignedFaction);

        let note = "Neutral";
        if (p.preferences.includes(assignedFaction)) {
            note = p.noPreference ? "Choice" : `Choice #${p.preferences.indexOf(assignedFaction) + 1}`;
        } else if (p.bans.includes(assignedFaction)) {
            note = "BANNED (Forced)";
        }

        container.appendChild(buildResultCard({ name: p.name, faction: assignedFaction, note, score, index }));
        shareRows.push({ n: p.name, f: assignedFaction, note: note, s: score });
    });

    lastResults = { v: 1, t: sessionName, gm: gameTitle, g: goalText, pct: percent, r: shareRows };
    get('results-subtitle').textContent = [...subtitleParts, `Goal: ${goalText}`].join(' · ');
    get('results-summary').textContent = describeResultRows(shareRows);
}

// --- Session Management ---
// Named sessions live in Supabase (scoped by workspace key); see rooms.js.
// Acknowledged saves live in Supabase. Pending edits are backed up before
// debounce and can be recovered as separate copies after a refresh.

// Name of the saved session currently being worked on, if any. Changes are
// persisted back into it live (debounced), so imported picks etc. need no manual save.
let activeSessionName = null;

function currentSessionObject() {
    return {
        factions: state.factions,
        players: state.players,
        sessionName: state.sessionName,
        gameTitle: state.gameTitle,
        roomCode: state.roomCode,
        results: state.results,
        date: new Date().toISOString()
    };
}

// Auto-save on every change: update the in-memory cache now and push to the
// database on a short debounce. Supabase is the source of truth.
let _sessionSyncTimer = null;
function autoSave() {
    // In guest mode there is no organizer state to persist (the room DB is the source of truth).
    if (isGuestMode) return;

    if (activeSessionName) {
        sessionsCache[activeSessionName] = currentSessionObject();
        clearTimeout(_sessionSyncTimer);
        const name = activeSessionName;
        stageSessionSave(name, sessionsCache[name]);
        const target = journal;
        _sessionSyncTimer = setTimeout(() => { _sessionSyncTimer = null; target.flush('session:' + name); }, 1200);
    }

    // Keep explicit submission status current when the room is open.
    if (state.roomCode && typeof renderRoomStatus === 'function') renderRoomStatus();
}

// Flush any pending debounced save immediately (e.g. before the page unloads)
// so an edit made within the debounce window isn't lost.
async function flushSession() {
    if (_sessionSyncTimer) {
        clearTimeout(_sessionSyncTimer);
        _sessionSyncTimer = null;
    }
    if (activeSessionName && !isGuestMode) {
        sessionsCache[activeSessionName] = currentSessionObject();
        return await upsertSessionToDb(activeSessionName, sessionsCache[activeSessionName]);
    }
    return true;
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // If opened via a room link, run as a guest instead of the organizer app.
    const roomCode = parseRoomFromUrl();
    if (roomCode) {
        enterRoomGuestMode(roomCode);
        return;
    }

    try {
        const sharedResults = parseResultsFromUrl();
        if (sharedResults) {
            enterSharedResultsMode(sharedResults);
            return;
        }
    } catch {
        showInvalidResultsLink();
        return;
    }

    renderPresetOptions();
    updateWorkspaceIndicator();
    initWorkspaceAndSessions(); // async: load sessions from DB (prompts for a workspace key if needed)

    // autoSave backs up synchronously; unload delivery is not required.
});

async function initWorkspaceAndSessions() {
    if (!isSupabaseConfigured()) {
        renderHomeSessions(); // Will show a "not configured" notice.
        return;
    }
    try { await initializePrivateWorkspace(); }
    catch (error) { workspaceLoadFailed = true; accessError(error, 'Could not open saved games'); ensureJournal(); if (!hasWorkspaceKey()) openWorkspaceModal(); renderSaveStatus(); }
    renderPresetOptions();
    renderHomeSessions();
}

// --- Workspace key ---
function openWorkspaceModal() {
    get('workspace-input').value = '';
    get('organizer-link-wrap').hidden = !hasWorkspaceKey();
    get('organizer-link').value = hasWorkspaceKey() ? makePrivateLink('organizer', privateWorkspace().credential) : '';
    get('modal-overlay').classList.add('active');
    get('workspace-modal').classList.add('active');
    get('workspace-input').focus();
}

function updateWorkspaceIndicator() {
    const el = get('workspace-indicator');
    if (!el) return;
    el.innerHTML = `<button class="link-btn" onclick="openWorkspaceModal()">${hasWorkspaceKey() ? 'Save or open your private organizer link' : 'Open saved games or start a workspace'}</button>`;
}

// Named Sessions (DB-backed; sessionsCache lives in rooms.js)
function getSessions() {
    return sessionsCache;
}

// Create a brand-new, empty session in the database and open it. Everything
// after this auto-saves, so there's no separate "Save" step.
async function createNewSession(name, repeatSource = null) {
    if (!name) return showToast('error', 'Missing Name', 'Please enter a session name.');
    if (name.length > 500) return showToast('error', 'Name too long', 'Use at most 500 characters.');
    if (!isSupabaseConfigured()) return showToast('error', 'Not Configured', 'Sessions need Supabase set up.');
    if (!hasWorkspaceKey()) { openWorkspaceModal(); return; }
    if (sessionsCache[name]) return showToast('error', 'Name Taken', `A session named "${name}" already exists.`);
    await flushSession();
    if (journal?.storageError) return;

    state.factions = [];
    state.players = [];
    state.sessionName = name;
    state.gameTitle = '';
    state.roomCode = '';
    state.roomStage = null;
    state.results = null;
    if (repeatSource) Object.assign(state, repeatGame(repeatSource, name));
    activeSessionName = name;

    const obj = currentSessionObject();
    sessionsCache[name] = obj;
    const saved = await upsertSessionToDb(name, obj);

    get('game-select').value = 'custom';
    renderFactions();
    renderPlayers();
    syncSessionMetaInputs();
    deactivateRoomSync();
    closeModals();
    switchView('view-factions');
    if (saved) showToast('success', 'Session Created', `"${name}" is ready.`);
    else showToast('info', 'Game not saved yet', 'You can keep editing here. Use the save status above to retry or recover your work.');
}

function deleteSession(name, onSuccess) {
    showConfirm(
        'Delete Session?',
        `Are you sure you want to delete "${name}"?`,
        async () => {
            if (activeSessionName !== name && !(await flushSession())) return;
            if (_sessionSyncTimer) { clearTimeout(_sessionSyncTimer); _sessionSyncTimer = null; }
            if (!(await deleteSessionFromDb(name))) return;
            delete sessionsCache[name];

            if (activeSessionName === name) {
                activeSessionName = null;
                state.roomCode = '';
                deactivateRoomSync();
                autoSave();
            }

            showToast('info', 'Deleted', `Session "${name}" deleted.`);
            if (onSuccess) onSuccess();
        },
        'Delete',
        'danger'
    );
}

// --- Sessions Home ---
async function goHome() {
    await flushSession();
    if (journal?.storageError) return;
    activeSessionName = null;
    deactivateRoomSync();
    switchView('view-home');
    updateWorkspaceIndicator();
    if (isSupabaseConfigured() && hasWorkspaceKey()) {
        await loadSessionsFromDb();
    }
    renderHomeSessions();
}

function renderHomeSessions() {
    updateWorkspaceIndicator();

    const container = get('home-session-list');
    container.innerHTML = '';

    if (!isSupabaseConfigured()) {
        container.innerHTML = '<div class="empty-state">Cloud sessions need Supabase configured in config.js.</div>';
        return;
    }
    if (!hasWorkspaceKey()) {
        container.innerHTML = '<div class="empty-state">Open your private organizer link, or start a new workspace. No account needed.</div>';
        return;
    }

    const sessions = getSessions();
    const names = Object.keys(sessions).sort((a, b) => new Date(sessions[b].date) - new Date(sessions[a].date));

    if (names.length === 0) {
        container.innerHTML = '<div class="empty-state">No saved sessions yet</div>';
        return;
    }

    const template = get('template-session-card');
    names.forEach(name => {
        const data = sessions[name];
        const clone = template.content.cloneNode(true);
        const card = clone.querySelector('.session-card');

        clone.querySelector('.sc-name').textContent = (data.sessionName || '').trim() || name;
        const fc = (data.factions || []).length;
        const pc = (data.players || []).length;
        const game = (data.gameTitle || '').trim();
        clone.querySelector('.sc-meta').textContent =
            `${game ? game + ' · ' : ''}${fc} faction${fc === 1 ? '' : 's'} · ${pc} player${pc === 1 ? '' : 's'}`;
        clone.querySelector('.sc-date').textContent = new Date(data.date).toLocaleString();

        if (name === activeSessionName) card.classList.add('active-session');

        clone.querySelector('.sc-resume').onclick = () => resumeSession(name);
        clone.querySelector('.sc-repeat').onclick = () => openRepeatSession(name);
        clone.querySelector('.sc-delete').onclick = (e) => {
            e.stopPropagation();
            deleteSession(name, () => renderHomeSessions());
        };

        container.appendChild(clone);
    });
}

async function resumeSession(name) {
    await flushSession();
    if (journal?.storageError) return;
    const sessions = getSessions();
    const data = sessions[name];
    if (!data) {
        showToast('error', 'Error', 'Session not found.');
        renderHomeSessions();
        return;
    }

    state.factions = data.factions || [];
    state.players = data.players || [];
    state.sessionName = data.sessionName || name;
    state.gameTitle = data.gameTitle || '';
    state.roomCode = data.roomCode || '';
    state.roomStage = null;
    state.results = data.results || null;
    activeSessionName = name;

    renderFactions();
    updateAllPlayerFactions(); // Cleans stale faction refs and re-renders player cards.
    syncSessionMetaInputs();
    syncRoomForCurrentSession();

    // Invariant: results present -> show results; otherwise the picker.
    if (guestResultsReady(state.results)) {
        showHostResults(state.results);
    } else {
        switchView('view-players');
    }
    showToast('success', 'Resumed', `Loaded "${name}".`);
}

// Render the results view from a stored snapshot (e.g. on resume), keeping the
// host's action buttons available — unlike the read-only shared/guest view.
function showHostResults(payload) {
    payload = validateResultsPayload(payload);
    if (!payload) {
        showToast('error', 'Invalid Results', 'These saved results cannot be displayed. You can generate new assignments.');
        switchView('view-players');
        return;
    }
    const container = get('results-container');
    container.innerHTML = '';
    get('total-score').textContent = `${payload.pct != null ? payload.pct : 0}%`;

    const parts = [payload.t, payload.gm, payload.g ? `Goal: ${payload.g}` : ''].filter(Boolean);
    get('results-subtitle').textContent =
        parts.length ? parts.join(' · ') : 'The happiness algorithm has spoken.';

    (payload.r || []).forEach((row, index) => {
        container.appendChild(buildResultCard({ name: row.n, faction: row.f, note: row.note, score: row.s, index }));
    });

    lastResults = payload; // keep Share Results Link working after a resume
    get('results-summary').textContent = describeResultRows(payload.r);
    isSharedMode = false;
    document.body.classList.remove('shared-mode');
    switchView('view-results');
}

// New Session: prompt for a name, then create it in the database.
function startNewSession() {
    if (!isSupabaseConfigured()) return showToast('error', 'Not Configured', 'Sessions need Supabase set up.');
    if (!hasWorkspaceKey()) { openWorkspaceModal(); return; }
    repeatSessionSource = null;
    get('new-session-title').textContent = 'New Session';
    get('new-session-help').textContent = 'Name this game night. Everything you set up afterward saves automatically.';
    get('new-session-input').value = '';
    get('modal-overlay').classList.add('active');
    get('new-session-modal').classList.add('active');
    get('new-session-input').focus();
}

async function confirmNewSession() {
    const name = get('new-session-input').value.trim();
    if (!name || creatingSession) return;
    creatingSession = true;
    try { await createNewSession(name, repeatSessionSource); }
    finally { creatingSession = false; }
}

// --- Preset Management ---
let presetEditState = { originalName: null, factions: [] };

async function openPresetModal() {
    if (!isSupabaseConfigured()) return showToast('error', 'Not Configured', 'Games need Supabase set up.');
    if (!hasWorkspaceKey()) { openWorkspaceModal(); return; }

    get('modal-overlay').classList.add('active');
    get('preset-modal').classList.add('active');
    await loadPresetsFromDb();
    renderPresetOptions();
    showPresetListView();
}

function showPresetListView() {
    const modal = get('preset-modal');
    modal.querySelector('.preset-edit-view').style.display = 'none';
    modal.querySelector('.preset-list-view').style.display = 'block';
    renderPresetList();
}

function renderPresetList() {
    const container = get('preset-list');
    container.innerHTML = '';

    const presets = getPresets();
    const names = Object.keys(presets).sort((a, b) => a.localeCompare(b));

    if (names.length === 0) {
        container.innerHTML = '<div class="empty-state">No games yet — add one below</div>';
        return;
    }

    names.forEach(name => {
        const count = presets[name].length;
        const item = document.createElement('div');
        item.className = 'load-item';
        item.innerHTML = `
            <span class="session-name">${escapeHtml(name)}</span>
            <span class="session-date">${count} faction${count === 1 ? '' : 's'}</span>
        `;

        const editBtn = document.createElement('button');
        editBtn.className = 'btn-sm';
        editBtn.textContent = 'Edit';
        editBtn.onclick = () => openPresetEditor(name);

        const delBtn = document.createElement('button');
        delBtn.className = 'btn-sm danger delete-btn';
        delBtn.title = 'Delete';
        delBtn.innerHTML = '&times;';
        delBtn.onclick = (e) => {
            e.stopPropagation();
            deletePreset(name);
        };

        item.appendChild(editBtn);
        item.appendChild(delBtn);
        container.appendChild(item);
    });
}

function openPresetEditor(name = null) {
    const presets = getPresets();

    if (name && presets[name]) {
        presetEditState = { originalName: name, factions: [...presets[name]] };
        get('preset-edit-title').textContent = 'Edit Game';
    } else {
        presetEditState = { originalName: null, factions: [] };
        get('preset-edit-title').textContent = 'New Game';
    }

    get('preset-name-input').value = presetEditState.originalName || '';
    get('preset-faction-input').value = '';
    renderPresetFactionTags();

    const modal = get('preset-modal');
    modal.querySelector('.preset-list-view').style.display = 'none';
    modal.querySelector('.preset-edit-view').style.display = 'block';
    get('preset-name-input').focus();
}

function addPresetFaction() {
    const input = get('preset-faction-input');
    const name = input.value.trim();

    if (!name) return;
    if (presetEditState.factions.includes(name)) {
        showToast('error', 'Duplicate', 'That faction is already in this preset.');
        return;
    }

    presetEditState.factions.push(name);
    input.value = '';
    renderPresetFactionTags();
    input.focus();
}

function removePresetFaction(name) {
    presetEditState.factions = presetEditState.factions.filter(f => f !== name);
    renderPresetFactionTags();
}

function renderPresetFactionTags() {
    const container = get('preset-faction-list');
    container.innerHTML = '';

    if (presetEditState.factions.length === 0) {
        container.innerHTML = '<div class="empty-state" style="padding: 1.5rem 1rem;">No factions yet</div>';
        return;
    }

    [...presetEditState.factions].sort((a, b) => a.localeCompare(b)).forEach(faction => {
        const tag = document.createElement('div');
        tag.className = 'tag faction-tag';

        const span = document.createElement('span');
        span.className = 'name';
        span.textContent = faction;

        const btn = document.createElement('button');
        btn.className = 'remove-btn';
        btn.setAttribute('aria-label', `Remove ${faction}`);
        btn.innerHTML = '&times;';
        btn.onclick = () => removePresetFaction(faction);

        tag.appendChild(span);
        tag.appendChild(btn);
        container.appendChild(tag);
    });
}

function savePreset() {
    const name = get('preset-name-input').value.trim();

    if (!name) {
        showToast('error', 'Missing Name', 'Please enter a preset name.');
        return;
    }
    if (presetEditState.factions.length === 0) {
        showToast('error', 'No Factions', 'Add at least one faction to the preset.');
        return;
    }

    const presets = getPresets();
    const original = presetEditState.originalName;
    const overwritingDifferent = (name in presets) && name !== original;

    const doSave = async () => {
        const factions = [...presetEditState.factions];
        if (!(await upsertPresetToDb(name, factions, original))) return;
        presets[name] = factions;
        if (original && original !== name) {
            delete presets[original];
        }
        renderPresetOptions();
        showToast('success', 'Game Saved', `"${name}" saved.`);
        showPresetListView();
    };

    if (overwritingDifferent) {
        showConfirm(
            'Overwrite Game?',
            `A game named "${name}" already exists. Overwrite it?`,
            doSave,
            'Overwrite',
            'danger'
        );
    } else {
        doSave();
    }
}

function deletePreset(name) {
    showConfirm(
        'Delete Game?',
        `Are you sure you want to delete the game "${name}"? This cannot be undone.`,
        async () => {
            const presets = getPresets();
            if (!(await deletePresetFromDb(name))) return;
            delete presets[name];

            const select = get('game-select');
            if (select.value === name) select.value = 'custom';

            renderPresetOptions();
            renderPresetList();
            showToast('info', 'Deleted', `Game "${name}" deleted.`);
        },
        'Delete',
        'danger'
    );
}

// --- Shared helpers for guest / results modes ---
// (Live-room logic lives in rooms.js; guestPick/guestSession are declared there.)
let isGuestMode = false;
let isSharedMode = false;

async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (e) {
        return false; // Clipboard API blocked (insecure context, etc.) — caller shows a fallback.
    }
}

// --- Share results (read-only link) ---
function openResultsShareModal() {
    if (!lastResults) {
        showToast('error', 'No Results', 'Run an optimization first.');
        return;
    }
    const base = location.origin + location.pathname;
    const payload = validateResultsPayload(lastResults);
    const encoded = payload && encodeData(payload);
    if (!encoded || encoded.length > RESULT_LIMITS.encodedLength) {
        showToast('error', 'Cannot Share Results', 'These results are invalid or too large to share in a link.');
        return;
    }
    const link = `${base}#results=${encoded}`;

    get('results-link-input').value = link;
    get('results-summary-text').value = formatResultsSummary(payload);
    get('modal-overlay').classList.add('active');
    get('results-share-modal').classList.add('active');
    get('results-link-input').focus();
    get('results-link-input').select();
}

async function copyResultsLink() {
    const link = get('results-link-input').value;
    const ok = await copyToClipboard(link);
    if (ok) {
        showToast('success', 'Link Copied', 'Share it with your players.');
    } else {
        get('results-link-input').select();
        showToast('info', 'Copy Manually', 'Press Ctrl/Cmd+C to copy the selected link.');
    }
}

function parseResultsFromUrl() {
    const match = location.hash.match(/(?:^#|&)results(?:=([^&]*))?(?=&|$)/);
    if (!match) return null;
    const data = validateResultsPayload(decodeData(match[1] || ''));
    if (!data) throw new Error('Invalid results link');
    return data;
}

function showInvalidResultsLink() {
    isSharedMode = true;
    document.body.classList.add('shared-mode');
    switchView('view-invalid-results');
    get('invalid-results-title').focus();
}

function enterSharedResultsMode(payload) {
    payload = validateResultsPayload(payload);
    if (!payload) {
        showInvalidResultsLink();
        return;
    }
    isSharedMode = true;
    document.body.classList.add('shared-mode');

    const container = get('results-container');
    container.innerHTML = '';
    get('total-score').textContent = `${payload.pct != null ? payload.pct : 0}%`;

    // Show the session name / game / goal as context, if present.
    const parts = [];
    if (payload.t) parts.push(payload.t);
    if (payload.gm) parts.push(payload.gm);
    if (payload.g) parts.push(`Goal: ${payload.g}`);
    get('results-subtitle').textContent = parts.length ? parts.join(' · ') : 'Final assignments';
    get('results-summary').textContent = describeResultRows(payload.r);

    (payload.r || []).forEach((row, index) => {
        container.appendChild(buildResultCard({ name: row.n, faction: row.f, note: row.note, score: row.s, index }));
    });

    switchView('view-results');
}

function closeModals() {
    document.querySelectorAll('.modal, .modal-overlay').forEach(el => el.classList.remove('active'));
}
