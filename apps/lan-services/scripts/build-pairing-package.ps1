param([Parameter(Mandatory=$true)][string]$OutputDirectory)
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$output=[IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $output -Force | Out-Null
$stage=Join-Path $output ('pairing-stage-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $stage | Out-Null
try {
    foreach($name in @('Start pairing.cmd','pairing-entry.ps1','setup-wizard.ps1','pairing-core.ps1','employee-agent-core.ps1','PairingCertificates.cs','Employee pairing.cmd')) {
        Copy-Item -LiteralPath (Join-Path $root ('deploy/windows/'+$name)) -Destination $stage
    }
    Copy-Item -LiteralPath (Join-Path $root '../desktop-agent/scripts/configure-lan.ps1') -Destination $stage
    Copy-Item -LiteralPath (Join-Path $root '../desktop-agent/scripts/startup-repair') -Destination $stage -Recurse
    @'
MANDALA PAIRING 1.0.0 - EXISTING GATEWAY AND AGENT

This package connects the existing employee Agent to the existing gateway.
It contains no installer and does not recreate the gateway or erase saved time.
IT administrator approval is needed on the gateway and for employee connection settings.

Keep the complete extracted folder together. Open Start pairing.cmd normally.
1. On STP32, signed in as the original employee: choose Employee computer.
   Close Agent after preserving any pending work. Choose Check agent and create PC request.
   Transfer the resulting public request JSON to STP80 through the approved local transfer.
2. On STP80: choose Gateway computer, approve administrator access and approve that request.
   This briefly restarts the gateway. Save the connection JSON and note the pairing code/address.
3. Return the connection JSON to STP32. Choose Complete connection and enter that pairing code.
   Confirm the address is https://192.168.30.80:8443 before continuing with the office time test.

Existing Agent 1.0.16 is checked and retained. If an installer is requested, stop and report it;
do not install an old Agent. Existing pending time, sign-in and private keys are retained.
Expired public requests renew automatically; their predecessor stays beside pending-pairing.json.
Only public request/connection JSON files travel between computers. Keep passwords and private
keys on their original computers. Never disconnect the remote-control network during this step.

Pairing success is not proof that time reached production. Complete the agreed save test and
return the displayed save reference or diagnostic report for production verification.
'@ | Set-Content -LiteralPath (Join-Path $stage 'READ FIRST.txt') -Encoding UTF8
    $files=@(Get-ChildItem -LiteralPath $stage -Recurse -File | Sort-Object FullName | ForEach-Object {
        @{name=$_.FullName.Substring($stage.Length+1).Replace('\','/');bytes=$_.Length;sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}
    })
    @{version='1.0.0';backend='nzlajptokbcgeaifgnoq';files=$files} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $stage 'pairing-manifest.json') -Encoding UTF8
    $zip=Join-Path $output 'Mandala-Pairing-1.0.0.zip'
    Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip -Force
    @{filename=(Split-Path $zip -Leaf);bytes=(Get-Item -LiteralPath $zip).Length;sha256=(Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $output 'pairing-package.json') -Encoding UTF8
    Write-Host ('Created '+$zip)
} finally {Remove-Item -LiteralPath $stage -Recurse -Force}
