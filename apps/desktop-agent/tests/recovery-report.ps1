$ErrorActionPreference='Stop'
$kit=Join-Path $PSScriptRoot '..\scripts\office-test'
. (Join-Path $kit 'report-core.ps1')
. (Join-Path $kit 'check-core.ps1')
function Assert($Condition,$Message){if(-not $Condition){throw $Message}}
$base=New-OfficePrivateDirectory (Join-Path $env:RUNNER_TEMP ('Recovery reports '+[Guid]::NewGuid()))
$storage=[pscustomobject]@{StateFile=(Join-Path $base 'state.json');Reports=(New-OfficePrivateDirectory (Join-Path $base 'reports'));AdministratorsOnly=$false}
$state=[pscustomobject]@{SchemaVersion=1;KitVersion='1.2.3';RunId=[Guid]::NewGuid().ToString();Role='gateway';Computer='FIXTURE';Phase='preflight';Result='NOT CLEARED';Checks=@();Actions=@();Scenarios=@()}
try {
    # The actual approval function must return despite a disappearing Desktop.
    $t=$null;$e=$null;$ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $kit 'quick-test.ps1'),[ref]$t,[ref]$e)
    Assert ($e.Count -eq 0) 'Runner syntax is invalid.'
    $function=$ast.Find({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Ask-Yes'},$true)
    Invoke-Expression $function.Extent.Text
    $desktop=New-OfficePrivateDirectory (Join-Path $base 'desktop')
    $script:repairCount=0
    function Read-Host {Remove-Item -LiteralPath $desktop -Recurse -Force;return 'yes'}
    function Save-QuickReport {$script:snapshot=Save-OfficeSnapshot $state $storage $desktop}
    Ask-Yes 'Fixture: approve gateway maintenance'
    $script:repairCount++ # stand-in for mutation after the real approval boundary
    Assert ($script:repairCount -eq 1 -and $state.Actions[-1].Answer -eq 'yes') 'Approval did not return once.'
    Assert ((Test-Path $script:snapshot.LocalBundle) -and -not $script:snapshot.DesktopBundle) 'Disappearing Desktop did not retain a complete fallback bundle.'
    $saved=Get-Content -LiteralPath $storage.StateFile -Raw|ConvertFrom-Json
    Assert ($saved.Actions[-1].Answer -eq 'yes') 'Approval was not committed before continuing.'
    # Permanently unwritable Desktop (a file occupies its path).
    Write-OfficeNewText $desktop 'occupied'
    $next=Save-OfficeSnapshot $state $storage $desktop
    Assert ((Test-Path $next.LocalBundle) -and $next.Errors.Count) 'Unwritable Desktop did not return a current fallback.'
    Assert ($next.SnapshotId -ne $script:snapshot.SnapshotId -and (Test-Path $script:snapshot.LocalBundle)) 'Snapshots overwrite historical evidence.'
    # Directory junctions must not receive elevated exports.
    Remove-Item -LiteralPath $desktop
    $other=New-OfficePrivateDirectory (Join-Path $base 'unrelated')
    New-Item -ItemType Junction -Path $desktop -Target $other|Out-Null
    $redirected=Save-OfficeSnapshot $state $storage $desktop
    Assert ($redirected.Errors.Count -and @(Get-ChildItem -LiteralPath $other -Force).Count -eq 0) 'Redirected Desktop received report writes.'
    [IO.Directory]::Delete($desktop)
    # A locked checkpoint is essential: no approval may reach its mutation.
    $locked=[IO.File]::Open($storage.StateFile,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::None)
    $failed=$false
    try {Save-OfficeSnapshot $state $storage ''|Out-Null}catch{$failed=$true}finally{$locked.Dispose()}
    Assert $failed 'Locked mandatory checkpoint did not stop execution.'
    # Zip failure is optional and cannot replace the original operation error.
    & {
        function Compress-Archive {throw 'fixture zip unavailable'}
        $state|Add-Member -NotePropertyName PrimaryError -NotePropertyValue 'original gateway failure' -Force
        $result=Save-OfficeSnapshot $state $storage ''
        Assert ($result.Errors.Count -and -not $result.LocalBundle) 'ZIP failure was not represented.'
        $saved=Get-Content -LiteralPath $storage.StateFile -Raw|ConvertFrom-Json
        Assert ($saved.PrimaryError -eq 'original gateway failure') 'Export replaced the operation failure.'
    }
    Write-Host 'PASS: real approval boundary, missing/unwritable/redirected Desktop, unique fallback bundles, locked mandatory checkpoint and ZIP failure.'
} finally {
    Remove-Item -LiteralPath $base -Recurse -Force
}
