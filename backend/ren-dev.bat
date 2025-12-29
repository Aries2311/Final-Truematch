@echo off
setlocal
cd /d "%~dp0"

echo [1/2] Starting Node server...
start "TrueMatch Server" cmd /k "node server.js"

echo [2/2] Starting ngrok tunnel (port 3000)...
start "ngrok tunnel" cmd /k "ngrok http 3000"

echo.
echo Done. Copy the https ngrok URL and (optional) set APP_BASE_URL to it in .env then restart server.
endlocal
