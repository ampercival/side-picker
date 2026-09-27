# Side Picker application guide

Last updated: 2026-09-27. Initial review: `2fae186`; current verified core release: `0ea2704` on `main`.

This describes the existing application, not the proposed future design. See [the improvement plan](IMPROVEMENT_PLAN.md) for changes and session handoffs. Verify live operational details when they matter; a successful check on the review date is not ongoing monitoring.

## Purpose

Side Picker assigns distinct board-game factions to players using their ranked preferences, neutral choices, and bans. An organizer can enter everyone's choices or collect them through a live room, then optimize and share the assignments.

**Product direction confirmed 2026-09-26:** this is a public app that anyone should be able to use immediately. Required Google/email sign-in is not the planned entry flow. Private organizer links and personal player invitations now provide the access model. See SEC-02 in the plan for deployment status and PRIVATE_LINKS.md for operations. Optional Discord/Google accounts (FEATURE-04) are prepared but not yet activated; see [ACCOUNTS.md](ACCOUNTS.md).

## Current user journeys

### Organizer

1. Start immediately in a new private workspace, or open a saved organizer link to recover an existing one. Save the private link for another device or browser recovery.
2. Create a named session or resume an existing one.
3. Enter session/game details and add factions, or choose a saved game preset.
4. Add players and arrange each player's factions into Preferences, Available, and Banned.
5. Optionally open a live room and send each player their personal invitation. The group link is read-only unless the organizer turns on **Let players join**. Then anyone with it can add themselves, up to the seat limit (at most one seat per faction), and gets their own personal invitation. A room can open before any players are added.
6. Close picking when ready, or optimize to close it automatically. Compare Highest Group Score and Fairest for Everyone, then explicitly publish one; the app synchronizes final submissions before solving. Cancellation leaves picking closed until you reopen it.
7. View results, share a results snapshot, or clear results and reopen picking.
8. Optionally sign in. While signed in, every device shows the account's games; games already in a browser are added only by choice. **Saved games** on the home screen edits saved faction lists.

Game presets are named faction lists. A session contains the game-night setup, players, room code, and optional results. Editing the displayed session name does not change its original database identity.

### Guest

A room invitation uses `?room=CODE` plus a player ID and private token in the fragment. The app remembers the invitation within that tab and removes the fragment from the address bar. It opens that player's choices directly; there is no name selector. A viewing link shows the room without permitting submissions. Old room links without capabilities require replacement. Scoped polling refreshes room status and published results. No guest account is required. A player may optionally sign in from their invitation; it is then saved to their account and listed on their home screen under **Sessions you're playing in**.

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
| `accounts.js` | Optional sign-in, My games, device keys, sign-out and account deletion |
| `privacy.html` | Static privacy and saved-data notice, published with the app |
| `access.js` | Secure token generation, fragment parsing, safe link construction |
| `save-journal.js` | Durable draft queue, immutable retry requests, save states |
| `persistence.js` | Save-status and recovery UI, connection retries |
| `sharing.js` | Goal comparison, explicit publication, result summaries, local invitation QR codes |
| `repeat-games.js` | Fresh repeat-session setup and bounded bulk-name entry |
| `accessibility.js` | Dialog focus/keyboard behavior, announcements, and browser view navigation |
| `config.js` | Public Supabase project URL, publishable key, and enabled account providers (empty hides accounts) |
| `supabase/schema.sql` | Historical fresh-install baseline; refuses rerun after private links |
| `supabase/migrations/` | Versioned migrations; health sentinel and both private-link stages are deployed |
| `supabase/tests/health_permissions.sql` | Transactional health-table role/permission checks |
| `.claude/launch.json` | Local static-server launch configuration on port 8753 |
| `scripts/keep-supabase-active.ps1` | Daily local read-only database check, bounded retries, logging and status |
| `scripts/register-keepalive-task.ps1` | Registers the daily Windows task and sign-in catch-up |

The scripts are classic browser scripts sharing globals, not ES modules. Loading order is Supabase's CDN client, `config.js`, `access.js`, `save-journal.js`, `results.js`, `optimizer.js`, `repeat-games.js`, the pinned QR encoder, `sharing.js`, `script.js`, `rooms.js`, `accounts.js`, then `persistence.js` and `accessibility.js`. Much of initialization runs at `DOMContentLoaded`, after the application scripts are available.

