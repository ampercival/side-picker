# Side Picker application guide

Last updated: 2026-09-26. Baseline reviewed: commit `2fae186` on `main`.

This describes the existing application, not the proposed future design. See [the improvement plan](IMPROVEMENT_PLAN.md) for changes and session handoffs. Verify live operational details when they matter; a successful check on the review date is not ongoing monitoring.

## Purpose

Side Picker assigns distinct board-game factions to players using their ranked preferences, neutral choices, and bans. An organizer can enter everyone's choices or collect them through a live room, then optimize and share the assignments.

**Product direction confirmed 2026-09-26:** this is a public app that anyone should be able to use immediately. Required Google/email sign-in is not the planned entry flow. Private organizer links and personal player invitations now provide the access model. See SEC-02 in the plan for deployment status and PRIVATE_LINKS.md for operations. Optional accounts remain a future feature.

## Current user journeys

### Organizer

1. Start immediately in a new private workspace, or open a saved organizer link to recover an existing one. Save the private link for another device or browser recovery.
2. Create a named session or resume an existing one.
3. Enter session/game details and add factions, or choose a saved game preset.
4. Add players and arrange each player's factions into Preferences, Available, and Banned.
5. Optionally open a live room and send each player their personal invitation. A separate viewing link is read-only.
6. Choose Highest Group Score or Fairest for Everyone, then optimize.
7. View results, share a results snapshot, or clear results and reopen picking.

Game presets are named faction lists. A session contains the game-night setup, players, room code, and optional results. Editing the displayed session name does not change its original database identity.

### Guest

A room invitation uses `?room=CODE` plus a player ID and private token in the fragment. The app remembers the invitation within that tab and removes the fragment from the address bar. It opens that player's choices directly; there is no name selector. A viewing link shows the room without permitting submissions. Old room links without capabilities require replacement. Scoped polling refreshes room status and published results. No guest account is required.

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
| `optimizer.js` | Pure scoring, input validation, conflict detection, strict-ban assignment solver |
| `rooms.js` | Capability-authorized RPC calls, private workspaces, scoped host/guest polling |
| `access.js` | Secure token generation, fragment parsing, safe link construction |
| `config.js` | Public Supabase project URL and publishable key |
| `supabase/schema.sql` | Historical fresh-install baseline; refuses rerun after private links |
| `supabase/migrations/` | Versioned migrations; health sentinel and both private-link stages are deployed |
| `supabase/tests/health_permissions.sql` | Transactional health-table role/permission checks |
| `.claude/launch.json` | Local static-server launch configuration on port 8753 |
| `scripts/keep-supabase-active.ps1` | Daily local read-only database check, bounded retries, logging and status |
| `scripts/register-keepalive-task.ps1` | Registers the daily Windows task and sign-in catch-up |

The scripts are classic browser scripts sharing globals, not ES modules. Loading order is Supabase's CDN client, `config.js`, `access.js`, `results.js`, `optimizer.js`, `script.js`, then `rooms.js`. Much of initialization runs at `DOMContentLoaded`, after the application scripts are available.

There is no application server, framework, bundler, or package manifest. Focused Node tests now live in `tests/`. Supabase JS is loaded from a floating major-version CDN URL (`@supabase/supabase-js@2`). Google Fonts supplies Outfit.

## State and persistence

- `state` in `script.js`: factions, players, sessionName, gameTitle, roomCode, results.
- Player objects: id, name, preferences, bans, locked, noPreference, expanded.
- `activeSessionName`: the original saved-session identity used by database operations.
- `sessionsCache` and `presetsCache` in `rooms.js`: in-memory database copies.
- `currentSessionObject()` builds a session snapshot; `sessionRow()` maps it to database column names.
- `autoSave()` captures an immutable snapshot and organizer credential, then schedules an RPC after 1,200 ms. Writes are serialized. Navigation flushes before switching sessions/workspaces; `beforeunload` remains best-effort. Failed writes are signalled, but durable offline recovery and concurrent-host conflict handling are still pending.
- Supabase is the current source of truth. There is no durable local working-session copy or offline save queue. Local storage keeps the private organizer credential/workspace and theme. Guest invitation credentials are kept in per-tab session storage. Pending offline edits are still not durable.
- Some comments still mention an old localStorage session blob. Those comments are stale; use the actual persistence code as evidence.

### Database model

| Table | Identity | Contents |
| --- | --- | --- |
| `users` | UUID; unique `owner_key` | Workspace registry/scaffolding, not Supabase Auth identities |
| `sessions` | `(owner_key, name)` | Display name, game title, JSON factions and players, unique optional room code, JSON results, timestamp |
| `presets` | `(owner_key, name)` | JSON faction list and timestamp |
| `submissions` | Legacy `(room_code, player_name)` | Retained for recovery; new client does not use it |
| `side_picker_private.workspaces` | Existing workspace label, unique token hash | Hashed organizer capability |
| `side_picker_private.rooms` | Session UUID | Private seed for viewing/player links |
| `side_picker_private.picks` | `(session_id, player_id)` | Validated private submissions and timestamp |
| `app_health` | Single constrained `status = 'ok'` row | Non-sensitive read-only sentinel for the daily check |

Legacy submissions reference `sessions.room_code` with cascading deletion. Private rooms and picks now reference the stable session UUID. The historical schema file contains cleanup statements; it is not a harmless diagnostic script.

Private links use two capability-checked functions, `sp_workspace` and `sp_room`. The stage-two migration revokes direct anonymous/authenticated access to the four legacy game tables and removes permissive policies while leaving RLS enabled. The private schema and helper functions are inaccessible to public roles. See [PRIVATE_LINKS.md](PRIVATE_LINKS.md) for the exact boundary, rollout stages, token handling, and recovery. Check the plan for actual deployment status.

