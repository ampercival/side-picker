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

// Competition ranks: ties occupy positions (1, 1, 3 or 1, 2, 3, 3, 3, 6).
// Missing ranks are legacy, strictly ordered preferences.
function preferenceRanks(player) {
    return player.preferenceRanks ?? player.preferences.map((_, i) => i + 1);
}

function setPreferenceOrder(player, next) {
    const ranks = preferenceRanks(player);
    const old = new Map(player.preferences.map((f, i) => [f, ranks[i]]));
    let rank = 1;
    player.preferenceRanks = next.map((f, i) => {
        if (i === 0 || !old.has(f) || old.get(f) !== old.get(next[i - 1])) rank = i + 1;
        return rank;
    });
    player.preferences = next;
}

function setPreferenceRank(player, faction, target) {
    const ranks = preferenceRanks(player), groups = [];
    player.preferences.forEach((f, i) => {
        if (!i || ranks[i] !== ranks[i - 1]) groups.push({rank: ranks[i], factions: []});
        groups[groups.length - 1].factions.push(f);
    });
    const source = groups.findIndex(g => g.factions.includes(faction));
    if (source < 0) return;
    if (target === 'separate') {
        groups[source].factions = groups[source].factions.filter(f => f !== faction);
        groups.splice(source + 1, 0, {factions: [faction]});
    } else {
        const destination = groups.find(g => g.rank === Number(target));
        if (!destination) return;
        groups[source].factions = groups[source].factions.filter(f => f !== faction);
        destination.factions.push(faction);
    }
    player.preferences = []; player.preferenceRanks = [];
    for (const group of groups) {
        const rank = player.preferences.length + 1;
        player.preferences.push(...group.factions);
        player.preferenceRanks.push(...group.factions.map(() => rank));
    }
}

