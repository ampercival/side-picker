# Development, checks, and releases

The app is static HTML/CSS/classic JavaScript. No package installation or application build is required. Use Node 24 and PowerShell (Windows PowerShell on Windows, `pwsh` elsewhere) for the offline check command:

```powershell
node scripts/check.cjs
```

This runs syntax checks, all `tests/*.test.cjs` regressions, and injected-response keepalive tests. It does not contact Supabase. Failures stop the command with a nonzero exit. The keepalive tests deliberately print simulated failure/overdue messages; their final PASS and process exit establish the result. Performance is separate: `node tests/optimizer.bench.cjs`. QR round-trip instructions are in APP_GUIDE.md.

## Browser acceptance

Run `node tests/serve-fixture.cjs`, then open `http://127.0.0.1:8754/`. The fixture replaces the database client, shares in-memory sample data between tabs, and resets on server restart. It binds only to loopback. Do not use production for these writes. These are repeatable manual browser checks, not unattended browser automation.

| Check | Actions and expected result |
| --- | --- |
| Tied ranks (009) | Add six preferences; tie B with A at rank 1, and D/E with C at rank 3. Expect 1,1,3,3,3,6. Split B to rank 2 and restore. Toggle Treat preferences equally off/on without losing ranks. Submit a guest rank edit, verify the host/reload, compare both goals and verify tied first-choice labels. Check host and guest at 360px. |
| Dragging | Open `/drag-checks.html`. Run mouse/touch checks and edge scrolling at desktop and 360px; each reports PASS. Try an actual mouse drag between all three lists in the app and reload after All changes saved. Reorder tied choices, release outside the lists, try another player's lists, and press Escape during a drag: invalid/cancelled drops leave choices unchanged. On a physical phone, drag with the grip through a long list, swipe labels to scroll, and cancel the gesture. Touch-event checks exercise browser/controller code, not physical device gesture arbitration. |
| Strict bans | Resume the sample. Compare: both players ban B, so explain the conflict. Unban B for Jordan; compare again: total 10, minimum 0, one first choice and one neutral. |
| Preview/publication | Open a room, copy a personal invitation to another tab. Compare both goals: guest stays on closed picks. Publish one: guest sees the exact selected goal and assignments. |
| Scope and identity | Viewing invitation has no submit control. Personal invitation edits only its player; refresh retains that identity. Copy a player invitation and check its QR label. Replacing links invalidates the old invitations. |
| Guest reconciliation | Submit neutral choices. Edit afterward: submitted acknowledgement clears. In another host tab change that player's choices; dirty guest shows an explicit keep/use-saved choice. Closed/published picking disables submission. |
| Save recovery | Open `/controls` in another tab; Disconnect saves. Change picks and immediately go home, then refresh: a draft is recoverable. Reconnect and recover as a separate game; original remains intact. Lose next response exercises idempotent retry. |
| Concurrent hosts | Resume the same game in two tabs. Save a change in one, then a competing change in the other: preserve the second draft and show a conflict; do not overwrite the first. |
| Repeat/bulk entry | Repeat the fixture: fresh player identities, empty picks, no old room/results. Paste duplicate/blank names: only unique trimmed additions appear, source game unchanged. |
| Sharing | Copy summary and compare clipboard with displayed goal, percentage and explanations. Open result snapshot in another tab: read-only same context. Malformed snapshot gives recovery UI. |
| Keyboard/phone | `/phone.html?width=360` and `?width=390`: Add Player, bulk dialog, picks, room QR, comparison and results have no clipped controls or horizontal page overflow. Rank using buttons. Check Help Tab trap/Escape/focus return; Back/Forward and heading focus. |
| Reconnect | Disconnect rooms using `/controls`; guest shows interruption. Reconnect, return to guest: current setup/stage/results appear. |
| Joining (after 008) | Create a session with 3 factions and no players, open the live room, and turn on joining (defaults 2 to 3). Open the group link in another tab: seats and a name box show. Join as Sam: the page reloads as Sam with the "You joined" notice. Join as Kim in a fresh tab. The organizer tab lists Sam and Kim within seconds and saves. Remove Kim: she stays removed. Compare and assign with 1 player: the minimum warning appears. A 4th join on 3 factions says the session is full. |
| Optional accounts (after 007) | Sign in with a game in the browser: the add/keep question appears. Add: games join the account. Sign out, sign in again: games return automatically with a new device key. Keep separate: account games show, the local game returns after sign-out. Organizer opens a room; open a player link signed out, sign in with Discord from it: back in the room, "Saved to your account"; home lists it under Sessions you're playing in, and Open returns to the picks. Saved games opens the saved-games list from home. |

