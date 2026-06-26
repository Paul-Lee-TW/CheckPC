#Requires -Version 5.1
<#
.SYNOPSIS
  Download the official Win32-OpenSSH release and extract it to
  src/scripts/OpenSSH-Win64/ (needed by the remote-enable scripts).

.DESCRIPTION
  Source: https://github.com/PowerShell/Win32-OpenSSH/releases (official
  Microsoft project). Downloads over HTTPS, prints the SHA256, and (optionally)
  verifies it. Skips if the folder already exists. update.bat calls this when
  the bundle is missing. The remote-enable scripts need this; plain SSH scanning
  does NOT.

.PARAMETER Version
  'latest' (default) or a release tag, e.g. '10.0.0.0p2-Preview'.

.PARAMETER Sha256
  Optional expected SHA256 of OpenSSH-Win64.zip; enforced when supplied.

.EXAMPLE
  .\Get-OpenSSH.ps1
  .\Get-OpenSSH.ps1 -Version 10.0.0.0p2-Preview -Sha256 <hash>
#>
param(
    [string]$Version = 'latest',
    [string]$Sha256  = ''
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$dest = Join-Path $PSScriptRoot 'OpenSSH-Win64'
if (Test-Path (Join-Path $dest 'sshd.exe')) {
    Write-Host "[OpenSSH] Already present at $dest -- skipping download."
    return
}

$api = if ($Version -eq 'latest') {
    'https://api.github.com/repos/PowerShell/Win32-OpenSSH/releases/latest'
} else {
    "https://api.github.com/repos/PowerShell/Win32-OpenSSH/releases/tags/$Version"
}
$headers = @{ 'User-Agent' = 'CheckPC' }

Write-Host "[OpenSSH] Querying release: $Version"
$rel = Invoke-RestMethod -Uri $api -Headers $headers

# Pick OpenSSH-Win64.zip exactly (NOT OpenSSH-Win64_Symbols.zip / the .msi).
$asset = $rel.assets | Where-Object { $_.name -eq 'OpenSSH-Win64.zip' } | Select-Object -First 1
if (-not $asset) {
    $asset = $rel.assets |
        Where-Object { $_.name -match '^OpenSSH-Win64.*\.zip$' -and $_.name -notmatch 'Symbols' } |
        Select-Object -First 1
}
if (-not $asset) { throw "No OpenSSH-Win64.zip asset in release $($rel.tag_name)" }

Write-Host "[OpenSSH] Downloading $($asset.name) ($([math]::Round($asset.size / 1MB, 1)) MB) from $($rel.tag_name)..."
$tmp = Join-Path $env:TEMP ('checkpc_openssh_' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp -Force | Out-Null
$zip = Join-Path $tmp $asset.name
try {
    Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $zip -Headers $headers

    $hash = (Get-FileHash -Path $zip -Algorithm SHA256).Hash
    if ($Sha256) {
        if ($hash -ne $Sha256.ToUpper()) { throw "SHA256 mismatch: expected $Sha256, got $hash" }
        Write-Host '[OpenSSH] SHA256 verified.'
    } else {
        Write-Host "[OpenSSH] Downloaded SHA256: $hash"
        Write-Host '[OpenSSH] (Pass -Sha256 <hash> to enforce integrity on future runs.)'
    }

    Expand-Archive -Path $zip -DestinationPath $tmp -Force
    $extracted = Join-Path $tmp 'OpenSSH-Win64'
    if (-not (Test-Path (Join-Path $extracted 'sshd.exe'))) {
        $found = Get-ChildItem -Path $tmp -Recurse -Filter 'sshd.exe' | Select-Object -First 1
        if (-not $found) { throw 'sshd.exe not found after extraction' }
        $extracted = $found.Directory.FullName
    }

    if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
    Copy-Item -Path $extracted -Destination $dest -Recurse -Force
    Write-Host "[OpenSSH] Installed to $dest"
} finally {
    Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
