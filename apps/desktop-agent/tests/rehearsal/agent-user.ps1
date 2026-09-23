$ErrorActionPreference='Stop'
$root='C:\MandalaRehearsal'
$exchange=Join-Path $root 'exchange'
. (Join-Path $root 'apps\lan-services\deploy\windows\pairing-core.ps1')
. (Join-Path $root 'apps\desktop-agent\scripts\office-test\check-core.ps1')
. (Join-Path $root 'apps\desktop-agent\scripts\office-test\ui-driver.ps1')
$script:AgentPath='C:\Program Files\Mandala Agent\Mandala.Agent.exe'
try {
    $identity=[Security.Principal.WindowsIdentity]::GetCurrent()
    $admin=([Security.Principal.WindowsPrincipal]$identity).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    Require ($env:COMPUTERNAME -eq 'MANDALA-LAB' -and $env:USERNAME -eq 'MandalaFixture' -and -not $admin) 'Disposable standard-user fixture required.'
    # Observe the installer's common Startup shortcut. Do not start the Agent here.
    Wait-Ui 'automatic installed Agent startup at standard-user Windows logon' {try{Attach-TestAgent;return $true}catch{return $false}} 150|Out-Null
    $audit=Read-PairingJson (Join-Path $root 'installer-audit.json')
    Require ((Get-FileHash $script:AgentPath).Hash.ToLowerInvariant() -eq $audit.agentSha256) 'Startup executable differs from audited installer.'
    Wait-AgentText 'BuildIdentityText' {param($text) $text -like '*1.0.16*' -and $text -like '*nzlajptokbcgeaifgnoq*'} 60 'audited startup version/backend'
    $profile=Join-Path $env:LOCALAPPDATA 'Mandala lab pairing'
    $local=Join-Path $env:LOCALAPPDATA 'Mandala Agent'
    if(-not(Test-Path (Join-Path $exchange 'signed-in.json'))){
        Require (-not(Test-Path (Join-Path $local 'session.dat'))) 'Unexpected pre-existing sign-in in fresh disposable profile.'
        Close-TestAgent
        # The lab SYSTEM coordinator imports these newly generated public roots
        # to its disposable machine store, avoiding interactive certificate trust
        # dialogs. Private key creation stays in this real standard-user profile.
        function Add-PairingRoot([byte[]]$Bytes){return ([Security.Cryptography.X509Certificates.X509Certificate2]::new($Bytes)).Thumbprint}
        $request=New-EmployeePairingRequest (Join-Path $exchange 'request.json') $profile
        Wait-Ui 'disposable SYSTEM pairing coordinator' {Test-Path (Join-Path $exchange 'pairing-ready.json')} 90|Out-Null
        function Add-PairingRoot([byte[]]$Bytes){
            $thumb=([Security.Cryptography.X509Certificates.X509Certificate2]::new($Bytes)).Thumbprint
            Require (Test-Path ('Cert:\LocalMachine\Root\'+$thumb)) 'Fixture root was not installed by lab coordinator.'
            return $thumb
        }
        $public=Read-PairingJson (Join-Path $exchange 'gateway-public.json')
        Import-EmployeePairing (Join-Path $exchange 'reply.json') $profile $public.pairingCode|Out-Null
        # This first setup reload is explicit. The subsequent reboot path below
        # never launches the Agent, so a broken Startup shortcut cannot pass.
        $p=Start-Process $script:AgentPath -WorkingDirectory (Split-Path $script:AgentPath) -PassThru
        $script:AgentProcessId=$p.Id
        Wait-Ui 'configured test Agent' {try{Get-AgentRoot}catch{$null}} 60|Out-Null
        Wait-AgentText 'BuildIdentityText' {param($text) $text -like '*LAN https://127.0.0.1:8443*'} 60 'loopback-only LAN mode'
        ([Windows.Automation.ValuePattern](Get-AgentControl 'EmailTextBox').GetCurrentPattern([Windows.Automation.ValuePattern]::Pattern)).SetValue('lan-fixture@example.test')
        $shell=New-Object -ComObject WScript.Shell
        try {Require ($shell.AppActivate($script:AgentProcessId)) 'Fixture Agent focus failed.';(Get-AgentControl 'PasswordBox').SetFocus();Start-Sleep -Milliseconds 200;$shell.SendKeys('fixtureonly',$true)}finally{[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($shell)}
        Invoke-AgentButton 'SignInButton'
        Wait-AgentText 'SignedInAsText' {param($text) $text -like '*lan-fixture@example.test*'} 90 'synthetic employee sign-in'
        Require (@(Get-AgentProjects).Count -eq 2) 'Synthetic projects failed to load.'
        Wait-AgentState 'No active project'
        Require (Test-Path (Join-Path $local 'session.dat')) 'Real Agent did not persist its own signed-in session.'
        Write-PairingJson (Join-Path $exchange 'signed-in.json') @{standardUser=$true;automaticStartup=$true;projectsLoaded=$true;userSid=$identity.User.Value;certificate=$request.thumbprint}
        Start-AgentProject 'CI protocol project A'
        Start-Sleep -Seconds 5
        Write-PairingJson (Join-Path $exchange 'control.json') @{online=$false}
        Wait-Ui 'fixture gateway offline' { -not (Read-PairingJson (Join-Path $exchange 'upstream.json')).listening } 20|Out-Null
        Invoke-AgentButton 'StopButton'
        Wait-AgentState 'No active project' 90
        Wait-AgentText 'TrackerMessageText' {param($text) $text -match 'waiting for the LAN gateway|Pending time remains'} 60 'pending before real Windows reboot'
        Require (-not (Get-AgentControl 'StartWorkButton').Current.IsEnabled) 'New work allowed with pending save.'
        Require (@(Get-ChildItem $local -Filter 'time-*.dat').Count -gt 0) 'Actual encrypted journal missing.'
        $pending=Read-PairingJson (Join-Path $exchange 'upstream.json')
        Require (@($pending.sessions).Count -eq 1 -and -not $pending.sessions[0].stopped_at) 'Offline stop fabricated a server receipt.'
        Write-PairingJson (Join-Path $exchange 'pending-before-reboot.json') @{sessionId=$pending.sessions[0].id;pending=$true;observedUtc=[DateTimeOffset]::UtcNow.ToString('o')}
        exit 0
    }
    # The app is already running from common Startup after a real Windows reboot.
    # Its own DPAPI token/session loading and LAN client restore the user here.
    Wait-AgentText 'SignedInAsText' {param($text) $text -like '*lan-fixture@example.test*'} 120 'automatic synthetic employee session restoration'
    Wait-AgentState 'No active project'
    Wait-AgentText 'TrackerMessageText' {param($text) $text -match 'waiting for the LAN gateway|Pending time remains'} 90 'pending survives actual OS reboot'
    Require (-not (Get-AgentControl 'StartWorkButton').Current.IsEnabled) 'Reboot allowed a new start before pending work uploaded.'
    $pending=Read-PairingJson (Join-Path $exchange 'pending-before-reboot.json')
    $server=Read-PairingJson (Join-Path $exchange 'upstream.json')
    Require (@($server.sessions).Count -eq 1 -and $server.sessions[0].id -eq $pending.sessionId -and -not $server.sessions[0].stopped_at) 'Reboot fabricated or changed the pending server session.'
    Write-PairingJson (Join-Path $exchange 'pending-after-reboot.json') @{pending=$true;newStartBlocked=$true;sessionId=$pending.sessionId}
    Wait-AgentText 'TrackerMessageText' {param($text) $text -like '*Time saved successfully. Reference:*'} 120 'pending upload after OS reboot and reconnect'
    Require (@(Get-AgentProjects).Count -eq 2) 'Restored session failed to load allowed projects.'
    $before=Read-PairingJson (Join-Path $exchange 'signed-in.json')
    $lan=Read-PairingJson (Join-Path $env:ProgramData 'Mandala Agent\lan.config.json')
    $cert=Get-Item ('Cert:\CurrentUser\My\'+$before.certificate)
    Require ($cert.HasPrivateKey -and $lan.deviceCertificateThumbprint -eq $before.certificate) 'Employee pairing was lost during reboot.'
    Write-PairingJson (Join-Path $exchange 'restored.json') @{standardUser=$true;automaticStartup=$true;restoredSignIn=$true;projectsLoaded=$true;userSid=$identity.User.Value;sameCertificate=$true;pendingSurvivedReboot=$true;pendingNewStartBlocked=$true;reconnectedSaveConfirmed=$true}
} catch {
    Write-PairingJson (Join-Path $exchange 'failed.json') @{error=$_.Exception.Message;line=$_.InvocationInfo.ScriptLineNumber;phase='standard-user'}
    exit 1
}
