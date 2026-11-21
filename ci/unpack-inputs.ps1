$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted') {
    throw 'This step prepares a disposable GitHub-hosted workspace.'
}
$root = [IO.Path]::GetFullPath($env:GITHUB_WORKSPACE)
$prefix = $root.TrimEnd('\') + '\'
$archive = [IO.Compression.ZipFile]::OpenRead((Join-Path $root 'pulse-inputs.zip'))
try {
    foreach ($entry in $archive.Entries) {
        $name = $entry.FullName
        if ($name -match '[:\\]' -or $name.Split('/') -match '^(?:\.{0,2}|\.git)$') {
            throw 'Unexpected path in test inputs.'
        }
        $target = [IO.Path]::GetFullPath((Join-Path $root $name))
        if (-not $target.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Test input outside workspace.' }
        if ([IO.File]::Exists($target)) {
            if ($name -cmatch '^tests/[A-Za-z0-9._-]+$') { continue }
            $inputStream = $entry.Open()
            try { $packedHash = (Get-FileHash -InputStream $inputStream -Algorithm SHA256).Hash }
            finally { $inputStream.Dispose() }
            if ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash -ne $packedHash) {
                throw "Checked-out file differs from the test archive: $name."
            }
            continue
        }
        [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target))
        [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $target, $false)
    }
} finally {
    $archive.Dispose()
}
