# Side Picker application guide

Last updated: 2026-09-26. Baseline reviewed: commit `2fae186` on `main`.

This describes the existing application, not the proposed future design. See [the improvement plan](IMPROVEMENT_PLAN.md) for changes and session handoffs. Verify live operational details when they matter; a successful check on the review date is not ongoing monitoring.

## Purpose

Side Picker assigns distinct board-game factions to players using their ranked preferences, neutral choices, and bans. An organizer can enter everyone's choices or collect them through a live room, then optimize and share the assignments.

## Current user journeys

### Organizer

1. Enter a workspace key to load saved sessions and game presets. This is a shared label, not authentication.
2. Create a named session or resume an existing one.
3. Enter session/game details and add factions, or choose a saved game preset.
4. Add players and arrange each player's factions into Preferences, Available, and Banned.
5. Optionally open a live room and share its link with players.
6. Choose Highest Group Score or Fairest for Everyone, then optimize.
7. View results, share a results snapshot, or clear results and reopen picking.

Game presets are named faction lists. A session contains the game-night setup, players, room code, and optional results. Editing the displayed session name does not change its original database identity.

### Guest

A URL with `?room=CODE` opens guest mode. Guests select a name from the organizer's roster, rank or ban factions, and submit. They can revisit and resubmit. The name selector does not currently prove player identity. Published results appear through Realtime, and clearing results returns guests to picking.

### Shared results

A URL with `#results=...` contains a URL-safe Base64 JSON snapshot. It does not need a database read to display results. It is a snapshot, so later room changes do not change an already copied link. It is encoded, not encrypted or authenticated; its payload is untrusted input.

As of SEC-01, snapshots require version 1, finite bounded scores, nonempty assignment rows (up to 100), text fields up to 500 characters, and encoded links up to 65,536 characters. Invalid links show a recovery screen. All result card fields are rendered as text; previously published negative scores remain readable.

If both URL forms are present, room mode takes precedence at startup.

## Files and runtime

| File | Responsibility |
| --- | --- |
| `index.html` | All screens, modals, templates, inline event handlers, script loading |
| `style.css` | Themes, cards, ranking lists, modals, responsive layout |
| `script.js` | Organizer UI, state, ranking controls, optimizer, saving orchestration, presets, result links |
| `results.js` | Snapshot validation, bounded decoding, safe result card rendering; also testable under Node |
| `rooms.js` | Supabase client, database operations, workspace key, host/guest room synchronization |
| `config.js` | Public Supabase project URL and publishable key |
| `supabase/schema.sql` | Current schema and legacy migration instructions |
| `.claude/launch.json` | Local static-server launch configuration on port 8753 |

The scripts are classic browser scripts sharing globals, not ES modules. Loading order is Supabase's CDN client, `config.js`, `results.js`, `script.js`, then `rooms.js`. Much of initialization runs at `DOMContentLoaded`, after the application scripts are available.

There is no application server, framework, bundler, or package manifest. Focused Node tests now live in `tests/`. Supabase JS is loaded from a floating major-version CDN URL (`@supabase/supabase-js@2`). Google Fonts supplies Outfit.

## State and persistence

- `state` in `script.js`: factions, players, sessionName, gameTitle, roomCode, results.
- Player objects: id, name, preferences, bans, locked, noPreference, expanded.
- `activeSessionName`: the original saved-session identity used by database operations.
- `sessionsCache` and `presetsCache` in `rooms.js`: in-memory database copies.
- `currentSessionObject()` builds a session snapshot; `sessionRow()` maps it to database column names.
- `autoSave()` updates the memory cache and schedules a database upsert after 1,200 ms. `flushSession()` attempts an immediate save during `beforeunload`.
- Supabase is the current source of truth. There is no durable local working-session copy or offline save queue. Local storage keeps the workspace key and theme only.
- Some comments still mention an old localStorage session blob. Those comments are stale; use the actual persistence code as evidence.

### Database model

| Table | Identity | Contents |
| --- | --- | --- |
| `users` | UUID; unique `owner_key` | Workspace registry/scaffolding, not Supabase Auth identities |
| `sessions` | `(owner_key, name)` | Display name, game title, JSON factions and players, unique optional room code, JSON results, timestamp |
| `presets` | `(owner_key, name)` | JSON faction list and timestamp |
| `submissions` | `(room_code, player_name)` | JSON preferences/bans, unranked flag, timestamp |

Submissions reference `sessions.room_code` with cascading deletion. There is no separate rooms table in the current model. The schema file deletes orphan submissions and drops the old rooms table as part of migration; it is not a harmless diagnostic script.

