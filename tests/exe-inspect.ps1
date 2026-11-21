param(
    [Parameter(Mandatory = $true)][int]$PulsePid,
    [Parameter(Mandatory = $true)][int]$DebugPort,
    [Parameter(Mandatory = $true)][string]$Profile
)

$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;

public static class PulseQaArguments
{
    [DllImport("shell32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr CommandLineToArgvW(string commandLine, out int count);

    [DllImport("kernel32.dll")]
    private static extern IntPtr LocalFree(IntPtr memory);

    public static string[] Parse(string commandLine)
    {
        int count;
        IntPtr argv = CommandLineToArgvW(commandLine, out count);
        if (argv == IntPtr.Zero) throw new InvalidOperationException("Unable to parse browser arguments.");
        try
        {
            string[] parts = new string[count];
            for (int index = 0; index < count; index++)
                parts[index] = Marshal.PtrToStringUni(Marshal.ReadIntPtr(argv, index * IntPtr.Size));
            return parts;
        }
        finally { LocalFree(argv); }
    }
}
'@

$children = @(Get-CimInstance Win32_Process -Filter "ParentProcessId = $PulsePid AND Name = 'msedgewebview2.exe'")
$expected = [IO.Path]::GetFullPath($Profile).TrimEnd('\')
$runtimeProfile = Join-Path $expected 'EBWebView'
$flags = @{}
foreach ($child in $children) {
    if (-not $child.CommandLine) { continue }
    $arguments = [PulseQaArguments]::Parse($child.CommandLine)
    foreach ($item in $arguments | Select-Object -Skip 1) {
        if ($item -match '^--([^=]+)(?:=(.*))?$') { $flags[$Matches[1]] = $Matches[2] }
    }
}

$profilesMatch = $null
if ($flags.ContainsKey('user-data-dir')) {
    $reported = [IO.Path]::GetFullPath($flags['user-data-dir']).TrimEnd('\')
    $profilesMatch = $reported -ieq $expected -or $reported -ieq $runtimeProfile
}

$edgeReadOnly = foreach ($hive in @('HKLM', 'HKCU')) {
    $policyRoot = "${hive}:\Software\Policies\Microsoft\Edge"
    $policy = Get-ItemProperty -LiteralPath $policyRoot -ErrorAction SilentlyContinue
    $argumentsKey = Get-Item -LiteralPath ($policyRoot + '\WebView2\AdditionalBrowserArguments') -ErrorAction SilentlyContinue
    $viewerOverrides = @()
    if ($argumentsKey) {
        $viewerOverrides = @($argumentsKey.GetValueNames() | Where-Object { $_ -in '*', 'Pulse.exe', 'exepcstudio.Pulse' })
    }
    [pscustomobject]@{
        hive = $hive
        remoteDebuggingAllowed = $policy.RemoteDebuggingAllowed
        developerToolsAvailability = $policy.DeveloperToolsAvailability
        pulseArgumentOverrides = $viewerOverrides
    }
}

[pscustomobject]@{
    childCount = $children.Count
    readableCommandLines = @($children | Where-Object CommandLine).Count
    debugPortSwitchPresent = $flags.ContainsKey('remote-debugging-port')
    debugPortMatchesRequested = $flags['remote-debugging-port'] -eq [string]$DebugPort
    remoteDebuggingPipePresent = $flags.ContainsKey('remote-debugging-pipe')
    browserArgumentsApplied = $flags.ContainsKey('use-fake-device-for-media-stream')
    userDataDirMatchesFixture = $profilesMatch
    runtimeProfileExists = Test-Path -LiteralPath $runtimeProfile -PathType Container
    defaultStorageExists = Test-Path -LiteralPath (Join-Path $runtimeProfile 'Default') -PathType Container
    devToolsActivePortFile = Test-Path -LiteralPath (Join-Path $runtimeProfile 'DevToolsActivePort') -PathType Leaf
    edgePolicies = @($edgeReadOnly)
} | ConvertTo-Json -Depth 5 -Compress
