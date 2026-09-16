$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '..\scripts\startup-repair\startup-core.ps1')
. (Join-Path $PSScriptRoot '..\scripts\office-test\check-core.ps1')
function Assert($Condition,$Message){if(-not $Condition){throw $Message}}
function Reject($Action,$Message){$failed=$false;try{& $Action|Out-Null}catch{$failed=$true};Assert $failed $Message}
foreach($file in @(Get-ChildItem (Join-Path $PSScriptRoot '..\scripts\office-test') -Filter '*.ps1')) {
    $tokens=$null;$errors=$null
    [Management.Automation.Language.Parser]::ParseFile($file.FullName,[ref]$tokens,[ref]$errors)|Out-Null
    Assert ($errors.Count -eq 0) ('PowerShell 5 syntax: '+$file.Name+' '+($errors|Out-String))
}
$failed=Invoke-OfficeCheck 'fails' {throw 'fixture failure'}
$next=Invoke-OfficeCheck 'next-check' {'still runs'}
Assert ($failed.Status -eq 'FAIL' -and $next.Status -eq 'PASS') 'Independent checks stopped after a failure.'
$checks=@(Get-EmployeeChecks @() ([pscustomobject]@{agentSha256='fixture'}))
Assert ($checks.Count -ge 11) 'Missing agent prevented collection of other installation/network checks.'
Assert (@($checks|Where-Object {$_.Id -eq 'employee.installed-agent' -and $_.Status -eq 'FAIL'}).Count -eq 1) 'Missing installation reported as a pass.'
$fixture=Join-Path ([IO.Path]::GetTempPath()) ('Mandala full audit '+[Guid]::NewGuid())
New-Item -ItemType Directory $fixture|Out-Null
try {
    $file=Join-Path $fixture 'agent.log'
    $session='11111111-1111-1111-1111-111111111111';$entry='22222222-2222-2222-2222-222222222222'
    @(
      ('local | UTC 2026-09-16T10:00:00Z | lan-save-pending | sessionId='+$session+'; PRIVATE_ERROR_BODY'),
      ('local | UTC 2026-09-16T10:03:00Z | lan-time-confirmed | sessionId='+$session+'; entryId='+$entry),
      'local | UTC 2026-09-16T10:03:01Z | stop-ui-failure | PRIVATE_TOKEN_NEVER_EXPORT',
      'local | UTC 2026-09-16T10:03:02Z | arbitrary-event | PRIVATE_TOKEN_NEVER_EXPORT'
    )|Set-Content $file
    $events=@(Read-AgentEvents $file ([DateTimeOffset]'2026-09-16T09:59:00Z'))
    $serialized=$events|ConvertTo-Json -Depth 5
    Assert ($serialized -notmatch 'PRIVATE_') 'Sensitive log content leaked into report.'
    Assert ((Test-ScenarioEvidence $events 1 'offline').EntryId -eq $entry) 'Offline receipt chain did not validate.'
    Reject {Test-ScenarioEvidence $events 2 'switch'} 'Wrong receipt count passed.'
    Reject {Test-ScenarioEvidence @($events|Where-Object {$_.Event -ne 'lan-save-pending'}) 1 'offline'} 'Reconnect without pending evidence passed.'
    Reject {Test-ScenarioEvidence $events 1 'idle'} 'Idle test without idle confirmation passed.'
    Assert (@(Read-AgentEvents $file ([DateTimeOffset]'2026-09-17T00:00:00Z')).Count -eq 0) 'Old events contaminated new test.'
    Write-Host 'PASS: all checks continue after missing agent; safe log export; receipt counts; pending-to-confirmed correlation; idle and time-window rejection.'
} finally {Remove-Item $fixture -Recurse -Force}
