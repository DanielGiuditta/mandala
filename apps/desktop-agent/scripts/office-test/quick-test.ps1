param([ValidateSet('employee','gateway')][string]$Role='employee')
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'startup-repair\startup-core.ps1')
. (Join-Path $PSScriptRoot 'check-core.ps1')
$stateDir=Join-Path $env:LOCALAPPDATA 'Mandala Office Test 1.2.0'
New-Item -ItemType Directory $stateDir -Force|Out-Null
$stateFile=Join-Path $stateDir ($Role+'.json')
$reportDir=Join-Path ([Environment]::GetFolderPath('DesktopDirectory')) ('Mandala-Quick-Test-'+$env:COMPUTERNAME+'-'+$Role)
New-Item -ItemType Directory $reportDir -Force|Out-Null
$log=Join-Path $env:LOCALAPPDATA 'Mandala Agent\agent.log'
$lock=New-Object Threading.Mutex($false,('Local\MandalaOfficeQuickTest-'+$Role))
if(-not $lock.WaitOne(0)) {Write-Host 'This test is already running. Use the existing window.';exit 1}
if(Test-Path $stateFile){$state=Get-Content $stateFile -Raw|ConvertFrom-Json}
else {$state=[pscustomobject]@{SchemaVersion=1;KitVersion='1.2.0';RunId=[Guid]::NewGuid().ToString();Role=$Role;Computer=$env:COMPUTERNAME;WindowsUser=[Security.Principal.WindowsIdentity]::GetCurrent().Name;Environment=[pscustomobject]@{OS=[Environment]::OSVersion.VersionString;OS64=[Environment]::Is64BitOperatingSystem;Process64=[Environment]::Is64BitProcess;PowerShell=$PSVersionTable.PSVersion.ToString();TimeZone=[TimeZoneInfo]::Local.Id};StartedUtc=[DateTimeOffset]::UtcNow.ToString('o');Phase='preflight';Email='';ProjectA='';ProjectB='';BootBefore='';Candidates=@();Checks=@();History=@();Actions=@();Scenarios=@();Events=@();DatabaseVerification='PENDING - maintainer must verify actual production rows';Result='NOT CLEARED'}}
function Save-QuickReport {
    $state.Events=@(Read-AgentEvents $log ([DateTimeOffset]$state.StartedUtc))
    $json=$state|ConvertTo-Json -Depth 20
    $temp=$stateFile+'.tmp';[IO.File]::WriteAllText($temp,$json,(New-Object Text.UTF8Encoding($false)))
    Move-Item -LiteralPath $temp -Destination $stateFile -Force
    [IO.File]::WriteAllText((Join-Path $reportDir 'report.json'),$json,(New-Object Text.UTF8Encoding($false)))
    $lines=@('MANDALA COMPLETE TEST 1.2.0',('Computer: '+$state.Computer),('Role: '+$Role),('Phase: '+$state.Phase),('Result: '+$state.Result),('Saved: '+(Get-IstTime)),'')
    foreach($c in $state.Checks){$lines+=('['+$c.Status+'] '+$c.Id+': '+$c.Detail)}
    foreach($s in $state.Scenarios){$lines+=('['+$s.Status+'] '+$s.Kind+': '+$s.Detail)}
    $lines+=@('','Return this ZIP with the other PC report once. Do not repeat uncertain time tests.','Production row verification and gateway/IT observations are required before clearance.','If stopped during offline testing, reconnect the employee LAN now. Pending work is preserved.')
    $lines|Set-Content (Join-Path $reportDir 'SUMMARY.txt') -Encoding UTF8
    Compress-Archive -Path (Join-Path $reportDir '*') -DestinationPath ($reportDir+'.zip') -Force
}
function Note-Action($Message) {
    Write-Host $Message
    $state.Actions+=[pscustomobject]@{Instruction=$Message;Utc=[DateTimeOffset]::UtcNow.ToString('o');Ist=(Get-IstTime);Source='automatic runner'}
    Save-QuickReport
}
function Ask-Yes($Message) {
    Write-Host '';Write-Host $Message
    [Console]::Beep(750,250)
    $answer=Read-Host 'Type yes to confirm, or anything else to stop and save the report'
    $state.Actions+=[pscustomobject]@{Instruction=$Message;Utc=[DateTimeOffset]::UtcNow.ToString('o');Ist=(Get-IstTime);Answer=$answer;Source='tester'}
    Save-QuickReport
    Require ($answer -eq 'yes') 'Tester did not confirm. All available checks are in the report.'
}
function Show-Checks {foreach($c in $state.Checks){Write-Host ('['+$c.Status+'] '+$c.Id+': '+$c.Detail)};Save-QuickReport}
function Arm-Reboot {
    $launcher=Join-Path $PSScriptRoot ('Start '+$Role+' Test.cmd')
    Require (Test-Path $launcher) 'Keep the complete extracted package in its folder.'
    Ask-Yes 'Save all other work. Restart this PC now? After signing into THIS SAME Windows account the test should reopen. If it does not, open the same Start Test file. Do not open Agent/setup manually.'
    # One-time launcher only, in this Windows account. Never replace Agent startup.
    $key='HKCU:\Software\Microsoft\Windows\CurrentVersion\RunOnce'
    New-Item $key -Force|Out-Null
    $command='"'+$env:WINDIR+'\System32\cmd.exe" /d /c start "" "'+$launcher+'"'
    New-ItemProperty $key -Name ('MandalaOfficeTest-'+$Role) -Value $command -PropertyType String -Force|Out-Null
    $state.BootBefore=(Get-CimInstance Win32_OperatingSystem).LastBootUpTime.ToUniversalTime().ToString('o')
    $state.Phase='reboot';Save-QuickReport
    & shutdown.exe /r /t 0
    Require ($LASTEXITCODE -eq 0) 'Windows did not accept restart. Restart normally and reopen this test.'
}
function Check-NewBoot {
    $boot=(Get-CimInstance Win32_OperatingSystem).LastBootUpTime.ToUniversalTime()
    Require ($state.BootBefore -and $boot.ToString('o') -ne $state.BootBefore) 'Restart has not happened yet. Restart Windows, sign into the same account and reopen this launcher.'
    Remove-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\RunOnce' -Name ('MandalaOfficeTest-'+$Role) -ErrorAction SilentlyContinue
    return $boot
}
function Add-Observation($Scenario,$Text,$Source='automatic UI and log checks') {
    $Scenario.Observations+=[pscustomobject]@{Check=$Text;Answer='yes';Source=$Source;Ist=(Get-IstTime)}
    Save-QuickReport
}
function Read-Receipts($Since) {@(Read-AgentEvents $log $Since|Where-Object {$_.Event -eq 'lan-time-confirmed'})}
function Wait-Receipts($Since,$Count) {Wait-Ui 'matching saved-time receipts' { @(Read-Receipts $Since).Count -ge $Count } 120|Out-Null}
function Test-GatewayReachable {
    $config=Get-Content (Join-Path $env:ProgramData 'Mandala Agent\lan.config.json') -Raw|ConvertFrom-Json
    $uri=[Uri]$config.gatewayUrl;$client=New-Object Net.Sockets.TcpClient
    try {$task=$client.ConnectAsync($uri.Host,$uri.Port);return ($task.Wait(3000) -and $client.Connected)} catch {return $false} finally {$client.Dispose()}
}
function Run-AutomatedCase($Kind,$Count,[scriptblock]$Body) {
    $scenario=[pscustomobject]@{Kind=$Kind;Status='INCOMPLETE';Detail='Automatic UI test started';StartedUtc=[DateTimeOffset]::UtcNow.ToString('o');FinishedUtc=$null;Observations=@();Receipts=@()}
    $state.Scenarios+=$scenario;Save-QuickReport
    try {
        Note-Action ('Running '+$Kind+' test. Leave this desktop unlocked. Escape stops safely.')
        & $Body $scenario ([DateTimeOffset]$scenario.StartedUtc)
        $scenario.Receipts=@(Test-ScenarioEvidence @(Read-AgentEvents $log ([DateTimeOffset]$scenario.StartedUtc)) $Count $Kind)
        $scenario.Status='LOCAL PASS';$scenario.Detail='Actual Agent UI and save receipts checked; production rows still require verification.'
    } catch {$scenario.Status='FAIL';$scenario.Detail=$_.Exception.Message;throw}
    finally {$scenario.FinishedUtc=[DateTimeOffset]::UtcNow.ToString('o');Save-QuickReport}
}
try {
    Write-Host ('MANDALA COMPLETE TEST 1.2.0 - '+$Role.ToUpperInvariant())
    Write-Host 'One result set. No screenshots after each step. Keep the full extracted folder in place.'
    $admin=([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if($state.Phase -eq 'functional') {
        foreach($item in $state.Scenarios){if($item.Status -eq 'INCOMPLETE'){$item.Status='FAIL';$item.Detail='Runner interrupted. No automatic replay; preserve the pending work.'}}
        foreach($kind in @('stop','offline','switch','idle')){if(-not @($state.Scenarios|Where-Object {$_.Kind -eq $kind}).Count){$state.Scenarios+=[pscustomobject]@{Kind=$kind;Status='BLOCKED';Detail='Runner interrupted; no automatic replay.'}}}
        $state.Phase='stopped';$state.Result='NOT CLEARED'
    }
    if($state.Phase -in @('complete','stopped')){Write-Host 'This run has finished or stopped. Returning the existing report; time tests will not be repeated.';return}
    $state.Checks=@($state.Checks|Where-Object {$_.Id -ne 'test.quick-runner'})
    if($Role -eq 'gateway') {
        Require $admin 'Open Start gateway Test.cmd and approve the Windows administrator prompt.'
        $state.History+=[pscustomobject]@{Utc=[DateTimeOffset]::UtcNow.ToString('o');Checks=$state.Checks}
        $state.Checks=@(Get-GatewayChecks);Show-Checks
        if($state.Phase -eq 'preflight') {
            Ask-Yes 'IT: confirm this is the dedicated, awake gateway with reserved IP, no internet port forwarding, isolation from file servers/domain controllers, and employee direct internet blocked while gateway HTTPS is allowed.'
            $state.Checks+=New-CheckResult 'gateway.isolation' 'OBSERVED' 'IT confirmed dedicated gateway, reserved IP, network isolation and employee internet restriction.'
            Require (@($state.Checks|Where-Object {$_.Status -notin @('PASS','OBSERVED')}).Count -eq 0) 'Gateway prerequisites failed. See FIXES.txt; all independent checks are saved.'
            Ask-Yes 'Confirm there are NO active employee timers before this gateway restart.'
            Arm-Reboot;return
        }
        Check-NewBoot|Out-Null
        Ask-Yes 'Did the gateway start after restart without opening setup or starting its task manually?'
        $state.Checks+=New-CheckResult 'gateway.reboot-observed' 'PASS' 'Different boot and IT confirms no manual gateway start.'
        $isolation=@($state.History|ForEach-Object {$_.Checks}|Where-Object {$_.Id -eq 'gateway.isolation' -and $_.Status -eq 'OBSERVED'})
        Require ($isolation.Count -gt 0) 'Pre-restart network isolation confirmation missing.'
        $state.Checks+=$isolation[-1]
        Require (@($state.Checks|Where-Object {$_.Status -notin @('PASS','OBSERVED')}).Count -eq 0) 'Post-restart gateway check failed.'
        $state.Phase='complete';$state.Result='GATEWAY LOCAL CHECKS PASSED - EMPLOYEE AND DATABASE VERIFICATION REQUIRED';return
    }
    Require (-not $admin) 'Open the employee launcher normally in the employee Windows account, not as administrator.'
    . (Join-Path $PSScriptRoot 'ui-driver.ps1')
    [MandalaTestInput]::Awake($true)
    $approved=Get-Content (Join-Path $PSScriptRoot 'approved-agent.json') -Raw|ConvertFrom-Json
    if($state.Phase -eq 'preflight') {
        if(-not $state.Email){$state.Email=(Read-Host 'Employee Mandala email (never type a password here)').Trim()}
        $state.Candidates=@(Get-MandalaAgentCandidates)
        $state.Checks=@(Get-EmployeeChecks $state.Candidates $approved);Show-Checks
        if(-not (Select-MandalaAgent $state.Candidates)) {
            Ask-Yes 'No Agent was found in the checked locations. Install the included approved employee Agent 1.0.15? Windows administrator approval is required.'
            $installer=Join-Path $PSScriptRoot 'MandalaAgentSetup-1.0.15.exe'
            Require ((Get-Item $installer).Length -eq 51056706 -and (Get-FileHash $installer).Hash.ToLowerInvariant() -eq 'acf56fe97faa161e710330e1e14652be4d31f8475c8738234ff86d10c2a660ed') 'Installer integrity check failed.'
            $p=Start-Process $installer -ArgumentList '/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART' -Verb RunAs -Wait -PassThru
            Require ($p.ExitCode -eq 0) 'Installer did not complete.'
        }
        $script:AgentPath=Get-MandalaAgentPath
        Require $script:AgentPath 'Agent could not be located; all discovery evidence is saved.'
        Assert-MandalaAgent $script:AgentPath ([Environment]::GetFolderPath('CommonApplicationData'))
        Require ((Get-FileHash $script:AgentPath).Hash.ToLowerInvariant() -eq $approved.agentSha256) 'Installed Agent differs from the approved binary. No downgrade attempted.'
        if(@($state.Checks|Where-Object {$_.Id -eq 'employee.startup-shortcut' -and $_.Status -ne 'PASS'}).Count) {
            Note-Action 'Repairing Mandala startup shortcuts with backups. Approve Windows administrator access if requested.'
            & powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File (Join-Path $PSScriptRoot 'startup-repair\repair-startup.ps1')
            Require ($LASTEXITCODE -eq 0) 'Startup repair needs attention. Full preflight evidence is saved.'
        }
        if(-not @(Get-Process -Name 'Mandala.Agent' -ErrorAction SilentlyContinue|Where-Object {$_.SessionId -eq (Get-Process -Id $PID).SessionId}).Count){Start-Process -FilePath $script:AgentPath -WorkingDirectory (Split-Path $script:AgentPath)|Out-Null;Start-Sleep -Seconds 2}
        Attach-TestAgent
        Write-Host 'Sign in in the Agent if needed. This test waits up to 10 minutes and never reads the password field.'
        Wait-Ui 'signed-in Agent and available projects' { $c=Find-AgentControl 'ProjectComboBox';$c -and -not $c.Current.IsOffscreen } 600|Out-Null
        $state.History+=[pscustomobject]@{Utc=[DateTimeOffset]::UtcNow.ToString('o');Checks=$state.Checks}
        $state.Candidates=@(Get-MandalaAgentCandidates);$state.Checks=@(Get-EmployeeChecks $state.Candidates $approved)
        $state.Checks+=Invoke-OfficeCheck 'employee.signed-in-projects' {
            Require ((Get-AgentText 'SignedInAsText') -like ('Signed in as '+$state.Email+' *')) 'Signed-in employee differs from the supplied email.'
            $script:choices=@(Get-AgentProjects);Require ($script:choices.Count -ge 2) 'At least two allowed projects are required.'
            'Employee identity and two or more visible allowed projects confirmed through Agent UI.'
        }
        Show-Checks
        Require (@($state.Checks|Where-Object {$_.Status -ne 'PASS'}).Count -eq 0) 'Prerequisites failed. See FIXES.txt; every independent check is saved. Correct prerequisites and reopen this launcher before time testing.'
        Require ((Get-AgentText 'ActiveProjectText') -ceq 'No active project') 'Stop any existing real work yourself before testing. The checker will not stop it.'
        for($i=0;$i -lt $choices.Count;$i++){Write-Host (($i+1).ToString()+': '+$choices[$i])}
        $a=0;$b=0
        Require ([int]::TryParse((Read-Host 'Number for agreed test project A'),[ref]$a) -and $a -ge 1 -and $a -le $choices.Count) 'Invalid project A selection.'
        Require ([int]::TryParse((Read-Host 'Number for different agreed test project B'),[ref]$b) -and $b -ge 1 -and $b -le $choices.Count -and $a -ne $b) 'Invalid project B selection.'
        $state.ProjectA=$choices[$a-1];$state.ProjectB=$choices[$b-1]
        Require ($state.ProjectA -cne $state.ProjectB) 'Use distinct project names so database verification is unambiguous.'
        Ask-Yes ('Authorize FIVE real test time entries under '+$state.Email+' using '+$state.ProjectA+' and '+$state.ProjectB+'? After restart this runner clicks only the verified Agent, generates test mouse activity, and waits through idle/offline checks. Reserve this PC; keep it unlocked. Press Escape to abort during automatic work.')
        Arm-Reboot;return
    }
    Require ($state.Phase -eq 'reboot') 'Unknown run phase. Return the saved report instead of restarting the test.'
    $boot=Check-NewBoot
    $script:AgentPath=Get-MandalaAgentPath
    Require ($script:AgentPath -and (Get-FileHash $script:AgentPath).Hash.ToLowerInvariant() -eq $approved.agentSha256) 'Agent binary changed after restart.'
    # Do not launch Agent here: this proves its own startup entry worked.
    Wait-Ui 'Agent automatic startup after sign-in' {@(Get-Process -Name 'Mandala.Agent' -ErrorAction SilentlyContinue|Where-Object {$_.SessionId -eq (Get-Process -Id $PID).SessionId -and $_.StartTime.ToUniversalTime() -ge $boot}).Count -eq 1} 90|Out-Null
    Attach-TestAgent
    Ask-Yes 'Did Mandala Agent open by itself, without you opening it or clicking the gateway/setup button?'
    $state.Checks+=New-CheckResult 'employee.reboot-observed' 'PASS' 'Different boot; exactly one approved Agent already running; tester confirms automatic launch.'
    Wait-Ui 'signed-in tracker after reboot (sign in in Agent if requested)' {$c=Find-AgentControl 'ProjectComboBox';$c -and -not $c.Current.IsOffscreen} 600|Out-Null
    Require ((Get-AgentText 'SignedInAsText') -like ('Signed in as '+$state.Email+' *')) 'Employee identity changed after restart.'
    Require (@($state.Checks|Where-Object {$_.Status -ne 'PASS'}).Count -eq 0) 'A required preflight check did not pass.'
    Require ($state.Scenarios.Count -eq 0) 'Prior time tests exist. They will not be repeated.'
    $state.Phase='functional';Save-QuickReport
    Run-AutomatedCase 'stop' 1 {
        param($s,$since)
        Start-AgentProject $state.ProjectA;Wait-TestActivity
        Ask-Yes ('On an internet-connected browser, sign in as this SAME employee. View '+$state.ProjectB+' and try Start Work. Confirm viewing did not switch the timer AND starting could not take over the desktop session. Leave the browser timer stopped. Did both checks pass?')
        Wait-AgentState ('Tracking '+$state.ProjectA)
        Add-Observation $s 'Browser view did not switch project and browser takeover was refused' 'tester confirmation plus Agent state'
        Invoke-AgentButton 'StopButton';Wait-AgentState 'No active project';Wait-Receipts $since 1
        Add-Observation $s 'Start/stop saved with receipt and no active project'
    }
    Run-AutomatedCase 'offline' 1 {
        param($s,$since)
        Start-AgentProject $state.ProjectA;Wait-TestActivity
        Ask-Yes 'Disconnect ONLY this employee PC from the LAN now (unplug its network cable or use your IT-approved method). Leave the gateway running. Confirm disconnected. The test will call you back when ready to reconnect.'
        Require (-not (Test-GatewayReachable)) 'Gateway is still reachable. Offline test was not established.'
        Wait-TestActivity
        Require (-not (Test-GatewayReachable)) 'Network returned before the offline stop.'
        Invoke-AgentButton 'StopButton';Wait-AgentState 'No active project' 90
        Wait-Ui 'durable pending-save message' {(Get-AgentText 'TrackerMessageText') -like '*Time saved on this computer; waiting for the LAN gateway*'} 90|Out-Null
        Require (@(Read-Receipts $since).Count -eq 0) 'Agent reported a server receipt while offline.'
        Add-Observation $s 'Offline stop showed pending, not cloud-saved'
        Invoke-AgentButton 'CopyDiagnosticsButton'
        Close-TestAgent
        Start-Process -FilePath $script:AgentPath -WorkingDirectory (Split-Path $script:AgentPath)|Out-Null;Start-Sleep -Seconds 2;Attach-TestAgent
        Wait-Ui 'pending work restored after offline app restart' {(Get-AgentText 'TrackerMessageText') -like '*Time saved on this computer; waiting for the LAN gateway*'} 120|Out-Null
        Add-Observation $s 'Pending save survived normal close/reopen in the same employee account'
        Require (-not (Test-GatewayReachable)) 'Connection returned before the blocked-start check.'
        $start=Get-AgentControl 'StartWorkButton'
        if($start.Current.IsEnabled){Invoke-AgentButton 'StartWorkButton';Start-Sleep -Seconds 3}
        Wait-AgentState 'No active project'
        Require ((Get-AgentText 'TrackerMessageText') -match 'pending|waiting for the LAN gateway') 'Pending/new-start-blocked message missing.'
        Add-Observation $s 'New start prevented while offline and previous save pending'
        Ask-Yes 'Reconnect this employee PC to the LAN now. Confirm reconnected, then leave the PC alone. Remaining switch and idle checks run automatically (about 13 minutes).'
        Wait-Ui 'gateway connection restored' {Test-GatewayReachable} 90|Out-Null
        Wait-Receipts $since 1
        Wait-Ui 'pending state cleared' {(Get-AgentControl 'StartWorkButton').Current.IsEnabled -and (Get-AgentText 'TrackerMessageText') -like '*Time saved successfully*'} 60|Out-Null
        Add-Observation $s 'Reconnect produced a saved reference and cleared pending state'
    }
    Run-AutomatedCase 'switch' 2 {
        param($s,$since)
        Start-AgentProject $state.ProjectA;Wait-TestActivity
        Select-AgentProject $state.ProjectB
        # Selecting another project alone must not switch the active timer.
        Wait-AgentState ('Tracking '+$state.ProjectA)
        $click=Invoke-AgentButton 'StartWorkButton' -Async;Confirm-AgentSwitch $false
        Wait-Ui 'cancel click completed' {$click.IsCompleted} 15|Out-Null;$click.GetAwaiter().GetResult()
        Wait-AgentState ('Tracking '+$state.ProjectA)
        Require (@(Read-Receipts $since).Count -eq 0) 'Cancelled switch finalized a session.'
        Add-Observation $s 'Selecting B and cancelling switch both kept A active without saving it'
        Select-AgentProject $state.ProjectB
        $click=Invoke-AgentButton 'StartWorkButton' -Async;Confirm-AgentSwitch $true
        Wait-Ui 'confirmed switch completed' {$click.IsCompleted} 30|Out-Null;$click.GetAwaiter().GetResult()
        Wait-AgentState ('Tracking '+$state.ProjectB);Wait-Receipts $since 1;Wait-TestActivity
        Invoke-AgentButton 'StopButton';Wait-AgentState 'No active project';Wait-Receipts $since 2
        Add-Observation $s 'Confirmed switch saved A, started B, then stopped and saved B'
    }
    Run-AutomatedCase 'idle' 1 {
        param($s,$since)
        Start-AgentProject $state.ProjectA;Wait-TestActivity
        Note-Action 'IDLE CHECK: no keyboard/mouse activity for six minutes. Timer runs unattended. Extra activity fails this check instead of silently extending it.'
        $last=[MandalaTestInput]::LastInput();$end=[DateTimeOffset]::UtcNow.AddSeconds(360)
        while([DateTimeOffset]::UtcNow -lt $end){Write-Progress -Activity 'Automatic Mandala idle check' -Status ('Do not touch keyboard or mouse; '+[int]($end-[DateTimeOffset]::UtcNow).TotalSeconds+' seconds remaining');Start-Sleep -Seconds 2;Require ([MandalaTestInput]::LastInput() -eq $last) 'Keyboard/mouse input interrupted the idle test. Evidence saved; no time tests repeated.'}
        Wait-AgentState 'No active project';Wait-Receipts $since 1
        Require ((Get-AgentText 'TrackerMessageText') -like '*Timer paused after 5 minutes*') 'Idle pause/save message missing.'
        [MandalaTestInput]::Pulse();Start-Sleep -Seconds 5
        Wait-AgentState 'No active project'
        Add-Observation $s 'Windows idle paused/saved; returning input did not restart the timer'
    }
    $state.Phase='complete';$state.Result='EMPLOYEE LOCAL TESTS PASSED - PRODUCTION ROWS AND GATEWAY SIGNOFF REQUIRED'
    Note-Action 'Finished. Send the employee and gateway report ZIPs together. No screenshots needed.'
} catch {
    if($state.Phase -eq 'functional') {
        foreach($kind in @('stop','offline','switch','idle')){if(-not @($state.Scenarios|Where-Object {$_.Kind -eq $kind}).Count){$state.Scenarios+=[pscustomobject]@{Kind=$kind;Status='BLOCKED';Detail='Earlier check failed; further time writes stopped.'}}}
        $state.Phase='stopped'
    }
    $state.Result='NOT CLEARED'
    # Transient prerequisites may be corrected without repeating a time-writing run.
    $state.Checks=@($state.Checks|Where-Object {$_.Id -ne 'test.quick-runner'})+@(New-CheckResult 'test.quick-runner' 'BLOCKED' $_.Exception.Message)
    Write-Host ('TEST NEEDS ATTENTION: '+$_.Exception.Message)
    Write-Host 'Reconnect LAN if disconnected. Preserve any active/pending Agent work. Return the report; do not repeat time tests.'
} finally {
    Save-QuickReport
    Write-Progress -Activity 'Automatic Mandala timer check' -Completed
    Write-Progress -Activity 'Automatic Mandala idle check' -Completed
    if('MandalaTestInput' -as [type]){[MandalaTestInput]::Awake($false)}
    Write-Host ('REPORT: '+$reportDir+'.zip')
    $lock.ReleaseMutex();$lock.Dispose()
}
