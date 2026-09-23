$ErrorActionPreference='Stop'
if(Get-ScheduledTask -TaskName 'Mandala Rehearsal Observer' -ErrorAction SilentlyContinue){exit 0}
$action=New-ScheduledTaskAction -Execute 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' -Argument '-NoProfile -ExecutionPolicy Bypass -File C:\MandalaRehearsal\agent-system.ps1'
$trigger=New-ScheduledTaskTrigger -AtStartup
$principal=New-ScheduledTaskPrincipal -UserId 'S-1-5-18' -LogonType ServiceAccount -RunLevel Highest
$settings=New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 25) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName 'Mandala Rehearsal Observer' -Action $action -Trigger $trigger -Principal $principal -Settings $settings|Out-Null
Start-ScheduledTask -TaskName 'Mandala Rehearsal Observer'
