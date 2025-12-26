// Side Picker Logic

// Initialization and State
const state = {
    factions: [],
    players: [] // { id, name, preferences: [], bans: [] }
};

// --- DOM Helpers ---
function get(id) { return document.getElementById(id); }

// --- View Navigation ---
function nextStep(viewId) {
    if (viewId === 'view-players') {
        if (state.factions.length === 0) {
            alert("Please add at least one faction.");
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
function loadPreset() {
    const select = get('game-select');
    const inputGroup = get('faction-input').parentElement; // To toggle visibility if needed, or just keep it open for additions

    if (select.value === 'custom') {
        // Do nothing? Or clear? Let's just keep current state to avoid accidental data loss.
        // Or maybe clearing is expected? Let's leave it. User can clear manually or reset.
        // Actually, usually presets replace everything.
        if (state.factions.length > 0 && confirm("Switching presets will clear current factions. Continue?")) {
            state.factions = [];
        } else if (state.factions.length > 0) {
            select.value = 'custom'; // revert
            return;
        }
    } else {
        if (state.factions.length === 0 || confirm("Load preset? This will overwrite current factions.")) {
            state.factions = [...PRESETS[select.value]];
            autoSave();
        } else {
            select.value = 'custom'; // revert
            return;
        }
    }

    renderFactions();
    updateAllPlayerFactions();
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
        alert("Faction already exists!");
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
            bans: [] // List of unwanted factions
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

    if (player && confirm(`Reset choices for ${player.name}?`)) {
        player.preferences = [];
        player.bans = [];
        autoSave();
        // Just refresh the lists for this card directly for performance/UX
        const availableList = card.querySelector('.available-list');
        const prefList = card.querySelector('.preference-list');
        const banList = card.querySelector('.banned-list');
        refreshListsForCard(player, availableList, prefList, banList);
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
        alert("Add players first!");
        return;
    }

    if (confirm("This will randomize preferences and bans for ALL players. Existing choices will be lost. Continue?")) {
        state.players.forEach(player => {
            // Shuffle a copy of factions
            const shuffled = [...state.factions].sort(() => 0.5 - Math.random());

            // Determine random split points
            // Ensure at least 1 preference if possible, but keep it varying
            const total = shuffled.length;
            // Prefs: Random between 1 and total
            const numPrefs = Math.floor(Math.random() * total) + 1;

            // Bans: Random between 0 and remainder
            const remaining = total - numPrefs;
            const numBans = Math.floor(Math.random() * (remaining + 1));

            player.preferences = shuffled.slice(0, numPrefs);
            player.bans = shuffled.slice(numPrefs, numPrefs + numBans);
            // The rest are strictly "Neutral" / "Available" (implicitly handled by renderer)
        });

        autoSave();
        renderPlayers();
    }
}

// --- Drag and Drop Logic ---
function setupDragAndDrop(list1, list2, list3, playerObj) {
    const lists = [list1, list2, list3];

    lists.forEach(list => {
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
    });
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
        alert("Add players first!");
        return;
    }

    if (state.factions.length < state.players.length) {
        alert(`Not enough factions! You have ${state.factions.length} factions for ${state.players.length} players.`);
        return;
    }

    // Get Mode
    const mode = document.querySelector('input[name="opt-mode"]:checked').value; // 'total' or 'fairness'
    const result = findOptimalAssignment(state.players, state.factions, mode);

    if (result.success) {
        displayResults(result);
        switchView('view-results');
    } else {
        alert("Could not find a valid assignment! Try removing some bans.");
    }
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

    state.players.forEach(p => {
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

            renderFactions();
            renderPlayers();
            // Don't auto-switch view, let user start fresh but with data loaded
        } catch (e) {
            console.error("Failed to load autosave", e);
        }
    }
}

// Named Sessions
function getSessions() {
    const json = localStorage.getItem(SESSIONS_KEY);
    return json ? JSON.parse(json) : {};
}

function saveSession(name) {
    if (!name) return alert("Please enter a name.");

    const sessions = getSessions();
    sessions[name] = {
        factions: state.factions,
        players: state.players,
        date: new Date().toISOString()
    };

    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
    alert(`Session "${name}" saved!`);
    closeModals();
}

function deleteSession(name) {
    if (!confirm(`Delete "${name}"?`)) return;

    const sessions = getSessions();
    delete sessions[name];
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
    renderLoadList(); // Refresh list
}

function loadSession(name) {
    const sessions = getSessions();
    const data = sessions[name];

    if (data) {
        if (confirm("Load session? This will overwrite current setup.")) {
            state.factions = data.factions || [];
            state.players = data.players || [];
            renderFactions();
            renderPlayers();
            updateAllPlayerFactions();
            autoSave(); // Sync to autosave
            closeModals();
            alert(`Loaded "${name}"`);
        }
    } else {
        alert("Session not found.");
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

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadAutoSave();
});
