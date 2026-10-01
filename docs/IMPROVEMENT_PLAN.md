# Side Picker improvement plan

Created: 2026-09-26. Last updated: 2026-10-01.

Status: selected core improvements, optional accounts, UX-02–04 picker improvements and FEATURE-05 EN/FR localization are deployed. Live language switching, persistence and privacy copy are verified. UX-04 browser layout/alignment checks now pass; physical iPad acceptance remains pending.

The October 1 final review below records new proposed work. The user requested a review; these proposals have not been implemented or externally activated.

## Goal and scope

Make Side Picker reliable for occasional game nights: keep Supabase active, protect saved data, produce trustworthy assignments, and make host/guest use comfortable on phones. Retain the lightweight static application unless a concrete requirement justifies changing it.

The user authorized starting this plan on 2026-09-26, with a commit and push after each improvement. The user selected a local script for the daily Supabase check and clarified that anyone must be able to use the app. Keep entry open; do not make email/Google configuration or an owner-account allowlist a prerequisite. Material unresolved access-design details remain recorded below; do not confuse proposed features with completed implementation or external activation.

Read [APP_GUIDE.md](APP_GUIDE.md) for current behavior. Follow [AGENTS.md](../AGENTS.md) for session continuity.

## Current handoff

- **Current work (2026-10-01): final architecture, backend and UI/UX review complete at `6ba89bd`.** New findings and acceptance criteria are recorded below; application and database behavior are unchanged. FEATURE-05 remains released as `022d6ac`, with its verified deployment evidence in the Work log.
- **Database:** migration 009 is applied and verified. Before application: 0 sessions, 1 saved faction list, 0 picks; migration 008 present. Migration 009 and all eight SQL suites passed in a single rolled-back transaction, with pasted SQL verified against the prepared source. Application verified existing sessions and the saved faction list unchanged. Postflight: ranks column present, scoped guest RPC available, direct game/private-helper access denied, backup RLS enabled; counts unchanged.
- **Validation:** 66 Node regressions, syntax and offline PowerShell checks pass. Isolated browser checks cover French home/setup, persisted choice after reload, switching with unfinished input and tied ranks intact, French guest submission synchronized to host, comparison/publication, copied summary and bilingual shared snapshots. Host iframe and guest checks at 360px have no horizontal overflow; toggle buttons are 48×44px. Landscape tablet faction labels each fit on one line. Preview-alignment harness reports PASS for mouse/touch/pen including scrolling, and the touch drag harness passes movement/cancellation/control checks. Physical iPad verification remains separate.
- **Live acceptance:** English/French switching and French persistence after reload pass on the deployed app. Help and privacy copy are French, privacy switches both ways and uses `fr-CA`, and application/privacy console error logs are empty. The live browser's existing organizer capability was rejected, so cloud session retrieval was not accepted as passing; no credential replacement or production game edits were performed. Full host/guest/results workflows use the isolated fixture evidence above.
- **Review validation:** all 66 Node regressions, syntax and offline PowerShell checks pass. Live read-only health returns the expected sentinel; direct session/preset access returns permission denial. The installed keepalive last ran September 30 at 09:17 with result 0; its next scheduled run is October 1 at 09:17 Atlantic. Isolated probes reproduce blocked-storage startup failure, ignored sign-out errors and three device keys from three failed post-registration loads. Browser review reproduces lost ranking focus after a remote rename and lost unsubmitted ranks on reload; 360px ranking controls remain 44px high with no horizontal overflow. New SQL changes were not applied or trialed in this review.
- **Exact next action:** select the proposed hardening scope. Recommended order: REL-02, SEC-03, ROOM-02, REL-03, UX-05, UX-06; add focused reproductions before fixes and release each scoped change separately. ROOM-02/REL-03 backend changes require inspection of deployed state, an isolated rolled-back SQL trial, preservation checks and migration recording. Physical iPad acceptance for UX-04 remains pending. Preserve current browser data and use a current organizer link for live workspace acceptance.
- **Prior work:** selected core improvements are complete. Migrations 006–008 and Google/Discord/GitHub sign-in were applied and verified on 2026-09-27 (see Work log). Live saved-account invitation and real-player open-joining acceptance remain prior optional checks; this task does not claim those complete. Reusable player groups and history/rotation remain deferred.
- **Access and operations:** use remains account-free. Organizer capabilities control a workspace; personal invitations control one player's picks. Local keepalive requires this computer on, signed in, and connected; its last task result/status were reread October 1. Migration snapshots are private recovery copies, not off-project disaster backups.

