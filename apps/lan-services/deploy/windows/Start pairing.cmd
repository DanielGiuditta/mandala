@echo off
setlocal
title Mandala employee pairing
set "MANDALA_PAIRING_DIR=%~dp0"
set "MANDALA_PAIRING_CHECK=%~1"
powershell.exe -NoProfile -STA -ExecutionPolicy RemoteSigned -Command "$ErrorActionPreference='Stop'; try { $entry=Join-Path $env:MANDALA_PAIRING_DIR 'pairing-entry.ps1'; Unblock-File -LiteralPath $entry; & $entry -CheckOnly:($env:MANDALA_PAIRING_CHECK -eq '--check-only'); exit 0 } catch { Write-Host ('Pairing needs attention: '+$_.Exception.Message); exit 1 }"
set "MANDALA_PAIRING_EXIT=%ERRORLEVEL%"
if not "%MANDALA_PAIRING_EXIT%"=="0" pause
exit /b %MANDALA_PAIRING_EXIT%
