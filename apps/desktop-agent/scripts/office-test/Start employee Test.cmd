@echo off
setlocal
title Mandala employee complete test
set "MANDALA_QUICK_DIR=%~dp0"
powershell.exe -NoProfile -STA -ExecutionPolicy RemoteSigned -Command "$ErrorActionPreference='Stop'; try { foreach ($name in @('quick-test.ps1','ui-driver.ps1','check-core.ps1','startup-repair\startup-core.ps1','startup-repair\repair-startup.ps1')) { Unblock-File -LiteralPath (Join-Path $env:MANDALA_QUICK_DIR $name) }; & (Join-Path $env:MANDALA_QUICK_DIR 'quick-test.ps1') -Role employee } catch { Write-Host ('TEST NEEDS ATTENTION: '+$_.Exception.Message); exit 1 }"
echo.
pause
