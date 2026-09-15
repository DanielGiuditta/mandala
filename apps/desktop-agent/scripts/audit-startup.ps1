param([Parameter(Mandatory=$true)][string]$InstallDirectory)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'startup-repair\startup-core.ps1')
$agent = Join-Path $InstallDirectory 'Mandala.Agent.exe'
Assert-MandalaAgent $agent ([Environment]::GetFolderPath('CommonApplicationData'))
if (-not (Test-MandalaStartupShortcut ([Environment]::GetFolderPath('CommonStartup')) $agent)) {
    throw 'Installer audit failed: common startup must launch the installed Mandala.Agent.exe directly, without setup arguments, from its installed directory.'
}
if (-not (Test-Path -LiteralPath (Join-Path $InstallDirectory 'startup-repair\Repair Mandala Startup.cmd'))) {
    throw 'Installer audit failed: startup repair is missing.'
}
Write-Host 'Installed startup audit passed: correct executable, working directory, no wizard arguments, repair included.'
