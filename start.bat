@echo off
title RestoChat — Start
echo Starting RestoChat...
cd /d "C:\RestoChat"
docker-compose up -d
echo.
echo RestoChat is running at http://localhost:3000
echo.
timeout /t 3 /nobreak >nul
start http://localhost:3000
