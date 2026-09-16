param([ValidateSet('Menu','Preflight','Gateway','Reboot','Functional','Export','Install','Repair')][string]$Mode='Menu')
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'startup-repair\startup-core.ps1')
. (Join-Path $PSScriptRoot 'check-core.ps1')
$stateDir=Join-Path $env:LOCALAPPDATA 'Mandala Office Test'
New-Item -ItemType Directory -Path $stateDir -Force|Out-Null
$role=if($Mode -eq 'Gateway'){'gateway'}else{'employee'}
$statePath=Join-Path $stateDir ($role+'.json')
if($Mode -eq 'Menu') {
    Write-Host 'MANDALA COMPLETE OFFICE TEST 1.1.0'
    Write-Host '1 Employee preflight (collects ALL checks even if one fails)'
    Write-Host '2 Gateway check (IT: use an administrator window on gateway PC)'
    Write-Host '3 Employee check after restarting Windows (before opening Agent manually)'
    Write-Host '4 Guided employee time tests (after preflight and restart pass)'
    Write-Host '5 Export employee report without more testing'
    Write-Host '6 Install missing employee agent (approved installer included)'
    Write-Host '7 Repair employee automatic startup'
    $choice=Read-Host 'Choose 1-7'
    $modes=@{'1'='Preflight';'2'='Gateway';'3'='Reboot';'4'='Functional';'5'='Export';'6'='Install';'7'='Repair'}
    if(-not $modes.ContainsKey($choice)){throw 'Choose a listed option.'}
    & $PSCommandPath -Mode $modes[$choice]
    exit $LASTEXITCODE
}
if(Test-Path $statePath) {$state=Get-Content $statePath -Raw|ConvertFrom-Json}
else {$state=[pscustomobject]@{SchemaVersion=1;KitVersion='1.1.0';RunId=[Guid]::NewGuid().ToString();Role=$role;Computer=$env:COMPUTERNAME;WindowsUser=[Security.Principal.WindowsIdentity]::GetCurrent().Name;Environment=[pscustomobject]@{OS=[Environment]::OSVersion.VersionString;OS64=[Environment]::Is64BitOperatingSystem;Process64=[Environment]::Is64BitProcess;PowerShell=$PSVersionTable.PSVersion.ToString();TimeZone=[TimeZoneInfo]::Local.Id};StartedUtc=[DateTimeOffset]::UtcNow.ToString('o');Email='';ProjectA='';ProjectB='';BootBefore='';Candidates=@();Checks=@();History=@();Actions=@();Scenarios=@();Events=@();DatabaseVerification='PENDING - read-only server verification is required';Result='NOT CLEARED'}}
$reportDir=Join-Path ([Environment]::GetFolderPath('DesktopDirectory')) ('Mandala-Test-'+$env:COMPUTERNAME+'-'+$role)
New-Item -ItemType Directory -Path $reportDir -Force|Out-Null
$agentLog=Join-Path $env:LOCALAPPDATA 'Mandala Agent\agent.log'
function Save-Report {
    $state.Events=@(Read-AgentEvents $agentLog ([DateTimeOffset]$state.StartedUtc))
    $json=$state|ConvertTo-Json -Depth 15
    [IO.File]::WriteAllText($statePath,$json,(New-Object Text.UTF8Encoding($false)))
    [IO.File]::WriteAllText((Join-Path $reportDir 'report.json'),$json,(New-Object Text.UTF8Encoding($false)))
    $lines=@('MANDALA TEST REPORT - NOT A ROLLOUT APPROVAL',('Computer: '+$state.Computer),('Windows user: '+$state.WindowsUser),('Role: '+$role),('Saved: '+(Get-IstTime)),('Database: '+$state.DatabaseVerification),'')
    foreach($check in @($state.Checks)){$lines+=('['+$check.Status+'] '+$check.Id+': '+$check.Detail)}
    foreach($scenario in @($state.Scenarios)){$lines+=('['+$scenario.Status+'] time test '+$scenario.Kind+': '+$scenario.Detail)}
    $lines+=@('','Attach the whole report ZIP, not screenshots. No credentials, certificates, tokens or raw journals are included.','All FAIL/BLOCKED/PENDING items must be resolved before pilot approval.')
    $lines|Set-Content -LiteralPath (Join-Path $reportDir 'SUMMARY.txt') -Encoding UTF8
}
function Export-Report {
    Save-Report
    $zip=$reportDir+'.zip'
    Compress-Archive -Path (Join-Path $reportDir '*') -DestinationPath $zip -Force
    Write-Host ('REPORT SAVED: '+$zip)
}
function Record-Action($Text) {
    Write-Host '';Write-Host $Text
    $answer=Read-Host 'Press Enter when ready/done, or type stop to preserve the report'
    $state.Actions+= [pscustomobject]@{Instruction=$Text;Utc=[DateTimeOffset]::UtcNow.ToString('o');Ist=(Get-IstTime);Answer=$answer}
    Save-Report
    Require ($answer -ne 'stop') 'Stopped by tester. Report preserved; do not repeat a session with a missing save.'
}
function Require-EmployeeContext {
    Require (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) 'Open the employee test normally, not as administrator. Only the installer/shared-shortcut repair requests elevation.'
}
try {
    $approved=Get-Content (Join-Path $PSScriptRoot 'approved-agent.json') -Raw|ConvertFrom-Json
    if($Mode -eq 'Install') {
        Require-EmployeeContext
        Require (@(Get-Process -Name 'Mandala.Agent' -ErrorAction SilentlyContinue).Count -eq 0) 'Save active work and close Mandala Agent before installation.'
        $existing=Get-MandalaAgentPath
        Require (-not $existing) 'An agent was found. Run preflight/startup repair; this option will not reinstall or downgrade it.'
        $installer=Join-Path $PSScriptRoot 'MandalaAgentSetup-1.0.15.exe'
        Require ((Get-Item $installer).Length -eq 51056706 -and (Get-FileHash $installer -Algorithm SHA256).Hash.ToLowerInvariant() -eq 'acf56fe97faa161e710330e1e14652be4d31f8475c8738234ff86d10c2a660ed') 'Bundled installer integrity check failed.'
        Write-Host 'Windows administrator approval is required. Install Mandala Agent 1.0.15 on this employee PC. The gateway is a different app.'
        $result=Start-Process $installer -ArgumentList '/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART' -Verb RunAs -Wait -PassThru
        Require ($result.ExitCode -eq 0) 'Installation did not complete.'
        Write-Host 'Now open Mandala Agent normally in the employee account. Run preflight again in this same test session. Missing LAN pairing must be completed with the existing employee pairing ZIP.'
    } elseif($Mode -eq 'Repair') {
        Require-EmployeeContext
        $repair=Join-Path $PSScriptRoot 'startup-repair\repair-startup.ps1'
        & powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File $repair
        Require ($LASTEXITCODE -eq 0) 'Startup repair needs attention. Run preflight so the full installation/connection report is captured.'
        Write-Host 'Run employee preflight again, then follow the restart check.'
    } elseif($Mode -eq 'Preflight') {
        if(-not $state.Email){$state.Email=(Read-Host 'Employee Mandala sign-in email (never enter a password)').Trim()}
        $state.History+= [pscustomobject]@{Utc=[DateTimeOffset]::UtcNow.ToString('o');Checks=$state.Checks}
        $state.Checks=@();$state.Candidates=@(Get-MandalaAgentCandidates)
        $state.BootBefore=(Get-CimInstance Win32_OperatingSystem).LastBootUpTime.ToUniversalTime().ToString('o')
        foreach($check in @(Get-EmployeeChecks $state.Candidates $approved)) {
            $state.Checks+=$check;Write-Host ('['+$check.Status+'] '+$check.Id+': '+$check.Detail);Save-Report
        }
        $state.Checks+=Invoke-OfficeCheck 'employee.signed-in-projects' {
            $recent=@(Read-AgentEvents $agentLog ([DateTimeOffset]::UtcNow.AddMinutes(-5)) | Where-Object {$_.Event -eq 'tracker-loaded'})
            Require ($recent.Count -gt 0) 'No recent project-list evidence. Open Agent normally, sign in and run preflight again.'
            $last=$recent[-1]
            Require ($last.Email -eq $state.Email) 'Agent sign-in email differs from the test employee.'
            Require ($last.ProjectCount -ge 2) 'At least two allowed projects are needed for the switch test.'
            'Recent employee identity and project-list evidence found; saved-time tests remain required.'
        }
        Write-Host 'Preflight complete. Follow the included checklist for any failed items in this same session. When all pass, save work, restart Windows, then run option 3 WITHOUT opening Agent manually.'
    } elseif($Mode -eq 'Gateway') {
        $state.Checks=@(Get-GatewayChecks)
        $boot=(Get-CimInstance Win32_OperatingSystem).LastBootUpTime.ToUniversalTime().ToString('o')
        if($state.BootBefore) {
            $state.Checks+=Invoke-OfficeCheck 'gateway.reboot-observed' {
                Require ($boot -ne $state.BootBefore) 'Gateway has not restarted since its first test snapshot.'
                Require ((Read-Host 'Did the gateway task run after restart WITHOUT opening setup or starting it manually? yes/no') -eq 'yes') 'Automatic gateway startup not confirmed.'
                'Different boot plus IT observation; see task/listener checks.'
            }
        } else {
            $state.BootBefore=$boot
            $state.Checks+=New-CheckResult 'gateway.reboot-observed' 'PENDING' 'When no employee timers are active, restart gateway and run this check again before starting the task manually.'
        }
        foreach($item in @(@('gateway.isolation','Dedicated gateway, reserved IP, kept awake, no internet port forwarding, and office firewall blocks gateway access to file servers/domain controllers'),@('gateway.employee-internet-blocked','IT confirms the employee test PC has direct internet blocked while retaining access to gateway HTTPS'))) {
            $answer=Read-Host ($item[1]+'? yes/no/not checked')
            $status=if($answer -eq 'yes'){'OBSERVED'}else{'BLOCKED'}
            $state.Checks+=New-CheckResult $item[0] $status ('IT response: '+$answer)
        }
    } elseif($Mode -eq 'Reboot') {
        Require-EmployeeContext
        $result=Invoke-OfficeCheck 'employee.reboot-observed' {
            Require $state.BootBefore 'Run preflight before the restart test.'
            $boot=(Get-CimInstance Win32_OperatingSystem).LastBootUpTime.ToUniversalTime()
            Require ($boot.ToString('o') -ne $state.BootBefore) 'Windows has not rebooted since preflight.'
            $running=@(Get-Process -Name 'Mandala.Agent' -ErrorAction SilentlyContinue | Where-Object {$_.SessionId -eq (Get-Process -Id $PID).SessionId -and $_.StartTime.ToUniversalTime() -ge $boot})
            Require ($running.Count -eq 1) "Expected one agent after login; found $($running.Count). Do not open it manually before recording this result."
            Require ((Read-Host 'Did Mandala Agent open by itself without opening the app, setup, or gateway button? yes/no') -eq 'yes') 'Automatic employee startup not confirmed.'
            'Different Windows boot; one agent already running; employee confirms automatic launch.'
        }
        $state.Checks=@($state.Checks|Where-Object {$_.Id -ne 'employee.reboot-observed'})+@($result)
    } elseif($Mode -eq 'Functional') {
        Require-EmployeeContext
        Require (@($state.Checks|Where-Object {$_.Id -eq 'employee.reboot-observed' -and $_.Status -eq 'PASS'}).Count -eq 1) 'Complete and pass the real reboot test first.'
        Require (@($state.Checks|Where-Object {$_.Status -ne 'PASS'}).Count -eq 0) 'Resolve all preflight failures before writing test time.'
        Require ($state.Scenarios.Count -eq 0) 'Time tests have already been attempted in this report. Export the report; do not repeat sessions with uncertain saves.'
        $state.ProjectA=(Read-Host 'Exact project A name').Trim();$state.ProjectB=(Read-Host 'Exact project B name').Trim()
        Require ($state.ProjectA -and $state.ProjectB -and $state.ProjectA -ne $state.ProjectB) 'Two different allowed project names are required.'
        $cases=@(
            @{Kind='stop';Count=1;Steps=@('Select project A, click Start Work, and actively work for at least TWO minutes. Keep this session running.','On an internet-connected test browser, the SAME employee signs into Mandala themselves. Open project B: this must not change the active project. Attempt Start Work on B: the desktop-owned session must prevent takeover. Return to the employee Agent; A must still be active. Do not share passwords with IT or enter them in this test program.','In the employee Agent click Stop ONCE. Wait for the saved reference.');Observations=@('Viewing another project did not switch the timer','The browser could not take over the desktop-owned session','Project A started and stopped; a saved reference is visible')},
            @{Kind='switch';Count=2;Steps=@('Start project A and work for TWO minutes. Select project B, CANCEL the switch once, and confirm A stays active. Then select B again and CONFIRM. Wait for the saved reference for A.','Work on project B for TWO minutes, click Stop ONCE, and wait for its saved reference.');Observations=@('Cancel kept A active; confirming switched to B','Both saved references appeared for the correct projects')},
            @{Kind='idle';Count=1;Steps=@('Start project A and work for TWO minutes. Leave keyboard and mouse untouched for SIX minutes, including this test window. Return only after that. Confirm the agent paused and saved. Do NOT start again.');Observations=@('Idle pause occurred and returning to the computer did not restart the timer')},
            @{Kind='offline';Count=1;Steps=@('Start project A while connected and work for TWO minutes. Prepare to disconnect only this employee PC from the LAN using the IT-approved method. Press Enter immediately BEFORE disconnecting.','Disconnect now. Work for TWO more minutes, then click Stop ONCE while offline. Confirm it says saved on this computer / waiting for upload, not cloud-saved.','Before reconnecting, use Save / copy diagnostics for IT. Close and reopen ONLY Mandala Agent in this same Windows account. Keep the PC offline; pending work must still be shown. Try Start Work once: a new session must not start while the prior save is pending. Press Enter immediately BEFORE reconnecting.','Reconnect now. Wait up to TWO minutes for one saved reference. Do not click Stop again.');Observations=@('Offline stop remained pending and did not claim a cloud save','Pending work survived closing/reopening the agent','A new start was blocked while offline/pending','Reconnect produced one saved reference and cleared the pending state')}
        )
        $blocked=$false
        foreach($case in $cases) {
            if($blocked){$state.Scenarios+=[pscustomobject]@{Kind=$case.Kind;Status='BLOCKED';Detail='Earlier save/behavior check failed. Further time writes stopped.'};continue}
            $started=[DateTimeOffset]::UtcNow
            $scenario=[pscustomobject]@{Kind=$case.Kind;Status='INCOMPLETE';Detail='Test started';StartedUtc=$started.ToString('o');FinishedUtc=$null;Observations=@();Receipts=@()}
            $state.Scenarios+= $scenario;Save-Report
            try {
                foreach($instruction in $case.Steps){Record-Action $instruction}
                foreach($observation in $case.Observations){$answer=Read-Host ($observation+'? yes/no');$scenario.Observations+=[pscustomobject]@{Check=$observation;Answer=$answer;Ist=(Get-IstTime)};Require ($answer -eq 'yes') ('Behavior check failed: '+$observation)}
                $events=@(Read-AgentEvents $agentLog $started)
                $scenario.Receipts=@(Test-ScenarioEvidence $events $case.Count $case.Kind)
                $scenario.Status='LOCAL PASS';$scenario.Detail='Observed behavior and agent receipts passed; production rows still require verification.'
            } catch {$scenario.Status='FAIL';$scenario.Detail=$_.Exception.Message;$blocked=$true}
            $scenario.FinishedUtc=[DateTimeOffset]::UtcNow.ToString('o');Save-Report
        }
        Write-Host 'Time tests finished. Save/copy diagnostics in Agent if any test failed. Export this report once; production row verification is still required.'
    }
} catch {
    $state.Checks+=New-CheckResult ('test.'+$Mode) 'BLOCKED' $_.Exception.Message
    Write-Host ('TEST NEEDS ATTENTION: '+$_.Exception.Message)
} finally { Export-Report }
