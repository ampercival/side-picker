# Side Picker improvement plan

Created: 2026-09-26. Last updated: 2026-09-27.

Status: selected core improvements implemented, committed, pushed, and verified live. FEATURE-04 optional accounts is in progress: code, migration, and tests prepared; database and provider activation pending. Other later features remain deferred.

## Goal and scope

Make Side Picker reliable for occasional game nights: keep Supabase active, protect saved data, produce trustworthy assignments, and make host/guest use comfortable on phones. Retain the lightweight static application unless a concrete requirement justifies changing it.

The user authorized starting this plan on 2026-09-26, with a commit and push after each improvement. The user selected a local script for the daily Supabase check and clarified that anyone must be able to use the app. Keep entry open; do not make email/Google configuration or an owner-account allowlist a prerequisite. Material unresolved access-design details remain recorded below; do not confuse proposed features with completed implementation or external activation.

Read [APP_GUIDE.md](APP_GUIDE.md) for current behavior. Follow [AGENTS.md](../AGENTS.md) for session continuity.

## Current handoff

- **Completed:** review/documentation and SEC-01, OPS-01, OPT-01, SEC-02, REL-01, ROOM-01, OPT-02, UX-01, FEATURE-01 core repeat/bulk entry, FEATURE-02, and ENG-01. Each improvement has its own pushed commit.
- **Current release:** ENG-01 `0ea2704`; Checks and Pages run `36289848720` succeeded. FEATURE-02 `a952f95` and FEATURE-01 `87d3b20` also deployed successfully. The new release workflow gates deployment on passing checks and publishes application assets only.
- **Live verification:** the exact pinned Supabase 2.117.2 script loaded with integrity checking; the original TmpTest, Night B, and Reopen Test games remain visible with their original timestamps. Read-only resume showed bulk entry, room stage, and Compare & Assign. Returned to Sessions; no browser errors. No production game edits used for final verification.
- **Validation:** 38 Node tests, JavaScript syntax, offline PowerShell health-script tests, independent QR decoding, optimizer benchmarks, and scoped host/guest phone/desktop checks passed. Migration 005 is applied; the deployed SQL suites and preservation assertions passed. Browser mock tests, deployed database tests, and live checks are recorded separately in the work log.
- **FEATURE-04 (in progress, 2026-09-27):** optional Discord/Google accounts are implemented in `accounts.js`, migration `202609270006_accounts.sql`, `supabase/tests/accounts.sql`, `privacy.html`, and [ACCOUNTS.md](ACCOUNTS.md). 44 Node checks and the isolated fixture pass. The client ships dormant: `accountProviders` is empty, so the live app shows no account controls. Migration 006 is **applied and verified** on production (2026-09-27) after a clean slate the user chose. **Not yet done:** Discord and Google provider setup, enabling providers in `config.js`, and live sign-in verification.
- **Migration 007 is applied and verified (2026-09-27)**, and the matching client (account games on every device, saved player invitations, home **Manage games**) is pushed with it. GitHub is now enabled too. Next: live checks of the new flows and GitHub sign-in with the user (RELEASE.md accounts row), then Discord setup.
- **Earlier status:** Supabase URL configuration is done (Site URL and one redirect, both the Pages address). Sign-ups are allowed, anonymous sign-ins and manual linking are off, and Email is still enabled pending the user's choice. Google is configured: Google Cloud project "Side Picker" with External audience, published with only basic scopes and no logo; web client origin `https://ampercival.github.io` with the Supabase callback. It is enabled in Supabase and listed in `config.js`. Next: verify live Google sign-in with a throwaway workspace (ACCOUNTS.md step 8), then Discord and GitHub. The user creates the provider apps and pastes the client secrets into Supabase; Claude can fill the non-secret fields. Then list the providers in `config.js`, check, push, and run ACCOUNTS.md step 7 with a throwaway workspace. Follow ACCOUNTS.md setup steps 2–7. The provider client secrets must be entered by the user. Other deferred items (player groups, history/rotation) are unchanged. A physical-phone touch spot check remains useful.
- **Scope:** anyone can use the app without signing in. Private organizer links control one workspace; personal invitations control one player; viewing links are read-only. Existing games and presets belong to two separate workspaces. Optional accounts are FEATURE-04 and never gate these paths.
- **Operations:** local daily Supabase task is Ready; last scheduled result is 0 and next run was verified as 2026-09-27 at 09:17 Atlantic. The most recent real health-script success remains 2026-09-26 at 22:35 Atlantic. It requires this computer on, signed in, and connected; future daily recurrence is not yet observed. No external monitor is installed.
- **Recovery:** the production database was reset to a clean slate on 2026-09-27 at the user's request. No games, presets, workspaces, or older migration snapshots remain, and `.local/private-organizer-links.html` no longer opens anything. `side_picker_private.before_accounts` exists but is empty. There is still no off-project backup; take one before future schema changes once real games exist. Keep it private and preserve it. Database migration snapshots are documented in RELEASE.md; they are not off-project disaster backups. Old pre-cutover room invitations require replacement.

