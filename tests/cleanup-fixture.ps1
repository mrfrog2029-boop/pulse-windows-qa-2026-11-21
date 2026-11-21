#Requires -Version 7
[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$qaRoot = Join-Path $projectRoot 'test-runs\cleanup-qa'
$runName = 'run-' + [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss') + '-' + [Guid]::NewGuid().ToString('N').Substring(0, 8)
$runRoot = Join-Path $qaRoot $runName
$fixtureArea = Join-Path $runRoot 'test-runs'
$builtFixtureExe = Join-Path $projectRoot 'cleanup\test\Pulse-Cleanup.Fixture.exe'
$fixtureExe = Join-Path $runRoot 'fixture-tools\bin\Pulse-Cleanup.Fixture.exe'
$pulseExe = Join-Path $projectRoot 'baseline\Pulse.exe'
$updaterExe = Join-Path $projectRoot 'baseline\Pulse-Update-2.exe'
$fixtureMarker = 'Pulse Cleanup synthetic fixture v1'
$utf8 = [Text.UTF8Encoding]::new($false)
$nl = [Environment]::NewLine
$results = [Collections.Generic.List[object]]::new()

function Assert-Condition([bool] $condition, [string] $message) {
    if (!$condition) { throw $message }
}

function Assert-InRun([string] $path) {
    $fullPath = [IO.Path]::GetFullPath($path)
    $boundary = $runRoot + [IO.Path]::DirectorySeparatorChar
    if ($fullPath -ne $runRoot -and !$fullPath.StartsWith($boundary, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Path outside this run: $fullPath"
    }
}

function Assert-NoReparse([string] $path) {
    for ($ancestor = $path; $ancestor; $ancestor = [IO.Path]::GetDirectoryName($ancestor)) {
        if (Test-Path -LiteralPath $ancestor) {
            $item = Get-Item -LiteralPath $ancestor -Force
            if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
                throw "Unexpected reparse point in QA path: $ancestor"
            }
        }
    }
}

function New-RunDirectory([string] $path) {
    Assert-InRun $path
    Assert-NoReparse $path
    [IO.Directory]::CreateDirectory($path) | Out-Null
}

function Save-RunText([string] $path, [string] $text) {
    Assert-InRun $path
    Assert-NoReparse $path
    New-RunDirectory ([IO.Path]::GetDirectoryName($path))
    [IO.File]::WriteAllText($path, $text, $utf8)
}

function Copy-RunAsset([string] $source, [string] $path) {
    Assert-InRun $path
    Assert-NoReparse $path
    New-RunDirectory ([IO.Path]::GetDirectoryName($path))
    [IO.File]::Copy($source, $path)
}

function New-Fixture([string] $name) {
    $fixture = Join-Path $fixtureArea $name
    New-RunDirectory $fixture
    Save-RunText (Join-Path $fixture '.pulse-cleanup-test') $fixtureMarker
    New-RunDirectory (Join-Path $fixture 'installs')
    New-RunDirectory (Join-Path $fixture 'portable')
    return $fixture
}

function Start-RunProcess([string] $image, [string[]] $arguments, [switch] $capture) {
    Assert-NoReparse $image
    $info = [Diagnostics.ProcessStartInfo]::new($image)
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.WorkingDirectory = $projectRoot
    foreach ($argument in $arguments) { $info.ArgumentList.Add($argument) }
    if ($capture) {
        $info.RedirectStandardOutput = $true
        $info.RedirectStandardError = $true
        $info.StandardOutputEncoding = $utf8
        $info.StandardErrorEncoding = $utf8
    }
    return [Diagnostics.Process]::Start($info)
}

function Invoke-Captured([string] $image, [string[]] $arguments, [string] $label) {
    $process = Start-RunProcess $image $arguments -Capture
    try {
        $output = $process.StandardOutput.ReadToEndAsync()
        $errors = $process.StandardError.ReadToEndAsync()
        if (!$process.WaitForExit(45000)) {
            $process.Kill()
            [void] $process.WaitForExit()
            throw "Timed out: $label"
        }
        $body = $output.GetAwaiter().GetResult()
        $stderr = $errors.GetAwaiter().GetResult()
        Save-RunText (Join-Path $runRoot "$label.stdout.txt") $body
        Save-RunText (Join-Path $runRoot "$label.stderr.txt") $stderr
        return [pscustomobject]@{ ExitCode = $process.ExitCode; Output = $body; Errors = $stderr }
    }
    finally { $process.Dispose() }
}

function Invoke-Fixture([string] $verb, [string] $fixture, [string] $label, [switch] $guardProbe) {
    Assert-InRun $fixture
    if (!$guardProbe) {
        Assert-NoReparse $fixture
        $marker = Join-Path $fixture '.pulse-cleanup-test'
        Assert-NoReparse $marker
        Assert-Condition ([IO.File]::ReadAllText($marker) -ceq $fixtureMarker) "Marker changed in $fixture"
    }
    $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $fixtureExe).Hash
    Assert-Condition ($hash -eq $fixtureHash) 'Fixture executable changed during the run'
    return Invoke-Captured $fixtureExe @($verb, $fixture) $label
}

function Get-ReportRows($report, [string] $target, [string[]] $states) {
    foreach ($line in $report.Output -split '\r?\n') {
        $columns = $line -split '\t', 4
        if ($columns.Length -eq 4 -and $columns[0] -in $states -and
            (!$target -or $columns[2] -eq $target)) {
            [pscustomobject]@{ State = $columns[0]; Category = $columns[1]; Target = $columns[2]; Detail = $columns[3] }
        }
    }
}

function Assert-Report($report, [string] $target, [string[]] $states) {
    $rows = @(Get-ReportRows $report $target $states)
    Assert-Condition ($rows.Count -gt 0) "Report omitted $($states -join '/') row for $target"
}

function Assert-Removed([string] $path) {
    Assert-Condition (!(Test-Path -LiteralPath $path)) "Found after cleanup: $path"
}

function Assert-Preserved([string] $path, [string] $hash) {
    Assert-Condition (Test-Path -LiteralPath $path -PathType Leaf) "Missing protected file: $path"
    Assert-Condition ((Get-FileHash -Algorithm SHA256 -LiteralPath $path).Hash -eq $hash) "Protected file changed: $path"
}

function Add-WebView([string] $data) {
    $browser = Join-Path $data 'WebView\EBWebView'
    Save-RunText (Join-Path $browser 'Local State') '{"profile":{"info_cache":{"Default":{}}}}'
    Save-RunText (Join-Path $browser 'Default\Preferences') '{"profile":{}}'
    Save-RunText (Join-Path $browser 'Default\Local Storage\leveldb\000001.log') 'https://app.pulse.invalid synthetic-account-key'
    Save-RunText (Join-Path $browser 'Default\Session Storage\000002.log') 'synthetic-session'
    Save-RunText (Join-Path $browser 'Default\Network\Cookies') 'synthetic-cookie-database'
    Save-RunText (Join-Path $browser 'Default\Cache\Cache_Data\data_0') 'synthetic-browser-cache'
    Save-RunText (Join-Path $data 'pulse.log') '2026-11-21 00:00:00 bridge synthetic host log'
    Copy-RunAsset $loaderFixture (Join-Path $data 'bin\1.4.0\WebView2Loader.dll')
}

function Add-OriginalPulseImage([string] $destination) {
    Assert-InRun $destination
    Assert-NoReparse $destination
    $attachedHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $pulseExe).Hash
    Assert-Condition ($attachedHash -eq 'A25F33E71364BE8CC1E6FAE56210D4A354F87D1ADF29752562667513FCCF4005') 'Unexpected baseline Pulse bytes'
    $attached = [IO.File]::ReadAllBytes($pulseExe)
    $original = [byte[]]::new(1333248)
    [Array]::Copy($attached, $original, $original.Length)
    # Restore the six fields modified by build.py when adding the active .pweb section.
    $fields = @{
        134 = '0200'             # Section count
        160 = '00360100'         # Size of initialized data
        208 = '00801400'         # Size of image
        472 = '00' * 40          # Empty section-header slot
        536 = 'C8EF0000984F1200' # Original CLR resources directory
        26592 = 'A8231100'       # Original icon resource offset
    }
    foreach ($offset in $fields.Keys) {
        $bytes = [Convert]::FromHexString($fields[$offset])
        [Array]::Copy($bytes, 0, $original, $offset, $bytes.Length)
    }
    $hash = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($original))
    Assert-Condition ($hash -eq 'AA697B9B6E50F7F2CEB17C4753220C3C59B2AD374E51DC459303F219C584ABEB') 'Original Pulse bytes do not match build.py'
    [IO.File]::WriteAllBytes($destination, $original)
}

