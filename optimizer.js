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

function findOptimalAssignment(players, factions, mode) {
    // Mode: 'total' (Maximize Sum) or 'fairness' (Maximize Minimum, tie-break with Sum)
    const reason = validateOptimizerInput(players, factions, mode) || findAssignmentConflict(players, factions);
    if (reason) return { success: false, score: null, assignment: null, reason };

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

    solve(0, new Set(), 0, Infinity, Object.create(null));

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
        score: null,
        assignment: null,
        reason: 'No assignment respects all bans. Add factions or revise the conflicting choices.'
    };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SCORES, getScore, validateOptimizerInput, findAssignmentConflict, findOptimalAssignment };
}


