param([string]$Role='', [string]$Mode='', [switch]$Elevated)
$ErrorActionPreference='Stop'
function Assert-OfficePackage {
    $manifestPath=Join-Path $PSScriptRoot 'package-manifest.json'
    if(-not(Test-Path -LiteralPath $manifestPath)){throw 'Package inventory is missing. Keep the complete extracted package together.'}
    $manifest=Get-Content -LiteralPath $manifestPath -Raw|ConvertFrom-Json
    if($manifest.version -ne '1.2.3' -or $manifest.backend -ne 'nzlajptokbcgeaifgnoq' -or $manifest.files.Count -lt 10){throw 'Package identity is invalid.'}
    $seen=@{}
    foreach($file in $manifest.files) {
        if($file.name -notmatch '^[a-zA-Z0-9 _./-]+$' -or $file.name.Contains('..') -or [IO.Path]::IsPathRooted($file.name) -or $seen.ContainsKey($file.name)){throw 'Invalid package inventory path.'}
        $seen[$file.name]=$true
        $path=Join-Path $PSScriptRoot $file.name
        if(-not(Test-Path -LiteralPath $path -PathType Leaf)){throw ('Required package file is missing: '+$file.name)}
        $walk=$path
        while($walk -and $walk.StartsWith($PSScriptRoot,[StringComparison]::OrdinalIgnoreCase)) {
            if((Get-Item -LiteralPath $walk -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Package files must not be redirected links.'}
            if($walk -eq $PSScriptRoot){break};$walk=Split-Path $walk -Parent
        }
        if((Get-Item -LiteralPath $path).Length -ne $file.bytes -or (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $file.sha256){throw ('Package file failed verification: '+$file.name)}
    }
    foreach($path in @(Get-ChildItem -LiteralPath $PSScriptRoot -Recurse -File -Force)) {
        $relative=$path.FullName.Substring($PSScriptRoot.Length+1).Replace('\','/')
        if($relative -ne 'package-manifest.json' -and -not $seen.ContainsKey($relative)){throw ('Unexpected file in package: '+$relative)}
    }
    foreach($name in @('quick-test.ps1','package-entry.ps1','report-core.ps1','recovery-evidence.ps1','check-core.ps1','ui-driver.ps1','gateway-repair/repair-core.ps1','gateway-repair/pairing-core.ps1','startup-repair/startup-core.ps1','startup-repair/repair-startup.ps1')) {
        if(-not $seen.ContainsKey($name)){throw ('Required dependency absent from inventory: '+$name)}
        Unblock-File -LiteralPath (Join-Path $PSScriptRoot $name)
    }
}
Assert-OfficePackage
if($Role -and $Role -notin @('gateway','employee')){throw 'Invalid computer role.'}
if($Mode -and $Mode -notin @('Run','Baseline','Export')){throw 'Invalid operation.'}
if(-not $Role) {
    Write-Host 'MANDALA LAN TIME TRACKING 1.2.3'
    Write-Host '1 - Employee computer: read-only baseline (run this first)'
    Write-Host '2 - Dedicated gateway: repair and restart checks'
    Write-Host '3 - Employee computer: time tests AFTER gateway checks pass'
    Write-Host '4 - Return existing reports only'
    switch(Read-Host 'Choose 1, 2, 3 or 4') {
        '1' {$Role='employee';$Mode='Baseline'}
        '2' {$Role='gateway';$Mode='Run'}
        '3' {$Role='employee';$Mode='Run'}
        '4' {
            switch(Read-Host 'Reports from this computer: 1 employee, 2 gateway') {'1' {$Role='employee'} '2' {$Role='gateway'} default {throw 'No role selected; no test actions performed.'}}
            $Mode='Export'
        }
        default {throw 'No operation selected; no test actions performed.'}
    }
}
if(-not $Mode){$Mode='Run'}
$admin=([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if($Role -eq 'employee' -and $admin){throw 'Close this window and open Start Mandala normally in the original employee account, without Run as administrator.'}
if($Role -eq 'gateway' -and -not $admin) {
    if($Elevated){throw 'Administrator approval was not granted.'}
    $entry=Join-Path $PSScriptRoot 'package-entry.ps1'
    $arguments='-NoProfile -STA -ExecutionPolicy RemoteSigned -File "'+$entry+'" -Role gateway -Mode '+$Mode+' -Elevated'
    try {$process=Start-Process powershell.exe -ArgumentList $arguments -Verb RunAs -Wait -PassThru;exit $process.ExitCode}
    catch {throw 'Administrator approval was cancelled or unavailable. No gateway repair ran. Reopen the same entry point during the maintenance window.'}
}
Write-Host ('This computer: '+$env:COMPUTERNAME+' | Role: '+$Role+' | Operation: '+$Mode)
& (Join-Path $PSScriptRoot 'quick-test.ps1') -Role $Role -Mode $Mode
