[CmdletBinding()]
param(
    [switch]$Force,
    [switch]$Status
)

$ErrorActionPreference = 'Stop'
$script:KeepAliveRoot = Split-Path -Parent $PSScriptRoot
$script:KeepAliveDirectory = Join-Path $script:KeepAliveRoot '.local\supabase-keepalive'
$script:KeepAliveProbe = 'health-v1'

function Read-KeepAliveConfig {
    param([string]$Path = (Join-Path $script:KeepAliveRoot 'config.js'))
    $content = Get-Content -LiteralPath $Path -Raw
    $url = [regex]::Match($content, "url:\s*'([^']+)'").Groups[1].Value
    $key = [regex]::Match($content, "publishableKey:\s*'([^']+)'").Groups[1].Value
    if ($url -notmatch '^https://[a-z0-9]+\.supabase\.co/?$' -or $key -notmatch '^sb_publishable_[A-Za-z0-9_-]+$') {
        throw 'Expected a hosted Supabase URL and public publishable key in config.js.'
    }
    # This sentinel stays readable when all game tables become private.
    return @{ Url = $url.TrimEnd('/') + '/rest/v1/app_health?select=status&limit=1'; Key = $key }
}

function Test-KeepAliveResponse {
    param($Response)
    if ([int]$Response.StatusCode -ne 200) { throw 'Unexpected HTTP status.' }
    if ([string]$Response.Headers['Content-Type'] -notmatch '^application/json') { throw 'Expected a JSON database response.' }
    $body = [string]$Response.Content
    if ($body.Length -gt 4096 -or $body.Trim() -notmatch '(?s)^\[.*\]$') { throw 'Invalid database response shape.' }
    $parsed = $body | ConvertFrom-Json
    $rows = @($parsed)
    if ($rows.Count -ne 1) { throw 'Expected the health sentinel.' }
    foreach ($row in $rows) {
        if ($null -eq $row -or @($row.PSObject.Properties).Count -ne 1 -or
            $null -eq $row.PSObject.Properties['status']) { throw 'Expected only status.' }
        if ($row.status -isnot [string] -or $row.status -cne 'ok') { throw 'Invalid health sentinel.' }
    }
}

function Write-KeepAliveLog {
    param([string]$Message, [string]$Directory = $script:KeepAliveDirectory)
    $log = Join-Path $Directory 'keepalive.log'
    # Keep a small rolling log rather than accumulating years of output.
    if ((Test-Path -LiteralPath $log) -and (Get-Item -LiteralPath $log).Length -gt 262144) {
        Move-Item -LiteralPath $log -Destination (Join-Path $Directory 'keepalive.previous.log') -Force
    }
    $line = '{0} {1}' -f [DateTimeOffset]::Now.ToString('o'), $Message
    Add-Content -LiteralPath $log -Value $line -Encoding UTF8
    Write-Host $line
}

function Read-KeepAliveState {
    param([string]$Directory = $script:KeepAliveDirectory)
    $path = Join-Path $Directory 'status.json'
    if (-not (Test-Path -LiteralPath $path)) { return $null }
    try { return Get-Content -LiteralPath $path -Raw | ConvertFrom-Json }
    catch { return $null } # A damaged marker must never suppress the next check.
}

function Save-KeepAliveState {
    param($State, [string]$Directory = $script:KeepAliveDirectory)
    $temporary = Join-Path $Directory 'status.pending.json'
    $State | ConvertTo-Json | Set-Content -LiteralPath $temporary -Encoding UTF8
    Move-Item -LiteralPath $temporary -Destination (Join-Path $Directory 'status.json') -Force
}

function Get-KeepAliveStatus {
    param([string]$Directory = $script:KeepAliveDirectory)
    $saved = Read-KeepAliveState -Directory $Directory
    if ($null -eq $saved -or -not $saved.lastSuccessUtc) {
        Write-Host 'No successful database check recorded. Run the script without -Status.'
        return 1
    }
    if ($saved.probe -ne $script:KeepAliveProbe) {
        Write-Host 'The current health endpoint has not been checked. Run the script without -Status.'
        return 1
    }
    $last = [DateTimeOffset]::MinValue
    if (-not [DateTimeOffset]::TryParse([string]$saved.lastSuccessUtc, [ref]$last)) {
        Write-Host 'Last-success marker is invalid. Run the check again.'
        return 1
    }
    Write-Host ('Last successful database check: ' + $last.ToLocalTime().ToString('f'))
    if ($saved.result -ne 'success') { Write-Host 'The most recent attempt failed. See keepalive.log.'; return 1 }
    if (([DateTimeOffset]::UtcNow - $last).TotalHours -gt 36) {
        Write-Host 'Overdue: no successful database check in more than 36 hours.'
        return 1
    }
    Write-Host 'Healthy: the last attempt succeeded and is recent.'
    return 0
}

