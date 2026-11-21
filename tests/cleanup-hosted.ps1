#Requires -Version 5.1
[CmdletBinding()]
param(
    [Parameter(Mandatory)] [string] $CleanupExe,
    [Parameter(Mandatory)] [string] $PulseExe,
    [string] $Report = 'test-runs\cleanup-hosted.json'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($env:GITHUB_ACTIONS -cne 'true' -or $env:RUNNER_ENVIRONMENT -cne 'github-hosted' -or
    $env:RUNNER_ARCH -cne 'X64' -or [string]::IsNullOrWhiteSpace($env:RUNNER_TEMP)) {
    throw 'This test requires a disposable x64 GitHub-hosted runner.'
}
$os = Get-CimInstance Win32_OperatingSystem
if ($os.ProductType -ne 3 -or $os.Caption -notmatch '2025' -or [int]$os.BuildNumber -lt 26100) {
    throw 'This test requires the Windows Server 2025 hosted runner.'
}
if ([Threading.Thread]::CurrentThread.ApartmentState -ne 'STA' -or $PSVersionTable.PSEdition -ne 'Desktop') {
    throw 'Launch this test with Windows PowerShell and -STA.'
}

$runnerTemp = [IO.Path]::GetFullPath($env:RUNNER_TEMP).TrimEnd('\')
$fixture = Join-Path $runnerTemp 'pulse-cleanup-hosted'
$project = Split-Path -Parent $PSScriptRoot
$cleanupPath = (Resolve-Path -LiteralPath $CleanupExe).Path
$releasePath = (Resolve-Path -LiteralPath $PulseExe).Path
$baseline = Join-Path $project 'baseline\Pulse.exe'
$updater = Join-Path $project 'baseline\Pulse-Update-2.exe'
$reportPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Report)
$runKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$uninstallBase = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall'
$title = 'Полное удаление Pulse'
$utf8 = New-Object Text.UTF8Encoding($false)
$nl = [Environment]::NewLine
$checks = New-Object 'System.Collections.Generic.List[object]'
$workers = New-Object 'System.Collections.Generic.List[Diagnostics.Process]'
$registered = @{}
$observations = [ordered]@{}
$locks = $null
$fileAcl = $null
$parentAcl = $null
$denied = $null
$deniedParent = $null
$postCleanReady = $false

function Need([bool] $value, [string] $message) {
    if (!$value) { throw $message }
}

function Check([string] $name, [bool] $satisfied, [string] $detail) {
    $status = if ($satisfied) { 'PASS' } else { 'FAIL' }
    $checks.Add([pscustomobject]@{ name = $name; status = $status; evidence = $detail })
}

function Blocked([string] $name, [string] $detail) {
    $checks.Add([pscustomobject]@{ name = $name; status = 'BLOCKED'; evidence = $detail })
}

function Protect-Path([string] $path) {
    for ($part = $path; $part; $part = [IO.Path]::GetDirectoryName($part)) {
        if (Test-Path -LiteralPath $part) {
            $item = Get-Item -LiteralPath $part -Force
            Need (!(($item.Attributes -band [IO.FileAttributes]::ReparsePoint))) "Reparse parent in setup: $part"
        }
    }
}

function New-TestDirectory([string] $path) {
    $full = [IO.Path]::GetFullPath($path)
    Need ($full -eq $fixture -or $full.StartsWith($fixture + '\', [StringComparison]::OrdinalIgnoreCase)) 'A fixture path is outside RUNNER_TEMP.'
    Protect-Path $full
    [void] [IO.Directory]::CreateDirectory($full)
}

function Fixture-File([string] $path, [string] $content) {
    Protect-Path $path
    New-TestDirectory ([IO.Path]::GetDirectoryName($path))
    [IO.File]::WriteAllText($path, $content, $utf8)
}

function Fixture-Install([string] $folder, [string] $source, [switch] $SeedProfile) {
    New-TestDirectory $folder
    $image = Join-Path $folder 'Pulse.exe'
    $data = Join-Path $folder 'Data'
    [IO.File]::Copy($source, $image)
    Fixture-File (Join-Path $folder 'Pulse.ini') (@(
        '; Pulse от exepcstudio — настройки этой копии', "data=$data", 'tray=0', 'autostart=0', '') -join $nl)
    if ($SeedProfile) {
        $browser = Join-Path $data 'WebView\EBWebView'
        Fixture-File (Join-Path $browser 'Local State') '{"profile":{"info_cache":{"Default":{}}}}'
        Fixture-File (Join-Path $browser 'Default\Preferences') '{"profile":{}}'
        Fixture-File (Join-Path $browser 'Default\Local Storage\leveldb\000001.log') 'https://app.pulse.invalid synthetic hosted fixture'
        Fixture-File (Join-Path $browser 'Default\Session Storage\000002.log') 'synthetic session'
        Fixture-File (Join-Path $browser 'Default\Cache\Cache_Data\data_0') 'synthetic cache'
        Fixture-File (Join-Path $browser 'Default\Network\Cookies') 'synthetic cookie store'
        Fixture-File (Join-Path $data 'pulse.log') '2026-11-21 00:00:00 bridge synthetic hosted fixture'
        $bin = Join-Path $data 'bin\1.4.0'
        New-TestDirectory $bin
        [IO.File]::WriteAllBytes((Join-Path $bin 'WebView2Loader.dll'), $loaderBytes)
    }
    return [pscustomobject]@{ image = $image; data = $data; folder = $folder }
}

function Get-RegValue([string] $key, [string] $name) {
    $entry = Get-ItemProperty -LiteralPath $key -Name $name -ErrorAction SilentlyContinue
    if ($null -ne $entry) { return $entry.$name }
    return $null
}

function Set-RunHint([string] $name, [string] $path) {
    $value = '"' + $path + '"'
    if (!$registered.ContainsKey($name)) {
        Need ($null -eq (Get-RegValue $runKey $name)) "An unexpected autostart entry already exists: $name"
        $registered[$name] = $value
    }
    Need ($registered[$name] -ceq $value) 'Tried to replace a different fixture registration.'
    New-ItemProperty -LiteralPath $runKey -Name $name -PropertyType String -Value $value -Force | Out-Null
}

function Set-Uninstall([string] $key, [string] $image, [string] $publisher) {
    Need (!(Test-Path -LiteralPath $key)) "An unexpected uninstall entry already exists: $key"
    New-Item -Path $key | Out-Null
    New-ItemProperty -LiteralPath $key -Name 'DisplayName' -Value 'Pulse' | Out-Null
    New-ItemProperty -LiteralPath $key -Name 'Publisher' -Value $publisher | Out-Null
    New-ItemProperty -LiteralPath $key -Name 'InstallLocation' -Value ([IO.Path]::GetDirectoryName($image)) | Out-Null
    New-ItemProperty -LiteralPath $key -Name 'DisplayIcon' -Value ($image + ',0') | Out-Null
    New-ItemProperty -LiteralPath $key -Name 'UninstallString' -Value ('"' + $image + '" --uninstall') | Out-Null
}

function Set-Link([string] $path, [string] $image) {
    Protect-Path $path
    Need (!(Test-Path -LiteralPath $path)) "An unexpected shortcut already exists: $path"
    $shell = New-Object -ComObject WScript.Shell
    try {
        $link = $shell.CreateShortcut($path)
        try { $link.TargetPath = $image; $link.Save() }
        finally { [void] [Runtime.InteropServices.Marshal]::ReleaseComObject($link) }
    }
    finally { [void] [Runtime.InteropServices.Marshal]::ReleaseComObject($shell) }
}

function Start-OwnedProcess([string] $image, [switch] $disableExternalNetwork) {
    $info = New-Object Diagnostics.ProcessStartInfo($image)
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.WorkingDirectory = [IO.Path]::GetDirectoryName($image)
    if ($disableExternalNetwork) {
        $info.EnvironmentVariables['WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS'] =
            '--disable-background-networking --disable-component-update --host-resolver-rules="MAP * ~NOTFOUND, EXCLUDE localhost"'
    }
    $process = [Diagnostics.Process]::Start($info)
    $workers.Add($process)
    return $process
}

function Wait-Until([scriptblock] $probe, [string] $failure, [int] $seconds = 120) {
    $deadline = [DateTime]::UtcNow.AddSeconds($seconds)
    do {
        $result = & $probe
        if ($result) { return $result }
        Start-Sleep -Milliseconds 150
    } while ([DateTime]::UtcNow -lt $deadline)
    throw $failure
}

function Ui-Control([IntPtr] $window, [string] $text) {
    $child = [HostedCleanupUi]::Child($window, $text)
    Need ($child -ne [IntPtr]::Zero) "Could not find cleanup control $text"
    return $child
}

function Gui-Report([IntPtr] $window, [string] $prefix = '') {
    $copy = Ui-Control $window 'Скопировать отчёт'
    [void] (Wait-Until { [HostedCleanupUi]::IsWindowEnabled($copy) } 'The cleanup window did not finish the current operation.')
    $sentinel = [Guid]::NewGuid().ToString('N')
    [Windows.Forms.Clipboard]::SetText($sentinel)
    [HostedCleanupUi]::Click($copy)
    return Wait-Until {
        try {
            $current = [Windows.Forms.Clipboard]::GetText()
            if ($current -and $current -ne $sentinel -and (!$prefix -or $current.StartsWith($prefix))) { $current }
        } catch [Runtime.InteropServices.ExternalException] {}
    } 'The cleanup window did not copy the expected report.'
}

function Gui-Apply([IntPtr] $window, [Diagnostics.Process] $process) {
    $button = Ui-Control $window 'Полностью удалить Pulse'
    $consent = Ui-Control $window 'Подтверждаю безвозвратное удаление перечисленных локальных данных и ключей'
    Need (![HostedCleanupUi]::IsWindowEnabled($button)) 'The destructive action was enabled without consent.'
    [HostedCleanupUi]::Click($consent)
    [void] (Wait-Until { [HostedCleanupUi]::IsWindowEnabled($button) } 'Consent did not enable the cleanup action.' 12)
    [HostedCleanupUi]::Click($button)
    $dialog = Wait-Until {
        $found = [HostedCleanupUi]::Window($process.Id, $title, $true)
        if ($found -ne [IntPtr]::Zero) { $found }
    } 'The release did not show its confirmation dialog.' 12
    [HostedCleanupUi]::Confirm($dialog)
    return Gui-Report $window 'Выполнено действий:'
}

function Has-Row([string] $reportText, [string] $state, [string] $target, [string] $detail = '') {
    foreach ($line in $reportText -split '\r?\n') {
        $column = $line -split '\t', 4
        if ($column.Length -eq 4 -and $column[0] -eq $state -and $column[2] -eq $target -and
            (!$detail -or $column[3].Contains($detail))) { return $true }
    }
    return $false
}

function Hide-RunnerPaths([string] $value) {
    if (!$value) { return '' }
    $value = $value.Replace($fixture, '<fixture>').Replace($runnerTemp, '<runner-temp>')
    if ($env:USERPROFILE) { $value = $value.Replace($env:USERPROFILE, '<runner-profile>') }
    return $value.Replace($project, '<checkout>')
}

function Selected-Rows([string] $reportText, [string] $category, [string] $targetPattern) {
    foreach ($line in $reportText -split '\r?\n') {
        $column = $line -split '\t', 4
        if ($column.Length -eq 4 -and $column[1] -match $category -and $column[2] -match $targetPattern) {
            [pscustomobject]@{ status = $column[0]; target = Hide-RunnerPaths $column[2]; detail = Hide-RunnerPaths $column[3] }
        }
    }
}

function Gone([string] $path) { return !(Test-Path -LiteralPath $path) }

function Verify-DeleteError([string] $path, [int] $code) {
    Protect-Path $path
    try { [IO.File]::Delete($path) }
    catch {
        Need (($_.Exception.GetBaseException().HResult -band 0xffff) -eq $code) 'The controlled fault did not return the expected Windows error.'
        return
    }
    throw 'The controlled fault allowed the file to be deleted.'
}

function Release-Faults {
    if ($null -ne $script:locks) { $script:locks.Dispose(); $script:locks = $null }
    if ($null -ne $parentAcl -and (Test-Path -LiteralPath $deniedParent)) {
        Set-Acl -LiteralPath $deniedParent -AclObject $parentAcl
        $script:parentAcl = $null
    }
    if ($null -ne $fileAcl -and (Test-Path -LiteralPath $denied)) {
        Set-Acl -LiteralPath $denied -AclObject $fileAcl
        $script:fileAcl = $null
    }
}

$cleanupHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $cleanupPath).Hash
$pulseHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $releasePath).Hash
Need ([IO.Path]::GetFileName($cleanupPath) -ceq 'Pulse-Cleanup.exe') 'The exact release cleanup filename is required.'
Need ((Get-FileHash -Algorithm SHA256 -LiteralPath $baseline).Hash -eq 'A25F33E71364BE8CC1E6FAE56210D4A354F87D1ADF29752562667513FCCF4005') 'The supplied baseline image changed.'
Need (!(Test-Path -LiteralPath $fixture)) 'RUNNER_TEMP fixture already exists. Use a fresh hosted VM.'
Protect-Path $runnerTemp

try {
    Add-Type -Path (Join-Path $PSScriptRoot 'cleanup-hosted-ui.cs')
    Add-Type -AssemblyName System.Windows.Forms
    [void] [IO.Directory]::CreateDirectory($fixture)
    $baselineAssembly = [Reflection.Assembly]::ReflectionOnlyLoad([IO.File]::ReadAllBytes($baseline))
    $resource = $baselineAssembly.GetManifestResourceStream('lib.WebView2Loader.dll')
    $loader = New-Object IO.MemoryStream
    try { $resource.CopyTo($loader); $loaderBytes = $loader.ToArray() }
    finally { $resource.Dispose(); $loader.Dispose() }

    $a = Fixture-Install (Join-Path $fixture 'installs\A') $baseline -SeedProfile
    $b = Fixture-Install (Join-Path $fixture 'installs\B') $releasePath -SeedProfile
    $busy = Fixture-Install (Join-Path $fixture 'faults\Busy') $baseline -SeedProfile
    $live = Fixture-Install (Join-Path $fixture 'runtime\Pulse') $baseline
    $redirect = Fixture-Install (Join-Path $fixture 'faults\Redirect') $baseline -SeedProfile
    $oldUpdater = Join-Path $a.folder 'Pulse-Update-2.exe'
    $staged = Join-Path $b.folder ('.pulse-update-' + [Guid]::NewGuid().ToString('N') + '.tmp')
    [IO.File]::Copy($updater, $oldUpdater)
    [IO.File]::Copy($baseline, $staged)
    $userFile = Join-Path $b.folder 'Pulse User Document.txt'
    Fixture-File $userFile 'Unrelated user document'
    $userHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $userFile).Hash
    $outer = Join-Path $fixture 'unrelated\Canary'
    $unrelatedFile = Join-Path $outer 'Pulse Notes.txt'
    Fixture-File $unrelatedFile 'Outside the confirmed WebView profile'
    $outerHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $unrelatedFile).Hash
    $junction = Join-Path $redirect.data 'WebView\EBWebView\Default\Cache\Redirect'
    Need (!(Test-Path -LiteralPath $junction)) 'The fixture junction already exists.'
    New-Item -ItemType Junction -Path $junction -Target $outer | Out-Null

    $otherImage = Join-Path $fixture 'unrelated\Other Product\Pulse.exe'
    New-TestDirectory ([IO.Path]::GetDirectoryName($otherImage))
    $compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
    & $compiler /nologo /target:exe /platform:x64 /define:UNRELATED "/out:$otherImage" (Join-Path $PSScriptRoot 'cleanup-test-process.cs')
    Need ($LASTEXITCODE -eq 0) 'Could not compile the same-name third-party worker.'
    $otherImageHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $otherImage).Hash

    foreach ($registryParent in @($runKey, $uninstallBase)) {
        if (!(Test-Path -LiteralPath $registryParent)) { New-Item -Path $registryParent | Out-Null }
    }
    $uninstall = Join-Path $uninstallBase 'exepcstudio.Pulse'
    $otherUninstall = Join-Path $uninstallBase 'Pulse.HostedFixture.ThirdParty'
    Set-Uninstall $uninstall $b.image 'exepcstudio'
    Set-Uninstall $otherUninstall $otherImage 'Hosted Fixture Other'
    Set-RunHint 'Pulse' $a.image
    Set-RunHint 'Pulse Hosted Fixture Busy' $busy.image
    Set-RunHint 'Pulse Hosted Fixture Redirect' $redirect.image
    Set-RunHint 'Pulse Hosted Fixture Runtime' $live.image
    Set-RunHint 'Pulse Hosted Fixture Other' $otherImage
    $desktop = [Environment]::GetFolderPath('DesktopDirectory')
    Need (Test-Path -LiteralPath $desktop -PathType Container) 'The hosted runner has no desktop folder.'
    $shortcut = Join-Path $desktop 'Pulse.lnk'
    $otherShortcut = Join-Path $desktop 'Pulse Hosted Fixture Other.lnk'
    Set-Link $shortcut $a.image
    Set-Link $otherShortcut $otherImage
    $otherShortcutHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $otherShortcut).Hash

    $taskPair = $false
    $taskName = 'Pulse.HostedFixture.Confirmed'
    $otherTaskName = 'Pulse.HostedFixture.Unrelated'
    try {
        $taskUser = [Security.Principal.WindowsIdentity]::GetCurrent().Name
        Need ($null -eq (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue)) 'The confirmed task already exists.'
        Need ($null -eq (Get-ScheduledTask -TaskName $otherTaskName -ErrorAction SilentlyContinue)) 'The unrelated task already exists.'
        Register-ScheduledTask -TaskName $taskName -Action (New-ScheduledTaskAction -Execute $b.image) -User $taskUser | Out-Null
        Register-ScheduledTask -TaskName $otherTaskName -Action (New-ScheduledTaskAction -Execute $otherImage) -User $taskUser | Out-Null
        $confirmedTaskBefore = Get-ScheduledTask -TaskName $taskName
        $taskActionExact = @($confirmedTaskBefore.Actions).Count -eq 1 -and $confirmedTaskBefore.Actions[0].Execute -eq $b.image
        $taskPair = $true
    } catch { Blocked 'Windows scheduled tasks' 'The hosted runner could not create both disposable tasks.' }

    $servicePair = $false
    $serviceName = 'PulseHostedFixtureConfirmed'
    $otherServiceName = 'PulseHostedFixtureUnrelated'
    try {
        Need ($null -eq (Get-Service -Name $serviceName -ErrorAction SilentlyContinue)) 'The confirmed service already exists.'
        Need ($null -eq (Get-Service -Name $otherServiceName -ErrorAction SilentlyContinue)) 'The unrelated service already exists.'
        New-Service -Name $serviceName -BinaryPathName ('"' + $b.image + '"') -StartupType Disabled | Out-Null
        New-Service -Name $otherServiceName -BinaryPathName ('"' + $otherImage + '"') -StartupType Disabled | Out-Null
        $servicePair = $true
    } catch { Blocked 'Windows service registration' 'The hosted runner could not create both disabled disposable services.' }

    $locked = Join-Path $busy.data 'WebView\EBWebView\Default\Cache\Cache_Data\data_0'
    $denied = Join-Path $busy.data 'WebView\EBWebView\Default\Network\Cookies'
    $deniedParent = [IO.Path]::GetDirectoryName($denied)
    $fileAcl = Get-Acl -LiteralPath $denied
    $parentAcl = Get-Acl -LiteralPath $deniedParent
    $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $rule = New-Object Security.AccessControl.FileSystemAccessRule($sid, [Security.AccessControl.FileSystemRights]::Delete, 'Deny')
    $changed = Get-Acl -LiteralPath $denied
    $changed.AddAccessRule($rule)
    Set-Acl -LiteralPath $denied -AclObject $changed
    $rule = New-Object Security.AccessControl.FileSystemAccessRule($sid, [Security.AccessControl.FileSystemRights]::DeleteSubdirectoriesAndFiles, 'Deny')
    $changed = Get-Acl -LiteralPath $deniedParent
    $changed.AddAccessRule($rule)
    Set-Acl -LiteralPath $deniedParent -AclObject $changed
    $locks = [IO.File]::Open($locked, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
    Verify-DeleteError $locked 32
    Verify-DeleteError $denied 5

    $otherProcess = Start-OwnedProcess $otherImage
    $pulseProcess = Start-OwnedProcess $live.image -DisableExternalNetwork
    $pulseId = $pulseProcess.Id
    $browserChildren = @()
    try {
        $browserChildren = @(Wait-Until {
            Get-CimInstance Win32_Process -Filter "ParentProcessId = $pulseId AND Name = 'msedgewebview2.exe'" |
                Select-Object ProcessId, ExecutablePath, CreationDate, CommandLine
        } 'No WebView2 child appeared for the disposable Pulse launch.' 18)
    } catch { Blocked 'Actual WebView2 child' $_.Exception.Message }
    $wasAlive = !$pulseProcess.HasExited

    $cleanup = Start-OwnedProcess $cleanupPath
    $window = Wait-Until {
        $found = [HostedCleanupUi]::Window($cleanup.Id, $title, $false)
        if ($found -ne [IntPtr]::Zero) { $found }
    } 'The release GUI was not found on the hosted desktop.'
    $preview = Gui-Report $window
    Check 'Release preview and consent' (
        (Has-Row $preview 'К удалению' $a.image) -and (Has-Row $preview 'К удалению' $b.image) -and
        (Test-Path -LiteralPath $a.image) -and (Test-Path -LiteralPath $b.image) -and
        ![HostedCleanupUi]::IsWindowEnabled((Ui-Control $window 'Полностью удалить Pulse'))
    ) 'Exact release window exposed both copies and required confirmation before changes.'

    $first = Gui-Apply $window $cleanup
    $postCleanReady = (Gone $a.image) -and (Gone $b.image) -and (Gone $a.data) -and (Gone $b.data) -and
        (Gone (Join-Path $a.folder 'Pulse.ini')) -and (Gone (Join-Path $b.folder 'Pulse.ini'))
    Check 'Two installs, old updater, stage and WebView data' (
        $postCleanReady -and (Gone $oldUpdater) -and (Gone $staged) -and
        (Gone (Join-Path $a.folder 'Pulse.ini')) -and (Gone (Join-Path $b.folder 'Pulse.ini')) -and
        (Has-Row $first 'Выполнено' $a.image) -and (Has-Row $first 'Выполнено' $b.image) -and
        (Has-Row $first 'Выполнено' $oldUpdater)
    ) 'Baseline SHA, release SHA, old updater, staged binary and both synthetic WebView profiles checked on disk.'
    Check 'Windows Registry and Desktop shortcut' (
        ($null -eq (Get-RegValue $runKey 'Pulse')) -and (Gone $uninstall) -and (Gone $shortcut) -and
        (Has-Row $first 'Выполнено' $shortcut) -and (Test-Path -LiteralPath $otherUninstall) -and
        (Get-RegValue $runKey 'Pulse Hosted Fixture Other') -eq $registered['Pulse Hosted Fixture Other'] -and
        (Test-Path -LiteralPath $otherShortcut) -and
        ((Get-FileHash -Algorithm SHA256 -LiteralPath $otherShortcut).Hash -eq $otherShortcutHash)
    ) 'Exact positive Run, uninstall and LNK removed. Unrelated entries and shortcut retained.'
    if ($taskPair) {
        $taskTarget = '\' + $taskName
        $confirmedTaskAbsent = $null -eq (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue)
        $unrelatedTaskPresent = $null -ne (Get-ScheduledTask -TaskName $otherTaskName -ErrorAction SilentlyContinue)
        $taskPattern = '^(?:\\(?: / \d+)?|Библиотека планировщика)$|Pulse\.HostedFixture\.'
        $observations.taskScheduler = [ordered]@{
            exactExecutableRegistered = $taskActionExact
            confirmedTaskAbsent = $confirmedTaskAbsent
            unrelatedTaskPresent = $unrelatedTaskPresent
            plannedInPreview = Has-Row $preview 'К удалению' $taskTarget
            removalInReport = Has-Row $first 'Выполнено' $taskTarget
            preview = @(Selected-Rows $preview 'задач|планиров' $taskPattern | Select-Object -First 20)
            after = @(Selected-Rows $first 'задач|планиров' $taskPattern | Select-Object -First 20)
        }
        Check 'Windows scheduled tasks' (
            $confirmedTaskAbsent -and $unrelatedTaskPresent -and $observations.taskScheduler.removalInReport
        ) "Confirmed task absent $confirmedTaskAbsent, unrelated task present $unrelatedTaskPresent, report recorded removal $($observations.taskScheduler.removalInReport)."
    }
    if ($servicePair) {
        Check 'Windows service registration' (
            ($null -eq (Get-Service -Name $serviceName -ErrorAction SilentlyContinue)) -and
            ($null -ne (Get-Service -Name $otherServiceName -ErrorAction SilentlyContinue)) -and
            (Has-Row $first 'Выполнено' $serviceName)
        ) 'Confirmed disabled service registration removed. The unrelated entry was retained.'
    }
    Check 'Unrelated executable, process, documents and junction target' (
        !$otherProcess.HasExited -and
        (Test-Path -LiteralPath $otherImage) -and ((Get-FileHash -Algorithm SHA256 -LiteralPath $otherImage).Hash -eq $otherImageHash) -and
        (Test-Path -LiteralPath $userFile) -and ((Get-FileHash -Algorithm SHA256 -LiteralPath $userFile).Hash -eq $userHash) -and
        (Test-Path -LiteralPath $unrelatedFile) -and ((Get-FileHash -Algorithm SHA256 -LiteralPath $unrelatedFile).Hash -eq $outerHash) -and
        (Has-Row $first 'Не проверено' $junction)
    ) 'The same-name worker stayed live. Document and junction-target hashes were preserved.'
    Check 'Actual Pulse process' (
        $wasAlive -and $pulseProcess.HasExited -and (Has-Row $first 'Выполнено' "$($live.image) (PID $pulseId)")
    ) (
        "Disposable baseline process was live before cleanup and its PID appeared in the report."
    )
    if ($browserChildren.Count -gt 0) {
        $browserIds = @($browserChildren | Select-Object -ExpandProperty ProcessId)
        $survivors = @(Get-Process -Id $browserIds -ErrorAction SilentlyContinue)
        $unreported = @($browserChildren | Where-Object {
            !(Has-Row $first 'Выполнено' "$($_.ExecutablePath) (PID $($_.ProcessId))")
        })
        $processPattern = '\(PID (?:' + ((@($pulseId) + $browserIds) -join '|') + ')\)$'
        $expectedProfile = Join-Path $live.data 'WebView'
        $observations.runtime = [ordered]@{
            pulsePid = $pulseId
            browserChildrenAliveAfterCleanup = $survivors.Count
            browserChildrenMissingFromRemovalReport = $unreported.Count
            runtimeDataPresentAfterCleanup = Test-Path -LiteralPath $live.data
            runtimeWebViewPresentAfterCleanup = Test-Path -LiteralPath $expectedProfile
            preview = @(Selected-Rows $preview '^Процессы$' $processPattern)
            after = @(Selected-Rows $first '^Процессы$' $processPattern)
            browserChildren = @(
                foreach ($child in $browserChildren) {
                    $profileArgument = [regex]::Match([string]$child.CommandLine, '(?i)--user-data-dir=(?:"([^"]+)"|([^"\s]+))')
                    $profile = if ($profileArgument.Groups[1].Success) { $profileArgument.Groups[1].Value } else { $profileArgument.Groups[2].Value }
                    $version = if ($child.ExecutablePath) { [Diagnostics.FileVersionInfo]::GetVersionInfo($child.ExecutablePath) }
                    $createdUtc = if ($child.CreationDate) { $child.CreationDate.ToUniversalTime().ToString('o') }
                    $productName = if ($version) { $version.ProductName }
                    $originalFilename = if ($version) { $version.OriginalFilename }
                    $companyName = if ($version) { $version.CompanyName }
                    [pscustomobject]@{
                        pid = $child.ProcessId
                        createdUtc = $createdUtc
                        image = Hide-RunnerPaths $child.ExecutablePath
                        hasUserDataArgument = $profileArgument.Success
                        profileMatchesFixture = $profile -eq $expectedProfile
                        productName = $productName
                        originalFilename = $originalFilename
                        companyName = $companyName
                    }
                }
            )
        }
        Check 'Actual WebView2 child' (
            $survivors.Count -eq 0 -and $unreported.Count -eq 0
        ) "Observed direct children $($browserIds.Count), still alive $($survivors.Count), missing removal record $($unreported.Count)."
    }
    Check 'Windows sharing and access errors with accurate residuals' (
        (Has-Row $first 'Осталось' $locked 'Windows 32') -and
        (Has-Row $first 'Осталось' $denied 'Windows 5') -and
        (Test-Path -LiteralPath $locked -PathType Leaf) -and (Test-Path -LiteralPath $denied -PathType Leaf) -and
        (Gone (Join-Path $busy.data 'pulse.log')) -and
        $first.Contains('от имени администратора') -and $first.Contains('перезагрузка')
    ) 'Native Windows codes 32 and 5 were induced, listed for the correct files and matched remaining disk state.'

    Release-Faults
    Set-RunHint 'Pulse Hosted Fixture Busy' $busy.image
    $search = Ui-Control $window 'Повторить поиск'
    [HostedCleanupUi]::Click($search)
    $retryPlan = Gui-Report $window 'Проверьте найденные экземпляры'
    Need (Has-Row $retryPlan 'К удалению' $busy.image) 'The scoped path could not be rediscovered after clearing both faults.'
    $retry = Gui-Apply $window $cleanup
    Check 'Retry after unlocking and restoring the file ACL' (
        (Gone $locked) -and (Gone $denied) -and (Gone $busy.image) -and
        (Has-Row $retry 'Выполнено' $locked) -and (Has-Row $retry 'Выполнено' $denied)
    ) 'The same release rescanned the disposable installation after its Run hint was restored, then removed the old residuals.'

    [HostedCleanupUi]::Click($search)
    [void] (Gui-Report $window 'В проверенных областях')
    Check 'Repeat after successful cleanup' (
        ![HostedCleanupUi]::IsWindowEnabled((Ui-Control $window 'Полностью удалить Pulse')) -and
        (Gone $a.image) -and (Gone $b.image) -and (Gone $busy.image) -and !$otherProcess.HasExited
    ) 'No confirmed copies were offered for removal at the third scan.'
    Check 'Cleanup executable remains intact' (
        (Test-Path -LiteralPath $cleanupPath -PathType Leaf) -and
        ((Get-FileHash -Algorithm SHA256 -LiteralPath $cleanupPath).Hash -eq $cleanupHash)
    ) 'The exact release cleanup executable remained present and byte-for-byte identical.'
}
catch {
    $message = Hide-RunnerPaths $_.Exception.Message
    Check 'Hosted cleanup execution' $false $message
}
finally {
    try { Release-Faults }
    catch { Check 'Restore temporary test ACL' $false 'The generated Windows fixture ACL could not be restored.' }
    foreach ($process in $workers) {
        try { if (!$process.HasExited) { $process.Kill(); [void] $process.WaitForExit(4000) } }
        catch { Check 'Stop own test process' $false 'A harness-owned process could not be stopped.' }
        finally { $process.Dispose() }
    }
    [void] [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($reportPath))
    $result = [pscustomobject] @{
        environment = 'GitHub-hosted windows-2025 x64'
        windowsBuild = [int]$os.BuildNumber
        cleanupSha256 = $cleanupHash
        pulseSha256 = $pulseHash
        postCleanReady = $postCleanReady
        observations = $observations
        checks = $checks.ToArray()
    }
    [IO.File]::WriteAllText($reportPath, ($result | ConvertTo-Json -Depth 5), $utf8)
}
$checks | ForEach-Object { Write-Output ("{0} {1}" -f $_.status, $_.name) }
if (@($checks | Where-Object status -ne 'PASS').Count -gt 0) { exit 1 }

