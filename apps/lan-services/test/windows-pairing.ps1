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
$rootThumbs=@(); $leafThumb=$null; $taskCreated=$false;$changedAcls=@{}
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
        Assert (-not(Test-MandalaDurableGatewayStartup $InstallDirectory $data $RepairFolder)) 'Running/stopped legacy registration was mistaken for durable startup.'
        # Remove inherited read rights from actual audited code and pairing files.
        # Repair must restore only Local Service RX; the earlier fixture grant
        # cannot conceal a missing install/runtime read-access repair.
        foreach($path in @((Join-Path $InstallDirectory 'runtime'),(Join-Path $InstallDirectory 'runtime\node.exe'),(Join-Path $InstallDirectory 'gateway.mjs'),(Join-Path $data 'gateway.json'),(Join-Path $data 'gateway.pfx'))) {
            $changedAcls[$path]=Get-Acl -LiteralPath $path
            $restricted=Get-Acl -LiteralPath $path
            $restricted.SetAccessRuleProtection($true,$false)
            foreach($entry in @($restricted.Access)){$restricted.RemoveAccessRuleSpecific($entry)}
            foreach($sid in @('S-1-5-18','S-1-5-32-544')){$restricted.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($sid),[Security.AccessControl.FileSystemRights]::FullControl,[Security.AccessControl.AccessControlType]::Allow))}
            Set-Acl -LiteralPath $path -AclObject $restricted
        }
        Write-Host 'Repair audit: validate installed bytes and existing network scope'
        $plan=Get-GatewayRepairPlan $approved $data
        $policyPath=Join-Path $InstallDirectory 'gateway.mjs';$policyAcl=Get-Acl -LiteralPath $policyPath
        try {
            $deny=Get-Acl -LiteralPath $policyPath
            $deny.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new('S-1-5-19'),[Security.AccessControl.FileSystemRights]::ReadAndExecute,[Security.AccessControl.AccessControlType]::Deny))
            Set-Acl -LiteralPath $policyPath -AclObject $deny
            Reject {Get-GatewayRepairPlan $approved $data} 'Explicit service read-deny was not rejected before mutation.'
        } finally {Set-Acl -LiteralPath $policyPath -AclObject $policyAcl}
        # Refuse elevated repair into a mutable install and reject link redirection.
        $unsafeAcl=Get-Acl -LiteralPath $InstallDirectory
        try {
            $mutable=Get-Acl -LiteralPath $InstallDirectory
            $mutable.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new('S-1-5-32-545'),[Security.AccessControl.FileSystemRights]::Write,[Security.AccessControl.AccessControlType]::Allow))
            Set-Acl -LiteralPath $InstallDirectory -AclObject $mutable
            Reject {Get-GatewayRepairPlan $approved $data} 'User-writable installation was accepted for elevated repair.'
        } finally {Set-Acl -LiteralPath $InstallDirectory -AclObject $unsafeAcl}
        $redirect=Join-Path $InstallDirectory 'audit-redirect'
        try {New-Item -ItemType Junction -Path $redirect -Target (Join-Path $InstallDirectory 'runtime')|Out-Null;Reject {Assert-ProtectedGatewayPath (Join-Path $redirect 'node.exe')} 'Redirected code path was accepted.'} finally {if(Test-Path $redirect){[IO.Directory]::Delete($redirect)}}
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
        Assert (Test-MandalaDurableGatewayStartup $InstallDirectory $data $RepairFolder) 'Exact action/settings/helper audit failed after repair.'
        Assert (Test-MandalaGatewayListener $InstallDirectory $data) 'Actual audited process command/owner was not recognized.'
        Write-Host 'Repair audit: rerun original wizard configuration and approve another employee without undoing repair'
        $beforePairing=@{};foreach($path in $plan.ProtectedFiles){$beforePairing[$path]=(Get-FileHash -LiteralPath $path).Hash}
        . (Join-Path $InstallDirectory 'pairing-core.ps1')
        Initialize-PairingGateway $address $data $InstallDirectory|Out-Null
        # Its textbox can suggest /24; repaired setup must retain approved /32.
        Enable-PairingGateway $address ($address+'/24') $data $InstallDirectory
        foreach($path in $plan.ProtectedFiles){Assert ((Get-FileHash -LiteralPath $path).Hash -eq $beforePairing[$path]) 'Reopening setup changed existing pairing bytes.'}
        Assert (Test-MandalaDurableGatewayStartup $InstallDirectory $data $RepairFolder) 'Wizard configuration reverted repaired startup.'
        $retained=@((Get-NetFirewallRule -Name $plan.RuleName|Get-NetFirewallAddressFilter).RemoteAddress)
        Assert (($retained -join ',') -eq ($plan.RemoteAddresses -join ',')) 'Wizard widened the existing employee subnet.'
        # Enrollment maintenance must preserve the first employee and retain the
        # durable action when a second valid public request is approved.
        Approve-EmployeePairing $requestPath $replyPath $data|Out-Null
        $secondMaterial=[MandalaPairingCertificates]::Create('Mandala second audit employee','',$false,(Get-RandomPassword))
        $secondLeaf=[Security.Cryptography.X509Certificates.X509Certificate2]::new($secondMaterial.Certificate)
        $secondRequest=@{kind='MandalaEmployeeRequest';protocol=1;backend='nzlajptokbcgeaifgnoq';requestId=[Guid]::NewGuid().ToString();computer='second-audit';userSid=$request.userSid;createdAt=[DateTime]::UtcNow.ToString('o');thumbprint=$secondLeaf.Thumbprint;root=[Convert]::ToBase64String($secondMaterial.Root);certificate=[Convert]::ToBase64String($secondMaterial.Certificate)}
        $secondPath=Join-Path $fixture 'second-request.json';Write-PairingJson $secondPath $secondRequest
        Approve-EmployeePairing $secondPath (Join-Path $fixture 'second-reply.json') $data|Out-Null
        $secondLeaf.Dispose()
        $allowed=@(Read-PairingJson (Join-Path $data 'enrolled-devices.json'))
        Assert ($allowed.Count -eq 2 -and [MandalaPairingCertificates]::Fingerprint([Convert]::FromBase64String($request.certificate)) -in $allowed) 'Second enrollment replaced the original employee.'
        Restart-PairingGateway
        Assert (Test-MandalaDurableGatewayStartup $InstallDirectory $data $RepairFolder) 'Enrollment maintenance reverted durable startup.'
        Assert (Test-MandalaGatewayListener $InstallDirectory $data) 'Enrollment restart did not restore the actual listener.'
        # A second invocation accepts only the original or shipped pairing code.
        $again=Get-GatewayRepairPlan $approved $data $RepairFolder
        Repair-ConfiguredGateway $again $RepairFolder|Out-Null
        Assert (Test-MandalaDurableGatewayStartup $InstallDirectory $data $RepairFolder) 'Repair was not idempotent.'
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
        Write-Host 'PASS: missing code/data read permissions repaired; mutable/link installs rejected; exact durable registration; setup/enrollment maintenance preserved repair and pairing; idempotent repair; scoped firewall; actual Local Service command; bind retry.'
    }
    [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
    Write-Host 'Pairing audit: verify Windows mutual TLS'
    $health=Invoke-WebRequest -Uri ($reply.gatewayUrl+'/health') -Certificate $cert -UseBasicParsing -TimeoutSec 10
    if($RepairFolder) {
        $served=([Net.ServicePointManager]::FindServicePoint([Uri]($reply.gatewayUrl+'/health'))).Certificate
        Assert ((Get-GatewayCertificateSha256 $served) -eq $script:checkedGatewayCertificateSha256) 'Actual TLS certificate did not match the gateway report fingerprint.'
    }
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
    foreach($path in $changedAcls.Keys){if(Test-Path -LiteralPath $path){Set-Acl -LiteralPath $path -AclObject $changedAcls[$path]}}
    if($leafThumb -and (Test-Path ('Cert:\CurrentUser\My\'+$leafThumb))) { Remove-Item ('Cert:\CurrentUser\My\'+$leafThumb) -DeleteKey }
    foreach($thumb in $rootThumbs) { if(Test-Path ('Cert:\CurrentUser\Root\'+$thumb)) { Remove-Item ('Cert:\CurrentUser\Root\'+$thumb) } }
    foreach($thumb in $script:auditMachineRoots) { if(Test-Path ('Cert:\LocalMachine\Root\'+$thumb)) { Remove-Item ('Cert:\LocalMachine\Root\'+$thumb) } }
    Remove-Item $fixture -Recurse -Force
}
