@echo off
title RestoChat — Start
echo Starting RestoChat...
cd /d "C:\RestoChat"
docker-compose up -d
echo.
echo RestoChat is running at http://localhost:3000
echo.
echo Waiting for services to be ready...
timeout /t 8 /nobreak >nul
start http://localhost:3000
