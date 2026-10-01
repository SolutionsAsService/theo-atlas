@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22 or newer is required.
  pause
  exit /b 1
)
start "THEO Atlas" /b cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:4317"
node server.mjs
pause
