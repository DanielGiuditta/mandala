param(
    [Parameter(Mandatory=$true)][string]$InstallDirectory,
    [Parameter(Mandatory=$true)][string]$DataDirectory,
    [Parameter(Mandatory=$true)][string]$RepairFolder,
    [Parameter(Mandatory=$true)][string]$FixtureDirectory
)
$ErrorActionPreference='Stop'
$kit=Split-Path $RepairFolder
. (Join-Path $kit 'report-core.ps1')
. (Join-Path $kit 'check-core.ps1')
. (Join-Path $kit 'recovery-evidence.ps1')
function Assert($Condition,$Message){if(-not $Condition){throw $Message}}

# Execute the shipped orchestration, not a hand-written copy of its ordering.
# Windows effects are real except for the final reboot request, which is counted
# and suppressed. This audit does not claim to prove a real boot or office policy.
$tokens=$null;$errors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $kit 'quick-test.ps1'),[ref]$tokens,[ref]$errors)
Assert ($errors.Count -eq 0) 'Gateway recovery runner syntax is invalid.'
function Bind-FixturePaths([string]$Code) {
    return $Code.Replace('$PSScriptRoot','$kit').Replace("(Join-Path `$env:ProgramData 'Mandala Gateway\gateway.json')","(Join-Path `$DataDirectory 'gateway.json')").Replace("(Join-Path `$env:ProgramData 'Mandala Gateway\startup-status\status.json')","(Join-Path `$DataDirectory 'startup-status\status.json')")
}
foreach($name in @('Update-QuickStateVersion','Ask-Yes','Save-QuickReport','Show-Checks','Record-QuickGatewayOrigin')) {
    $found=@($ast.FindAll({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst]},$true)|Where-Object {$_.Name -eq $name})
    Assert ($found.Count -eq 1) ('Expected one shipped function: '+$name)
    Invoke-Expression (Bind-FixturePaths $found[0].Extent.Text)
}
$branches=@($ast.FindAll({param($node) $node -is [Management.Automation.Language.IfStatementAst]},$true)|Where-Object {$_.Clauses[0].Item1.Extent.Text -eq '$Role -eq ''gateway''' -and $_.Clauses[0].Item2.Extent.Text.Contains('Get-GatewayRepairPlan')})
Assert ($branches.Count -eq 1) 'Expected one shipped gateway orchestration branch.'
$gatewayBranch=[scriptblock]::Create((Bind-FixturePaths $branches[0].Extent.Text))
$realPlan=${function:Get-GatewayRepairPlan};$realChecks=${function:Get-GatewayChecks};$realCheckpoint=${function:Write-OfficeCheckpoint}
function Get-GatewayRepairPlan($Approved) {& $realPlan $Approved $DataDirectory $RepairFolder}
function Get-GatewayChecks {& $realChecks $DataDirectory}
function Arm-Reboot {$script:rebootRequests++}
function Read-Host {
    $script:answers++
    if($script:answers -eq 1 -and $script:removeDestinationAtApproval -and (Test-Path -LiteralPath $desktopDirectory)) {
        Remove-Item -LiteralPath $desktopDirectory -Recurse -Force
    }
    if($script:answers -eq 1 -and $script:lockAtApproval) {
        $script:checkpointLock=[IO.File]::Open($stateFile,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::None)
    }
    return 'yes'
}
function Write-OfficeCheckpoint($State,[string]$Path) {
    $stage=@($State.RecoveryStages|Where-Object {$null -ne $_}|Select-Object -Last 1)
    if($script:failAfterStage -and $stage.Count -and $stage[0].Stage -eq $script:failAfterStage -and -not $script:checkpointLock) {
        # An actual Windows lock makes atomic replacement fail at this boundary.
        $script:checkpointLock=[IO.File]::Open($Path,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::None)
    }
    & $realCheckpoint $State $Path
}
function New-AuditState {
    $next=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'fixtures\gateway-resumed-preflight.json') -Raw|ConvertFrom-Json
    $next.Computer=$env:COMPUTERNAME;$next.WindowsUser=[Security.Principal.WindowsIdentity]::GetCurrent().Name
    $next.RunId=[Guid]::NewGuid().ToString()
    return $next
}
function Reset-AuditCounters {
    $script:answers=0;$script:rebootRequests=0;$script:failAfterStage='';$script:checkpointLock=$null
    $script:removeDestinationAtApproval=$false;$script:lockAtApproval=$false;$script:repairCheckpointErrors=@()
}
function Assert-PairingPreserved {
    foreach($path in $protectedHashes.Keys){Assert ((Get-FileHash -LiteralPath $path).Hash -eq $protectedHashes[$path]) ('Recovery changed pairing/configuration: '+$path)}
}
function Assert-RepairedGateway {
    Assert (Test-MandalaDurableGatewayStartup $InstallDirectory $DataDirectory $RepairFolder) 'Recovery did not leave the exact durable task/helpers.'
    Assert (Test-MandalaGatewayListener $InstallDirectory $DataDirectory) 'Recovery did not leave the audited Local Service listener.'
    Assert-PairingPreserved
}
$Role='gateway';$admin=$true
$base=New-OfficePrivateDirectory (Join-Path $FixtureDirectory 'recovery-orchestration') -AdministratorsOnly
$storage=[pscustomobject]@{StateFile=(Join-Path $base 'gateway.json');Reports=(New-OfficePrivateDirectory (Join-Path $base 'reports') -AdministratorsOnly);AdministratorsOnly=$true}
$stateFile=$storage.StateFile;$desktopDirectory=New-OfficePrivateDirectory (Join-Path $base 'desktop') -AdministratorsOnly
$log=Join-Path $base 'absent-agent.log'
$script:publishDesktop=$true
$approved=Get-Content -LiteralPath (Join-Path $RepairFolder 'approved-gateway.json') -Raw|ConvertFrom-Json
$plan=Get-GatewayRepairPlan $approved
$protectedHashes=@{};foreach($path in $plan.ProtectedFiles){$protectedHashes[$path]=(Get-FileHash -LiteralPath $path).Hash}
try {
    Write-Host 'Recovery orchestration: locked initial checkpoint must prevent approval and all mutations'
    Reset-AuditCounters
    $state=New-AuditState;Update-QuickStateVersion
    Write-OfficeCheckpoint $state $stateFile
    $beforeTask=Export-ScheduledTask -TaskName 'Mandala LAN Gateway'
    $beforeBackups=@(Get-ChildItem -LiteralPath $DataDirectory -Filter 'startup-backup-*').Count
    $script:checkpointLock=[IO.File]::Open($stateFile,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::None)
    $caught=$false
    try {. $gatewayBranch}catch{$caught=$true}finally{$script:checkpointLock.Dispose();$script:checkpointLock=$null}
    Assert $caught 'Initial checkpoint failure did not stop the actual gateway branch.'
    Assert ($script:answers -eq 0 -and $script:rebootRequests -eq 0) 'Initial checkpoint failure reached confirmation/reboot.'
    Assert ((Export-ScheduledTask -TaskName 'Mandala LAN Gateway') -eq $beforeTask) 'Initial checkpoint failure changed the task.'
    Assert (@(Get-ChildItem -LiteralPath $DataDirectory -Filter 'startup-backup-*').Count -eq $beforeBackups) 'Initial checkpoint failure entered repair.'
    Assert-PairingPreserved

    Write-Host 'Recovery orchestration: approval checkpoint failure must prevent the real repair'
    Reset-AuditCounters;$script:lockAtApproval=$true
    $state=New-AuditState;Update-QuickStateVersion
    $caught=$false
    try {. $gatewayBranch}catch{$caught=$true}finally{if($script:checkpointLock){$script:checkpointLock.Dispose();$script:checkpointLock=$null}}
    Assert ($caught -and $script:answers -eq 1 -and $script:rebootRequests -eq 0) 'Failed approval checkpoint continued into mutation.'
    Assert ((Export-ScheduledTask -TaskName 'Mandala LAN Gateway') -eq $beforeTask) 'Failed approval checkpoint changed the task.'
    Assert (@(Get-ChildItem -LiteralPath $DataDirectory -Filter 'startup-backup-*').Count -eq $beforeBackups) 'Failed approval checkpoint entered repair.'
    Assert-PairingPreserved

    Write-Host 'Recovery orchestration: resumed office preflight with Desktop removed at maintenance approval'
    Reset-AuditCounters;$script:removeDestinationAtApproval=$true
    $state=New-AuditState;Update-QuickStateVersion
    . $gatewayBranch
    Assert ($state.KitVersion -eq '1.2.4' -and $state.PreviousKitVersions[-1].Version -eq '1.2.2') 'Actual resumed preflight was not versioned correctly.'
    Assert ($state.GatewayRepair.Owner -eq 'Local Service' -and $state.GatewayRepair.PreservedFiles -eq 5) 'Approval did not reach the actual repair.'
    Assert ($script:answers -eq 3 -and $script:rebootRequests -eq 1) 'Successful repair did not reach exactly one suppressed reboot request.'
    Assert ((Test-Path -LiteralPath $script:lastReport.LocalBundle) -and -not $script:lastReport.DesktopBundle) 'Disappearing Desktop blocked the fallback report.'
    $saved=Get-Content -LiteralPath $stateFile -Raw|ConvertFrom-Json
    Assert ($saved.Actions[0].Answer -eq 'yes' -and @($saved.RecoveryStages|Where-Object {$_.Stage -eq 'owned-listener-verified'}).Count -eq 1) 'Approval and actual repair completion were not persisted.'
    Assert (@($saved.Checks|Where-Object {$_.Status -notin @('PASS','OBSERVED')}).Count -eq 0) 'Actual checks failed after missing-destination recovery.'
    Assert-RepairedGateway

    $checkpointCases=@(
        @('task-stopped','backups-complete'),
        @('helper-installed:gateway-startup-core.ps1','helper-installed:start-gateway-resilient.mjs'),
        @('firewall-configured','service-permissions-configured'),
        @('task-configured','firewall-configured')
    )
    foreach($case in $checkpointCases) {
        Write-Host ('Recovery orchestration: checkpoint loss at '+$case[0]+' finishes repair and blocks reboot')
        Stop-ScheduledTask -TaskName 'Mandala LAN Gateway';Start-Sleep -Seconds 2
        Reset-AuditCounters;$script:failAfterStage=$case[0]
        $state=New-AuditState;Update-QuickStateVersion
        $caught=$null
        try {. $gatewayBranch}catch{$caught=$_.Exception.Message}finally{if($script:checkpointLock){$script:checkpointLock.Dispose();$script:checkpointLock=$null}}
        Assert ($caught -like 'Gateway configuration repair finished, but recovery storage failed*') ('Mutation checkpoint loss was not surfaced at '+$case[0])
        Assert ($script:answers -eq 1 -and $script:rebootRequests -eq 0) ('Mutation checkpoint failure continued to isolation/reboot at '+$case[0])
        Assert ($state.CheckpointErrors.Count -gt 0 -and $state.CheckpointErrors[0].Stage -eq $case[0] -and $state.GatewayRepair.Owner -eq 'Local Service') ('Mutation checkpoint failure did not finish and retain repair evidence at '+$case[0])
        $saved=Get-Content -LiteralPath $stateFile -Raw|ConvertFrom-Json
        Assert ($saved.RecoveryStages[-1].Stage -eq $case[1]) ('Failed checkpoint replaced the last durable state at '+$case[0])
        Assert-RepairedGateway
        # Recover storage only; never rerun a time test. Persist the in-memory outcome.
        $script:failAfterStage='';Save-QuickReport
        $saved=Get-Content -LiteralPath $stateFile -Raw|ConvertFrom-Json
        Assert ($saved.CheckpointErrors.Count -gt 0 -and $saved.GatewayRepair.Owner -eq 'Local Service') ('Recovered storage lost the primary failure evidence at '+$case[0])
    }

    Write-Host 'Recovery integration: terminate separate repair processes after committed helper/firewall/task mutations'
    $planFile=Join-Path $base 'interrupt-plan.json';$interruptFile=Join-Path $base 'interrupted.json';$childFile=Join-Path $base 'interrupt-repair.ps1'
    @'
param($PlanFile,$RepairFolder,$StateFile,$StopAfterStage)
$ErrorActionPreference='Stop'
. (Join-Path $RepairFolder 'repair-core.ps1')
. (Join-Path (Split-Path $RepairFolder) 'report-core.ps1')
$plan=Get-Content -LiteralPath $PlanFile -Raw|ConvertFrom-Json
$state=[pscustomobject]@{Stage='approved';Stages=@()}
Write-OfficeCheckpoint $state $StateFile
$checkpoint={param($stage)
    $state.Stage=$stage;$state.Stages+= $stage
    Write-OfficeCheckpoint $state $StateFile
    if($stage -eq $StopAfterStage){[Environment]::Exit(73)}
}
Repair-ConfiguredGateway $plan $RepairFolder $checkpoint|Out-Null
exit 74
'@|Set-Content -LiteralPath $childFile -Encoding UTF8
    foreach($stopAfterStage in @('helper-installed:gateway-startup-core.ps1','firewall-configured','task-configured')) {
        Write-Host ('Recovery integration: actual process termination at '+$stopAfterStage)
        $plan=Get-GatewayRepairPlan $approved
        $plan|ConvertTo-Json -Depth 10|Set-Content -LiteralPath $planFile -Encoding UTF8
        $interruptFile=Join-Path $base ('interrupted-'+[Guid]::NewGuid().ToString('N')+'.json')
        & powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File $childFile $planFile $RepairFolder $interruptFile $stopAfterStage
        Assert ($LASTEXITCODE -eq 73) ('Repair subprocess did not terminate at '+$stopAfterStage)
        $interrupted=Get-Content -LiteralPath $interruptFile -Raw|ConvertFrom-Json
        Assert ($interrupted.Stage -eq $stopAfterStage) ('Interrupted repair lost its checkpoint at '+$stopAfterStage)
        Assert ((Get-ScheduledTask -TaskName 'Mandala LAN Gateway').State -ne 'Running') ('Interrupted repair unexpectedly started the task at '+$stopAfterStage)
        Assert-PairingPreserved
        Reset-AuditCounters
        $state=New-AuditState;Update-QuickStateVersion
        . $gatewayBranch
        Assert ($script:rebootRequests -eq 1 -and $state.GatewayRepair.Owner -eq 'Local Service') ('Actual orchestration did not resume interrupted repair at '+$stopAfterStage)
        Assert ((Get-Content -LiteralPath $interruptFile -Raw|ConvertFrom-Json).Stage -eq $interrupted.Stage) 'Resume overwrote prior interruption evidence.'
        Assert-RepairedGateway
    }
    Write-Host 'PASS: actual resumed preflight -> approval -> real repair despite missing Desktop; required checkpoints block mutations; four mutation checkpoint losses complete repair without reboot; three actual process terminations recover with pairing preserved. No real reboot is claimed.'
} finally {
    if($script:checkpointLock){$script:checkpointLock.Dispose()}
}
