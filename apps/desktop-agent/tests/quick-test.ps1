$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '..\scripts\office-test\check-core.ps1')
. (Join-Path $PSScriptRoot '..\scripts\office-test\ui-driver.ps1')
function Assert($Condition,$Message){if(-not $Condition){throw $Message}}
$fixture=Join-Path $PSScriptRoot 'ui-fixture.ps1'
$p=Start-Process powershell.exe -ArgumentList '-NoProfile','-STA','-File',('"'+$fixture+'"') -PassThru
try {
 $script:AgentPath=$p.Path;$script:AgentProcessId=$p.Id
 Wait-Ui 'fixture window' {try{Get-AgentRoot}catch{$null}} 30|Out-Null
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
$state=[pscustomobject]@{SchemaVersion=1;KitVersion='1.2.0';RunId=[Guid]::NewGuid().ToString();Role='employee';Computer=$computer;WindowsUser='fixture';StartedUtc=[DateTimeOffset]::UtcNow.ToString('o');Phase='functional';Email='fixture@example.test';ProjectA='A';ProjectB='B';BootBefore='';Candidates=@();Checks=@();History=@();Actions=@();Scenarios=@([pscustomobject]@{Kind='stop';Status='INCOMPLETE';Detail='Interrupted'});Events=@();DatabaseVerification='PENDING';Result='NOT CLEARED'}
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
 $restored=Get-Content (Join-Path $folder 'employee.json') -Raw|ConvertFrom-Json
 Assert ($restored.Phase -eq 'stopped' -and $restored.Result -eq 'NOT CLEARED') 'Interrupted run was not blocked.'
 Assert ($restored.Scenarios.Count -eq 4 -and $restored.Scenarios[0].Status -eq 'FAIL') 'Interrupted/remaining tests not recorded.'
 Assert (Test-Path ($reportDir+'.zip')) 'Interrupted report ZIP missing.'
 Write-Host 'PASS: actual quick launcher preserves interruption, blocks remaining writes and exports a report.'
} finally {
 $env:LOCALAPPDATA=$savedLocal;$env:COMPUTERNAME=$savedComputer
 Remove-Item $isolated -Recurse -Force
 Remove-Item $reportDir -Recurse -Force -ErrorAction SilentlyContinue
 Remove-Item ($reportDir+'.zip') -Force -ErrorAction SilentlyContinue
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
