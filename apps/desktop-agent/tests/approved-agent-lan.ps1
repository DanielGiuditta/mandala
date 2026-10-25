param(
    [Parameter(Mandatory=$true)][string]$Agent,
    [Parameter(Mandatory=$true)][string]$ApprovedManifest,
    [switch]$FixtureCandidate,
    [switch]$AutoResumeExpected,
    # Agent 1.0.18+: time waiting for upload never blocks starting new work.
    [switch]$QueuedOfflineWork
)
$ErrorActionPreference='Stop'
# This test is restricted to a disposable GitHub-hosted Windows runner. It uses
# synthetic credentials and receipts, never production accounts or time entries.
if($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted'){throw 'This destructive-fixture cleanup is restricted to disposable GitHub-hosted Windows runners.'}
$env:PSModulePath=(Join-Path $PSHOME 'Modules')+';'+(Join-Path $env:ProgramFiles 'WindowsPowerShell\Modules')
. (Join-Path $PSScriptRoot '..\scripts\office-test\check-core.ps1')
. (Join-Path $PSScriptRoot '..\scripts\office-test\ui-driver.ps1')
. (Join-Path $PSScriptRoot '..\..\lan-services\deploy\windows\pairing-core.ps1')
Add-Type -AssemblyName System.Windows.Forms
Require (([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) 'Disposable-runner firewall/trust fixture requires administrator privileges.'
$Agent=(Resolve-Path -LiteralPath $Agent).Path
$approved=Get-Content -LiteralPath $ApprovedManifest -Raw|ConvertFrom-Json
Require ($approved.version -is [string] -and $approved.version -match '^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$') 'Approved manifest must name an exact major.minor.patch Agent version.'
Require ($approved.agentSha256 -is [string] -and $approved.agentSha256 -match '^[a-f0-9]{64}$') 'Approved manifest must contain the audited Agent SHA-256.'
$expectedVersionPattern='^'+[regex]::Escape($approved.version)+'(?:\.|\+|$)'
Require ((Get-Item -LiteralPath $Agent).VersionInfo.ProductVersion -match $expectedVersionPattern -and (Get-FileHash -LiteralPath $Agent).Hash.ToLowerInvariant() -eq $approved.agentSha256) ('Actual installed binary must match the approved '+$approved.version+' audit.')
$agentConfig=Get-Content -LiteralPath (Join-Path (Split-Path $Agent) 'agent.config.json') -Raw|ConvertFrom-Json
Require ($agentConfig.supabaseUrl.TrimEnd('/') -eq 'https://nzlajptokbcgeaifgnoq.supabase.co') 'The approved binary configuration must retain the production backend.'
$local=Join-Path $env:LOCALAPPDATA 'Mandala Agent'
$managed=Join-Path $env:ProgramData 'Mandala Agent'
$lanFile=Join-Path $managed 'lan.config.json'
$sessionFile=Join-Path $local 'session.dat'
Require (-not(Test-Path -LiteralPath $lanFile)) 'Existing LAN configuration found; fixture refuses to change it.'
Require (-not(Test-Path -LiteralPath $sessionFile)) 'Existing signed-in session found; fixture refuses to change it.'
Require (@(Get-ChildItem -LiteralPath $local -Filter 'time-*' -File -ErrorAction SilentlyContinue).Count -eq 0) 'Existing time journal found; fixture refuses to change it.'
Require (@(Get-Process -Name 'Mandala.Agent' -ErrorAction SilentlyContinue).Count -eq 0) 'Existing Agent process found; fixture refuses to close it.'
Require (@(Get-NetTCPConnection -LocalPort 8443 -State Listen -ErrorAction SilentlyContinue).Count -eq 0) 'Port 8443 is occupied; fixture refuses to replace its listener.'
$fixture=Join-Path $env:RUNNER_TEMP ('Mandala approved Agent LAN '+[Guid]::NewGuid())
New-Item -ItemType Directory -Path $fixture|Out-Null
$data=Join-Path $fixture 'gateway';$profile=Join-Path $fixture 'employee';$fakeInstall=Join-Path $fixture 'synthetic-install'
New-Item -ItemType Directory -Path $fakeInstall|Out-Null
Write-PairingJson (Join-Path $fakeInstall 'gateway.example.json') @{supabaseAnonKey='mandala-protocol-fixture-only'}
$control=Join-Path $fixture 'control.json';$evidence=Join-Path $fixture 'upstream-evidence.json'
$requestPath=Join-Path $fixture 'request.json';$replyPath=Join-Path $fixture 'reply.json'
$script:fixtureRoots=@();$leafThumb=$null;$fixtureGateway=$null;$fixtureAgent=$null;$lanCreated=$false;$ruleCreated=$false;$httpsRuleCreated=$false
$primaryError=$null;$script:fixtureCleanupErrors=@()
$ruleName='Mandala protocol fixture outbound '+[Guid]::NewGuid().ToString('N')
$script:AgentPath=$Agent
$sha=[Security.Cryptography.SHA256]::Create()
try {$journalName='time-'+[BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes('lan-fixture@example.test'))).Replace('-','')+'.dat'}finally{$sha.Dispose()}
$journal=Join-Path $local $journalName
$script:realRootImport=${function:Add-PairingRoot}
function Add-PairingRoot([byte[]]$Bytes) {
    $public=[Security.Cryptography.X509Certificates.X509Certificate2]::new($Bytes)
    $machine=New-Object Security.Cryptography.X509Certificates.X509Store('Root','LocalMachine')
    try {$machine.Open('ReadWrite');$machine.Add($public);$script:fixtureRoots+=$public.Thumbprint}finally{$machine.Close()}
    return (& $script:realRootImport $Bytes)
}
function Read-FixtureEvidence {
    if(Test-Path -LiteralPath $evidence){try{return Get-Content -LiteralPath $evidence -Raw|ConvertFrom-Json}catch{return $null}}
    return $null
}
function Set-FixtureOnline([bool]$Online) {
    Write-PairingJson $control @{online=$Online}
    Wait-Ui ('fixture listener online='+$Online) {$current=Read-FixtureEvidence;$current -and $current.listening -eq $Online} 20|Out-Null
}
function Start-FixtureAgent {
    $script:fixtureAgent=Start-Process -FilePath $Agent -WorkingDirectory (Split-Path $Agent) -PassThru
    $script:AgentProcessId=$script:fixtureAgent.Id
    Wait-Ui 'actual approved Agent window' {try{Get-AgentRoot}catch{$null}} 45|Out-Null
}
function Wait-FixtureReceipts([int]$Count) {
    Wait-Ui ('exactly '+$Count+' real Agent protocol-fixture receipts') {@(Read-AgentEvents (Join-Path $local 'agent.log') $script:started|Where-Object {$_.Event -eq 'lan-time-confirmed'}).Count -eq $Count} 60|Out-Null
}
function Wait-FixtureIdlePause {
    # No mocked clocks or shortened timer: use the actual five-minute Windows
    # idle monitor and stop generating input for the entire bounded wait.
    [MandalaTestInput]::Pulse();$idleStarted=[DateTimeOffset]::UtcNow
    Write-Host 'Agent protocol fixture: waiting for its real five-minute idle pause. No test mouse/keyboard input will be generated.'
    Wait-AgentText 'TrackerMessageText' {param($text) $text -like 'Timer paused after 5 minutes*Time saved successfully*'} 380 'actual five-minute idle pause and save confirmation'
    $idleSeconds=([DateTimeOffset]::UtcNow-$idleStarted).TotalSeconds
    Require ($idleSeconds -ge 295 -and $idleSeconds -le 380) 'Idle result did not follow the actual bounded five-minute Windows inactivity interval.'
    return $idleSeconds
}
function Confirm-AgentDialog([string]$Title,[bool]$Yes) {
    $dialog=Wait-Ui ('Agent dialog '+$Title) {
        [Windows.Automation.AutomationElement]::RootElement.FindFirst([Windows.Automation.TreeScope]::Descendants,[Windows.Automation.AndCondition]::new(
            [Windows.Automation.PropertyCondition]::new([Windows.Automation.AutomationElement]::ProcessIdProperty,[int]$script:AgentProcessId),
            [Windows.Automation.PropertyCondition]::new([Windows.Automation.AutomationElement]::NameProperty,$Title)))
    } 15
    # Standard Windows MessageBox IDs: IDYES=6, IDNO=7 (locale-independent).
    $button=$dialog.FindFirst([Windows.Automation.TreeScope]::Descendants,[Windows.Automation.PropertyCondition]::new([Windows.Automation.AutomationElement]::AutomationIdProperty,$(if($Yes){'6'}else{'7'})))
    Require $button ('Expected Yes/No control unavailable in '+$Title)
    $task=[MandalaTestInput]::Invoke($button)
    Wait-Ui ('dialog response '+$Title) {$task.IsCompleted} 15|Out-Null
    $task.GetAwaiter().GetResult()
}
function Invoke-FixtureCleanup([string]$Stage,[scriptblock]$Action) {
    try {& $Action}
    catch {$script:fixtureCleanupErrors+=$Stage+': '+$_.Exception.GetType().Name;Write-Warning ('Fixture cleanup needs attention: '+$Stage)}
}
try {
    # NetSecurity rejects ranges containing unspecified/broadcast addresses.
    # Cover IPv4 unicast except 127/8 using valid aligned CIDRs, and current IPv6
    # global/unique/link-local unicast. Loopback 127.0.0.1:8443 remains available.
    $blockedNetworks=@('1.0.0.0/8','2.0.0.0/7','4.0.0.0/6','8.0.0.0/5','16.0.0.0/4','32.0.0.0/3','64.0.0.0/3','96.0.0.0/4','112.0.0.0/5','120.0.0.0/6','124.0.0.0/7','126.0.0.0/8','128.0.0.0/2','192.0.0.0/3','2000::/3','fc00::/7','fe80::/10')
    New-NetFirewallRule -Name $ruleName -DisplayName $ruleName -Direction Outbound -Action Block -Program $Agent -Profile Any -RemoteAddress $blockedNetworks|Out-Null
    $ruleCreated=$true
    # The approved production URL is HTTPS443. Block it for ALL IPv4/IPv6
    # destinations as well, including translation prefixes and unusual routes,
    # even if the fixture LAN configuration unexpectedly disappears.
    New-NetFirewallRule -Name ($ruleName+'-https') -DisplayName ($ruleName+'-https') -Direction Outbound -Action Block -Program $Agent -Profile Any -Protocol TCP -RemotePort 443 -RemoteAddress Any|Out-Null
    $httpsRuleCreated=$true
    $gateway=Initialize-PairingGateway '127.0.0.1' $data $fakeInstall
    $request=New-EmployeePairingRequest $requestPath $profile;$leafThumb=$request.thumbprint
    Approve-EmployeePairing $requestPath $replyPath $data|Out-Null
    $reply=Import-EmployeePairing $replyPath $profile (Get-PairingCode ([Convert]::FromBase64String($gateway.root)))
    if(-not(Test-Path -LiteralPath $managed)){New-Item -ItemType Directory -Path $managed|Out-Null}
    Write-PairingJson $lanFile @{gatewayUrl=$reply.gatewayUrl;deviceCertificateThumbprint=$reply.thumbprint};$lanCreated=$true
    $configPath=Join-Path $data 'gateway.json'
    Write-PairingJson $control @{online=$true}
    $node=(Get-Command node.exe -ErrorAction Stop).Source
    $server=(Resolve-Path (Join-Path $PSScriptRoot 'fixtures\agent-lan-upstream.mjs')).Path
    $arguments='"'+$server+'" "'+$configPath+'" "'+$control+'" "'+$evidence+'"'
    $fixtureGateway=Start-Process -FilePath $node -ArgumentList $arguments -PassThru -RedirectStandardOutput (Join-Path $fixture 'server-output.txt') -RedirectStandardError (Join-Path $fixture 'server-error.txt')
    Set-FixtureOnline $true
    $certificate=Get-Item ('Cert:\CurrentUser\My\'+$leafThumb)
    [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
    $health=Invoke-WebRequest -Uri ($reply.gatewayUrl+'/health') -Certificate $certificate -UseBasicParsing -TimeoutSec 10
    Require (($health.Content|ConvertFrom-Json).protocol -eq 1) 'Real gateway did not accept its enrolled certificate.'
    $denied=$false
    try {Invoke-WebRequest -Uri ($reply.gatewayUrl+'/health') -UseBasicParsing -TimeoutSec 5|Out-Null}catch{$denied=$true}
    Require $denied 'Real gateway accepted an unenrolled connection.'
    $script:started=[DateTimeOffset]::UtcNow
    [MandalaTestInput]::Awake($true);[MandalaTestInput]::Pulse()
    Start-FixtureAgent
    Wait-AgentText 'BuildIdentityText' {param($text) $text -like '*LAN https://127.0.0.1:8443*'} 30 'actual Agent loopback LAN identity'
    ([Windows.Automation.ValuePattern](Get-AgentControl 'EmailTextBox').GetCurrentPattern([Windows.Automation.ValuePattern]::Pattern)).SetValue('lan-fixture@example.test')
    $shell=New-Object -ComObject WScript.Shell
    try {Require ($shell.AppActivate($script:AgentProcessId)) 'Could not focus the fixture Agent.';(Get-AgentControl 'PasswordBox').SetFocus();Start-Sleep -Milliseconds 200;$shell.SendKeys('fixtureonly',$true)}finally{[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($shell)}
    Invoke-AgentButton 'SignInButton'
    Wait-Ui 'synthetic login and actual Agent project list' {$c=Find-AgentControl 'ProjectComboBox';$c -and -not $c.Current.IsOffscreen} 45|Out-Null
    Require ((Get-AgentText 'SignedInAsText') -like '*lan-fixture@example.test*') 'Unexpected signed-in identity.'
    Require (@(Get-AgentProjects).Count -eq 2) 'Fixture project list was not loaded by the actual Agent.'
    Start-AgentProject 'CI protocol project A';Start-Sleep -Seconds 3
    Invoke-AgentButton 'StopButton';Wait-AgentState 'No active project';Wait-FixtureReceipts 1
    Require ((Get-AgentText 'TrackerMessageText') -like '*Time saved successfully. Reference:*') 'Actual Agent did not display its save confirmation.'
    Start-AgentProject 'CI protocol project B';Start-Sleep -Seconds 3
    Set-FixtureOnline $false
    Invoke-AgentButton 'StopButton';Wait-AgentState 'No active project' 90
    Wait-AgentText 'TrackerMessageText' {param($text) $text -match 'waiting for (the LAN gateway|Mandala)|Pending time remains'} 60 'durable pending receipt state'
    Require (Test-Path -LiteralPath $journal) 'Actual Agent did not write its fixture journal.'
    Require (@(Read-AgentEvents (Join-Path $local 'agent.log') $script:started|Where-Object {$_.Event -eq 'lan-time-confirmed'}).Count -eq 1) 'Offline stop falsely reported a second server receipt.'
    Close-TestAgent
    Start-FixtureAgent
    Wait-AgentText 'TrackerMessageText' {param($text) $text -match 'waiting for (the LAN gateway|Mandala)|Pending time remains'} 90 'offline pending work survives normal close/reopen'
    if($QueuedOfflineWork){
        Wait-Ui 'Start stays available while the offline save waits for upload' {(Get-AgentControl 'StartWorkButton').Current.IsEnabled} 30|Out-Null
    } else {
        Require (-not (Get-AgentControl 'StartWorkButton').Current.IsEnabled) 'Actual Agent allowed another start while the offline save was pending.'
    }
    Require (@(Read-AgentEvents (Join-Path $local 'agent.log') $script:started|Where-Object {$_.Event -eq 'lan-time-confirmed'}).Count -eq 1) 'Offline restore fabricated a server receipt.'
    Set-FixtureOnline $true
    Wait-FixtureReceipts 2
    Wait-AgentText 'TrackerMessageText' {param($text) $text -like '*Time saved successfully. Reference:*'} 60 'reconciled save confirmation'
    # Exercise the actual production binary's two-stage project switch UI.
    # Merely selecting B and cancelling confirmation must leave A active.
    [MandalaTestInput]::Pulse()
    Start-AgentProject 'CI protocol project A';Start-Sleep -Seconds 3
    Select-AgentProject 'CI protocol project B';Start-Sleep -Seconds 2
    Wait-AgentState 'Tracking CI protocol project A'
    $switch=Invoke-AgentButton 'StartWorkButton' -Async
    Confirm-AgentSwitch $false
    Wait-Ui 'cancelled actual Agent switch completed' {$switch.IsCompleted} 15|Out-Null
    $switch.GetAwaiter().GetResult()
    Wait-AgentState 'Tracking CI protocol project A'
    $cancelled=Read-FixtureEvidence
    Require (@($cancelled.sessions).Count -eq 3 -and @($cancelled.sessions|Where-Object {-not $_.stopped_at -and $_.project_id -eq '11111111-1111-4111-8111-111111111111'}).Count -eq 1) 'Selection or cancelled switch changed the actual Agent session.'
    $switch=Invoke-AgentButton 'StartWorkButton' -Async
    Confirm-AgentSwitch $true
    Wait-Ui 'confirmed actual Agent switch completed' {$switch.IsCompleted} 30|Out-Null
    $switch.GetAwaiter().GetResult()
    Wait-AgentState 'Tracking CI protocol project B'
    Wait-FixtureReceipts 3
    $switched=Read-FixtureEvidence
    Require (@($switched.sessions).Count -eq 4 -and @($switched.sessions|Where-Object {-not $_.stopped_at -and $_.project_id -eq '22222222-2222-4222-8222-222222222222'}).Count -eq 1) 'Confirmed switch did not save A before starting B.'
    Start-Sleep -Seconds 3
    Invoke-AgentButton 'StopButton';Wait-AgentState 'No active project';Wait-FixtureReceipts 4
    [MandalaTestInput]::Pulse()
    Start-AgentProject 'CI protocol project A'
    $idleSeconds=Wait-FixtureIdlePause
    Wait-FixtureReceipts 5
    $expectedReceipts=5
    $autoResumeEvidence=$null
    if($AutoResumeExpected) {
        Wait-AgentState 'Paused CI protocol project A'
        Require ((Get-AgentControl 'StopButton').Current.IsEnabled) 'Idle-paused tracking must offer Stop to cancel automatic resumption.'
        $paused=Read-FixtureEvidence
        $idleSession=@($paused.sessions)[-1]
        Require (@($paused.sessions).Count -eq 5 -and $idleSession.project_id -eq '11111111-1111-4111-8111-111111111111' -and $idleSession.stopped_at) 'Idle pause did not finalize the fifth session for project A.'
        $idleStoppedAt=[DateTimeOffset]::Parse($idleSession.stopped_at)
        # UI Automation changes selection without sending Windows input. The
        # remembered work project must remain A even while the dropdown shows B.
        $idleInput=[MandalaTestInput]::LastInput()
        Select-AgentProject 'CI protocol project B'
        Start-Sleep -Seconds 8
        Require ([MandalaTestInput]::LastInput() -eq $idleInput) 'The idle selection check unexpectedly generated Windows input.'
        Wait-AgentState 'Paused CI protocol project A'
        Require (@((Read-FixtureEvidence).sessions).Count -eq 5) 'Dropdown selection or an idle refresh started a session without returning Windows input.'
        $resumeInputAt=[DateTimeOffset]::UtcNow
        [MandalaTestInput]::Pulse()
        Wait-AgentState 'Tracking CI protocol project A' 45
        Wait-AgentText 'TrackerMessageText' {param($text) $text -like 'Resumed CI protocol project A after Windows activity. Idle time was not added.*'} 20 'visible automatic resumption notice'
        $resumed=Read-FixtureEvidence
        $resumedSession=@($resumed.sessions|Where-Object {-not $_.stopped_at})
        Require (@($resumed.sessions).Count -eq 6 -and $resumedSession.Count -eq 1 -and $resumedSession[0].project_id -eq '11111111-1111-4111-8111-111111111111' -and $resumedSession[0].id -ne $idleSession.id) 'Returning activity must start one new session on remembered project A, not the selected project B.'
        $resumedStartedAt=[DateTimeOffset]::Parse($resumedSession[0].started_at)
        Require ($resumedStartedAt -ge $resumeInputAt.AddMilliseconds(-100) -and $resumedStartedAt -le [DateTimeOffset]::UtcNow.AddSeconds(1)) 'Resumed session start was backdated before returning Windows input.'
        Require (($resumedStartedAt-$idleStoppedAt).TotalSeconds -ge 5) 'The measured idle gap was incorrectly included in the resumed session.'
        Start-Sleep -Seconds 3
        Invoke-AgentButton 'StopButton';Wait-AgentState 'No active project';Wait-FixtureReceipts 6
        [MandalaTestInput]::Pulse();Start-Sleep -Seconds 8
        Wait-AgentState 'No active project'
        Require (@((Read-FixtureEvidence).sessions).Count -eq 6) 'Explicit Stop was undone by returning Windows input.'
        # Prove the second Stop case independently: cancel while paused, before
        # any fresh input can start another session. This uses another real
        # five-minute interval rather than setting app internals or test clocks.
        Start-AgentProject 'CI protocol project A'
        $cancelIdleSeconds=Wait-FixtureIdlePause
        Wait-AgentState 'Paused CI protocol project A';Wait-FixtureReceipts 7
        $cancelInput=[MandalaTestInput]::LastInput()
        Invoke-AgentButton 'StopButton';Wait-AgentState 'No active project'
        Require ([MandalaTestInput]::LastInput() -eq $cancelInput) 'The paused Stop check unexpectedly generated Windows input before cancellation.'
        [MandalaTestInput]::Pulse();Start-Sleep -Seconds 8
        Wait-AgentState 'No active project'
        Require (@((Read-FixtureEvidence).sessions).Count -eq 7) 'Stop while idle-paused failed to cancel automatic resumption.'
        $expectedReceipts=7
        $autoResumeEvidence=[ordered]@{
            returningWindowsInputResumedSameProject=$true
            dropdownSelectionDidNotChangeResumeProject=$true
            newDistinctSession=$true
            resumedSessionId=$resumedSession[0].id
            pausedSessionId=$idleSession.id
            pausedSessionStoppedAt=$idleStoppedAt.ToString('O')
            returningInputAt=$resumeInputAt.ToString('O')
            resumedSessionStartedAt=$resumedStartedAt.ToString('O')
            excludedIdleGapSeconds=[Math]::Round(($resumedStartedAt-$idleStoppedAt).TotalSeconds,3)
            explicitStopPreventedResume=$true
            stopWhilePausedPreventedResume=$true
            secondIdlePauseSeconds=[Math]::Round($cancelIdleSeconds,1)
        }
    } else {
        Wait-AgentState 'No active project'
        [MandalaTestInput]::Pulse();Start-Sleep -Seconds 5
        Wait-AgentState 'No active project'
        Require (@((Read-FixtureEvidence).sessions).Count -eq 5) 'Returning Windows input restarted the legacy timer automatically.'
    }
    $closePromptEvidence=$null;$offlineStartEvidence=$null
    if($QueuedOfflineWork) {
        # Agent 1.0.18: closing the window while tracking asks first. No keeps
        # tracking with the window minimised; Yes saves the session and closes.
        [MandalaTestInput]::Pulse()
        Start-AgentProject 'CI protocol project A';Start-Sleep -Seconds 3
        $closing=Get-Process -Id $script:AgentProcessId
        Require ($closing.CloseMainWindow()) 'Agent did not receive the window close request.'
        Confirm-AgentDialog 'Stop tracking?' $false
        Start-Sleep -Seconds 2
        Require (-not $closing.HasExited) 'Choosing No closed the Agent.'
        $window=[Windows.Automation.WindowPattern](Get-AgentRoot).GetCurrentPattern([Windows.Automation.WindowPattern]::Pattern)
        Require ($window.Current.WindowVisualState -eq [Windows.Automation.WindowVisualState]::Minimized) 'Choosing No did not minimise the Agent.'
        $window.SetWindowVisualState([Windows.Automation.WindowVisualState]::Normal)
        Wait-AgentState 'Tracking CI protocol project A'
        Require (@((Read-FixtureEvidence).sessions|Where-Object {-not $_.stopped_at}).Count -eq 1) 'Choosing No stopped the running session.'
        Require ($closing.CloseMainWindow()) 'Agent did not receive the second window close request.'
        Confirm-AgentDialog 'Stop tracking?' $true
        Require ($closing.WaitForExit(30000)) 'Choosing Yes did not stop tracking and close the Agent.'
        $expectedReceipts++
        Wait-FixtureReceipts $expectedReceipts
        Require (@((Read-FixtureEvidence).sessions|Where-Object {-not $_.stopped_at}).Count -eq 0) 'Closing with Yes left a session running.'
        Start-FixtureAgent
        Wait-AgentState 'No active project' 60
        $closePromptEvidence=[ordered]@{noKeptTrackingMinimised=$true;yesSavedAndClosed=$true}

        # Agent 1.0.18: Start works while the gateway is unreachable. The start
        # uploads after reconnecting with the time Start was pressed, and reports
        # the agent version and this PC's name.
        Set-FixtureOnline $false
        [MandalaTestInput]::Pulse()
        $pressedAt=[DateTimeOffset]::UtcNow
        Start-AgentProject 'CI protocol project B'
        Wait-AgentText 'ElapsedText' {param($text) $text -like '*recorded on this computer*'} 30 'offline session shown as recorded on this computer'
        foreach($pulse in 1..4){Start-Sleep -Seconds 10;[MandalaTestInput]::Pulse()}
        Set-FixtureOnline $true
        $onlineAt=[DateTimeOffset]::UtcNow
        $uploaded=@(Wait-Ui 'offline start uploaded after reconnecting' {@((Read-FixtureEvidence).sessions|Where-Object {-not $_.stopped_at -and $_.project_id -eq '22222222-2222-4222-8222-222222222222'})} 60)
        Require ($uploaded.Count -eq 1) 'Expected exactly one uploaded offline session.'
        $offlineStartedAt=[DateTimeOffset]::Parse($uploaded[0].started_at)
        Require ($offlineStartedAt -le $onlineAt.AddSeconds(-30) -and $offlineStartedAt -ge $pressedAt.AddSeconds(-5)) 'The offline start was not saved at the time Start was pressed.'
        Require ([string]$uploaded[0].agent_version -like ($approved.version+'*') -and $uploaded[0].device_name -eq $env:COMPUTERNAME) 'The start did not report the agent version and this PC name.'
        Start-Sleep -Seconds 3
        Invoke-AgentButton 'StopButton';Wait-AgentState 'No active project'
        $expectedReceipts++
        Wait-FixtureReceipts $expectedReceipts
        $offlineStartEvidence=[ordered]@{startedWhileGatewayDown=$true;pressedAt=$pressedAt.ToString('O');savedStartedAt=$offlineStartedAt.ToString('O');reconnectedAt=$onlineAt.ToString('O');agentVersion=[string]$uploaded[0].agent_version;deviceName=[string]$uploaded[0].device_name}
    }
    # Allow a second automatic retry window; a resolved journal must not resend.
    Start-Sleep -Seconds 12
    $receipts=@(Read-AgentEvents (Join-Path $local 'agent.log') $script:started|Where-Object {$_.Event -eq 'lan-time-confirmed'})
    $observed=Read-FixtureEvidence
    Require ($receipts.Count -eq $expectedReceipts -and @($receipts.SessionId|Select-Object -Unique).Count -eq $expectedReceipts -and @($receipts.EntryId|Select-Object -Unique).Count -eq $expectedReceipts) 'Expected distinct exact receipts with no duplicate after reconnect/switch/idle.'
    Require ($observed.productionRequests -eq 0 -and $observed.blockedExternalRequests -eq 0 -and @($observed.sessions).Count -eq $expectedReceipts) 'Fixture saw unexpected requests or sessions.'
    foreach($session in $observed.sessions){Require ($session.stopped_at -and $session.time_entry_id -and $session.finishRequests -eq 1 -and @($receipts|Where-Object {$_.SessionId -eq $session.id -and $_.EntryId -eq $session.time_entry_id}).Count -eq 1) 'Actual Agent receipt did not match exactly one synthetic saved session.'}
    Require ((Get-AgentControl 'StartWorkButton').Current.IsEnabled) 'Pending state did not clear after confirmed recovery.'
    Close-TestAgent
    $summary=[ordered]@{scope='PROTOCOL FIXTURE - NOT PRODUCTION ACCEPTANCE';binaryProvenance=$(if($FixtureCandidate){'Unpublished source candidate with synthetic configuration; not an audited release'}else{'Audited installed release candidate'});releaseAudited=(-not $FixtureCandidate);agentVersion=$approved.version;agentSha256=$approved.agentSha256;backend='nzlajptokbcgeaifgnoq';gateway='https://127.0.0.1:8443';realGatewayMutualTls=$true;realAgentSignIn=$true;realStartStop=$true;realOfflineJournalCloseReopen=$true;selectionDidNotSwitch=$true;cancelDidNotSwitch=$true;confirmedSwitchSavedPreviousFirst=$true;exactSavedReceipts=$expectedReceipts;duplicateReceipts=0;productionRequests=0;productionEntries=0;upstream='Injected in-memory protocol fixture; no database/network implementation';rebootTested=$false;idleTested=$true;idlePauseSeconds=[Math]::Round($idleSeconds,1);inputDidNotAutoResume=(-not $AutoResumeExpected);autoResumeExpected=[bool]$AutoResumeExpected;autoResume=$autoResumeEvidence;closePrompt=$closePromptEvidence;offlineStart=$offlineStartEvidence;windowsUserMode='Hosted CI account; not standard-user/UAC acceptance'}
    Write-PairingJson (Join-Path $env:RUNNER_TEMP 'approved-agent-lan-audit.json') $summary
    Write-Host ('PASS: tested Agent '+$approved.version+', real gateway mutual TLS, synthetic sign-in/projects, start/stop, offline pending journal through normal close/reopen, cancelled/confirmed switch and actual five-minute idle behavior. Auto-resume expected: '+[bool]$AutoResumeExpected+'; exact receipts: '+$expectedReceipts+'; zero duplicates. PROTOCOL FIXTURE ONLY: zero production writes; no reboot/SQL/standard-user acceptance claimed.')
} catch {
    $primaryError=$_
    try {if(Test-Path -LiteralPath (Join-Path $fixture 'server-error.txt')){Get-Content -LiteralPath (Join-Path $fixture 'server-error.txt')|Write-Host}}catch{Write-Warning 'Fixture server diagnostics unavailable; original test error is preserved.'}
    # Fixed-field diagnostics distinguish delayed tracker controls from failed
    # session restoration without reading passwords or decrypting any journal.
    $safeControls=@()
    foreach($id in @('BuildIdentityText','LoginMessageText','TrackerMessageText','ProjectComboBox','StartWorkButton')) {
        try {
            $c=Find-AgentControl $id
            $safeControls+=[pscustomobject]@{Id=$id;Present=($null -ne $c);Visible=($c -and -not $c.Current.IsOffscreen);Enabled=($c -and $c.Current.IsEnabled);ErrorCodes=@(if($c){[regex]::Matches($c.Current.Name,'\bAGENT-[A-Z0-9-]+-\d{3}\b')|ForEach-Object {$_.Value}})}
        } catch {$safeControls+=[pscustomobject]@{Id=$id;Evidence='Unavailable'}}
    }
    try {$safeControls|ConvertTo-Json -Depth 5|Write-Host;if($script:started){@(Read-AgentEvents (Join-Path $local 'agent.log') $script:started)|Select-Object -Last 15|ConvertTo-Json -Depth 5|Write-Host}}catch{Write-Warning 'Additional fixture evidence unavailable; original error is preserved.'}
    Write-Host $primaryError.ScriptStackTrace
} finally {
    Invoke-FixtureCleanup 'Agent process' {if($script:fixtureAgent -and -not $script:fixtureAgent.HasExited){$script:fixtureAgent.Kill();$script:fixtureAgent.WaitForExit(10000)|Out-Null}}
    Invoke-FixtureCleanup 'gateway process' {if($fixtureGateway -and -not $fixtureGateway.HasExited){Write-PairingJson $control @{shutdown=$true};if(-not $fixtureGateway.WaitForExit(10000)){$fixtureGateway.Kill();$fixtureGateway.WaitForExit(10000)|Out-Null}}}
    Invoke-FixtureCleanup 'awake flag' {[MandalaTestInput]::Awake($false)}
    # Preconditions proved these exact files did not exist before this isolated
    # run. No real employee files, logs, other journals or certificates are removed.
    Invoke-FixtureCleanup 'LAN configuration' {if($lanCreated){Remove-Item -LiteralPath $lanFile -Force}}
    foreach($path in @($sessionFile,$journal,($journal+'.tmp'))){Invoke-FixtureCleanup 'fixture session/journal' {if(Test-Path -LiteralPath $path){Remove-Item -LiteralPath $path -Force}}}
    Invoke-FixtureCleanup 'employee fixture key' {if($leafThumb -and (Test-Path ('Cert:\CurrentUser\My\'+$leafThumb))){Remove-Item ('Cert:\CurrentUser\My\'+$leafThumb) -DeleteKey}}
    foreach($thumb in $script:fixtureRoots){foreach($store in @('CurrentUser','LocalMachine')){Invoke-FixtureCleanup 'fixture root certificate' {if(Test-Path ('Cert:\'+$store+'\Root\'+$thumb)){Remove-Item ('Cert:\'+$store+'\Root\'+$thumb)}}}}
    Invoke-FixtureCleanup 'unicast firewall guard' {if($ruleCreated){Remove-NetFirewallRule -Name $ruleName}}
    Invoke-FixtureCleanup 'production HTTPS firewall guard' {if($httpsRuleCreated){Remove-NetFirewallRule -Name ($ruleName+'-https')}}
    Invoke-FixtureCleanup 'fixture folder' {Remove-Item -LiteralPath $fixture -Recurse -Force}
}
if($primaryError){throw $primaryError}
if($script:fixtureCleanupErrors.Count){throw ('Protocol fixture checks finished but cleanup failed: '+($script:fixtureCleanupErrors -join ', '))}
