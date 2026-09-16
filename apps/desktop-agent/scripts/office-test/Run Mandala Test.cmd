@echo off
setlocal
title Mandala complete office test
set "MANDALA_OFFICE_TEST_DIR=%~dp0"
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -Command "$ErrorActionPreference='Stop'; try { foreach ($name in @('office-test.ps1','check-core.ps1','startup-repair\startup-core.ps1','startup-repair\repair-startup.ps1')) { Unblock-File -LiteralPath (Join-Path $env:MANDALA_OFFICE_TEST_DIR $name) }; & (Join-Path $env:MANDALA_OFFICE_TEST_DIR 'office-test.ps1'); exit $LASTEXITCODE } catch { Write-Host ('TEST NEEDS ATTENTION: '+$_.Exception.Message); exit 1 }"
echo.
pause
