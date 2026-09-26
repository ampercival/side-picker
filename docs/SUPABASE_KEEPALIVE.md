# Local daily Supabase check

The user chose a local Windows script on 2026-09-26. This setup needs the computer powered on, the registered Windows user signed in, and internet access. Locking the desktop is fine. It cannot keep Supabase active during a prolonged shutdown or sign-out.

## What runs

- Script: `scripts/keep-supabase-active.ps1`, compatible with Windows PowerShell 5.1.
- Task name: `Side Picker Supabase Keepalive`.
- Schedule: daily at **09:17 local Windows time**, plus a check two minutes after the registered user signs in. On the configured computer, the timezone is Atlantic Standard Time (Atlantic Canada, following daylight saving time).
- Principal: the user running registration, Interactive logon, Limited privilege. No password is stored.
- Process: Windows PowerShell with a hidden window, no profile, and script-scoped execution-policy bypass. System execution policy is not changed.
- Missed starts: Windows StartWhenAvailable is enabled. Failed runs are retried up to three times at 15-minute intervals. A run has a five-minute execution limit.
- Duplicate protection: only one task instance runs at a time; the script also takes a file lock and skips further runs after success on the same local calendar date. `-Force` overrides the daily skip.

Each check makes three small Supabase database reads. It reads at most one `updated_at` value from `sessions`, validates status/content type/JSON shape, and discards the returned timestamp. It does not fetch player names, preferences, workspace labels, or session titles, and does not modify game data. An empty table response is valid.

Configuration comes from the public project URL and publishable key in `config.js`. No additional privileged credential is needed. A separate read-only health table can replace this query when database administration access is available; the current query should be revisited when SEC-02 tightens permissions.

Each request has a 20-second timeout and up to three attempts with bounded delay. The script returns exit code **0** for a successful check or a same-day skip and **1** for failure. A failed attempt never advances the last-success marker. Logs omit response bodies, keys, and raw exception text.

## Run or inspect manually

From the repository root:

```powershell
# Run if today's check has not yet succeeded.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/keep-supabase-active.ps1

# Force a real database check even if already successful today.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/keep-supabase-active.ps1 -Force

# Read local status without making network requests. Nonzero if failed or overdue.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/keep-supabase-active.ps1 -Status

# Check Windows' last task result and next run.
Get-ScheduledTaskInfo -TaskName 'Side Picker Supabase Keepalive'
```

Runtime files live in `.local/supabase-keepalive/` and are ignored by Git:

- `status.json`: last attempt, last real success, and result.
- `keepalive.log`: dated success/skip/failure entries; rotates at 256 KB.
- `keepalive.previous.log`: previous log after rotation.
- `run.lock`: coordination file; the file can remain after the process releases the lock.

`-Status` reports overdue after 36 hours without success. This is a local diagnostic, not an independent notification service. It cannot alert you while the computer is off. No email or push alerts have been configured.

## Register, change time, or remove the task

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/register-keepalive-task.ps1 -StartNow

# Set another local time and replace this app's existing task.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/register-keepalive-task.ps1 -Time 10:15

# Disable without deleting the task.
Disable-ScheduledTask -TaskName 'Side Picker Supabase Keepalive'

# Remove only this app's scheduled task.
Unregister-ScheduledTask -TaskName 'Side Picker Supabase Keepalive'
```

Registration refuses to overwrite an unrelated task with the same name. If Windows reports access denied, use a PowerShell session with the necessary task-registration permissions. Re-register after moving the checkout because the task stores an absolute script path. Keep this checkout available; the published website does not run the local script.

## Troubleshooting and recovery

1. Check the task is enabled, its executable/script paths exist, and its principal is the expected Windows user. Task registration and successful script execution are separate checks.
2. Inspect `keepalive.log` and run `-Status`. `LastTaskResult = 0` may reflect a same-day skip; `lastSuccessUtc` shows the last real database check.
3. If the check fails, confirm network access and that `config.js` still points to the correct project. The query's read permission must remain available after access-policy changes.
4. If Supabase is already paused, resume it in the Supabase dashboard, then run with `-Force`. HTTP pings cannot themselves resume a paused project.
5. If this computer will be off for extended periods, move the schedule to an external service or use a Supabase plan without inactivity pausing.

Supabase says a few database queries per day are typically enough to avoid inactivity pausing; the script is not an availability guarantee. See [Supabase project pausing](https://supabase.com/docs/guides/platform/free-project-pausing). Windows behaviour follows [task settings](https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/new-scheduledtasksettingsset) and [task principals](https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/new-scheduledtaskprincipal).

## Verification

Run isolated checks without any Supabase writes or network requests:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tests/keepalive.Tests.ps1
```

These exercise response validation, three successful reads, same-day deduplication, bounded retries, unchanged last-success after failure, failed/overdue reporting, recovery from a damaged marker, and log redaction. Actual local task execution and the most recent deployment are recorded in the improvement plan.
