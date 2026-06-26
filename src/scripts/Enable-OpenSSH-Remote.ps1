#Requires -Version 5.1
<#
.SYNOPSIS
  Remotely enable OpenSSH Server on one or more Windows targets -- agentless,
  no WinRM. Run on a Windows admin machine on the same LAN as the targets.

.DESCRIPTION
  Per host: pushes the bundled offline OpenSSH plus Install_OpenSSH_Remote.ps1
  to the target's C$ admin share (SMB/445), then triggers the install as the
  target's admin via WMI/DCOM (RPC/135) -- Win32_Process.Create -- and waits
  for TCP 22. WinRM is NOT required.

  Requires SMB/445 + RPC/135 reachable and local-admin via the credential.

  Auth posture: CheckPC scans over SSH using PASSWORD auth, so password auth
  stays enabled on the target. Use -AllowedSource to restrict who can reach
  TCP 22 (firewall RemoteAddress) instead of disabling password auth.

.PARAMETER ComputerName
  Target host names / IPs.

.PARAMETER Credential
  Admin credential. Prompted if omitted. Kept as a SecureString; never written
  to disk, logs, or the command line.

.PARAMETER AllowedSource
  CIDR/IP(s) allowed to reach TCP 22 on the target, e.g. 192.168.50.0/24.
  Default 'Any' opens TCP 22 to all sources (a warning is shown).

.PARAMETER TimeoutSec
  How long to wait for sshd to accept on TCP 22. Default 90.

.EXAMPLE
  .\Enable-OpenSSH-Remote.ps1 -ComputerName 192.168.50.68 -AllowedSource 192.168.50.0/24

.EXAMPLE
  .\Enable-OpenSSH-Remote.ps1 -ComputerName 192.168.50.68,192.168.50.69 -TimeoutSec 120
#>
param(
    [Parameter(Mandatory = $true)]
    [string[]]$ComputerName,
    [System.Management.Automation.PSCredential]$Credential,
    [string]$AllowedSource = 'Any',
    [int]$TimeoutSec = 90
)

if (-not $Credential) {
    $Credential = Get-Credential -Message 'Target admin credential (domain: DOMAIN\user, local: HOST\Administrator)'
}
if ($AllowedSource -eq 'Any') {
    Write-Host '[WARN] -AllowedSource not set: TCP 22 will be opened to ANY source on each target.' -ForegroundColor Yellow
    Write-Host '       Consider e.g. -AllowedSource 192.168.50.0/24 to limit exposure.' -ForegroundColor Yellow
}

$srcDir        = Join-Path $PSScriptRoot 'OpenSSH-Win64'
$installScript = Join-Path $PSScriptRoot 'Install_OpenSSH_Remote.ps1'
if (-not (Test-Path (Join-Path $srcDir 'sshd.exe'))) { throw "Bundled OpenSSH not found: $srcDir" }
if (-not (Test-Path $installScript))                 { throw "Install script not found: $installScript" }

# Low-level TCP probe with an explicit short timeout (Test-NetConnection is slow
# and has no tight timeout). Param is TargetHost -- never $Host (a reserved var).
function Test-Port {
    param($TargetHost, $Port, $TimeoutMs = 1500)
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $iar = $client.BeginConnect($TargetHost, $Port, $null, $null)
        if ($iar.AsyncWaitHandle.WaitOne($TimeoutMs)) {
            try { $client.EndConnect($iar); return $true } catch { return $false }
        }
        return $false
    } catch { return $false }
    finally { $client.Close() }
}

