# Optional accounts

Status (2026-09-27): migration 006 is **applied and verified** on production, which was reset to a clean slate at the user's request. **Google is enabled**: Google Cloud project "Side Picker", External audience, published to production with basic scopes, and listed in `config.js`. **GitHub is enabled**: OAuth app "Side Picker" with the Supabase callback, listed in `config.js`. Discord is not configured yet. Migration 007 (account games on every device, saved player invitations) is applied and verified; its client is deployed with it. See the improvement plan (FEATURE-04) for current status.

Accounts are optional and cost nothing to run. Nobody needs one to create a game, use an organizer link, or join as a player. Sign-in uses Google, Discord, and GitHub through Supabase Auth. It sends no email, and the providers handle passwords and recovery.

## What people see

- **Account** in the header appears only when at least one provider is listed in `config.js`. Signed out, it explains that accounts are optional and offers **Continue with Google/Discord/GitHub**.
- **Signed in, a browser always shows the account's games.** A device that signs in gets its own key automatically; there is no "open in this browser" step. If the browser already had sessions or saved games that are not in the account, Side Picker asks: **Add to my account** moves them in, and **Keep separate** sets them aside. Set-aside games come back when that browser signs out, which is the choice to make on someone else's device.
- The Account dialog shows how many sessions and saved games the account has, and the **signed-in devices and links**, each removable except this one. It also offers **Sign out** and **Delete account**.
- **Sign out** removes this browser's device key, so the account's games leave that browser, and brings back any games that were set aside.
- **Delete account** deletes the sign-in. Games are not deleted: they stay in this browser, and on other devices where they are open, as an ordinary workspace.
- While signed in, **Open a different organizer link** offers to move that link's games into the account; the old link then stops working. **Start separate workspace** is hidden until sign-out.
- **Players:** a personal invitation offers an optional sign-in. A signed-in player's invitation is saved to their account automatically, and their home screen lists it under **Games you're playing in** with the game, their player name, and whether picking is open. **Open** goes straight to their picks without the link. If the organizer replaces player links or removes that player, the entry shows "invitation replaced" and cannot be opened. Viewing links are never saved.
- The home screen has **Manage games** for saved games (faction lists), next to **+ New Session**. Shared results never show account controls.

## Design

A workspace can now have several organizer keys, all stored only as SHA-256 hashes in `side_picker_private.workspaces`:

| Key | Created by | Notes |
| --- | --- | --- |
| Organizer link (`kind = link`) | Starting a workspace, or **Replace link** | The shareable link, unchanged from before |
| Device key (`kind = device`) | Signing in on a device | Generated in the browser; only its hash is sent. Labelled with browser and system |

Every organizer request takes a per-workspace advisory lock, whichever key is used, so first saves and version checks behave exactly as they did with one key.

**Replace link** depends on who asks. When the signed-in owning account asks, it replaces only that key, and the owner's other devices keep theirs. Anyone else resets all access, as before accounts: every other key is deleted and account ownership is removed. Otherwise someone holding a leaked link could attach the games to their own account and keep a device key after the owner replaced the link.

`side_picker_private.account_workspaces` links a workspace to **one** owning account. The client keeps one set of account games per account: it folds any extra linked workspace into the first with `merge`. `public.sp_account` is executable only by the `authenticated` role and uses `auth.uid()` from the verified sign-in token. Anonymous sign-ins are refused.

| Action | Rule |
| --- | --- |
| `start` | Creates the account's games with this device's key hash, once per account (serialized per account) |
| `attach` | Requires a valid organizer key from this browser as proof. Refused if another account owns the workspace. Used on a first sign-in to adopt this browser's games |
| `merge` | Moves another workspace's sessions and presets into the account's games, renaming clashes (" (2)"). The source is proven by an organizer key or is another workspace of this account; another account's games are refused. Rows keep their ids, so live rooms, invitations, and picks keep working. The source's keys and account link are deleted |
| `list` | Only this account: game/preset names, key ids/labels/dates, which key this browser holds, and saved invitations with game, player name, stage, and whether each is still current |
| `save_invite` | A valid personal player invitation only (not viewing links). Stores the session, player id, and the invitation's hash. Up to 200 per account |
| `open_invite` | Recomputes this player's invitation from the room's private seed. Refused once player links were replaced (hash differs) or the player was removed |
| `forget_invite` | Removes a saved invitation; the link itself keeps working |
| `open` | Owner only. Stores a device-key hash. Up to 20 keys per workspace |
| `revoke_key` | Owner only. Any key, including the shareable link |
| `forget_device` | Sign-out. Deletes the presented device key if the workspace belongs to this account; a shareable link stays valid elsewhere |
| `unlink` | Owner only. Device keys keep working as ordinary organizer links. Refused if no key would remain |
| `delete_account` | Deletes the Supabase Auth user. Links cascade; device keys keep working. Refused if some workspace could only be opened through the account |

