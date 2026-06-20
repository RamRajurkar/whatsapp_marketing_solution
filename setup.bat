@echo off
setlocal enabledelayedexpansion
title RestoChat — First Time Setup
color 0A

echo.
echo  ============================================
echo    RestoChat — WhatsApp Marketing Solution
echo    First Time Setup
echo  ============================================
echo.

:: ── Check for admin rights ──────────────────────────────────────────────────
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERROR] Please right-click setup.bat and choose "Run as Administrator"
    pause
    exit /b 1
)

:: ── Check Docker ─────────────────────────────────────────────────────────────
echo  [1/6] Checking Docker...
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  Docker not found. Installing Docker Desktop...
    echo  This may take 5-10 minutes. Please wait.
    echo.
    if exist "installers\DockerDesktopInstaller.exe" (
        start /wait installers\DockerDesktopInstaller.exe install --quiet
    ) else (
        echo  [ERROR] DockerDesktopInstaller.exe not found in installers\ folder.
        echo  Please download Docker Desktop from https://www.docker.com/products/docker-desktop/
        echo  Install it manually, restart your PC, then run setup.bat again.
        pause
        exit /b 1
    )
    echo.
    echo  Docker installed! Please RESTART your PC and run setup.bat again.
    pause
    exit /b 0
)
echo  [OK] Docker is installed.

:: ── Check Docker is running ──────────────────────────────────────────────────
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  Docker Desktop is not running. Starting it...
    start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    echo  Waiting 30 seconds for Docker to start...
    timeout /t 30 /nobreak >nul
    docker info >nul 2>&1
    if %errorlevel% neq 0 (
        echo  [ERROR] Docker failed to start. Please open Docker Desktop manually and re-run setup.bat.
        pause
        exit /b 1
    )
)
echo  [OK] Docker is running.

:: ── Copy app to C:\RestoChat ─────────────────────────────────────────────────
echo.
echo  [2/6] Installing RestoChat to C:\RestoChat...
if not exist "C:\RestoChat" mkdir "C:\RestoChat"
xcopy /E /I /Y /Q "app\*" "C:\RestoChat\" >nul
echo  [OK] Files copied.

:: ── Collect client info ──────────────────────────────────────────────────────
echo.
echo  [3/6] Restaurant Configuration
echo  ─────────────────────────────────────────────
echo.
set /p RESTAURANT_NAME="  Restaurant Name (e.g. Spice Garden): "
set /p WA_PHONE_ID="  WhatsApp Phone Number ID: "
set /p WA_BUSINESS_ID="  WhatsApp Business Account ID: "
set /p WA_TOKEN="  WhatsApp Access Token: "
set /p WA_VERIFY="  Webhook Verify Token (make up a password): "
set /p WA_APP_SECRET="  WhatsApp App Secret (from Meta Dashboard, optional — press Enter to skip): "

:: Generate random JWT secret
set "JWT_SECRET="
for /L %%i in (1,1,4) do set "JWT_SECRET=!JWT_SECRET!!random!"

:: ── Write .env file ──────────────────────────────────────────────────────────
echo.
echo  [4/6] Writing configuration...
(
    echo MONGODB_URI=mongodb://mongodb:27017
    echo DB_NAME=resto_chat
    echo JWT_SECRET=!JWT_SECRET!
    echo WA_PHONE_NUMBER_ID=!WA_PHONE_ID!
    echo WA_BUSINESS_ACCOUNT_ID=!WA_BUSINESS_ID!
    echo WA_ACCESS_TOKEN=!WA_TOKEN!
    echo WA_VERIFY_TOKEN=!WA_VERIFY!
    echo WA_APP_SECRET=!WA_APP_SECRET!
    echo CLOUDINARY_CLOUD_NAME=
    echo CLOUDINARY_API_KEY=
    echo CLOUDINARY_API_SECRET=
) > "C:\RestoChat\python_backend\.env"
echo  [OK] Config saved.

:: ── Register auto-start task ─────────────────────────────────────────────────
echo.
echo  [5/6] Setting up auto-start on boot...
schtasks /delete /tn "RestoChat AutoStart" /f >nul 2>&1
schtasks /create /tn "RestoChat AutoStart" /tr "C:\RestoChat\autostart.bat" /sc onlogon /ru "%USERNAME%" /rl highest /f >nul
echo  [OK] RestoChat will start automatically when Windows logs in.

:: ── Start the app ────────────────────────────────────────────────────────────
echo.
echo  [6/6] Starting RestoChat...
cd /d "C:\RestoChat"
docker-compose up -d --build

echo.
echo  ============================================
echo    Setup Complete!
echo  ============================================
echo.
echo  RestoChat is now running at:
echo    http://localhost:3000
echo.
echo  Next steps:
echo    1. Open http://localhost:3000 in your browser
echo    2. Register your admin account
echo    3. Set up Cloudflare tunnel for WhatsApp webhooks
echo    4. Install the PWA from your browser (look for the install icon)
echo.
start http://localhost:3000
pause
