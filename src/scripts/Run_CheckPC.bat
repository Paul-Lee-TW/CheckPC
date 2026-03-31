@echo off
echo ============================================
echo   CheckPC - PC Audit Scanner
echo ============================================
echo.

net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [INFO] Requesting admin rights...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

echo [1/3] Scanning, please wait...
echo.

powershell -ExecutionPolicy Bypass -File "%~dp0CheckPC.ps1" > "%~dp0result_%COMPUTERNAME%.json" 2>&1

if %errorLevel% equ 0 (
    echo.
    echo [2/3] Scan complete!
    echo.
    echo [3/3] Result saved to:
    echo       %~dp0result_%COMPUTERNAME%.json
    echo.
    echo ============================================
    echo   Upload this JSON file to CheckPC web UI
    echo   using "Manual Upload" tab.
    echo ============================================
) else (
    echo.
    echo [ERROR] Scan failed. Check PowerShell version.
)

echo.
pause
