# Private organizer and player links

Side Picker stays open to anyone. No email, password, or Google account is required. Optional accounts for managing games later are tracked as FEATURE-04.

## Using the links

- A new visitor gets an empty workspace automatically. The browser remembers its organizer credential locally.
- **Save or open your private organizer link** opens the workspace controls. Save this link somewhere private: it can read, edit, and delete every session and preset in that workspace. Opening it on another device loads the same workspace.
- **Replace link** invalidates the old organizer link; save the replacement. Player links are unaffected.
- **Live Room** creates the room. Copy each person's **player link** and send it only to them. Names can change without changing identity; two people may have the same display name.
- A **viewing link** reveals the roster, submitted status, game setup, and published results, but cannot submit choices or read private picks.
- **Replace player links** invalidates all current invitations/viewing links for that game. Previously submitted picks remain saved. Send fresh links afterward.
- Guests cannot submit after results are published. Reopening the picker permits submissions again.

Possession of a private link is authorization. Someone forwarding their player link gives its recipient access to that player's picks. Losing the organizer link and clearing the browser's storage loses ordinary recovery access; an administrator can issue a replacement. Accounts will later provide a friendlier recovery path.

## Technical boundary

`access.js` generates organizer credentials using 32 cryptographically random bytes. Credentials travel in URL fragments and are removed from the address bar after import. They are passed to the database in HTTPS POST bodies, never query parameters. The app uses `no-referrer` and never includes organizer credentials in guest/result links.

`sp_workspace` looks up the SHA-256 hash of the credential in a private schema. Every operation uses that server-selected workspace; a supplied workspace label cannot override it. The private organizer credential lives in local storage; guest credentials use per-tab session storage. Never log RPC bodies or include recovery files in Git.

Each session has a stable UUID, alongside its existing stable `(owner_key, name)` identity. Player IDs are retained on rename; new players use random UUIDs. Each room has a private random seed. Its viewing/player capabilities are HMAC-SHA256 values over the player ID (empty for a viewer). The seed never leaves the database. Room link replacement changes this seed.

`sp_room` verifies the room capability and current player membership. It returns minimal room information and only that player's stored submission. Writes validate arrays, unique/in-range factions, disjoint preferences/bans, booleans, size limits, and published status. Duplicate player names cannot transfer a submission. Neutral submissions are valid and have explicit submitted status.

The two public RPCs use a fixed empty search path, fully qualified table/function names, and explicit capability checks. Helper functions, hashed organizer credentials, room seeds, submissions, and the migration backup are in `side_picker_private`, with no public schema/table/function access. After activation, direct access to the four legacy game tables is revoked and their permissive policies are removed; RLS remains enabled.

The browser polls scoped RPCs every three seconds while visible. This replaces direct table Realtime subscriptions, which cannot enforce this custom capability model. Polls do not overlap, carry session-generation guards, retry on errors, and skip identical guest responses. Host polling merges new submissions by stable player ID and submission timestamp. REL-01 now adds durable local drafts, version-checked organizer saves, and explicit recovery copies; see [SAVING.md](SAVING.md). Guest-versus-host reconciliation and room stages are implemented by migration 005; see APP_GUIDE.md.

## Deployment and preservation

1. Inspect deployed data and permissions. The reviewed installation has three sessions and two presets across **two** workspaces (the presets are separate from the sessions), with no legacy submissions.
2. Apply `202609260002_private_links.sql`. This makes a database-local snapshot of the four legacy tables, adds session UUIDs, and installs the new API. It deliberately leaves old table permissions in place during preparation.
3. Generate independent organizer tokens locally. Store only their hashes in `side_picker_private.workspaces`, matching existing workspace labels through an administrator-controlled binding. Never allow public claiming by label. Verify each token reads only its intended data.
4. Keep the raw recovery links in an ignored local file. For this installation: `.local/private-organizer-links.html`, with separate buttons for the three saved games and two saved presets. No credentials appear in tracked migrations or documentation.
5. Run `supabase/tests/private_links.sql`: isolated fixtures, rollback, organizer isolation, guest scope, malformed submissions, published locking, stable IDs, and link replacement. Run the Node regressions and isolated host/guest browser fixture.
6. Deploy the client and verify the new build, then apply `202609260003_lock_game_tables.sql`. Its guard refuses activation if any saved workspace is unbound. Run `supabase/tests/game_permissions.sql`, verify direct anonymous table requests fail, and verify both organizer recovery links still work. Verify the independent health query.

Legacy room codes are retained, but old room URLs lack the new capabilities and must be replaced with personal invitations/viewing links. Existing result snapshots remain readable. Public labels no longer recover a workspace. Do not restore the old permissive policies as a routine troubleshooting step.

## Recovery and validation

The snapshot is `side_picker_private.before_private_links` (`source`, `record`). Original submissions are also retained in the old table. Keep backups private. Prefer fixing forward: deploy a corrected client/RPC without reopening public table access. An administrator can recover damaged records selectively from the snapshot and replace a workspace hash with one generated from a new private organizer token. Preserve newer data; do not blindly restore all snapshots. Changing a hash revokes the old link.

Fresh installations apply the legacy baseline only once, then all versioned migrations in order. The legacy baseline now refuses to run after private links are installed, preventing accidental restoration of public policies.

Tests:

```powershell
node --test --test-isolation=none tests/results.test.cjs tests/optimizer.test.cjs tests/access.test.cjs
node tests/serve-fixture.cjs
```

Open `http://127.0.0.1:8754/` for isolated browser checks. This fixture has shared in-memory data for host/guest tabs; restarting resets it. `/phone.html?width=390` and `?width=360` provide exact-width iframe previews. Browser mocks are not evidence of database authorization; the rolled-back SQL tests and post-activation direct API checks provide that evidence.

Deployment status (2026-09-26): both migrations are applied; client `b5cbd3a` is live; preservation, scoped access, direct-table denial, and keep-alive checks passed. The improvement plan contains the complete rollout evidence.