function Add-Install([string] $folder, [string] $data, [string] $source, [string] $name = 'Pulse.exe') {
    Copy-RunAsset $source (Join-Path $folder $name)
    $lines = @('; Pulse от exepcstudio — настройки этой копии', "data=$data", 'tray=1', '')
    Save-RunText (Join-Path $folder 'Pulse.ini') ($lines -join $nl)
}

function Add-Junction([string] $link, [string] $target) {
    Assert-InRun $link
    Assert-InRun $target
    Assert-NoReparse $link
    Assert-NoReparse $target
    New-RunDirectory ([IO.Path]::GetDirectoryName($link))
    New-Item -ItemType Junction -Path $link -Target $target | Out-Null
    $linkItem = Get-Item -LiteralPath $link -Force
    Assert-Condition ([bool]($linkItem.Attributes -band [IO.FileAttributes]::ReparsePoint)) "Junction unavailable: $link"
}

function Invoke-Check([string] $name, [scriptblock] $test) {
    try {
        $detail = & $test
        $status = 'PASS'
    }
    catch {
        $detail = $_.Exception.Message
        $status = 'FAIL'
    }
    $results.Add([pscustomobject]@{ Name = $name; Status = $status; Evidence = $detail })
    [Console]::WriteLine('{0} {1} — {2}', $status, $name, $detail)
}