The raw organizer key sent to `attach`/`merge`/`forget_device`, or the invitation sent to `save_invite`, is proof only and is never stored. Invitations live in `side_picker_private.account_invitations` (RLS on, no policies), which cascades when the session or the account is deleted. Saved games set aside at sign-in are kept in the browser's local storage (`side_picker_parked_workspace_v1`), not on the server. A player who signs in from an invitation returns to the app's address, the only allowed redirect, and the tab's saved room code (`side_picker_pending_invite` in session storage) brings them back to their room. The browser stores the Supabase session (`sb-<project>-auth-token`) in local storage only when accounts are configured. Sign-in uses the PKCE flow. `accounts.js` exchanges the returned `?code` once and removes it from the address bar; supabase-js does not auto-detect URLs.

## Cost and limits

- Supabase Free includes 50,000 monthly active sign-ins and social providers. Google, Discord, and GitHub sign-in are free. No email service is needed.
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

2. **Supabase URL configuration** (Authentication → URL Configuration). Site URL `https://ampercival.github.io/side-picker/`, and the same address as the only redirect URL. *Done 2026-09-27.* No localhost redirect is allowed: local account checks use the isolated fixture's fake sign-in, not production.
3. **Discord.** In the Discord Developer Portal, create an application named Side Picker. Under OAuth2, add the redirect `https://gghixlqrgwwfgramgvon.supabase.co/auth/v1/callback`. In Supabase (Authentication → Sign In / Providers → Discord), enable it and paste the client ID and secret.
4. **Google.** In Google Cloud Console, create a project and configure Google Auth Platform: External audience, app name Side Picker, support email, privacy policy `https://ampercival.github.io/side-picker/privacy.html`, and only the `openid`, `email`, and `profile` scopes. While publishing status is Testing, only listed test users can sign in; publish it for general use. Create an OAuth client of type Web application with JavaScript origin `https://ampercival.github.io` and redirect URI `https://gghixlqrgwwfgramgvon.supabase.co/auth/v1/callback`. Enable Google in Supabase with that client ID and secret.
5. **GitHub.** In GitHub, open Settings → Developer settings → OAuth Apps → New OAuth App. Use application name Side Picker, homepage `https://ampercival.github.io/side-picker/`, and authorization callback URL `https://gghixlqrgwwfgramgvon.supabase.co/auth/v1/callback`. Generate a client secret, then enable GitHub in Supabase with the client ID and secret. Supabase asks GitHub only for the account's profile and email addresses.
6. **Unused sign-in methods.** Leave anonymous sign-ins and phone disabled. The app never uses email sign-in; disabling the Email provider avoids unused sign-up paths.
7. **Turn it on.** Set `accountProviders: ['google', 'discord', 'github']` in `config.js` (only providers that are enabled), run `node scripts/check.cjs`, commit, push, and wait for Checks and Pages.
8. **Live verification.** With a new test workspace, not the original games: sign in with each provider, add the workspace, open it in a second browser, save a change there, sign out of one browser, remove a device, and delete a test account. Confirm guest invitations still work signed out, and that existing organizer links still open their workspaces.

## Checks

- `node scripts/check.cjs` includes `tests/accounts.test.cjs`: callback parsing and URL cleanup, provider gating, hash-only device keys, failed-open safety, sign-out forgetting only confirmed account workspaces, and explicit attach intent.
- `node tests/serve-fixture.cjs` provides a fake sign-in, including the player round trip and saved invitations. **Continue with Google/Discord/GitHub** returns immediately as `fixture-<provider>-user`, backed by an in-memory account API that follows migration 006. Use Discord as the second account for claim-refusal checks. Restarting the fixture resets it. It does not prove database permissions.
- `supabase/tests/accounts.sql` (after migration 007) rolls back three sample auth users and their workspaces. It checks start/merge (renaming, live rooms surviving, another account's games refused), saved invitations (forgery, viewing links, replacement, other accounts), proof of control, single ownership, cross-account denial, device keys and version checks across keys, per-key replacement, revocation, sign-out, unlink, deletion, anonymous refusal, and grants.

## Recovery

- Lost device: sign in anywhere and choose **Open in this browser**, then remove the old device under **Devices and links**.
- Lost provider account: a saved organizer link still opens the games. An administrator can unlink a workspace in `side_picker_private.account_workspaces` after verifying control through its link.
- Client rollback is safe: older clients ignore accounts, and every key still works as an organizer link. Do not drop the new columns or tables to roll back; `side_picker_private.before_accounts` preserves the pre-migration key rows.
