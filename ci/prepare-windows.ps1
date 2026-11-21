$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted' -or $env:RUNNER_OS -ne 'Windows') {
    throw 'Run this preparation step on a disposable GitHub-hosted Windows runner.'
}
$project = [IO.Path]::GetFullPath($env:GITHUB_WORKSPACE)
$release = Join-Path $project 'release'
$hashes = @{}
foreach ($line in (Get-Content -LiteralPath (Join-Path $release 'SHA256SUMS.txt'))) {
    if ($line -notmatch '^([0-9a-fA-F]{64})  (Pulse(?:-Cleanup)?\.exe)$') { throw 'Invalid SHA256SUMS entry.' }
    $hashes[$Matches[2]] = $Matches[1]
}
foreach ($name in @('Pulse.exe', 'Pulse-Cleanup.exe')) {
    $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $release $name)).Hash
    if ($actual -ne $hashes[$name]) { throw "Release digest mismatch for $name." }
}

$web = Join-Path $env:RUNNER_TEMP 'pulse-verified-web'
& powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $project 'tests\exe-unpack.ps1') -Exe (Join-Path $release 'Pulse.exe') -Destination $web
if ($LASTEXITCODE -ne 0) { throw 'CLR resource extraction failed.' }
$html = [IO.File]::ReadAllText((Join-Path $web 'index.html'))
$tag = [regex]::Match($html, '<meta\s+name="pulse-build-id"\s+content="([a-f0-9]{16})"')
if (-not $tag.Success) { throw 'The active resource is missing the release build ID.' }

function Find-WebView2 {
    foreach ($parent in @(${env:ProgramFiles(x86)}, $env:ProgramFiles, $env:LOCALAPPDATA)) {
        if (-not $parent) { continue }
        $root = Join-Path $parent 'Microsoft\EdgeWebView\Application'
        if (Test-Path -LiteralPath $root) {
            $found = Get-ChildItem -LiteralPath $root -Directory | ForEach-Object {
                Get-Item -LiteralPath (Join-Path $_.FullName 'msedgewebview2.exe') -ErrorAction SilentlyContinue
            } | Sort-Object { [version]$_.VersionInfo.ProductVersion } -Descending | Select-Object -First 1
            if ($found) { return $found }
        }
    }
}
$wv = Find-WebView2
if (-not $wv) {
    $setup = Join-Path $env:RUNNER_TEMP 'MicrosoftEdgeWebview2Setup.exe'
    Invoke-WebRequest -Uri 'https://go.microsoft.com/fwlink/p/?LinkId=2124703' -OutFile $setup
    $signature = Get-AuthenticodeSignature -LiteralPath $setup
    if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation,') {
        throw 'The Microsoft WebView2 bootstrapper signature could not be verified.'
    }
    $install = Start-Process -FilePath $setup -ArgumentList '/silent','/install' -WindowStyle Hidden -Wait -PassThru
    $wv = Find-WebView2
    if (-not $wv) { throw "WebView2 installation failed (exit $($install.ExitCode))." }
}

$deps = Join-Path $env:RUNNER_TEMP 'pulse-test-dependencies'
[void][IO.Directory]::CreateDirectory($deps)
foreach ($file in @('package.json','package-lock.json')) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot $file) -Destination $deps
}
& npm.cmd ci --prefix $deps --ignore-scripts --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'Test dependency installation failed.' }
$variables = @("PULSE_QA_DEPS=$deps", "PULSE_QA_WEB=$web", "PULSE_QA_SHA=$($hashes['Pulse.exe'])", "PULSE_QA_BUILD=$($tag.Groups[1].Value)")
$variables | Out-File -LiteralPath $env:GITHUB_ENV -Append -Encoding utf8

$os = Get-CimInstance Win32_OperatingSystem
$machine = [ordered]@{ provider='GitHub-hosted VM'; os=$os.Caption; osBuild=$os.BuildNumber; architecture=$env:RUNNER_ARCH;
    image=$env:ImageOS; imageVersion=$env:ImageVersion; webview2=$wv.VersionInfo.ProductVersion;
    build=$tag.Groups[1].Value; pulseSha256=$hashes['Pulse.exe']; cleanupSha256=$hashes['Pulse-Cleanup.exe'] }
$reports = Join-Path $project 'test-runs'
[void][IO.Directory]::CreateDirectory($reports)
$machine | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $reports 'device.json') -Encoding utf8
$machine | Format-List
('| Device | Windows | Architecture | WebView2 | Pulse build |', '|---|---|---|---|---|',
    "| GitHub-hosted VM | $($os.Caption), build $($os.BuildNumber) | $env:RUNNER_ARCH | $($machine.webview2) | $($machine.build) |") |
    Out-File -LiteralPath $env:GITHUB_STEP_SUMMARY -Append -Encoding utf8
