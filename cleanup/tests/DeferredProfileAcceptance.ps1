param([Parameter(Mandatory)] [string]$FixtureExe)

$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$root = Join-Path $project ('test-runs\cleanup-deferred-' + [Guid]::NewGuid().ToString('N'))
$guard = Join-Path $root 'guard'
[IO.Directory]::CreateDirectory($guard) | Out-Null
[IO.File]::WriteAllText((Join-Path $guard 'canary.txt'), 'keep')
[IO.File]::WriteAllText((Join-Path $root '.pulse-cleanup-test'), 'Pulse Cleanup synthetic fixture v1')
[IO.File]::Copy((Join-Path $project 'baseline\Pulse.exe'), (Join-Path $root 'baseline-payload'))
$staging = Join-Path $root 'staging'
[IO.Directory]::CreateDirectory($staging) | Out-Null
New-Item -ItemType Junction -Path (Join-Path $staging 'prepared-junction') -Target $guard | Out-Null
& $FixtureExe --deferred-regression $root
if ($LASTEXITCODE -ne 0) { throw 'The deferred-profile regression failed.' }