## Final review — 2026-10-01

**Architecture/product assessment:** keep the static Pages client, scoped Supabase RPCs, pure worker-based optimizer and optional accounts. The current separation is sufficient; a framework/server rewrite would add work without resolving the failures below. Prefer finishing recovery and interrupted-request behavior before expanding the product. The security probes establish the tested public read boundary, not a complete production security audit. Production game data was not edited.

### Proposed hardening, in recommended order

All checkboxes below mean proposed and unimplemented. P1 means fix before the next reliability release; P2 means the next usability pass.

| Task | Priority | Evidence and impact | Acceptance |
| --- | --- | --- | --- |
| REL-02 — Startup and workspace recovery | P1 | `script.js:13` reads storage before registering app startup; a throwing storage getter aborts the file. `renderHomeSessions()` ignores `workspaceLoadFailed`, so the live failed-load screen also presents an empty-session state. | [ ] Guard storage throughout startup/theme/workspace access; show a clear temporary-storage limitation. Distinguish loading, unavailable data and a genuinely empty workspace. Offer current-link/account recovery without deleting credentials or drafts automatically. Test blocked reads/writes and revoked versus offline access. |
| SEC-03 — Truthful sign-out | P1 | `accounts.js:224` awaits `auth.signOut()` but ignores its returned error, then clears UI state and announces success. An isolated returned-error probe reproduces this. | [ ] Handle returned and thrown auth failures; do not claim completion until the chosen local sign-out behavior is confirmed. Test failed key removal, failed auth sign-out, reload/auth state and successful restoration of separate browser games. |
| ROOM-02 — Join retries without losing seats | P1 | `rooms.js:556` sends only a name. Migration 009's `join` branch commits a new player and returns the invitation without a retry receipt. If the reply is lost, retrying the name is rejected and the joiner has no personal link. This is source-confirmed; no production loss was induced. | [ ] Persist an unpredictable per-attempt retry identifier and return the same seat/invitation for an identical retry scoped to the valid room capability. Never recover a private invitation by display name alone. Test lost reply, duplicate/concurrent retry, capacity, replaced links and changed payloads in a rolled-back SQL suite. |
| REL-03 — Recoverable account device registration | P1 | `accounts.js:80` generates a fresh key, registers it and only stores it after the next load succeeds. Three failed post-registration loads register three distinct keys in the isolated probe; migration 007 caps workspace keys at 20. `startAccountGames()` has the same acknowledgement boundary. | [ ] Preserve pending per-device credentials before the request, make registration retries idempotent, and reuse the same key after uncertain replies. Keep raw keys client-side and authorization scoped to the owning account. Test the 20-key boundary, lost register/load replies and browser restart. Preserve parked-workspace recovery information until restoration succeeds. |
| UX-05 — Continuous guest picking | P2 | A remote player rename changes `applyGuestRoom()`'s response and rebuilds the picker even when ranks are unchanged; keyboard focus changed from the Coalition action button to BODY. Unsubmitted `1,1,1,4` ranks reverted to saved `1,1,3,3` after reload. | [ ] Update roster/metadata independently of the picker, preserve focus/open controls and active dragging for unrelated changes, and retain per-tab drafts scoped to room/player/revision across reload. Respect removed players, rotated links and explicit conflicts; clear only acknowledged drafts. Keep an honest warning when draft storage is unavailable. |
| UX-06 — Summary sharing independent of link size | P2 | A valid 100-row result with 500-character names/factions encodes to 139,042 characters, exceeding the 65,536-character link cap. `script.js:1511` correctly refuses the link but also prevents access to the plain-text summary. | [ ] Always provide a text summary/manual copy even when a snapshot cannot fit in a link. Keep the existing link/decoder bounds, user text safety and French copy; validate clipboard failure and large Unicode results. |

