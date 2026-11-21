param(
    [Parameter(Mandatory)] [string]$Root,
    [Parameter(Mandatory)] [string]$FixtureExe
)
$ErrorActionPreference = 'Stop'
$rootPath = [IO.Path]::GetFullPath($Root)
if ([IO.Directory]::Exists($rootPath)) { throw 'Use a new directory for this fixture.' }
$install = [IO.Path]::Combine($rootPath, 'installs', 'mixed')
$portable = [IO.Path]::Combine($rootPath, 'portable', 'second')
[IO.Directory]::CreateDirectory($install) | Out-Null
[IO.Directory]::CreateDirectory($portable) | Out-Null
$marker = [IO.Path]::Combine($rootPath, '.pulse-cleanup-test')
[IO.File]::WriteAllText($marker, 'Pulse Cleanup synthetic fixture v1')
$source = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\baseline\Pulse.exe'))
$image = [IO.Path]::Combine($install, 'Pulse.exe')
$copy = [IO.Path]::Combine($portable, 'portable messenger.exe')
$canary = [IO.Path]::Combine($install, 'Pulse - notes.txt')
$lookalike = [IO.Path]::Combine($rootPath, 'installs', 'Pulse.exe')
[IO.File]::Copy($source, $image)
[IO.File]::Copy($source, $copy)
[IO.File]::WriteAllText($canary, 'personal canary')
[IO.File]::WriteAllText($lookalike, 'unrelated content')
if (-not [IO.File]::Exists($FixtureExe)) { throw 'The isolated executable is unavailable.' }
$preview = & $FixtureExe --preview $rootPath
if ($LASTEXITCODE -ne 0 -or -not ($preview -match [regex]::Escape($image)) -or -not ($preview -match [regex]::Escape($copy))) {
    throw 'Expected both byte-confirmed instances in the preview.'
}
$held = [IO.File]::Open($image, 'Open', 'Read', 'Read')
try {
    $first = & $FixtureExe --apply-fixture $rootPath
    if ($LASTEXITCODE -ne 0 -or -not [IO.File]::Exists($image) -or [IO.File]::Exists($copy) -or
        -not ($first -match ('^remaining\t.*' + [regex]::Escape($image)))) {
        throw 'Expected a sharing-violation residual and an independently removed copy.'
    }
} finally {
    $held.Dispose()
}
$second = & $FixtureExe --apply-fixture $rootPath
if ($LASTEXITCODE -ne 0 -or [IO.File]::Exists($image) -or
    [IO.File]::ReadAllText($canary) -ne 'personal canary' -or
    [IO.File]::ReadAllText($lookalike) -ne 'unrelated content') {
    throw 'Expected successful retry and intact canaries.'
}
$third = & $FixtureExe --apply-fixture $rootPath
if ($LASTEXITCODE -ne 0 -or ($third -match '^removed\t')) { throw 'Expected idempotent rerun.' }
'PASS: discovery, locked residual, independent deletion, retry, path and identifier canaries'

$mixed = [IO.Path]::Combine($rootPath, 'installs', 'shared-webview')
$data = [IO.Path]::Combine($mixed, 'Data')
$edge = [IO.Path]::Combine($data, 'WebView', 'EBWebView')
$profile = [IO.Path]::Combine($edge, 'Default')
$levelDb = [IO.Path]::Combine($profile, 'Local Storage', 'leveldb')
$otherSite = [IO.Path]::Combine($profile, 'IndexedDB', 'https_example.invalid_0.indexeddb.leveldb')
[IO.Directory]::CreateDirectory($levelDb) | Out-Null
[IO.Directory]::CreateDirectory($otherSite) | Out-Null
[IO.File]::Copy($source, [IO.Path]::Combine($mixed, 'Pulse.exe'))
[IO.File]::WriteAllText([IO.Path]::Combine($mixed, 'Pulse.ini'),
    "; Pulse от exepcstudio — настройки этой копии`ndata=$data`ntray=1")
