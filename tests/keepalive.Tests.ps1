$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\scripts\keep-supabase-active.ps1')

function Assert-That { param($Condition, $Message) if (-not $Condition) { throw $Message } }
function Assert-Rejected { param($Response) $rejected = $false; try { Test-KeepAliveResponse $Response } catch { $rejected = $true }; Assert-That $rejected 'Bad response accepted' }
$good = @{ StatusCode = 200; Headers = @{ 'Content-Type' = 'application/json; charset=utf-8' }; Content = '[{"updated_at":"2026-09-26T12:00:00Z"}]' }
Test-KeepAliveResponse $good
Test-KeepAliveResponse @{ StatusCode = 200; Headers = $good.Headers; Content = '[]' }
foreach ($body in @('{}', '[null]', '[{"updated_at":"bad"}]', '[{"updated_at":"2026-09-26","name":"private"}]', 'not json', '[{},{}]')) {
    Assert-Rejected @{ StatusCode = 200; Headers = $good.Headers; Content = $body }
}
Assert-Rejected @{ StatusCode = 503; Headers = $good.Headers; Content = $good.Content }
Assert-Rejected @{ StatusCode = 200; Headers = @{ 'Content-Type' = 'text/html' }; Content = $good.Content }

$testDirectory = Join-Path ([IO.Path]::GetTempPath()) ('side-picker-keepalive-tests-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testDirectory | Out-Null
try {
    $script:readCount = 0
    $success = { param($Config) $script:readCount++; return $good }
    $noPause = { param($Seconds) }
    Assert-That ((Invoke-KeepAlive -Directory $testDirectory -Request $success -Pause $noPause) -eq 0) 'Successful check failed'
    Assert-That ($script:readCount -eq 3) 'Expected three database reads'
    $before = (Read-KeepAliveState -Directory $testDirectory).lastSuccessUtc
    Assert-That ((Invoke-KeepAlive -Directory $testDirectory -Request { throw 'must skip' } -Pause $noPause) -eq 0) 'Daily deduplication failed'
    Assert-That ((Get-KeepAliveStatus -Directory $testDirectory) -eq 0) 'Recent success reported stale'

    $script:failedCount = 0
    $failure = { param($Config) $script:failedCount++; throw 'SENSITIVE_TEST_VALUE' }
    Assert-That ((Invoke-KeepAlive -Force -Directory $testDirectory -Request $failure -Pause $noPause) -eq 1) 'Failure did not return nonzero'
    Assert-That ($script:failedCount -eq 3) 'Retries not bounded'
    $after = Read-KeepAliveState -Directory $testDirectory
    Assert-That ($after.lastSuccessUtc -eq $before) 'Failed attempt changed last success'
    Assert-That ($after.result -eq 'failed') 'Failure marker missing'
    Assert-That ((Get-KeepAliveStatus -Directory $testDirectory) -eq 1) 'Failure status not observable'
    Assert-That (-not ((Get-Content (Join-Path $testDirectory 'keepalive.log') -Raw).Contains('SENSITIVE_TEST_VALUE'))) 'Sensitive exception text was logged'

    Assert-That ((Invoke-KeepAlive -Directory $testDirectory -Request $success -Pause $noPause) -eq 0) 'Same-day failed run could not recover'
    Save-KeepAliveState -Directory $testDirectory -State @{ result = 'success'; lastSuccessUtc = [DateTimeOffset]::UtcNow.AddDays(-2).ToString('o') }
    Assert-That ((Get-KeepAliveStatus -Directory $testDirectory) -eq 1) 'Missed runs not detected'
    'broken marker' | Set-Content -LiteralPath (Join-Path $testDirectory 'status.json')
    Assert-That ((Invoke-KeepAlive -Directory $testDirectory -Request $success -Pause $noPause) -eq 0) 'Corrupt marker blocked recovery'
    Write-Host 'PASS: response validation, daily deduplication, retries, failure/overdue status, recovery, and log redaction.'
} finally {
    $resolved = [IO.Path]::GetFullPath($testDirectory)
    $temporaryRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
    if ($resolved.StartsWith($temporaryRoot, [StringComparison]::OrdinalIgnoreCase) -and
        (Split-Path $resolved -Leaf) -like 'side-picker-keepalive-tests-*') {
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
}
