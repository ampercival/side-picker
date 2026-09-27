# Side Picker improvement plan

Created: 2026-09-26. Last updated: 2026-09-26.

Status: implementation in progress; commit and push after each improvement as requested by the user.

## Goal and scope

Make Side Picker reliable for occasional game nights: keep Supabase active, protect saved data, produce trustworthy assignments, and make host/guest use comfortable on phones. Retain the lightweight static application unless a concrete requirement justifies changing it.

The user authorized starting this plan on 2026-09-26, with a commit and push after each improvement. The user selected a local script for the daily Supabase check and clarified that anyone must be able to use the app. Keep entry open; do not make email/Google configuration or an owner-account allowlist a prerequisite. Material unresolved access-design details remain recorded below; do not confuse proposed features with completed implementation or external activation.

Read [APP_GUIDE.md](APP_GUIDE.md) for current behavior. Follow [AGENTS.md](../AGENTS.md) for session continuity.

## Current handoff

- **Completed:** initial review and durable documentation.
- **Implementation tasks completed:** SEC-01 (safe result links), OPS-01 (local daily database check), OPT-01 (strict bans, conflict explanations, consistent input snapshots, result summaries), SEC-02 (private organizer/player links and enforced database access), REL-01 (durable drafts, truthful status, safe retries, version-checked saves, and explicit conflict recovery), and ROOM-01 (room stages and safe submission reconciliation).
- **Next action:** OPT-02. Replace factorial assignment enumeration, preserve both objectives, document tie selection and measured limits, and retain worker cancellation. Then continue UX-01. Accounts remain deferred.
- **Scope:** no required sign-in. Private organizer links control one workspace; personal invitations control one player; viewing links are read-only. Three existing sessions and two presets belong to two separate workspaces and have separate recovery links. Optional accounts remain FEATURE-04.
- **External state:** SEC-01 `2c72a21`, OPS-01 `ce280b0`, OPT-01 `27bbdd6`, independent health access `ac3f649`, and SEC-02 `b5cbd3a` are pushed. Pages reports SEC-02 built. Both private-link migrations and legacy bindings are applied; public game-table access is revoked. The live original-game link and post-cutover API/permission checks passed. The local check completed three validated health reads at 22:35:44 Atlantic on 2026-09-26. Daily schedule remains 09:17 plus sign-in catch-up; this computer must be on and signed in.
- **Recovery:** `.local/private-organizer-links.html` contains private buttons for the original games and presets. Keep this ignored local file; never commit it. Database-local pre-upgrade snapshot: `side_picker_private.before_private_links`. Old room invitations require fresh personal/viewing links; public result snapshots still work.
- **Working state:** ROOM-01 implementation and migration are complete; release verification is in progress. REL-01 remains deployed. Continue to OPT-02 after recording the Pages result.

## Decisions to settle during planning

| Decision | Recommended starting point | Status |
| --- | --- | --- |
| Daily scheduler | Local PowerShell script with Windows Task Scheduler, daily plus sign-in catch-up | User selected local script on 2026-09-26; requires this computer on, signed in, and connected |
| Public access | Anyone can create and use a game without an account setup requirement | User clarified on 2026-09-26; supersedes email/Google onboarding work |
| Optional accounts later | Let people manage saved games across devices and recover access, with a safe way to attach existing games | User requested a future TODO on 2026-09-26; FEATURE-04. Do not block current work on provider setup |
| Organizer permissions | Private organizer link using an unguessable capability checked by the backend; preserve saved games through a deliberate migration | Implemented workspace scope, cryptographic token hashes, replacement, and private recovery links; deployment status above |
| Guest permissions | Players join by link without an account; separate guest access from organizer access and scope submissions to the authorized player | Implemented stable player identity and per-player invitations, plus viewing links; no account required |
| Bans | Hard exclusions; explain infeasible assignments rather than silently forcing a ban | Implemented in OPT-01 |
| Unsaved edits | Small durable pending-edit store with visible sync status; database remains authoritative for acknowledged saves | Implemented durable workspace-scoped drafts; cloud saves remain authoritative, stale edits recover as separate copies |
| Room stages | Collecting, locked, published, with explicit reopen | Implemented 2026-09-26; optimizing closes picking first; cancellation leaves it closed until the organizer reopens |
| Expanded features | Prioritize repeat sessions, easier setup, and clearer results after reliability work | Proposed; final selection pending |

