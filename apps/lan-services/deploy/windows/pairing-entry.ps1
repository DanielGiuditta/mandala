param([switch]$CheckOnly)
$ErrorActionPreference='Stop'
$manifest=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'pairing-manifest.json') -Raw | ConvertFrom-Json
if($manifest.version -ne '1.0.0' -or $manifest.backend -ne 'nzlajptokbcgeaifgnoq'){throw 'Pairing package identity is invalid.'}
$seen=@{}
foreach($file in $manifest.files) {
    if($file.name -notmatch '^[a-zA-Z0-9 _./-]+$' -or $file.name.Contains('..') -or [IO.Path]::IsPathRooted($file.name) -or $seen.ContainsKey($file.name)){throw 'Invalid pairing package inventory.'}
    $seen[$file.name]=$true; $path=Join-Path $PSScriptRoot $file.name
    $walk=$path
    while($walk -and $walk.StartsWith($PSScriptRoot,[StringComparison]::OrdinalIgnoreCase)) {
        if((Get-Item -LiteralPath $walk -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Pairing package paths must not be redirected.'}
        if($walk -eq $PSScriptRoot){break}; $walk=Split-Path $walk -Parent
    }
    if((Get-Item -LiteralPath $path).Length -ne $file.bytes -or (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $file.sha256){throw ('Pairing package file failed verification: '+$file.name)}
}
foreach($name in @('Start pairing.cmd','pairing-entry.ps1','setup-wizard.ps1','pairing-core.ps1','employee-agent-core.ps1','PairingCertificates.cs','configure-lan.ps1','startup-repair/startup-core.ps1','startup-repair/repair-startup.ps1')) {
    if(-not $seen.ContainsKey($name)){throw ('Pairing package dependency missing: '+$name)}
}
foreach($file in @(Get-ChildItem -LiteralPath $PSScriptRoot -Recurse -File -Force)) {
    $name=$file.FullName.Substring($PSScriptRoot.Length+1).Replace('\','/')
    if($name -ne 'pairing-manifest.json' -and -not $seen.ContainsKey($name)){throw ('Unexpected pairing package file: '+$name)}
}
foreach($file in $manifest.files){if($file.name -match '\.(ps1|cs)$'){Unblock-File -LiteralPath (Join-Path $PSScriptRoot $file.name)}}
if($CheckOnly){Write-Host 'PASS: complete pairing package verified; no setup changes made.';return}
& (Join-Path $PSScriptRoot 'setup-wizard.ps1') -Mode Pairing
