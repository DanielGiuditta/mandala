$ErrorActionPreference = 'Stop'
if (-not ('MandalaPairingCertificates' -as [type])) { Add-Type -Path (Join-Path $PSScriptRoot 'PairingCertificates.cs') }
$script:Production = 'nzlajptokbcgeaifgnoq'
function Write-PairingJson($Path, $Value) {
    $text = ConvertTo-Json -InputObject $Value -Depth 10
    [IO.File]::WriteAllText($Path, $text, (New-Object Text.UTF8Encoding($false)))
}
function Read-PairingJson($Path) {
    if ((Get-Item -LiteralPath $Path).Length -gt 65536) { throw 'This pairing file is too large.' }
    return (Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json)
}
function Get-RandomPassword {
    $bytes = New-Object byte[] 32
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes); return [Convert]::ToBase64String($bytes) } finally { $rng.Dispose() }
}
function Get-Pem([byte[]]$Bytes) {
    return "-----BEGIN CERTIFICATE-----`n" + [Convert]::ToBase64String($Bytes, [Base64FormattingOptions]::InsertLineBreaks) + "`n-----END CERTIFICATE-----`n"
}
function Set-GatewayAcl($Path) {
    $acl = New-Object Security.AccessControl.DirectorySecurity
    $acl.SetSecurityDescriptorSddlForm('D:P(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)(A;OICI;0x1200a9;;;LS)')
    Set-Acl -LiteralPath $Path -AclObject $acl
}
function Add-PairingRoot([byte[]]$Bytes) {
    $cert = [Security.Cryptography.X509Certificates.X509Certificate2]::new($Bytes)
    $store = New-Object Security.Cryptography.X509Certificates.X509Store('Root', 'CurrentUser')
    try { $store.Open('ReadWrite'); $store.Add($cert) } finally { $store.Close() }
    return $cert.Thumbprint
}
function Get-PairingCode([byte[]]$Root) {
    return [MandalaPairingCertificates]::Fingerprint($Root).Replace(':','').Substring(0,32)
}
function Initialize-PairingGateway($Address, $DataDirectory, $InstallDirectory) {
    $ip = $null
    if (-not [Net.IPAddress]::TryParse($Address, [ref]$ip) -or $ip.AddressFamily -ne [Net.Sockets.AddressFamily]::InterNetwork) { throw 'Choose the gateway computer LAN IPv4 address.' }
    New-Item -ItemType Directory -Path $DataDirectory -Force | Out-Null
    Set-GatewayAcl $DataDirectory
    $stateFile = Join-Path $DataDirectory 'pairing-state.json'
    if (Test-Path $stateFile) {
        $state = Read-PairingJson $stateFile
        if ($state.protocol -ne 1 -or $state.backend -ne $script:Production) { throw 'The saved gateway identity is invalid.' }
        if ($state.address -ne $Address) { throw 'This gateway is already paired at another address. Restore its previous IP; do not replace certificates during active use.' }
        return $state
    }
    if (Test-Path (Join-Path $DataDirectory 'gateway.json')) { throw 'Existing manual gateway settings were found. Preserve them; use a fresh dedicated gateway or have IT migrate the existing setup first.' }
    $example = Read-PairingJson (Join-Path $InstallDirectory 'gateway.example.json')
    if (-not $example.supabaseAnonKey -or $example.supabaseAnonKey -match 'REPLACE') { throw 'Install the audited gateway installer with its production connection key.' }
    $password = Get-RandomPassword
    $material = [MandalaPairingCertificates]::Create('Mandala gateway', $Address, $true, $password)
    [IO.File]::WriteAllBytes((Join-Path $DataDirectory 'gateway.pfx'), $material.Pfx)
    [IO.File]::WriteAllText((Join-Path $DataDirectory 'device-ca.crt'), (Get-Pem $material.Root), (New-Object Text.UTF8Encoding($false)))
    Write-PairingJson (Join-Path $DataDirectory 'enrolled-devices.json') @()
    $config = @{ bindAddress=$Address; port=8443; supabaseAnonKey=$example.supabaseAnonKey; serverPfx=(Join-Path $DataDirectory 'gateway.pfx'); serverPfxPassword=$password; deviceCaCertificate=(Join-Path $DataDirectory 'device-ca.crt'); enrolledDevices=(Join-Path $DataDirectory 'enrolled-devices.json') }
    Write-PairingJson (Join-Path $DataDirectory 'gateway.json') $config
    $state = @{ protocol=1; backend=$script:Production; address=$Address; root=[Convert]::ToBase64String($material.Root); certificate=[Convert]::ToBase64String($material.Certificate); approved=@() }
    Write-PairingJson $stateFile $state
    return $state
}
function Enable-PairingGateway($Address, $EmployeeSubnet, $DataDirectory, $InstallDirectory) {
    if ($EmployeeSubnet -notmatch '^\d{1,3}(\.\d{1,3}){3}/\d{1,2}$' -or [int]($EmployeeSubnet.Split('/')[1]) -lt 8 -or [int]($EmployeeSubnet.Split('/')[1]) -gt 32) { throw 'Enter the employee LAN subnet, for example 192.168.1.0/24.' }
    $node = Join-Path $InstallDirectory 'runtime\node.exe'
    $ruleName = 'Mandala guided gateway HTTPS'
    Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule
    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow -Protocol TCP -LocalAddress $Address -LocalPort 8443 -RemoteAddress $EmployeeSubnet -Program $node -Profile Domain,Private | Out-Null
    $arguments = '"' + (Join-Path $InstallDirectory 'start-gateway.mjs') + '" "' + (Join-Path $DataDirectory 'gateway.json') + '"'
    $action = New-ScheduledTaskAction -Execute $node -Argument $arguments -WorkingDirectory $InstallDirectory
    $principal = New-ScheduledTaskPrincipal -UserId 'S-1-5-19' -LogonType ServiceAccount -RunLevel Limited
    $settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
    $trigger = New-ScheduledTaskTrigger -AtStartup
    Register-ScheduledTask -TaskName 'Mandala LAN Gateway' -Action $action -Principal $principal -Settings $settings -Trigger $trigger -Force | Out-Null
    Restart-PairingGateway
}
function Restart-PairingGateway {
    Stop-ScheduledTask -TaskName 'Mandala LAN Gateway' -ErrorAction SilentlyContinue
    for ($i=0; $i -lt 30 -and (Get-ScheduledTask -TaskName 'Mandala LAN Gateway').State -eq 'Running'; $i++) { Start-Sleep -Milliseconds 200 }
    if ((Get-ScheduledTask -TaskName 'Mandala LAN Gateway').State -eq 'Running') { throw 'The gateway could not stop. Ask local IT to check the scheduled task.' }
    Start-ScheduledTask -TaskName 'Mandala LAN Gateway'
    Start-Sleep -Seconds 2
    if ((Get-ScheduledTask -TaskName 'Mandala LAN Gateway').State -ne 'Running') { throw 'The gateway did not stay running. Ask local IT to check the gateway task and configuration.' }
}
function New-EmployeePairingRequest($OutputPath, $ProfileDirectory) {
    New-Item -ItemType Directory -Path $ProfileDirectory -Force | Out-Null
    $pending = Join-Path $ProfileDirectory 'pending-pairing.json'
    if (Test-Path $pending) {
        $old = Read-PairingJson $pending
        if (Test-Path ('Cert:\CurrentUser\My\' + $old.thumbprint)) { Copy-Item -LiteralPath $pending -Destination $OutputPath -Force; return $old }
        throw 'An earlier request exists but its private key is missing. Preserve this Windows profile and contact IT.'
    }
    $password = Get-RandomPassword
    $material = [MandalaPairingCertificates]::Create('Mandala employee ' + [Guid]::NewGuid().ToString('N'), '', $false, $password)
    $flags = [Security.Cryptography.X509Certificates.X509KeyStorageFlags]::UserKeySet -bor [Security.Cryptography.X509Certificates.X509KeyStorageFlags]::PersistKeySet
    $cert = [Security.Cryptography.X509Certificates.X509Certificate2]::new($material.Pfx, $password, $flags)
    $store = New-Object Security.Cryptography.X509Certificates.X509Store('My','CurrentUser')
    try { $store.Open('ReadWrite'); $store.Add($cert) } finally { $store.Close() }
    $rootThumb = Add-PairingRoot $material.Root
    $request = @{ kind='MandalaEmployeeRequest'; protocol=1; backend=$script:Production; requestId=[Guid]::NewGuid().ToString(); computer=$env:COMPUTERNAME; userSid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value; createdAt=[DateTime]::UtcNow.ToString('o'); thumbprint=$cert.Thumbprint; root=[Convert]::ToBase64String($material.Root); certificate=[Convert]::ToBase64String($material.Certificate) }
    Write-PairingJson $pending $request
    Write-PairingJson $OutputPath $request
    $cert.Dispose()
    return $request
}
function Approve-EmployeePairing($RequestPath, $OutputPath, $DataDirectory) {
    $request = Read-PairingJson $RequestPath
    $id = [Guid]::Empty
    if ($request.kind -ne 'MandalaEmployeeRequest' -or $request.protocol -ne 1 -or $request.backend -ne $script:Production -or -not [Guid]::TryParse($request.requestId, [ref]$id)) { throw 'This is not a Mandala employee request.' }
    $created = [DateTime]::Parse($request.createdAt).ToUniversalTime()
    if ($created -gt [DateTime]::UtcNow.AddMinutes(5) -or $created -lt [DateTime]::UtcNow.AddDays(-7)) { throw 'The request is expired or its clock is incorrect.' }
    $root = [Convert]::FromBase64String($request.root)
    $leaf = [Convert]::FromBase64String($request.certificate)
    if (-not [MandalaPairingCertificates]::Validate($leaf,$root,$false)) { throw 'The employee certificate is invalid.' }
    $cert = [Security.Cryptography.X509Certificates.X509Certificate2]::new($leaf)
    if ($cert.Thumbprint -ne $request.thumbprint) { throw 'The request certificate identity does not match.' }
    $statePath = Join-Path $DataDirectory 'pairing-state.json'
    $state = Read-PairingJson $statePath
    $fp = [MandalaPairingCertificates]::Fingerprint($leaf)
    $entries = @($state.approved | Where-Object { $_ -ne $null })
    $prior = @($entries | Where-Object { $_.requestId -eq $request.requestId })
    if ($prior.Count -gt 0 -and $prior[0].fingerprint -ne $fp) { throw 'This request ID was previously used for another certificate.' }
    if ($prior.Count -eq 0) {
        [IO.File]::AppendAllText((Join-Path $DataDirectory 'device-ca.crt'), (Get-Pem $root), (New-Object Text.UTF8Encoding($false)))
        $entries += @{requestId=$request.requestId; fingerprint=$fp; computer=$request.computer}
        $state.approved = $entries
        Write-PairingJson $statePath $state
    }
    $allowlistPath = Join-Path $DataDirectory 'enrolled-devices.json'
    $allowed = @(Read-PairingJson $allowlistPath | Where-Object { $_ -ne $null })
    if ($fp -notin $allowed) { $allowed += $fp }
    Write-PairingJson $allowlistPath $allowed
    $reply = @{ kind='MandalaEmployeeConnection'; protocol=1; backend=$script:Production; requestId=$request.requestId; userSid=$request.userSid; thumbprint=$request.thumbprint; gatewayUrl=('https://' + $state.address + ':8443'); root=$state.root; certificate=$state.certificate }
    Write-PairingJson $OutputPath $reply
    return $reply
}
function Import-EmployeePairing($ReplyPath, $ProfileDirectory, $ExpectedPairingCode) {
    $reply = Read-PairingJson $ReplyPath
    $request = Read-PairingJson (Join-Path $ProfileDirectory 'pending-pairing.json')
    if ($reply.kind -ne 'MandalaEmployeeConnection' -or $reply.protocol -ne 1 -or $reply.backend -ne $script:Production -or $reply.requestId -ne $request.requestId -or $reply.thumbprint -ne $request.thumbprint -or $reply.userSid -ne [Security.Principal.WindowsIdentity]::GetCurrent().User.Value) { throw 'This connection file belongs to another employee Windows profile/request.' }
    $root = [Convert]::FromBase64String($reply.root)
    $leaf = [Convert]::FromBase64String($reply.certificate)
    if (-not $ExpectedPairingCode -or (Get-PairingCode $root) -cne $ExpectedPairingCode.Replace('-','').Replace(' ','').ToUpperInvariant()) { throw 'The pairing code must match the gateway computer.' }
    if (-not [MandalaPairingCertificates]::Validate($leaf,$root,$true)) { throw 'The gateway certificate is invalid.' }
    $url = [Uri]$reply.gatewayUrl
    $ip = $null
    if ($url.Scheme -ne 'https' -or $url.Port -ne 8443 -or $url.AbsolutePath -ne '/' -or $url.UserInfo -or $url.Query -or $url.Fragment -or -not [Net.IPAddress]::TryParse($url.Host,[ref]$ip)) { throw 'The gateway address is invalid.' }
    $store = New-Object Security.Cryptography.X509Certificates.X509Store('My','CurrentUser')
    try {
        $store.Open('ReadOnly')
        $matches = $store.Certificates.Find([Security.Cryptography.X509Certificates.X509FindType]::FindByThumbprint,$reply.thumbprint,$true)
        if ($matches.Count -ne 1 -or -not $matches[0].HasPrivateKey) { throw 'The employee certificate/private key is missing, expired or untrusted. Use the same Windows profile that created the request.' }
    } finally { $store.Close() }
    $rootThumb = Add-PairingRoot $root
    return $reply
}