## Decisions to settle during planning

| Decision | Recommended starting point | Status |
| --- | --- | --- |
| Daily scheduler | Local PowerShell script with Windows Task Scheduler, daily plus sign-in catch-up | User selected local script on 2026-09-26; requires this computer on, signed in, and connected |
| Public access | Anyone can create and use a game without an account setup requirement | User clarified on 2026-09-26; supersedes email/Google onboarding work |
| Optional accounts | $0 to run: Supabase Auth with Google, Discord, and GitHub only (no email, which would need a paid sending domain; no Apple, which needs a paid developer program). Accounts sit on top of organizer keys: attach by proof of a valid key, one owning account per workspace, hash-only per-device keys, sign-out removes this browser's key | User asked for a zero-cost optional design on 2026-09-27, accepted the recommendation (Discord + Google, single owner) with "let's try it", then asked to add GitHub (also free, no email). People without either provider keep using links |
| Organizer permissions | Private organizer link using an unguessable capability checked by the backend; preserve saved games through a deliberate migration | Implemented workspace scope, cryptographic token hashes, replacement, and private recovery links; deployment status above |
| Guest permissions | Players join by link without an account; separate guest access from organizer access and scope submissions to the authorized player | Implemented stable player identity and per-player invitations, plus viewing links; no account required |
| Bans | Hard exclusions; explain infeasible assignments rather than silently forcing a ban | Implemented in OPT-01 |
| Unsaved edits | Small durable pending-edit store with visible sync status; database remains authoritative for acknowledged saves | Implemented durable workspace-scoped drafts; cloud saves remain authoritative, stale edits recover as separate copies |
| Room stages | Collecting, locked, published, with explicit reopen | Implemented 2026-09-26; optimizing closes picking first; cancellation leaves it closed until the organizer reopens |
| Expanded features | Repeat sessions, bulk setup, goal comparison, QR and result sharing | Core implemented; optional player groups/history/rotation remain deferred |

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

- [x] Replace factorial enumeration with an appropriate matching/assignment approach, preserving primary and secondary objectives.
- [x] Avoid retaining all optimal assignments; document how equally optimal outcomes are selected and whether selection is uniform.
- [x] Keep cancellation responsive and avoid an unbounded synchronous fallback on worker failure.
- [x] Set a representative upper bound for players/factions and record a measured time/memory budget.

**Acceptance:** small-case results match the independent reference for both goals; a many-neutral-choice case does not allocate factorially many solutions; large supported examples finish within the agreed budget. Preserve fairness intentionally when changing tie selection.

## Phase 4: phone usability and repeat game nights

### UX-01 — Mobile and accessibility improvements

- [x] Fix clipped Add Player controls and audit inputs, buttons, notifications, and modals at 360px, 390px, and desktop widths.
- [x] Enlarge ranking controls and reduce unnecessary scrolling through empty sections.
- [x] Preserve tap-based ranking while improving touch drag behaviour so normal scrolling is practical.
- [x] Reset scroll and move focus appropriately when changing views; make browser navigation predictable.
- [x] Add modal focus management, Escape handling, labels, status announcements, and reduced-motion support.

**Acceptance:** complete host and guest flows without clipped controls; rank without dragging; usable keyboard focus through dialogs and list edits; opening results brings the results into view; long names and error messages remain readable.

### FEATURE-01 — Faster repeat sessions

