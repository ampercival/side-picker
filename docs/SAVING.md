# Saving and recovery

Session edits are backed up in this browser before the delayed cloud save starts. The status above the app shows whether they are waiting, saving, saved, or need attention. A network failure keeps the draft; Retry saving, reconnecting, and a 15-second visible-page retry can complete it. Requests time out after 15 seconds.

After a refresh, choose **Review drafts** and **Save as separate copy**. The recovered game has a new name and no live-room link. Its setup, choices, and local results are retained. This deliberate recovery also works for conflicting edits: the original cloud game is unchanged. **Discard this draft** requires confirmation and removes only the selected local draft. Finish editing in other tabs before recovering their drafts.

If a save reached the server but its reply was lost, retry uses the same operation ID and returns the earlier result without applying it twice. Edits made during that request remain in the journal and save afterward against the returned version. If another device has changed or deleted the record, the server rejects the stale version. There is no automatic merge or force overwrite. Save a separate copy and use the latest cloud version as needed.

Session drafts are written on every edit. Preset save/rename attempts are backed up when Save is pressed; an unsubmitted preset form is not an autosaved document. Deletes are deliberate online operations and do not claim success on failure. A rename is one database transaction, including checks on both the old preset and any destination being overwritten.

Local backups are scoped to the workspace and use independent IDs for each tab's drafts. They contain game data, not organizer tokens. They do not replace the cloud database or transfer between devices. Clearing browser storage deletes drafts. Storage quota/access errors show an explicit warning; keep the editor open until a cloud save succeeds. Browser shutdown delivery is not relied on.

## Release and maintenance

Apply `supabase/migrations/202609260004_reliable_saves.sql` once, then deploy the matching client immediately. The migration adds `save_version` UUIDs to sessions/presets, a private receipt table, and a version-checking public wrapper. Older clients cannot send unchecked writes afterward and must refresh. Existing game data and invitations are preserved. Do not rerun the earlier private-link function migration over this wrapper.

The receipt table retains responses for 30 days, with cleanup on later writes in that workspace. It is private and may contain game data. Expired receipts no longer guarantee idempotent replies; recovery after a reload always uses a separate copy, rather than replaying old requests. The save journal intentionally does not store a new copy of credentials.

Validate with:

```powershell
node --test --test-isolation=none tests/results.test.cjs tests/optimizer.test.cjs tests/access.test.cjs tests/saves.test.cjs
node tests/serve-fixture.cjs
```

The isolated fixture supports `/controls` for failed saves, a lost response after commit, and delayed responses. `/phone.html?width=360` and `?width=390` provide exact-width previews. These controls exist only in the test server, never in the deployed app.

Run `supabase/tests/reliable_saves.sql`, `supabase/tests/private_links.sql`, and `supabase/tests/game_permissions.sql` in the database. Mutation tests use isolated transactional fixtures and roll back. The plan records applied/deployed status and actual verification evidence; mocked browser tests do not establish database authorization.
