@echo off
setlocal
title Mandala Agent startup repair
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File "%~dp0repair-startup.ps1"
echo.
pause
