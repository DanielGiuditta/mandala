@echo off
setlocal
if not exist "%~dp0runtime\node.exe" (
  echo The bundled runtime is missing. Reinstall Mandala Gateway.
  pause
  exit /b 1
)
"%~dp0runtime\node.exe" "%~dp0start-gateway.mjs" %*
set "gatewayExit=%ERRORLEVEL%"
echo Gateway stopped. Keep this window open while IT reads any error above.
pause
exit /b %gatewayExit%
