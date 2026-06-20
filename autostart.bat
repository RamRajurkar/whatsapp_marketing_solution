@echo off
title RestoChat — AutoStart
:: This script is called by Windows Task Scheduler on every login.
:: It waits for Docker Desktop to fully start before launching containers.

:: Wait for Docker Desktop to initialise (adjust if your PC is slower)
timeout /t 35 /nobreak >nul

cd /d "C:\RestoChat"
docker-compose up -d

exit /b 0
