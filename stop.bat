@echo off
title RestoChat — Stop
echo Stopping RestoChat...
cd /d "C:\RestoChat"
docker-compose down
echo.
echo RestoChat has been stopped.
pause
