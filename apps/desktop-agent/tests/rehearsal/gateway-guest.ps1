$ErrorActionPreference='Stop'
$env:PSModulePath=(Join-Path $PSHOME 'Modules')+';'+(Join-Path $env:ProgramFiles 'WindowsPowerShell\Modules')
$root='C:\MandalaRehearsal'
$statePath=Join-Path $root 'state.json'
$install=Join-Path $env:ProgramFiles 'Mandala Gateway Rehearsal'
$data=Join-Path $env:ProgramData 'Mandala Gateway'
$kit=Join-Path $root 'kit'
$repair=Join-Path $kit 'gateway-repair'
$profile=Join-Path $root 'fixture-profile'
$address='10.0.2.15'
$scope=$address+'/32'
$nativeStatePath=Join-Path $env:ProgramData 'Mandala Office Recovery\S-1-5-18\gateway.json'
function Assert($Condition,$Message){if(-not $Condition){throw $Message}}
function Emit($Value){
    $json=$Value|ConvertTo-Json -Depth 15
    $json|Set-Content -LiteralPath (Join-Path $root 'last-evidence.json') -Encoding UTF8
    for($retry=0;$retry -lt 5;$retry++){
        try {Invoke-RestMethod -Method Post -Uri 'http://10.0.2.2:8787/evidence' -ContentType 'application/json' -Body ([Text.Encoding]::UTF8.GetBytes($json)) -TimeoutSec 15|Out-Null;return}
        catch {if($retry -eq 4){throw};Start-Sleep -Seconds 2}
    }
}
function Save-State { $state|ConvertTo-Json -Depth 15|Set-Content -LiteralPath $statePath -Encoding UTF8 }
function Invoke-PackagedGateway {
    # All answers describe this synthetic, disposable engineering fixture. They
    # are explicitly excluded from office IT/isolation acceptance evidence.
    $answers=Join-Path $root 'synthetic-answers.txt'
    [IO.File]::WriteAllText($answers,((1..8|ForEach-Object {'yes'}) -join "`r`n")+"`r`n")
    $p=Start-Process -FilePath $env:ComSpec -ArgumentList ('/d /c ""'+(Join-Path $kit 'Start Mandala.cmd')+'" gateway Run"') -RedirectStandardInput $answers -RedirectStandardOutput (Join-Path $root 'package-stdout.txt') -RedirectStandardError (Join-Path $root 'package-stderr.txt') -Wait -PassThru
    Assert ($p.ExitCode -eq 0) ('Exact package launcher failed with exit '+$p.ExitCode)
    Assert (Test-Path -LiteralPath $nativeStatePath) 'Exact package did not save its authoritative gateway state.'
    $native=Get-Content -LiteralPath $nativeStatePath -Raw|ConvertFrom-Json
    if($native.PrimaryError){throw ('Packaged gateway report: '+$native.PrimaryError.Detail)}
    Assert (@($native.CheckpointErrors|Where-Object {$null -ne $_}).Count -eq 0) 'Packaged gateway recorded a checkpoint error.'
    return $native
}
function Boot-Identity { return (Get-CimInstance Win32_OperatingSystem).LastBootUpTime.ToUniversalTime().ToString('o') }
function Require-Listener {
    $until=[DateTime]::UtcNow.AddMinutes(3)
    do {
        if(Test-MandalaGatewayListener $install $data $address){return}
        Start-Sleep -Seconds 3
    } while([DateTime]::UtcNow -lt $until)
    throw 'The exact Local Service gateway listener did not appear within three minutes; observer did not start it.'
}
function Pairing-Hashes {
    $hashes=@{}
    foreach($name in @('gateway.json','gateway.pfx','pairing-state.json','enrolled-devices.json','device-ca.crt')){
        $path=Join-Path $data $name
        Assert (Test-Path -LiteralPath $path) ('Missing fixture pairing file: '+$name)
        $hashes[$name]=(Get-FileHash -LiteralPath $path).Hash.ToLowerInvariant()
    }
    return $hashes
}
function Evidence($Phase){
    $approved=Get-Content (Join-Path $repair 'approved-gateway.json') -Raw|ConvertFrom-Json
    Get-GatewayRepairPlan $approved $data $repair|Out-Null
    Assert (Test-MandalaDurableGatewayStartup $install $data $repair) 'Durable task/helper audit failed.'
    Assert (Test-MandalaGatewayListener $install $data $address) 'Expected listener is not running.'
    $current=Pairing-Hashes
    foreach($item in $state.pairing.PSObject.Properties){Assert ($current[$item.Name] -eq $item.Value) ('Pairing bytes changed: '+$item.Name)}
    $cert=Get-Item ('Cert:\CurrentUser\My\'+$state.clientThumbprint)
    [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
    $health=(Invoke-WebRequest -Uri ('https://'+$address+':8443/health') -Certificate $cert -UseBasicParsing -TimeoutSec 15).Content|ConvertFrom-Json
    Assert ($health.backend -eq 'https://nzlajptokbcgeaifgnoq.supabase.co' -and $health.protocol -eq 1) 'Trusted mutual-TLS health reached the wrong backend/protocol.'
    $rule=Get-NetFirewallRule -DisplayName 'Mandala guided gateway HTTPS'
    $remote=@(($rule|Get-NetFirewallAddressFilter).RemoteAddress)
    Assert (($remote -join ',') -eq $scope) 'Firewall scope changed from the exact fixture address.'
    $connection=@(Get-NetTCPConnection -LocalPort 8443 -State Listen|Where-Object {$_.LocalAddress -eq $address})
    $process=Get-CimInstance Win32_Process -Filter ('ProcessId='+$connection[0].OwningProcess)
    $owner=Invoke-CimMethod -InputObject $process -MethodName GetOwnerSid
    $os=Get-CimInstance Win32_OperatingSystem
    $release=Get-Content (Join-Path $install 'gateway-release.json') -Raw|ConvertFrom-Json
    $serverCertificate=([Net.ServicePointManager]::FindServicePoint([Uri]('https://'+$address+':8443/health'))).Certificate
    $sha=[Security.Cryptography.SHA256]::Create()
    try{$serverFingerprint=([BitConverter]::ToString($sha.ComputeHash($serverCertificate.GetRawCertData()))).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()}
    return [pscustomobject]@{
        phase=$Phase;result='PASS';observedUtc=[DateTime]::UtcNow.ToString('o');bootUtc=(Boot-Identity)
        exercise=$state.exercise;syntheticFixtureOnly=$true
        sourceCommit=$state.sourceCommit;packageSha256=$state.packageSha256;gatewayInstallerSha256=$state.gatewayInstallerSha256
        operatingSystem=$os.Caption;operatingSystemVersion=$os.Version
        gatewayVersion=$release.version;runtimeSha256=(Get-FileHash (Join-Path $install 'runtime\node.exe')).Hash.ToLowerInvariant();serverCertificateSha256=$serverFingerprint
        task=(Get-GatewayTaskEvidence);listenerOwner=$owner.Sid;listenerStartedUtc=$process.CreationDate.ToUniversalTime().ToString('o')
        gatewayAddress=$address;firewallRemoteAddresses=$remote;pairingUnchanged=$true;trustedMutualTls=$true
        backend=$health.backend;observerStartsGateway=$false;gatewayRebootCount=$state.reboots
        limitations=@('Fixture device and SYSTEM profile; no employee authentication or time writes.','Synthetic yes responses are not office IT/isolation evidence. No interactive UAC or RunOnce acceptance.','Same-guest mutual TLS; no separate employee networking acceptance.')
    }
}
try {
    Assert ([Security.Principal.WindowsIdentity]::GetCurrent().User.Value -eq 'S-1-5-18') 'Rehearsal controller must use the disposable guest SYSTEM account.'
    if(-not(Test-Path -LiteralPath $statePath)){
        Emit @{phase='progress';step='initial-guest-boot';bootUtc=(Boot-Identity)}
        # Remove temporary unattended login immediately; subsequent boot evidence
        # is collected by the SYSTEM observer without logging into Administrator.
        $winlogon='HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon'
        Set-ItemProperty $winlogon AutoAdminLogon '0'
        Remove-ItemProperty $winlogon DefaultPassword -ErrorAction SilentlyContinue
        Remove-ItemProperty $winlogon AutoLogonCount -ErrorAction SilentlyContinue
        Remove-Item 'C:\Windows\Panther\Unattend.xml' -Force -ErrorAction SilentlyContinue
        $until=[DateTime]::UtcNow.AddMinutes(3)
        while(-not(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue|Where-Object {$_.IPAddress -eq $address -and $_.AddressState -eq 'Preferred'})){
            if([DateTime]::UtcNow -gt $until){throw 'Expected isolated guest DHCP address did not appear.'};Start-Sleep -Seconds 2
        }
        $metadata=Get-Content (Join-Path $root 'artifact-metadata.json') -Raw|ConvertFrom-Json
        $installer=Join-Path $root 'MandalaGatewaySetup-1.1.0.exe'
        Assert ((Get-FileHash $installer).Hash.ToLowerInvariant() -eq $metadata.gatewayInstallerSha256) 'Gateway installer changed inside the guest.'
        $p=Start-Process $installer -ArgumentList '/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART',('/DIR="'+$install+'"') -Wait -PassThru
        Assert ($p.ExitCode -eq 0) 'Approved gateway installer failed.'
        . (Join-Path $install 'pairing-core.ps1')
        . (Join-Path $repair 'repair-core.ps1')
        # Suppress trust UI only for new certificates created in this disposable
        # guest. Production code and employee pairing behavior are unchanged.
        $script:realRootImport=${function:Add-PairingRoot}
        function Add-PairingRoot([byte[]]$Bytes){
            $public=[Security.Cryptography.X509Certificates.X509Certificate2]::new($Bytes)
            $machine=New-Object Security.Cryptography.X509Certificates.X509Store('Root','LocalMachine')
            try{$machine.Open('ReadWrite');$machine.Add($public)}finally{$machine.Close()}
            return (& $script:realRootImport $Bytes)
        }
        $gateway=Initialize-PairingGateway $address $data $install
        $requestPath=Join-Path $root 'request.json';$replyPath=Join-Path $root 'reply.json'
        $request=New-EmployeePairingRequest $requestPath $profile
        Approve-EmployeePairing $requestPath $replyPath $data|Out-Null
        Import-EmployeePairing $replyPath $profile (Get-PairingCode ([Convert]::FromBase64String($gateway.root)))|Out-Null
        & icacls.exe $install /grant '*S-1-5-19:(OI)(CI)RX' /T /Q|Out-Null
        Assert ($LASTEXITCODE -eq 0) 'Initial fixture service permissions failed.'
        Enable-PairingGateway $address $scope $data $install
        Stop-ScheduledTask -TaskName 'Mandala LAN Gateway'
        Start-Sleep -Seconds 2
        Assert (-not(Test-MandalaDurableGatewayStartup $install $data $repair)) 'Fixture unexpectedly already has durable startup.'
        $approved=Get-Content (Join-Path $repair 'approved-gateway.json') -Raw|ConvertFrom-Json
        $plan=Get-GatewayRepairPlan $approved $data $repair
        $pairing=Pairing-Hashes
        Emit @{phase='progress';step='repair-stopped-configured-gateway';task=(Get-GatewayTaskEvidence)}
        $state=[pscustomobject]@{
            phase='first-reboot';initialBoot=(Boot-Identity);firstBoot=$null;reboots=0
            exercise=$metadata.exercise
            sourceCommit=$metadata.sourceCommit;packageSha256=$metadata.packageSha256;gatewayInstallerSha256=$metadata.gatewayInstallerSha256
            clientThumbprint=$request.thumbprint;pairing=[pscustomobject]$pairing
        }
        Save-State
        if($state.exercise -eq 'packaged'){
            Emit @{phase='package-requested';result='PENDING';bootUtc=(Boot-Identity);syntheticFixtureOnly=$true;sourceCommit=$state.sourceCommit;packageSha256=$state.packageSha256;operation='Unchanged Start Mandala.cmd gateway Run; scripted lab-only answers; shipped Arm-Reboot'}
            $native=Invoke-PackagedGateway
            Assert ($native.Phase -eq 'reboot' -and $native.BootBefore -eq $state.initialBoot) 'Packaged gateway did not arm its own reboot.'
            # The shipped Arm-Reboot requests an immediate real restart. Do not
            # substitute a controller restart if that request fails to occur.
            exit 0
        }
        Repair-ConfiguredGateway $plan $repair|Out-Null
        Require-Listener
        Emit (Evidence 'prepared')
        & shutdown.exe /r /t 5 /d p:4:1 /c 'Mandala disposable gateway reboot rehearsal 1'
        Assert ($LASTEXITCODE -eq 0) 'First actual guest restart request failed.'
        exit 0
    }
    $state=Get-Content -LiteralPath $statePath -Raw|ConvertFrom-Json
    . (Join-Path $install 'pairing-core.ps1')
    . (Join-Path $repair 'repair-core.ps1')
    if($state.phase -eq 'complete'){exit 0}
    $boot=Boot-Identity
    Assert ($boot -ne $state.initialBoot) 'Observer resumed without an actual first Windows reboot.'
    Require-Listener
    if($state.phase -eq 'first-reboot'){
        $state.reboots=1;$state.firstBoot=$boot
        if($state.exercise -eq 'packaged'){
            # Listener ownership was independently observed above before the
            # synthetic post-reboot answer. This is the documented same-account
            # launcher fallback; SYSTEM does not exercise interactive RunOnce.
            $native=Invoke-PackagedGateway
            Assert ($native.Phase -eq 'complete' -and $native.Result -like 'GATEWAY LOCAL CHECKS PASSED*') 'Packaged gateway fallback did not complete.'
            Emit @{phase='package-report';syntheticFixtureOnly=$true;notOfficeAcceptance=$true;promptAnswers='Automated engineering fixture, not IT observations';nativeReport=$native}
        }
        Emit (Evidence 'first-reboot')
        # Exercise the shipped corrected setup helper only after boot startup was
        # observed. Its suggested wider scope must retain the existing /32.
        Initialize-PairingGateway $address $data $install|Out-Null
        Enable-PairingGateway $address '10.0.2.0/24' $data $install
        Require-Listener
        $maintenance=Evidence 'setup-reentry'
        Emit $maintenance
        $state.phase='second-reboot';Save-State
        & shutdown.exe /r /t 5 /d p:4:1 /c 'Mandala disposable gateway reboot rehearsal 2'
        Assert ($LASTEXITCODE -eq 0) 'Second actual guest restart request failed.'
        exit 0
    }
    Assert ($state.phase -eq 'second-reboot' -and $boot -ne $state.firstBoot) 'Second distinct Windows reboot was not observed.'
    $state.reboots=2;$state.phase='complete';Save-State
    Emit (Evidence 'complete')
    Disable-ScheduledTask -TaskName 'Mandala Rehearsal Observer'|Out-Null
} catch {
    $failure=[pscustomobject]@{phase='failed';result='FAIL';observedUtc=[DateTime]::UtcNow.ToString('o');exceptionType=$_.Exception.GetType().FullName;detail=$_.Exception.Message;line=$_.InvocationInfo.ScriptLineNumber}
    try{Emit $failure}catch{$failure|ConvertTo-Json|Set-Content (Join-Path $root 'failure.json')}
    exit 1
}