There is no application server, framework, bundler, or package manifest. Focused Node tests now live in `tests/`. Supabase JS is pinned to version 2.117.2 with integrity verification. Google Fonts supplies Outfit.

## State and persistence

- `state` in `script.js`: factions, players, sessionName, gameTitle, roomCode, results.
- Player objects: id, name, preferences, bans, locked, noPreference, expanded.
- `activeSessionName`: the original saved-session identity used by database operations.
- `sessionsCache` and `presetsCache` in `rooms.js`: in-memory database copies.
- `currentSessionObject()` builds a session snapshot; `sessionRow()` maps it to database column names.
- `autoSave()` synchronously backs up an immutable draft in local storage before its 1,200 ms save delay. Each tab has independent draft IDs, scoped to the workspace, with no credential copied into drafts.
- The save journal freezes in-flight requests and retries the same operation ID after uncertain network outcomes. Later edits remain backed up until separately acknowledged. Requests time out after 15 seconds. Retry occurs when online, every 15 seconds while visible, or through Retry saving.
- Database saves/deletes require the last acknowledged `save_version`; concurrent changes reject stale writes. A conflict retains the draft and offers a separate recovery copy or explicit discard. There is no silent merge or force-overwrite option. Preset renames check both source and destination versions in one transaction.
- After refreshing, pending drafts are listed for explicit recovery as new games/presets. They are not blindly replayed because another tab may still be editing them. Saved cloud originals remain authoritative; recovery copies have new names and no live-room link.
- Navigation flushes where possible and otherwise retains durable drafts. Browser-storage failure is prominently reported, blocks navigation that would discard the working editor, and adds an unload warning until safe. Closing delivery is not required for recovery.
- Local storage also holds the organizer credential/workspace and theme; guest invitations use per-tab session storage. Clearing browser storage removes local drafts. Unsaved text in the preset editor is backed up when Save is pressed, not on each keystroke. See [SAVING.md](SAVING.md) for the boundary, tests, and migration.

### Database model

| Table | Identity | Contents |
| --- | --- | --- |
| `users` | UUID; unique `owner_key` | Workspace registry/scaffolding, not Supabase Auth identities |
| `sessions` | `(owner_key, name)` | Display name, game title, JSON factions and players, unique optional room code, JSON results, timestamp |
| `presets` | `(owner_key, name)` | JSON faction list and timestamp |
| `submissions` | Legacy `(room_code, player_name)` | Retained for recovery; new client does not use it |
| `side_picker_private.workspaces` | Token hash; several per workspace after migration 006 | Hashed organizer keys: the shareable link, plus account device keys with label and creating user |
| `side_picker_private.account_workspaces` | Workspace label | The one account that owns a workspace (migration 006) |
| `side_picker_private.account_invitations` | Account + session UUID + player ID | A player's saved invitation: hash only, retired when links are replaced (migration 007) |
| `side_picker_private.rooms` | Session UUID | Private seed for viewing/player links |
| `side_picker_private.picks` | `(session_id, player_id)` | Validated private submissions and timestamp |
| `side_picker_private.save_receipts` | Workspace + operation UUID | Idempotent save replies, retained for 30 days per active workspace |
| `app_health` | Single constrained `status = 'ok'` row | Non-sensitive read-only sentinel for the daily check |

Legacy submissions reference `sessions.room_code` with cascading deletion. Private rooms and picks now reference the stable session UUID. The historical schema file contains cleanup statements; it is not a harmless diagnostic script.

Private links use two capability-checked functions, `sp_workspace` and `sp_room`. The stage-two migration revokes direct anonymous/authenticated access to the four legacy game tables and removes permissive policies while leaving RLS enabled. The private schema and helper functions are inaccessible to public roles. See [PRIVATE_LINKS.md](PRIVATE_LINKS.md) for the exact boundary, rollout stages, token handling, and recovery. Check the plan for actual deployment status.

`app_health` is separate and publicly readable with no public writes; game permissions do not affect the daily check.

### Live-room data flow

1. Host saves a session and opens its room; the server generates a random code and private seed.
2. Host obtains a personal invitation for each stable player ID, or a read-only viewing link.
3. Guest submits through `sp_room`; the backend checks the capability, membership, faction choices, and published status, then stores the submission in the private schema.
4. The host polls new submissions and merges them by player ID and timestamp. Guests poll minimal room data and published results. Polling runs every three seconds while the page is visible, avoids overlapping requests, and reports connection interruptions.

