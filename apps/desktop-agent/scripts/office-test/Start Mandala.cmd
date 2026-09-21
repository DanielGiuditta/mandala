@echo off
setlocal
title Mandala LAN time tracking
set "MANDALA_KIT_DIR=%~dp0"
set "MANDALA_KIT_ROLE=%~1"
set "MANDALA_KIT_MODE=%~2"
powershell.exe -NoProfile -STA -ExecutionPolicy RemoteSigned -Command "$ErrorActionPreference='Stop'; try { $entry=Join-Path $env:MANDALA_KIT_DIR 'package-entry.ps1'; Unblock-File -LiteralPath $entry; & $entry -Role $env:MANDALA_KIT_ROLE -Mode $env:MANDALA_KIT_MODE; exit $LASTEXITCODE } catch { Write-Host ('Mandala needs attention: '+$_.Exception.Message); exit 1 }"
set "MANDALA_KIT_EXIT=%ERRORLEVEL%"
echo.
pause
exit /b %MANDALA_KIT_EXIT%
