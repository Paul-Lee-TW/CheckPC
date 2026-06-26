@echo off
REM ============================================================
REM  CheckPC -- start the local server (Windows, git-clone deploy).
REM  Serves the web UI at http://localhost:3001 (loopback only).
REM ============================================================
cd /d "%~dp0"

where node >nul 2>&1 || (echo [ERROR] Node.js not found. Install Node.js 18+: https://nodejs.org & pause & exit /b 1)
if not exist "frontend\dist\index.html" (echo [ERROR] Frontend not built. Run update.bat first. & pause & exit /b 1)

echo ================================
echo   CheckPC - PC Audit Tool
echo ================================
echo.
echo   Open browser: http://localhost:3001
echo   Press Ctrl+C to stop.
echo ================================
echo.
node src\server.js
