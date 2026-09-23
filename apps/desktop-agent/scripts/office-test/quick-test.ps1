param([ValidateSet('employee','gateway')][string]$Role='employee',[ValidateSet('Run','Baseline','Export')][string]$Mode='Run')
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'startup-repair\startup-core.ps1')
. (Join-Path $PSScriptRoot 'check-core.ps1')
. (Join-Path $PSScriptRoot 'report-core.ps1')
. (Join-Path $PSScriptRoot 'recovery-evidence.ps1')
. (Join-Path $PSScriptRoot 'gateway-repair\repair-core.ps1')
$legacyStateFile=Join-Path (Join-Path $env:LOCALAPPDATA 'Mandala Office Test 1.2.0') ($Role+'.json')
$storage=Initialize-OfficeStorage $Role
$stateDir=$storage.Root
$stateFile=$storage.StateFile
$reportDir=$storage.Reports
$desktopDirectory=[Environment]::GetFolderPath('DesktopDirectory')
$script:lastReport=$null
$script:publishDesktop=$false
$log=Join-Path $env:LOCALAPPDATA 'Mandala Agent\agent.log'
$lock=New-Object Threading.Mutex($false,('Local\MandalaOfficeQuickTest-'+$Role))
if(-not $lock.WaitOne(0)) {Write-Host 'This test is already running. Use the existing window.';exit 1}
function New-QuickRunState {
    [pscustomobject]@{SchemaVersion=1;KitVersion='1.2.4';RunId=[Guid]::NewGuid().ToString();Role=$Role;Computer=$env:COMPUTERNAME;WindowsUser=[Security.Principal.WindowsIdentity]::GetCurrent().Name;Environment=[pscustomobject]@{OS=[Environment]::OSVersion.VersionString;OS64=[Environment]::Is64BitOperatingSystem;Process64=[Environment]::Is64BitProcess;PowerShell=$PSVersionTable.PSVersion.ToString();TimeZone=[TimeZoneInfo]::Local.Id};StartedUtc=[DateTimeOffset]::UtcNow.ToString('o');Phase='preflight';Email='';ProjectA='';ProjectB='';BootBefore='';Candidates=@();Checks=@();History=@();Actions=@();Scenarios=@();Events=@();DatabaseVerification='PENDING - maintainer must verify actual production rows';Result='NOT CLEARED'}
}
try {
    if($Mode -ne 'Baseline' -and -not(Test-Path -LiteralPath $stateFile) -and (Test-Path -LiteralPath $legacyStateFile)) {
        [void](Assert-OfficeLocalPath $legacyStateFile)
        $legacy=Get-Content -LiteralPath $legacyStateFile -Raw|ConvertFrom-Json
        Require ($legacy.SchemaVersion -eq 1 -and $legacy.Role -eq $Role -and $legacy.RunId) 'Historical state is invalid; preserved without importing.'
        Write-OfficeCheckpoint $legacy $stateFile
    }
    if($Mode -eq 'Export' -and -not(Test-Path -LiteralPath $stateFile)) {
        $baseline=@(Get-ChildItem -LiteralPath $storage.Root -Filter 'baseline-*.json' -File|Sort-Object LastWriteTimeUtc -Descending|Select-Object -First 1)
        if($baseline.Count){$stateFile=$baseline[0].FullName;$storage.StateFile=$stateFile}
    }
    if($Mode -eq 'Baseline'){$state=New-QuickRunState}
    elseif(Test-Path $stateFile){$state=Get-Content $stateFile -Raw|ConvertFrom-Json;Require ($state.SchemaVersion -eq 1 -and $state.Role -eq $Role -and $state.RunId -and $state.Phase -in @('preflight','reboot','functional','complete','stopped','baseline')) 'Saved test state is not recognized.'}
    else {$state=New-QuickRunState}
} catch {
    Write-Host 'Saved test state cannot be resumed. No test actions were performed. Keep this file for Daniel; do not delete it or repeat time tests:'
    Write-Host $stateFile
    $lock.ReleaseMutex();$lock.Dispose();exit 1
}
function Update-QuickStateVersion {
    # A report describes the code that actually performed its checks. Never rename
    # a finished/interrupted employee run or silently replay its real time writes.
    if($state.KitVersion -ne '1.2.4' -and $state.Phase -in @('preflight','reboot')) {
        $previous=@($state.PreviousKitVersions|Where-Object {$null -ne $_})+@([pscustomobject]@{Version=$state.KitVersion;UpgradedUtc=[DateTimeOffset]::UtcNow.ToString('o');Phase=$state.Phase})
        $state|Add-Member -NotePropertyName PreviousKitVersions -NotePropertyValue $previous -Force
        $state.KitVersion='1.2.4'
        if($Role -eq 'gateway' -and $state.Phase -eq 'reboot') {
            # An older partially completed gateway check has not proved the new
            # persistent startup contract. Repair/check again, then require a new boot.
            $state.History+=[pscustomobject]@{Utc=[DateTimeOffset]::UtcNow.ToString('o');Checks=$state.Checks;PreviousBoot=$state.BootBefore}
            $state.Phase='preflight';$state.BootBefore=''
        }
    }
}
function Test-GatewayStartupReady {
    try {
        $task=Get-ScheduledTask -TaskName 'Mandala LAN Gateway' -ErrorAction Stop
        if($task.State -ne 'Running'){return $false}
        $config=Get-Content (Join-Path $env:ProgramData 'Mandala Gateway\gateway.json') -Raw|ConvertFrom-Json
        $adapter=@(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop|Where-Object {$_.IPAddress -eq $config.bindAddress})
        if($adapter.Count -ne 1){return $false}
        if(-not @(Get-NetConnectionProfile -InterfaceIndex $adapter[0].InterfaceIndex -ErrorAction SilentlyContinue).Count){return $false}
        return (Test-MandalaGatewayListener $task.Actions[0].WorkingDirectory (Join-Path $env:ProgramData 'Mandala Gateway') $config.bindAddress)
    } catch {return $false}
}
function Wait-GatewayStartup([int]$Seconds=180,[int]$PollMilliseconds=2000) {
    # Boot delay and address acquisition are expected. Observe only: never start
    # the task, wizard, or gateway process while testing automatic startup.
    $clock=[Diagnostics.Stopwatch]::StartNew();$attempts=0;$ready=$false
    do {
        $attempts++;$ready=Test-GatewayStartupReady
        if($ready){break}
        Write-Progress -Activity 'Checking automatic gateway startup' -Status 'Waiting for Windows startup and the office network (up to three minutes). No manual start is needed.'
        Start-Sleep -Milliseconds $PollMilliseconds
    } while($clock.Elapsed.TotalSeconds -lt $Seconds)
    $clock.Stop();Write-Progress -Activity 'Checking automatic gateway startup' -Completed
    $state|Add-Member -NotePropertyName GatewayStartupWait -NotePropertyValue ([pscustomobject]@{Ready=$ready;Attempts=$attempts;ElapsedSeconds=[Math]::Round($clock.Elapsed.TotalSeconds,1);ObservedUtc=[DateTimeOffset]::UtcNow.ToString('o')}) -Force
    # Full independent checks still run after a timeout and preserve every failure.
}
function Record-QuickGatewayOrigin {
    $fingerprint=if($script:checkedGatewayCertificateSha256){$script:checkedGatewayCertificateSha256}else{''}
    $state|Add-Member -NotePropertyName GatewayCertificateSha256 -NotePropertyValue $fingerprint -Force
    try {
        if($Role -eq 'gateway') {
            $config=Get-Content (Join-Path $env:ProgramData 'Mandala Gateway\gateway.json') -Raw|ConvertFrom-Json
            $origin=([Uri]('https://'+$config.bindAddress+':'+$config.port)).AbsoluteUri.TrimEnd('/')
        } else {
            $config=Get-Content (Join-Path $env:ProgramData 'Mandala Agent\lan.config.json') -Raw|ConvertFrom-Json
            $origin=([Uri]$config.gatewayUrl).AbsoluteUri.TrimEnd('/')
        }
        $state|Add-Member -NotePropertyName GatewayOrigin -NotePropertyValue $origin -Force
    } catch { $state|Add-Member -NotePropertyName GatewayOrigin -NotePropertyValue '' -Force }
}
function Record-AgentFailureSnapshot {
    # Capture actionable error codes and fixed UI states, never free-form text,
    # passwords, configuration values, or raw exception bodies.
    $snapshot=[ordered]@{CapturedUtc=[DateTimeOffset]::UtcNow.ToString('o');Available=$false}
    try {
        $active=Get-AgentText 'ActiveProjectText';$message=Get-AgentText 'TrackerMessageText'
        $snapshot.Available=$true
        $snapshot.ActiveState=if($active -eq 'No active project'){'none'}elseif($active -like 'Tracking *'){'tracking'}elseif($active -like 'Paused *'){'paused'}else{'unknown'}
        $snapshot.ErrorCodes=@([regex]::Matches($message,'\bAGENT-[A-Z0-9-]+-\d{3}\b')|ForEach-Object {$_.Value}|Select-Object -Unique)
        $snapshot.SaveState=if($message -like '*waiting for the LAN gateway*'){'pending'}elseif($message -like '*Time saved successfully*'){'confirmed'}else{'not shown'}
        $snapshot.StartEnabled=(Get-AgentControl 'StartWorkButton').Current.IsEnabled
    } catch { $snapshot.Collection='Agent UI unavailable; existing evidence preserved.' }
    $state|Add-Member -NotePropertyName AgentFailureSnapshot -NotePropertyValue ([pscustomobject]$snapshot) -Force
}
function Save-QuickReport {
    if($Role -eq 'gateway') {
        $evidence=[ordered]@{}
        try {$evidence.Task=Get-GatewayTaskEvidence} catch {$evidence.Task='Task evidence unavailable; other report evidence preserved.'}
        try {$evidence.NetworkProfiles=@(Get-NetConnectionProfile -ErrorAction Stop|Select-Object InterfaceAlias,InterfaceIndex,NetworkCategory)} catch {$evidence.NetworkProfiles='Network profile evidence unavailable; other report evidence preserved.'}
        try {
            $rules=@(Get-NetFirewallRule -DisplayName 'Mandala guided gateway HTTPS' -ErrorAction Stop)
            $evidence.Firewall=@($rules|ForEach-Object {[pscustomobject]@{Name=$_.Name;Enabled=[string]$_.Enabled;Profile=[string]$_.Profile;LocalAddress=@(($_|Get-NetFirewallAddressFilter).LocalAddress);RemoteAddress=@(($_|Get-NetFirewallAddressFilter).RemoteAddress);InterfaceAlias=@(($_|Get-NetFirewallInterfaceFilter).InterfaceAlias);Program=($_|Get-NetFirewallApplicationFilter).Program}})
        } catch {$evidence.Firewall='Could not read the named gateway firewall rule.'}
        $statusFile=Join-Path $env:ProgramData 'Mandala Gateway\startup-status\status.json'
        if(Test-Path $statusFile){try{$status=Get-Content $statusFile -Raw|ConvertFrom-Json;$evidence.Startup=$status|Select-Object schema,repairVersion,utc,phase,code,pid}catch{$evidence.Startup='Status unreadable'}}
        $state|Add-Member -NotePropertyName GatewayEvidence -NotePropertyValue ([pscustomobject]$evidence) -Force
    }
    try {$state.Events=@(Read-AgentEvents $log ([DateTimeOffset]$state.StartedUtc))}
    catch {$state|Add-Member -NotePropertyName AgentEventCollection -NotePropertyValue 'Agent log could not be read; previous events and all independent checks preserved.' -Force}
    if($Role -eq 'gateway') {
        try {$state|Add-Member -NotePropertyName GatewayRecoveryEvidence -NotePropertyValue (Get-GatewayRecoveryEvidence) -Force}
        catch {$state|Add-Member -NotePropertyName GatewayRecoveryEvidence -NotePropertyValue 'Additional diagnostics unavailable; primary checks preserved.' -Force}
    }
    $destination=if($script:publishDesktop){$desktopDirectory}else{''}
    $script:lastReport=Save-OfficeSnapshot $state $storage $destination

}
function Note-Action($Message) {
    Write-Host $Message
    $state.Actions+=[pscustomobject]@{Instruction=$Message;Utc=[DateTimeOffset]::UtcNow.ToString('o');Ist=(Get-IstTime);Source='automatic runner'}
    Save-QuickReport
}
function Ask-Yes($Message,[switch]$KeepTestActive) {
    Write-Host '';Write-Host $Message
    try {[Console]::Beep(750,250)}catch{Write-Verbose 'Audio notification unavailable; the written prompt remains active.'}
    if($KeepTestActive) {
        Write-Host 'Authorized test mouse activity continues for up to 10 minutes while you answer. Reply within 10 minutes; type no and Enter to stop. Holding Escape stops the activity; press Enter to save the report.'
        [MandalaTestInput]::BeginPromptActivity()
        try {$answer=Read-Host 'Type yes to confirm, or anything else to stop and save the report'}
        finally {$activityOk=[MandalaTestInput]::EndPromptActivity()}
        Require $activityOk 'Confirmation exceeded 10 minutes, Escape was held, or test input stopped reaching the unlocked desktop. Existing work and evidence are preserved.'
    } else {$answer=Read-Host 'Type yes to confirm, or anything else to stop and save the report'}
    $state.Actions+=[pscustomobject]@{Instruction=$Message;Utc=[DateTimeOffset]::UtcNow.ToString('o');Ist=(Get-IstTime);Answer=$answer;Source='tester'}
    Save-QuickReport
    Require ($answer -eq 'yes') 'Tester did not confirm. All available checks are in the report.'
}
function Show-Checks {foreach($c in $state.Checks){Write-Host ('['+$c.Status+'] '+$c.Id+': '+$c.Detail)};Save-QuickReport}
function Arm-Reboot {
    $launcher=Join-Path $PSScriptRoot 'Start Mandala.cmd'
    Require (Test-Path $launcher) 'Keep the complete extracted package in its folder.'
    Ask-Yes 'Save all other work. Restart this PC now? After signing into THIS SAME Windows account the test should reopen. If it does not, open Start Mandala and select this same role. Do not open Agent/setup manually.'
    # One-time launcher only, in this Windows account. Never replace Agent startup.
    $key='HKCU:\Software\Microsoft\Windows\CurrentVersion\RunOnce'
    New-Item $key -Force|Out-Null
    $command='"'+$env:WINDIR+'\System32\cmd.exe" /d /c start "" "'+$launcher+'" '+$Role+' Run'
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
    $scenario=[pscustomobject]@{Kind=$Kind;Status='INCOMPLETE';Detail='Automatic UI test started';StartedUtc=[DateTimeOffset]::UtcNow.ToString('o');FinishedUtc=$null;TimeZoneOffsetMinutes=[int][TimeZoneInfo]::Local.GetUtcOffset([DateTime]::Now).TotalMinutes;FinishedTimeZoneOffsetMinutes=$null;Observations=@();Receipts=@()}
    $state.Scenarios+=$scenario;Save-QuickReport
    $operationError=$null
    try {
        Note-Action ('Running '+$Kind+' test. Leave this desktop unlocked. Escape stops safely.')
        & $Body $scenario ([DateTimeOffset]$scenario.StartedUtc)
        $scenario.Receipts=@(Test-ScenarioEvidence @(Read-AgentEvents $log ([DateTimeOffset]$scenario.StartedUtc)) $Count $Kind)
        $scenario.Status='LOCAL PASS';$scenario.Detail='Actual Agent UI and save receipts checked; production rows still require verification.'
    } catch {$scenario.Status='FAIL';$scenario.Detail=$_.Exception.Message;$operationError=$_}
    finally {
        $scenario.FinishedUtc=[DateTimeOffset]::UtcNow.ToString('o');$scenario.FinishedTimeZoneOffsetMinutes=[int][TimeZoneInfo]::Local.GetUtcOffset([DateTime]::Now).TotalMinutes
        try {Save-QuickReport}
        catch {
            $state|Add-Member -NotePropertyName CheckpointErrors -NotePropertyValue (@($state.CheckpointErrors|Where-Object {$null -ne $_})+@([pscustomobject]@{Stage=('scenario:'+ $Kind);Code=$_.Exception.GetType().Name;Utc=[DateTimeOffset]::UtcNow.ToString('o')})) -Force
            if(-not $operationError){$operationError=$_}
        }
    }
    if($operationError){throw $operationError}
}
try {
    Write-Host ('MANDALA TIME TRACKING 1.2.4 - '+$Role.ToUpperInvariant())
    Write-Host 'One result set. No screenshots after each step. Keep the full extracted folder in place.'
    if($Mode -ne 'Baseline') {
        Require ($state.Computer -eq $env:COMPUTERNAME -and $state.WindowsUser -eq [Security.Principal.WindowsIdentity]::GetCurrent().Name) 'This saved run belongs to another PC or Windows account. No test actions will run; preserve the report for Daniel.'
    }
    if($Mode -eq 'Run' -and $state.Phase -eq 'baseline'){throw 'Baseline records cannot become time-writing runs.'}
    if($Mode -eq 'Export') {Write-Host 'Returning saved evidence only. No repairs or time tests will run.';return}
    if($Mode -eq 'Baseline') {
        # The saved functional run remains untouched; baseline gets its own record.
        $state=New-QuickRunState
        $stateFile=Join-Path $storage.Root ('baseline-'+$state.RunId+'.json')
        $storage.StateFile=$stateFile
        $state.Phase='baseline';$state.Result='NOT CLEARED - READ-ONLY BASELINE; FUNCTIONAL TESTS NOT RUN'
        if($Role -eq 'employee') {
            Require (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) 'Open the baseline in the original employee account without administrator elevation.'
            $state.Candidates=@(Get-MandalaAgentCandidates)
            $approved=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'approved-agent.json') -Raw|ConvertFrom-Json
            $state.Checks=@(Get-EmployeeChecks $state.Candidates $approved;Get-EmployeeRoutingCheck)
            $state|Add-Member -NotePropertyName EmployeeBaseline -NotePropertyValue (Get-EmployeeReadOnlyEvidence) -Force
        } else {$state.Checks=@(Get-GatewayChecks)}
        Record-QuickGatewayOrigin
        $state.Scenarios=@('stop','offline','switch','idle'|ForEach-Object {[pscustomobject]@{Kind=$_;Status='BLOCKED';Detail='Read-only baseline; no sign-in, repair or time writes attempted.'}})
        return
    }
    Update-QuickStateVersion
    Require (@($state.CheckpointErrors|Where-Object {$null -ne $_}).Count -eq 0) 'This run has a recorded checkpoint-storage failure. Return existing evidence for maintainer review; no repair, reboot or time tests were repeated.'
    $admin=([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if($state.Phase -eq 'functional') {
        foreach($item in $state.Scenarios){if($item.Status -eq 'INCOMPLETE'){$item.Status='FAIL';$item.Detail='Runner interrupted. No automatic replay; preserve the pending work.'}}
        foreach($kind in @('stop','offline','switch','idle')){if(-not @($state.Scenarios|Where-Object {$_.Kind -eq $kind}).Count){$state.Scenarios+=[pscustomobject]@{Kind=$kind;Status='BLOCKED';Detail='Runner interrupted; no automatic replay.'}}}
        $state.Phase='stopped';$state.Result='NOT CLEARED'
    }
    if($Role -eq 'gateway' -and $state.Phase -eq 'complete' -and $state.KitVersion -ne '1.2.4') {
        Require $admin 'Open the gateway launcher and approve administrator access to audit the updated startup repair.'
        Ask-Yes ('This gateway report was completed with kit '+$state.KitVersion+'. Preserve that report and run the updated gateway-only checks, repair if needed, and a fresh restart? No employee time tests run on this PC.')
        $archive=Join-Path $stateDir ('gateway-previous-'+[Guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory $archive|Out-Null
        Copy-Item -LiteralPath $stateFile -Destination (Join-Path $archive 'report.json')
        if(Test-Path ($reportDir+'.zip')){Copy-Item -LiteralPath ($reportDir+'.zip') -Destination (Join-Path $archive 'report.zip')}
        $previousRun=[pscustomobject]@{RunId=$state.RunId;KitVersion=$state.KitVersion;Archive=$archive}
        $state=New-QuickRunState
        $state|Add-Member -NotePropertyName PreviousGatewayRun -NotePropertyValue $previousRun -Force
        Save-QuickReport
    }
    if($state.Phase -in @('complete','stopped')){Write-Host ('This run has finished or stopped under kit '+$state.KitVersion+'. Returning that existing report; no new audit or time tests have run.');return}
    $state.Checks=@($state.Checks|Where-Object {$_.Id -ne 'test.quick-runner'})
    if($state.PrimaryError){$state|Add-Member -NotePropertyName PreviousErrors -NotePropertyValue (@($state.PreviousErrors|Where-Object {$null -ne $_})+@($state.PrimaryError)) -Force;$state.PSObject.Properties.Remove('PrimaryError')}
    if($Role -eq 'gateway') {
        Require $admin 'Open Start Mandala.cmd, select gateway, and approve the Windows administrator prompt.'
        $state.History+=[pscustomobject]@{Utc=[DateTimeOffset]::UtcNow.ToString('o');Checks=$state.Checks}
        if($state.Phase -eq 'reboot'){Check-NewBoot|Out-Null;Wait-GatewayStartup}
        $state.Checks=@(Get-GatewayChecks);Record-QuickGatewayOrigin;Show-Checks
        if($state.Phase -eq 'preflight' -and @($state.Checks|Where-Object {$_.Status -eq 'FAIL' -and $_.Id -in @('gateway.task','gateway.listener','gateway.firewall','gateway.startup-configuration')}).Count) {
            $approvedGateway=Get-Content (Join-Path $PSScriptRoot 'gateway-repair\approved-gateway.json') -Raw|ConvertFrom-Json
            $plan=Get-GatewayRepairPlan $approvedGateway
            Ask-Yes ('IT maintenance: confirm NO employee timers are active and this is the trusted office LAN. Repair the gateway task and Local Service read access, preserve certificates/enrollment, and allow ONLY its existing employee subnet ('+($plan.RemoteAddresses -join ', ')+') through '+$plan.InterfaceAlias+' / '+$plan.Address+':8443 on Public as well as Private/Domain profiles? Other firewall rules and the Windows network category stay unchanged.')
            try {$beforeRepairTask=Get-GatewayTaskEvidence} catch {$beforeRepairTask='Task evidence unavailable; independent checks preserved.'}
            $state.History+=[pscustomobject]@{Utc=[DateTimeOffset]::UtcNow.ToString('o');Checks=$state.Checks;TaskBefore=$beforeRepairTask};Save-QuickReport
            $state|Add-Member -NotePropertyName RecoveryStages -NotePropertyValue (@($state.RecoveryStages|Where-Object {$null -ne $_})+@([pscustomobject]@{Stage='repair-started';Utc=[DateTimeOffset]::UtcNow.ToString('o')})) -Force
            Save-QuickReport
            $script:repairCheckpointErrors=@()
            # Once the initial repair checkpoint is committed, a later disk failure
            # must not strand a half-applied configuration. Finish the prevalidated,
            # bounded repair in memory, then prohibit reboot/time tests until saved.
            $checkpoint={param($stage)
                $state.RecoveryStages+= [pscustomobject]@{Stage=$stage;Utc=[DateTimeOffset]::UtcNow.ToString('o')}
                try {Write-OfficeCheckpoint $state $stateFile}
                catch {$script:repairCheckpointErrors+= [pscustomobject]@{Stage=$stage;Code=$_.Exception.GetType().Name}}
            }
            $repair=Repair-ConfiguredGateway $plan (Join-Path $PSScriptRoot 'gateway-repair') $checkpoint
            if($script:repairCheckpointErrors.Count) {
                $state|Add-Member -NotePropertyName CheckpointErrors -NotePropertyValue $script:repairCheckpointErrors -Force
                $state|Add-Member -NotePropertyName GatewayRepair -NotePropertyValue $repair -Force
                throw 'Gateway configuration repair finished, but recovery storage failed during the operation. No reboot or employee tests were started. Preserve the report for maintainer review.'
            }
            $state|Add-Member -NotePropertyName GatewayRepair -NotePropertyValue $repair -Force
            $state.Checks=@(Get-GatewayChecks);Record-QuickGatewayOrigin;Show-Checks
        }
        if($state.Phase -eq 'preflight') {
            Ask-Yes 'IT: confirm this is the dedicated, awake gateway with reserved IP, no internet port forwarding, isolation from file servers/domain controllers, and employee direct internet blocked while gateway HTTPS is allowed.'
            $state.Checks+=New-CheckResult 'gateway.isolation' 'OBSERVED' 'IT confirmed dedicated gateway, reserved IP, network isolation and employee internet restriction.'
            Require (@($state.Checks|Where-Object {$_.Status -notin @('PASS','OBSERVED')}).Count -eq 0) 'Gateway checks did not pass. Return the current gateway report and employee baseline together as described in READ-FIRST.txt. Do not repeat repairs or run time tests.'
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
        $state.Phase='complete';$state.Result='GATEWAY LOCAL CHECKS PASSED - EMPLOYEE AND DATABASE VERIFICATION REQUIRED';$state|Add-Member -NotePropertyName CompletedUtc -NotePropertyValue ([DateTimeOffset]::UtcNow.ToString('o')) -Force;return
    }
    Require (-not $admin) 'Open the employee launcher normally in the employee Windows account, not as administrator.'
    . (Join-Path $PSScriptRoot 'ui-driver.ps1')
    [MandalaTestInput]::Awake($true)
    $approved=Get-Content (Join-Path $PSScriptRoot 'approved-agent.json') -Raw|ConvertFrom-Json
    if($state.Phase -eq 'preflight') {
        Ask-Yes 'Have the gateway repair and automatic restart checks passed in this office session? Employee time tests must wait until they do.'
        if(-not $state.Email){$state.Email=(Read-Host 'Employee Mandala email (never type a password here)').Trim()}
        $state.Candidates=@(Get-MandalaAgentCandidates)
        $state.Checks=@(Get-EmployeeChecks $state.Candidates $approved;Get-EmployeeRoutingCheck);Show-Checks
        if(-not (Select-MandalaAgent $state.Candidates)) {
            Ask-Yes 'No Agent was found in the checked locations. Install the included approved employee Agent 1.0.16? Windows administrator approval is required.'
            $installer=Join-Path $PSScriptRoot 'MandalaAgentSetup-1.0.16.exe'
            Require ((Get-Item $installer).Length -eq 51062706 -and (Get-FileHash $installer).Hash.ToLowerInvariant() -eq 'f517f48ace1638cea05471224938a660bb1def0d1ac17a794a16c2737d30dccb') 'Installer integrity check failed.'
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
        $state.Candidates=@(Get-MandalaAgentCandidates);$state.Checks=@(Get-EmployeeChecks $state.Candidates $approved;Get-EmployeeRoutingCheck)
        $state.Checks+=Invoke-OfficeCheck 'employee.signed-in-projects' {
            Require ((Get-AgentText 'SignedInAsText') -like ('Signed in as '+$state.Email+' *')) 'Signed-in employee differs from the supplied email.'
            $script:choices=@(Get-AgentProjects);Require ($script:choices.Count -ge 2) 'At least two allowed projects are required.'
            'Employee identity and two or more visible allowed projects confirmed through Agent UI.'
        }
        Show-Checks
        Require (@($state.Checks|Where-Object {$_.Status -ne 'PASS'}).Count -eq 0) 'Employee checks did not pass. Return the current reports together as described in READ-FIRST.txt. Independent checks are saved; do not repeat time tests or clear existing work.'
        Require ((Get-AgentText 'ActiveProjectText') -ceq 'No active project') 'Stop any existing real work yourself before testing. The checker will not stop it.'
        Wait-Ui 'previous pending work to finish before test authorization' {(Get-AgentControl 'StartWorkButton').Current.IsEnabled -and (Get-AgentText 'TrackerMessageText') -notlike '*waiting for the LAN gateway*'} 120|Out-Null
        for($i=0;$i -lt $choices.Count;$i++){Write-Host (($i+1).ToString()+': '+$choices[$i])}
        $a=0;$b=0
        Require ([int]::TryParse((Read-Host 'Number for agreed test project A'),[ref]$a) -and $a -ge 1 -and $a -le $choices.Count) 'Invalid project A selection.'
        Require ([int]::TryParse((Read-Host 'Number for different agreed test project B'),[ref]$b) -and $b -ge 1 -and $b -le $choices.Count -and $a -ne $b) 'Invalid project B selection.'
        $state.ProjectA=$choices[$a-1];$state.ProjectB=$choices[$b-1]
        Require ($state.ProjectA -cne $state.ProjectB) 'Use distinct project names so database verification is unambiguous.'
        Ask-Yes ('Authorize FIVE real test time entries under '+$state.Email+' using '+$state.ProjectA+' and '+$state.ProjectB+'? After restart this runner clicks only the verified Agent, generates test mouse activity including while you answer browser/disconnect prompts, and waits through idle/offline checks. Reserve this PC; keep it unlocked. Press Escape to abort during automatic work.')
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
    Wait-Ui 'signed-in tracker after reboot (sign in in Agent if requested)' {$c=Find-AgentControl 'ProjectComboBox';$c -and -not $c.Current.IsOffscreen} 600|Out-Null
    Require ((Get-AgentText 'SignedInAsText') -like ('Signed in as '+$state.Email+' *')) 'Employee identity changed after restart.'
    $state.History+=[pscustomobject]@{Utc=[DateTimeOffset]::UtcNow.ToString('o');Checks=$state.Checks}
    $state.Candidates=@(Get-MandalaAgentCandidates);$state.Checks=@(Get-EmployeeChecks $state.Candidates $approved;Get-EmployeeRoutingCheck)
    $state.Checks+=Invoke-OfficeCheck 'employee.signed-in-projects' {
        Require ((Get-AgentText 'SignedInAsText') -like ('Signed in as '+$state.Email+' *')) 'Employee identity changed after restart.'
        $available=@(Get-AgentProjects)
        Require (@($available|Where-Object {$_ -ceq $state.ProjectA}).Count -eq 1 -and @($available|Where-Object {$_ -ceq $state.ProjectB}).Count -eq 1) 'Agreed projects changed or are no longer unambiguous after restart.'
        'Same employee and both agreed projects confirmed after restart.'
    }
    $state.Checks+=New-CheckResult 'employee.reboot-observed' 'PASS' 'Different boot; exactly one approved Agent already running; tester confirms automatic launch.'
    Record-QuickGatewayOrigin;Show-Checks
    Require (@($state.Checks|Where-Object {$_.Status -ne 'PASS'}).Count -eq 0) 'A required post-restart prerequisite failed. Fresh independent checks are saved; no time tests started.'
    $state|Add-Member -NotePropertyName GatewayVerifiedUtc -NotePropertyValue ([DateTimeOffset]::UtcNow.ToString('o')) -Force
    Require ((Get-AgentText 'ActiveProjectText') -ceq 'No active project') 'Existing work was found after restart. Stop it yourself; no test session has started.'
    Wait-Ui 'previous pending work to finish before time testing' {(Get-AgentControl 'StartWorkButton').Current.IsEnabled -and (Get-AgentText 'TrackerMessageText') -notlike '*waiting for the LAN gateway*'} 120|Out-Null
    Require ($state.Scenarios.Count -eq 0) 'Prior time tests exist. They will not be repeated.'
    $state.Phase='functional';Save-QuickReport
    Run-AutomatedCase 'stop' 1 {
        param($s,$since)
        Start-AgentProject $state.ProjectA;Wait-TestActivity
        Ask-Yes ('On an internet-connected browser, sign in as this SAME employee. View '+$state.ProjectB+' and try Start Work. Confirm viewing did not switch the timer AND starting could not take over the desktop session. Leave the browser timer stopped. Did both checks pass?') -KeepTestActive
        Wait-AgentState ('Tracking '+$state.ProjectA)
        Add-Observation $s 'Browser view did not switch project and browser takeover was refused' 'tester confirmation plus Agent state'
        Invoke-AgentButton 'StopButton';Wait-AgentState 'No active project';Wait-Receipts $since 1
        Add-Observation $s 'Start/stop saved with receipt and no active project'
    }
    Run-AutomatedCase 'offline' 1 {
        param($s,$since)
        Start-AgentProject $state.ProjectA;Wait-TestActivity
        Ask-Yes 'Disconnect ONLY this employee PC from the LAN now (unplug its network cable or use your IT-approved method). Leave the gateway running. Confirm disconnected. The test will call you back when ready to reconnect.' -KeepTestActive
        Require (-not (Test-GatewayReachable)) 'Gateway is still reachable. Offline test was not established.'
        Wait-TestActivity
        Require (-not (Test-GatewayReachable)) 'Network returned before the offline stop.'
        Invoke-AgentButton 'StopButton';Wait-AgentState 'No active project' 90
        Wait-AgentText 'TrackerMessageText' {param($text) $text -like '*Time saved on this computer; waiting for the LAN gateway*'} 90 'durable pending-save message'
        Require (@(Read-Receipts $since).Count -eq 0) 'Agent reported a server receipt while offline.'
        Add-Observation $s 'Offline stop showed pending, not cloud-saved'
        Invoke-AgentButton 'CopyDiagnosticsButton'
        Close-TestAgent
        Start-Process -FilePath $script:AgentPath -WorkingDirectory (Split-Path $script:AgentPath)|Out-Null;Start-Sleep -Seconds 2;Attach-TestAgent
        Wait-AgentText 'TrackerMessageText' {param($text) $text -like '*Time saved on this computer; waiting for the LAN gateway*'} 120 'pending work restored after offline app restart'
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
    $state|Add-Member -NotePropertyName CompletedUtc -NotePropertyValue ([DateTimeOffset]::UtcNow.ToString('o')) -Force
    Note-Action 'Finished. Send the employee and gateway report ZIPs together. No screenshots needed.'
} catch {
    if($Role -eq 'employee' -and $script:AgentProcessId){Record-AgentFailureSnapshot}
    if($state.Phase -eq 'functional') {
        foreach($kind in @('stop','offline','switch','idle')){if(-not @($state.Scenarios|Where-Object {$_.Kind -eq $kind}).Count){$state.Scenarios+=[pscustomobject]@{Kind=$kind;Status='BLOCKED';Detail='Earlier check failed; further time writes stopped.'}}}
        $state.Phase='stopped'
    }
    $state.Result='NOT CLEARED'
    if($script:repairCheckpointErrors){$state|Add-Member -NotePropertyName CheckpointErrors -NotePropertyValue $script:repairCheckpointErrors -Force}
    $state|Add-Member -NotePropertyName PrimaryError -NotePropertyValue ([pscustomobject]@{Code=$_.Exception.GetType().Name;Detail=$_.Exception.Message;Utc=[DateTimeOffset]::UtcNow.ToString('o')}) -Force
    # Transient prerequisites may be corrected without repeating a time-writing run.
    $state.Checks=@($state.Checks|Where-Object {$_.Id -ne 'test.quick-runner'})+@(New-CheckResult 'test.quick-runner' 'BLOCKED' $_.Exception.Message)
    Write-Host ('TEST NEEDS ATTENTION: '+$_.Exception.Message)
    Write-Host 'Reconnect LAN if disconnected. Preserve any active/pending Agent work. Return the report; do not repeat time tests.'
} finally {
    $exported=$false
    $script:publishDesktop=$true
    try {Save-QuickReport;$exported=$true} catch {
        Write-Host 'Report export needs attention. Do not repeat time tests. Send the preserved state file and report folder below; any existing ZIP may be from an earlier checkpoint:'
        Write-Host $stateFile;Write-Host $reportDir
    }
    Write-Progress -Activity 'Automatic Mandala timer check' -Completed
    Write-Progress -Activity 'Automatic Mandala idle check' -Completed
    if('MandalaTestInput' -as [type]){[void][MandalaTestInput]::EndPromptActivity();[MandalaTestInput]::Awake($false)}
    if($exported) {
        $current=if($script:lastReport.DesktopBundle){$script:lastReport.DesktopBundle}elseif($script:lastReport.LocalBundle){$script:lastReport.LocalBundle}else{$stateFile}
        Write-Host ('CURRENT RESULT: '+$state.Result)
        Write-Host ('SEND THIS CURRENT REPORT: '+$current)
        Write-Host ('Snapshot UTC: '+$state.SavedUtc+' | Run: '+$state.RunId)
    }
    $lock.ReleaseMutex();$lock.Dispose()
}
