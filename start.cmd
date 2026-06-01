@echo off
set "NODE_PATH=C:\Users\qmal1\AppData\Local\nodejs\node-v22.14.0-win-x64"
set "PATH=%NODE_PATH%;%PATH%"
cd /d "%~dp0"

if "%~1"=="" (set ROOM=demo1234) else (set ROOM=%~1)

echo ================================
echo   Handwriting Sync Server
echo   Room: %ROOM%
echo ================================
echo.
call npm install --silent
echo.
echo Local: http://localhost:3000?room=%ROOM%
echo.
echo For public access, open a NEW terminal and run:
echo   npx localtunnel --port 3000
echo.
ROOM=%ROOM% node server.js
pause
