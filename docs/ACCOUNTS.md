# Optional accounts

Status (2026-09-27): migration 006 is **applied and verified** on production, which was reset to a clean slate at the user's request. The client is deployed but dormant: no sign-in provider is configured and `accountProviders` in `config.js` is empty, so the live app does not show accounts yet. See the improvement plan (FEATURE-04) for current status.

Accounts are optional and cost nothing to run. Nobody needs one to create a game, use an organizer link, or join as a player. Sign-in uses Discord and Google through Supabase Auth. It sends no email, and the providers handle passwords and recovery.

## What people see

- **Account** in the header appears only when at least one provider is listed in `config.js`. Signed out, it explains that accounts are optional and offers **Continue with Google/Discord**. A checkbox, off by default, adds the games in this browser after sign-in. Its label warns against using it on someone else's device.
- Signed in, **My games** lists each workspace in the account: game and preset counts, recent game names, **Open in this browser**, **Remove from account**, and **Devices and links** with a **Remove** button for each key.
- **Sign out** removes this browser's device key, forgets account games in this browser, and starts an empty workspace. Games in an unlinked workspace stay in the browser.
- **Delete account** deletes the sign-in and its list. Games are not deleted: organizer links and open devices keep working.
- The home screen and organizer-link dialog show a small optional-account link. Guest invitations, viewing links, and shared results never show account controls.

## Design

A workspace can now have several organizer keys, all stored only as SHA-256 hashes in `side_picker_private.workspaces`:

| Key | Created by | Notes |
| --- | --- | --- |
| Organizer link (`kind = link`) | Starting a workspace, or **Replace link** | The shareable link, unchanged from before |
| Device key (`kind = device`) | **Open in this browser** from an account | Generated in the browser; only its hash is sent. Labelled with browser and system |

Every organizer request takes a per-workspace advisory lock, whichever key is used, so first saves and version checks behave exactly as they did with one key.

**Replace link** depends on who asks. When the signed-in owning account asks, it replaces only that key, and the owner's other devices keep theirs. Anyone else resets all access, as before accounts: every other key is deleted and account ownership is removed. Otherwise someone holding a leaked link could attach the games to their own account and keep a device key after the owner replaced the link.

`side_picker_private.account_workspaces` links a workspace to **one** owning account. `public.sp_account` is executable only by the `authenticated` role and uses `auth.uid()` from the verified sign-in token. Anonymous sign-ins are refused.

| Action | Rule |
| --- | --- |
| `attach` | Requires a valid organizer key from this browser as proof. Refused if another account owns the workspace. Up to 50 workspaces per account |
| `list` | Only this account's workspaces: game/preset names, key ids/labels/dates, and which key this browser holds |
| `open` | Owner only. Stores a device-key hash. Up to 20 keys per workspace |
| `revoke_key` | Owner only. Any key, including the shareable link |
| `forget_device` | Sign-out. Deletes the presented device key if the workspace belongs to this account; a shareable link stays valid elsewhere |
| `unlink` | Owner only. Device keys keep working as ordinary organizer links. Refused if no key would remain |
| `delete_account` | Deletes the Supabase Auth user. Links cascade; device keys keep working. Refused if some workspace could only be opened through the account |

The raw organizer key sent to `attach`/`forget_device` is proof only and is never stored. The browser stores the Supabase session (`sb-<project>-auth-token`) in local storage only when accounts are configured. Sign-in uses the PKCE flow. `accounts.js` exchanges the returned `?code` once and removes it from the address bar; supabase-js does not auto-detect URLs.

## Cost and limits

- Supabase Free includes 50,000 monthly active sign-ins and social providers. Discord and Google sign-in are free. No email service is needed.
- Without a paid custom auth domain, Google's sign-in screen names `gghixlqrgwwfgramgvon.supabase.co`. Google's free brand verification can improve this; it may take a few business days.
- A paused Free project also blocks sign-in. The local keep-alive task still matters.
- Apple sign-in requires Apple's paid developer program and email sign-in requires a sending domain, so neither is included.

