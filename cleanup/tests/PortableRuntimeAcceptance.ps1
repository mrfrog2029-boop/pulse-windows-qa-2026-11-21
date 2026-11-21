param(
    [Parameter(Mandatory)] [string]$PulseExe,
    [Parameter(Mandatory)] [string]$FixtureExe
)
$ErrorActionPreference = 'Stop'
$checkedImage = (Resolve-Path -LiteralPath $PulseExe).Path
if ((Get-FileHash -Algorithm SHA256 -LiteralPath $checkedImage).Hash -ne
    'B872AB95A79364BA9F944DBE3D06204A470A90E9FB7749FBD794BA87959DEC8B') {
    throw 'This test launches only the Pulse build whose isolated portable mode was verified.'
}
$project = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$root = Join-Path $project ('test-runs\cleanup-portable-runtime-' + [Guid]::NewGuid().ToString('N'))
$install = Join-Path $root 'installs\Pulse'
$image = Join-Path $install 'Pulse.exe'
$ini = Join-Path $install 'Pulse.ini'
$data = Join-Path $install 'Data'
[IO.Directory]::CreateDirectory($install) | Out-Null
[IO.File]::WriteAllText((Join-Path $root '.pulse-cleanup-test'), 'Pulse Cleanup synthetic fixture v1')
[IO.File]::Copy($checkedImage, $image)
[IO.File]::WriteAllLines($ini, [string[]]@(
    '; Pulse от exepcstudio — настройки этой копии', 'portable=1', ('data=' + $data), 'tray=0', 'autostart=0'
))
$portable = Start-Process -FilePath $image -ArgumentList @('--portable', '--devtools') -WorkingDirectory $install -PassThru -WindowStyle Hidden
[IO.File]::WriteAllText((Join-Path $root 'fixture-pids.txt'), [string]$portable.Id)
try {
    $store = Join-Path $data 'WebView\EBWebView\Default\Local Storage\leveldb'
    $deadline = [DateTime]::UtcNow.AddSeconds(18)
    while (-not [IO.Directory]::Exists($store)) {
        if ($portable.HasExited -or [DateTime]::UtcNow -ge $deadline) { throw 'The isolated portable client did not open WebView2 storage.' }
        Start-Sleep -Milliseconds 200
    }
    $preview = @(& $FixtureExe --preview $root)
    if ($LASTEXITCODE -ne 0) { throw 'Live portable preview failed.' }
    [IO.File]::WriteAllLines((Join-Path $root 'preview.txt'), [string[]]$preview)
    if (-not ($preview -match '^planned.*будут проверены повторно')) {
        throw "The preview did not exercise deferred WebView verification in $root."
    }
    $report = @(& $FixtureExe --apply-fixture $root)
    if ($LASTEXITCODE -ne 0) { throw 'Portable fixture apply failed.' }
    [IO.File]::WriteAllLines((Join-Path $root 'apply.txt'), [string[]]$report)
    if (-not $portable.HasExited -or [IO.File]::Exists($image) -or [IO.File]::Exists($ini) -or
        [IO.Directory]::Exists($data)) {
        $report | Where-Object { $_ -match '^(unchecked|remaining|summary)' }
        throw "Expected the isolated live client, product and dedicated WebView data to be gone in $root."
    }
    "PASS: active portable Pulse, deferred actual WebView profile, and runtime data cleanup ($root)"
} finally {
    if (-not $portable.HasExited) {
        [void]$portable.CloseMainWindow()
        if (-not $portable.WaitForExit(5000)) {
            $portable.Kill()
            $portable.WaitForExit()
        }
    }
    $portable.Dispose()
}