function Check-DeleteBlocked([string] $path, [int] $expectedWin32) {
    Assert-InRun $path
    Assert-NoReparse $path
    try { [IO.File]::Delete($path) }
    catch {
        $cause = $_.Exception.GetBaseException()
        Assert-Condition (($cause.HResult -band 0xffff) -eq $expectedWin32) "Wrong Win32 failure for $path ($($cause.HResult)): $($cause.Message)"
        return
    }
    throw "Delete unexpectedly succeeded in the fault setup: $path"
}

Assert-NoReparse $qaRoot
Assert-NoReparse $runRoot
[IO.Directory]::CreateDirectory($runRoot) | Out-Null

try {
    $loaderFixture = Join-Path $runRoot 'assets\WebView2Loader.dll'
    New-RunDirectory ([IO.Path]::GetDirectoryName($loaderFixture))
    Add-Type -AssemblyName System.Reflection.Metadata
    $pulseStream = [IO.File]::OpenRead($pulseExe)
    $pe = [System.Reflection.PortableExecutable.PEReader]::new($pulseStream)
    try {
        $metadata = [System.Reflection.Metadata.PEReaderExtensions]::GetMetadataReader($pe)
        $resources = $pe.PEHeaders.CorHeader.ResourcesDirectory
        $section = $pe.GetSectionData($resources.RelativeVirtualAddress)
        foreach ($handle in $metadata.ManifestResources) {
            $resource = $metadata.GetManifestResource($handle)
            if ($metadata.GetString($resource.Name) -eq 'lib.WebView2Loader.dll') {
                $reader = $section.GetReader([int]$resource.Offset, $resources.Size - [int]$resource.Offset)
                [IO.File]::WriteAllBytes($loaderFixture, $reader.ReadBytes($reader.ReadInt32()))
                break
            }
        }
    }
    finally { $pe.Dispose() }
    $loaderHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $loaderFixture).Hash
    Assert-Condition ($loaderHash -eq '462B36FD1BE6CA9F7563466A89E57C41EF4A4DEF3E0A84FA885D203AEA4A3AAF') 'Unexpected extracted loader bytes'

    $originalPulseFixture = Join-Path $runRoot 'assets\Pulse-1.4.0-original.exe'
    Add-OriginalPulseImage $originalPulseFixture
    $compiler = Join-Path ([Environment]::GetFolderPath('Windows')) 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
    $workerSource = Join-Path $PSScriptRoot 'cleanup-test-process.cs'
    $knownWorker = Join-Path $runRoot 'assets\known\Pulse.exe'
    $otherWorker = Join-Path $runRoot 'assets\unrelated\Pulse.exe'
    New-RunDirectory ([IO.Path]::GetDirectoryName($knownWorker))
    New-RunDirectory ([IO.Path]::GetDirectoryName($otherWorker))
    $compilerArgs = @('/nologo', '/target:exe', '/optimize+', '/platform:x64')
    $compiled = Invoke-Captured $compiler ($compilerArgs + @("/out:$knownWorker", $workerSource)) 'compile-worker'
    Assert-Condition ($compiled.ExitCode -eq 0) "Could not compile the fixture worker: $($compiled.Output) $($compiled.Errors)"
    $compiled = Invoke-Captured $compiler ($compilerArgs + @('/define:UNRELATED', "/out:$otherWorker", $workerSource)) 'compile-unrelated-worker'
    Assert-Condition ($compiled.ExitCode -eq 0) "Could not compile the unrelated worker: $($compiled.Output) $($compiled.Errors)"
    $knownHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $knownWorker).Hash
    $otherHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $otherWorker).Hash
    Assert-Condition ($knownHash -ne $otherHash) 'The two process images are identical'

    $shellPath = (Get-Process -Id $PID).Path
    $buildScript = Join-Path $projectRoot 'cleanup\build.ps1'
    Assert-Condition (Test-Path -LiteralPath $buildScript -PathType Leaf) 'Fixture build script is unavailable'
    $build = Invoke-Captured $shellPath @('-NoProfile', '-File', $buildScript, '-Test', '-FixtureImage', $knownWorker) 'build-fixture'
    Assert-Condition ($build.ExitCode -eq 0) "Fixture build failed: $($build.Output) $($build.Errors)"
    Copy-RunAsset $builtFixtureExe $fixtureExe
    $fixtureHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $fixtureExe).Hash
    Save-RunText (Join-Path $runRoot 'fixture-sha256.txt') $fixtureHash
}
catch {
    $results.Add([pscustomobject]@{ Name = 'Fixture preparation'; Status = 'BLOCKED'; Evidence = $_.Exception.Message })
    Save-RunText (Join-Path $runRoot 'summary.json') ($results | ConvertTo-Json -Depth 4 -AsArray)
    throw
}

