@echo off
powershell.exe -NoProfile -STA -ExecutionPolicy RemoteSigned -File "%~dp0setup-wizard.ps1" -Mode Employee
if errorlevel 1 pause
