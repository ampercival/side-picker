# Side Picker improvement plan

Created: 2026-09-26. Last updated: 2026-09-26.

Status: implementation in progress; commit and push after each improvement as requested by the user.

## Goal and scope

Make Side Picker reliable for occasional game nights: keep Supabase active, protect saved data, produce trustworthy assignments, and make host/guest use comfortable on phones. Retain the lightweight static application unless a concrete requirement justifies changing it.

The user authorized starting this plan on 2026-09-26, with a commit and push after each improvement. The user then selected a local script for the daily Supabase check. Material unresolved identity decisions remain recorded below; do not confuse proposed features with completed implementation or external activation.

Read [APP_GUIDE.md](APP_GUIDE.md) for current behavior. Follow [AGENTS.md](../AGENTS.md) for session continuity.

## Current handoff

- **Completed:** initial review and durable documentation.
- **Implementation tasks completed:** SEC-01 (safe result links), OPS-01 (local daily database check), and OPT-01 (strict bans, conflict explanations, consistent input snapshots, result summaries).
- **Next action:** SEC-02 awaits the user's organizer email address (asked in the active task). Email sign-in links are the stated default unless the user prefers Google. Dashboard access is available after the user's sign-in; read-only inspection confirms unrestricted anonymous policies on all four tables, with 3 sessions in 1 workspace, 2 presets, 0 submissions, and 0 Auth users. Bind the existing workspace through an administrator-controlled migration after verifying the organizer account. Keep the health read working or migrate it to a dedicated health table.
- **Recommended first release:** SEC-01, OPS-01, SEC-02, REL-01, OPT-01, ROOM-01, UX-01, and the supporting ENG-01 checks.
- **Dependencies:** SEC-02's ownership and player-identity decisions affect REL-01 and ROOM-01. Coordinate schema changes instead of migrating the same identities repeatedly. ENG-01 should grow alongside fixes, not wait until the end.
- **External state:** SEC-01 pushed as `2c72a21`, OPS-01 as `ce280b0`, OPT-01 as `27bbdd6`. GitHub Pages reports the optimizer commit built; live invalid-link recovery and the new result summary verified. Windows task `Side Picker Supabase Keepalive` is installed; a real timer-triggered run returned 0 and completed three validated reads on 2026-09-26 at 17:39 Atlantic. Next daily run: 2026-09-27 at 09:17 Atlantic. No production schema migration performed.
- **Working state:** all three improvements committed and pushed separately; final rollout notes recorded. Signed-out keep-alive execution is not supported by the selected Interactive principal.

## Decisions to settle during planning

| Decision | Recommended starting point | Status |
| --- | --- | --- |
| Daily scheduler | Local PowerShell script with Windows Task Scheduler, daily plus sign-in catch-up | User selected local script on 2026-09-26; requires this computer on, signed in, and connected |
| Organizer identity | Supabase Auth with ownership enforced by RLS; preserve existing sessions through a deliberate migration | Email sign-in links stated as default; awaiting owner email/any Google preference; legacy owner binding remains pending |
| Guest identity | Keep joining simple, but enforce scoped room/player access using validated identity or a server-checked token | Proposed; mechanism unresolved |
| Bans | Hard exclusions; explain infeasible assignments rather than silently forcing a ban | Implemented in OPT-01 |
| Unsaved edits | Small durable pending-edit store with visible sync status; database remains authoritative for acknowledged saves | Proposed; do not silently replace the cloud model with local-only storage |
| Room stages | Collecting, locked, published, with explicit reopen | Proposed |
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

- [x] Define a tiny database-backed health query without personal data: select at most one `sessions.updated_at`. A separate health table is deferred until administration access/SEC-02; no private row fields are fetched or logged.
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
- [ ] Choose organizer authentication and a safe ownership-claim process for existing data. Knowledge of a publicly readable workspace label alone must not establish ownership.
- [ ] Introduce stable session/player identifiers where needed, retaining display names as editable labels.
- [ ] Replace unrestricted anonymous table access with enforced organizer ownership and narrow guest access.
- [ ] Restrict a guest to authorized room data and their permitted submission; prevent arbitrary player impersonation, room enumeration, and unauthorized result edits/deletes.
- [ ] Validate submission membership, allowed factions, duplicate/overlapping choices, room state, and payload limits on the backend.
- [ ] Apply a versioned, recoverable migration with backup and compatibility checks for existing sessions and room links.

**Acceptance:** two separate organizers cannot read or mutate each other's private data through direct API calls; guests cannot change another player's picks or host data; intended room/result sharing still works. Test negative permission cases using isolated fixtures. Record migration application and deployment separately from code completion.

### REL-01 — Reliable saves and session switching

- [ ] Have database helpers return/throw failures so callers cannot announce successful operations after errors.
- [ ] Track pending/saving/saved/failed states and keep failed edits retryable.
- [ ] Capture the correct session/workspace identity and immutable data for each pending write.
- [ ] Flush or preserve edits before refreshing caches, changing sessions/workspaces, or navigating home. Do not depend on an asynchronous `beforeunload` request finishing.
- [ ] Add durable recovery for pending edits, with isolation by workspace/session and an explicit reconciliation policy.
- [ ] Prevent stale responses and concurrent host edits from silently replacing newer state.
- [ ] Make preset rename safe when the replacement save fails; avoid deleting the only saved copy first.

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

- [ ] Track explicit submission status separately from whether neutral factions remain.
- [ ] Distinguish unsubmitted, submitted, and edits since submission; clear misleading submitted feedback after editing.
- [ ] Implement the agreed room lifecycle and enforce submission locking on the backend.
- [ ] Use stable player IDs instead of names as submission identity; protect against stale responses when switching selected players.
- [ ] Reconcile host edits and guest submissions consistently, including when the host was offline.
- [ ] Refresh state after reconnect and show connected/reconnecting/offline states honestly.
- [ ] Update guest faction lists, roster/name choices, and removed-player handling when the host changes setup.

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
