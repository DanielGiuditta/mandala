@echo off
setlocal
title Mandala Agent startup repair
set "MANDALA_STARTUP_REPAIR_DIR=%~dp0"
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -Command "$ErrorActionPreference='Stop'; try { foreach ($name in @('startup-core.ps1','repair-startup.ps1')) { Unblock-File -LiteralPath (Join-Path $env:MANDALA_STARTUP_REPAIR_DIR $name) }; & (Join-Path $env:MANDALA_STARTUP_REPAIR_DIR 'repair-startup.ps1'); exit $LASTEXITCODE } catch { Write-Host ('REPAIR NEEDS ATTENTION: '+$_.Exception.Message); exit 1 }"
echo.
pause