function getScore(player, faction) {
    if (player.bans.includes(faction)) return SCORES.ban;

    const index = player.preferences.indexOf(faction);
    const rankIndex = index < 0 ? -1 : preferenceRanks(player)[index] - 1;

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

function validateOptimizerInput(players, factions, mode) {
    if (!['total', 'fairness'].includes(mode)) return 'Choose a supported optimization goal.';
    if (!Array.isArray(players) || !players.length) return 'Add at least one player.';
    const label = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 500;
    if (!Array.isArray(factions) || !factions.length || factions.length > 100 ||
        !factions.every(label) || new Set(factions).size !== factions.length) return 'Use 1 to 100 distinct faction names, each at most 500 characters.';
    if (players.length > factions.length) return `Add more factions: ${players.length} players need distinct assignments, but only ${factions.length} factions are available.`;
    const ids = new Set();
    for (const player of players) {
        if (!player || !label(player.id) || ids.has(player.id) || !label(player.name)) return 'Every player needs a name and a distinct player ID. Re-add any duplicate player cards.';
        ids.add(player.id);
        for (const list of [player.preferences, player.bans]) {
            if (!Array.isArray(list) || new Set(list).size !== list.length || !list.every(f => factions.includes(f))) return `Check ${player.name}'s choices: each faction must exist and appear only once in each list.`;
        }
        if (player.preferences.some(f => player.bans.includes(f))) return `${player.name} has a faction both preferred and banned. Choose one list for it.`;
        const ranks = preferenceRanks(player);
        if (!Array.isArray(ranks) || ranks.length !== player.preferences.length ||
            ranks.some((rank, i) => !Number.isInteger(rank) || (i === 0 ? rank !== 1 : rank !== ranks[i - 1] && rank !== i + 1))) return `Check ${player.name}'s preference ranks.`;
        if (player.noPreference !== undefined && typeof player.noPreference !== 'boolean') return `Check ${player.name}'s unranked preference setting.`;
    }
    return null;
}

// A failed bipartite matching search identifies a group with too few allowed
// factions before starting the more expensive scored search.
function findAssignmentConflict(players, factions) {
    const owner = new Map();
    for (let index = 0; index < players.length; index++) {
        const seenFactions = new Set();
        const seenPlayers = new Set();
        function assign(i) {
            seenPlayers.add(i);
            for (const faction of factions) {
                if (players[i].bans.includes(faction) || seenFactions.has(faction)) continue;
                seenFactions.add(faction);
                if (!owner.has(faction) || assign(owner.get(faction))) {
                    owner.set(faction, i);
                    return true;
                }
            }
            return false;
        }
        if (!assign(index)) {
            const names = [...seenPlayers].map(i => players[i].name);
            if (names.length === 1) return `${names[0]} has banned every available faction. Unban a faction or add another faction.`;
            const shown = names.slice(0, 5).join(', ') + (names.length > 5 ? ` and ${names.length - 5} others` : '');
            return `${shown} need ${names.length} distinct factions, but their bans leave only ${seenFactions.size} available between them. Add factions or change one of those bans.`;
        }
    }
    return null;
}

function findOptimalAssignment(players, factions, mode, random = Math.random) {
    const reason = validateOptimizerInput(players, factions, mode) || findAssignmentConflict(players, factions);
    if (reason) return { success: false, score: null, assignment: null, reason };

    // Randomize traversal to avoid a permanent roster/faction-order advantage.
    // This samples optimal outcomes, but is NOT uniform over all tied matchings.
    function shuffled(values) {
        const copy = values.slice();
        for (let i = copy.length - 1; i > 0; i--) {
            const j = Math.floor(random() * (i + 1));
            [copy[i], copy[j]] = [copy[j], copy[i]];
        }
        return copy;
    }
    const roster = shuffled(players), options = shuffled(factions);
    const scores = roster.map(p => options.map(f => p.bans.includes(f) ? -1 : getScore(p, f)));
    const thresholds = [...new Set(scores.flat().filter(score => score >= 0))].sort((a,b) => b-a);

    // Rectangular Hungarian assignment: O(players^2 * factions) time and
    // O(players * factions) space. Forbidden edges have a cost above the
    // largest possible legal total, and are checked again before returning.
    function solve(minimum) {
        const n = roster.length, m = options.length, forbidden = 1000000;
        const u = new Float64Array(n+1), v = new Float64Array(m+1);
        const owner = new Int32Array(m+1), previous = new Int32Array(m+1);
        for (let i = 1; i <= n; i++) {
            owner[0] = i;
            let column = 0;
            const distance = new Float64Array(m+1).fill(Infinity), used = new Uint8Array(m+1);
            do {
                used[column] = 1;
                const row = owner[column];
                let delta = Infinity, next = 0;
                for (let j = 1; j <= m; j++) if (!used[j]) {
                    const score = scores[row-1][j-1];
                    const cost = (score < minimum ? forbidden : SCORES.rank1 - score) - u[row] - v[j];
                    if (cost < distance[j]) { distance[j] = cost; previous[j] = column; }
                    if (distance[j] < delta) { delta = distance[j]; next = j; }
                }
                for (let j = 0; j <= m; j++) {
                    if (used[j]) { u[owner[j]] += delta; v[j] -= delta; }
                    else distance[j] -= delta;
                }
                column = next;
            } while (owner[column] !== 0);
            do { const next = previous[column]; owner[column] = owner[next]; column = next; } while (column !== 0);
        }
        const assignment = Object.create(null);
        let total = 0, lowest = Infinity;
        for (let j = 1; j <= m; j++) if (owner[j]) {
            const i = owner[j]-1, score = scores[i][j-1];
            if (score < minimum) return null;
            assignment[roster[i].id] = options[j-1]; total += score; lowest = Math.min(lowest, score);
        }
        return { success: true, score: total, minimum: lowest, assignment, tieSelection: 'randomized-order' };
    }
    // There are only six legal score levels. Thresholding enforces the exact
    // minimum-score objective without encoding it as an approximate weight.
    if (mode === 'fairness') {
        for (const threshold of thresholds) { const result = solve(threshold); if (result) return result; }
    } else {
        const bestTotal = solve(0);
        for (const threshold of thresholds) {
            if (threshold === 0) return bestTotal;
            const result = solve(threshold);
            if (result && result.score === bestTotal.score) return result;
        }
    }
    return { success: false, score: null, assignment: null, reason: 'No assignment respects all bans.' };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { preferenceRanks, setPreferenceOrder, setPreferenceRank, SCORES, getScore, validateOptimizerInput, findAssignmentConflict, findOptimalAssignment };
}

