@echo off
set PATH=C:\Users\qmal1\AppData\Local\nodejs\node-v22.14.0-win-x64;%PATH%
cd /d C:\Users\qmal1\Desktop\demo
echo ================================
echo   Handwriting Sync 服务端
echo ================================
echo.
call npm install --silent
echo.
echo 启动中...
node server.js
pause
