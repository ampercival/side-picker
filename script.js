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
            <div class="toast-title">${title}</div>
            <div class="toast-message">${message}</div>
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
const PRESETS = {
    here_i_stand: [
        "England",
        "France",
        "Habsburg Empire",
        "Ottoman Empire",
        "Protestant Reformation",
        "The Papacy"
    ]
};

// --- Faction Setup ---
// --- Modal Management ---
let confirmCallback = null;

function openInfoModal() {
    get('modal-overlay').classList.add('active');
    get('info-modal').classList.add('active');
}

function showConfirm(title, message, callback, btnText = 'Confirm', btnClass = 'primary') {
    get('confirm-title').textContent = title;
    get('confirm-message').textContent = message;

    const confirmBtn = get('confirm-btn');
    confirmBtn.textContent = btnText;
    confirmBtn.className = `btn ${btnClass}`;
    confirmBtn.onclick = () => {
        closeModals();
        callback();
    };

    confirmCallback = callback;

    get('modal-overlay').classList.add('active');
    get('confirm-modal').classList.add('active');
}

function closeModals() {
    get('modal-overlay').classList.remove('active');
    document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
    confirmCallback = null;
}

// --- Faction Setup ---
function loadPreset() {
    const select = get('game-select');

    if (select.value === 'custom') {
        if (state.factions.length > 0) {
            showConfirm(
                'Clear Factions',
                'Switching to Custom mode will not automatically clear factions, but are you sure you want to proceed?',
                () => {
                    // Logic for reset if needed, or just allow switch
                },
                'Understand',
                'secondary'
            );
        }
        return;
    }

    // Loading a preset
    const applyPreset = () => {
        state.factions = [...PRESETS[select.value]];
        autoSave();
        renderFactions();
        updateAllPlayerFactions();
        showToast('success', 'Preset Loaded', `Loaded ${PRESETS[select.value].length} factions.`);
    };

    if (state.factions.length > 0) {
        showConfirm(
            'Overwrite Factions?',
            'Loading this preset will delete all current factions. This cannot be undone.',
            applyPreset,
            'Load Preset',
            'accent'
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
    saveState();

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
            locked: false
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
        console.log(`Renamed player to ${newName}`);
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

function togglePlayerCard(header) {
    const card = header.closest('.player-card');
    card.classList.toggle('active');
}


function renderPlayers() {
    const container = get('players-container');

    // Simple diffing: only append new, remove deleted is harder with vanilla JS efficient re-renders
    // For simplicity in this scope, we'll re-render. Ideally use a framework or cleaner DOM diff.
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
        clone.querySelector('.player-name').textContent = player.name;

        // Lock State
        const lockBtn = clone.querySelector('.unlock');
        if (player.locked) {
            lockBtn.querySelector('.locked').style.display = 'none';
            lockBtn.querySelector('.unlocked').style.display = 'inline';
            lockBtn.title = "Unlock randomization";
            card.classList.add('locked-mode');
        } else {
            lockBtn.querySelector('.locked').style.display = 'inline';
            lockBtn.querySelector('.unlocked').style.display = 'none';
            lockBtn.title = "Lock randomization";
            card.classList.remove('locked-mode');
        }

        // Populate Lists
        const availableList = clone.querySelector('.available-list');
        const prefList = clone.querySelector('.preference-list');
        const banList = clone.querySelector('.banned-list');

        // Identify which lists items belong to based on state
        // Actually, we should start fresh from the detailed state or just putting all factions in available if new
        // For persistence during editing, we need to map state correctly.

        refreshListsForCard(player, availableList, prefList, banList);

        // Setup Drag and Drop
        setupDragAndDrop(availableList, prefList, banList, player);

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
                const shuffled = [...state.factions].sort(() => 0.5 - Math.random());
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
    console.log(`Updated ${player.name}`, player);
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

        const prefs = p.preferences.length > 0
            ? p.preferences.map((f, i) => `${i + 1}. ${f}`).join('\n')
            : "*No strict preferences*";

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

    console.log("Discord notification sequence complete.");
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

        console.log(`[${mode}] Found ${bestAssignments.length} optimal solutions. Metric:`, bestMetric);

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


function displayResults(result) {
    const container = get('results-container');
    container.innerHTML = '';

    const maxPossible = state.players.length * SCORES.rank1;
    const percent = maxPossible > 0 ? Math.round((result.score / maxPossible) * 100) : 0;

    get('total-score').textContent = `${percent}%`;
    // Optional: Show raw score details ? 
    // get('total-score').title = `${result.score} / ${maxPossible} points`; 
    // Let's stick to the user's request for normalized percent.

    // Sort slightly? Or keep random order of map?
    // Map doesn't guarantee order but array iteration does.
    // players is array.

    state.players.forEach((p, index) => {
        const assignedFaction = result.assignment[p.id];
        const score = getScore(p, assignedFaction);

        let note = "Neutral";
        if (p.preferences.includes(assignedFaction)) {
            const rank = p.preferences.indexOf(assignedFaction) + 1;
            note = `Choice #${rank}`;
        } else if (p.bans.includes(assignedFaction)) {
            note = "BANNED (Forced)";
        }

        const card = document.createElement('div');
        card.className = 'result-card';
        // Stagger animation
        card.style.animationDelay = `${index * 0.1}s`;

        card.innerHTML = `
            <div class="player">${p.name}</div>
            <div class="assigned-faction">${assignedFaction}</div>
            <div class="score-badge">${note} (+${score})</div>
        `;
        container.appendChild(card);
    });
}

function resetApp() {
    if (confirm("Start over? This will clear everything including factions.")) {
        state.factions = [];
        state.players = [];
        saveState();
        get('game-select').value = 'custom';
        renderFactions();
        renderPlayers();
        switchView('view-factions');
    }
}

// --- Session Management (LocalStorage) ---

const SESSIONS_KEY = 'side_picker_sessions';
const AUTOSAVE_KEY = 'side_picker_autosave';

// Auto-save on every change for resilience
function autoSave() {
    const data = {
        factions: state.factions,
        players: state.players,
        discord: state.discord,
        timestamp: Date.now()
    };
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(data));
}

function loadAutoSave() {
    const json = localStorage.getItem(AUTOSAVE_KEY);
    if (json) {
        try {
            const data = JSON.parse(json);
            if (data.factions) state.factions = data.factions;
            if (data.players) state.players = data.players;
            if (data.discord) state.discord = data.discord; // Restore Discord settings

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
    loadAutoSave();

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
    showToast('success', 'Saved', `Session "${name}" saved!`);
    closeModals();
}

function deleteSession(name) {
    showConfirm(
        'Delete Session?',
        `Are you sure you want to delete "${name}"?`,
        () => {
            const sessions = getSessions();
            delete sessions[name];
            localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
            // We need to refresh the list, but we don't have direct access to the callback or container ID here easily without passing it.
            // However, since this is called from the render loop, we might need a way to refresh.
            // Simplified: Close modal or just acknowledge. If staying in modal, we need to re-render.
            // Actually, renderSessionList passed 'onSelectCurrent' but we are inside delete click.
            // Let's just close modal for simplicity as re-rendering the same modal dynamic content is tricky with current structure.
            showToast('info', 'Deleted', `Session "${name}" deleted.`);
            closeModals();
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
            deleteSession(name);
            // Refresh the current list
            renderSessionList(containerId, onSelectCurrent);
        };

        container.appendChild(clone);
    });
}

function closeModals() {
    document.querySelectorAll('.modal, .modal-overlay').forEach(el => el.classList.remove('active'));
}


