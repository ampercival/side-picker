[CmdletBinding()]
param(
    [ValidatePattern('^([01][0-9]|2[0-3]):[0-5][0-9]$')]
    [string]$Time = '09:17',
    [switch]$StartNow
)

$ErrorActionPreference = 'Stop'
$taskName = 'Side Picker Supabase Keepalive'
$scriptPath = Join-Path $PSScriptRoot 'keep-supabase-active.ps1'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskUser = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$powershellPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'

$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing -and -not ($existing.Description -like 'Side Picker database keep-alive:*')) {
    throw 'A different task already uses this name. It was not changed.'
}

$action = New-ScheduledTaskAction -Execute $powershellPath -WorkingDirectory $taskRoot -Argument (
    '-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}"' -f $scriptPath
)
$daily = New-ScheduledTaskTrigger -Daily -At $Time
$logon = New-ScheduledTaskTrigger -AtLogOn -User $taskUser
$logon.Delay = 'PT2M'
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 5) `
    -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 15)
# No password stored. Interactive means signed in (a locked desktop is fine).
$principal = New-ScheduledTaskPrincipal -UserId $taskUser -LogonType Interactive -RunLevel Limited
$task = New-ScheduledTask -Action $action -Trigger @($daily, $logon) -Settings $settings -Principal $principal -Description (
    'Side Picker database keep-alive: three small reads daily, with sign-in catch-up. Requires the user signed in and network access. Logs in .local\supabase-keepalive.'
)
Register-ScheduledTask -TaskName $taskName -InputObject $task -Force | Out-Null

$registered = Get-ScheduledTask -TaskName $taskName
$info = Get-ScheduledTaskInfo -TaskName $taskName
[pscustomobject]@{
    TaskName = $registered.TaskName
    User = $registered.Principal.UserId
    LogonType = $registered.Principal.LogonType
    DailyLocalTime = $Time
    TimeZone = (Get-TimeZone).Id
    StartWhenAvailable = $registered.Settings.StartWhenAvailable
    NextRunTime = $info.NextRunTime
    Script = $scriptPath
}
if ($StartNow) { Start-ScheduledTask -TaskName $taskName }
