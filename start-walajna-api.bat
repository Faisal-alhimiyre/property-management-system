@echo off
title Walajna API (port 8002)
cd /d "%~dp0backend"
echo.
echo  Walajna backend - keep this window open while using the site.
echo  Frontend (Live Server): http://127.0.0.1:5500
echo  API: http://127.0.0.1:8002
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0backend\restart-server.ps1"
pause
