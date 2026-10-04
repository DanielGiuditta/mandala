param([Parameter(Mandatory=$true)][string]$PackageZip,[Parameter(Mandatory=$true)][string]$ApprovedAgent)
$ErrorActionPreference='Stop'
function Assert($Condition,$Message){if(-not $Condition){throw $Message}}
function Reject($Action,$Message){$failed=$false;try{& $Action|Out-Null}catch{$failed=$true};Assert $failed $Message}
$fixture=Join-Path $env:RUNNER_TEMP ('Mandala pairing audit & office '+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $fixture|Out-Null
$package=Join-Path $fixture 'package';Expand-Archive -LiteralPath $PackageZip -DestinationPath $package
$script:roots=@();$leafThumb=$null
try {
    foreach($file in @(Get-ChildItem $package -Recurse -Filter '*.ps1')) {
        $tokens=$null;$errors=$null
        [Management.Automation.Language.Parser]::ParseFile($file.FullName,[ref]$tokens,[ref]$errors)|Out-Null
        Assert ($errors.Count -eq 0) ('PowerShell 5 parse failure: '+$file.Name+' '+($errors|Out-String))
        Set-Content -LiteralPath $file.FullName -Stream Zone.Identifier -Value "[ZoneTransfer]`r`nZoneId=3"
    }
    $inputPath=Join-Path $fixture 'input.txt';'x'|Set-Content $inputPath
    $launch=Start-Process $env:ComSpec -ArgumentList ('/d /c ""'+(Join-Path $package 'Start pairing.cmd')+'" --check-only"') -RedirectStandardInput $inputPath -RedirectStandardOutput (Join-Path $fixture 'out.txt') -RedirectStandardError (Join-Path $fixture 'err.txt') -PassThru
    if(-not $launch.WaitForExit(30000)){& taskkill.exe /PID $launch.Id /T /F|Out-Null;throw 'Pairing launcher timed out.'}
    $launch.WaitForExit();Get-Content (Join-Path $fixture 'out.txt'),(Join-Path $fixture 'err.txt')
    Assert ($launch.ExitCode -eq 0) 'Downloaded pairing package launcher failed.'
    Assert (-not(Get-Item (Join-Path $package 'employee-agent-core.ps1') -Stream Zone.Identifier -ErrorAction SilentlyContinue)) 'Verified dependency remained blocked.'
    $helper=Join-Path $package 'employee-agent-core.ps1';$helperBytes=[IO.File]::ReadAllBytes($helper)
    Add-Content $helper '# changed'
    Reject { & (Join-Path $package 'pairing-entry.ps1') -CheckOnly } 'Changed package dependency accepted.'
    [IO.File]::WriteAllBytes($helper,$helperBytes)
    . $helper
    Assert ((Get-EmployeeAgentRequirement $ApprovedAgent $env:ProgramData) -eq 'Ready') 'Audited 1.0.16 should not be reinstalled.'
    # Execute the actual wizard guard without opening its modal UI. Any attempt to
    # install an already approved Agent is a test failure, including UAC launch.
    $tokens=$null;$errors=$null
    $ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $package 'setup-wizard.ps1'),[ref]$tokens,[ref]$errors)
    $guard=$ast.Find({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Ensure-EmployeeAgent'},$true)
    . ([scriptblock]::Create($guard.Extent.Text))
    $script:approvedPath=$ApprovedAgent
    function Get-MandalaAgentPath {param([switch]$MachineOnly) return $script:approvedPath}
    function Start-Process {throw 'Unexpected installation/process launch while retaining approved Agent.'}
    Ensure-EmployeeAgent
    Remove-Item Function:\Start-Process
    Assert ((Get-EmployeeAgentRequirement $null $env:ProgramData) -eq 'Install') 'Missing Agent should request the current installer.'
    foreach($version in @('1.0.15','1.0.17')) {
        $dir=Join-Path $fixture $version;New-Item -ItemType Directory $dir|Out-Null
        $exe=Join-Path $dir 'Mandala.Agent.exe';$type='VersionFixture'+$version.Replace('.','')
        Add-Type -TypeDefinition ('using System.Reflection; [assembly: AssemblyInformationalVersion("'+$version+'")] public class '+$type+' { public static void Main() {} }') -OutputAssembly $exe -OutputType WindowsApplication
        '{"supabaseUrl":"https://nzlajptokbcgeaifgnoq.supabase.co","supabaseAnonKey":"fixture"}'|Set-Content (Join-Path $dir 'agent.config.json')
        if($version -eq '1.0.15'){Assert ((Get-EmployeeAgentRequirement $exe $fixture) -eq 'Install') 'Old version should require 1.0.16.'}
        else {Reject {Get-EmployeeAgentRequirement $exe $fixture} 'Unknown newer Agent must be retained, never downgraded.'}
    }
    $copied=Join-Path $fixture 'changed-agent';New-Item -ItemType Directory $copied|Out-Null
    $copy=Join-Path $copied 'Mandala.Agent.exe';Copy-Item $ApprovedAgent $copy
    Copy-Item (Join-Path (Split-Path $ApprovedAgent) 'agent.config.json') $copied
    $stream=[IO.File]::Open($copy,'Append');try{$stream.WriteByte(0)}finally{$stream.Dispose()}
    Reject {Get-EmployeeAgentRequirement $copy $fixture} 'Changed 1.0.16 executable accepted.'
    '{"supabaseUrl":"https://wrong.supabase.co","supabaseAnonKey":"fixture"}'|Set-Content (Join-Path $copied 'agent.config.json')
    Reject {Get-EmployeeAgentRequirement $copy $fixture} 'Wrong installed backend accepted.'
    Write-Host 'PASS: approved installed Agent retained without installer/UAC; missing/older Agent requires update; newer or modified Agent cannot be downgraded; actual configuration precedence enforced.'

    $originalCommonData=$env:ProgramData
    try {
        $env:ProgramData=Join-Path $fixture 'managed-data'
        $managed=Join-Path $env:ProgramData 'Mandala Agent';New-Item -ItemType Directory $managed -Force|Out-Null
        $oldConfig=Join-Path $managed 'lan.config.json'
        '{"gatewayUrl":"https://192.168.1.58:8443","deviceCertificateThumbprint":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}'|Set-Content $oldConfig
        $configHash=(Get-FileHash $oldConfig).Hash
        & (Join-Path $package 'configure-lan.ps1') -GatewayUrl 'https://192.168.30.80:8443' -DeviceCertificateThumbprint 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
        $configBackups=@(Get-ChildItem $managed -Filter 'lan.config-before-pairing-*.json')
        Assert ($configBackups.Count -eq 1 -and (Get-FileHash $configBackups[0].FullName).Hash -eq $configHash) 'Original LAN connection settings were not backed up exactly.'
        Assert ((Get-Content $oldConfig -Raw|ConvertFrom-Json).gatewayUrl -eq 'https://192.168.30.80:8443') 'New gateway settings were not committed.'
        foreach($path in @($oldConfig,$configBackups[0].FullName)) {
            $rules=(Get-Acl -LiteralPath $path).GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])
            foreach($rule in $rules){if($rule.IdentityReference.Value -eq 'S-1-5-32-545' -and $rule.AccessControlType -eq 'Allow'){Assert (-not($rule.FileSystemRights -band [Security.AccessControl.FileSystemRights]::Write)) 'Ordinary users can modify connection settings or their backup.'}}
        }
        $beforeFailure=(Get-FileHash $oldConfig).Hash
        $lock=[IO.File]::Open($oldConfig,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::None)
        try {Reject {& (Join-Path $package 'configure-lan.ps1') -GatewayUrl 'https://192.168.30.99:8443' -DeviceCertificateThumbprint 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'} 'Locked config replacement unexpectedly succeeded.'} finally {$lock.Dispose()}
        Assert ((Get-FileHash $oldConfig).Hash -eq $beforeFailure) 'Failed replacement changed the previous connection settings.'
        Assert (@(Get-ChildItem $managed -Filter '*.tmp').Count -eq 0) 'Failed replacement left an incomplete managed config.'
    } finally {$env:ProgramData=$originalCommonData}
    Write-Host 'PASS: LAN migration saves an exact previous-configuration backup before atomic replacement.'

    . (Join-Path $package 'pairing-core.ps1')
    $script:realRootImport=${function:Add-PairingRoot}
    function Add-PairingRoot([byte[]]$Bytes) {
        $public=[Security.Cryptography.X509Certificates.X509Certificate2]::new($Bytes)
        $machine=New-Object Security.Cryptography.X509Certificates.X509Store('Root','LocalMachine')
        try{$machine.Open('ReadWrite');$machine.Add($public);$script:roots+=$public.Thumbprint}finally{$machine.Close()}
        return (& $script:realRootImport $Bytes)
    }
    $data=Join-Path $fixture 'gateway';$profile=Join-Path $fixture 'employee'
    $gatewayInstall=Join-Path $fixture 'gateway-source';New-Item -ItemType Directory $gatewayInstall|Out-Null
    '{"supabaseAnonKey":"fixture-public-key"}'|Set-Content (Join-Path $gatewayInstall 'gateway.example.json')
    $gateway=Initialize-PairingGateway '127.0.0.1' $data $gatewayInstall
    $requestPath=Join-Path $fixture 'request.json';$replyPath=Join-Path $fixture 'reply.json'
    $request=New-EmployeePairingRequest $requestPath $profile;$leafThumb=$request.thumbprint
    Approve-EmployeePairing $requestPath $replyPath $data|Out-Null
    Import-EmployeePairing $replyPath $profile (Get-PairingCode ([Convert]::FromBase64String($gateway.root)))|Out-Null
    $pending=Join-Path $profile 'pending-pairing.json'
    $request.createdAt=[DateTime]::UtcNow.AddDays(-8).ToString('o');Write-PairingJson $pending $request
    Copy-Item $pending $requestPath -Force
    $oldHash=(Get-FileHash $pending).Hash
    Reject {Approve-EmployeePairing $requestPath $replyPath $data} 'Expired request unexpectedly accepted.'
    $journal=Join-Path $profile 'desktop-session.dpapi';'unchanged pending timer fixture'|Set-Content $journal
    $journalHash=(Get-FileHash $journal).Hash
    $fresh=New-EmployeePairingRequest $requestPath $profile
    Assert ($fresh.requestId -ne $request.requestId) 'Expired request ID was reused.'
    Assert ($fresh.thumbprint -eq $request.thumbprint -and $fresh.certificate -eq $request.certificate -and $fresh.root -eq $request.root) 'Renewal replaced the existing key/certificate identity.'
    Assert ([DateTime]::Parse($fresh.createdAt).ToUniversalTime() -gt [DateTime]::UtcNow.AddMinutes(-1)) 'Renewal timestamp is stale.'
    $backups=@(Get-ChildItem $profile -Filter 'request-before-renewal-*.json')
    Assert ($backups.Count -eq 1 -and (Get-FileHash $backups[0].FullName).Hash -eq $oldHash) 'Exact old public request was not preserved.'
    Assert ((Get-FileHash $journal).Hash -eq $journalHash) 'Pending timer data changed.'
    $cert=Get-Item ('Cert:\CurrentUser\My\'+$leafThumb)
    Assert $cert.HasPrivateKey 'Renewal lost the original private key.'
    Reject {$cert.Export([Security.Cryptography.X509Certificates.X509ContentType]::Pfx,'audit')} 'Renewal made the key exportable.'
    Approve-EmployeePairing $requestPath $replyPath $data|Out-Null
    Assert (@(Read-PairingJson (Join-Path $data 'enrolled-devices.json')).Count -eq 1) 'Renewal duplicated device enrollment.'
    Import-EmployeePairing $replyPath $profile (Get-PairingCode ([Convert]::FromBase64String($gateway.root)))|Out-Null
    $again=New-EmployeePairingRequest $requestPath $profile
    Assert ($again.requestId -eq $fresh.requestId -and @(Get-ChildItem $profile -Filter 'request-before-renewal-*.json').Count -eq 1) 'Current request was unnecessarily renewed.'
    $fresh.userSid='S-1-5-18';Write-PairingJson $pending $fresh
    $badHash=(Get-FileHash $pending).Hash
    Reject {New-EmployeePairingRequest $requestPath $profile} 'Wrong profile request renewed.'
    Assert ((Get-FileHash $pending).Hash -eq $badHash) 'Rejected request was changed.'
    Write-Host 'PASS: 8-day-old imported request renews with atomic exact backup; same non-exportable private key; tracker state preserved; refreshed approval/import works; current request reuse and wrong-profile rejection.'
} finally {
    if($leafThumb -and (Test-Path ('Cert:\CurrentUser\My\'+$leafThumb))){Remove-Item ('Cert:\CurrentUser\My\'+$leafThumb) -DeleteKey}
    foreach($thumb in $script:roots){foreach($store in @('CurrentUser','LocalMachine')){if(Test-Path ('Cert:\'+$store+'\Root\'+$thumb)){Remove-Item ('Cert:\'+$store+'\Root\'+$thumb)}}}
    Remove-Item -LiteralPath $fixture -Recurse -Force -ErrorAction SilentlyContinue
}