- [x] Duplicate a session with the same game/players while clearing picks, results, room code, and submission identities.
- [x] Add bulk player/faction entry with trimming and duplicate handling.
- [ ] Add reusable player groups if selected for scope. **Deferred: not selected; repeat-game copying supplies the current roster-reuse workflow.**

**Acceptance:** a repeated night is independent of the original, and old guest links cannot submit to the new session.

### FEATURE-02 — Sharing and result comparison

- [x] Add a room QR code and remember guest identity within the agreed permission model.
- [x] Preview both optimization goals before publishing one outcome.
- [x] Add concise share/copy output with the selected goal and assignment explanations.

**Acceptance:** previews do not publish prematurely; QR codes resolve to the correct room; shared snapshots clearly identify their context.

### FEATURE-03 — History and rotation fairness (later)

- [ ] Preserve earlier rounds/results without overwriting them on reopen.
- [ ] Consider optional avoidance of repeated faction assignments across game nights.

**Acceptance:** history is immutable or versioned, and optional rotation rules never silently override bans or the declared optimization goal. Agree scoring trade-offs before implementation.

### FEATURE-04 — Optional accounts for managing games (later)

- [x] Add an optional account and a "My games" view for finding, organizing, and resuming saved games across devices. *(Code prepared and fixture-verified; not activated.)*
- [x] Let an organizer attach existing games/workspaces only after proving control through the private organizer link; never claim data using a public workspace label or matching display name. *(Enforced in migration 006; rolled-back SQL suite written, not yet run.)*
- [x] Provide account recovery and a clear way to manage/revoke organizer links without losing saved games. *(Per-device keys, Devices and links, unlink/delete guards; provider accounts handle password recovery.)*
- [x] Choose sign-in providers. *Decided 2026-09-27: Discord and Google, no email delivery, to keep running cost at $0.*
- [x] Preserve immediate account-free game creation and guest participation; explain the benefits of an account without forcing one.
- [x] Apply migration 006 with the SQL suites. *(Applied 2026-09-27 after a user-approved clean slate; verified.)*
- [ ] Configure Discord and Google in Supabase, list them in `config.js`, deploy, and verify live with test workspaces. *(Google configured, deployed, and verified live by the user on 2026-09-27. GitHub OAuth app created by the user and enabled in Supabase and `config.js` on 2026-09-27; live sign-in check pending. Discord pending.)*
- [x] Signed-in devices always show the account's games, with no "open in this browser" step. Games already in a browser join only by choice, and set-aside games return at sign-out. *(Requested 2026-09-27; code, migration 007, and tests prepared; fixture-verified.)*
- [x] Players can keep personal invitations in their account and reach them from **Games you're playing in** without the link. *(Requested 2026-09-27; prepared and fixture-verified.)*
- [x] Home screen **Manage games** button for saved games (faction lists). *(Requested 2026-09-27.)*
- [x] Apply migration 007, then deploy the matching client. *(Applied 2026-09-27 after a passing rolled-back trial; live flow checks with the user pending.)*

**Acceptance:** an account holder can find and manage their games on another device; linking preserves the original sessions and permissions; another account cannot claim those games; people who skip accounts can still create and join games.

**Requested:** 2026-09-26. Started 2026-09-27 after the foundation was complete. Design, setup, and checks: [ACCOUNTS.md](ACCOUNTS.md).

## Supporting engineering work

### ENG-01 — Focused checks and maintainability

- [x] Add a small, repeatable test entry point for optimizer invariants, payload validation, save races, and permission checks as those areas change.
- [x] Add isolated host/guest browser checks for critical workflows and narrow layouts.
- [x] Separate solver, storage, and view responsibilities where needed to make changes testable; a framework rewrite is not required.
- [x] Pin external runtime dependencies or document the chosen update strategy.
- [x] Document setup, migrations, release verification, and backup/recovery. Add automated checks before deployment where appropriate.

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

### 2026-09-26 — OPT-02 implemented