### Further improvements worth selecting separately

- [ ] **UX-07 — Setup editing safeguards:** preserve or warn about unfinished saved-game edits when closing the editor; apply the same name limits during player rename and session/game metadata editing as during creation. Explain total payload limits before a save becomes blocked. This is source review, not a reproduced user data-loss incident.
- [ ] **FEATURE-06 — Portable backups:** export/import validated sessions and saved faction lists with a preview. Exclude organizer/player/device credentials and auth data; import independent copies with fresh IDs rather than silently overwriting existing games. This addresses recovery beyond browser drafts and database-local migration snapshots.
- [ ] **UX-08 — Finding and organizing sessions:** search/filter and an archive view before large home lists become cumbersome. Backend pagination/summary loads should accompany larger workspaces; current `load` returns every complete session. Keep archived games recoverable and invitations/lifecycle rules explicit.
- [ ] **OPS-02 — Bounded public API usage:** inspect live pre-request settings before claiming a rate-limit gap. Repository RPCs have item/payload/key limits but no workspace creation quota. Consider operation-specific creation/join limits and adaptive polling for inactive/closed rooms; legitimate groups must not be blocked by sharing an IP. Remain account-free. Supabase documents pre-request rate/quota checks separately from RLS.

Reusable groups (FEATURE-01) and round history/rotation (FEATURE-03) remain optional deferred features. Do not duplicate their existing task IDs or add them to the next release automatically.

**Current external API references:** browser persistence may throw [SecurityError](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage); Supabase's [local sign-out example](https://supabase.com/docs/reference/javascript/auth-signout) returns an error value; [API pre-request checks](https://supabase.com/docs/guides/api/securing-your-api) cover rate/quota enforcement beyond RLS. Reviewed October 1. No settings were changed.

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

### UX-02 — Tied preference ranks

- [x] Allow multiple factions at the same competition rank, automatically consuming subsequent slots.
- [x] Keep neutral Available choices and the equal-preferences toggle; preserve ties when toggling back.
- [x] Carry ranks through scoring, worker snapshots, result labels, saves, guest submissions and conflict detection.
- [x] Apply migration 009 after a rollback trial and verify existing data and access protections.
- [x] Commit, push, and verify Pages after final phone acceptance. *(`8184e3b`, run `36758981799`; live assets match and home loads without app errors.)*

**Acceptance:** ranks `1, 1, 3` and `1, 2, 3, 3, 3, 6` score tied factions equally and skip consumed positions; host and guest edits survive reload; bans remain strict; old saves remain readable. Requested 2026-09-30.

### UX-03 — Reliable web and mobile dragging

- [x] Use one pointer workflow for mouse, touch and pen, with clear ghost, insertion position and drop highlighting.
- [x] Preserve normal phone scrolling and accessible buttons/selectors; scroll long lists while dragging near the edge.
- [x] Commit only on a valid release within the same player; cancelled/outside/cross-player drops restore choices without saving.
- [x] Verify template integration, ties and cancellation with regression checks, real mouse input and 360px browser touch-event checks.
- [x] Commit, push and verify the deployed assets. *(`15159cd`, run `36800548979`; live assets and Help text verified.)*
- [ ] Physical-phone gesture spot check when a device is available. *(Browser-dispatched touch events are validated separately.)*

**Acceptance:** factions move/reorder across the owning player's three lists, tied ranks remain consistent, controls remain usable, invalid drops do not edit choices, and long lists scroll during grip dragging. Requested 2026-09-30.

