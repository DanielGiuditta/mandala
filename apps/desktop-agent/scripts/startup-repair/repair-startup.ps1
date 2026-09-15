param([switch]$CommonOnly)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'startup-core.ps1')

try {
    $agent = Get-MandalaAgentPath
    Assert-MandalaAgent $agent ([Environment]::GetFolderPath('CommonApplicationData'))
    $commonStartup = [Environment]::GetFolderPath('CommonStartup')
    if ($CommonOnly) {
        if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
            throw 'Windows administrator approval is required to repair startup for this computer.'
        }
        $backup = Join-Path ([Environment]::GetFolderPath('CommonApplicationData')) 'Mandala Startup Repair\shortcut-backups'
        Repair-MandalaStartupFolder $commonStartup $agent $backup -CreateShortcut
        exit 0
    }

    if (([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'Close this window and open Repair Mandala Startup.cmd normally in the employee Windows account, without Run as administrator.'
    }

    # Elevate only the common shortcut operation. Do not launch the employee agent
    # or access profile-bound certificates/tokens as the administrator account.
    Write-Host 'Windows administrator approval is required once to repair Mandala startup.'
    $arguments = '-NoProfile -ExecutionPolicy RemoteSigned -File "' + $PSCommandPath + '" -CommonOnly'
    $process = Start-Process powershell.exe -ArgumentList $arguments -Verb RunAs -Wait -PassThru
    if ($process.ExitCode -ne 0) { throw 'Startup repair was not completed. No connection settings or saved time were changed.' }
    if (-not (Test-MandalaStartupShortcut $commonStartup $agent)) { throw 'The common startup shortcut is still missing or incorrect.' }

    $backup = Join-Path $env:LOCALAPPDATA 'Mandala Startup Repair\shortcut-backups'
    Repair-MandalaStartupFolder ([Environment]::GetFolderPath('Startup')) $agent $backup
    # Respect Windows' startup-disable setting: report it instead of editing its
    # undocumented binary value or claiming automatic startup is already proven.
    foreach ($key in @('HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\StartupFolder', 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\StartupFolder')) {
        $approval = Get-ItemProperty -LiteralPath $key -Name 'Mandala Agent.lnk' -ErrorAction SilentlyContinue
        if ($approval -and $approval.'Mandala Agent.lnk'[0] -in @(3, 7)) {
            throw 'The shortcut is repaired, but Windows has Mandala Agent disabled in Startup apps. Enable Mandala Agent there before the restart test.'
        }
    }
    $currentSession = (Get-Process -Id $PID).SessionId
    $running = @(Get-Process -Name 'Mandala.Agent' -ErrorAction SilentlyContinue | Where-Object { $_.SessionId -eq $currentSession })
    if ($running.Count -eq 0) { Start-Process -FilePath $agent -WorkingDirectory (Split-Path $agent -Parent) | Out-Null }
    Write-Host 'Startup shortcut repaired. Mandala Agent opens in your Windows account.'
    Write-Host 'After saving any active work, restart and sign in to confirm it opens automatically.'
    Write-Host 'You still select a project and click Start Work to begin tracking.'
} catch {
    Write-Host ('REPAIR NEEDS ATTENTION: ' + $_.Exception.Message)
    exit 1
}
