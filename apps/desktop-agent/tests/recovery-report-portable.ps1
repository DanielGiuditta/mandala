# Cross-platform smoke coverage of checkpoint/export logic only. This deliberately
# does NOT claim Windows ACL, UAC, Task Scheduler, reboot or real-Agent coverage.
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '..\scripts\office-test\report-core.ps1')
function New-OfficePrivateDirectory([string]$Path,[switch]$AdministratorsOnly) {
    [void](Assert-OfficeLocalPath $Path)
    [void][IO.Directory]::CreateDirectory($Path)
    return $Path
}
function Assert($Condition,$Message){if(-not $Condition){throw $Message}}
$temporary=[IO.Path]::GetTempPath()
# macOS /tmp is a symlink; exercise the real path guard on its physical target.
if($temporary -eq '/tmp/'){$temporary='/private/tmp/'}
if($temporary.StartsWith('/var/')){$temporary='/private'+$temporary}
$base=Join-Path $temporary ('Mandala portable recovery '+[Guid]::NewGuid())
[void][IO.Directory]::CreateDirectory($base)
$storage=[pscustomobject]@{Root=$base;StateFile=(Join-Path $base 'state.json');Reports=(Join-Path $base 'reports');AdministratorsOnly=$false}
$state=[pscustomobject]@{KitVersion='1.2.4';Role='gateway';Computer='fixture';RunId=[Guid]::NewGuid().ToString();Checks=@();Scenarios=@();Phase='preflight';Result='NOT CLEARED'}
try {
    $one=Save-OfficeSnapshot $state $storage (Join-Path $base 'missing-desktop')
    Assert ((Test-Path $one.LocalBundle) -and $one.Errors.Count -eq 1) 'Missing Desktop did not preserve the local ZIP.'
    $two=Save-OfficeSnapshot $state $storage ''
    $saved=Get-Content -LiteralPath $storage.StateFile -Raw|ConvertFrom-Json
    Assert ($saved.SnapshotId -eq $two.SnapshotId -and $one.SnapshotId -ne $two.SnapshotId -and (Test-Path $one.LocalBundle)) 'Atomic replacement/current snapshot or historical preservation failed.'
    & {
        function Compress-Archive {throw 'ZIP unavailable'}
        $state|Add-Member -NotePropertyName PrimaryError -NotePropertyValue 'original failure' -Force
        $three=Save-OfficeSnapshot $state $storage ''
        $saved=Get-Content -LiteralPath $storage.StateFile -Raw|ConvertFrom-Json
        Assert (-not $three.LocalBundle -and $three.Errors.Count -and $saved.PrimaryError -eq 'original failure') 'ZIP failure lost the original error or mandatory checkpoint.'
    }
    & {
        function Write-OfficeCheckpoint {throw 'Required checkpoint unavailable'}
        $failed=$false
        try {Save-OfficeSnapshot $state $storage ''|Out-Null}catch{$failed=$true}
        Assert $failed 'Required checkpoint failure was treated as optional.'
    }
    # Only shareable filenames are sanitized; original evidence is retained inside.
    $state.KitVersion='../../../escape'
    $four=Save-OfficeSnapshot $state $storage ''
    Assert ($four.LocalBundle.StartsWith($storage.Reports+[IO.Path]::DirectorySeparatorChar) -and (Test-Path $four.LocalBundle)) 'Historical report fields escaped the output root.'
    Write-Host 'PASS: portable checkpoint replacement, missing Desktop, ZIP failure, mandatory save failure, snapshot preservation and path confinement. Windows security/boot gates remain separate.'
} finally {Remove-Item -LiteralPath $base -Recurse -Force}