Routine implementation choices can be resolved from the user's instructions and current code. Record material choices here with date and rationale.

## Phase 1: close immediate gaps

### SEC-01 — Safe shared-results rendering

- [x] Validate decoded result payloads, versions, rows, finite numeric scores, and reasonable size limits.
- [x] Render supplied values safely as text; remove the score's HTML injection path.
- [x] Show a useful invalid-link state without breaking the rest of the app.

**Acceptance:** valid existing result links still render; malformed, oversized, and markup-containing values cannot inject HTML or execute script; Unicode names work. Add a focused regression check for the reproduced score-field issue.

**Starting points:** `parseResultsFromUrl()`, `decodeData()`, `buildResultCard()`, `enterSharedResultsMode()` in `script.js`.

### OPS-01 — Daily Supabase health check and inactivity mitigation

- [x] Define a tiny database-backed health query without personal data: dedicated `app_health` sentinel, deployed and verified. Replaced the temporary `sessions.updated_at` query on 2026-09-26.
- [x] Provide a small runnable check with timeout, bounded retries, nonzero exit on failure, and expected-response validation. Do not treat any HTTP 200 as sufficient.
- [x] Configure one daily local run and sign-in catch-up that make a few lightweight real database reads. Keep credentials out of logs; do not use a service-role key merely for a public health read.
- [x] Expose failure in logs, last-run state, and the Windows task result; provide `-Status` with 36-hour overdue detection. Scope adjusted for the local script: no independent email/push notification configured.
- [x] Document job owner, provider, schedule/timezone, endpoint, last successful run, and resume/recovery instructions. Store identifiers, not secrets.
- [x] Verify one manual run and at least one scheduled run before marking the operational setup complete.

