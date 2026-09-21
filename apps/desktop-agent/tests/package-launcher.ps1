param([Parameter(Mandatory=$true)][string]$PackageDirectory)
$ErrorActionPreference='Stop'
if($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted'){throw 'Launcher/account audit is restricted to disposable GitHub-hosted Windows runners.'}
function Assert($Condition,$Message){if(-not $Condition){throw $Message}}
$suite=Join-Path $env:ProgramData ('Mandala launcher audit '+[Guid]::NewGuid().ToString('N'))
$copied=Join-Path $suite 'Downloaded package & office'
$inputFile=Join-Path $suite 'input.txt'
$user=$null;$userSid=$null;$desktopReports=@()
$results=[ordered]@{ExactCmd=$false;InternetMarkedScripts=$false;InvalidRole=$false;InvalidMode=$false;CorruptState=$false;StandardUserBaseline='NOT RUN';UacCancellation='NOT RUN';SecureDesktopTested=$false;RebootTested=$false;ProductionWrites=0}
New-Item -ItemType Directory -Path $copied -Force|Out-Null
Copy-Item -Path (Join-Path $PackageDirectory '*') -Destination $copied -Recurse -Force
$launcher=Join-Path $copied 'Start Mandala.cmd'
Assert (Test-Path -LiteralPath $launcher) 'Extracted package is missing its exact CMD entry point.'
Set-Content -LiteralPath $inputFile -Value "`r`n`r`n`r`n"

function Invoke-CmdAudit([string]$Label,[string]$Role,[string]$Mode,[Management.Automation.PSCredential]$Credential=$null,[int]$TimeoutSeconds=150) {
    $stdout=Join-Path $suite ($Label+'-output.txt');$stderr=Join-Path $suite ($Label+'-error.txt')
    $arguments='/d /c ""'+$launcher+'" '+$Role+' '+$Mode+'"'
    $parameters=@{FilePath=$env:ComSpec;ArgumentList=$arguments;WorkingDirectory=$copied;RedirectStandardInput=$inputFile;RedirectStandardOutput=$stdout;RedirectStandardError=$stderr;PassThru=$true}
    if($Credential){
        # CreateProcessWithLogon can inherit the caller's environment even while
        # loading the new profile. Bind known folders for the actual child token,
        # as a normal Explorer logon would, before invoking the unchanged CMD.
        $profileEntry=Join-Path $suite 'standard-profile-entry.ps1'
        @'
param($Launcher,$Role,$Mode)
$ErrorActionPreference='Stop'
$env:LOCALAPPDATA=[Environment]::GetFolderPath('LocalApplicationData')
$env:APPDATA=[Environment]::GetFolderPath('ApplicationData')
$env:USERPROFILE=[Environment]::GetFolderPath('UserProfile')
$env:ProgramData=[Environment]::GetFolderPath('CommonApplicationData')
& $env:ComSpec /d /c ('""'+$Launcher+'" '+$Role+' '+$Mode+'"')
exit $LASTEXITCODE
'@|Set-Content -LiteralPath $profileEntry -Encoding UTF8
        $parameters.FilePath=Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
        $parameters.ArgumentList='-NoProfile -ExecutionPolicy RemoteSigned -File "'+$profileEntry+'" -Launcher "'+$launcher+'" -Role '+$Role+' -Mode '+$Mode
        $parameters.Credential=$Credential;$parameters.LoadUserProfile=$true
    }
    $process=Start-Process @parameters
    if(-not $process.WaitForExit($TimeoutSeconds*1000)) {
        # Terminate only this test-owned subprocess tree on a bounded timeout.
        & taskkill.exe /PID $process.Id /T /F|Out-Null
        throw ('Exact CMD '+$Label+' timed out. '+(Get-Content -LiteralPath $stdout -Raw -ErrorAction SilentlyContinue))
    }
    $process.WaitForExit()
    return [pscustomobject]@{ExitCode=$process.ExitCode;Output=(Get-Content -LiteralPath $stdout -Raw);Error=(Get-Content -LiteralPath $stderr -Raw -ErrorAction SilentlyContinue)}
}
try {
    Get-ChildItem -LiteralPath $copied -Recurse -Filter '*.ps1'|ForEach-Object {Set-Content -LiteralPath $_.FullName -Stream Zone.Identifier -Value "[ZoneTransfer]`r`nZoneId=3"}
    $oldProgramData=$env:ProgramData;$oldLocal=$env:LOCALAPPDATA
    $isolatedProgramData=Join-Path $suite 'isolated-machine';$isolatedLocal=Join-Path $suite 'isolated-profile'
    New-Item -ItemType Directory -Path $isolatedProgramData,$isolatedLocal|Out-Null
    try {
        # Bind only storage locations to the disposable fixture. The CMD entry,
        # package verification, Windows administrator check and runner are real.
        $env:ProgramData=$isolatedProgramData;$env:LOCALAPPDATA=$isolatedLocal
        $run=Invoke-CmdAudit 'gateway-export' 'gateway' 'Export'
        Assert ($run.ExitCode -eq 0 -and $run.Output -like '*Returning saved evidence only*' -and $run.Output -like '*SEND THIS CURRENT REPORT:*') ('Exact CMD Export failed: '+$run.Output+' '+$run.Error)
        $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
        $stateFile=Join-Path $isolatedProgramData ('Mandala Office Recovery\'+$sid+'\gateway.json')
        $state=Get-Content -LiteralPath $stateFile -Raw|ConvertFrom-Json
        Assert ($state.Role -eq 'gateway' -and $state.Phase -eq 'preflight' -and $state.Result -eq 'NOT CLEARED' -and $state.Actions.Count -eq 0) 'Export performed or claimed repair/time operations.'
        $desktopReports+=Join-Path ([Environment]::GetFolderPath('DesktopDirectory')) ('Mandala report '+$state.SnapshotId)
        Assert (-not(Get-Item -LiteralPath (Join-Path $copied 'quick-test.ps1') -Stream Zone.Identifier -ErrorAction SilentlyContinue)) 'Actual CMD left a verified dependency Internet blocked.'
        $results.ExactCmd=$true;$results.InternetMarkedScripts=$true
        $beforeHash=(Get-FileHash -LiteralPath $stateFile).Hash
        foreach($invalid in @(@('invalid-role','invalid','Export','Invalid computer role.'),@('invalid-mode','gateway','invalid','Invalid operation.'))) {
            $run=Invoke-CmdAudit $invalid[0] $invalid[1] $invalid[2]
            Assert ($run.Output.Contains($invalid[3])) ('Exact CMD accepted '+$invalid[0]+': '+$run.Output)
            Assert ((Get-FileHash -LiteralPath $stateFile).Hash -eq $beforeHash) ('Invalid launcher input changed state: '+$invalid[0])
        }
        $results.InvalidRole=$true;$results.InvalidMode=$true
        $original=[IO.File]::ReadAllBytes($stateFile)
        try {
            [IO.File]::WriteAllText($stateFile,'{ damaged fixture state')
            $corruptHash=(Get-FileHash -LiteralPath $stateFile).Hash
            $run=Invoke-CmdAudit 'corrupt-state' 'gateway' 'Export'
            Assert ($run.Output -like '*Saved test state cannot be resumed. No test actions were performed*') ('Corrupt state did not fail closed: '+$run.Output)
            Assert ((Get-FileHash -LiteralPath $stateFile).Hash -eq $corruptHash) 'Corrupt state was replaced or reset.'
            $results.CorruptState=$true
        } finally {[IO.File]::WriteAllBytes($stateFile,$original)}
    } finally {$env:ProgramData=$oldProgramData;$env:LOCALAPPDATA=$oldLocal}

    # A real separate standard Windows account exercises its own profile and ACLs.
    # No interactive desktop, Agent UI, or UAC approval is required for baseline.
    if(Get-Command New-LocalUser -ErrorAction SilentlyContinue) {
        $name='MndAudit'+[Guid]::NewGuid().ToString('N').Substring(0,8)
        $password=ConvertTo-SecureString ('Audit!a1'+[Guid]::NewGuid().ToString('N')) -AsPlainText -Force
        $user=New-LocalUser -Name $name -Password $password -Description 'Disposable Mandala launcher CI fixture' -AccountNeverExpires
        $userSid=$user.SID.Value
        Add-LocalGroupMember -SID 'S-1-5-32-545' -Member $user
        & icacls.exe $suite /grant ('*'+$userSid+':(OI)(CI)RX') /T /Q|Out-Null
        Assert ($LASTEXITCODE -eq 0) 'Could not grant fixture-account package read access.'
        $credential=New-Object Management.Automation.PSCredential(($env:COMPUTERNAME+'\'+$name),$password)
        $beforeAgent=@(Get-Process -Name 'Mandala.Agent' -ErrorAction SilentlyContinue|Select-Object -ExpandProperty Id) -join ','
        $run=Invoke-CmdAudit 'standard-baseline' 'employee' 'Baseline' $credential
        Assert ($run.ExitCode -eq 0 -and $run.Output -like '*SEND THIS CURRENT REPORT:*') ('Standard-user baseline failed: '+$run.Output+' '+$run.Error)
        $profile=Get-CimInstance Win32_UserProfile -Filter ("SID='"+$userSid+"'")
        Assert $profile 'Standard-account profile was not loaded.'
        $accountRoot=Join-Path $profile.LocalPath ('AppData\Local\Mandala Office Recovery\'+$userSid)
        $baselineFiles=@(Get-ChildItem -LiteralPath $accountRoot -Filter 'baseline-*.json')
        Assert ($baselineFiles.Count -eq 1) 'Expected one real standard-user baseline checkpoint.'
        $baseline=Get-Content -LiteralPath $baselineFiles[0].FullName -Raw|ConvertFrom-Json
        Assert ($baseline.WindowsUser -eq ($env:COMPUTERNAME+'\'+$name) -and $baseline.Phase -eq 'baseline' -and $baseline.Role -eq 'employee') 'Baseline used the wrong Windows identity or mode.'
        Assert (@($baseline.Checks|Where-Object {$_.Id -eq 'employee.account-context' -and $_.Status -eq 'PASS'}).Count -eq 1) 'Standard account was not independently verified as unelevated.'
        Assert ($baseline.Scenarios.Count -eq 4 -and @($baseline.Scenarios|Where-Object {$_.Status -ne 'BLOCKED'}).Count -eq 0 -and $baseline.Actions.Count -eq 0) 'Baseline attempted a functional scenario.'
        Assert ((@(Get-Process -Name 'Mandala.Agent' -ErrorAction SilentlyContinue|Select-Object -ExpandProperty Id) -join ',') -eq $beforeAgent) 'Baseline launched or closed Agent.'
        Assert (-not(Test-Path -LiteralPath (Join-Path $accountRoot 'employee.json'))) 'Baseline replaced the functional run checkpoint.'
        $results.StandardUserBaseline='PASS: real separate non-administrator account/profile; no interactive desktop claim'
    } else {$results.StandardUserBaseline='NOT TESTED: local-account management unavailable';Write-Warning $results.StandardUserBaseline}

    # Exercise the exact elevation error branch without showing or approving the
    # Windows secure desktop. A simulated API cancellation is not a UAC UI test.
    & {
        $tokens=$null;$errors=$null
        $ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $copied 'package-entry.ps1'),[ref]$tokens,[ref]$errors)
        Assert ($errors.Count -eq 0) 'Extracted entry cannot be parsed.'
        $branch=@($ast.FindAll({param($node) $node -is [Management.Automation.Language.IfStatementAst]},$true)|Where-Object {$_.Clauses[0].Item1.Extent.Text -eq '$Role -eq ''gateway'' -and -not $admin'})
        Assert ($branch.Count -eq 1) 'Could not identify the exact gateway elevation branch.'
        $body=[scriptblock]::Create($branch[0].Extent.Text.Replace('$PSScriptRoot','$copied'))
        $capture=[pscustomobject]@{Calls=0;Arguments='';Verb='';Wait=$false;PassThru=$false}
        function Start-Process($FilePath,$ArgumentList,$Verb,[switch]$Wait,[switch]$PassThru) {
            $capture.Calls++;$capture.Arguments=$ArgumentList;$capture.Verb=$Verb;$capture.Wait=[bool]$Wait;$capture.PassThru=[bool]$PassThru
            throw [ComponentModel.Win32Exception]::new(1223)
        }
        $Role='gateway';$Mode='Run';$admin=$false;$Elevated=$false;$caught=''
        try {. $body}catch{$caught=$_.Exception.Message}
        Assert ($caught -like 'Administrator approval was cancelled or unavailable*' -and $capture.Calls -eq 1 -and $capture.Verb -eq 'RunAs' -and $capture.Wait -and $capture.PassThru) 'Cancellation handler did not fail closed.'
        Assert ($capture.Arguments -like '*-Role gateway -Mode Run -Elevated*') 'Gateway elevation lost role/mode or loop guard.'
        $Elevated=$true;$capture.Calls=0;$caught=''
        try {. $body}catch{$caught=$_.Exception.Message}
        Assert ($caught -eq 'Administrator approval was not granted.' -and $capture.Calls -eq 0) 'Denied elevated request recursively prompted again.'
    }
    $results.UacCancellation='PASS: injected Windows cancellation and loop guard; secure desktop NOT exercised'
    $results|ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $env:RUNNER_TEMP 'mandala-package-launcher-audit.json') -Encoding UTF8
    Write-Host ('PASS: '+($results|ConvertTo-Json -Compress))
} finally {
    foreach($path in $desktopReports){if(Test-Path -LiteralPath $path){Remove-Item -LiteralPath $path -Recurse -Force}}
    if($userSid){$profile=Get-CimInstance Win32_UserProfile -Filter ("SID='"+$userSid+"'") -ErrorAction SilentlyContinue;if($profile){$profile|Remove-CimInstance -ErrorAction SilentlyContinue}}
    if($user){Remove-LocalUser -Name $user.Name -ErrorAction SilentlyContinue}
    if(Test-Path -LiteralPath $suite){Remove-Item -LiteralPath $suite -Recurse -Force}
}
