@echo off
title RestoChat — AutoStart
:: This script is called by Windows Task Scheduler on every login.
:: It intelligently waits for Docker Desktop to be ready before launching.

:: ── Smart-wait for Docker: poll every 5s instead of a blind timeout ──────────
echo Waiting for Docker Desktop to start...
set MAX_RETRIES=24
set RETRY=0

:wait_docker
docker info >nul 2>&1
if %errorlevel% equ 0 goto docker_ready

set /a RETRY+=1
if %RETRY% geq %MAX_RETRIES% (
    echo [TIMEOUT] Docker Desktop did not start within 2 minutes. Giving up.
    exit /b 1
)
timeout /t 5 /nobreak >nul
goto wait_docker

:docker_ready
echo Docker is ready. Starting RestoChat...
cd /d "C:\RestoChat"
docker-compose up -d

exit /b 0
