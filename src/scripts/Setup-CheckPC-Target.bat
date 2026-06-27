@echo off
REM ============================================================
REM  CheckPC - On-site target setup (run ON the PC to be audited)
REM  Double-click it. Installs OpenSSH Server (offline) + opens the
REM  firewall so CheckPC can remote-scan this PC. Self-elevating,
REM  idempotent. Messages are English to avoid console codepage issues.
REM ============================================================
setlocal

REM --- self-elevate (UAC) ---
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Requesting administrator rights...
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

cd /d "%~dp0"
echo ============================================
echo   CheckPC - Target Setup
echo ============================================
echo.

REM --- ensure the OpenSSH bundle (offline preferred, online fallback) ---
if not exist "%~dp0OpenSSH-Win64\sshd.exe" (
    if exist "%~dp0Get-OpenSSH.ps1" (
        echo [INFO] Offline OpenSSH not found - trying to download from the official release...
        powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Get-OpenSSH.ps1"
    )
)
if not exist "%~dp0OpenSSH-Win64\sshd.exe" (
    echo [ERROR] OpenSSH-Win64\sshd.exe not found and download failed.
    echo         Copy the full src\scripts folder including OpenSSH-Win64 and retry.
    pause
    exit /b 1
)

REM --- install + start OpenSSH (offline, idempotent) ---
echo [1/3] Installing and starting OpenSSH Server...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install_OpenSSH_Remote.ps1"

REM --- verify ---
echo [2/3] Verifying sshd...
powershell -NoProfile -Command "if((Get-Service sshd -ErrorAction SilentlyContinue).Status -eq 'Running'){Write-Host '   [OK] sshd is running, TCP 22 open.' -ForegroundColor Green}else{Write-Host '   [WARN] sshd not running. See C:\Windows\Temp\CheckPC_SSH\setup.log' -ForegroundColor Yellow}"

REM --- show this PC's IPv4 address(es) for CheckPC ---
echo [3/3] This PC's IPv4 addresses - enter one in CheckPC remote scan:
powershell -NoProfile -Command "Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } | ForEach-Object { '   ' + $_.IPAddress }"
echo.

REM --- optional: allow future REMOTE admin with a local admin account ---
echo --------------------------------------------
echo Optional: allow future REMOTE admin using a local admin account.
echo This sets LocalAccountTokenFilterPolicy=1 and lowers one security control.
echo Not needed just to be scanned. Leave blank/No to skip.
set /p LATFP="Enable it? [y/N]: "
if /i "%LATFP%"=="y" (
    reg add "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System" /v LocalAccountTokenFilterPolicy /t REG_DWORD /d 1 /f >nul
    echo    [OK] LocalAccountTokenFilterPolicy=1 set.
)

echo.
echo Done. CheckPC can now remote-scan this PC at the IP shown above.
pause
endlocal
