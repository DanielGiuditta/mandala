$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'gateway-repair\repair-core.ps1')
function Get-GatewayCertificateSha256($Certificate) {
    Require $Certificate 'Verified gateway certificate was not available.'
    $hash=[Security.Cryptography.SHA256]::Create()
    try {return [BitConverter]::ToString($hash.ComputeHash($Certificate.GetRawCertData())).Replace('-','').ToLowerInvariant()} finally {$hash.Dispose()}
}
function Require($Condition,$Message) { if(-not $Condition) { throw $Message } }
function Get-IstTime { [TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([DateTimeOffset]::UtcNow,'India Standard Time').ToString('yyyy-MM-dd hh:mm:ss tt')+' IST' }
function New-CheckResult($Id,$Status,$Detail) { [pscustomobject]@{Id=$Id;Status=$Status;Detail=$Detail;Utc=[DateTimeOffset]::UtcNow.ToString('o');Ist=(Get-IstTime)} }
function Invoke-OfficeCheck($Id,[scriptblock]$Action) {
    try { $detail=(& $Action | Out-String).Trim(); New-CheckResult $Id 'PASS' $detail }
    catch { New-CheckResult $Id 'FAIL' $_.Exception.Message }
}
function Read-AgentEvents($Path,[DateTimeOffset]$Since) {
    if(-not (Test-Path -LiteralPath $Path)) { return }
    foreach($line in @(Get-Content -LiteralPath $Path -Tail 5000)) {
        if($line -notmatch '\| UTC (?<utc>[^|]+) \| (?<event>[^|]+) \| (?<detail>.*)$') { continue }
        $stamp=[DateTimeOffset]::MinValue
        if(-not [DateTimeOffset]::TryParse($Matches.utc.Trim(),[ref]$stamp) -or $stamp -lt $Since) { continue }
        # Export only fixed, structured facts. Never copy log exception bodies,
        # session.dat, private keys, configuration keys or encrypted journals.
        $name=$Matches.event.Trim(); $detail=$Matches.detail
        $item=[ordered]@{Utc=$stamp.ToString('o');Event=$name}
        if($name -eq 'lan-time-confirmed' -and $detail -match '^sessionId=([a-fA-F0-9-]{36}); entryId=([a-fA-F0-9-]{36}|under-rounding-threshold)$') {
            $item.SessionId=$Matches[1];$item.EntryId=$Matches[2]
        } elseif($name -eq 'lan-save-pending' -and $detail -match '^sessionId=([a-fA-F0-9-]{36});') { $item.SessionId=$Matches[1]
        } elseif($name -in @('switch-confirmation-shown','idle-confirmation-shown','stop-confirmation-shown','pending-save-confirmation-shown')) {
            if($detail -match '^entryId=([a-fA-F0-9-]{36});') { $item.EntryId=$Matches[1] }
        } elseif($name -eq 'startup' -and $detail -match '^version=([^;]+); backend=(https://[a-z0-9]+\.supabase\.co)/?$') {
            $item.Version=$Matches[1];$item.Backend=$Matches[2]
        } elseif($name -eq 'tracker-loaded' -and $detail -match '^email=([^;]+); projects=(\d+);') {
            $item.Email=$Matches[1];$item.ProjectCount=[int]$Matches[2]
        } elseif($name -match '(failure|not-saved|unreadable)$') { $item.Detail='Failure recorded; use the in-app diagnostics export if requested.'
        } else { continue }
        [pscustomobject]$item
    }
}
function Test-ScenarioEvidence($Events,$ExpectedCount,$Kind) {
    $receipts=@($Events | Where-Object {$_.Event -eq 'lan-time-confirmed'} | Sort-Object SessionId -Unique)
    Require ($receipts.Count -eq $ExpectedCount) "Expected $ExpectedCount confirmed sessions; found $($receipts.Count). Do not repeat the test; preserve the report."
    Require (@($receipts | Where-Object {$_.EntryId -eq 'under-rounding-threshold'}).Count -eq 0) 'A session was too short to create a real time entry.'
    Require (@($receipts.EntryId | Select-Object -Unique).Count -eq $ExpectedCount) 'Different sessions reported the same saved entry.'
    if($Kind -eq 'switch') { Require (@($Events | Where-Object {$_.Event -eq 'switch-confirmation-shown'}).Count -gt 0) 'Switch confirmation was not recorded.' }
    if($Kind -eq 'idle') { Require (@($Events | Where-Object {$_.Event -eq 'idle-confirmation-shown'}).Count -gt 0) 'Idle-pause confirmation was not recorded.' }
    if($Kind -eq 'offline') {
        $pending=@($Events | Where-Object {$_.Event -eq 'lan-save-pending' -and $_.SessionId -eq $receipts[0].SessionId -and [DateTimeOffset]$_.Utc -lt [DateTimeOffset]$receipts[0].Utc})
        Require ($pending.Count -gt 0) 'No pending-save event followed by a receipt for the same session was recorded.'
    }
    return $receipts
}
function Get-EmployeeChecks($Candidates,$Approved) {
    $script:checkedGatewayCertificateSha256=$null
    $selected=Select-MandalaAgent $Candidates
    $agent=if($selected){$selected.Path}else{$null}
    Invoke-OfficeCheck 'employee.account-context' {
        Require (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) 'Run employee tests normally in the employee account, not as administrator.'
        [Security.Principal.WindowsIdentity]::GetCurrent().Name
    }
    Invoke-OfficeCheck 'employee.installed-agent' { Require $agent 'No agent executable found in registration, standard folders, running processes or Start/Desktop shortcuts. Use the included installer only on the employee PC; then run preflight again in this session.'; $agent }
    Invoke-OfficeCheck 'employee.version-and-binary' {
        Require $agent 'BLOCKED: agent executable unavailable.'
        $version=(Get-Item -LiteralPath $agent).VersionInfo.ProductVersion
        Require ($version -match '^1\.0\.15(?:\.|\+|$)') "Expected approved agent 1.0.15; found $version. Do not downgrade a newer agent automatically."
        Require ((Get-FileHash -LiteralPath $agent -Algorithm SHA256).Hash.ToLowerInvariant() -eq $Approved.agentSha256) 'Agent executable differs from the audited 1.0.15 installation.'
        "version=$version; binary matches audited installer"
    }
    Invoke-OfficeCheck 'employee.production-backend' { Assert-MandalaAgent $agent ([Environment]::GetFolderPath('CommonApplicationData')); 'nzlajptokbcgeaifgnoq' }
    Invoke-OfficeCheck 'employee.startup-shortcut' {
        Require $agent 'BLOCKED: agent unavailable.'
        $count=0;$wrong=0;$shell=New-Object -ComObject WScript.Shell
        try { foreach($dir in @([Environment]::GetFolderPath('Startup'),[Environment]::GetFolderPath('CommonStartup'))) {
            foreach($file in @(Get-ChildItem -LiteralPath $dir -Filter '*.lnk' -ErrorAction SilentlyContinue)) {
                $link=$shell.CreateShortcut($file.FullName)
                if($link.TargetPath -eq $agent -and -not $link.Arguments) {$count++}
                if(Test-MandalaSetupShortcut $link $file.BaseName) {$wrong++}
            }
        }} finally {[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($shell)}
        Require ($count -eq 1 -and $wrong -eq 0) "Found $count agent launchers and $wrong setup launchers. Run the included startup repair, then repeat preflight."
        'Exactly one agent launcher; no recognized setup wizard launcher.'
    }
    Invoke-OfficeCheck 'employee.startup-enabled' {
        foreach($key in @('HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\StartupFolder','HKLM:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\StartupFolder')) {
            $value=Get-ItemProperty -LiteralPath $key -Name 'Mandala Agent.lnk' -ErrorAction SilentlyContinue
            Require (-not ($value -and $value.'Mandala Agent.lnk'[0] -in @(3,7))) 'Windows has disabled Mandala Agent in Startup apps. Enable it and rerun preflight.'
        }
        'No known disabled flag for Mandala Agent.lnk. Real sign-in test is still required.'
    }
    $lan=$null;$certificate=$null;$health=$null
    Invoke-OfficeCheck 'employee.lan-settings' {
        $script:checkedLan=$null
        $file=Join-Path $env:ProgramData 'Mandala Agent\lan.config.json'
        Require (Test-Path -LiteralPath $file) 'LAN pairing settings are missing. Complete connection with the approved employee pairing ZIP; do not select gateway mode on this PC.'
        try {$script:checkedLan=Get-Content -LiteralPath $file -Raw|ConvertFrom-Json}catch{throw 'LAN settings are unreadable.'}
        $uri=[Uri]$script:checkedLan.gatewayUrl
        Require ($uri.Scheme -eq 'https' -and $uri.AbsolutePath -eq '/' -and -not $uri.UserInfo -and -not $uri.Query -and -not $uri.Fragment) 'Invalid LAN gateway origin.'
        Require ($script:checkedLan.deviceCertificateThumbprint -match '^[a-fA-F0-9]{40}$') 'Invalid employee certificate thumbprint.'
        $uri.AbsoluteUri
    }
    $lan=$script:checkedLan
    Invoke-OfficeCheck 'employee.certificate' {
        $script:checkedCertificate=$null
        Require $lan 'BLOCKED: no readable LAN settings.'
        $script:checkedCertificate=Get-Item -LiteralPath ('Cert:\CurrentUser\My\'+$lan.deviceCertificateThumbprint) -ErrorAction Stop
        Assert-EmployeeCertificate $script:checkedCertificate $lan.deviceCertificateThumbprint
    }
    $certificate=$script:checkedCertificate
    Invoke-OfficeCheck 'employee.gateway-mutual-tls' {
        $script:checkedHealth=$null
        Require ($lan -and $certificate) 'BLOCKED: LAN settings or current-profile certificate missing.'
        try {$response=Invoke-WebRequest -Uri ($lan.gatewayUrl.TrimEnd('/')+'/health') -Certificate $certificate -UseBasicParsing -TimeoutSec 10 -MaximumRedirection 0 -DisableKeepAlive}catch{throw ('Gateway TLS/connection failed: '+$_.Exception.GetType().Name)}
        $identity=$response.Content|ConvertFrom-Json
        Require ($identity.backend -eq 'https://nzlajptokbcgeaifgnoq.supabase.co' -and $identity.protocol -eq 1) 'Gateway identifies a different backend or protocol.'
        $script:checkedGatewayCertificateSha256=Get-GatewayCertificateSha256 ([Net.ServicePointManager]::FindServicePoint([Uri]$lan.gatewayUrl).Certificate)
        $script:checkedHealth=$response
        'Enrolled HTTPS connection reached the production-configured gateway.'
    }
    $health=$script:checkedHealth
    Invoke-OfficeCheck 'employee.gateway-clock' {
        Require $health 'BLOCKED: no gateway response.'
        $server=[DateTimeOffset]::Parse($health.Headers.Date)
        $difference=[Math]::Abs(([DateTimeOffset]::UtcNow-$server).TotalSeconds)
        Require ($difference -le 5) "Gateway/client clocks differ by $([int]$difference) seconds. IT must correct clock synchronization."
        "Gateway/client difference=$([int]$difference) seconds"
    }
    Invoke-OfficeCheck 'employee.unenrolled-request-denied' {
        Require ($health -and $lan) 'BLOCKED: first prove that the enrolled TLS connection works.'
        $denied=$false
        try {Invoke-WebRequest -Uri ($lan.gatewayUrl.TrimEnd('/')+'/health') -UseBasicParsing -TimeoutSec 8 -MaximumRedirection 0 -DisableKeepAlive|Out-Null}catch{$denied=$true}
        Require $denied 'Gateway accepted a request without the employee certificate.'
        'Request without client certificate was rejected.'
    }
    Invoke-OfficeCheck 'employee.diagnostics-readable' {
        $path=Join-Path $env:LOCALAPPDATA 'Mandala Agent\agent.log'
        Require (Test-Path -LiteralPath $path) 'No agent diagnostic log yet. Open the verified agent and sign in, then repeat preflight.'
        Get-Content -LiteralPath $path -Tail 1|Out-Null
        'Diagnostic log readable. Authentication files and time journals will not be exported.'
    }
}

function Get-GatewayChecks($DataDirectory=(Join-Path $env:ProgramData 'Mandala Gateway'),$RepairSource=(Join-Path $PSScriptRoot 'gateway-repair')) {
    $task=$null;$config=$null;$script:checkedTask=$null;$script:checkedGatewayCertificateSha256=$null
    Invoke-OfficeCheck 'gateway.task' {
        $script:checkedTask=Get-ScheduledTask -TaskName 'Mandala LAN Gateway' -ErrorAction Stop
        Require ($script:checkedTask.State -eq 'Running') 'Gateway task is not running. Complete gateway setup on this dedicated computer.'
        Require ($script:checkedTask.Principal.UserId -in @('LOCAL SERVICE','NT AUTHORITY\LOCAL SERVICE','S-1-5-19')) 'Gateway is not running as Local Service.'
        Require ($script:checkedTask.Principal.RunLevel -eq 'Limited') 'Gateway task has unexpected elevated privileges.'
        Require (@($script:checkedTask.Triggers|Where-Object {$_.CimClass.CimClassName -eq 'MSFT_TaskBootTrigger'}).Count -gt 0) 'No boot trigger found.'
        $info=Get-ScheduledTaskInfo -TaskName 'Mandala LAN Gateway'
        'Running with boot trigger and Local Service; last run '+$info.LastRunTime.ToString('o')
    }
    Invoke-OfficeCheck 'gateway.configuration' {
        $script:checkedGatewayConfig=$null
        try {$script:checkedGatewayConfig=Get-Content -LiteralPath (Join-Path $DataDirectory 'gateway.json') -Raw|ConvertFrom-Json}catch{throw 'Gateway configuration missing/unreadable. IT should run the gateway check as administrator; do not copy the configuration into the report.'}
        $c=$script:checkedGatewayConfig
        Require ($c.bindAddress -and $c.port -eq 8443 -and $c.supabaseAnonKey) 'Gateway settings are incomplete.'
        Require (@(Get-NetIPAddress -AddressFamily IPv4|Where-Object {$_.IPAddress -eq $c.bindAddress}).Count -gt 0) 'Reserved gateway address is not assigned to this PC.'
        'Address='+$c.bindAddress+'; port='+$c.port
    }
    Invoke-OfficeCheck 'gateway.installed-release' {
        Require $script:checkedTask 'BLOCKED: gateway task unavailable.'
        $directory=$script:checkedTask.Actions[0].WorkingDirectory
        Require $directory 'Gateway task has no installation working directory.'
        $release=Get-Content -LiteralPath (Join-Path $directory 'gateway-release.json') -Raw|ConvertFrom-Json
        Require ($release.version -eq '1.1.0' -and $release.backendProjectRef -eq 'nzlajptokbcgeaifgnoq') 'Gateway release version/backend differs from approved 1.1.0 production setup.'
        Require ((Get-FileHash -LiteralPath (Join-Path $directory 'runtime\node.exe') -Algorithm SHA256).Hash.ToLowerInvariant() -eq $release.nodeSha256) 'Bundled gateway runtime differs from its release manifest.'
        'Gateway 1.1.0; production backend; bundled runtime matches manifest.'
    }
    $config=$script:checkedGatewayConfig
    Invoke-OfficeCheck 'gateway.startup-configuration' {
        Require $script:checkedTask 'BLOCKED: gateway task unavailable.'
        $approvedGateway=Get-Content -LiteralPath (Join-Path $RepairSource 'approved-gateway.json') -Raw|ConvertFrom-Json
        Get-GatewayRepairPlan $approvedGateway $DataDirectory $RepairSource|Out-Null
        $startup=Get-MandalaDurableGatewayStartup $script:checkedTask.Actions[0].WorkingDirectory $DataDirectory $RepairSource
        Require $startup.Passed $startup.Detail
        'Verified durable launcher, setup integration, boot delay and persistent retry settings.'
    }
    $script:checkedProductionClock=$null
    Invoke-OfficeCheck 'gateway.production-internet' {
        Require $config 'BLOCKED: gateway configuration unavailable.'
        try {
            $before=[DateTimeOffset]::UtcNow;$watch=[Diagnostics.Stopwatch]::StartNew()
            $response=Invoke-WebRequest -Uri 'https://nzlajptokbcgeaifgnoq.supabase.co/auth/v1/settings' -Headers @{apikey=$config.supabaseAnonKey} -UseBasicParsing -TimeoutSec 10 -MaximumRedirection 0
            $after=[DateTimeOffset]::UtcNow;$watch.Stop()
            $script:checkedProductionClock=@{Date=$response.Headers.Date;Before=$before;After=$after;Elapsed=$watch.Elapsed.TotalSeconds}
        }catch{throw 'Production auth endpoint rejected the gateway key or is unreachable.'}
        'Production reachable and gateway public key accepted.'
    }
    Invoke-OfficeCheck 'gateway.production-clock' {
        Require $script:checkedProductionClock 'BLOCKED: no authenticated production HTTPS response.'
        $sample=$script:checkedProductionClock
        Assert-ProductionClock $sample.Date $sample.Before $sample.After $sample.Elapsed
    }
    Invoke-OfficeCheck 'gateway.firewall' {
        Require ($config -and $script:checkedTask) 'BLOCKED: gateway configuration/task unavailable.'
        $rules=@(Get-NetFirewallRule -DisplayName 'Mandala guided gateway HTTPS' -ErrorAction Stop)
        Require ($rules.Count -eq 1) 'Expected exactly one named gateway firewall rule.'
        $rule=$rules[0]
        $adapter=@(Get-NetIPAddress -AddressFamily IPv4|Where-Object {$_.IPAddress -eq $config.bindAddress})
        Require ($adapter.Count -eq 1) 'Gateway address must identify one adapter.'
        $profiles=@(Get-NetConnectionProfile -InterfaceIndex $adapter[0].InterfaceIndex -ErrorAction SilentlyContinue)
        $shape=[pscustomobject]@{Enabled=[string]$rule.Enabled;Direction=[string]$rule.Direction;Action=[string]$rule.Action;Profile=[string]$rule.Profile;Ports=@($rule|Get-NetFirewallPortFilter);Addresses=@($rule|Get-NetFirewallAddressFilter);Programs=@($rule|Get-NetFirewallApplicationFilter);Interfaces=@($rule|Get-NetFirewallInterfaceFilter)}
        Assert-GatewayFirewallShape $shape $config.bindAddress $adapter[0].InterfaceAlias $script:checkedTask.Actions[0].Execute @($profiles|ForEach-Object {[string]$_.NetworkCategory})
        'One enabled rule covers the actual adapter profile and only the private employee subnet, exact gateway adapter/IP/program and TCP 8443.'
    }
    Invoke-OfficeCheck 'gateway.listener' {
        Require ($config -and $script:checkedTask) 'BLOCKED: gateway configuration/task unavailable.'
        Require (Test-MandalaGatewayListener $script:checkedTask.Actions[0].WorkingDirectory $DataDirectory) 'Gateway listener is missing or belongs to a different executable, command or Windows account.'
        'Configured listener belongs to the expected gateway command running as Local Service.'
    }
    Invoke-OfficeCheck 'gateway.certificate-and-enrollment' {
        Require $config 'BLOCKED: gateway configuration unavailable.'
        Require $config.serverPfx 'Guided gateway PFX missing; preserve manual configuration and report it.'
        $server=[Security.Cryptography.X509Certificates.X509Certificate2]::new($config.serverPfx,$config.serverPfxPassword)
        try {
            Require ($server.HasPrivateKey -and $server.NotBefore -le (Get-Date) -and $server.NotAfter -gt (Get-Date)) 'Gateway certificate/key is missing or outside its validity period.'
            $enrolled=@(Get-Content -LiteralPath $config.enrolledDevices -Raw|ConvertFrom-Json)
            Require ($enrolled.Count -gt 0) 'No employee devices are enrolled.'
            $script:checkedGatewayCertificateSha256=Get-GatewayCertificateSha256 $server
            'Server certificate valid until '+$server.NotAfter.ToString('o')+'; enrolled device count='+$enrolled.Count
        } finally {$server.Dispose()}
    }
}

function Assert-GatewayFirewallShape($Rule,$Address,$InterfaceAlias,$Node,$Categories) {
    Require ($Rule.Enabled -eq 'True' -and $Rule.Direction -eq 'Inbound' -and $Rule.Action -eq 'Allow') 'Expected enabled inbound allow gateway rule.'
    Require ($Rule.Ports.Count -eq 1 -and $Rule.Ports[0].Protocol -eq 'TCP' -and @($Rule.Ports[0].LocalPort).Count -eq 1 -and $Rule.Ports[0].LocalPort -eq '8443') 'Gateway rule must allow only TCP 8443.'
    Require ($Rule.Addresses.Count -eq 1) 'Gateway address filter is ambiguous.'
    $remotes=@($Rule.Addresses[0].RemoteAddress);$locals=@($Rule.Addresses[0].LocalAddress)
    Require ($remotes.Count -gt 0 -and @($remotes|Where-Object {-not(Test-PrivateGatewayScope $_)}).Count -eq 0) 'Gateway remote scope must contain only explicit private employee IP addresses/subnets.'
    Require ($locals.Count -eq 1 -and $locals[0] -eq $Address) 'Gateway rule local address is not restricted to the configured IP.'
    Require ($Rule.Interfaces.Count -eq 1 -and @($Rule.Interfaces[0].InterfaceAlias).Count -eq 1 -and $Rule.Interfaces[0].InterfaceAlias -eq $InterfaceAlias) 'Gateway rule is not restricted to its exact adapter.'
    Require ($Rule.Programs.Count -eq 1 -and $Rule.Programs[0].Program -eq $Node) 'Gateway rule is not restricted to its audited runtime.'
    Require ($Categories.Count -gt 0) 'Gateway adapter has no active network profile.'
    $allowed=@($Rule.Profile.Split(',')|ForEach-Object {$_.Trim()})
    foreach($category in $Categories) {
        $profile=if($category -eq 'DomainAuthenticated'){'Domain'}else{$category}
        Require ($profile -in @('Domain','Private','Public') -and ('Any' -in $allowed -or $profile -in $allowed)) ('Gateway rule does not cover active profile '+$profile+'.')
    }
}

# Diagnostic only: this does not change TLS validation, Windows trust, enrollment,
# application transport or any machine setting. Private pairing issuers have no
# revocation service; gateway enrollment remains independently checked above.
function Assert-EmployeeCertificate($Certificate,[string]$ExpectedThumbprint) {
    Require ($Certificate.Thumbprint -eq $ExpectedThumbprint) 'Employee certificate identity differs from pairing settings.'
    Require $Certificate.HasPrivateKey 'Employee private key missing in this Windows account.'
    $basic=@($Certificate.Extensions|Where-Object {$_.Oid.Value -eq '2.5.29.19'})
    $usage=@($Certificate.Extensions|Where-Object {$_.Oid.Value -eq '2.5.29.15'})
    $eku=@($Certificate.Extensions|Where-Object {$_.Oid.Value -eq '2.5.29.37'})
    Require ($basic.Count -eq 1 -and -not $basic[0].CertificateAuthority) 'Employee certificate must be an explicit non-CA leaf.'
    Require ($usage.Count -eq 1 -and ($usage[0].KeyUsages -band [Security.Cryptography.X509Certificates.X509KeyUsageFlags]::DigitalSignature)) 'Employee certificate lacks digital-signature key usage.'
    Require ($eku.Count -eq 1 -and @($eku[0].EnhancedKeyUsages|Where-Object {$_.Value -eq '1.3.6.1.5.5.7.3.2'}).Count -eq 1) 'Employee certificate lacks explicit client-authentication purpose.'
    $chain=New-Object Security.Cryptography.X509Certificates.X509Chain
    try {
        $chain.ChainPolicy.VerificationFlags=[Security.Cryptography.X509Certificates.X509VerificationFlags]::NoFlag
        $chain.ChainPolicy.RevocationMode=[Security.Cryptography.X509Certificates.X509RevocationMode]::NoCheck
        $chain.ChainPolicy.ApplicationPolicy.Add([Security.Cryptography.Oid]::new('1.3.6.1.5.5.7.3.2'))
        Require ($chain.Build($Certificate)) 'Employee certificate signature, validity, purpose or installed-root trust check failed.'
        # The no-revocation diagnostic applies only to the existing one-use
        # pairing format. Other issuers still require the ordinary Verify check.
        $root=$chain.ChainElements[$chain.ChainElements.Count-1].Certificate
        $pairing=($chain.ChainElements.Count -eq 2 -and $root.Subject -match '^CN=Mandala pairing issuer [a-fA-F0-9]{32}$')
        if(-not $pairing){Require ($Certificate.Verify()) 'Employee certificate revocation/trust validation failed for a non-pairing issuer.'}
        'Paired identity, private key, client-auth purpose, signature, dates and installed-root trust valid; gateway enrollment checked separately. Expires '+$Certificate.NotAfter.ToString('o')
    } finally {$chain.Dispose()}
}

function Assert-ProductionClock($Date,[DateTimeOffset]$Before,[DateTimeOffset]$After,[double]$Elapsed) {
    Require ($Elapsed -ge 0 -and $Elapsed -le 4) 'Production clock sample too slow to establish accuracy; no clock setting changed.'
    Require ([Math]::Abs(($After-$Before).TotalSeconds-$Elapsed) -le 1) 'Windows clock changed during the production clock sample.'
    $server=[DateTimeOffset]::MinValue
    Require ([DateTimeOffset]::TryParse([string]$Date,[ref]$server)) 'Production HTTPS response has no valid Date header.'
    # HTTP dates have one-second resolution. The server processed the request
    # somewhere between send and receive, so compare intervals, not a point.
    $minimum=($server-$After).TotalSeconds
    $maximum=($server.AddSeconds(1)-$Before).TotalSeconds
    Require ($minimum -ge -5 -and $maximum -le 5) 'Office clock cannot be confirmed within five seconds of production. IT must inspect the configured office time source; do not repeat employee writes.'
    'Production clock offset interval='+[Math]::Round($minimum,2)+' to '+[Math]::Round($maximum,2)+' seconds; request='+[Math]::Round($Elapsed,2)+' seconds.'
}
