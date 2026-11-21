[CmdletBinding()]
param(
    [string] $Source = (Join-Path $PSScriptRoot 'baseline\Pulse.exe'),
    [string] $OutputDirectory = (Join-Path $PSScriptRoot 'release'),
    [string] $Python = 'python'
)

$ErrorActionPreference = 'Stop'
$baselineImage = (Resolve-Path -LiteralPath $Source).Path
$expected = 'A25F33E71364BE8CC1E6FAE56210D4A354F87D1ADF29752562667513FCCF4005'
if ((Get-FileHash -Algorithm SHA256 -LiteralPath $baselineImage).Hash -ne $expected) {
    throw 'This release requires the Pulse.exe supplied on 2026-11-20. Check its SHA-256 in README.md.'
}
$destination = [IO.Path]::GetFullPath($OutputDirectory)
[void][IO.Directory]::CreateDirectory($destination)
$app = Join-Path $destination 'Pulse.exe'
$cleaner = Join-Path $destination 'Pulse-Cleanup.exe'
& $Python -B (Join-Path $PSScriptRoot 'build.py') --source $baselineImage --web-dir (Join-Path $PSScriptRoot 'web') --output $app
if ($LASTEXITCODE -ne 0) { throw "Pulse build failed (exit $LASTEXITCODE)." }
& (Join-Path $PSScriptRoot 'cleanup\build.ps1') -PulseArtifact $app -Output $cleaner
if (-not (Test-Path -LiteralPath $cleaner -PathType Leaf)) { throw 'Cleanup build did not produce its executable.' }
$checksums = foreach ($artifact in @($app, $cleaner)) {
    '{0}  {1}' -f (Get-FileHash -Algorithm SHA256 -LiteralPath $artifact).Hash, [IO.Path]::GetFileName($artifact)
}
[IO.File]::WriteAllLines((Join-Path $destination 'SHA256SUMS.txt'), [string[]]$checksums, [Text.Encoding]::ASCII)
$checksums
