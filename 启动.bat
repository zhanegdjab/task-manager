@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js not found. Please install Node.js 18+ from https://nodejs.org
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo [1/2] Installing dependencies, please wait a moment...
    call npm install --no-audit --no-fund
    if errorlevel 1 (
        echo [ERROR] Install failed. Check your network, then run "npm install" again.
        pause
        exit /b 1
    )
) else (
    echo [1/2] Dependencies already installed.
)

echo [2/2] Starting server on http://localhost:3020
echo Keep this window open. Press Ctrl+C to stop.
start "" /min powershell -NoProfile -NonInteractive -WindowStyle Hidden -Command "Start-Sleep -Seconds 4; Start-Process 'http://localhost:3020'"
call npm start

pause
