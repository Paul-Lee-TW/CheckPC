@echo off
echo ============================================
echo   OpenSSH Server - Offline Install
echo ============================================
echo.

net session >nul 2>&1
if %errorLevel% neq 0 (
    echo   Requesting admin rights...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

:: Check if already installed
sc query sshd >nul 2>&1
if %errorLevel% equ 0 (
    echo   [OK] OpenSSH Server is already installed.
    echo   Starting sshd service...
    net start sshd >nul 2>&1
    sc config sshd start=auto >nul 2>&1
    echo   [OK] sshd service is running.
    goto :done
)

:: Check if OpenSSH-Win64.zip exists in same folder
if not exist "%~dp0OpenSSH-Win64.zip" (
    echo   [ERROR] OpenSSH-Win64.zip not found!
    echo.
    echo   Please download it from:
    echo   https://github.com/PowerShell/Win32-OpenSSH/releases/latest
    echo.
    echo   Place OpenSSH-Win64.zip in the same folder as this script.
    echo.
    pause
    exit /b 1
)

echo   [1/5] Extracting OpenSSH...
powershell -Command "Expand-Archive -Path '%~dp0OpenSSH-Win64.zip' -DestinationPath '%~dp0' -Force"

if not exist "%~dp0OpenSSH-Win64\sshd.exe" (
    echo   [ERROR] Extraction failed.
    pause
    exit /b 1
)

echo   [2/5] Copying to C:\Program Files\OpenSSH...
if not exist "C:\Program Files\OpenSSH" mkdir "C:\Program Files\OpenSSH"
xcopy /Y /E "%~dp0OpenSSH-Win64\*" "C:\Program Files\OpenSSH\" >nul

echo   [3/5] Installing sshd service...
powershell -ExecutionPolicy Bypass -Command "& 'C:\Program Files\OpenSSH\install-sshd.ps1'" 2>nul

echo   [4/5] Configuring firewall...
netsh advfirewall firewall add rule name="OpenSSH Server (sshd)" dir=in action=allow protocol=TCP localport=22 >nul 2>&1

echo   [5/5] Starting sshd service...
net start sshd >nul 2>&1
sc config sshd start=auto >nul 2>&1

:: Verify
sc query sshd | findstr "RUNNING" >nul 2>&1
if %errorLevel% equ 0 (
    echo.
    echo   ============================================
    echo   [OK] OpenSSH Server installed and running!
    echo   [OK] Port 22 is open.
    echo   [OK] Service set to auto-start.
    echo   ============================================
) else (
    echo.
    echo   [WARNING] Service may not have started.
    echo   Try: net start sshd
)

:done
echo.
pause