- Replaced factorial enumeration/all-tie storage with rectangular Hungarian matching plus score thresholds. Both optimization goals, secondary objectives, hard bans, and input snapshots are preserved. The existing schema/input ceiling becomes the supported limit: 100 players and 100 factions.
- Randomized row/column order varies equally optimal results without permanent input-order priority. Sampling is not guaranteed uniform across all tied assignments; this explicit trade-off avoids factorial enumeration and does not change score/fairness objectives.
- Removed obsolete factorial warnings and synchronous worker fallback. Startup/runtime errors remain recoverable; Cancel terminates the worker; a 15-second watchdog bounds a stuck run.
- Validation: nine optimizer checks pass, including 400 independent reference comparisons, maximum-size neutral inputs, tie variation, worker cancellation and startup/runtime failure. Six 100×100 benchmark cases finish in 10.6–32.7 ms with 7.3 MiB peak process RSS growth, below the development budgets of 2 seconds/solve and 32 MiB. Isolated browser worker produced and published the correct two-first-choice result.
- ROOM-01 release verified: Pages run `36288467602` succeeded. Existing games remain preserved; no production games used for write tests.

### 2026-09-26 — UX-01 implemented

- Fixed flexible inputs/button wrapping, enlarged ranking and small controls to 44px, wrapped long names, and reduced empty-list height. Touch scrolling is separated from dragging through a visible grip; cancelled gestures restore choices. Cross-player desktop drops are ignored.
- Added dialog roles/names, focus trapping, background inertness, Escape/cancel behavior, focus restoration, input labels, status announcements, focus retention after ranking, and reduced-motion support. Player expansion is keyboard-operable. View changes reset scroll/focus; organizer Back/Forward uses scoped history state and the existing save-preservation rules.
- Fixed unchanged room polling rebuilding invitation controls every three seconds, which otherwise disrupted focus. Unchanged connection text is not re-announced.
- Isolated browser checks: 360px host Add Player/room dialog, 390px guest keyboard ranking/submission and results, desktop long-name rendering, Help dialog Tab/Escape/return focus, and Back between setup/picks. No horizontal overflow in either phone preview. Disconnected room reads showed retrying; reconnect caught up to the renamed player and published result. Physical touch gestures remain a device spot-check limitation.
- OPT-02 Pages run `36288680698` succeeded. Existing production games were read only.

### 2026-09-26 — FEATURE-01 core repeat setup implemented

- Session cards now offer Repeat game with an editable suggested name. Only game title, factions, and player names carry forward; all player IDs are fresh and choices, bans, submission metadata, locks, room code, and results are cleared. No original data is modified.
- Added bulk player/faction dialogs with trimming, Unicode/case-insensitive duplicate handling, live count preview, and all-or-nothing size validation. Single-entry player/faction creation also honors the 100-entry/500-character limits. Reusable player groups remain unselected and deferred; repeating a game already reuses its roster.
- Browser-history navigation now keeps published games on their results until explicitly reopened, preventing editing closed picks through Back.
- Validation: two helper tests cover fresh identities, source immutability, clearing prior state, duplicate handling, and overflow rejection. Isolated browser duplicated a two-player game, added three unique factions and two unique players, confirmed both originals and copies on home, and inspected the bulk dialog at 360px.
- UX-01 Pages run `36289083762` succeeded.

### 2026-09-26 — FEATURE-02 comparison and sharing implemented

- Compare & Assign calculates both goals from one locked/synchronized snapshot. The comparison shows total/minimum points and individual assignments; nothing publishes until the organizer chooses. Publication checks the snapshot again and reports failed saves honestly.
- Added locally generated QR codes for viewing and personal invitations, with explicit labels. Personal identity continues to use the existing invitation fragment and per-tab storage. No private invitation is sent to a QR service. Vendored MIT encoder is pinned with its upstream hash/license.
- Added a plain-text copyable summary with game, chosen goal, preference score, assignments, and explanations.
- Validation: 37 Node tests pass. Independent jsQR decoder round-tripped viewer, personal, and URL-encoded legacy-player invitations. Isolated desktop/360px browser comparison left the guest on closed picks until explicit publication, then delivered the selected fairness result. Desktop clipboard content matched the displayed summary; phone summary rendering and copy feedback checked (the browser tool clipboard does not expose the iframe clipboard). No production writes.
- FEATURE-01 Pages run `36289319157` succeeded. Next: ENG-01.

### 2026-09-26 — ENG-01 repeatable release checks prepared

