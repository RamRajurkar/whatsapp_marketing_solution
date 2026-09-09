@echo off
title Black Angler — Stop
echo Stopping Black Angler...
cd /d "%~dp0"
docker-compose down
echo.
echo Black Angler has been stopped.
pause
