param(
    [Parameter(Mandatory = $true)][string]$Exe,
    [Parameter(Mandatory = $true)][string]$Destination
)

$ErrorActionPreference = 'Stop'
$image = (Resolve-Path -LiteralPath $Exe).ProviderPath
$output = [IO.Path]::GetFullPath($ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Destination))
if (Test-Path -LiteralPath $output) {
    throw 'Choose a new destination for the read-only manifest extraction.'
}
[void][IO.Directory]::CreateDirectory($output)
Add-Type -AssemblyName System.IO.Compression
$assembly = [Reflection.Assembly]::ReflectionOnlyLoadFrom($image)
$stream = $assembly.GetManifestResourceStream('web.zip')
if (-not $stream) { throw 'The executable has no managed web.zip resource.' }
$archive = $null
try {
    $archive = [IO.Compression.ZipArchive]::new($stream, [IO.Compression.ZipArchiveMode]::Read, $false)
    foreach ($entry in $archive.Entries) {
        $cleanName = $entry.FullName.Replace('\', '/')
        $segments = $cleanName.Split('/')
        if ($entry.Name.Length -eq 0 -or ($segments | Where-Object { $_ -match '^\.{0,2}$|:' })) {
            throw 'An embedded asset has an unexpected path.'
        }
        $file = [IO.Path]::GetFullPath([IO.Path]::Combine($output, $cleanName))
        if (-not $file.StartsWith($output.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) {
            throw 'An embedded asset points outside the extraction directory.'
        }
        [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($file))
        $source = $entry.Open()
        $fileStream = $null
        try {
            $fileStream = [IO.File]::Open($file, [IO.FileMode]::CreateNew)
            $source.CopyTo($fileStream)
        } finally {
            if ($fileStream) { $fileStream.Dispose() }
            $source.Dispose()
        }
    }
} finally {
    if ($archive) { $archive.Dispose() }
    $stream.Dispose()
}
Get-FileHash -LiteralPath $image -Algorithm SHA256 | Select-Object -ExpandProperty Hash
