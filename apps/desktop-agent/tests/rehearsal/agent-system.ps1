$ErrorActionPreference='Stop'
$root='C:\MandalaRehearsal'
$exchange=Join-Path $root 'exchange'
$stateFile=Join-Path $root 'system-state.json'
$data=Join-Path $root 'gateway'
$install='C:\Program Files\Mandala Agent'
$agent=Join-Path $install 'Mandala.Agent.exe'
$winlogon='HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon'
. (Join-Path $root 'apps\lan-services\deploy\windows\pairing-core.ps1')
function Assert($ok,$message){if(-not $ok){throw $message}}
function Boot { (Get-CimInstance Win32_OperatingSystem).LastBootUpTime.ToUniversalTime().ToString('o') }
function Emit($value){
    Write-PairingJson (Join-Path $root 'last-evidence.json') $value
    for($i=0;$i -lt 10;$i++){
        try {Invoke-RestMethod -Uri 'http://10.0.2.2:8787/evidence' -Method Post -Body ($value|ConvertTo-Json -Depth 10) -ContentType 'application/json' -TimeoutSec 5|Out-Null;return}catch{Start-Sleep -Seconds 2}
    }
    throw 'Guest could not return evidence.'
}
function Wait-File($path,[int]$seconds=300){
    $until=[DateTime]::UtcNow.AddSeconds($seconds)
    while(-not(Test-Path -LiteralPath $path)){
        if(Test-Path (Join-Path $exchange 'failed.json')){throw ((Read-PairingJson (Join-Path $exchange 'failed.json')).error)}
        if([DateTime]::UtcNow -gt $until){throw ('Timed out waiting for '+(Split-Path $path -Leaf))}
        Start-Sleep -Seconds 1
    }
}
function Start-Fixture {
    $server=Join-Path $root 'apps\desktop-agent\tests\fixtures\agent-lan-upstream.mjs'
    $arguments='"'+$server+'" "'+(Join-Path $data 'gateway.json')+'" "'+(Join-Path $exchange 'control.json')+'" "'+(Join-Path $exchange 'upstream.json')+'"'
    Start-Process (Join-Path $root 'node.exe') -ArgumentList $arguments -RedirectStandardOutput (Join-Path $root 'fixture-stdout.txt') -RedirectStandardError (Join-Path $root 'fixture-stderr.txt')|Out-Null
}
try {
    Assert ($env:COMPUTERNAME -eq 'MANDALA-LAB' -and [Security.Principal.WindowsIdentity]::GetCurrent().User.Value -eq 'S-1-5-18') 'Disposable evaluation guest SYSTEM account required.'
    if(-not(Test-Path $stateFile)){
        Emit @{phase='progress';step='installing-audited-agent';bootUtc=(Boot)}
        $audit=Read-PairingJson (Join-Path $root 'installer-audit.json')
        $installer=Join-Path $root $audit.filename
        Assert ((Get-FileHash $installer).Hash.ToLowerInvariant() -eq $audit.sha256) 'Installer hash mismatch in guest.'
        # Both guards exist BEFORE installation or any interactive employee login.
        New-NetFirewallRule -Name 'Mandala lab block production HTTPS' -DisplayName 'Mandala lab block production HTTPS' -Direction Outbound -Action Block -Program $agent -Protocol TCP -RemotePort 443 -RemoteAddress Any -Profile Any|Out-Null
        $blocked=@('1.0.0.0/8','2.0.0.0/7','4.0.0.0/6','8.0.0.0/5','16.0.0.0/4','32.0.0.0/3','64.0.0.0/3','96.0.0.0/4','112.0.0.0/5','120.0.0.0/6','124.0.0.0/7','126.0.0.0/8','128.0.0.0/2','192.0.0.0/3','2000::/3','fc00::/7','fe80::/10')
        New-NetFirewallRule -Name 'Mandala lab block external unicast' -DisplayName 'Mandala lab block external unicast' -Direction Outbound -Action Block -Program $agent -RemoteAddress $blocked -Profile Any|Out-Null
        $p=Start-Process $installer -ArgumentList '/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART' -PassThru -Wait
        Assert ($p.ExitCode -eq 0 -and (Get-FileHash $agent).Hash.ToLowerInvariant() -eq $audit.agentSha256) 'Installed binary differs from Windows audit.'
        $config=Read-PairingJson (Join-Path $env:ProgramData 'Mandala Agent\agent.config.json')
        Assert ($config.supabaseUrl -eq 'https://nzlajptokbcgeaifgnoq.supabase.co') 'Installed production backend mismatch.'
        $password=Get-RandomPassword
        New-LocalUser 'MandalaFixture' -Password (ConvertTo-SecureString $password -AsPlainText -Force) -AccountNeverExpires|Out-Null
        Add-LocalGroupMember -SID 'S-1-5-32-545' -Member 'MandalaFixture'
        $sid=(Get-LocalUser 'MandalaFixture').SID.Value
        Assert (@(Get-LocalGroupMember -SID 'S-1-5-32-544'|Where-Object {$_.SID.Value -eq $sid}).Count -eq 0) 'Fixture user unexpectedly has administrator membership.'
        New-Item -ItemType Directory $exchange -Force|Out-Null
        & icacls.exe $exchange /grant ('*'+$sid+':(OI)(CI)M')|Out-Null
        Assert ($LASTEXITCODE -eq 0) 'Fixture exchange permissions failed.'
        $fake=Join-Path $root 'synthetic-install';New-Item -ItemType Directory $fake|Out-Null
        Write-PairingJson (Join-Path $fake 'gateway.example.json') @{supabaseAnonKey='mandala-protocol-fixture-only'}
        $gateway=Initialize-PairingGateway '127.0.0.1' $data $fake
        $store=New-Object Security.Cryptography.X509Certificates.X509Store('Root','LocalMachine')
        try {$store.Open('ReadWrite');$store.Add([Security.Cryptography.X509Certificates.X509Certificate2]::new([Convert]::FromBase64String($gateway.root)))}finally{$store.Close()}
        Write-PairingJson (Join-Path $exchange 'gateway-public.json') @{pairingCode=(Get-PairingCode ([Convert]::FromBase64String($gateway.root)))}
        Write-PairingJson (Join-Path $exchange 'control.json') @{online=$true}
        $action=New-ScheduledTaskAction -Execute 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' -Argument '-NoProfile -STA -ExecutionPolicy Bypass -File C:\MandalaRehearsal\agent-user.ps1'
        $trigger=New-ScheduledTaskTrigger -AtLogOn -User 'MandalaFixture'
        $principal=New-ScheduledTaskPrincipal -UserId $sid -LogonType Interactive -RunLevel Limited
        Register-ScheduledTask -TaskName 'Mandala lab user observer' -Action $action -Trigger $trigger -Principal $principal|Out-Null
        Set-ItemProperty $winlogon DefaultUserName 'MandalaFixture'
        Set-ItemProperty $winlogon DefaultDomainName $env:COMPUTERNAME
        Set-ItemProperty $winlogon DefaultPassword $password
        Set-ItemProperty $winlogon AutoAdminLogon '1'
        Remove-ItemProperty $winlogon AutoLogonCount -ErrorAction SilentlyContinue
        Remove-Item 'C:\Windows\Panther\Unattend.xml' -Force -ErrorAction SilentlyContinue
        Write-PairingJson $stateFile @{stage='first-login';initialBoot=(Boot);userSid=$sid}
        Emit @{phase='prepared';bootUtc=(Boot);version=$audit.version;installerSha256=$audit.sha256;productionEntries=0}
        & shutdown.exe /r /t 5 /d p:4:1 /c 'Disposable Mandala employee initial login'
        exit 0
    }
    $state=Read-PairingJson $stateFile
    Assert ((Boot) -ne $state.initialBoot) 'Actual first reboot missing.'
    if($state.stage -eq 'first-login'){
        Emit @{phase='progress';step='waiting-for-standard-user-pairing';bootUtc=(Boot)}
        $requestPath=Join-Path $exchange 'request.json'
        Wait-File $requestPath
        $request=Read-PairingJson $requestPath
        Assert ($request.userSid -eq $state.userSid) 'Pairing request not from standard fixture user.'
        Approve-EmployeePairing $requestPath (Join-Path $exchange 'reply.json') $data|Out-Null
        $store=New-Object Security.Cryptography.X509Certificates.X509Store('Root','LocalMachine')
        try {$store.Open('ReadWrite');$store.Add([Security.Cryptography.X509Certificates.X509Certificate2]::new([Convert]::FromBase64String($request.root)))}finally{$store.Close()}
        Write-PairingJson (Join-Path $env:ProgramData 'Mandala Agent\lan.config.json') @{gatewayUrl='https://127.0.0.1:8443';deviceCertificateThumbprint=$request.thumbprint}
        Start-Fixture
        Write-PairingJson (Join-Path $exchange 'pairing-ready.json') @{ready=$true}
        Wait-File (Join-Path $exchange 'signed-in.json')
        $user=Read-PairingJson (Join-Path $exchange 'signed-in.json')
        Assert ($user.standardUser -and $user.automaticStartup -and $user.projectsLoaded) 'First standard-user check failed.'
        $state|Add-Member -NotePropertyName firstBoot -NotePropertyValue (Boot)
        $state.stage='restore-login';Write-PairingJson $stateFile $state
        Emit @{phase='first-reboot';bootUtc=(Boot);standardUser=$true;automaticStartup=$true;fixtureSignIn=$true;productionEntries=0}
        & shutdown.exe /r /t 5 /d p:4:1 /c 'Disposable Mandala employee sign-in restoration'
        exit 0
    }
    Assert ($state.stage -eq 'restore-login' -and (Boot) -ne $state.firstBoot) 'Actual second reboot missing.'
    Start-Fixture
    Wait-File (Join-Path $exchange 'restored.json')
    $user=Read-PairingJson (Join-Path $exchange 'restored.json')
    $upstream=Read-PairingJson (Join-Path $exchange 'upstream.json')
    Assert ($upstream.productionRequests -eq 0 -and $upstream.blockedExternalRequests -eq 0 -and @($upstream.sessions).Count -eq 0) 'Unexpected fixture requests/time sessions.'
    $uac=(Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System').EnableLUA -eq 1
    $firewall=@(Get-NetFirewallProfile|Where-Object {-not $_.Enabled}).Count -eq 0
    Assert ($uac -and $firewall) 'Guest security controls were disabled.'
    Set-ItemProperty $winlogon AutoAdminLogon '0'
    Remove-ItemProperty $winlogon DefaultPassword -ErrorAction SilentlyContinue
    $result=@{phase='complete';result='PASS';bootUtc=(Boot);standardUser=$user.standardUser;automaticStartup=$user.automaticStartup;restoredSignIn=$user.restoredSignIn;projectsLoaded=$user.projectsLoaded;sameWindowsUser=($user.userSid -eq $state.userSid);sameCertificate=$user.sameCertificate;uacEnabled=$uac;firewallEnabled=$firewall;productionEntries=0;testSessions=0;version='1.0.16';limitations='Disposable Windows Server evaluation with synthetic employee; not the office Windows/domain profile, UAC consent UI or pending-time reboot acceptance.'}
    Emit $result
} catch {
    Set-ItemProperty $winlogon AutoAdminLogon '0' -ErrorAction SilentlyContinue
    Remove-ItemProperty $winlogon DefaultPassword -ErrorAction SilentlyContinue
    Emit @{phase='failed';result='FAIL';error=$_.Exception.Message;line=$_.InvocationInfo.ScriptLineNumber;bootUtc=(Boot)}
    exit 1
}
