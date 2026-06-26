#Requires -Version 5.1
# ============================================================================
# CheckPC -- Unattended, offline OpenSSH Server install (TARGET-SIDE)
# ----------------------------------------------------------------------------
# Launched ELEVATED on the target (e.g. remotely via WMI Win32_Process.Create
# with admin credentials). No pause, no interactive UAC self-elevation. Uses the
# already-extracted OpenSSH-Win64\ folder next to this script (no zip, no
# internet). Idempotent. Logs to C:\Windows\Temp\CheckPC_SSH.
#
# Auth posture (deliberate): CheckPC scans over SSH using PASSWORD auth, so
# PasswordAuthentication is intentionally left at the OpenSSH default (enabled).
# Limit exposure with -AllowedSource (firewall RemoteAddress) instead of
# disabling password auth.
# ============================================================================
param(
    [string]$AllowedSource = 'Any'   # CIDR/IP(s) allowed to reach TCP 22, or 'Any'
)

$ErrorActionPreference = 'Stop'
$logDir = 'C:\Windows\Temp\CheckPC_SSH'
$log  = Join-Path $logDir 'setup.log'
$flag = Join-Path $logDir 'done.flag'

function Write-Log($msg) {
    try {
        $line = '{0}  {1}' -f (Get-Date -Format 'yyyy-MM-ddTHH:mm:ss'), $msg
        Add-Content -Path $log -Value $line -Encoding UTF8
    } catch {}
}

$status = 'error'
try {
    if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
    Remove-Item $flag -Force -ErrorAction SilentlyContinue
    Write-Log '=== CheckPC OpenSSH remote install start ==='

    $dest = Join-Path $env:ProgramFiles 'OpenSSH'

    # 1) Install only if the sshd service is absent (idempotent).
    $svc = Get-Service -Name sshd -ErrorAction SilentlyContinue
    if (-not $svc) {
        $src = Join-Path $PSScriptRoot 'OpenSSH-Win64'
        if (-not (Test-Path (Join-Path $src 'sshd.exe'))) {
            throw "Bundled OpenSSH not found at $src"
        }
        Write-Log "Copying OpenSSH binaries to $dest"
        if (-not (Test-Path $dest)) { New-Item -ItemType Directory -Path $dest -Force | Out-Null }
        Copy-Item -Path (Join-Path $src '*') -Destination $dest -Recurse -Force

        Write-Log 'Running install-sshd.ps1'
        & (Join-Path $dest 'install-sshd.ps1')
    } else {
        Write-Log 'sshd service already present; skipping install'
    }

    # 2) Inbound firewall rule for TCP 22 (idempotent; re-created to apply scope).
    $ruleName = 'OpenSSH-SSH-Server-In-TCP-CheckPC'
    if (Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue) {
        Remove-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue
    }
    $fw = @{
        Name        = $ruleName
        DisplayName = 'OpenSSH SSH Server (CheckPC)'
        Enabled     = 'True'
        Direction   = 'Inbound'
        Protocol    = 'TCP'
        Action      = 'Allow'
        LocalPort   = 22
    }
    if ($AllowedSource -and $AllowedSource -ne 'Any') {
        $fw['RemoteAddress'] = ($AllowedSource -split ',')
    }
    Write-Log "Setting firewall rule (RemoteAddress=$AllowedSource)"
    New-NetFirewallRule @fw | Out-Null

    # 3) Auto-start + start the service.
    Set-Service -Name sshd -StartupType Automatic
    Start-Service -Name sshd

    # 4) Verify.
    $svc = Get-Service -Name sshd -ErrorAction SilentlyContinue
    if ($svc -and $svc.Status -eq 'Running') {
        $status = 'success'
        Write-Log 'sshd is RUNNING'
    } else {
        $status = 'partial'
        Write-Log 'sshd not running after start attempt'
    }
} catch {
    $status = 'error'
    Write-Log ('ERROR: ' + $_.Exception.Message)
} finally {
    try { Set-Content -Path $flag -Value $status -Encoding ASCII } catch {}
    Write-Log "=== done: $status ==="
}
