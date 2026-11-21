param(
    [Parameter(Mandatory)] [ValidateSet('Start','FindPeer','Finish')] [string] $Stage,
    [Parameter(Mandatory)] [ValidateSet('A','B')] [string] $Role
)

$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted' -or $env:RUNNER_OS -ne 'Windows' -or $env:RUNNER_ARCH -ne 'X64') {
    throw 'Remote pairing requires a disposable GitHub-hosted Windows runner.'
}
if ($env:GITHUB_RUN_ID -notmatch '^\d+$' -or $env:GITHUB_RUN_ATTEMPT -notmatch '^\d+$' -or
    $env:GITHUB_REPOSITORY -notmatch '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$') {
    throw 'The workflow run identity is missing.'
}

$project = (Resolve-Path -LiteralPath $env:GITHUB_WORKSPACE).Path
$temp = (Resolve-Path -LiteralPath $env:RUNNER_TEMP).Path
$root = Join-Path $temp "pulse-remote-pair-$($env:GITHUB_RUN_ID)-$($env:GITHUB_RUN_ATTEMPT)-$Role"
$reports = Join-Path $project 'test-runs'
$report = Join-Path $reports "remote-$Role.json"
$other = if ($Role -eq 'A') { 'B' } else { 'A' }
$artifactName = "pulse-pair-identity-$($env:GITHUB_RUN_ATTEMPT)-$other"
$runKey = "pulse-remote-pair:$($env:GITHUB_REPOSITORY):$($env:GITHUB_RUN_ID):$($env:GITHUB_RUN_ATTEMPT)"
$runId = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($runKey))).ToLowerInvariant().Substring(0,18)
$ownPath = Join-Path $root 'self.json'
$processPath = Join-Path $root 'process.json'

function Read-Fingerprint([string] $Path, [string] $ExpectedRole) {
    if ((Get-Item -LiteralPath $Path).Length -gt 1024) { throw 'The fingerprint artifact is unexpectedly large.' }
    $record = Get-Content -Raw -LiteralPath $Path | ConvertFrom-Json
    $names = ($record.PSObject.Properties.Name | Sort-Object) -join ','
    if ($names -ne 'identityFingerprint,role,runId,schema' -or $record.schema -ne 1 -or
        $record.role -cne $ExpectedRole -or $record.runId -cne $runId -or
        $record.identityFingerprint -cnotmatch '^[a-f0-9]{64}$') {
        throw 'The fingerprint artifact does not identify the expected role in this run.'
    }
    return $record
}

function Get-TestProcess {
    if (-not (Test-Path -LiteralPath $processPath)) { return }
    $record = Get-Content -Raw -LiteralPath $processPath | ConvertFrom-Json
    $process = Get-Process -Id $record.id -ErrorAction SilentlyContinue
    if ($process -and $process.StartTime.ToUniversalTime().Ticks.ToString() -eq $record.started -and
        $process.Path -eq $record.path) { return $process }
}

