@echo off
echo ============================================
echo   CheckPC - Installation
echo ============================================
echo.

:: Check if Node.js is already installed
where node >nul 2>&1
if %errorLevel% equ 0 (
    echo [OK] Node.js found.
    goto :install
)

:: Check portable node
if exist "%~dp0node\node.exe" (
    echo [OK] Portable Node.js found.
    set "PATH=%~dp0node;%PATH%"
    goto :install
)

echo [ERROR] Node.js not found.
echo.
echo Please download Node.js from:
echo   https://nodejs.org/en/download
echo.
echo Or place portable node.exe in:
echo   %~dp0node\
echo.
pause
exit /b 1

:install
echo.
echo [1/2] Installing dependencies...
cd /d "%~dp0"
call npm install --production 2>&1
echo.
echo [2/2] Installation complete!
echo.
echo ============================================
echo   To start the server, run: start.bat
echo ============================================
echo.
pause
