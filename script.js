// Initialization and State
const state = {
    factions: [],
    players: [], // { id, name, preferences: [], bans: [] }
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
const PRESETS_KEY = 'side_picker_presets';

// Seeded into storage on first run; afterwards presets are fully user-managed.
const DEFAULT_PRESETS = {
    "Here I Stand": [
        "England",
        "France",
        "Habsburg Empire",
        "Ottoman Empire",
        "Protestant Reformation",
        "The Papacy"
    ]
};

function getPresets() {
    const json = localStorage.getItem(PRESETS_KEY);
    if (json === null) {
        // First run: seed defaults so they can be edited/deleted like any other preset.
        localStorage.setItem(PRESETS_KEY, JSON.stringify(DEFAULT_PRESETS));
        return { ...DEFAULT_PRESETS };
    }
    try {
        return JSON.parse(json) || {};
    } catch (e) {
        console.error("Failed to parse presets", e);
        return {};
    }
}

function savePresets(presets) {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
}

// Populate the dropdown from stored presets, preserving the current selection when possible.
function renderPresetOptions() {
    const select = get('game-select');
    const current = select.value;
    const presets = getPresets();

    select.innerHTML = '<option value="custom">Custom (Manual Entry)</option>';
    Object.keys(presets).sort((a, b) => a.localeCompare(b)).forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        select.appendChild(opt);
    });

    select.value = [...select.options].some(o => o.value === current) ? current : 'custom';
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

    const createLi = (name) => {
        const li = document.createElement('li');
        li.textContent = name;
        li.draggable = true;
        return li;
    };

    // 1. Preferences
    player.preferences.forEach(f => {
        if (state.factions.includes(f)) {
            prefList.appendChild(createLi(f));
        }
    });

    // 2. Bans
    player.bans.forEach(f => {
        if (state.factions.includes(f)) {
            banList.appendChild(createLi(f));
        }
    });

    // 3. Available (Rest)
    state.factions.forEach(f => {
        if (!player.preferences.includes(f) && !player.bans.includes(f)) {
            availableList.appendChild(createLi(f));
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
            e.target.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });

        list.addEventListener('dragend', e => {
            e.target.classList.remove('dragging');
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
    // Read names from DOM lists and update state object
    player.preferences = [...prefList.querySelectorAll('li')].map(li => li.textContent);
    player.bans = [...banList.querySelectorAll('li')].map(li => li.textContent);
    autoSave();
}

// --- Optimization Engine ---

function calculateOptimization() {
    if (state.players.length === 0) {
        showToast('error', 'No Players', "Add players first!");
        return;
    }

    if (state.factions.length < state.players.length) {
        showToast('error', 'Not Enough Factions', `You have ${state.factions.length} factions for ${state.players.length} players.`);
        return;
    }

    // Get Mode
    const mode = document.querySelector('input[name="opt-mode"]:checked').value; // 'total' or 'fairness'
    const result = findOptimalAssignment(state.players, state.factions, mode);

    if (result.success) {
        displayResults(result);
        switchView('view-results');

        // Discord Webhook
        if (state.discord && state.discord.enabled && state.discord.url) {
            sendToDiscord(state.discord.url, result, state.players);
        }
    } else {
        showToast('error', 'Optimization Failed', "Could not find a valid assignment! Try removing some bans.");
    }
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
            description: `**Total Happiness:** ${get('total-score').textContent}`,
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

    lastResults = { v: 1, t: activeSessionName || '', g: goalText, pct: percent, r: shareRows };
}

function resetApp() {
    showConfirm(
        'Reset Application?',
        'This will clear ALL players and factions. Saved sessions will remain.',
        () => {
            state.factions = [];
            state.players = [];
            activeSessionName = null;
            autoSave();
            get('game-select').value = 'custom';
            renderFactions();
            renderPlayers();
            switchView('view-factions');
            showToast('success', 'Reset', 'Application has been reset.');
        },
        'Reset Everything',
        'danger'
    );
}

// --- Session Management (LocalStorage) ---

const SESSIONS_KEY = 'side_picker_sessions';
const AUTOSAVE_KEY = 'side_picker_autosave';

// Name of the saved session currently being worked on, if any. Changes are
// persisted back into it live, so e.g. imported picks don't need a manual re-save.
let activeSessionName = null;

// Auto-save on every change for resilience
function autoSave() {
    // In guest mode there is no organizer state to persist; save the guest's picks instead.
    if (isGuestMode) {
        saveGuestState();
        return;
    }
    const data = {
        factions: state.factions,
        players: state.players,
        discord: state.discord,
        activeSessionName: activeSessionName,
        timestamp: Date.now()
    };
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(data));

    // Keep the active named session in sync with the working state.
    if (activeSessionName) {
        const sessions = getSessions();
        sessions[activeSessionName] = {
            factions: state.factions,
            players: state.players,
            date: new Date().toISOString()
        };
        localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
    }
}

function loadAutoSave() {
    const json = localStorage.getItem(AUTOSAVE_KEY);
    if (json) {
        try {
            const data = JSON.parse(json);
            if (data.factions) state.factions = data.factions;
            if (data.players) state.players = data.players;
            if (data.discord) state.discord = data.discord; // Restore Discord settings
            if (data.activeSessionName) activeSessionName = data.activeSessionName;

            renderFactions();
            renderPlayers();

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

// ... (Rest of Session Management) ...

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // If opened via an invite link, run as a guest instead of the organizer app.
    const invite = parseInviteFromUrl();
    if (invite) {
        enterGuestMode(invite);
        return;
    }

    const sharedResults = parseResultsFromUrl();
    if (sharedResults) {
        enterSharedResultsMode(sharedResults);
        return;
    }

    renderPresetOptions();
    loadAutoSave();
    renderHomeSessions(); // Land on the sessions home screen

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

// Named Sessions
function getSessions() {
    const json = localStorage.getItem(SESSIONS_KEY);
    return json ? JSON.parse(json) : {};
}

function saveSession(name) {
    if (!name) return showToast('error', 'Missing Name', "Please enter a name.");

    const sessions = getSessions();
    sessions[name] = {
        factions: state.factions,
        players: state.players,
        date: new Date().toISOString()
    };

    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
    activeSessionName = name; // Future edits sync into this session.
    autoSave();
    showToast('success', 'Saved', `Session "${name}" saved!`);
    closeModals();
}

function deleteSession(name, onSuccess) {
    showConfirm(
        'Delete Session?',
        `Are you sure you want to delete "${name}"?`,
        () => {
            const sessions = getSessions();
            delete sessions[name];
            localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));

            if (activeSessionName === name) {
                activeSessionName = null;
                autoSave();
            }

            showToast('info', 'Deleted', `Session "${name}" deleted.`);
            if (onSuccess) onSuccess();
        },
        'Delete',
        'danger'
    );
}

function loadSession(name) {
    const sessions = getSessions();
    const data = sessions[name];

    if (data) {
        showConfirm(
            'Load Session?',
            `Loading "${name}" will overwrite your current setup. Continue?`,
            () => {
                state.factions = data.factions || [];
                state.players = data.players || [];
                activeSessionName = name;
                renderFactions();
                renderPlayers();
                updateAllPlayerFactions();
                autoSave(); // Sync to autosave
                closeModals();
                showToast('success', 'Loaded', `Session "${name}" loaded.`);
            },
            'Load',
            'accent'
        );
    } else {
        showToast('error', 'Error', "Session not found.");
    }
}

// --- Sessions Home ---
function goHome() {
    renderHomeSessions();
    switchView('view-home');
}

function renderHomeSessions() {
    // "Continue" card reflects the current in-memory working setup.
    const hasWorking = state.factions.length > 0 || state.players.length > 0;
    const continueWrap = get('home-continue');
    if (hasWorking) {
        continueWrap.style.display = 'block';
        get('home-continue-label').textContent = activeSessionName
            ? `Continue "${activeSessionName}"`
            : 'Continue current setup';
        const fc = state.factions.length;
        const pc = state.players.length;
        get('home-continue-meta').textContent =
            `${fc} faction${fc === 1 ? '' : 's'} · ${pc} player${pc === 1 ? '' : 's'}`;
    } else {
        continueWrap.style.display = 'none';
    }

    const container = get('home-session-list');
    container.innerHTML = '';

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

        clone.querySelector('.sc-name').textContent = name;
        const fc = (data.factions || []).length;
        const pc = (data.players || []).length;
        clone.querySelector('.sc-meta').textContent =
            `${fc} faction${fc === 1 ? '' : 's'} · ${pc} player${pc === 1 ? '' : 's'}`;
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

function continueCurrent() {
    renderFactions();
    renderPlayers();
    switchView(state.players.length > 0 ? 'view-players' : 'view-factions');
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
    activeSessionName = name;

    renderFactions();
    updateAllPlayerFactions(); // Cleans stale faction refs and re-renders player cards.
    autoSave();

    switchView('view-players');
    showToast('success', 'Resumed', `Loaded "${name}".`);
}

function startNewSession() {
    const proceed = () => {
        state.factions = [];
        state.players = [];
        activeSessionName = null;
        get('game-select').value = 'custom';
        renderFactions();
        renderPlayers();
        autoSave();
        switchView('view-factions');
    };

    if (state.factions.length > 0 || state.players.length > 0) {
        showConfirm(
            'Start New Session?',
            'This clears the current working setup. Saved sessions are kept. Continue?',
            proceed,
            'Start New',
            'accent'
        );
    } else {
        proceed();
    }
}

// --- Modals ---

function openSaveModal() {
    get('modal-overlay').classList.add('active');
    get('save-modal').classList.add('active');
    const input = get('save-name-input');
    input.value = '';
    renderSessionList('save-list', (name) => {
        input.value = name;
        input.focus();
    });
    input.focus();
}

function confirmSave() {
    const name = get('save-name-input').value.trim();
    if (name) saveSession(name);
}

function openLoadModal() {
    get('modal-overlay').classList.add('active');
    get('load-modal').classList.add('active');
    renderSessionList('load-list', (name) => {
        loadSession(name);
    });
}

function renderSessionList(containerId, onSelectCurrent) {
    const container = get(containerId);
    container.innerHTML = '';

    const sessions = getSessions();
    const names = Object.keys(sessions).sort((a, b) => new Date(sessions[b].date) - new Date(sessions[a].date));

    if (names.length === 0) {
        container.innerHTML = '<div class="empty-state">No saved sessions</div>';
        return;
    }

    const template = get('template-load-item');

    names.forEach(name => {
        const data = sessions[name];
        const clone = template.content.cloneNode(true);
        const item = clone.querySelector('.load-item');

        item.querySelector('.session-name').textContent = name;
        item.querySelector('.session-date').textContent = new Date(data.date).toLocaleDateString();

        // Click behavior depends on context (Save or Load)
        item.onclick = (e) => {
            if (!e.target.closest('.delete-btn')) {
                onSelectCurrent(name);
            }
        };

        // Delete click
        item.querySelector('.delete-btn').onclick = (e) => {
            e.stopPropagation();
            deleteSession(name, () => {
                renderSessionList(containerId, onSelectCurrent);
            });
        };

        container.appendChild(clone);
    });
}

// --- Preset Management ---
let presetEditState = { originalName: null, factions: [] };

function openPresetModal() {
    get('modal-overlay').classList.add('active');
    get('preset-modal').classList.add('active');
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
        container.innerHTML = '<div class="empty-state">No presets yet</div>';
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
        get('preset-edit-title').textContent = 'Edit Preset';
    } else {
        presetEditState = { originalName: null, factions: [] };
        get('preset-edit-title').textContent = 'New Preset';
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

    const doSave = () => {
        if (original && original !== name) delete presets[original]; // Renamed
        presets[name] = [...presetEditState.factions];
        savePresets(presets);
        renderPresetOptions();
        showToast('success', 'Preset Saved', `"${name}" saved.`);
        showPresetListView();
    };

    if (overwritingDifferent) {
        showConfirm(
            'Overwrite Preset?',
            `A preset named "${name}" already exists. Overwrite it?`,
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
        'Delete Preset?',
        `Are you sure you want to delete the preset "${name}"? This cannot be undone.`,
        () => {
            const presets = getPresets();
            delete presets[name];
            savePresets(presets);

            const select = get('game-select');
            if (select.value === name) select.value = 'custom';

            renderPresetOptions();
            renderPresetList();
            showToast('info', 'Deleted', `Preset "${name}" deleted.`);
        },
        'Delete',
        'danger'
    );
}

// --- Share / Collect Picks (serverless) ---
const GUEST_STATE_KEY = 'side_picker_guest';
let isGuestMode = false;
let isSharedMode = false;
let guestSession = null; // { factions: [], roster: [] }
let guestPick = { id: 'guest', name: '', preferences: [], bans: [], noPreference: false };

// UTF-8 safe, URL-safe base64 encoding of a JSON payload.
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

// --- Organizer: invite link ---
function openInviteModal() {
    if (state.factions.length === 0) {
        showToast('error', 'No Factions', 'Add factions before inviting players.');
        return;
    }
    if (state.players.length === 0) {
        showToast('error', 'No Players', 'Add the player names first so guests can pick theirs.');
        return;
    }

    const names = state.players.map(p => p.name);
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    if (dupes.length > 0) {
        showToast('error', 'Duplicate Names', `Rename players so each name is unique (e.g. "${dupes[0]}").`);
        return;
    }

    const payload = { v: 1, f: state.factions, r: names };
    const base = location.origin + location.pathname;
    const link = `${base}#invite=${encodeData(payload)}`;

    get('invite-link-input').value = link;
    get('modal-overlay').classList.add('active');
    get('invite-modal').classList.add('active');
    get('invite-link-input').focus();
    get('invite-link-input').select();
}

async function copyInviteLink() {
    const link = get('invite-link-input').value;
    const ok = await copyToClipboard(link);
    if (ok) {
        showToast('success', 'Link Copied', 'Share it with your players.');
    } else {
        get('invite-link-input').select();
        showToast('info', 'Copy Manually', 'Press Ctrl/Cmd+C to copy the selected link.');
    }
}

// --- Organizer: import picks ---
function openImportModal() {
    get('import-code-input').value = '';
    get('modal-overlay').classList.add('active');
    get('import-modal').classList.add('active');
    get('import-code-input').focus();
}

function confirmImport() {
    const raw = get('import-code-input').value.trim();
    if (!raw) {
        showToast('error', 'Nothing to Import', 'Paste at least one code.');
        return;
    }

    const codes = raw.split('\n').map(s => s.trim()).filter(Boolean);
    let imported = 0;
    const failures = [];

    codes.forEach(code => {
        let pick;
        try {
            pick = decodeData(code);
        } catch (e) {
            failures.push('an unreadable code');
            return;
        }

        if (!pick || !pick.n) {
            failures.push('a code with no name');
            return;
        }

        const player = state.players.find(p => p.name === pick.n);
        if (!player) {
            failures.push(`"${pick.n}" (no matching player)`);
            return;
        }

        // Only accept factions that still exist in the current setup.
        player.preferences = (pick.p || []).filter(f => state.factions.includes(f));
        player.bans = (pick.b || []).filter(f => state.factions.includes(f));
        player.noPreference = !!pick.u;
        imported++;
    });

    if (imported > 0) {
        autoSave();
        renderPlayers();
    }

    closeModals();

    if (imported > 0) {
        showToast('success', 'Picks Imported', `Updated ${imported} player${imported === 1 ? '' : 's'}.`);
    }
    if (failures.length > 0) {
        showToast('error', 'Some Codes Skipped', `Could not import: ${failures.join('; ')}.`);
    }
}

// --- Guest mode ---
function parseInviteFromUrl() {
    const match = location.hash.match(/invite=([^&]+)/);
    if (!match) return null;
    try {
        const data = decodeData(match[1]);
        if (data && Array.isArray(data.f) && Array.isArray(data.r)) return data;
    } catch (e) {
        console.error('Invalid invite link', e);
    }
    return null;
}

function saveGuestState() {
    localStorage.setItem(GUEST_STATE_KEY, JSON.stringify(guestPick));
}

function enterGuestMode(invite) {
    isGuestMode = true;
    document.body.classList.add('guest-mode');

    guestSession = { factions: invite.f, roster: invite.r };
    state.factions = [...invite.f]; // Lets the shared list/drag helpers work unchanged.

    // Populate the name dropdown from the roster.
    const select = get('guest-name-select');
    invite.r.forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        select.appendChild(opt);
    });

    // Restore a previous in-progress pick if it belongs to this roster.
    // (Done before wiring drag-and-drop so handlers capture the final guestPick object.)
    try {
        const saved = JSON.parse(localStorage.getItem(GUEST_STATE_KEY));
        if (saved && saved.name && invite.r.includes(saved.name)) {
            guestPick = {
                id: 'guest',
                name: saved.name,
                preferences: (saved.preferences || []).filter(f => state.factions.includes(f)),
                bans: (saved.bans || []).filter(f => state.factions.includes(f)),
                noPreference: !!saved.noPreference
            };
            select.value = saved.name;
        }
    } catch (e) { /* ignore */ }

    // Wire drag-and-drop once; the <ul>s are static and items are added dynamically.
    const available = get('guest-available');
    const pref = get('guest-preference');
    const banned = get('guest-banned');
    setupDragAndDrop(available, pref, banned, guestPick);

    switchView('view-guest');
    renderGuestPicks();
}

function onGuestNameChange() {
    const name = get('guest-name-select').value;
    guestPick.name = name;
    // Switching to a fresh name starts from a clean slate.
    guestPick.preferences = [];
    guestPick.bans = [];
    guestPick.noPreference = false;
    get('guest-no-preference').checked = false;
    get('guest-code-output').style.display = 'none';
    saveGuestState();
    renderGuestPicks();
}

function onGuestNoPreferenceChange() {
    guestPick.noPreference = get('guest-no-preference').checked;
    saveGuestState();
}

function renderGuestPicks() {
    const area = get('guest-pick-area');
    if (!guestPick.name) {
        area.style.display = 'none';
        return;
    }
    area.style.display = 'block';
    get('guest-no-preference').checked = !!guestPick.noPreference;

    const available = get('guest-available');
    const pref = get('guest-preference');
    const banned = get('guest-banned');
    refreshListsForCard(guestPick, available, pref, banned);
}

async function copyMyPicks() {
    if (!guestPick.name) {
        showToast('error', 'Pick Your Name', 'Select your name first.');
        return;
    }

    const payload = {
        v: 1,
        n: guestPick.name,
        p: guestPick.preferences,
        b: guestPick.bans,
        u: guestPick.noPreference
    };
    const code = encodeData(payload);

    const output = get('guest-code-output');
    const textArea = get('guest-code-text');
    textArea.value = code;
    output.style.display = 'block';

    const ok = await copyToClipboard(code);
    if (ok) {
        showToast('success', 'Picks Copied', 'Paste the code back to your organizer.');
    } else {
        textArea.focus();
        textArea.select();
        showToast('info', 'Copy Manually', 'Press Ctrl/Cmd+C to copy the selected code.');
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

    // Show the session name / goal as context, if present.
    const parts = [];
    if (payload.t) parts.push(payload.t);
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