switch ($Stage) {
    'Start' {
        if ($env:PULSE_QA_SHA -notmatch '^[a-fA-F0-9]{64}$' -or $env:PULSE_QA_BUILD -cnotmatch '^[a-f0-9]{16}$' -or
            -not (Test-Path -LiteralPath $env:PULSE_QA_DEPS)) {
            throw 'The verified Windows release and dependencies are required.'
        }
        if (Test-Path -LiteralPath $root) { throw 'The pairing directory already exists.' }
        [void][IO.Directory]::CreateDirectory($root)
        [void][IO.Directory]::CreateDirectory($reports)
        $runner = Join-Path $project 'tests\exe-remote-pair.mjs'
        $image = Join-Path $project 'release\Pulse.exe'
        $argsForNode = @($runner, '--role', $Role, '--run-id', $runId, '--exe', $image, '--sha256', $env:PULSE_QA_SHA,
            '--build-id', $env:PULSE_QA_BUILD, '--exchange-dir', $root, '--deps', $env:PULSE_QA_DEPS, '--report', $report,
            '--timeout', '90', '--exchange-timeout', '270', '--live')
        foreach ($value in $argsForNode) {
            if ($value -match '["\r\n]' -or $value.EndsWith('\')) { throw 'A test argument could not be quoted.' }
        }
        $commandLine = ($argsForNode | ForEach-Object { '"' + $_ + '"' }) -join ' '
        $node = (Get-Command node.exe -ErrorAction Stop).Source
        $testLaunch = @{
            FilePath = $node; ArgumentList = $commandLine; WorkingDirectory = $project; WindowStyle = 'Hidden'; PassThru = $true
            RedirectStandardOutput = (Join-Path $root 'node.stdout'); RedirectStandardError = (Join-Path $root 'node.stderr')
        }
        $process = Start-Process @testLaunch
        [ordered]@{ id = $process.Id; started = $process.StartTime.ToUniversalTime().Ticks.ToString(); path = $node } |
            ConvertTo-Json -Compress | Set-Content -LiteralPath $processPath -Encoding utf8
        "PULSE_PAIR_DIR=$root" | Out-File -LiteralPath $env:GITHUB_ENV -Append -Encoding utf8
        $deadline = [DateTime]::UtcNow.AddSeconds(185)
        while (-not (Test-Path -LiteralPath $ownPath) -and [DateTime]::UtcNow -lt $deadline) {
            if ($process.HasExited) { throw 'The isolated Pulse role exited before publishing its fingerprint.' }
            Start-Sleep -Seconds 2
        }
        if (-not (Test-Path -LiteralPath $ownPath)) { throw 'The isolated Pulse role did not publish its fingerprint in time.' }
        $null = Read-Fingerprint -Path $ownPath -ExpectedRole $Role
    }
    'FindPeer' {
        $uri = "repos/$($env:GITHUB_REPOSITORY)/actions/runs/$($env:GITHUB_RUN_ID)/artifacts"
        $deadline = [DateTime]::UtcNow.AddSeconds(195)
        do {
            $body = & gh api --method GET $uri -f name=$artifactName -f per_page=10 2>$null
            if ($LASTEXITCODE -eq 0) {
                $artifacts = @(($body | ConvertFrom-Json).artifacts | Where-Object {
                    $_.name -ceq $artifactName -and -not $_.expired -and $_.size_in_bytes -lt 8192
                })
                if ($artifacts.Count -eq 1) {
                    "name=$artifactName" | Out-File -LiteralPath $env:GITHUB_OUTPUT -Append -Encoding utf8
                    return
                }
            }
            if (-not (Get-TestProcess) -and -not (Test-Path -LiteralPath $report)) {
                throw 'The isolated Pulse role stopped before the peer artifact was available.'
            }
            Start-Sleep -Seconds 3
        } while ([DateTime]::UtcNow -lt $deadline)
        throw 'The opposite role did not publish a fingerprint artifact in this workflow run.'
    }
    'Finish' {
        $downloaded = Join-Path $root 'peer-artifact\self.json'
        if (Test-Path -LiteralPath $downloaded) {
            $peer = Read-Fingerprint -Path $downloaded -ExpectedRole $other
            $local = Read-Fingerprint -Path $ownPath -ExpectedRole $Role
            if ($peer.identityFingerprint -ceq $local.identityFingerprint) { throw 'Both roles reported the same public identity.' }
            $staged = Join-Path $root 'peer.tmp'
            $peer | ConvertTo-Json -Compress | Set-Content -LiteralPath $staged -Encoding utf8
            Move-Item -LiteralPath $staged -Destination (Join-Path $root 'peer.json')
        }
        $deadline = [DateTime]::UtcNow.AddMinutes(14)
        while (-not (Test-Path -LiteralPath $report) -and [DateTime]::UtcNow -lt $deadline) {
            if (-not (Get-TestProcess)) { break }
            Start-Sleep -Seconds 3
        }
        if (-not (Test-Path -LiteralPath $report)) {
            $process = Get-TestProcess
            if ($process) { $process | Stop-Process -Force }
            [void][IO.Directory]::CreateDirectory($reports)
            [ordered]@{ schema = 1; status = 'BLOCKED'; role = $Role; runId = $runId;
                details = 'The hosted role did not write a completed report.' } |
                ConvertTo-Json | Set-Content -LiteralPath $report -Encoding utf8
        }
        $result = Get-Content -Raw -LiteralPath $report | ConvertFrom-Json
        if ($result.role -cne $Role -or $result.runId -cne $runId -or $result.status -cnotmatch '^(PASS|FAIL|BLOCKED)$') {
            throw 'The remote role report does not belong to this workflow run.'
        }
        "## Pulse two-machine role $Role" | Out-File -LiteralPath $env:GITHUB_STEP_SUMMARY -Append -Encoding utf8
        "- Result $($result.status)" | Out-File -LiteralPath $env:GITHUB_STEP_SUMMARY -Append -Encoding utf8
        if ($result.status -ne 'PASS') { throw "Pulse role $Role ended with $($result.status). See its JSON evidence." }
    }
}