[IO.File]::WriteAllText([IO.Path]::Combine($edge, 'Local State'), '{"profile":{"info_cache":{"Default":{}}}}')
[IO.File]::WriteAllText([IO.Path]::Combine($profile, 'Preferences'), '{"profile":{"name":"Default"}}')
$sharedTable = [IO.Path]::Combine($levelDb, '000001.log')
[IO.File]::WriteAllText($sharedTable, "META:https://app.pulse.invalid`0`nMETA:https://example.invalid`0")
[IO.File]::WriteAllText([IO.Path]::Combine($otherSite, 'CURRENT'), 'MANIFEST-000001')
$shared = & $FixtureExe --apply-fixture $rootPath
if ($LASTEXITCODE -ne 0 -or -not [IO.File]::Exists($sharedTable) -or
    -not ($shared -match ('^unchecked\t.*' + [regex]::Escape([IO.Path]::Combine($data, 'WebView'))))) {
    throw 'Expected foreign WebView profile data to protect the shared storage.'
}
'PASS: mixed WebView profile retains shared state and reports scope'

$dedicated = [IO.Path]::Combine($rootPath, 'installs', 'dedicated')
$otherData = [IO.Path]::Combine($rootPath, 'nonstandard-storage')
$ownEdge = [IO.Path]::Combine($otherData, 'WebView', 'EBWebView')
$ownProfile = [IO.Path]::Combine($ownEdge, 'Default')
$ownLevel = [IO.Path]::Combine($ownProfile, 'Local Storage', 'leveldb')
[IO.Directory]::CreateDirectory($dedicated) | Out-Null
[IO.Directory]::CreateDirectory($ownLevel) | Out-Null
$ownApp = [IO.Path]::Combine($dedicated, 'Pulse.exe')
$ownIni = [IO.Path]::Combine($dedicated, 'Pulse.ini')
$ownOrigin = [IO.Path]::Combine($ownLevel, '000001.log')
$heldTable = [IO.Path]::Combine($ownLevel, '000002.ldb')
$personal = [IO.Path]::Combine($ownLevel, 'Pulse notes.docx')
[IO.File]::Copy($source, $ownApp)
[IO.File]::WriteAllText($ownIni, "; Pulse от exepcstudio — настройки этой копии`ndata=$otherData`nportable=1`ntray=1")
[IO.File]::WriteAllText([IO.Path]::Combine($ownEdge, 'Local State'), '{"profile":{"info_cache":{"Default":{}}}}')
[IO.File]::WriteAllText([IO.Path]::Combine($ownProfile, 'Preferences'), '{"profile":{"name":"Default"}}')
[IO.File]::WriteAllText($ownOrigin, "META:https://app.pulse.invalid`0")
[IO.File]::WriteAllText($heldTable, 'synthetic profile table')
[IO.File]::WriteAllText($personal, 'personal document inside a recognized directory')
$busyDb = [IO.File]::Open($heldTable, 'Open', 'Read', 'Read')
try {
    $report = & $FixtureExe --apply-fixture $rootPath
    if ($LASTEXITCODE -ne 0 -or -not [IO.File]::Exists($ownApp) -or -not [IO.File]::Exists($ownIni) -or
        -not [IO.File]::Exists($ownOrigin) -or -not ($report -match ('^remaining\t.*' + [regex]::Escape($heldTable)))) {
        throw 'Expected the locked profile table and retained ownership markers.'
    }
} finally {
    $busyDb.Dispose()
}
$retry = & $FixtureExe --apply-fixture $rootPath
if ($LASTEXITCODE -ne 0 -or [IO.File]::Exists($ownApp) -or [IO.File]::Exists($ownIni) -or
    [IO.File]::Exists($ownOrigin) -or [IO.File]::Exists($heldTable) -or
    [IO.File]::ReadAllText($personal) -ne 'personal document inside a recognized directory') {
    throw 'Expected a successful retry and intact document in a recognized WebView directory.'
}
'PASS: custom WebView root, live sharing violation, stable retry markers and preserved personal document'