**Acceptance (updated for the user's local-script choice):** runs without an open browser or repository commits when this computer is on, the task's user is signed in, and networking is available; catches up after missed runs; reports database availability accurately; failures are observable; reads do not modify game data. A prepared script alone is not a completed daily service. Extended computer shutdowns or sign-out remain a limitation.

**Operational guide:** [SUPABASE_KEEPALIVE.md](SUPABASE_KEEPALIVE.md). Daily and logon trigger definitions plus StartWhenAvailable verified; a one-time timer trigger proved actual scheduler execution, then was removed. Tomorrow's daily recurrence and a future sign-in catch-up have not yet occurred. Shutdown/sign-out monitoring requires an external service and is outside this local setup.

**Important limits:** Supabase documents low activity over seven days and says a few database requests daily are typically enough. This is mitigation, not a Free-plan availability guarantee. A paused project must be resumed; a ping does not itself restore it. An internal job in the paused project cannot provide independent recovery or monitoring. GitHub Actions is an alternative, but public-repository schedules can be disabled after 60 days of repository inactivity.

**Sources checked during the 2026-09-26 review:** [Supabase pausing](https://supabase.com/docs/guides/platform/free-project-pausing), [GitHub workflow inactivity](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/disable-and-enable-workflows), [cron-job.org requests and failure notifications](https://cron-job.org/en/faq/). Recheck provider behavior at implementation time.

## Phase 2: protect data and make saving dependable

### SEC-02 — Enforced ownership and guest permissions

- [x] Inspect actual deployed tables/policies and inventory legacy workspaces before designing the migration.
- [x] Move the keep-alive to an independent public, read-only health sentinel before restricting game tables; deploy and verify allowed reads/denied writes.
- [x] Design private organizer links and a safe transfer process for existing data, preserving immediate public use without required email/Google sign-in. Knowledge of a publicly readable workspace label alone must not establish ownership.
- [x] Define organizer-link scope, secure generation, server-side verification, storage, revocation, recovery, and sharing warnings. Treat the link as an editing credential; never include it in guest/result links, logs, or public database reads.
- [x] Introduce stable session/player identifiers where needed, retaining display names as editable labels.
- [x] Replace unrestricted anonymous table access with enforced organizer ownership and narrow guest access.
- [x] Restrict a guest to authorized room data and their permitted submission; prevent arbitrary player impersonation, room enumeration, and unauthorized result edits/deletes.
- [x] Validate submission membership, allowed factions, duplicate/overlapping choices, room state, and payload limits on the backend.
- [x] Apply a versioned, recoverable migration with backup and compatibility checks for existing sessions and room links.

**Acceptance:** two separate organizers cannot read or mutate each other's private data through direct API calls; guests cannot change another player's picks or host data; intended room/result sharing still works. Test negative permission cases using isolated fixtures. Record migration application and deployment separately from code completion.

**Public-use requirement:** a new visitor can create a game immediately. A player can join through an invitation without creating an account. Security must separate organizer, guest, and public-result capabilities rather than restricting the whole app to one owner or requiring sign-in. Any future optional account feature must solve a clear recovery/sync need and must not block these entry paths.

### REL-01 — Reliable saves and session switching

- [x] Have database helpers return/throw failures so callers cannot announce successful operations after errors.
- [x] Track pending/saving/saved/failed states and keep failed edits retryable.
- [x] Capture the correct session/workspace identity and immutable data for each pending write.
- [x] Flush or preserve edits before refreshing caches, changing sessions/workspaces, or navigating home. Do not depend on an asynchronous `beforeunload` request finishing.
- [x] Add durable recovery for pending edits, with isolation by workspace/session and an explicit reconciliation policy.
- [x] Prevent stale responses and concurrent host edits from silently replacing newer state.
- [x] Make preset rename safe when the replacement save fails; avoid deleting the only saved copy first.

**Acceptance:** edit then immediately go home, switch session/workspace, refresh, or lose connectivity; edits are saved or recoverable with honest status. Failed create/delete/rename operations do not show success. Multi-tab conflicts are surfaced or handled according to the documented policy.

**Starting points:** `autoSave()`, `flushSession()`, `goHome()`, `confirmWorkspaceKey()`, `savePreset()` and the database helpers in `rooms.js`.

## Phase 3: trustworthy choices and live rooms

### OPT-01 — Hard bans and understandable outcomes

- [x] Treat bans as unavailable assignment edges by default.
- [x] Detect infeasible assignments and explain which constraints conflict without modifying preferences automatically.
- [x] Preserve both documented optimization goals and their secondary tie-break rules.
- [x] Validate optimizer inputs and calculate/display results from the same input snapshot, even if live picks arrive while solving.
- [x] Show goal, first-choice/top-three/neutral counts, and understandable scoring context.

**Acceptance:** banned factions are never assigned under strict rules; one player banning the only faction fails clearly; competing players with no distinct allowed match fail clearly; ordinary valid assignments remain optimal. Verify small cases against an independent exhaustive reference and verify cancellation.

### ROOM-01 — Accurate submissions and resilient synchronization

- [x] Track explicit submission status separately from whether neutral factions remain.
- [x] Distinguish unsubmitted, submitted, and edits since submission; clear misleading submitted feedback after editing.
- [x] Implement the agreed room lifecycle and enforce submission locking on the backend.
- [x] Use stable player IDs instead of names as submission identity; protect against stale responses when switching selected players.
- [x] Reconcile host edits and guest submissions consistently, including when the host was offline.
- [x] Refresh state after reconnect and show connected/reconnecting/offline states honestly.
- [x] Update guest faction lists, roster/name choices, and removed-player handling when the host changes setup.

**Acceptance:** host and two guest sessions agree on submissions and results; neutral choices do not imply waiting; rename/remove/add operations do not misattribute picks; reconnect catches up; late requests cannot overwrite a different player's selection; published/locked rooms reject disallowed edits.

### OPT-02 — Scalable optimizer

- [ ] Replace factorial enumeration with an appropriate matching/assignment approach, preserving primary and secondary objectives.
- [ ] Avoid retaining all optimal assignments; document how equally optimal outcomes are selected and whether selection is uniform.
- [ ] Keep cancellation responsive and avoid an unbounded synchronous fallback on worker failure.
- [ ] Agree a representative upper bound for players/factions and record a measured time/memory budget.

**Acceptance:** small-case results match the independent reference for both goals; a many-neutral-choice case does not allocate factorially many solutions; large supported examples finish within the agreed budget. Preserve fairness intentionally when changing tie selection.

## Phase 4: phone usability and repeat game nights

### UX-01 — Mobile and accessibility improvements

- [ ] Fix clipped Add Player controls and audit inputs, buttons, notifications, and modals at 360px, 390px, and desktop widths.
- [ ] Enlarge ranking controls and reduce unnecessary scrolling through empty sections.
- [ ] Preserve tap-based ranking while improving touch drag behaviour so normal scrolling is practical.
- [ ] Reset scroll and move focus appropriately when changing views; make browser navigation predictable.
- [ ] Add modal focus management, Escape handling, labels, status announcements, and reduced-motion support.

**Acceptance:** complete host and guest flows without clipped controls; rank without dragging; usable keyboard focus through dialogs and list edits; opening results brings the results into view; long names and error messages remain readable.

### FEATURE-01 — Faster repeat sessions

- [ ] Duplicate a session with the same game/players while clearing picks, results, room code, and submission identities.
- [ ] Add bulk player/faction entry with trimming and duplicate handling.
- [ ] Add reusable player groups if selected for scope.

**Acceptance:** a repeated night is independent of the original, and old guest links cannot submit to the new session.

### FEATURE-02 — Sharing and result comparison

- [ ] Add a room QR code and remember guest identity within the agreed permission model.
- [ ] Preview both optimization goals before publishing one outcome.
- [ ] Add concise share/copy output with the selected goal and assignment explanations.

**Acceptance:** previews do not publish prematurely; QR codes resolve to the correct room; shared snapshots clearly identify their context.

### FEATURE-03 — History and rotation fairness (later)

- [ ] Preserve earlier rounds/results without overwriting them on reopen.
- [ ] Consider optional avoidance of repeated faction assignments across game nights.

**Acceptance:** history is immutable or versioned, and optional rotation rules never silently override bans or the declared optimization goal. Agree scoring trade-offs before implementation.

### FEATURE-04 — Optional accounts for managing games (later)

- [ ] Add an optional account and a "My games" view for finding, organizing, and resuming saved games across devices.
- [ ] Let an organizer attach existing games/workspaces only after proving control through the private organizer link; never claim data using a public workspace label or matching display name.
- [ ] Provide account recovery and a clear way to manage/revoke organizer links without losing saved games.
- [ ] Choose sign-in providers and configure reliable email delivery when this feature is implemented; email and Google remain options, not current prerequisites.
- [ ] Preserve immediate account-free game creation and guest participation; explain the benefits of an account without forcing one.

**Acceptance:** an account holder can find and manage their games on another device; linking preserves the original sessions and permissions; another account cannot claim those games; people who skip accounts can still create and join games.

**Requested:** 2026-09-26. Deferred until the security and reliability foundation is in place.

## Supporting engineering work

### ENG-01 — Focused checks and maintainability

- [ ] Add a small, repeatable test entry point for optimizer invariants, payload validation, save races, and permission checks as those areas change.
- [ ] Add isolated host/guest browser checks for critical workflows and narrow layouts.
- [ ] Separate solver, storage, and view responsibilities where needed to make changes testable; a framework rewrite is not required.
- [ ] Pin external runtime dependencies or document the chosen update strategy.
- [ ] Document setup, migrations, release verification, and backup/recovery. Add automated checks before deployment where appropriate.

**Acceptance:** another session can reproduce the relevant checks from documented commands; tests exercise behaviour rather than copy implementation; live verification is recorded separately from mocked tests.

## Completion and handoff rules

For each task, record implementation files, validation evidence, remaining limits, and commit/deployment references if available. Leave external activation or scheduled-run verification unchecked until it actually happens. Do not claim that a full suite passed when only focused checks ran.

At the end of each implementation session, update Current handoff and append a dated Work log entry. Keep this file as the single progress record; do not create competing TODO lists.

## Work log

### 2026-09-26 — Initial review and documentation

- Reviewed the application source/schema at baseline `2fae186`.
- Confirmed public GitHub Pages hosting from `main` root and a successful read-only Supabase probe.
- Reproduced forced banned assignment, the neutral/submitted mismatch, a pending-save cache replacement scenario, and harmless HTML injection through a result score.
- Confirmed 40,320 stored ties for eight neutral players/factions.
- Exercised host optimization, guest picking/submission, and results with isolated mock data; inspected 390px phone layouts. Real multi-device Realtime and deployed RLS were not verified.
- Added this plan, the application guide, and the root entry point for future sessions. No application fixes, production writes, migrations, or scheduler activation performed.

### 2026-09-26 — SEC-01 implemented

- Added `results.js` for bounded v1 payload validation, UTF-8/Base64 handling, and text-only card rendering. Unknown fields are discarded. Legacy negative scores remain displayable.
- Invalid shared links now show a recovery screen instead of initializing an organizer workspace. Saved/room results also pass validation before display.
- Validation: all five tests pass with `node --test --test-isolation=none tests/results.test.cjs`; JavaScript syntax checks pass. Default test isolation was blocked by the environment's child-process permission, so the tests ran without child isolation.
- Browser validation: invalid-link recovery and a valid Unicode v1 link both rendered correctly with local static hosting; no database writes used.
- Commit/push and live verification follow this entry. Next: OPS-01 local daily check, as selected by the user.

### 2026-09-26 — OPS-01 local check installed and verified

- User selected a local script rather than an external scheduler. Added PowerShell 5.1-compatible check, registration script, ignored runtime state, isolated tests, and an operations guide.
- Query uses only the existing public publishable key and a one-column/one-row read. No schema changes, secrets, or session writes are required.
- Validation: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File tests/keepalive.Tests.ps1` passed response, retry, deduplication, recovery, overdue, and log-redaction checks. Real manual run succeeded at 17:36 Atlantic.
- Installed task under Windows user Owner, Interactive/Limited, hidden PowerShell, daily 09:17 Atlantic plus logon +2 minutes, StartWhenAvailable and bounded failure restarts.
- Actual timed run started 17:39:07 Atlantic, completed three database reads at 17:39:11, and returned `LastTaskResult = 0`. Removed the temporary verification trigger; daily and logon triggers remain. Runtime evidence is local in `.local/supabase-keepalive/`.
- SEC-01 commit `2c72a21` is pushed; GitHub Pages reports built and the deployed invalid-link view was verified in the browser.
- Limits: cannot run while off/signed out; local status rather than independent notifications; dedicated health table deferred to the access-policy migration. Next task is SEC-02.
- SEC-02 access check reached the Supabase sign-in page; requested dashboard sign-in and organizer sign-in preference. No production permissions changed. OPT-01 can proceed independently while that is pending.

### 2026-09-26 — OPT-01 implemented; SEC-02 inventory verified

- Extracted the solver into `optimizer.js`. Added input validation and a matching feasibility check that identifies players with too few mutually available factions; removed forced-ban fallback.
- Solving uses an immutable input snapshot. Setup/pick/session changes invalidate a pending result before it can be displayed or published. Worker helpers and cancellation remain covered.
- Results show the goal, first/top-three/unranked/neutral counts, and preference-score context. Historical negative-score snapshots remain readable.
- Validation: 11 Node tests pass, including 400 comparisons to an independent exhaustive reference over both goals, input rejection, strict bans, worker-source execution/cancellation, snapshot guards, and result-link regressions. Local browser fixture verified conflict explanation and successful assignment after unbanning one choice, with the correct 50% summary. Syntax/diff checks passed.
- Added `tests/serve-fixture.cjs` for repeatable isolated browser checks without a production connection. The exhaustive solver's tie-memory/performance issue remains OPT-02; this change does not claim to solve it.
- User signed into Supabase. Read-only catalog query verified `users_all`, `sessions_all`, `presets_all`, and `submissions_all`: role anon, command ALL, using/check true. Inventory: 3 sessions, 1 session workspace, 2 presets, 0 submissions, 0 Auth users. No raw game records exported and no schema/policy changes made.
- SEC-02 next needs the organizer sign-in choice and a verified organizer account to bind existing workspace ownership. Do not assign legacy ownership based solely on its public label.

### 2026-09-26 — Release verification and next-session handoff

- All three improvements were pushed separately to `main`: `2c72a21`, `ce280b0`, `27bbdd6`.
- GitHub Pages reports `27bbdd6` built; the live site displays Unicode result snapshots, goal, Preference Score, and the new choice breakdown. Application write testing used the isolated fixture only.
- The plan and app-guide links were checked; no runtime logs or state files were committed.
- Requested the email address that should own the existing workspace. Email sign-in links are the stated default unless the user chooses Google. Keep the current app working until the migration, backend rules, and new sign-in flow are prepared and verified together.

### 2026-09-26 — Public access clarified; account setup stopped

- User clarified: "I want anyone to be able to use the app." Required account onboarding is no longer the proposed entry flow. Earlier Google/email setup questions are superseded.
- Explained the actual security issue: open use is desirable; unrestricted modification/deletion of other organizers' saved games is not. Proposed private organizer links and separately scoped guest invitations with backend enforcement.
- Supabase inspection found Email enabled, Google disabled with no client configured, and custom SMTP disabled. These settings were read only. No provider changes, sign-in emails, Auth users, or ownership migration were created during this exploration.
- Removed the uncommitted sign-in-page prototype. No authentication UI was deployed. Do not ask the user to complete Google Cloud or email-sender setup to continue the public app improvements.
- Updated this plan and the application guide. SEC-02 remains incomplete; the next implementation must preserve immediate public use while protecting individual games. Earlier deployed improvements and the local keep-alive remain in place.

### 2026-09-26 — Future accounts recorded; health access separated from games

- Added FEATURE-04 at the user's request: optional accounts, My games, cross-device management, verified attachment of existing games, recovery, and retained account-free entry.
- Applied additive migration `202609260001_public_health.sql` after confirming no existing table conflict. Its single `ok` row is public-read-only; existing game records and their policies are unchanged.
- Changed the local check to require exactly the health sentinel. Empty/malformed/unexpected replies fail. Versioned the success marker so an earlier timestamp-based check cannot suppress verification of the new endpoint.
- Validation: Windows PowerShell 5.1 regression checks passed, including malformed/empty/surplus fields, retry bounds, log redaction, old-marker transition, deduplication, and recovery. Deployed transactional role checks passed for anonymous reads and rejected insert/update/delete/truncate, plus authenticated reads and absence of mutation grants.
- Launched the existing Windows scheduled task through Task Scheduler. It completed three real sentinel reads at 18:09:24 Atlantic with `LastTaskResult = 0`; next daily run remains 09:17. This was a scheduler-launched verification, not another observed daily timer recurrence.
- SEC-02 is still in progress. Remaining work is the private organizer/player access model, data-preserving cutover, browser flows, and negative permission tests for game records. No sign-in requirement added.

### 2026-09-26 — SEC-02 prepared and stage-one API applied

- Implemented private organizer workspaces, personal player invitations, viewing links, replacement/revocation, and account-free creation. Links use random capabilities in fragments; backend stores hashes/seeds in an inaccessible private schema. Full architecture and recovery are in PRIVATE_LINKS.md.
- Deployed stage-one migration and created a database-local snapshot. Bound two legacy workspaces through administrator-selected hashes: three sessions in one, two presets in the other. Raw recovery tokens exist only in ignored local files. Old public room links require fresh personal invitations.
- Deployed rolled-back SQL tests passed organizer isolation, player impersonation denial, viewer write denial, unknown rooms, input validation, neutral submissions, stable identity through rename, published locking, removal, and token/link replacement. Real recovery RPCs returned only the expected 3 sessions / 2 presets.
- Isolated browser checks exercised host and two guests through invitations, neutral submission, edited acknowledgement, shared picks, optimization and published results. Exact-width iframe previews checked organizer controls at 390px and successful guest ranking/submission at 360px. Remaining general mobile issues stay UX-01.
- All 15 Node regressions and JavaScript syntax/diff checks passed. New tests cover link parsing/credential separation, queued immutable saves, denied writes, and cross-tab workspace identity. Browser mocks do not establish database permissions.
- Switched room synchronization to capability-scoped polling every three seconds while visible. Added serialized writes, navigation flushes, failure returns and safer preset rename; durable offline recovery and concurrent-host resolution remain incomplete.
- Next release step is client deployment followed by stage-two removal of old table grants, post-cutover checks, and final rollout evidence.

### 2026-09-26 — SEC-02 deployed and activated

- Committed/pushed `b5cbd3a`; GitHub Pages reports built. The deployed app imported the original organizer recovery link and displayed all three existing games. Reload after restricting tables still displayed those games.
- Before cutover, a read-only database assertion validated every legacy session against the new input rules and compared all saved sessions/presets against the pre-upgrade snapshot (ignoring only the new session UUID). Passed: 3 sessions, 2 presets, 2 bound workspaces.
- Applied `202609260003_lock_game_tables.sql`: all direct grants revoked from public/anon/authenticated on users, sessions, presets, submissions; permissive policies removed; RLS retained. No saved records deleted or rewritten during the cutover.
- Re-ran transactional private-link fixtures after cutover and added `supabase/tests/game_permissions.sql`. Passed: public roles have no direct read/write/truncate grants, private schema is hidden, RLS is on, scoped RPCs remain available. All isolated test records rolled back.
- Independent HTTP checks returned permission-denied for all four game tables and an invalid organizer token. Both real legacy capabilities returned only their expected data (0 sessions/2 presets; 3 sessions/0 presets). The independent health sentinel passed, followed by a manual forced local-script run with three validated reads at 22:35:44 Atlantic.
- Isolated browser also confirmed a viewing link has no submission controls and a separate workspace starts empty without sign-in. Existing private recovery links are in the ignored local HTML file; preserve it or save the links privately. New tokens were not committed.
- SEC-02 is complete. Next: REL-01. Save recovery, multi-host conflict handling, full room lifecycle, and remaining phone controls are deliberately still unchecked.

### 2026-09-26 — REL-01 implementation and preflight

- Added a synchronous local draft journal before debounce, visible pending/saving/saved/failed/conflict states, explicit retry, background reconnect retry, bounded requests, and independent draft IDs across tabs. Credentials are not duplicated into drafts. Reload recovery creates a separate game/preset; cloud originals are never silently overwritten.
- Added UUID save versions and idempotent operation receipts. Stale saves/deletes are rejected. Receipt retry cannot overwrite a newer save. Preset rename checks source and destination versions and commits atomically. The older unchecked-write implementation becomes private; old app tabs must refresh.
- Navigation retains durable drafts on failure. Result publication/reopening now distinguishes local results from successfully saved room changes. Storage failures warn and block unsafe editor navigation. Preset edits are journaled when Save is pressed.
- 22 focused Node checks pass. Isolated browser verified edit then immediate home while disconnected, refresh recovery, saving a separate copy with the actual changed choices, and a stale second tab retaining its edit without overwriting the first tab. Recovery controls fit a 360px iframe preview.
- Database rollback-only preflight passed: blind writes denied, stale saves/deletes denied, duplicate request idempotency, changed retry rejection, failed rename preserving both records, atomic rename success/retry, and private legacy API restrictions. Migration and fixtures rolled back together; external activation is still pending.

### 2026-09-26 — REL-01 activation and release correction

- Applied the save migration with a database-local snapshot of sessions/presets. Post-migration reliable-save tests, private-link regressions, direct-access assertions, and a comparison of all original game/preset fields passed. Transactional fixtures rolled back. Both real legacy workspaces still load and the health sentinel passes.
- Initial client commit `2fcab52` pushed, but Pages failed because the new work-log heading contained a Windows-encoded dash. Corrected the plan to UTF-8 and checked all tracked text files for valid UTF-8; do not treat the failed deployment as live.
- Added a final workspace-navigation guard: a slow initialization or load response cannot replace a workspace opened afterward. A dedicated regression passed; total focused Node checks now 23.

### 2026-09-26 - REL-01 verified release

- Pages successfully built `d4087bc` after the encoding correction. Live browser verification showed All changes saved and all three original sessions. No real game edits were used for the live check.
- The migration is applied. Reliable-save tests, updated private-link tests, direct-access checks, and pre/post migration data comparisons all passed in Supabase. HTTP checks confirmed both legacy workspaces (3 games and 2 presets), denied direct table access, denied an invalid organizer token, and the independent health sentinel.
- All 24 focused Node checks pass, including the new delayed-workspace response regression and a strict UTF-8/line-ending guard to prevent another documentation build failure. JavaScript syntax and final diff checks passed. Documentation line endings are normalized.
- REL-01 is complete. Recoveries intentionally save separate copies; do not replace this with automatic replay/merge without designing conflict handling. Local drafts require retaining browser storage; unsubmitted preset form text is not backed up until Save. Guest-versus-host choice reconciliation remains ROOM-01.

### 2026-09-26 — ROOM-01 implemented

- Added explicit collecting/locked/published room stages; the organizer can close/reopen picking, and optimization locks and synchronizes submissions before taking its snapshot. Clearing published results reopens picking. Cancelling or failing optimization leaves picking closed with a visible reopen control.
- Migration `202609260005_room_lifecycle.sql` preserves a private snapshot and enforces stage/setup/pick revisions. Neutral submissions are valid. Untouched host choices receive guest updates; competing offline edits fail with a recoverable draft. A deliberate host override is shown to that guest and no longer claims the guest submitted those choices. Private capabilities and save receipts remain enforced.
- Clean guest editors receive organizer changes; dirty editors preserve local choices and offer Use saved choices / Keep my edits before submission. Late replies are scoped to the current room. Removed/revoked players lose their editor. Reconnect/return-to-tab starts a fresh poll; status distinguishes offline from retrying.
- Validation: 28 Node checks pass, including four new behavioral room checks. Supabase rolled-back migration trial passed room lifecycle, private links, reliable saves, and permission suites. Isolated host plus two guest tabs verified neutral submission, locking, identical published assignments, reopening, and explicit resolution of competing guest/host edits. Guest layout inspected at 360px.
- Migration application and all four post-deployment SQL suites succeeded; original three games and two presets are unchanged. Pages verification follows the commit. Browser fixture is a mock; deployed database assertions are separate evidence. No original games were used for write-heavy tests.
