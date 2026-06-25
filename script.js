// Initialization and State
const state = {
    factions: [],
    players: [], // { id, name, preferences: [], bans: [] }
    sessionName: '', // Label for this game night (shown to players)
    gameTitle: '', // The game being played (shown to players)
    roomCode: '', // Live-room code (Supabase), if a room is open for this session
    results: null, // Last optimization snapshot (published to the room)
    discord: {
        url: '',
        enabled: false
    }
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
    document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
    get(viewId).classList.add('active');
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
        container.appendChild(clone);
    });
}

// --- Player Setup ---
function addPlayer() {
    const input = get('player-input');
    const name = input.value.trim();

    if (name) {
        const id = 'player-' + Date.now();
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
        b.onclick = (e) => { e.stopPropagation(); onClick(); };
        return b;
    };

    const createLi = (name, listType) => {
        const li = document.createElement('li');
        li.draggable = true;
        li.dataset.faction = name; // Read by drag commit instead of textContent.

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
        if (e.target.closest('button')) return;

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

function onTouchEnd() {
    cleanupTouchDrag();
}

function cleanupTouchDrag() {
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
        updatePlayerStateFromDOM(touchDragState.player, l1, l2, l3);
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

// The solver is an exhaustive search whose worst case grows like F!/(F-P)!.
// Above this estimated node count we warn before running (the search still
// runs off the main thread in a Worker, so this is about time, not freezing).
const OPT_WARN_THRESHOLD = 1e8;

// Rough upper bound on the search size (ignores pruning, so it over-estimates —
// which is what we want for a "this might be slow" heads-up).
function estimateSearchCost(playerCount, factionCount) {
    let cost = 1;
    for (let i = 0; i < playerCount; i++) {
        cost *= (factionCount - i);
        if (cost > 1e15) return Infinity;
    }
    return cost;
}

// Promise wrapper around showConfirm so we can `await` the user's choice.
// Resolves true on confirm, false on cancel OR any other dismissal (e.g.
// clicking the overlay backdrop) so the awaiting caller can never hang.
function confirmAsync(title, message, btnText, btnClass) {
    return new Promise(resolve => {
        const modal = get('confirm-modal');
        let settled = false;
        const finish = (val) => {
            if (settled) return;
            settled = true;
            observer.disconnect();
            resolve(val);
        };
        // Treat closing the modal by any means as cancel. The button handlers
        // run synchronously (setting `settled`) before this observer's microtask
        // fires, so an explicit confirm/cancel still wins over this fallback.
        const observer = new MutationObserver(() => {
            if (!modal.classList.contains('active')) finish(false);
        });
        observer.observe(modal, { attributes: true, attributeFilter: ['class'] });
        showConfirm(title, message, () => finish(true), btnText, btnClass, () => finish(false));
    });
}

// --- Solver runner (Web Worker) ---
// The solver is pure (depends only on SCORES + getScore), so we build a Worker
// from the existing functions via .toString() — no duplicated logic to drift.
let _optimizerWorker = null;
let _optimizerReject = null;

function buildOptimizerWorker() {
    const src = `
        const SCORES = ${JSON.stringify(SCORES)};
        ${getScore.toString()}
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
    const worker = new Worker(url);
    URL.revokeObjectURL(url); // Worker is already initialized; free the URL so it doesn't leak.
    return worker;
}

// Run the solver off the main thread. Falls back to a synchronous run if Workers
// (or blob URLs) aren't available, so the feature degrades rather than breaking.
function runOptimization(players, factions, mode) {
    return new Promise((resolve, reject) => {
        let worker;
        try {
            worker = buildOptimizerWorker();
        } catch (e) {
            try { resolve(findOptimalAssignment(players, factions, mode)); }
            catch (err) { reject(err); }
            return;
        }

        _optimizerWorker = worker;
        _optimizerReject = reject;

        const teardown = () => {
            if (_optimizerWorker === worker) _optimizerWorker = null;
            _optimizerReject = null;
            worker.terminate();
        };

        worker.onmessage = (e) => {
            teardown();
            if (e.data && e.data.ok) resolve(e.data.result);
            else reject(new Error((e.data && e.data.error) || 'Optimization failed'));
        };
        worker.onerror = () => {
            // Worker couldn't run — fall back to a synchronous solve.
            teardown();
            try { resolve(findOptimalAssignment(players, factions, mode)); }
            catch (err) { reject(err); }
        };

        worker.postMessage({ players, factions, mode });
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

    // Get Mode
    const mode = document.querySelector('input[name="opt-mode"]:checked').value; // 'total' or 'fairness'

    _optimizing = true;
    try {
        // Heads-up before a potentially long search.
        if (estimateSearchCost(state.players.length, state.factions.length) > OPT_WARN_THRESHOLD) {
            const proceed = await confirmAsync(
                'Large Optimization',
                'This many players and factions could take a while to solve. It runs in the background and you can cancel — run it anyway?',
                'Run Anyway',
                'accent'
            );
            if (!proceed) return;
        }

        showOptimizerSpinner();
        let result;
        try {
            result = await runOptimization(state.players, state.factions, mode);
        } catch (e) {
            hideOptimizerSpinner();
            if (e && e.message !== 'cancelled') {
                showToast('error', 'Optimization Failed', e.message || 'Something went wrong.');
            }
            return;
        }
        hideOptimizerSpinner();

        if (result.success) {
            displayResults(result); // sets lastResults
            switchView('view-results');

            // Publish results to the session so the room link shows them to players.
            state.results = lastResults;
            if (activeSessionName) {
                sessionsCache[activeSessionName] = currentSessionObject();
                upsertSessionToDb(activeSessionName, sessionsCache[activeSessionName]);
            }

            // Discord Webhook
            if (state.discord && state.discord.enabled && state.discord.url) {
                sendToDiscord(state.discord.url, result, state.players);
            }
        } else {
            showToast('error', 'Optimization Failed', "Could not find a valid assignment! Try removing some bans.");
        }
    } finally {
        _optimizing = false;
    }
}

// Go back to the players view and reopen the room for changes: clearing the
// published results flips any guests back from the results view to the picker.
function reopenForChanges() {
    if (state.results) {
        state.results = null;
        if (activeSessionName) {
            sessionsCache[activeSessionName] = currentSessionObject();
            upsertSessionToDb(activeSessionName, sessionsCache[activeSessionName]);
        }
    }
    switchView('view-players');
}

const delay = ms => new Promise(res => setTimeout(res, ms));

async function postToDiscord(url, payload) {
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) console.error("Discord Error:", response.status);
    } catch (e) {
        console.error("Discord Network Error:", e);
    }
}

async function sendToDiscord(url, result, players) {
    // 1. Intro Message
    const goalText = document.querySelector('input[name="opt-mode"]:checked').parentElement.querySelector('strong').textContent;
    await postToDiscord(url, {
        content: `🎲 **Side Picker Optimization Initiated**\n**Goal:** ${goalText}`
    });

    // 2. Player Details (Sequence)
    // Sort players for consistent order
    const sortedPlayers = [...players].sort((a, b) => a.name.localeCompare(b.name));

    for (const p of sortedPlayers) {
        await delay(300); // Slight delay for ordering

        let prefs;
        if (p.noPreference) {
            prefs = p.preferences.length > 0
                ? "• " + p.preferences.join('\n• ')
                : "*No preferences selected*";
        } else {
            prefs = p.preferences.length > 0
                ? p.preferences.map((f, i) => `${i + 1}. ${f}`).join('\n')
                : "*No strict preferences*";
        }

        const bans = p.bans.length > 0
            ? p.bans.join(', ')
            : "*No bans*";

        await postToDiscord(url, {
            embeds: [{
                author: { name: p.name },
                color: 10181046, // Purple-ish
                fields: [
                    { name: "💚 Preferences", value: prefs, inline: true },
                    { name: "❌ Bans", value: bans, inline: true }
                ]
            }]
        });
    }

    // 3. Final Results
    await delay(500);

    const fields = [];
    sortedPlayers.forEach(p => {
        const faction = result.assignment[p.id];
        const score = getScore(p, faction);
        let icon = "😐";
        if (score > 5) icon = "🤩";
        else if (score > 0) icon = "🙂";
        else if (score < 0) icon = "🤬";

        fields.push({
            name: `${icon} ${p.name}`,
            value: `**${faction}**`,
            inline: true
        });
    });

    await postToDiscord(url, {
        embeds: [{
            title: "🏆 Final Assignments",
            description: `**Group Happiness:** ${get('total-score').textContent}`,
            color: 3900382, // #3b82f6 (Primary Blueish)
            fields: fields,
            footer: {
                text: "Side Picker • Game Night Optimized"
            },
            timestamp: new Date().toISOString()
        }]
    });
}

// Scores
const SCORES = {
    rank1: 10,
    rank2: 7,
    rank3: 4,
    rank4: 2,
    rank5Plus: 1,
    neutral: 0,
    ban: -1000
};

function getScore(player, faction) {
    if (player.bans.includes(faction)) return SCORES.ban;

    const rankIndex = player.preferences.indexOf(faction);

    // No Preference Mode: every preferred faction is treated as top rank.
    if (player.noPreference) {
        if (rankIndex >= 0) return 10; // Treat all preferences as top rank
        return SCORES.neutral;
    }

    if (rankIndex === 0) return SCORES.rank1;
    if (rankIndex === 1) return SCORES.rank2;
    if (rankIndex === 2) return SCORES.rank3;
    if (rankIndex === 3) return SCORES.rank4;
    if (rankIndex >= 4) return SCORES.rank5Plus;

    return SCORES.neutral; // Not in preferences, not banned
}

function findOptimalAssignment(players, factions, mode) {
    // Mode: 'total' (Maximize Sum) or 'fairness' (Maximize Minimum, tie-break with Sum)

    let bestMetric = { primary: -Infinity, secondary: -Infinity };
    let bestAssignments = [];

    // Helper to calculate score of a complete assignment map
    function solve(playerIndex, usedFactions, currentSum, currentMin, currentAssignment) {
        // Base case: All players assigned
        if (playerIndex === players.length) {
            // Calculate Metric based on Mode
            let primary, secondary;

            if (mode === 'fairness') {
                primary = currentMin; // Maximize the lowest score
                secondary = currentSum; // Tiebreaker: Total Happiness
            } else {
                primary = currentSum; // Maximize Total Happiness
                secondary = currentMin; // Tiebreaker: Improve worst player if totals equal
            }

            if (primary > bestMetric.primary) {
                bestMetric = { primary, secondary };
                bestAssignments = [{ ...currentAssignment }];
            } else if (primary === bestMetric.primary) {
                // Check secondary
                if (secondary > bestMetric.secondary) {
                    bestMetric = { primary, secondary };
                    bestAssignments = [{ ...currentAssignment }];
                } else if (secondary === bestMetric.secondary) {
                    bestAssignments.push({ ...currentAssignment });
                }
            }
            return;
        }

        const player = players[playerIndex];

        // Pruning checks (Optimization)
        // If we are in fairness mode, and currentMin is already worse than bestMetric.primary, we can prune?
        // currentMin only decreases (or stays same). It never goes up.
        // So if currentMin < bestMetric.primary (and mode is fairness), we can STOP.
        if (mode === 'fairness' && currentMin < bestMetric.primary) {
            return;
        }

        // Construct ordered list of candidates
        let candidates = [];

        // 1. Preferences (in order)
        player.preferences.forEach(f => {
            if (!usedFactions.has(f)) candidates.push(f);
        });

        // 2. Neutrals
        const neutrals = [];
        factions.forEach(f => {
            if (!usedFactions.has(f) && !player.preferences.includes(f) && !player.bans.includes(f)) {
                neutrals.push(f);
            }
        });
        candidates = candidates.concat(neutrals);

        // 3. Bans (Only if desperate)
        if (candidates.length === 0) {
            factions.forEach(f => {
                if (!usedFactions.has(f) && player.bans.includes(f)) {
                    candidates.push(f);
                }
            });
        }

        if (candidates.length === 0) return; // Dead end

        for (const faction of candidates) {
            const score = getScore(player, faction);

            // Sum Pruning (Only for total mode)
            if (mode === 'total') {
                const maxRemaining = (players.length - 1 - playerIndex) * SCORES.rank1;
                // If even with perfect remainder we can't beat the best primary, prune.
                if (currentSum + score + maxRemaining < bestMetric.primary) {
                    continue;
                }
            }

            usedFactions.add(faction);
            currentAssignment[player.id] = faction;

            solve(
                playerIndex + 1,
                usedFactions,
                currentSum + score,
                Math.min(currentMin, score),
                currentAssignment
            );

            delete currentAssignment[player.id];
            usedFactions.delete(faction);
        }
    }

    solve(0, new Set(), 0, Infinity, {});

    if (bestAssignments.length > 0) {
        const winner = bestAssignments[Math.floor(Math.random() * bestAssignments.length)];
        const finalSum = mode === 'fairness' ? bestMetric.secondary : bestMetric.primary;

        return {
            success: true,
            score: finalSum, // Always return total score for display
            assignment: winner,
            tieCount: bestAssignments.length
        };
    }

    return {
        success: false,
        score: -Infinity,
        assignment: null
    };
}


// Most recent optimization, captured for the shareable results link.
let lastResults = null;

function buildResultCard({ name, faction, note, score, index }) {
    const card = document.createElement('div');
    card.className = 'result-card';
    card.style.animationDelay = `${index * 0.1}s`; // Stagger animation

    const badgeClass = score < 0 ? 'score-badge negative' : 'score-badge';
    const scoreLabel = score >= 0 ? `+${score}` : `${score}`;

    card.innerHTML = `
        <div class="player">${escapeHtml(name)}</div>
        <div class="assigned-faction">${escapeHtml(faction)}</div>
        <div class="${badgeClass}">${escapeHtml(note)} (${scoreLabel})</div>
    `;
    return card;
}

function displayResults(result) {
    const container = get('results-container');
    container.innerHTML = '';

    const maxPossible = state.players.length * SCORES.rank1;
    const percent = maxPossible > 0 ? Math.round((result.score / maxPossible) * 100) : 0;

    get('total-score').textContent = `${percent}%`;

    const sessionName = (state.sessionName || '').trim();
    const gameTitle = (state.gameTitle || '').trim();
    const subtitleParts = [sessionName, gameTitle].filter(Boolean);
    get('results-subtitle').textContent =
        subtitleParts.length ? subtitleParts.join(' · ') : 'The happiness algorithm has spoken.';

    const goalEl = document.querySelector('input[name="opt-mode"]:checked');
    const goalText = goalEl ? goalEl.parentElement.querySelector('strong').textContent : '';

    const shareRows = [];

    state.players.forEach((p, index) => {
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
}

// --- Session Management ---
// Named sessions live in Supabase (scoped by workspace key); see rooms.js.
// AUTOSAVE_KEY is just a local cache of the *current working setup* for instant
// restore on refresh — it is not the session store.

const AUTOSAVE_KEY = 'side_picker_autosave';

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

// Auto-save on every change for resilience.
let _sessionSyncTimer = null;
function autoSave() {
    // In guest mode there is no organizer state to persist (the room DB is the source of truth).
    if (isGuestMode) return;

    // Local cache of the working setup (fast refresh-restore only).
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({
        factions: state.factions,
        players: state.players,
        sessionName: state.sessionName,
        gameTitle: state.gameTitle,
        roomCode: state.roomCode,
        results: state.results,
        discord: state.discord,
        activeSessionName: activeSessionName,
        timestamp: Date.now()
    }));

    // Keep the active named session fresh: update the in-memory cache now,
    // and push to the database on a short debounce.
    if (activeSessionName) {
        sessionsCache[activeSessionName] = currentSessionObject();
        clearTimeout(_sessionSyncTimer);
        _sessionSyncTimer = setTimeout(() => {
            if (activeSessionName) upsertSessionToDb(activeSessionName, sessionsCache[activeSessionName]);
        }, 1200);
    }

    // If a live room is open, host-side pick changes affect who counts as
    // "submitted" (Available box empty), so refresh the room status display.
    if (state.roomCode && typeof renderRoomStatus === 'function') renderRoomStatus();
}

function loadAutoSave() {
    const json = localStorage.getItem(AUTOSAVE_KEY);
    if (json) {
        try {
            const data = JSON.parse(json);
            if (data.factions) state.factions = data.factions;
            if (data.players) state.players = data.players;
            if (data.sessionName) state.sessionName = data.sessionName;
            if (data.gameTitle) state.gameTitle = data.gameTitle;
            if (data.roomCode) state.roomCode = data.roomCode;
            if (data.results) state.results = data.results;
            if (data.discord) state.discord = data.discord; // Restore Discord settings
            if (data.activeSessionName) activeSessionName = data.activeSessionName;

            renderFactions();
            renderPlayers();
            syncSessionMetaInputs();

            // Restore Discord UI inputs
            if (state.discord) {
                get('discord-webhook').value = state.discord.url || '';
                get('send-to-discord').checked = state.discord.enabled || false;
            }

            // Don't auto-switch view, let user start fresh but with data loaded
        } catch (e) {
            console.error("Failed to load autosave", e);
        }
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // If opened via a room link, run as a guest instead of the organizer app.
    const roomCode = parseRoomFromUrl();
    if (roomCode) {
        enterRoomGuestMode(roomCode);
        return;
    }

    const sharedResults = parseResultsFromUrl();
    if (sharedResults) {
        enterSharedResultsMode(sharedResults);
        return;
    }

    renderPresetOptions();
    loadAutoSave();
    updateWorkspaceIndicator();
    initWorkspaceAndSessions(); // async: load sessions from DB (prompts for a workspace key if needed)
    syncRoomForCurrentSession(); // Reconnect to a live room if this session has one

    // Discord Listeners
    get('discord-webhook').addEventListener('input', (e) => {
        state.discord.url = e.target.value.trim();
        autoSave();
    });

    get('send-to-discord').addEventListener('change', (e) => {
        state.discord.enabled = e.target.checked;
        autoSave();
    });
});

async function initWorkspaceAndSessions() {
    if (!isSupabaseConfigured()) {
        renderHomeSessions(); // Will show a "not configured" notice.
        return;
    }
    if (!hasWorkspaceKey()) {
        renderHomeSessions(); // Empty behind the prompt.
        openWorkspaceModal();
        return;
    }
    ensureUser();
    await loadSessionsFromDb();
    await loadPresetsFromDb();
    renderPresetOptions();
    renderHomeSessions();
}

// --- Workspace key ---
function openWorkspaceModal() {
    get('workspace-input').value = getWorkspaceKey();
    get('modal-overlay').classList.add('active');
    get('workspace-modal').classList.add('active');
    get('workspace-input').focus();
}

async function confirmWorkspaceKey() {
    const key = get('workspace-input').value.trim();
    if (!key) {
        showToast('error', 'Workspace Needed', 'Enter a workspace key to load your sessions.');
        return;
    }
    setWorkspaceKey(key);
    closeModals();
    updateWorkspaceIndicator();
    ensureUser();
    await loadSessionsFromDb();
    await loadPresetsFromDb();
    renderPresetOptions();
    renderHomeSessions();
    showToast('success', 'Workspace Set', `Loaded sessions for "${key}".`);
}

function updateWorkspaceIndicator() {
    const el = get('workspace-indicator');
    if (!el) return;
    const key = getWorkspaceKey();
    el.innerHTML = key
        ? `Workspace: <strong>${escapeHtml(key)}</strong> · <button class="link-btn" onclick="openWorkspaceModal()">change</button>`
        : `<button class="link-btn" onclick="openWorkspaceModal()">Set your workspace key</button>`;
}

// Named Sessions (DB-backed; sessionsCache lives in rooms.js)
function getSessions() {
    return sessionsCache;
}

// Create a brand-new, empty session in the database and open it. Everything
// after this auto-saves, so there's no separate "Save" step.
async function createNewSession(name) {
    if (!name) return showToast('error', 'Missing Name', 'Please enter a session name.');
    if (!isSupabaseConfigured()) return showToast('error', 'Not Configured', 'Sessions need Supabase set up.');
    if (!hasWorkspaceKey()) { openWorkspaceModal(); return; }
    if (sessionsCache[name]) return showToast('error', 'Name Taken', `A session named "${name}" already exists.`);

    state.factions = [];
    state.players = [];
    state.sessionName = name;
    state.gameTitle = '';
    state.roomCode = '';
    state.results = null;
    activeSessionName = name;

    const obj = currentSessionObject();
    sessionsCache[name] = obj;
    await upsertSessionToDb(name, obj);
    autoSave();

    get('game-select').value = 'custom';
    renderFactions();
    renderPlayers();
    syncSessionMetaInputs();
    deactivateRoomSync();
    closeModals();
    switchView('view-factions');
    showToast('success', 'Session Created', `"${name}" is ready.`);
}

function deleteSession(name, onSuccess) {
    showConfirm(
        'Delete Session?',
        `Are you sure you want to delete "${name}"?`,
        async () => {
            await deleteSessionFromDb(name); // cascades the room's submissions in the DB
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
        container.innerHTML = '<div class="empty-state">Set a workspace key to load your sessions.</div>';
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
        clone.querySelector('.sc-delete').onclick = (e) => {
            e.stopPropagation();
            deleteSession(name, () => renderHomeSessions());
        };

        container.appendChild(clone);
    });
}

function resumeSession(name) {
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
    state.results = data.results || null;
    activeSessionName = name;

    renderFactions();
    updateAllPlayerFactions(); // Cleans stale faction refs and re-renders player cards.
    syncSessionMetaInputs();
    autoSave();
    syncRoomForCurrentSession();

    switchView('view-players');
    showToast('success', 'Resumed', `Loaded "${name}".`);
}

// New Session: prompt for a name, then create it in the database.
function startNewSession() {
    if (!isSupabaseConfigured()) return showToast('error', 'Not Configured', 'Sessions need Supabase set up.');
    if (!hasWorkspaceKey()) { openWorkspaceModal(); return; }
    get('new-session-input').value = '';
    get('modal-overlay').classList.add('active');
    get('new-session-modal').classList.add('active');
    get('new-session-input').focus();
}

function confirmNewSession() {
    const name = get('new-session-input').value.trim();
    if (name) createNewSession(name);
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
        if (original && original !== name) {
            delete presets[original]; // Renamed
            await deletePresetFromDb(original);
        }
        presets[name] = [...presetEditState.factions];
        await upsertPresetToDb(name, presets[name]);
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
            delete presets[name];
            await deletePresetFromDb(name);

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

// UTF-8 safe, URL-safe base64 encoding of a JSON payload (used by results links).
function encodeData(obj) {
    const bytes = new TextEncoder().encode(JSON.stringify(obj));
    let bin = '';
    bytes.forEach(b => bin += String.fromCharCode(b));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeData(str) {
    let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
}

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
    const link = `${base}#results=${encodeData(lastResults)}`;

    get('results-link-input').value = link;
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
    const match = location.hash.match(/results=([^&]+)/);
    if (!match) return null;
    try {
        const data = decodeData(match[1]);
        if (data && Array.isArray(data.r)) return data;
    } catch (e) {
        console.error('Invalid results link', e);
    }
    return null;
}

function enterSharedResultsMode(payload) {
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

    (payload.r || []).forEach((row, index) => {
        container.appendChild(buildResultCard({ name: row.n, faction: row.f, note: row.note, score: row.s, index }));
    });

    switchView('view-results');
}

function closeModals() {
    document.querySelectorAll('.modal, .modal-overlay').forEach(el => el.classList.remove('active'));
}