### UX-04 — iPad text and drag preview alignment

- [x] Keep faction names readable in narrow tablet columns; wrap selectors separately and stack lists below 800px.
- [x] Keep preview dimensions, full row styling and pickup offset unchanged, including after scrolling.
- [x] Add a pointer-offset regression and isolated tablet/alignment browser fixtures; all 60 offline regressions pass.
- [x] Commit, push and verify deployed assets. *(`a37d20a`, run `36802511907`; live HTML, drag, script and styles match.)*
- [x] Verify the new tablet layout and ghost alignment in a browser. *(2026-09-30: landscape labels fit on one line; alignment harness PASS for mouse/touch/pen including scrolling; touch movement/cancellation/control checks PASS.)*
- [ ] Verify on the reported physical iPad. *(Desktop browser checks do not reproduce physical Safari touch input.)*

**Acceptance:** readable faction names and rank controls at tablet/phone widths; preview pickup point stays with the finger while highlighted placement follows that same point. Requested with iPad screenshot 2026-09-30.

### FEATURE-05 — English and Quebec French

- [x] Use the Quebec French Translator plugin instructions to translate all application and privacy copy, including dynamic status, errors, dialogs, help, summaries and accessibility labels.
- [x] Add an accessible EN/FR switch to every app mode and the privacy page; remember the choice locally and preserve input/picks during switching.
- [x] Preserve user names, proper nouns, URLs, private capabilities and canonical snapshot/result semantics; localize presentation, dates and numbers.
- [x] Validate static copy coverage and preservation with six localization regressions; all 66 offline checks pass. Browser host/guest/results checks and 360px overflow checks pass.
- [x] Commit, push, verify Pages and the live switch/privacy page; release `022d6ac`, run `36807740772`, 14 deployed assets match source.

**Acceptance:** complete, natural Quebec French UI; switching languages retains the current task; account-free use and existing shared results remain compatible. Requested explicitly with the Quebec French Translator plugin on 2026-09-30.

### FEATURE-01 — Faster repeat sessions

- [x] Duplicate a session with the same game/players while clearing picks, results, room code, and submission identities.
- [x] Add bulk player/faction entry with trimming and duplicate handling.
- [ ] Add reusable player groups if selected for scope.
- [x] Let players add themselves from the group link, within an organizer-set seat range capped at the number of factions. *(Requested 2026-09-27; migration 008 applied and verified on production; client deployed; fixture-verified. A live check with real players is pending.)* **Deferred: not selected; repeat-game copying supplies the current roster-reuse workflow.**

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