## One-time setup

Do these in order. Keep client secrets only in the Supabase dashboard, never in the repository.

1. **Database.** Inspect the current schema, then apply `supabase/migrations/202609270006_accounts.sql` once. It snapshots the workspace keys into `side_picker_private.before_accounts`. Run `supabase/tests/accounts.sql` plus the existing `game_permissions.sql`, `private_links.sql`, `reliable_saves.sql`, and `room_lifecycle.sql`. Then confirm every existing organizer link was preserved:

    ```sql
    select count(*) as missing from side_picker_private.before_accounts b
    where not exists (select 1 from side_picker_private.workspaces w
      where w.owner_key = b.record->>'owner_key' and w.token_hash = b.record->>'token_hash' and w.kind = 'link');
    ```

2. **Supabase URL configuration** (Authentication → URL Configuration). Site URL `https://ampercival.github.io/side-picker/`. Add redirect URLs `https://ampercival.github.io/side-picker/` and, for local checks, `http://127.0.0.1:8753/`. Local serving still uses production data.
3. **Discord.** In the Discord Developer Portal, create an application named Side Picker. Under OAuth2, add the redirect `https://gghixlqrgwwfgramgvon.supabase.co/auth/v1/callback`. In Supabase (Authentication → Sign In / Providers → Discord), enable it and paste the client ID and secret.
4. **Google.** In Google Cloud Console, create a project and configure Google Auth Platform: External audience, app name Side Picker, support email, privacy policy `https://ampercival.github.io/side-picker/privacy.html`, and only the `openid`, `email`, and `profile` scopes. While publishing status is Testing, only listed test users can sign in; publish it for general use. Create an OAuth client of type Web application with JavaScript origin `https://ampercival.github.io` and redirect URI `https://gghixlqrgwwfgramgvon.supabase.co/auth/v1/callback`. Enable Google in Supabase with that client ID and secret.
5. **Unused sign-in methods.** Leave anonymous sign-ins and phone disabled. The app never uses email sign-in; disabling the Email provider avoids unused sign-up paths.
6. **Turn it on.** Set `accountProviders: ['discord', 'google']` in `config.js` (only providers that are enabled), run `node scripts/check.cjs`, commit, push, and wait for Checks and Pages.
7. **Live verification.** With a new test workspace, not the original games: sign in with each provider, add the workspace, open it in a second browser, save a change there, sign out of one browser, remove a device, and delete a test account. Confirm guest invitations still work signed out, and that existing organizer links still open their workspaces.

## Checks

- `node scripts/check.cjs` includes `tests/accounts.test.cjs`: callback parsing and URL cleanup, provider gating, hash-only device keys, failed-open safety, sign-out forgetting only confirmed account workspaces, and explicit attach intent.
- `node tests/serve-fixture.cjs` provides a fake sign-in. **Continue with Google/Discord** returns immediately as `fixture-google-user` or `fixture-discord-user`, backed by an in-memory account API that follows migration 006. Use Discord as the second account for claim-refusal checks. Restarting the fixture resets it. It does not prove database permissions.
- `supabase/tests/accounts.sql` rolls back two sample auth users and their workspaces. It checks proof of control, single ownership, cross-account denial, device keys and version checks across keys, per-key replacement, revocation, sign-out, unlink, deletion, anonymous refusal, and grants.

## Recovery

- Lost device: sign in anywhere and choose **Open in this browser**, then remove the old device under **Devices and links**.
- Lost provider account: a saved organizer link still opens the games. An administrator can unlink a workspace in `side_picker_private.account_workspaces` after verifying control through its link.
- Client rollback is safe: older clients ignore accounts, and every key still works as an organizer link. Do not drop the new columns or tables to roll back; `side_picker_private.before_accounts` preserves the pre-migration key rows.
