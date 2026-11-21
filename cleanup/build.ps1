[CmdletBinding()]
param(
    [string[]]$PulseArtifact = @(),
    [string]$Output,
    [string]$SdkVersion = '8.0.425',
    [switch]$Test,
    [string]$FixtureImage
)

$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$testDestination = Join-Path $PSScriptRoot 'test\Pulse-Cleanup.Fixture.exe'
if ($Test -and $Output) { throw 'The fixture executable uses its dedicated output path.' }
if ($FixtureImage -and -not $Test) { throw '-FixtureImage is available only in the isolated test build.' }
if ($Test) {
    $Output = $testDestination
} elseif (-not $Output) {
    $Output = Join-Path $project 'release\Pulse-Cleanup.exe'
}
$destination = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Output)
if (-not $Test -and [IO.Path]::GetFileName($destination) -ne 'Pulse-Cleanup.exe') {
    throw 'Use Pulse-Cleanup.exe as the release filename.'
}

$dotnet = (Get-Command dotnet.exe -ErrorAction Stop).Source
$sdks = & $dotnet --list-sdks
if ($LASTEXITCODE -ne 0) { throw 'Unable to list the installed .NET SDKs.' }
$match = [regex]::Match(($sdks -join "`n"), '(?m)^' + [regex]::Escape($SdkVersion) + ' \[([^\]\r\n]+)\]\s*$')
if (-not $match.Success) { throw "The Windows .NET SDK $SdkVersion is required." }
$compiler = Join-Path (Join-Path $match.Groups[1].Value $SdkVersion) 'Roslyn\bincore\csc.dll'
$framework = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319'
if (-not [IO.Directory]::Exists($framework)) { throw '64-bit .NET Framework 4.8 is required.' }

function Read-Sha256([string]$Source, [switch]$VerifyPulse) {
    $sourcePath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Source)
    if ([string]::Equals($destination, $sourcePath, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'The cleanup output cannot be a provided input.'
    }
    $stream = [IO.File]::Open($sourcePath, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
    try {
        if ($VerifyPulse) {
            $version = [Diagnostics.FileVersionInfo]::GetVersionInfo($sourcePath)
            if ($version.CompanyName -ne 'exepcstudio' -or $version.ProductName -ne 'Pulse' -or
                $version.OriginalFilename -ne 'Pulse.exe') {
                throw 'The provided release artifact does not carry the expected Pulse metadata.'
            }
        }
        $sha = [Security.Cryptography.SHA256]::Create()
        try { return [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '') }
        finally { $sha.Dispose() }
    } finally { $stream.Dispose() }
}

$hashes = @($PulseArtifact | ForEach-Object { Read-Sha256 $_ -VerifyPulse } | Sort-Object -Unique)
$hashLiteral = ($hashes | ForEach-Object { '"' + $_ + '"' }) -join ', '
$fixtureLiteral = 'null'
if ($FixtureImage) { $fixtureLiteral = '"' + (Read-Sha256 $FixtureImage) + '"' }

$stage = Join-Path $PSScriptRoot ('.build-' + [Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($stage) | Out-Null
$identityPath = Join-Path $stage 'BuildIdentity.cs'
$stagedExe = Join-Path $stage ([IO.Path]::GetFileName($destination))
try {
    $identity = @"
namespace PulseCleanup
{
    internal static class BuildIdentity
    {
        internal static readonly string[] ProvidedHashes = new string[] { $hashLiteral };
#if TEST_FIXTURES
        internal static readonly string FixtureHash = $fixtureLiteral;
#endif
    }
}
"@
    [IO.File]::WriteAllText($identityPath, $identity, [Text.Encoding]::ASCII)
    $sources = @('Program.cs', 'SafePath.cs', 'CleanupModel.cs', 'ProductFiles.cs', 'WebViewLayout.cs',
        'CleanupEngine.cs') | ForEach-Object { Join-Path $PSScriptRoot $_ }
    if ($Test) {
        $sources += Join-Path $PSScriptRoot 'FixtureRunner.cs'
        $sources += Join-Path $PSScriptRoot 'tests\WindowsIntegrationTests.cs'
        $sources += Join-Path $PSScriptRoot 'tests\DeferredProfileTests.cs'
    }
    $sources += @(Get-ChildItem -LiteralPath $PSScriptRoot -Filter 'WindowsIntegration*.cs' -File |
        Sort-Object Name | ForEach-Object { $_.FullName })
    $assemblyNames = @('mscorlib', 'System', 'System.Core', 'System.Drawing', 'System.Management',
        'System.Windows.Forms', 'System.Xml', 'Microsoft.CSharp')
    $references = $assemblyNames | ForEach-Object { '/reference:' + (Join-Path $framework ($_.ToString() + '.dll')) }
    $target = if ($Test) { '/target:exe' } else { '/target:winexe' }
    $compilerArgs = @('/nologo', '/noconfig', '/nostdlib+', '/deterministic+', '/optimize+', '/warnaserror+',
        '/langversion:6', '/platform:anycpu', '/codepage:65001', '/utf8output',
        "/pathmap:$PSScriptRoot=/_/cleanup", "/out:$stagedExe", $target,
        ('/win32manifest:' + (Join-Path $PSScriptRoot 'app.manifest')))
    if ($Test) { $compilerArgs += '/define:TEST_FIXTURES' }
    & $dotnet $compiler @compilerArgs @references @sources $identityPath
    if ($LASTEXITCODE -ne 0) { throw "Roslyn exited with code $LASTEXITCODE." }
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($destination)) | Out-Null
    if ([IO.File]::Exists($destination)) {
        [IO.File]::Replace($stagedExe, $destination, [NullString]::Value)
    } else {
        [IO.File]::Move($stagedExe, $destination)
    }
    Get-FileHash -Algorithm SHA256 -LiteralPath $destination
} finally {
    [IO.File]::Delete($stagedExe)
    [IO.File]::Delete($identityPath)
    [IO.Directory]::Delete($stage)
}
