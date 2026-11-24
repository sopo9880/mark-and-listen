@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js 22 or newer is required: https://nodejs.org/
  pause
  exit /b 1
)
node -e "if(!(Number(process.versions.node.split('.')[0])>=22))process.exit(1)"
if errorlevel 1 (
  echo Install Node.js 22 or newer and run this launcher again.
  pause
  exit /b 1
)
node src\server.mjs --open
if errorlevel 1 pause