function Invoke-KeepAlive {
    param(
        [switch]$Force,
        [string]$Directory = $script:KeepAliveDirectory,
        [scriptblock]$Request = {
            param($Config)
            Invoke-WebRequest -UseBasicParsing -Uri $Config.Url -Headers @{ apikey = $Config.Key; Accept = 'application/json' } -TimeoutSec 20
        },
        [scriptblock]$Pause = { param($Seconds) Start-Sleep -Seconds $Seconds }
    )
    New-Item -ItemType Directory -Path $Directory -Force | Out-Null
    # Prevent manual and scheduled runs from updating the marker concurrently.
    $lock = $null
    try {
        $lock = [IO.File]::Open((Join-Path $Directory 'run.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
    } catch [IO.IOException] {
        if (($_.Exception.HResult -band 0xffff) -eq 32) {
            Write-Host 'Another database check is running.'
            return 0
        }
        throw
    }
    try {
        $saved = Read-KeepAliveState -Directory $Directory
        $lastSuccess = if ($null -ne $saved) { $saved.lastSuccessUtc } else { $null }
        $last = [DateTimeOffset]::MinValue
        if (-not $Force -and $null -ne $saved -and $saved.result -eq 'success' -and $saved.probe -eq $script:KeepAliveProbe -and
            [DateTimeOffset]::TryParse([string]$lastSuccess, [ref]$last) -and $last.LocalDateTime.Date -eq (Get-Date).Date) {
            Write-KeepAliveLog -Directory $Directory -Message 'SKIP: already succeeded today.'
            return 0
        }
        $started = [DateTimeOffset]::UtcNow.ToString('o')
        try {
            $config = Read-KeepAliveConfig
            [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
            for ($query = 1; $query -le 3; $query++) {
                $ok = $false
                for ($attempt = 1; $attempt -le 3; $attempt++) {
                    try {
                        $response = & $Request $config
                        Test-KeepAliveResponse -Response $response
                        $ok = $true
                        break
                    } catch {
                        # Avoid logging headers, response bodies, or exception text that could contain credentials.
                        Write-KeepAliveLog -Directory $Directory -Message "RETRY: database read $query, attempt $attempt failed (HTTP, network, or response validation)."
                        if ($attempt -lt 3) { & $Pause ($attempt * 5) }
                    }
                }
                if (-not $ok) { throw 'Database check failed after bounded retries.' }
                if ($query -lt 3) { & $Pause 1 }
            }
            Save-KeepAliveState -Directory $Directory -State @{
                lastAttemptUtc = $started; lastSuccessUtc = [DateTimeOffset]::UtcNow.ToString('o'); result = 'success'; queries = 3; probe = $script:KeepAliveProbe
            }
            Write-KeepAliveLog -Directory $Directory -Message 'SUCCESS: three validated read-only database queries.'
            return 0
        } catch {
            Save-KeepAliveState -Directory $Directory -State @{
                lastAttemptUtc = $started; lastSuccessUtc = $lastSuccess; result = 'failed'; queries = 0; probe = $script:KeepAliveProbe
            }
            Write-KeepAliveLog -Directory $Directory -Message 'FAILED: check config.js, network access, and the Supabase project status. No success recorded for this attempt.'
            return 1
        }
    } finally { if ($null -ne $lock) { $lock.Dispose() } }
}

if ($MyInvocation.InvocationName -ne '.') {
    try {
        if ($Status) { exit (Get-KeepAliveStatus) }
        exit (Invoke-KeepAlive -Force:$Force)
    } catch {
        Write-Error 'Keep-alive could not run or write its local status files.'
        exit 1
    }
}
