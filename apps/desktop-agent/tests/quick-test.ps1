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