The host still bridges submitted picks into the working session. The guest roster uses explicit backend submission status, including neutral submissions, even when the host is offline. A submitted acknowledgement disappears when the guest edits their choices. Concurrent organizer saves are version-checked and conflicts preserve local drafts. Room revisions, explicit stages, and conflict resolution are implemented; see Room synchronization below.

## Assignment rules and implementation

Scores are 10 for first preference, 7 for second, 4 for third, 2 for fourth, 1 for fifth or later, and 0 for neutral. The unranked toggle makes every preferred faction worth 10. Banned factions are excluded from new assignments. The legacy -1000 ban score remains only for compatibility with older result snapshots/scoring.

- **Highest Group Score:** maximize total score, then the lowest individual score.
- **Fairest for Everyone:** maximize the lowest individual score, then total score.
- Equally optimal assignments use randomized player/faction traversal. Outcomes vary without retaining all ties; sampling is not guaranteed uniform over all optimal assignments.
- Player locks protect their choices from Randomize Choices; they do not lock an assignment.
- Randomize Choices changes preferences and bans; it is not a neutral random assignment feature.

`findOptimalAssignment()` uses rectangular Hungarian assignment with at most six score thresholds. This preserves both lexicographic objectives exactly, in O(6 × players² × factions) time and O(players × factions) working space. Supported limits are 100 players and 100 factions. A generated Web Worker keeps the UI responsive; Cancel terminates it, and a 15-second watchdog stops a stuck run. Worker startup/runtime failure produces a recoverable error with no synchronous fallback.

OPT-01 added input validation and a preliminary matching check. Infeasible bans now produce a conflict explanation naming the affected players; the app does not relax bans automatically. Each optimization works from an immutable snapshot and discards its result if picks/setup/session changed while it was running. Display-only changes such as expanding a card do not invalidate it.

Only one optimal assignment is retained. The original eight-neutral-player case retained 40,320 solutions; the new solver also handles 100 neutral players without enumerating ties. Random traversal avoids a permanent input-order advantage, but it is not an exact lottery over every tied matching. The declared score/fairness goals and bans always take precedence.

Results use the payload `{v, t, gm, g, pct, r}`: version, session title, game, goal, percentage, and rows. Rows use `{n, f, note, s}` for player name, assigned faction, explanation, and score. The displayed Preference Score is total score divided by `10 * player count`, not a probability or percentage of satisfied players. A summary counts first choices, top-three choices (including first), unranked preferences, and neutral assignments. Historical forced-ban results remain readable and are labelled as legacy in the summary.

## Known issues at the reviewed baseline

| Area | Finding | Plan task |
| --- | --- | --- |
| Access | Capability RPCs and personal invitations deployed; direct game access denied | SEC-02 complete |
| Shared links | Fixed: payloads validated and card fields rendered with text nodes; invalid-link recovery added | SEC-01 complete |
| Saving | Durable drafts, truthful status, idempotent retries, and explicit conflict recovery deployed | REL-01 complete |
| Saving | Navigation preserves backed-up edits; recovery does not depend on unload delivery | REL-01 complete |
| Submissions | Neutral submissions, edited/organizer-updated status, and enforced collecting/locked/published stages | ROOM-01 complete |
| Live rooms | Stable IDs, reconnect refresh, guest conflict choices, and preserved host conflicts | ROOM-01 complete |
| Optimizer | Exact objectives with bounded matching, randomized tie traversal, and cancellable workers | OPT-01 and OPT-02 complete |
| Mobile | Flexible inputs, 44px controls, wrapping names, compact empty lists, view focus/scroll reset | UX-01 complete |
| Operations | Local daily check installed and timer-triggered run verified; computer must be on/signed in. Release checks now gate Pages deployment | OPS-01 and ENG-01 complete |
| Accounts | Optional accounts: migrations 006-007 applied; Google, Discord, and GitHub live; account games on every device and saved player invitations deployed | FEATURE-04 in progress |

## Hosting, local use, and validation