`app_health` is separate and publicly readable with no public writes; game permissions do not affect the daily check.

### Live-room data flow

1. Host saves a session and opens its room; the server generates a random code and private seed.
2. Host obtains a personal invitation for each stable player ID, or a read-only viewing link.
3. Guest submits through `sp_room`; the backend checks the capability, membership, faction choices, and published status, then stores the submission in the private schema.
4. The host polls new submissions and merges them by player ID and timestamp. Guests poll minimal room data and published results. Polling runs every three seconds while the page is visible, avoids overlapping requests, and reports connection interruptions.

The host still bridges submitted picks into the working session. The guest roster uses explicit backend submission status, including neutral submissions, even when the host is offline. A submitted acknowledgement disappears when the guest edits their choices. Full concurrent-host reconciliation and durable offline edits remain outstanding.

## Assignment rules and implementation

Scores are 10 for first preference, 7 for second, 4 for third, 2 for fourth, 1 for fifth or later, and 0 for neutral. The unranked toggle makes every preferred faction worth 10. Banned factions are excluded from new assignments. The legacy -1000 ban score remains only for compatibility with older result snapshots/scoring.

- **Highest Group Score:** maximize total score, then the lowest individual score.
- **Fairest for Everyone:** maximize the lowest individual score, then total score.
- Equally optimal stored assignments are selected randomly.
- Player locks protect their choices from Randomize Choices; they do not lock an assignment.
- Randomize Choices changes preferences and bans; it is not a neutral random assignment feature.

`findOptimalAssignment()` performs recursive exhaustive search with pruning. A Web Worker is generated from the solver functions so it normally runs off the main thread. Large estimated searches prompt the organizer, and the worker can be cancelled. Worker failures can fall back to synchronous execution, which can block the page on large problems.

OPT-01 added input validation and a preliminary matching check. Infeasible bans now produce a conflict explanation naming the affected players; the app does not relax bans automatically. Each optimization works from an immutable snapshot and discards its result if picks/setup/session changed while it was running. Display-only changes such as expanding a card do not invalidate it.

Every tied best assignment is retained in memory. Eight neutral players with eight factions produced 40,320 ties in the review. This grows factorially.

Results use the payload `{v, t, gm, g, pct, r}`: version, session title, game, goal, percentage, and rows. Rows use `{n, f, note, s}` for player name, assigned faction, explanation, and score. The displayed Preference Score is total score divided by `10 * player count`, not a probability or percentage of satisfied players. A summary counts first choices, top-three choices (including first), unranked preferences, and neutral assignments. Historical forced-ban results remain readable and are labelled as legacy in the summary.

## Known issues at the reviewed baseline

| Area | Finding | Plan task |
| --- | --- | --- |
| Access | Capability RPCs and personal invitations deployed; direct game access denied | SEC-02 complete |
| Shared links | Fixed: payloads validated and card fields rendered with text nodes; invalid-link recovery added | SEC-01 complete |
| Saving | Helpers now signal failure and writes capture identity/snapshots; durable offline recovery and concurrent-host conflicts remain | REL-01 |
| Saving | Navigation flushes before reloading the cache; unload saves are still not guaranteed | REL-01 |
| Submissions | Explicit submissions now include neutral choices; full collecting/locked/published lifecycle remains | ROOM-01 |
| Live rooms | Scoped polling retries and stable IDs are in place; host/guest conflict handling still needs work | ROOM-01 |
| Optimizer | Strict bans/conflict explanations and snapshot guard implemented; tied solutions still consume unbounded memory | OPT-01 complete; OPT-02 outstanding |
| Mobile | Add Player text is clipped at 390px; ranking controls are 26px; view changes retain scroll position | UX-01 |
| Operations | Local daily check installed and timer-triggered run verified; computer must be on/signed in. Broader app checks remain outstanding | OPS-01 complete; ENG-01 ongoing |

## Hosting, local use, and validation

- Repository: [ampercival/side-picker](https://github.com/ampercival/side-picker).
- Live site: [Side Picker](https://ampercival.github.io/side-picker/).
- On 2026-09-26, GitHub reported a public repository with Pages publishing from the root of `main`.
- After SEC-02 cutover on 2026-09-26, direct reads of all four game tables return permission denied. Scoped organizer reads and the independent health sentinel passed. See the plan for detailed deployment evidence.
- A local Windows task now runs three validated database reads daily at 09:17 Atlantic local time, with sign-in catch-up. A real timer-triggered run succeeded on 2026-09-26. See [the operational guide](SUPABASE_KEEPALIVE.md) for manual commands, log paths, limitations, and registration.

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
node --check optimizer.js
node --check access.js
node --test --test-isolation=none tests/results.test.cjs tests/optimizer.test.cjs tests/access.test.cjs
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tests/keepalive.Tests.ps1
```

For a repeatable host browser fixture with no production database connection, run `node tests/serve-fixture.cjs` and open `http://127.0.0.1:8754/`. Resume the sample session, optimize to see its ban conflict, then unban B for Jordan and optimize to obtain one first choice plus one neutral assignment (50%). Restarting the fixture server resets its shared in-memory data. It supports host/guest tabs and exact-width phone previews; it does not prove database permissions. Use the rolled-back SQL permission tests for that.

The initial review included source/schema inspection, syntax checks, isolated function probes, and mocked browser checks. Subsequent work verified deployed permissions and a real timer-triggered keep-alive. See the plan for private-link rollout evidence. Durable save recovery and full concurrent-host behavior remain unverified.

## Maintaining this guide

After relevant implementation, update the current behavior, data model, known-issue table, and validation instructions. Put proposals and outstanding decisions in the improvement plan so future sessions can distinguish implemented features from intentions.