Invoke-Check 'Multiple copies, updater, temporary files, profile data and unrelated content' {
    $fixture = New-Fixture 'clean'
    $first = Join-Path $fixture 'installs\A'
    $second = Join-Path $fixture 'installs\B'
    $portable = Join-Path $fixture 'portable\Deep Folder\Travel Copy'
    $firstData = Join-Path $first 'Data'
    $secondData = Join-Path $second 'Data'
    $portableData = Join-Path $fixture 'profiles\user-b\Custom store'
    Add-Install $first $firstData $pulseExe
    Add-Install $second $secondData $originalPulseFixture
    Add-Install $portable $portableData $pulseExe 'Travel Messenger.exe'
    Add-WebView $firstData
    Add-WebView $secondData
    Add-WebView $portableData
    $updater = Join-Path $second 'Pulse-Update-2.exe'
    $temporary = Join-Path $second ('.pulse-update-' + [Guid]::NewGuid().ToString('N') + '.tmp')
    $backup = Join-Path $second 'Pulse.exe.bak'
    Copy-RunAsset $updaterExe $updater
    Copy-RunAsset $pulseExe $temporary
    Copy-RunAsset $pulseExe $backup
    $foreignTemp = Join-Path $second ('.pulse-update-' + [Guid]::NewGuid().ToString('N') + '.rollback')
    Save-RunText $foreignTemp 'No Pulse executable content'

    $document = Join-Path $first 'Pulse notes.txt'
    $unownedData = Join-Path $firstData 'User Documents\Pulse notes.txt'
    $downloads = Join-Path $fixture 'profiles\user-a\Downloads\Pulse\Pulse project.txt'
    $impostor = Join-Path $fixture 'portable\Pulse Tools\Pulse.exe'
    $selfCopy = Join-Path $first 'Pulse-Cleanup.exe'
    foreach ($unrelated in @($document, $unownedData, $downloads)) {
        Save-RunText $unrelated 'User content that the cleaner must retain.'
    }
    Copy-RunAsset $otherWorker $impostor
    Copy-RunAsset $fixtureExe $selfCopy

    $originals = @($document, $unownedData, $downloads, $impostor, $selfCopy, $foreignTemp)
    $before = @{}
    foreach ($path in $originals) { $before[$path] = (Get-FileHash -Algorithm SHA256 -LiteralPath $path).Hash }

    $ownedFiles = @((Join-Path $first 'Pulse.exe'), (Join-Path $second 'Pulse.exe'),
        (Join-Path $portable 'Travel Messenger.exe'), $updater, $temporary, $backup)
    $preview = Invoke-Fixture '--preview' $fixture 'clean-preview'
    Assert-Condition ($preview.ExitCode -eq 0) "Preview failed: $($preview.Errors)"
    foreach ($path in $ownedFiles) {
        Assert-Report $preview $path @('planned')
        Assert-Condition (Test-Path -LiteralPath $path -PathType Leaf) "Preview modified $path"
    }
    foreach ($path in $originals) {
        Assert-Condition (@(Get-ReportRows $preview $path @('planned')).Count -eq 0) "Preview selected protected file: $path"
    }

    $applied = Invoke-Fixture '--apply-fixture' $fixture 'clean-apply'
    Assert-Condition ($applied.ExitCode -eq 0) "Apply failed: $($applied.Errors)"
    foreach ($path in $ownedFiles) {
        Assert-Removed $path
        Assert-Report $applied $path @('removed')
    }
    foreach ($data in @($firstData, $secondData, $portableData)) {
        Assert-Removed (Join-Path $data 'WebView')
        Assert-Removed (Join-Path $data 'bin\1.4.0\WebView2Loader.dll')
        Assert-Removed (Join-Path $data 'pulse.log')
    }
    foreach ($install in @($first, $second, $portable)) { Assert-Removed (Join-Path $install 'Pulse.ini') }
    foreach ($path in $originals) { Assert-Preserved $path $before[$path] }

    $repeated = Invoke-Fixture '--apply-fixture' $fixture 'clean-repeat'
    foreach ($path in $ownedFiles) { Assert-Removed $path }
    foreach ($path in $originals) { Assert-Preserved $path $before[$path] }
    Assert-Condition ($repeated.ExitCode -eq 0) "Repeat did not execute: $($repeated.Errors)"
    Assert-Condition (@(Get-ReportRows $repeated '' @('removed', 'remaining')).Count -eq 0) "Unexpected repeat result: $($repeated.Output)"
    Save-RunText (Join-Path $runRoot 'post-clean-paths.json') (
        [pscustomobject]@{ Fixture = $fixture; InstallA = $first; InstallB = $second; DataA = $firstData; DataB = $secondData } |
            ConvertTo-Json)
    return 'clean-preview.stdout.txt, clean-apply.stdout.txt, clean-repeat.stdout.txt'
}