- Repository: [ampercival/side-picker](https://github.com/ampercival/side-picker).
- Live site: [Side Picker](https://ampercival.github.io/side-picker/).
- Pages publishes application-only assets from `main` through a workflow gated by automated checks; see [RELEASE.md](RELEASE.md).
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
node --test --test-isolation=none tests/results.test.cjs tests/optimizer.test.cjs tests/access.test.cjs tests/saves.test.cjs tests/rooms.test.cjs tests/repeat-games.test.cjs tests/sharing.test.cjs tests/text-encoding.test.cjs tests/accounts.test.cjs
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tests/keepalive.Tests.ps1
```

For a repeatable host browser fixture with no production database connection, run `node tests/serve-fixture.cjs` and open `http://127.0.0.1:8754/`. Resume the sample session, optimize to see its ban conflict, then unban B for Jordan and optimize to obtain one first choice plus one neutral assignment (50%). Restarting the fixture server resets its shared in-memory data. It supports host/guest tabs and exact-width phone previews; it does not prove database permissions. Use the rolled-back SQL permission tests for that.

The initial review included source/schema inspection, syntax checks, isolated function probes, and mocked browser checks. Subsequent work verified deployed permissions and a real timer-triggered keep-alive. See the plan for private-link rollout evidence. The plan records REL-01 failure/recovery evidence separately from ROOM-01 guest/host reconciliation.

## Maintaining this guide

After relevant implementation, update the current behavior, data model, known-issue table, and validation instructions. Put proposals and outstanding decisions in the improvement plan so future sessions can distinguish implemented features from intentions.

## Room synchronization and release notes

Migration 005 follows migrations 001–004 and must run once. It adds a private room lock and revision, submission source, a reconciliation trigger, and room control operations; it keeps the versioned save wrapper private and accessible only through the public capability API. `side_picker_private.before_room_lifecycle` preserves the pre-migration sessions, rooms, and picks. Reload older browser tabs after this release: guest writes now require the room and pick revisions returned by a fresh read.

A submitted player may leave every faction neutral. Host status distinguishes waiting, submitted, edited since submission, and organizer updated. Guest updates merge into untouched choices when the host saves. Competing edits are rejected rather than silently choosing a winner; recover a host draft as a separate game or explicitly choose which guest choices to keep. Guest drafts remain in the open tab only; they are not durable across refresh until submitted.

Polling runs every three seconds while visible and refreshes when connectivity or visibility returns. Room locks and publication are enforced by the database, even if a guest tab is stale. A closed room still allows drafting choices locally but disables submission. Organizer setup changes invalidate old requests; removed players and replaced invitations stop working. Private player IDs survive renaming.

Run `supabase/tests/room_lifecycle.sql` in the SQL editor after migration 005, alongside `private_links.sql`, `reliable_saves.sql`, and `game_permissions.sql`. The first three use isolated transactions that roll back their sample data. Never rerun an old migration over the newer API wrappers.

### Optimizer performance checks

Run `node tests/optimizer.bench.cjs` for 100-player/100-faction neutral, shared-rank, and constrained cases under both goals. Development budgets are under 2 seconds per solve and under 32 MiB peak process RSS growth across the benchmark (including runtime/JIT overhead). On this Windows machine on 2026-09-26, all six cases took 10.6–32.7 ms and peak RSS grew 7.3 MiB. Browser/device performance varies; the worker watchdog is a separate 15-second safety limit. The normal Node suite also checks 400 independent exhaustive-reference comparisons, maximum-size neutral assignments, variable tie outcomes, cancellation, and both worker failure paths.

## Phone and keyboard interaction

Ranking buttons are 44px and provide the complete no-drag workflow. Touch dragging starts only on the visible grip; swiping the rest of a row can scroll normally. Cancelling a touch drag restores the prior choices. Desktop drops stay within the same player. Empty ranking sections remain visible drop targets with a compact None label.

Views reset scrolling and focus their heading. Organizer navigation records view/session identity in browser history state, without putting private links in URLs; Back/Forward restore screens and preserve the existing save rules. Modals have accessible names, trap focus, make the background inert, support Escape, and restore focus to their opener. Ranking actions preserve focus and announce their result. Reduced-motion preferences shorten animation. Room polling avoids rebuilding unchanged invitation buttons or repeatedly announcing unchanged connection text.

Validated with isolated 360px/390px iframe previews and a desktop browser: readable Add Player, keyboard ranking/submission, Help focus trap/Escape restoration, browser Back between setup and picks, room dialog, long result names, and reconnect catching up to published results. Both phone previews had no horizontal page overflow. Physical-device touch gestures were not emulated by the browser-control tools; the grip-only gesture path remains a useful real-phone spot check.

## Repeat sessions and bulk entry

Every session card offers **Repeat session**. The name can be changed before creation. It copies the game title, factions, and player display names into an independent saved session; choices, bans, submission metadata, locks, results, room code, and old player IDs are cleared. The new room gets its own invitations. The original session is untouched.

**Paste faction list** and **Paste player list** accept one name per line or comma-separated names. A preview reports additions and duplicates. Names are trimmed; matching is case-insensitive with Unicode normalization. Existing entries are preserved; exceeding 100 entries or 500 characters per name rejects the entire pasted list. This is simple name entry, not a quoted CSV importer. Single-player entry still permits intentionally distinct people with the same display name; each has a unique ID.

## Comparing and sharing results

**Compare and assign** closes live picking, synchronizes submissions, and calculates both goals. Expand each preview for assignments, then publish the chosen goal. Cancelling leaves picking closed until explicitly reopened. A changed setup or pick invalidates the preview; publication never silently uses stale choices. Tied outcomes can differ even when the two goals reach the same scores.

The room dialog has a QR disclosure for its viewing invitation. Copying a personal invitation switches the QR and label to that player; copying the viewing invitation switches back. QR generation runs entirely in the browser using a pinned, vendored MIT library; private links never go to an external QR service. A personal QR grants exactly the same permission as its personal link, so share it with that player. Guest identity remains in the current tab's session storage after the fragment is removed.

Share Results provides a read-only snapshot link and a plain-text summary containing the session/game, selected goal, percentage, and each assignment with its explanation and points. Clipboard failure selects the summary for manual copying.

Optional independent QR verification: obtain `dist/jsQR.js` from the npm `jsqr@1.4.0` package, keep it outside tracked files (for example `.local/qr-decoder.cjs`), and run `node tests/qr-roundtrip.cjs .local/qr-decoder.cjs`. It decodes the actual canvas pixel output for viewing/personal/encoded-identity URLs. This decoder is test-only and is not loaded by the app.

## Repeatable release entry point

Run `node scripts/check.cjs` with Node 24 and PowerShell for all offline syntax, regression, and keepalive checks. [RELEASE.md](RELEASE.md) records the repeatable browser acceptance matrix, SQL checks, migration/backups, pinned dependency updates, and gated Pages release procedure. Browser and database checks remain explicit separate steps.

## Optional accounts

Accounts add a layer on top of organizer keys; they never gate games or invitations. A workspace can hold several hashed keys: its shareable organizer link and per-device keys created when a signed-in owner's device signs in. While signed in, a browser always shows the account's single set of games; local games are added (merged) or kept separate by choice and return on sign-out. Players can save personal invitations to their account. Adding games to an account requires this browser's valid organizer key, and a workspace has one owning account. Replacing a link while signed in as the owning account replaces only that key; any other replacement resets all keys and account ownership, as before accounts. Sign-out deletes this browser's device key and starts an empty workspace; unlinking and account deletion keep existing keys working. The client shows accounts only when `config.js` lists a provider. Full design, one-time provider setup, and checks are in [ACCOUNTS.md](ACCOUNTS.md).

## Joining from the group link

In the live room dialog, **Let players join from the group link** turns the room's group (viewing) link into a way to join. The organizer sets **Players from N to M**. M cannot exceed the number of factions, and the server caps seats there anyway. N is a soft minimum: **Compare and assign** asks for confirmation below it. A person opening the group link while joining is on sees the seats taken and a name box. Names are trimmed, limited to 60 characters, and must be distinct ignoring case. Joining is refused when the session is full, picking is closed, or results are published.

A join writes the player straight into the session (flagged `joined`) and records it in `side_picker_private.room_joins`, so it works while the organizer is offline. The joiner receives the normal personal invitation, and the page reloads under it. The tab remembers them, and they are offered **Copy my personal link** and, if accounts are on, sign-in. The organizer's room poll adds unseen joiners to the editor and saves them. Until the organizer's device has saved a joiner, an older player list saved by the organizer keeps that joiner instead of dropping them. Removing a joined player first acknowledges the join, so the removal sticks. Migration 008 implements this; `supabase/tests/room_joins.sql` covers it.