- Added one offline command for syntax, 38 Node regressions, and injected-response PowerShell keepalive checks. All pass locally. Solver/storage/access/result logic is separated into testable files without a framework rewrite.
- Added an explicit isolated host/guest/phone acceptance matrix and release/migration/backup guide. Manual browser evidence and deployed SQL assertions remain separate from unattended checks. Physical touch and off-project disaster backup remain stated limitations.
- Pinned the currently resolved Supabase client 2.117.2 to its exact UMD URL and integrity digest; QR bytes remain pinned. Added an application-only asset staging check excluding private local files, SQL, docs, and fixtures.
- Prepared a pinned-action Pages workflow whose deployment depends on passing Windows checks; PRs only test. Next: activate workflow publishing, commit/push, observe CI/deployment, then verify live original sessions and changed controls. FEATURE-02 Pages run `36289726977` succeeded.

### 2026-09-27 — ENG-01 deployment and final handoff verified

- GitHub Pages publishing switched from the legacy branch builder to the prepared workflow. Commit `0ea2704` passed all Windows checks and deployed successfully in run `36289848720`.
- Reloaded the live site, confirmed the exact Supabase 2.117.2 UMD script, all three original games and unchanged timestamps, and the live comparison/bulk/room-stage controls through read-only resume. Returned to Sessions. Browser error log was empty.
- Local scheduler readback: Ready, last scheduled result 0, next run 2026-09-27 09:17 Atlantic. The health status file reports the prior real successful read, distinct from simulated checks in CI.
- All selected core work is complete. Future sessions should use APP_GUIDE.md and RELEASE.md; deferred accounts, player groups, and history/rotation remain intentionally unchecked. Final documentation commit records this evidence; its Pages run is expected to repeat the same gates without changing app assets.

### 2026-09-27 — Release action runtime maintenance

- Final handoff commit `cbe9a36` passed checks and deployed in run `36310370466`. GitHub reported Node 20 action-runtime deprecations, though the application checks used Node 24 successfully.
- Updated action pins to verified official releases declaring Node 24: checkout 7.0.1, setup-node 7.0.0, configure-pages 6.0.0, upload-pages-artifact 5.0.0, deploy-pages 5.0.1. Upload now also pins its underlying artifact action. Workflow permissions, check gate, and application assets are unchanged. The new push must pass the same CI/deployment gates before calling this maintenance deployed.

### 2026-09-27 — FEATURE-04 optional accounts prepared

