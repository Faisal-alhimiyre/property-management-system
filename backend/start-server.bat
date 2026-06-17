@echo off
cd /d "%~dp0"
echo Starting Walajna API on http://127.0.0.1:8002 ...
echo Keep this window open while using the website.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0restart-server.ps1"
pause