For guest phone previews, set `src` to the URL-encoded relative personal invitation, for example `/phone.html?width=390&src=` followed by `encodeURIComponent('/?room=...#player=...&token=...')`. Use only fixture invitations. Desktop iframe previews do not reproduce physical touch scrolling; spot-check grip dragging, normal row swipes, and cancellation on a real phone when available.

## Database changes and recovery

The checked-in config points to production. Inspect actual schema/data first. On a fresh test project only, run `supabase/schema.sql` once, then migrations 001–009 in order. For an existing deployment, apply only the missing migration; never rerun the historical baseline or older API wrappers. Migration 002 requires deliberate legacy-workspace capability binding before 003 revokes old access; see PRIVATE_LINKS.md.

Run the eight SQL files under `supabase/tests/` after relevant migrations: health permissions, private links, game permissions, reliable saves, room lifecycle, accounts (after migration 006), room joins (after migration 008), and tied preferences (after migration 009). They assert the deployed permission boundary; browser mocks cannot prove it. Fixture writes use transactions and roll back. Record application separately from test success, and verify existing data against the pre-change snapshot.

The production database was reset to a clean slate on 2026-09-27; the older `before_private_links`, `before_reliable_saves`, and `before_room_lifecycle` snapshots were dropped, and `side_picker_private.before_accounts` is empty. These are migration recovery snapshots, **not recurring or off-project disaster backups**. Keep an administrator-managed export before future schema changes, including private capabilities, in private storage. Never place dumps or organizer recovery links in Git. Restore selected damaged rows after comparing newer writes; prefer a forward fix over blindly restoring old data or public grants. Existing local organizer recovery links are in ignored `.local/private-organizer-links.html`. See PRIVATE_LINKS.md and SAVING.md for access/draft recovery.

## Deployment

GitHub Pages uses `.github/workflows/release.yml`. A push to `main` runs checks on Windows; the deployment job depends on success and stages only the application assets. Pull requests run checks only. Actions are pinned by commit. Node stays on the supported 24 line. The Pages environment has only the deployment permissions it needs; database credentials are not part of CI.

`node scripts/stage-site.cjs` creates a fresh `.local/site` directory. It refuses an existing destination so stale files cannot leak into a release. The asset allowlist adds `privacy.html` and excludes docs, SQL, test fixtures, scripts, Git metadata, and local recovery files. There is no Jekyll build. If inspecting a local artifact repeatedly, use a fresh checkout/directory or deliberately remove only the confirmed generated `.local/site` directory first.

Before each improvement commit: run the check command, applicable browser/SQL checks, inspect the diff, update APP_GUIDE.md and the plan, then commit and push. Wait for **Checks and Pages** to succeed for that commit. Reload the live app and verify changed controls plus existing sessions using read-only operations. Record this live evidence separately. If deployment fails, the prior site remains live: fix and recommit; do not label a pushed change deployed. Client rollback must remain compatible with current database RPCs; do not roll back access migrations casually.

## Dependency updates

Supabase JS is pinned to **2.117.2**, the resolved version in use when this change was made, with SHA-384 integrity for its explicit UMD file and anonymous CORS. The QR encoder is vendored at **1.4.4**, with an upstream hash and MIT license; see vendor/README.md. Google Fonts is a presentation-only external stylesheet with system-font fallback, intentionally not pinned.

Update dependencies deliberately: review upstream changes, choose an exact version, recompute integrity from the **exact URL** (CDN shorthand may serve different minified bytes), run checks and isolated browser acceptance, then verify the live client can read its workspace. Recheck on dependency/security maintenance or before a substantial release; no automatic dependency bot is installed.

Primary references: [Supabase browser installation](https://supabase.com/docs/reference/javascript/installing), [GitHub Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
