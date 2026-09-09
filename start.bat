@echo off
title Black Angler — Start
echo Starting Black Angler...

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
    echo [ERROR] Docker Desktop did not start within 2 minutes.
    echo Please start Docker Desktop manually and try again.
    pause
    exit /b 1
)
timeout /t 5 /nobreak >nul
goto wait_docker

:docker_ready
echo Docker is ready. Starting Containers...
cd /d "%~dp0"
docker-compose up -d

echo.
echo Waiting for services to be ready before database sync...
timeout /t 8 /nobreak >nul

echo.
echo [Sync] Syncing chatbot flow configuration to MongoDB...
docker exec python_backend python /app/uploads/configs/sync_flow_docker.py

echo.
echo [Cleanup] Clearing active customer sessions...
docker exec wa_mongodb mongosh whatsapp_saas --eval "db.customer_sessions.deleteMany({})"

echo.
echo Black Angler is running at http://localhost:3000
echo.
start http://localhost:3000