RLS is enabled, but the checked-in policies grant unrestricted anonymous select/insert/update/delete on all four tables. Workspace filters in JavaScript do not enforce authorization. The review did not inspect deployed policies or attempt production writes to verify these grants.

### Live-room data flow

1. Host saves the session with a generated six-character room code.
2. Guest reads the session by code, then upserts a submission using the selected player name.
3. Host subscribes to submission changes, merges them into its player state, and saves the session again.
4. Guests subscribe to the session row for roster status and published results.

The host browser currently bridges submissions into the session's player snapshot. If it is disconnected, guest roster status can lag until the host reloads submissions. Host edits and guest submissions are separate copies that can conflict. Channel subscription status and catch-up after reconnect are not explicitly handled.

## Assignment rules and implementation

Scores are 10 for first preference, 7 for second, 4 for third, 2 for fourth, 1 for fifth or later, and 0 for neutral. The unranked toggle makes every preferred faction worth 10. Bans score -1000.

- **Highest Group Score:** maximize total score, then the lowest individual score.
- **Fairest for Everyone:** maximize the lowest individual score, then total score.
- Equally optimal stored assignments are selected randomly.
- Player locks protect their choices from Randomize Choices; they do not lock an assignment.
- Randomize Choices changes preferences and bans; it is not a neutral random assignment feature.

`findOptimalAssignment()` performs recursive exhaustive search with pruning. A Web Worker is generated from the solver functions so it normally runs off the main thread. Large estimated searches prompt the organizer, and the worker can be cancelled. Worker failures can fall back to synchronous execution, which can block the page on large problems.

Current caveat: when a player's branch has no remaining preferred or neutral candidates, the solver tries banned factions. Thus Banned is not currently a hard constraint. The UI can display `BANNED (Forced)` and a negative Group Happiness percentage. With enough distinct factions and normal valid inputs, infeasible strict-ban cases may still return success.

Every tied best assignment is retained in memory. Eight neutral players with eight factions produced 40,320 ties in the review. This grows factorially.

Results use the payload `{v, t, gm, g, pct, r}`: version, session title, game, goal, percentage, and rows. Rows use `{n, f, note, s}` for player name, assigned faction, explanation, and score. The percentage is total score divided by `10 * player count`, not a probability or percentage of satisfied players.

## Known issues at the reviewed baseline

| Area | Finding | Plan task |
| --- | --- | --- |
| Access | Checked-in policies allow unrestricted anonymous access; player names are not identities | SEC-02 |
| Shared links | Fixed: payloads validated and card fields rendered with text nodes; invalid-link recovery added | SEC-01 complete |
| Saving | Database helpers toast errors without signalling failure to callers; success messages can follow failed operations | REL-01 |
| Saving | Reloading the session cache during a pending save can replace the intended data; unload saves are not guaranteed | REL-01 |
| Submissions | Submitted status requires every faction to be ranked or banned, despite neutral choices being valid | ROOM-01 |
| Live rooms | Reconnection, stale requests, roster changes, and host/guest copy conflicts need handling | ROOM-01 |
| Optimizer | Bans can be forced; tied solutions consume unbounded memory | OPT-01, OPT-02 |
| Mobile | Add Player text is clipped at 390px; ranking controls are 26px; view changes retain scroll position | UX-01 |
| Operations | No daily health job yet; focused results tests added, broader checks remain outstanding | OPS-01, ENG-01 |

## Hosting, local use, and validation

- Repository: [ampercival/side-picker](https://github.com/ampercival/side-picker).
- Live site: [Side Picker](https://ampercival.github.io/side-picker/).
- On 2026-09-26, GitHub reported a public repository with Pages publishing from the root of `main`.
- On that date, a read-only Supabase REST request selecting zero session rows returned HTTP 200. This establishes reachability at that time, not the deployed authorization rules or future availability.

From the repository root, run:

```powershell
python -m http.server 8753 --bind 127.0.0.1
```

Open `http://127.0.0.1:8753/`. Serving locally still uses the production Supabase configuration. For write tests, use a separate test project or an isolated mock; do not assume localhost means test data.

Basic syntax checks available without installing dependencies:

```powershell
node --check script.js
node --check rooms.js
node --check config.js
node --check results.js
node --test --test-isolation=none tests/results.test.cjs
```

The initial review included source/schema inspection, syntax checks, isolated function probes, and browser checks with mocked database responses at phone width. It did not verify production multi-device Realtime, deployed RLS, or failure recovery end to end. The temporary mock server used for that review was stopped and was not checked into the repository.

## Maintaining this guide

After relevant implementation, update the current behavior, data model, known-issue table, and validation instructions. Put proposals and outstanding decisions in the improvement plan so future sessions can distinguish implemented features from intentions.
