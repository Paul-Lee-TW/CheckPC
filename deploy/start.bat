@echo off
echo ============================================
echo   CheckPC - PC Audit Tool
echo ============================================
echo.

where node >nul 2>&1
if %errorLevel% equ 0 (
    echo   [OK] Node.js found
    set "NODE_CMD=node"
    goto :start
)

if exist "%~dp0node\node.exe" (
    echo   [OK] Portable Node.js found
    set "NODE_CMD=%~dp0node\node.exe"
    goto :start
)

echo   Node.js not found. Downloading portable version...
echo   (This may take a few minutes)
echo.
mkdir "%~dp0node" 2>nul
powershell -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://nodejs.org/dist/v22.14.0/win-x64/node.exe' -OutFile '%~dp0node\node.exe'"

if exist "%~dp0node\node.exe" (
    echo   [OK] Node.js downloaded!
    set "NODE_CMD=%~dp0node\node.exe"
    goto :start
)

echo.
echo   [ERROR] Download failed.
echo   Please install Node.js manually:
echo   https://nodejs.org/en/download
echo.
pause
exit /b 1

:start
cd /d "%~dp0"
echo.
echo   Starting server...
echo.
echo   http://localhost:3001
echo.
echo   Press Ctrl+C to stop
echo ============================================
echo.
"%NODE_CMD%" src/server.js
echo.
echo   [Server stopped]
pause
