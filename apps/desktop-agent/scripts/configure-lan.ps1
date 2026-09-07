#Requires -RunAsAdministrator
param(
  [Parameter(Mandatory = $true)][string]$GatewayUrl,
  [Parameter(Mandatory = $true)][string]$DeviceCertificateThumbprint
)
$ErrorActionPreference = 'Stop'
$gateway = [Uri]$GatewayUrl
if ($gateway.Scheme -ne 'https' -or $gateway.AbsolutePath -ne '/' -or $gateway.UserInfo -or $gateway.Query -or $gateway.Fragment) {
  throw 'GatewayUrl must be an HTTPS origin with no path, credentials, query, or fragment.'
}
if ($DeviceCertificateThumbprint -notmatch '^[A-Fa-f0-9]{40}$') { throw 'Use the Windows certificate thumbprint (40 hexadecimal characters).' }
$configurationDirectory = Join-Path $env:ProgramData 'Mandala Agent'
New-Item -ItemType Directory -Path $configurationDirectory -Force | Out-Null
# IT-managed settings must not be writable by ordinary workstation users.
$directoryAcl = New-Object System.Security.AccessControl.DirectorySecurity
$directoryAcl.SetSecurityDescriptorSddlForm('D:P(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)(A;OICI;0x1200a9;;;BU)')
Set-Acl -Path $configurationDirectory -AclObject $directoryAcl
$configuration = @{ gatewayUrl = $GatewayUrl.TrimEnd('/'); deviceCertificateThumbprint = $DeviceCertificateThumbprint.ToUpperInvariant() }
$configurationPath = Join-Path $configurationDirectory 'lan.config.json'
$configuration | ConvertTo-Json | Set-Content $configurationPath -Encoding UTF8
$fileAcl = New-Object System.Security.AccessControl.FileSecurity
$fileAcl.SetSecurityDescriptorSddlForm('D:P(A;;FA;;;SY)(A;;FA;;;BA)(A;;FR;;;BU)')
Set-Acl -Path $configurationPath -AclObject $fileAcl
Write-Output 'LAN transport configured. Before use, enroll the client certificate and trust the office server CA in the employee Windows profile, then restart Mandala Agent.'
