#Requires -Version 5.1
# ============================================================================
# CheckPC -- single-host remote OpenSSH enable (BACKEND-INVOKED, NON-INTERACTIVE)
# ----------------------------------------------------------------------------
# Called by the Node backend (sshEnabler.js) on a Windows admin machine.
# Username comes via -Username; the PASSWORD is read from STDIN (one line) so it
# never appears in argv. Emits a single compact JSON line with the result.
# Reuses the same agentless flow as Enable-OpenSSH-Remote.ps1 for one host.
# ============================================================================
param(
    [Parameter(Mandatory = $true)][string]$ComputerName,
    [Parameter(Mandatory = $true)][string]$Username,
    [string]$AllowedSource = 'Any',
    [int]$TimeoutSec = 90
)

$ErrorActionPreference = 'Stop'
$result = @{ host = $ComputerName; status = 'error'; channel = $null; sshVersion = $null; error = $null }

function Test-Port {
    param($TargetHost, $Port, $TimeoutMs = 1500)
    $c = New-Object System.Net.Sockets.TcpClient
    try {
        $iar = $c.BeginConnect($TargetHost, $Port, $null, $null)
        if ($iar.AsyncWaitHandle.WaitOne($TimeoutMs)) { try { $c.EndConnect($iar); return $true } catch { return $false } }
        return $false
    } catch { return $false } finally { $c.Close() }
}

$driveName = "CheckPCEnable$PID"
$cimSession = $null
try {
    $pw = [Console]::In.ReadLine()
    if (-not $pw) { throw 'no credential on stdin' }
    $sec = ConvertTo-SecureString $pw -AsPlainText -Force
    $cred = New-Object System.Management.Automation.PSCredential($Username, $sec)
    $pw = $null

    if (Test-Port $ComputerName 22) { $result.status = 'success'; $result.channel = 'already'; $result.sshVersion = '(already open)'; throw '__done__' }
    if (-not (Test-Port $ComputerName 445)) { $result.status = 'blocked'; $result.error = @{ type = 'no_channel'; message = 'SMB/445 unreachable' }; throw '__done__' }

    $srcDir = Join-Path $PSScriptRoot 'OpenSSH-Win64'
    $installScript = Join-Path $PSScriptRoot 'Install_OpenSSH_Remote.ps1'
    if (-not (Test-Path (Join-Path $srcDir 'sshd.exe'))) { throw 'bundled OpenSSH missing (run Get-OpenSSH.ps1)' }

    New-PSDrive -Name $driveName -PSProvider FileSystem -Root "\\$ComputerName\C$" -Credential $cred -ErrorAction Stop | Out-Null
    $remoteDir = "${driveName}:\Windows\Temp\CheckPC_SSH"
    if (-not (Test-Path $remoteDir)) { New-Item -ItemType Directory -Path $remoteDir -Force | Out-Null }
    Copy-Item -Path $srcDir -Destination $remoteDir -Recurse -Force
    Copy-Item -Path $installScript -Destination $remoteDir -Force

    $cimSession = New-CimSession -ComputerName $ComputerName -Credential $cred -SessionOption (New-CimSessionOption -Protocol Dcom) -ErrorAction Stop
    $srcArg = ($AllowedSource -replace '"', '')
    $cmd = 'powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Windows\Temp\CheckPC_SSH\Install_OpenSSH_Remote.ps1" -AllowedSource "' + $srcArg + '"'
    $r = Invoke-CimMethod -CimSession $cimSession -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $cmd }
    if ($r.ReturnValue -ne 0) { throw "Win32_Process.Create failed (ReturnValue=$($r.ReturnValue))" }
    $result.channel = 'wmi'

    $flagPath = "${driveName}:\Windows\Temp\CheckPC_SSH\done.flag"
    $port22 = $false; $flagVal = $null
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    while ($sw.Elapsed.TotalSeconds -lt $TimeoutSec) {
        if (Test-Port $ComputerName 22) { $port22 = $true; break }
        if (Test-Path $flagPath) { $flagVal = ((Get-Content $flagPath -ErrorAction SilentlyContinue) -join '').Trim(); if ($flagVal -eq 'error') { break } }
        Start-Sleep -Seconds 2
    }
    if (-not $flagVal -and (Test-Path $flagPath)) { $flagVal = ((Get-Content $flagPath -ErrorAction SilentlyContinue) -join '').Trim() }

    if ($port22) { $result.status = 'success' }
    elseif ($flagVal -eq 'success') { $result.status = 'partial'; $result.error = @{ type = 'firewall'; message = 'installed but TCP 22 unreachable (firewall/EDR/AllowedSource)' } }
    elseif ($flagVal -eq 'error') { $result.status = 'error'; $result.error = @{ type = 'install_failed'; message = 'install failed on target' } }
    else { $result.status = 'partial'; $result.error = @{ type = 'verify_timeout'; message = 'no confirmation within timeout' } }
}
catch {
    if ("$($_.Exception.Message)" -ne '__done__') {
        $m = "$($_.Exception.Message)"
        $type = 'error'
        if ($_.Exception.HResult -eq -2147024891 -or $m -match 'denied|0x80070005|5121|1326') { $type = 'access_denied' }
        elseif ($m -match 'authentication|password|logon') { $type = 'auth' }
        if (-not $result.error) { $result.error = @{ type = $type; message = $m } }
    }
}
finally {
    if ($cimSession) { Remove-CimSession -CimSession $cimSession -ErrorAction SilentlyContinue }
    if (Get-PSDrive -Name $driveName -ErrorAction SilentlyContinue) { Remove-PSDrive -Name $driveName -Force -ErrorAction SilentlyContinue }
}

$result | ConvertTo-Json -Compress