foreach ($h in $ComputerName) {
    Write-Host "`n=== $h ===" -ForegroundColor Cyan

    if (Test-Port $h 22)         { Write-Host '  [SKIP] TCP 22 already open; OpenSSH appears enabled.' -ForegroundColor Yellow; continue }
    if (-not (Test-Port $h 445)) { Write-Host '  [BLOCKED] SMB/445 unreachable; cannot push files (use GPO/console for this host).' -ForegroundColor Red; continue }

    $driveName  = "CheckPC$PID"
    $cimSession = $null
    try {
        # 1) Map admin share + push the offline bundle.
        Write-Host '  [1/4] Copying OpenSSH to target via SMB admin share...'
        New-PSDrive -Name $driveName -PSProvider FileSystem -Root "\\$h\C$" -Credential $Credential -ErrorAction Stop | Out-Null
        $remoteDir = "${driveName}:\Windows\Temp\CheckPC_SSH"
        if (-not (Test-Path $remoteDir)) { New-Item -ItemType Directory -Path $remoteDir -Force | Out-Null }
        Copy-Item -Path $srcDir        -Destination $remoteDir -Recurse -Force
        Copy-Item -Path $installScript -Destination $remoteDir -Force

        # 2) Trigger the install remotely via WMI/DCOM (no WinRM; no creds in argv).
        Write-Host '  [2/4] Triggering install via WMI/DCOM as administrator...'
        $cimSession = New-CimSession -ComputerName $h -Credential $Credential `
            -SessionOption (New-CimSessionOption -Protocol Dcom) -ErrorAction Stop
        $srcArg = ($AllowedSource -replace '"', '')   # AllowedSource is a subnet, not a secret
        $cmd = 'powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Windows\Temp\CheckPC_SSH\Install_OpenSSH_Remote.ps1" -AllowedSource "' + $srcArg + '"'
        $r = Invoke-CimMethod -CimSession $cimSession -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $cmd }
        if ($r.ReturnValue -ne 0) { throw "Win32_Process.Create failed (ReturnValue=$($r.ReturnValue))" }
        Write-Host "      Install started (PID $($r.ProcessId))"

        # 3) Wait: poll TCP 22 (test-first, then sleep) and the target done.flag.
        Write-Host "  [3/4] Waiting for sshd (up to $TimeoutSec s)..."
        $flagPath = "${driveName}:\Windows\Temp\CheckPC_SSH\done.flag"
        $logPath  = "${driveName}:\Windows\Temp\CheckPC_SSH\setup.log"
        $port22 = $false
        $flagVal = $null
        $sw = [System.Diagnostics.Stopwatch]::StartNew()
        while ($sw.Elapsed.TotalSeconds -lt $TimeoutSec) {
            if (Test-Port $h 22) { $port22 = $true; break }
            if (Test-Path $flagPath) {
                $flagVal = ((Get-Content $flagPath -ErrorAction SilentlyContinue) -join '').Trim()
                if ($flagVal -eq 'error') { break }   # install genuinely failed -> stop early
            }
            Start-Sleep -Seconds 2
        }
        if (-not $flagVal -and (Test-Path $flagPath)) {
            $flagVal = ((Get-Content $flagPath -ErrorAction SilentlyContinue) -join '').Trim()
        }

        # 4) Report -- distinguish "install failed" from "installed but 22 blocked".
        if ($port22) {
            Write-Host "  [OK] $h OpenSSH enabled (TCP 22 open). Ready for CheckPC remote scan." -ForegroundColor Green
        } elseif ($flagVal -eq 'success') {
            Write-Host "  [PARTIAL] Install reported success but TCP 22 is unreachable from here." -ForegroundColor Yellow
            Write-Host '            Likely a firewall/EDR block or the -AllowedSource scope.' -ForegroundColor Yellow
        } elseif ($flagVal -eq 'error') {
            Write-Host "  [ERROR] Install failed on target (done.flag=error). See setup.log below." -ForegroundColor Red
        } else {
            Write-Host "  [PARTIAL] No confirmation within timeout. See setup.log below." -ForegroundColor Yellow
        }
        if (-not $port22 -and (Test-Path $logPath)) {
            Write-Host '            --- target setup.log (tail) ---' -ForegroundColor DarkGray
            Get-Content $logPath -Tail 15 -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "            $_" -ForegroundColor DarkGray }
        }
    }
    catch {
        $msg = $_.Exception.Message
        Write-Host "  [ERROR] $msg" -ForegroundColor Red
        if ($_.Exception.HResult -eq -2147024891 -or $msg -match 'denied|0x80070005|5121|1326') {
            Write-Host '          ACCESS DENIED. On a workgroup target, a non-built-in local admin is' -ForegroundColor Yellow
            Write-Host '          token-filtered over the network (UAC remote restriction). Use the' -ForegroundColor Yellow
            Write-Host '          built-in Administrator or a domain account, or set on the target:' -ForegroundColor Yellow
            Write-Host '          reg add "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System" /v LocalAccountTokenFilterPolicy /t REG_DWORD /d 1 /f' -ForegroundColor Yellow
        }
    }
    finally {
        if ($cimSession) { Remove-CimSession -CimSession $cimSession -ErrorAction SilentlyContinue }
        if (Get-PSDrive -Name $driveName -ErrorAction SilentlyContinue) {
            Remove-PSDrive -Name $driveName -Force -ErrorAction SilentlyContinue
        }
    }
}