Invoke-Check 'Sharing violation, access denied, reported residual and retry' {
    $fixture = New-Fixture 'blocked'
    $install = Join-Path $fixture 'portable\Nondefault'
    $data = Join-Path $fixture 'profiles\second-user\custom test folder'
    Add-Install $install $data $pulseExe
    Add-WebView $data
    $locked = Join-Path $data 'WebView\EBWebView\Default\Cache\Cache_Data\data_0'
    $denied = Join-Path $data 'WebView\EBWebView\Default\Network\Cookies'
    $deniedParent = [IO.Path]::GetDirectoryName($denied)
    $fileAcl = Get-Acl -LiteralPath $denied
    $parentAcl = Get-Acl -LiteralPath $deniedParent
    $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $fileDeny = [Security.AccessControl.FileSystemAccessRule]::new($sid, [Security.AccessControl.FileSystemRights]::Delete, 'Deny')
    $folderDeny = [Security.AccessControl.FileSystemAccessRule]::new($sid, [Security.AccessControl.FileSystemRights]::DeleteSubdirectoriesAndFiles, 'Deny')
    $handle = [IO.File]::Open($locked, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
    try {
        $nextFileAcl = Get-Acl -LiteralPath $denied
        $nextFileAcl.AddAccessRule($fileDeny)
        Set-Acl -LiteralPath $denied -AclObject $nextFileAcl
        $nextParentAcl = Get-Acl -LiteralPath $deniedParent
        $nextParentAcl.AddAccessRule($folderDeny)
        Set-Acl -LiteralPath $deniedParent -AclObject $nextParentAcl
        Check-DeleteBlocked $locked 32
        Check-DeleteBlocked $denied 5

        $applied = Invoke-Fixture '--apply-fixture' $fixture 'blocked-apply'
        Assert-Condition ($applied.ExitCode -eq 0) "Blocked fixture did not execute: $($applied.Errors)"
        Assert-Condition (Test-Path -LiteralPath $locked -PathType Leaf) 'The locked file was missing'
        Assert-Condition (Test-Path -LiteralPath $denied -PathType Leaf) 'The denied file was missing'
        Assert-Report $applied $locked @('remaining')
        Assert-Report $applied $denied @('remaining')
        $lockReason = @(Get-ReportRows $applied $locked @('remaining'))[0].Detail
        $deniedReason = @(Get-ReportRows $applied $denied @('remaining'))[0].Detail
    Assert-Condition ($lockReason -match 'Windows 32') 'The report did not identify the sharing violation'
    Assert-Condition ($deniedReason -match 'Windows 5') 'The report did not identify access denial'
        Assert-Removed (Join-Path $data 'pulse.log')
    }
    finally {
        $handle.Dispose()
        if (Test-Path -LiteralPath $deniedParent) { Set-Acl -LiteralPath $deniedParent -AclObject $parentAcl }
        if (Test-Path -LiteralPath $denied) { Set-Acl -LiteralPath $denied -AclObject $fileAcl }
    }
    $retry = Invoke-Fixture '--apply-fixture' $fixture 'blocked-retry'
    Assert-Removed $locked
    Assert-Removed $denied
    Assert-Removed (Join-Path $install 'Pulse.exe')
    Assert-Condition (@(Get-ReportRows $retry '' @('remaining')).Count -eq 0) "Retry stayed incomplete: $($retry.Output)"
    return 'Win32 32 and 5 reproduced, blocked-apply.stdout.txt, blocked-retry.stdout.txt'
}

Invoke-Check 'Junction, lexical boundary and unmarked root' {
    $fixture = New-Fixture 'boundary'
    $outside = Join-Path $runRoot 'boundary-outside'
    $canary = Join-Path $outside 'Do not remove Pulse.txt'
    $outsideImage = Join-Path $outside 'Pulse.exe'
    $outsideData = Join-Path $outside 'Data'
    Copy-RunAsset $pulseExe $outsideImage
    Add-WebView $outsideData
    Save-RunText $canary 'Outside all cleanup roots'
    $outsideStore = Join-Path $outsideData 'WebView\EBWebView\Default\Local Storage\leveldb\000001.log'
    $outsideHashes = @{}
    foreach ($path in @($canary, $outsideImage, $outsideStore)) {
        $outsideHashes[$path] = (Get-FileHash -Algorithm SHA256 -LiteralPath $path).Hash
    }

    $linkedInstall = Join-Path $fixture 'installs\Redirect'
    Add-Junction $linkedInstall $outside
    $inside = Join-Path $fixture 'portable\Real inside'
    Add-Install $inside $outsideData $pulseExe
    $local = Join-Path $fixture 'installs\Local'
    $localData = Join-Path $local 'Data'
    Add-Install $local $localData $pulseExe
    Add-WebView $localData
    $linkedCache = Join-Path $localData 'WebView\EBWebView\Default\Cache\Redirect'
    Add-Junction $linkedCache $outside
    $linkedFile = Join-Path $localData 'WebView\EBWebView\Default\Cache\Cache_Data\data_8'
    Assert-InRun $linkedFile
    Assert-InRun $canary
    New-Item -ItemType HardLink -Path $linkedFile -Target $canary | Out-Null
    $streamFile = Join-Path $localData 'WebView\EBWebView\Default\Cache\Cache_Data\data_9'
    Save-RunText $streamFile 'Synthetic Chromium cache with extra user data'
    Set-Content -LiteralPath $streamFile -Stream 'user-copy' -Value 'Private fixture data'
    $streamHash = (Get-FileHash -LiteralPath $streamFile -Algorithm SHA256).Hash
    $independentImage = Join-Path $fixture 'installs\Independent\Pulse.exe'
    Copy-RunAsset $pulseExe $independentImage

    $unmarked = Join-Path $fixtureArea 'unmarked'
    Copy-RunAsset $pulseExe (Join-Path $unmarked 'installs\Pulse.exe')
    $refused = Invoke-Fixture '--apply-fixture' $unmarked 'guard-no-marker' -GuardProbe
    Assert-Condition ($refused.ExitCode -eq 2) 'The test executable did not reject a root without its marker'
    Assert-Condition (Test-Path -LiteralPath (Join-Path $unmarked 'installs\Pulse.exe')) 'Unmarked root was modified'

    $alias = Join-Path $fixtureArea 'boundary-junction'
    Add-Junction $alias $fixture
    $refused = Invoke-Fixture '--apply-fixture' $alias 'guard-reparse-root' -GuardProbe
    Assert-Condition ($refused.ExitCode -eq 2) 'The test executable did not reject a root junction'
    Assert-Condition (Test-Path -LiteralPath (Join-Path $inside 'Pulse.exe')) 'Rejected root junction was modified'

    $applied = Invoke-Fixture '--apply-fixture' $fixture 'boundary-apply'
    Assert-Condition ($applied.ExitCode -eq 0) "Boundary fixture did not execute: $($applied.Errors)"
    foreach ($path in $outsideHashes.Keys) { Assert-Preserved $path $outsideHashes[$path] }
    Assert-Removed $independentImage
    Assert-Preserved $linkedFile $outsideHashes[$canary]
    Assert-Preserved $streamFile $streamHash
    Assert-Condition ((Get-Content -LiteralPath $streamFile -Stream 'user-copy') -eq 'Private fixture data') 'Alternate user data changed'
    Assert-Report $applied $linkedInstall @('unchecked', 'remaining')
    Assert-Report $applied $linkedCache @('unchecked', 'remaining')
    Assert-Report $applied $linkedFile @('unchecked', 'remaining')
    Assert-Report $applied $streamFile @('unchecked', 'remaining')
    $refusedTargets = @(Get-ReportRows $applied $outsideData @('unchecked', 'remaining')) +
        @(Get-ReportRows $applied (Join-Path $inside 'Pulse.ini') @('unchecked', 'remaining'))
    Assert-Condition ($refusedTargets.Count -gt 0) 'Report omitted the rejected out-of-fixture data path'
    return 'guard-no-marker.stdout.txt, guard-reparse-root.stdout.txt, boundary-apply.stdout.txt'
}

Invoke-Check 'Shared WebView profile keeps data from another origin' {
    $fixture = New-Fixture 'shared-profile'
    $install = Join-Path $fixture 'installs\Verified copy'
    $data = Join-Path $fixture 'profiles\Shared Data'
    Add-Install $install $data $pulseExe
    Add-WebView $data
    $sharedStore = Join-Path $data 'WebView\EBWebView\Default\Local Storage\leveldb\000001.log'
    Save-RunText $sharedStore ('https://app.pulse.invalid synthetic Pulse entry' + $nl + 'https://other-app.invalid synthetic other app entry')
    $foreignBucket = Join-Path $data 'WebView\EBWebView\Default\IndexedDB\https_other-app.invalid_0.indexeddb.leveldb'
    $foreignRecord = Join-Path $foreignBucket '000003.ldb'
    Save-RunText $foreignRecord 'Other application test record'
    $sharedHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $sharedStore).Hash
    $foreignHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $foreignRecord).Hash

    $applied = Invoke-Fixture '--apply-fixture' $fixture 'mixed-apply'
    Assert-Condition ($applied.ExitCode -eq 0) "Mixed profile fixture did not execute: $($applied.Errors)"
    Assert-Preserved $foreignRecord $foreignHash
    Assert-Preserved $sharedStore $sharedHash
    Assert-Condition (@(Get-ReportRows $applied '' @('unchecked', 'remaining')).Count -gt 0) 'Mixed profile was reported as completely removed'
    return 'mixed-apply.stdout.txt'
}