- [x] Add an optional account and a "My games" view for finding, organizing, and resuming saved games across devices. *(Deployed after migrations 006–007; provider sign-in verified by the user, broader saved-invitation acceptance remains separate.)*
- [x] Let an organizer attach existing games/workspaces only after proving control through the private organizer link; never claim data using a public workspace label or matching display name. *(Enforced in migration 006; rolled-back SQL suite passed before application, as recorded in the September 27 Work log.)*
- [x] Provide account recovery and a clear way to manage/revoke organizer links without losing saved games. *(Per-device keys, Devices and links, unlink/delete guards; provider accounts handle password recovery.)*
- [x] Choose sign-in providers. *Decided 2026-09-27: Discord and Google, no email delivery, to keep running cost at $0.*
- [x] Preserve immediate account-free game creation and guest participation; explain the benefits of an account without forcing one.
- [x] Apply migration 006 with the SQL suites. *(Applied 2026-09-27 after a user-approved clean slate; verified.)*
- [x] Configure Discord and Google in Supabase, list them in `config.js`, deploy, and verify live with test workspaces. *(Google configured, deployed, and verified live by the user on 2026-09-27. GitHub OAuth app created by the user and enabled in Supabase and `config.js` on 2026-09-27. The user verified live GitHub sign-in in a private window, which automatically linked to the same-email Google account and showed all its games. Discord application created by the user and enabled in Supabase and `config.js` on 2026-09-27; the user verified live Discord sign-in the same day.)*
- [x] Signed-in devices always show the account's games, with no "open in this browser" step. Games already in a browser join only by choice, and set-aside games return at sign-out. *(Requested 2026-09-27; code, migration 007, and tests prepared; fixture-verified.)*
- [x] Players can keep personal invitations in their account and reach them from **Sessions you're playing in** without the link. *(Requested 2026-09-27; prepared and fixture-verified.)*
- [x] Home screen **Saved games** button for saved faction lists. *(Requested 2026-09-27; renamed from "Manage games" in the copy review.)*
- [x] Apply migration 007, then deploy the matching client. *(Applied 2026-09-27 after a passing rolled-back trial; live flow checks with the user pending.)*
- [ ] Complete real saved-account invitation acceptance on another device; fixture coverage and successful provider sign-in do not complete this separate check.

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
- GitHub enabled (`c213e8c`, checks and Pages succeeded); the live Account dialog offered Google and GitHub with no console errors. The user signed in with GitHub in a private window and saw all their existing games. That confirms Supabase's automatic same-verified-email identity linking, and live account games on a new browser with no extra step. Manual linking for different emails was explained and not built.
- Discord enabled (`87d39a7`; checks and Pages succeeded). The live Account dialog offered Google, Discord, and GitHub with no console errors, and the user verified Discord sign-in live. Remaining optional items: a live check of the saved-invitation flow, disabling Supabase's unused Email provider (done by the user later the same day), and manual linking for different emails.
- The user reported disabling Supabase's unused Email provider on 2026-09-27. Claude's dashboard re-check was refused by the browser, so this is recorded as user-reported. Enabled sign-in providers are now Google, Discord, and GitHub; anonymous sign-ins and phone were already off.

### 2026-09-27 — Copy review and professional wording

- The user skipped the live saved-invitation check for now; it remains the only unverified FEATURE-04 flow (RELEASE.md accounts row).
- On request, reviewed all user-facing text for clarity, consistency, and no hype. The user chose **session** as the term for one play meeting ("game night" was dropped because sessions happen at any time). Terms now used: session, saved game (formerly preset or "game"), players (formerly also "guests"), and assign (the Compare and assign button, formerly "optimize").
- Updated `index.html`, `script.js`, `rooms.js`, `accounts.js`, `persistence.js`, `sharing.js`, `repeat-games.js`, and `privacy.html`. The changes cover the tagline and title; results wording (removed "The happiness algorithm has spoken", "Optimal Assignment"); plain goal and preference-score explanations; sentence case for headings, buttons, and toasts; no exclamation marks or "Please"; confirmations that name the action and its effect ("Delete \"X\"?" / **Delete session**); errors that say how to fix the problem; clearer player-list labels; stale references to Optimize, presets, and guests; and account text that says sessions instead of games. The privacy page now mentions saved invitations and the current account-deletion behaviour.
- Kept unchanged on purpose: the goal names **Highest Group Score** and **Fairest for Everyone**, and the per-player result labels ("Choice #1", "Neutral"). Both are stored in shared result links and used for result counting.

### 2026-09-27 — Players can join from the group link (FEATURE-01 addition)

