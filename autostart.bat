@echo off
title Black Angler — AutoStart
:: This script is called by Windows Task Scheduler on every login.
:: It intelligently waits for Docker Desktop to be ready before launching.

:: ── Check if Docker Desktop is running ───────────────────────────────────────
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo Docker Desktop is not running. Starting it...
    start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
)

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
echo Docker is ready. Starting Black Angler...
cd /d "%~dp0"
docker-compose up -d

exit /b 0