Invoke-Check 'Known process stopped and same-name third-party process preserved' {
    $fixture = New-Fixture 'processes'
    $install = Join-Path $fixture 'portable\Verified process'
    $image = Join-Path $install 'Pulse.exe'
    $unrelatedImage = Join-Path $fixture 'portable\Completely separate\Pulse.exe'
    Copy-RunAsset $knownWorker $image
    Copy-RunAsset $otherWorker $unrelatedImage
    Assert-InRun $image
    Assert-InRun $unrelatedImage
    $workers = [Collections.Generic.List[Diagnostics.Process]]::new()
    try {
        $approved = Start-RunProcess $image @()
        $workers.Add($approved)
        $unrelated = Start-RunProcess $unrelatedImage @()
        $workers.Add($unrelated)
        Assert-Condition (!$approved.HasExited -and !$unrelated.HasExited) 'A fixture worker exited before the check'
        Save-RunText (Join-Path $fixture 'fixture-pids.txt') (@($approved.Id, $unrelated.Id, '') -join $nl)

        $applied = Invoke-Fixture '--apply-fixture' $fixture 'process-apply'
        Assert-Condition ($applied.ExitCode -eq 0) "Process fixture did not execute: $($applied.Errors)"
        Assert-Condition ($approved.WaitForExit(5000)) "The known process is still running: $($approved.Id)"
        Assert-Condition (!$unrelated.HasExited) "The unrelated process was stopped: $($unrelated.Id)"
        Assert-Report $applied $image @('removed')
        Assert-Condition ($applied.Output -match ('(?<!\d)' + $approved.Id + '(?!\d)')) "Report omitted terminated PID $($approved.Id)"
        Assert-Removed $image
        Assert-Preserved $unrelatedImage $otherHash
        return "Verified PID $($approved.Id) stopped, unrelated PID $($unrelated.Id) remained, process-apply.stdout.txt"
    }
    finally {
        foreach ($worker in $workers) {
            try {
                if (!$worker.HasExited) {
                    $worker.Kill()
                    [void] $worker.WaitForExit(5000)
                }
            }
            finally { $worker.Dispose() }
        }
    }
}

Save-RunText (Join-Path $runRoot 'summary.json') ($results | ConvertTo-Json -Depth 4 -AsArray)
[Console]::WriteLine('Evidence in ' + $runRoot)
if ($results.Status -contains 'FAIL') { exit 1 }