- Requested: organizers should not have to add every player; people with the link add their names, with a seat range so there are never more players than factions.
- Migration `202609270008_open_joining.sql` (not yet applied) adds room joining settings, `room_joins`, and a `join` action on `sp_room` for the viewing capability only. Joins require joining to be on and picking to be open, a distinct name of up to 60 characters, and a free seat (capped at the number of factions). The migration also adds `set_room_join` and `acknowledge_join`, zero-player `open_room`, and unseen joins in `room_status` to `sp_workspace`. `reconcile_room` now keeps joiners the organizer's device has not saved yet, and lets seen joiners be removed. `sp_account` and 006's rotation rule are unchanged.
- Client: live room dialog toggle and range, "Copy group link", joiners added from the poll and saved, removal acknowledging first, and a soft minimum warning. Players see seat counts and a name box on the group link, then reload as the new player with a "You joined" notice and **Copy my personal link**.
- Validation: 48 Node checks pass, including 3 joining tests (poll adds once with picks and never revives removed joiners, join request and reload, and panel states). Fixture browser run: zero-player room, joining on with defaults 2 to 3, two players joining from a 360px group-link tab, the organizer listing and saving both, Kim's removal persisting across polls, and the minimum warning. A found bug is fixed and covered by a test: a fragment-only navigation did not reload the page after joining. `supabase/tests/room_joins.sql` written; not yet run.
- Migration 008 trial: the migration plus the game-permission, private-link, reliable-save, room-lifecycle, accounts (007), and new room-joins suites ran in one rolled-back transaction on production and passed. Editor content was verified byte-for-byte against the generated script. Applied from the same verified text. A read-only check confirmed `room_joins` with RLS, the new room columns, the join action, set_room_join, and the trigger protection. Public grants are unchanged: anon can use `sp_workspace`/`sp_room` but not `sp_account`, and the private schema stays hidden. The matching client was pushed after the migration.

### 2026-09-30 — UX-02 tied preferences implemented and database applied

- Added shared-rank selectors to the common organizer/guest picker, with skipped competition positions and a Separate rank action. Neutral choices, bans and Treat preferences equally remain available; toggling equal preferences retains prior ranks. Rank selectors sit beside faction names to keep phone action rows compact.
- Optional parallel ranks preserve existing faction-name arrays. Added server validation, pick storage, pruning, reconciliation and rank-only conflict detection in migration 009. Updated worker snapshots/scoring and result labels so all members of a tie get the same points and first/top-three summary treatment.
- Offline checks passed: 54 Node tests, syntax and PowerShell health checks. Includes 400 independent exhaustive-reference solver comparisons with ties, worker execution, stale snapshots, rank-only guest conflicts, canonical-rank validation, and removing/reordering/splitting choices.
- Production preflight found 0 sessions, 1 saved faction list, 0 picks and migration 008 present. Migration 009 plus all eight SQL suites passed in one rolled-back transaction. SQL editor content was verified against the prepared source before execution. Applied the tested migration with a preservation assertion for existing sessions and saved faction lists. Postflight confirmed unchanged counts, new rank storage, unchanged scoped RPC/direct-access boundary, private helper denial, and RLS on the migration snapshot.
- Isolated browser evidence: organizer `1,1,3,3,3,6`; split B into rank 2 and restore; equal-preferences mode disables rank selection and restores prior ranks. Guest rank changes submitted, synchronized to host and survived reload. Both solver goals scored 20 with minimum 10; publication labeled Alex's B and Jordan's A as Choice #1 and counted two first choices. Guest phone preview at 360px retained focus and had no horizontal overflow. Final compact controls passed visual review on organizer and guest at 360px; no horizontal overflow and rank controls remain 44px high. Browser logs contain extension errors only. Client deployment remains next.

### 2026-09-30 — UX-02 release verified

- Committed and pushed tied preferences as `8184e3bf57ba63e56f0f75bcc8649b4f078201ee`. Checks and Pages run `36758981799` succeeded. Live `index.html`, `script.js`, `optimizer.js`, `rooms.js`, and `style.css` matched the checked-in source after newline normalization. Live home loaded with All changes saved and no application console errors.

### 2026-09-30 — UX-03 pointer dragging implemented and validated

