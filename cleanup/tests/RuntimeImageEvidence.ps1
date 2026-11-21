param([string]$ReadOnlyInstalledRuntime)

$ErrorActionPreference = 'Stop'
$cleanup = Split-Path -Parent $PSScriptRoot
$project = Split-Path -Parent $cleanup
$scratch = Join-Path $project ('test-runs\cleanup-runtime-image-' + [Guid]::NewGuid().ToString('N'))
$runtime = Join-Path $scratch 'msedgewebview2.exe'
$alternate = Join-Path $scratch 'runtime-copy.exe'
[IO.Directory]::CreateDirectory($scratch) | Out-Null
[IO.File]::WriteAllText($alternate, 'isolated synthetic runtime content')
New-Item -ItemType HardLink -Path $runtime -Target $alternate | Out-Null
$junction = Join-Path $scratch 'junction'
New-Item -ItemType Junction -Path $junction -Target $scratch | Out-Null

$source = Join-Path $scratch 'RuntimeImageEvidence.cs'
$driver = @'
using System;
using System.IO;
using System.Reflection;
using PulseCleanup;

internal static class RuntimeImageEvidence
{
    private static void ExpectIOException(Action action, string description)
    {
        try { action(); }
        catch (IOException) { return; }
        throw new InvalidOperationException(description);
    }

    private static int Main(string[] args)
    {
        try
        {
            var method = typeof(SafePath).GetMethod("OpenRuntimeImageEvidence", BindingFlags.Static | BindingFlags.NonPublic);
            ExpectIOException(() => { using (SafePath.Open(args[0], false, false)) { } }, "Ordinary reading accepted hard links.");
            ExpectIOException(() => { using (SafePath.Open(args[0], false, true)) { } }, "Ordinary deletion accepted hard links.");
            if (method == null) throw new InvalidOperationException("Read-only runtime evidence is unavailable.");
            Func<string, PinnedPath> read = path => {
                try { return (PinnedPath)method.Invoke(null, new object[] { path }); }
                catch (TargetInvocationException error) { throw error.InnerException; }
            };
            using (var pinned = read(args[0]))
            {
                if (pinned.Stamp.Links != 2) throw new InvalidOperationException("Wrong synthetic file identity.");
                bool refusedDelete = false;
                try { pinned.Delete(); }
                catch (InvalidOperationException) { refusedDelete = true; }
                if (!refusedDelete) throw new InvalidOperationException("The evidence wrapper permitted deletion.");
            }
            ExpectIOException(() => { using (read(args[1])) { } }, "The evidence mode accepted an unrelated filename.");
            ExpectIOException(() => { using (read(args[2])) { } }, "The evidence mode traversed a junction.");
            Console.WriteLine("PASS: read-only hardlink evidence, strict default/delete modes, filename and junction boundary");
            if (args.Length == 4)
            {
                using (var existing = read(args[3]))
                    Console.WriteLine("PASS: installed WebView2 opened read-only. NTFS link count = " + existing.Stamp.Links);
            }
            return 0;
        }
        catch (Exception error) { Console.Error.WriteLine(error); return 1; }
    }
}
'@
[IO.File]::WriteAllText($source, $driver)
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$testExe = Join-Path $scratch 'RuntimeImageEvidence.exe'
& $compiler /nologo /codepage:65001 /langversion:5 /warnaserror+ "/out:$testExe" (Join-Path $cleanup 'SafePath.cs') $source
if ($LASTEXITCODE -ne 0) { throw 'Failed to build the isolated test driver.' }
$testArgs = @($runtime, $alternate, (Join-Path $junction 'msedgewebview2.exe'))
if ($ReadOnlyInstalledRuntime) { $testArgs += $ReadOnlyInstalledRuntime }
& $testExe @testArgs
if ($LASTEXITCODE -ne 0) { throw 'The isolated runtime evidence test failed.' }
