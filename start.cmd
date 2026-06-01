@echo off
set "NODE_PATH=C:\Users\qmal1\AppData\Local\nodejs\node-v22.14.0-win-x64"
set "PATH=%NODE_PATH%;%PATH%"
cd /d "%~dp0"

if "%~1"=="" (set ROOM=demo1234) else (set ROOM=%~1)

echo Stopping old server...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000"') do taskkill /F /PID %%a >nul 2>&1

echo ================================
echo   Handwriting Sync Server
echo   Room: %ROOM%
echo ================================
echo.
call npm install --silent
echo.
node server.js
pause
