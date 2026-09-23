$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '..\scripts\office-test\check-core.ps1')
. (Join-Path $PSScriptRoot '..\scripts\office-test\ui-driver.ps1')
function Assert($Condition,$Message){if(-not $Condition){throw $Message}}
$fixture=Join-Path $PSScriptRoot 'ui-fixture.ps1'
$p=Start-Process powershell.exe -ArgumentList '-NoProfile','-STA','-File',('"'+$fixture+'"') -PassThru
try {
 $script:AgentPath=$p.Path;$script:AgentProcessId=$p.Id
 Wait-Ui 'fixture window' {try{Get-AgentRoot}catch{$null}} 30|Out-Null
 Assert ($null -eq (Find-AgentControl 'DelayedStatusText')) 'Delayed fixture control unexpectedly exists before its restore step.'
 Invoke-AgentButton 'ShowDelayedStatusButton'
 Wait-AgentText 'DelayedStatusText' {param($text) $text -ceq 'Pending fixture work restored'} 10 'delayed tracker control appears after window'
 $failed=$false;try{Wait-AgentText 'NeverPresentText' {param($text) $true} 1}catch{$failed=$true};Assert $failed 'Missing text control wait was not bounded.'
 $verifiedPath=$script:AgentPath
 try {$script:AgentPath='unexpected-process-path';$failed=$false;try{Wait-AgentText 'DelayedStatusText' {param($text) $true} 10}catch{$failed=$_.Exception.Message -like '*identity changed*'};Assert $failed 'Text readiness wait swallowed a process identity failure.'}finally{$script:AgentPath=$verifiedPath}
 Assert ((Get-AgentText 'ActiveProjectText') -eq 'No active project') 'Initial fixture state not found.'
 $projects=@(Get-AgentProjects);Assert ($projects.Count -eq 2 -and $projects[0] -eq 'A' -and $projects[1] -eq 'B') 'Accessible project enumeration failed.'
 Start-AgentProject 'A'
 Select-AgentProject 'B';Wait-AgentState 'Tracking A'
 $click=Invoke-AgentButton 'StartWorkButton' -Async;Confirm-AgentSwitch $false
 Wait-Ui 'cancelled invoke' {$click.IsCompleted} 15|Out-Null;$click.GetAwaiter().GetResult();Wait-AgentState 'Tracking A'
 $click=Invoke-AgentButton 'StartWorkButton' -Async;Confirm-AgentSwitch $true
 Wait-Ui 'confirmed invoke' {$click.IsCompleted} 15|Out-Null;$click.GetAwaiter().GetResult();Wait-AgentState 'Tracking B'
 Wait-TestActivity 1
 Invoke-AgentButton 'StopButton';Wait-AgentState 'No active project'
 Assert ((Get-AgentText 'TrackerMessageText') -like '*saved successfully*') 'Confirmation text unavailable.'
 $failed=$false;try{Select-AgentProject 'missing'}catch{$failed=$true};Assert $failed 'Unknown project accepted.'
 $failed=$false;try{Wait-Ui 'deliberate timeout' {$false} 1}catch{$failed=$true};Assert $failed 'Timeout did not stop automation.'
 $beforePrompt=[MandalaTestInput]::LastInput()
 [MandalaTestInput]::BeginPromptActivity()
 try {Start-Sleep -Milliseconds 800;Assert ([MandalaTestInput]::PromptActivityActive -and [MandalaTestInput]::LastInput() -ne $beforePrompt) 'Active prompt did not keep the authorized test input alive.'}
 finally {$promptOk=[MandalaTestInput]::EndPromptActivity()}
 Assert ($promptOk -and -not [MandalaTestInput]::PromptActivityActive) 'Prompt activity did not stop cleanly before the idle test.'
 [MandalaTestInput]::BeginPromptActivity(500)
 try {Start-Sleep -Milliseconds 5400} finally {$expiredOk=[MandalaTestInput]::EndPromptActivity()}
 Assert (-not $expiredOk -and -not [MandalaTestInput]::PromptActivityActive) 'Unanswered prompt could generate indefinite test activity.'
 Close-TestAgent
 Write-Host 'PASS: real WPF accessibility: project selection, start/stop, asynchronous modal cancel/confirm, status text, missing project, bounded wait, normal close.'
} finally {if(-not $p.HasExited){$p.Kill()}}
# Extract the actual report/state functions without executing workstation actions.
$file=Join-Path $PSScriptRoot '..\scripts\office-test\quick-test.ps1'
$tokens=$null;$errors=$null;$ast=[Management.Automation.Language.Parser]::ParseFile($file,[ref]$tokens,[ref]$errors)
Assert ($errors.Count -eq 0) 'Quick runner syntax errors.'
foreach($name in @('Run-AutomatedCase','Add-Observation')) {
 $node=$ast.Find({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $name},$true)
 Invoke-Expression $node.Extent.Text
}
function Save-QuickReport {}
function Note-Action($Message){}
function Read-AgentEvents { @([pscustomobject]@{Event='lan-time-confirmed';SessionId='11111111-1111-1111-1111-111111111111';EntryId='22222222-2222-2222-2222-222222222222'}) }
$state=[pscustomobject]@{Scenarios=@()};$log='fixture'
Run-AutomatedCase 'stop' 1 {param($s,$since) Add-Observation $s 'fixture observed'}
Assert ($state.Scenarios[0].Status -eq 'LOCAL PASS' -and $state.Scenarios[0].FinishedUtc) 'Successful case did not persist complete evidence.'
$failed=$false;try {Run-AutomatedCase 'switch' 2 {throw 'simulated UI failure'}}catch{$failed=$true}
Assert ($failed -and $state.Scenarios[1].Status -eq 'FAIL' -and $state.Scenarios[1].FinishedUtc) 'Failed case did not persist evidence and propagate stop.'
Write-Host 'PASS: actual scenario orchestrator saves pass/failure evidence and propagates failures without repeating writes.'
# Run the actual entry point against an interrupted state: it must export only,
# never continue time writes or change the real user's persistent test state.
$isolated=Join-Path $env:RUNNER_TEMP ('Quick Interrupted '+[Guid]::NewGuid())
$folder=Join-Path $isolated 'Mandala Office Test 1.2.0'
New-Item -ItemType Directory $folder -Force|Out-Null
$computer='MANDALA-CI-'+[Guid]::NewGuid().ToString('N').Substring(0,8)
$reportDir=Join-Path ([Environment]::GetFolderPath('DesktopDirectory')) ('Mandala-Quick-Test-'+$computer+'-employee')
$state=[pscustomobject]@{SchemaVersion=1;KitVersion='1.2.0';RunId=[Guid]::NewGuid().ToString();Role='employee';Computer=$computer;WindowsUser=[Security.Principal.WindowsIdentity]::GetCurrent().Name;StartedUtc=[DateTimeOffset]::UtcNow.ToString('o');Phase='functional';Email='fixture@example.test';ProjectA='A';ProjectB='B';BootBefore='';Candidates=@();Checks=@();History=@();Actions=@();Scenarios=@([pscustomobject]@{Kind='stop';Status='INCOMPLETE';Detail='Interrupted'});Events=@();DatabaseVerification='PENDING';Result='NOT CLEARED'}
$state|ConvertTo-Json -Depth 15|Set-Content (Join-Path $folder 'employee.json')
# The staged startup core is needed by the entry point, as in the actual kit.
$kit=Split-Path $file
$coreTarget=Join-Path $kit 'startup-repair'
if(-not(Test-Path $coreTarget)){Copy-Item (Join-Path $PSScriptRoot '..\scripts\startup-repair') $kit -Recurse}
try {
 $savedLocal=$env:LOCALAPPDATA;$savedComputer=$env:COMPUTERNAME
 $env:LOCALAPPDATA=$isolated;$env:COMPUTERNAME=$computer
 & powershell.exe -NoProfile -STA -ExecutionPolicy RemoteSigned -File $file -Role employee
 Assert ($LASTEXITCODE -eq 0) 'Interrupted main entry point failed to export.'
 $newFolder=Join-Path (Join-Path $isolated 'Mandala Office Recovery') ([Security.Principal.WindowsIdentity]::GetCurrent().User.Value)
 $restored=Get-Content (Join-Path $newFolder 'employee.json') -Raw|ConvertFrom-Json
 Assert ($restored.KitVersion -eq '1.2.0') 'Interrupted historical report was silently relabeled.'
 Assert ($restored.Phase -eq 'stopped' -and $restored.Result -eq 'NOT CLEARED') 'Interrupted run was not blocked.'
 Assert ($restored.Scenarios.Count -eq 4 -and $restored.Scenarios[0].Status -eq 'FAIL') 'Interrupted/remaining tests not recorded.'
 Assert (@(Get-ChildItem -LiteralPath (Join-Path $newFolder 'reports') -Filter '*.zip').Count -gt 0) 'Interrupted report ZIP missing.'
 $restored.KitVersion='1.2.4';$restored.Phase='preflight';$restored.WindowsUser='another-account';$restored.Scenarios=@();$restored.Checks=@()
 $restored|ConvertTo-Json -Depth 15|Set-Content (Join-Path $newFolder 'employee.json')
 & powershell.exe -NoProfile -STA -ExecutionPolicy RemoteSigned -File $file -Role employee
 $wrongAccount=Get-Content (Join-Path $newFolder 'employee.json') -Raw|ConvertFrom-Json
 Assert ($wrongAccount.Scenarios.Count -eq 0 -and @($wrongAccount.Checks|Where-Object {$_.Detail -like '*another PC or Windows account*'}).Count -eq 1) 'Copied state ran actions in the wrong Windows account.'
 $corrupt='{ deliberately invalid state';$corrupt|Set-Content (Join-Path $newFolder 'employee.json')
 & powershell.exe -NoProfile -STA -ExecutionPolicy RemoteSigned -File $file -Role employee
 Assert ($LASTEXITCODE -eq 1 -and (Get-Content (Join-Path $newFolder 'employee.json') -Raw).Trim() -eq $corrupt) 'Corrupt saved state was overwritten or silently restarted.'
 Write-Host 'PASS: actual quick launcher preserves interruption, blocks repeated writes/copied state, exports evidence, and keeps corrupted state intact.'
} finally {
 $env:LOCALAPPDATA=$savedLocal;$env:COMPUTERNAME=$savedComputer
 Remove-Item $isolated -Recurse -Force
 Remove-Item $reportDir -Recurse -Force -ErrorAction SilentlyContinue
 Remove-Item ($reportDir+'.zip') -Force -ErrorAction SilentlyContinue
}
# Execute the actual startup wait with a delayed probe and a never-ready probe.
# It must observe repeatedly without starting a process/task or requesting repair.
& {
 foreach($name in @('Wait-GatewayStartup','Update-QuickStateVersion')) {
  $node=$ast.Find({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $name},$true)
  Invoke-Expression $node.Extent.Text
 }
 function Start-ScheduledTask {throw 'Readiness wait must not manually start the gateway.'}
 function Start-Process {throw 'Readiness wait must not launch the gateway.'}
 $script:probes=0
 function Test-GatewayStartupReady {$script:probes++;return $script:probes -ge 3}
 $state=[pscustomobject]@{KitVersion='1.2.1';Phase='preflight';History=@();Checks=@();BootBefore='old'}
 Wait-GatewayStartup 2 20
 Assert ($state.GatewayStartupWait.Ready -and $state.GatewayStartupWait.Attempts -eq 3) 'Delayed gateway readiness was not awaited.'
 function Test-GatewayStartupReady {return $false}
 Wait-GatewayStartup 1 50
 Assert (-not $state.GatewayStartupWait.Ready -and $state.GatewayStartupWait.ElapsedSeconds -lt 2) 'Unavailable gateway wait was not bounded.'
 $Role='gateway';$state.Phase='reboot';Update-QuickStateVersion
 Assert ($state.KitVersion -eq '1.2.4' -and $state.PreviousKitVersions[0].Version -eq '1.2.1' -and $state.Phase -eq 'preflight' -and -not $state.BootBefore) 'Legacy partial gateway test did not require fresh startup validation.'
 $Role='employee';$state.KitVersion='1.2.0';$state.Phase='complete';Update-QuickStateVersion
 Assert ($state.KitVersion -eq '1.2.0' -and $state.Phase -eq 'complete') 'Finished employee run was relabeled or reopened.'
 Write-Host 'PASS: delayed/failed boot readiness is passive and bounded; old gateway runs require a fresh boot; completed employee reports remain historical.'
}
# Optional OS/log diagnostics must never stop all report export. Exercise the real
# report function with all three independent evidence readers failing.
& {
 $node=$ast.Find({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Save-QuickReport'},$true)
 Invoke-Expression $node.Extent.Text
 function Get-GatewayTaskEvidence {throw 'fixture task evidence failure'}
 function Get-NetConnectionProfile {throw 'fixture network evidence failure'}
 function Get-NetFirewallRule {throw 'fixture firewall evidence failure'}
 function Read-AgentEvents {throw 'fixture unreadable log'}
 $Role='gateway';$temporary=Join-Path $env:RUNNER_TEMP ('Quick Evidence '+[Guid]::NewGuid())
 New-Item -ItemType Directory $temporary|Out-Null
 . (Join-Path $PSScriptRoot '..\scripts\office-test\report-core.ps1')
 $stateFile=Join-Path $temporary 'state.json';$reportDir=New-OfficePrivateDirectory (Join-Path $temporary 'report')
 $storage=[pscustomobject]@{StateFile=$stateFile;Reports=$reportDir;AdministratorsOnly=$false}
 $script:publishDesktop=$false
 $state=[pscustomobject]@{KitVersion='1.2.4';Role='gateway';RunId=[Guid]::NewGuid().ToString();Computer='fixture';StartedUtc=[DateTimeOffset]::UtcNow.ToString('o');Phase='preflight';Result='NOT CLEARED';Events=@([pscustomobject]@{Event='previous preserved receipt'});Checks=@();Scenarios=@()}
 try {
  Save-QuickReport
  $saved=Get-Content $stateFile -Raw|ConvertFrom-Json
  Assert ((Test-Path $script:lastReport.LocalBundle) -and $saved.Events[0].Event -eq 'previous preserved receipt' -and $saved.GatewayEvidence.Task -like '*unavailable*' -and $saved.AgentEventCollection) 'Independent evidence failures prevented the complete report or discarded prior events.'
 } finally {Remove-Item $temporary -Recurse -Force}
 Write-Host 'PASS: task/network/firewall/log evidence failures preserve state, prior events, and exported report.'
}
# A secondary checkpoint failure must not hide the original uncertain-save error.
& {
 $node=$ast.Find({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Run-AutomatedCase'},$true)
 Invoke-Expression $node.Extent.Text
 $script:scenarioSaves=0
 function Save-QuickReport {$script:scenarioSaves++;if($script:scenarioSaves -eq 2){throw 'fixture checkpoint unavailable'}}
 function Note-Action {}
 $state=[pscustomobject]@{Scenarios=@()}
 $caught=''
 try {Run-AutomatedCase 'fixture' 1 {throw 'original uncertain save'}}catch{$caught=$_.Exception.Message}
 Assert ($caught -eq 'original uncertain save' -and $state.Scenarios[0].Detail -eq $caught) 'A secondary checkpoint failure hid the original operation failure.'
 Assert ($state.CheckpointErrors.Count -eq 1 -and $state.CheckpointErrors[0].Stage -eq 'scenario:fixture') 'Checkpoint failure was not retained separately.'
 Write-Host 'PASS: original scenario error survives a secondary mandatory-checkpoint failure.'
}
# Test the real restart helper with only side effects stubbed. Never reboot CI.
$node=$ast.Find({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Arm-Reboot'},$true)
$script:fixtureKitRoot=Split-Path $file
Invoke-Expression ($node.Extent.Text.Replace('$PSScriptRoot','$script:fixtureKitRoot'))
function Test-Path {return $true}
function New-Item {}
function New-ItemProperty {param($Path,$Name,$Value,$PropertyType,[switch]$Force) $script:resumeCommand=$Value;$script:resumeName=$Name}
function Get-CimInstance { [pscustomobject]@{LastBootUpTime=[DateTime]'2026-09-16T00:00:00Z'} }
function Ask-Yes { $script:approved=$true }
function shutdown.exe { Require ($script:approved -and $state.Phase -eq 'reboot') 'Restart happened before approval/state checkpoint.'; $global:LASTEXITCODE=0 }
$Role='employee';$state=[pscustomobject]@{BootBefore='';Phase='preflight'}
Arm-Reboot
Assert ($state.Phase -eq 'reboot' -and $state.BootBefore) 'Restart checkpoint missing.'
Assert ($script:resumeName -eq 'MandalaOfficeTest-employee' -and $script:resumeCommand -like '* /d /c start "" *') 'Resume would block other startup programs or replace Agent startup.'
Write-Host 'PASS: restart requires approval, checkpoints first, and resumes through a separate detached one-time launcher.'
