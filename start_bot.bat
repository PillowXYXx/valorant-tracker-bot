@echo off
title Valorant Tracker Bot
echo Stopping any existing node processes...
taskkill /F /IM node.exe /T >nul 2>&1

echo.
echo Updating dependencies...
call npm install

echo.
echo Starting the bot...
echo (This will refresh the slash commands)
node index.js

pause