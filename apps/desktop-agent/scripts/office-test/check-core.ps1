$ErrorActionPreference='Stop'
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
        Require $script:checkedCertificate.HasPrivateKey 'Employee private key missing in this Windows account.'
        Require ($script:checkedCertificate.NotBefore -le (Get-Date) -and $script:checkedCertificate.NotAfter -gt (Get-Date)) 'Employee certificate is not currently valid.'
        Require ($script:checkedCertificate.Verify()) 'Employee certificate trust chain failed.'
        'Current-profile certificate/private key valid; expires '+$script:checkedCertificate.NotAfter.ToString('o')
    }
    $certificate=$script:checkedCertificate
    Invoke-OfficeCheck 'employee.gateway-mutual-tls' {
        $script:checkedHealth=$null
        Require ($lan -and $certificate) 'BLOCKED: LAN settings or current-profile certificate missing.'
        try {$response=Invoke-WebRequest -Uri ($lan.gatewayUrl.TrimEnd('/')+'/health') -Certificate $certificate -UseBasicParsing -TimeoutSec 10 -MaximumRedirection 0 -DisableKeepAlive}catch{throw ('Gateway TLS/connection failed: '+$_.Exception.GetType().Name)}
        $identity=$response.Content|ConvertFrom-Json
        Require ($identity.backend -eq 'https://nzlajptokbcgeaifgnoq.supabase.co' -and $identity.protocol -eq 1) 'Gateway identifies a different backend or protocol.'
        $script:checkedHealth=$response
        'Enrolled HTTPS connection reached the production-configured gateway.'
    }
    $health=$script:checkedHealth
    Invoke-OfficeCheck 'employee.gateway-clock' {
        Require $health 'BLOCKED: no gateway response.'
        $server=[DateTimeOffset]::Parse($health.Headers.Date)
        $difference=[Math]::Abs(([DateTimeOffset]::UtcNow-$server).TotalSeconds)
        Require ($difference -le 30) "Gateway/client clocks differ by $([int]$difference) seconds. IT must correct clock synchronization."
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

function Get-GatewayChecks($DataDirectory=(Join-Path $env:ProgramData 'Mandala Gateway')) {
    $task=$null;$config=$null;$script:checkedTask=$null
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
    Invoke-OfficeCheck 'gateway.production-internet' {
        Require $config 'BLOCKED: gateway configuration unavailable.'
        try {Invoke-WebRequest -Uri 'https://nzlajptokbcgeaifgnoq.supabase.co/auth/v1/settings' -Headers @{apikey=$config.supabaseAnonKey} -UseBasicParsing -TimeoutSec 10 -MaximumRedirection 0|Out-Null}catch{throw 'Production auth endpoint rejected the gateway key or is unreachable.'}
        'Production reachable and gateway public key accepted.'
    }
    Invoke-OfficeCheck 'gateway.firewall' {
        $rule=Get-NetFirewallRule -DisplayName 'Mandala guided gateway HTTPS' -ErrorAction Stop
        Require (@($rule|Where-Object {$_.Enabled -eq 'True' -and $_.Direction -eq 'Inbound' -and $_.Action -eq 'Allow'}).Count -gt 0) 'Expected enabled inbound gateway firewall rule missing.'
        Require (@($rule|Get-NetFirewallPortFilter|Where-Object {$_.Protocol -eq 'TCP' -and $_.LocalPort -eq '8443'}).Count -gt 0) 'Gateway firewall rule is not restricted to TCP 8443.'
        $addresses=@($rule|Get-NetFirewallAddressFilter)
        Require (@($addresses|Where-Object {'Any' -in $_.RemoteAddress}).Count -eq 0) 'Gateway inbound rule allows Any remote address instead of the employee subnet.'
        Require $config 'BLOCKED: gateway configuration unavailable.'
        $adapter=@(Get-NetIPAddress -AddressFamily IPv4|Where-Object {$_.IPAddress -eq $config.bindAddress})
        Require ($adapter.Count -eq 1) 'Gateway address must identify one adapter.'
        $profiles=@(Get-NetConnectionProfile -InterfaceIndex $adapter[0].InterfaceIndex -ErrorAction SilentlyContinue)
        Require ($profiles.Count -gt 0) 'Gateway adapter has no active network profile.'
        $public=@($profiles|Where-Object {$_.NetworkCategory -eq 'Public'}).Count -gt 0
        if($public) {
            Require ([string]$rule.Profile -eq 'Any' -or [string]$rule.Profile -match 'Public') 'Gateway adapter is Public but the gateway firewall rule does not cover Public. Use the scoped gateway repair.'
            $interfaces=@(($rule|Get-NetFirewallInterfaceFilter).InterfaceAlias)
            $locals=@(($rule|Get-NetFirewallAddressFilter).LocalAddress)
            $program=($rule|Get-NetFirewallApplicationFilter).Program
            Require ($interfaces.Count -eq 1 -and $interfaces[0] -eq $adapter[0].InterfaceAlias -and $locals.Count -eq 1 -and $locals[0] -eq $config.bindAddress -and $program -eq $script:checkedTask.Actions[0].Execute) 'Public-profile access must be restricted to the exact gateway adapter, address and runtime, as well as employee subnet and port.'
        }
        'Gateway firewall covers its actual adapter profile; Public access, if enabled, is scoped to the exact gateway adapter/IP/program and existing employee subnet.'
    }
    Invoke-OfficeCheck 'gateway.listener' {
        Require $config 'BLOCKED: gateway configuration unavailable.'
        Require (@(Get-NetTCPConnection -LocalPort 8443 -State Listen -ErrorAction SilentlyContinue|Where-Object {$_.LocalAddress -eq $config.bindAddress}).Count -gt 0) 'Gateway is not listening on its configured address and port.'
        'Configured HTTPS listener present.'
    }
    Invoke-OfficeCheck 'gateway.certificate-and-enrollment' {
        Require $config 'BLOCKED: gateway configuration unavailable.'
        Require $config.serverPfx 'Guided gateway PFX missing; preserve manual configuration and report it.'
        $server=[Security.Cryptography.X509Certificates.X509Certificate2]::new($config.serverPfx,$config.serverPfxPassword)
        try {
            Require ($server.HasPrivateKey -and $server.NotBefore -le (Get-Date) -and $server.NotAfter -gt (Get-Date)) 'Gateway certificate/key is missing or outside its validity period.'
            $enrolled=@(Get-Content -LiteralPath $config.enrolledDevices -Raw|ConvertFrom-Json)
            Require ($enrolled.Count -gt 0) 'No employee devices are enrolled.'
            'Server certificate valid until '+$server.NotAfter.ToString('o')+'; enrolled device count='+$enrolled.Count
        } finally {$server.Dispose()}
    }
}
