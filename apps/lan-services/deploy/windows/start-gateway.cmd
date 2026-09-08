@echo off
setlocal
where node.exe >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 24 LTS for Windows, then reopen this window.
  pause
  exit /b 1
)
node.exe "%~dp0start-gateway.mjs" %*
set "gatewayExit=%ERRORLEVEL%"
echo Gateway stopped. Keep this window open while IT reads any error above.
pause
exit /b %gatewayExit%