- Reviewed the app for account readiness. User asked for a zero-cost optional-account design. Checked current provider facts: Supabase Free includes 50,000 monthly sign-ins and social providers; its built-in mailer only reaches project team members (2/hour), so email sign-in would need custom SMTP and an owned domain. Supabase passkeys (beta) require an existing account. User accepted Discord + Google with single ownership.
- Added migration `202609270006_accounts.sql`: keys table keyed by hash (link or device), per-workspace request lock, **Replace link** that is narrow only for the signed-in owner and a full reset otherwise (so a leaked link attached to another account cannot survive replacement), `account_workspaces`, and the authenticated-only `sp_account` API (list, attach, open, revoke_key, forget_device, unlink, delete_account) with ownership, proof, limits, and orphan guards. Snapshot `before_accounts`. `game_permissions.sql` now checks the new grants; `accounts.sql` is a rolled-back suite with two sample auth users.
- Added `accounts.js` (PKCE sign-in, explicit attach choice, My games, device keys, sign-out, deletion), header/dialog UI, `privacy.html`, and provider gating through `config.js` (empty for now). Supabase sessions persist only when providers are listed. Switching away from an account device key releases it.
- Validation: `node scripts/check.cjs` passed (44 Node checks, including 6 new account checks, plus keepalive). The isolated fixture now has a fake sign-in and in-memory account API. It verified sign-in with explicit attach, URL cleanup, opening from the account with a new key, saving through the device key, sign-out removing that key, a second account refused while the link still works, account deletion keeping games, link replacement, guest mode without account controls, the privacy page, and the dialog/header at 360px without horizontal overflow.
- Not done: the Supabase dashboard was signed out in the browser pane, so migration 006 and the SQL suites have not been run. No provider is configured, and the live app does not show accounts. Next action is in Current handoff.
- Read-only production inspection found 0 games and 0 presets. Save receipts showed five organizer-API deletes at 07:42 Atlantic on 2026-09-27 across the two original workspaces. The user confirmed they deleted the old sessions themselves. Snapshots from migrations 004/005 still hold the earlier rows if the presets are ever wanted back.
- Trial: migration 006 plus all six SQL suites and the link-preservation assertion ran in one rolled-back transaction on production and passed. The editor content was verified byte-for-byte against the generated script before running. A follow-up read-only query confirmed nothing persisted: no `sp_account`, `account_workspaces`, or snapshot, and the key table still has its original primary key.
- Dormant client `fe07f9d` passed Checks and Pages run `36314245122` (checks and deploy succeeded). Read-only HTTP checks confirmed the live index loads `accounts.js`, `privacy.html` is served, and live `config.js` has `accountProviders: []`. No production data was read or written.
- Clean slate and application: the user chose to discard all existing (empty) workspaces and the older snapshots. The session's permission check blocked Claude from loading the destructive script, so the user ran `.local/apply-006.txt` in the SQL editor. The dashboard's "enable RLS" option was used, which enabled row-level security with no policies on `before_accounts` and `account_workspaces`. That is harmless because the tables are private and reached only through security-definer functions. The migration file now includes those two statements so fresh installs match.
- Post-apply read-only check: new primary key and key columns, `sp_account` executable only by `authenticated`, private schema hidden, and every workspace, room, pick, receipt, user, game, and preset count at 0. `before_private_links`, `before_reliable_saves`, and `before_room_lifecycle` were dropped. Then `.local/verify-006.txt` ran all six SQL suites in one rolled-back transaction and passed, with editor content verified against the file before running. The live site then opened in a fresh browser, created a workspace through the new wrapper, showed All changes saved, kept accounts hidden, and logged no console errors.

### 2026-09-27 — FEATURE-04 revisions from live Google testing

- The user verified Google sign-in live, then asked for changes. First: account games should be on every device without "Open in this browser". Second: a home **Manage games** button for saved games. Third: players should be able to save invitations to their account and reach them without the link.
- Migration 007 (not yet applied) adds `start` (one set of account games per account, serialized), `merge` (move sessions/presets with their ids, so rooms and picks survive; clashing names get " (2)"; source keys deleted; another account's games refused), and `account_invitations` with `save_invite`/`open_invite`/`forget_invite`. Opening recomputes the invitation from the room seed and refuses after link replacement or player removal. `list` now returns invitations.
- Client: while signed in, `syncAccountGames` folds extra account workspaces, asks before adding local games (**Add to my account** merges or adopts; **Keep separate** sets them aside in local storage), and otherwise opens or starts the account's games with a hash-only device key. Sign-out restores the set-aside games. The Account dialog shows counts and devices. Signed-in organizer-link imports merge into the account, and **Start separate workspace** is hidden. Players see an optional sign-in in their room. The return trip uses the app address plus the tab's pending room code. The home screen lists **Games you're playing in**.
- Validation: `node scripts/check.cjs` passed with 45 Node checks. Account tests now cover hash-only device keys, add/keep/restore, adopt vs start on first sign-in, failure safety, viewing links not saved, and reopening a saved invitation. Fixture browser checks passed: Manage games from home, the add prompt and merge, automatic account games after re-sign-in with a new device key, keep separate plus restore, the player signing in with Discord from an invitation and landing back in their room, the home invitation list, and opening it back into the room. The phone guest view at 360px had no horizontal overflow, and there were no console errors. SQL suite extended; not yet run.
- Before applying, a review found that 007's `sp_account` declared a variable named `s`, which the `list` query also uses as a table alias. PL/pgSQL would have rejected that as ambiguous at run time and broken sign-in for the live Google account. The variables were renamed to `game`/`room_row`. The fixed migration plus `game_permissions.sql` and `accounts.sql` then passed in one rolled-back transaction on production. The editor content was verified byte-for-byte first.
- Applied 007 on production from the same verified text. A read-only check confirmed `account_invitations` exists with RLS, the new actions are present, `sp_account` is still authenticated-only, the private schema is still hidden, and the existing account link is intact.
