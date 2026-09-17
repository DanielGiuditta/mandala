param([Parameter(Mandatory=$true)][string]$InstallDirectory,[string]$RepairFolder)
$ErrorActionPreference='Stop'
# Start-Process from PowerShell 7 otherwise leaks incompatible Core modules.
$env:PSModulePath=(Join-Path $PSHOME 'Modules')+';'+(Join-Path $env:ProgramFiles 'WindowsPowerShell\Modules')
. (Join-Path $InstallDirectory 'pairing-core.ps1')
function Assert($Condition,$Message) { if(-not $Condition) { throw $Message } }
function Reject($Action,$Message) { $rejected=$false; try { & $Action | Out-Null } catch { $rejected=$true }; Assert $rejected $Message }
# Parse the shipped UI using Windows PowerShell 5, without displaying a modal window.
$tokens=$null; $errors=$null
[Management.Automation.Language.Parser]::ParseFile((Join-Path $InstallDirectory 'setup-wizard.ps1'),[ref]$tokens,[ref]$errors) | Out-Null
Assert ($errors.Count -eq 0) ('Wizard syntax: '+($errors | Out-String))
$fixture=Join-Path $env:ProgramData ('Mandala pairing audit '+[Guid]::NewGuid())
$data=Join-Path $fixture 'gateway'; $profile=Join-Path $fixture 'employee'
New-Item -ItemType Directory -Path $fixture | Out-Null
$requestPath=Join-Path $fixture 'request.json'; $replyPath=Join-Path $fixture 'reply.json'
$rootThumbs=@(); $leafThumb=$null; $taskCreated=$false
# Windows prompts on first trust in a user Root store. This headless runner cannot
# answer it. Pre-trust only these generated fixture roots in the disposable VM,
# then exercise the real CurrentUser import. Production still shows Windows' prompt.
$script:auditMachineRoots=@()
$script:realRootImport=${function:Add-PairingRoot}
function Add-PairingRoot([byte[]]$Bytes) {
    $public=[Security.Cryptography.X509Certificates.X509Certificate2]::new($Bytes)
    $machine=New-Object Security.Cryptography.X509Certificates.X509Store('Root','LocalMachine')
    try { $machine.Open('ReadWrite'); $machine.Add($public); $script:auditMachineRoots+=$public.Thumbprint } finally { $machine.Close() }
    return (& $script:realRootImport $Bytes)
}
$address='127.0.0.1';$scope='127.0.0.0/8'
if($RepairFolder) {
 . (Join-Path $RepairFolder 'repair-core.ps1')
 $profileIndices=@(Get-NetConnectionProfile|ForEach-Object {$_.InterfaceIndex})
 $candidate=@(Get-NetIPAddress -AddressFamily IPv4|Where-Object {Test-PrivateGatewayScope $_.IPAddress}|Where-Object {$_.AddressState -eq 'Preferred' -and $_.InterfaceIndex -in $profileIndices})
 if(-not $candidate.Count){throw 'CI requires a private IPv4 interface for the real scoped firewall audit.'}
 $address=$candidate[0].IPAddress;$scope=$address+'/32'
}
try {
    Write-Host 'Pairing audit: create gateway certificate'
    $state=Initialize-PairingGateway $address $data $InstallDirectory
    $root=[Convert]::FromBase64String($state.root)
    $rootThumbs+=([Security.Cryptography.X509Certificates.X509Certificate2]::new($root)).Thumbprint
    Assert (((Get-Content (Join-Path $data 'enrolled-devices.json') -Raw) -replace '\s','') -eq '[]') 'New gateway must have no approved devices.'
    Write-Host 'Pairing audit: create employee key and trust'
    $request=New-EmployeePairingRequest $requestPath $profile
    $leafThumb=$request.thumbprint
    $rootThumbs+=([Security.Cryptography.X509Certificates.X509Certificate2]::new([Convert]::FromBase64String($request.root))).Thumbprint
    $cert=Get-Item ('Cert:\CurrentUser\My\'+$leafThumb)
    Assert $cert.HasPrivateKey 'Employee private key missing.'
    Reject { $cert.Export([Security.Cryptography.X509Certificates.X509ContentType]::Pfx,'audit') } 'Employee private key must not be exportable.'
    foreach($thumb in $rootThumbs) { Assert (-not (Test-Path ('Cert:\CurrentUser\My\'+$thumb))) 'An issuer private key was persisted.' }
    Write-Host 'Pairing audit: approve employee'
    Approve-EmployeePairing $requestPath $replyPath $data | Out-Null
    # A repeated approval repairs the allowlist if a previous write was interrupted.
    Write-PairingJson (Join-Path $data 'enrolled-devices.json') @()
    Write-Host 'Pairing audit: approve employee'
    Approve-EmployeePairing $requestPath $replyPath $data | Out-Null
    Assert (@(Read-PairingJson (Join-Path $data 'enrolled-devices.json')).Count -eq 1) 'Repeated approval must produce one enrollment.'
    $code=Get-PairingCode $root
    Reject { Import-EmployeePairing $replyPath $profile '00000000000000000000000000000000' } 'Wrong gateway pairing code accepted.'
    $bad=Read-PairingJson $replyPath; $bad.userSid='S-1-5-18'
    $badPath=Join-Path $fixture 'wrong-profile.json'; Write-PairingJson $badPath $bad
    Reject { Import-EmployeePairing $badPath $profile $code } 'Another Windows profile accepted.'
    Write-Host 'Pairing audit: import approved gateway trust'
    $reply=Import-EmployeePairing $replyPath $profile $code
    $store=New-Object Security.Cryptography.X509Certificates.X509Store('My','CurrentUser')
    try { $store.Open('ReadOnly'); Assert ($store.Certificates.Find('FindByThumbprint',$leafThumb,$true).Count -eq 1) 'Agent validOnly certificate lookup failed.' } finally { $store.Close() }
    # Match Program Files read permissions for this installer audit's temporary directory.
    & icacls.exe $InstallDirectory /grant '*S-1-5-19:(OI)(CI)RX' /T /Q | Out-Null
    if($LASTEXITCODE -ne 0) { throw 'Could not prepare installed fixture permissions.' }
    $taskCreated=$true
    Write-Host 'Pairing audit: start restricted gateway task'
    Enable-PairingGateway $address $scope $data $InstallDirectory
    $task=Get-ScheduledTask -TaskName 'Mandala LAN Gateway'
    Assert ($task.Principal.UserId -in @('LOCAL SERVICE','NT AUTHORITY\LOCAL SERVICE','S-1-5-19')) ('Gateway task is not Local Service: '+$task.Principal.UserId)
    Assert ($task.Principal.RunLevel -eq 'Limited') 'Gateway task is elevated.'
    if($RepairFolder) {
        Write-Host 'Repair audit: reproduce stopped task with existing pairing and Private-only rule'
        Stop-ScheduledTask -TaskName 'Mandala LAN Gateway';Start-Sleep -Seconds 2
        $evidence=Get-GatewayTaskEvidence
        Assert ($evidence.State -ne 'Running' -and $evidence.LastTaskResult) 'Stopped task evidence was not captured.'
        $approved=Read-PairingJson (Join-Path $RepairFolder 'approved-gateway.json')
        Write-Host 'Repair audit: validate installed bytes and existing network scope'
        $plan=Get-GatewayRepairPlan $approved $data
        foreach($bad in @('Any','0.0.0.0/0','8.8.8.8','10.0.0.0/1','192.168.0.0/8')){Assert (-not(Test-PrivateGatewayScope $bad)) ('Unsafe firewall scope accepted: '+$bad)}
        $categories=@(Get-NetConnectionProfile|ForEach-Object {[string]$_.NetworkCategory}) -join ','
        Write-Host 'Repair audit: apply task/permission/firewall repair without changing pairing bytes'
        $result=Repair-ConfiguredGateway $plan $RepairFolder
        Assert ($result.PreservedFiles -eq 5 -and $result.Owner -eq 'Local Service') 'Repair did not verify pairing preservation and restricted listener owner.'
        Assert ((@(Get-NetConnectionProfile|ForEach-Object {[string]$_.NetworkCategory}) -join ',') -eq $categories) 'Repair changed Windows network categories.'
        $rule=Get-NetFirewallRule -Name $plan.RuleName
        Assert ([string]$rule.Profile -eq 'Any') 'Gateway rule still excludes Public profile.'
        Assert ((@(($rule|Get-NetFirewallInterfaceFilter).InterfaceAlias) -join ',') -eq $plan.InterfaceAlias) 'Gateway rule not bound to the selected adapter.'
        Assert ((@(($rule|Get-NetFirewallAddressFilter).RemoteAddress) -join ',') -eq ($plan.RemoteAddresses -join ',')) 'Employee subnet changed during repair.'
        $fixed=Get-ScheduledTask -TaskName 'Mandala LAN Gateway'
        Assert ($fixed.Settings.RestartCount -eq 999 -and $fixed.Triggers[0].Delay -eq 'PT30S') 'Durable boot/restart settings missing.'
        # Occupy only our generated fixture's gateway port, then release it. The
        # same Local Service process must retry and bind without another task start.
        Stop-ScheduledTask -TaskName 'Mandala LAN Gateway';Start-Sleep -Seconds 2
        $blocker=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Parse($address),8443)
        $blocker.Start()
        try {
            Start-ScheduledTask -TaskName 'Mandala LAN Gateway'
            Start-Sleep -Seconds 3
            $status=Read-PairingJson (Join-Path $data 'startup-status\status.json')
            Assert ($status.phase -eq 'waiting-to-retry' -and $status.code -eq 'EADDRINUSE') 'Transient bind error not captured without private data.'
            $retryPid=$status.pid
        } finally {$blocker.Stop()}
        Start-Sleep -Seconds 17
        $status=Read-PairingJson (Join-Path $data 'startup-status\status.json')
        Assert ($status.phase -eq 'listening' -and $status.pid -eq $retryPid) 'Gateway did not recover in the same service process when its port became available.'
        . (Join-Path (Split-Path $RepairFolder) 'check-core.ps1')
        $checks=@(Get-GatewayChecks $data)
        $checks|ForEach-Object {Write-Host ('['+$_.Status+'] '+$_.Id+': '+$_.Detail)}
        Assert (@($checks|Where-Object {$_.Status -ne 'PASS'}).Count -eq 0) 'Repaired gateway did not pass the actual shipped checker.'
        Write-Host 'PASS: actual stopped-task repair, exact firewall scope including Public, unchanged network category, unchanged pairing, Local Service listener and automatic bind retry.'
    }
    [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
    Write-Host 'Pairing audit: verify Windows mutual TLS'
    $health=Invoke-WebRequest -Uri ($reply.gatewayUrl+'/health') -Certificate $cert -UseBasicParsing -TimeoutSec 10
    $identity=$health.Content | ConvertFrom-Json
    Assert ($identity.backend -eq 'https://nzlajptokbcgeaifgnoq.supabase.co' -and $identity.protocol -eq 1) 'Pairing did not reach the production-configured gateway.'
    Reject { Invoke-WebRequest -Uri ($reply.gatewayUrl+'/health') -UseBasicParsing -TimeoutSec 5 } 'Gateway accepted a request without a client certificate.'
    Write-PairingJson (Join-Path $data 'enrolled-devices.json') @()
    $status=0
    try { Invoke-WebRequest -Uri ($reply.gatewayUrl+'/health') -Certificate $cert -UseBasicParsing -TimeoutSec 5 | Out-Null } catch { $status=[int]$_.Exception.Response.StatusCode }
    Assert ($status -eq 403) 'Revoked paired device was not denied.'
    Write-Host 'Guided Windows pairing audit passed: Windows PowerShell 5; generated certificates; non-exportable employee key; no persistent issuer key; profile/code rejection; validOnly lookup; restricted Local Service task; trusted HTTPS with client certificate; missing/revoked client denied.'
} catch { Write-Host $_.ScriptStackTrace; throw } finally {
    if($taskCreated) { Stop-ScheduledTask -TaskName 'Mandala LAN Gateway' -ErrorAction SilentlyContinue; Unregister-ScheduledTask -TaskName 'Mandala LAN Gateway' -Confirm:$false -ErrorAction SilentlyContinue; Start-Sleep -Seconds 1 }
    Get-NetFirewallRule -DisplayName 'Mandala guided gateway HTTPS' -ErrorAction SilentlyContinue | Remove-NetFirewallRule
    if($leafThumb -and (Test-Path ('Cert:\CurrentUser\My\'+$leafThumb))) { Remove-Item ('Cert:\CurrentUser\My\'+$leafThumb) -DeleteKey }
    foreach($thumb in $rootThumbs) { if(Test-Path ('Cert:\CurrentUser\Root\'+$thumb)) { Remove-Item ('Cert:\CurrentUser\Root\'+$thumb) } }
    foreach($thumb in $script:auditMachineRoots) { if(Test-Path ('Cert:\LocalMachine\Root\'+$thumb)) { Remove-Item ('Cert:\LocalMachine\Root\'+$thumb) } }
    Remove-Item $fixture -Recurse -Force
}
