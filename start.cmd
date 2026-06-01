@echo off
set "NODE_PATH=C:\Users\qmal1\AppData\Local\nodejs\node-v22.14.0-win-x64"
set "PATH=%NODE_PATH%;%PATH%"
cd /d "%~dp0"
echo ================================
echo   Handwriting Sync Server
echo ================================
echo.
call npm install --silent
echo.
echo Starting server...
node server.js
pause