- Replaced separate native/touch paths with `drag.js`: mouse row/grip dragging, touch/pen grip dragging, a pointer ghost, insertion placeholder, list highlighting and viewport-edge scrolling. Controls and ordinary phone swipes remain independent. A valid drop commits once; outside/cross-player releases, Escape, pointer cancellation, blur, hidden tabs and rerender restore the prior position without saving.
- Browser acceptance caught template-clone integration: setup occurs before cards enter the live document. Resolving the document on pointerdown fixed it; the new regression reproduces template adoption. Real mouse drops in the organizer app moved Available -> Banned -> Preferences; ranks and choices survived reload. The harness passed browser-dispatched mouse/touch moves, ties, cancellation, outside drops and controls; 360px touch-event edge scrolling passed. Actual 360px organizer preview had no horizontal overflow and 44px grips. Screenshots are ignored local artifacts.
- `node scripts/check.cjs` passed all 59 Node regressions, JavaScript syntax and offline PowerShell checks. No schema change or production write test was needed. Browser console after correction contains extension errors only. A new guest-browser drag check was blocked when the copied invitation was rejected as an invalid URL; no attempt was made to bypass the browser policy. Prior guest picker acceptance and shared-controller tests remain separate evidence. Physical-phone gesture arbitration still needs a device spot check.
- Exact next action: commit/push this scoped change, wait for Checks and Pages, compare deployed assets including `drag.js`, and verify the live home. Record release evidence in Current handoff.
- Release completed: `15159cd2afc61e85d9351c182366ae4795768247` pushed to `main`; Checks and Pages run `36800548979` passed (checks 18s, deployment 14s). Live `index.html`, `drag.js`, `script.js`, `optimizer.js`, `rooms.js` and `style.css` matched source after newline normalization. Live home and updated Help opened without application console errors; browser extension errors are unrelated. No production game edits were made. Physical-phone and fresh guest-drag browser checks remain the explicitly recorded limits above.

### 2026-09-30 — UX-04 iPad text and preview correction prepared

- The supplied screenshot shows rank controls squeezing anonymous faction text in a flex row into a narrow letter strip. Added an explicit name span and wrapping with a useful name basis; selectors wrap onto their own line. Host/guest lists stack at 800px or below, keeping their controls usable through intermediate widths. Selects now use the existing input background token.
- The prior ghost removed action buttons and did not inherit the source list's row styles, shrinking it while keeping an offset measured on the full source row. The preview now lives in an inert source-styled list overlay with the original measured width/height and full contents. Its top-left still uses the exact pickup offset. Removed row hover/press transforms so pickup does not alter the measured geometry.
- All 60 Node regressions, JavaScript syntax and offline PowerShell checks passed. Added a controller test for size and pointer offset before/after scrolling. The browser harness now includes actual action controls and a measured alignment check; the app fixture includes the tablet names and ties from the screenshot. These browser checks are prepared but not executed: the browser connection timed out three times (new tab, URL lookup, inventory). No alternate browser automation was used.
- Exact next action: commit/push this scoped correction, wait for Pages and compare changed assets. Current browser/device acceptance remains pending and must be recorded separately when available. No database changes or production game edits.
- Release: `a37d20aa0671965beac7ae35f0568e943f571a55` pushed to `main`; run `36802511907` passed (checks 22s, deployment 18s). Live `index.html`, `drag.js`, `script.js` and `style.css` exactly matched source after newline normalization. Alignment-page inline JavaScript and served fixture configuration parse successfully. Browser/device visual acceptance is still pending; the release is not represented as an independently verified iPad gesture fix.

### 2026-09-30 — FEATURE-05 EN/FR localization prepared

