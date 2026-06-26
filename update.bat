@echo off
REM ============================================================
REM  CheckPC -- pull latest from GitHub, install deps, rebuild.
REM  Run this for first-time setup (after git clone) and to update.
REM ============================================================
cd /d "%~dp0"

where git >nul 2>&1 || (echo [ERROR] Git not found. Install Git for Windows: https://git-scm.com & pause & exit /b 1)
where node >nul 2>&1 || (echo [ERROR] Node.js not found. Install Node.js 18+: https://nodejs.org & pause & exit /b 1)

echo === CheckPC update ===
echo [1/4] Pulling latest from GitHub...
git pull --ff-only || (echo [ERROR] git pull failed - check for local changes or wrong branch. & pause & exit /b 1)

echo [2/4] Installing backend dependencies...
call npm install || (echo [ERROR] backend npm install failed. & pause & exit /b 1)

echo [3/4] Installing frontend dependencies...
pushd frontend
call npm install || (popd & echo [ERROR] frontend npm install failed. & pause & exit /b 1)

echo [4/4] Building frontend...
call npm run build || (popd & echo [ERROR] frontend build failed. & pause & exit /b 1)
popd

echo.
echo === Update complete. Run start.bat to launch CheckPC. ===
echo     Note: your data folder -- settings, inventory, history -- is untouched.
pause