- Applied the explicitly requested Quebec French Translator plugin skill: neutral public-facing Quebec French, consistent preferences/exclusions terminology, preserved product/provider names and placeholders, nonbreaking punctuation, localized dates/numbers. Translated the app, privacy notice, help, dialogs, save/connection/conflict states, ranking accessibility labels, and copied result summaries.
- Added a 48×44px EN/FR switch outside the host-only header actions so guests and shared-results readers can use it. The privacy page shares the local choice. Presentation bindings update in place without resetting input, choices, callbacks, rooms, or account state. User text stays literal; canonical goals/notes and version-1 shared links remain compatible. No production database operation was performed.
- Validation: all 66 Node regressions, JavaScript syntax, and offline PowerShell checks pass. Six new localization checks cover static-copy completeness, placeholders/punctuation, safe switching, storage failure, dynamic copy, and canonical results. Release staging checks include both new assets on both pages.
- Isolated browser evidence: French survives reload; EN/FR switching retains unfinished player input and ranks 1,1,3,3. Rank edits remain French, guest submits successfully and host receives them, comparison/publication shows French goals, clipboard equals the displayed French summary, and a snapshot switches between English/French without regenerating its link. French account entry/providers are visible; names remain unchanged. Exact 360px host/guest document widths stay within viewport; buttons are 48×44px.
- Browser access recovered, completing the prepared UX-04 browser check: Coalition/KPD/RC/NSDAP each fit on one line in the narrow landscape column. Preview alignment reports PASS for mouse/touch/pen including page scrolling; touch moves, ties, cancellation, outside-drop and control checks pass. This is browser evidence, not physical iPad/Safari acceptance.
- Exact next action: commit and push this scoped release, wait for Checks and Pages, compare deployed assets and verify live EN/FR and privacy; record deployment evidence separately.

### 2026-09-30 — FEATURE-05 release verified

- Committed and pushed `022d6ac2a1a722c6be35bb085f00cdd46868247f` to `main`. Checks and Pages run `36807740772` succeeded (checks 18s, deployment 17s); all 66 regressions passed in CI. All 14 changed application assets match the deployed source after newline normalization.
- Live app switches between English and French and remembers French after reload. French Help opens successfully. Privacy shares the choice, switches both ways, displays the translated September 30 update and uses `fr-CA`; both pages have no application console errors. Screenshots are saved as local output artifacts.
- Live session loading is limited by the test browser's rejected existing organizer capability. No link rotation, browser-data deletion or production game edits were attempted. Host/guest/publication/shared-summary acceptance remains the successful isolated fixture evidence above, and physical iPad verification remains pending for UX-04.
- FEATURE-05 is complete. Next acceptance action: physical iPad text and drag spot check; use a current organizer link before future live workspace workflow checks. No further language implementation is pending.

### 2026-10-01 — Final functionality/backend/UI review

- Reviewed clean `main` at `6ba89bd`: architecture and product flows, current frontend, save/account/room contracts, migrations through 009, release checks and operations. Kept the static architecture and account-free use. Added proposed REL-02, SEC-03, ROOM-02, REL-03, UX-05–08, FEATURE-06 and OPS-02 with evidence and acceptance criteria; none is implemented by this review.
- All 66 Node regressions, JavaScript syntax, offline keepalive checks and release staging pass. Isolated failure probes reproduce startup abort with blocked storage, a success message after returned sign-out error, and new device-key registration after each failed subsequent load. A valid 139,042-character result is safely refused as a link but loses access to the summary modal. Joining's lost-reply gap is confirmed by client/SQL source; no new SQL suite or migration was run.
- Browser fixture: French room/picker flow, 360px width (345px usable document, no overflow, 44px rank controls). Remote rename preserves ranks but removes keyboard focus; unsubmitted rank edits disappear on reload. Current live home presents failed cloud loading with an empty-session state, and console errors are absent. Saved review screenshots are local ignored/output artifacts.
- Read-only live probes: health HTTP 200 with exactly the expected sentinel; direct sessions/presets HTTP 401 and database error 42501. Keepalive state and scheduler report September 30 09:17:01 success, task result 0; next October 1 09:17 Atlantic. No production game writes, privileged-key use, migration, account change or provider configuration occurred.
- Corrected stale guide notes about provider activation and UX-04 browser acceptance. Exact next action: select the hardening scope and begin REL-02; add behavioral failure checks, then validate/document/commit/push each selected change. Physical iPad and real saved-account invitation acceptance remain separate.
