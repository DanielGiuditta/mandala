$ErrorActionPreference='Stop'
function Get-GatewayTaskEvidence {
    $task=Get-ScheduledTask -TaskName 'Mandala LAN Gateway' -ErrorAction SilentlyContinue
    if(-not $task){return [pscustomobject]@{Exists=$false}}
    try {$info=Get-ScheduledTaskInfo -TaskName 'Mandala LAN Gateway' -ErrorAction Stop} catch {return [pscustomobject]@{Exists=$true;State=[string]$task.State;EvidenceError='Task runtime details could not be read.';Executable=$task.Actions[0].Execute;WorkingDirectory=$task.Actions[0].WorkingDirectory}}
    [pscustomobject]@{Exists=$true;State=[string]$task.State;LastTaskResult=('0x{0:X8}' -f [uint32]$info.LastTaskResult);LastRunTime=$(if($info.LastRunTime){$info.LastRunTime.ToString('o')}else{$null});NextRunTime=$(if($info.NextRunTime){$info.NextRunTime.ToString('o')}else{$null});MissedRuns=$info.NumberOfMissedRuns;UserId=$task.Principal.UserId;Executable=$task.Actions[0].Execute;WorkingDirectory=$task.Actions[0].WorkingDirectory;BootTrigger=@($task.Triggers|Where-Object {$_.CimClass.CimClassName -eq 'MSFT_TaskBootTrigger'}).Count -gt 0;RestartCount=$task.Settings.RestartCount}
}
function Assert-ProtectedGatewayPath($Path) {
    $full=[IO.Path]::GetFullPath($Path)
    if($full.StartsWith('\\') -or ([IO.DriveInfo]::new([IO.Path]::GetPathRoot($full))).DriveType -ne 'Fixed'){throw 'Gateway repair requires protected code on a local fixed drive.'}
    $trusted=@('S-1-5-18','S-1-5-32-544','S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464')
    $walk=$full
    while($walk) {
        if(Test-Path -LiteralPath $walk) {
            if((Get-Item -LiteralPath $walk -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Gateway code/data must not use redirected links.'}
            if($walk -ne $full) {
                $replace=[Security.AccessControl.FileSystemRights]::DeleteSubdirectoriesAndFiles -bor [Security.AccessControl.FileSystemRights]::ChangePermissions -bor [Security.AccessControl.FileSystemRights]::TakeOwnership
                foreach($entry in (Get-Acl -LiteralPath $walk).GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])) {
                    if($entry.AccessControlType -eq 'Allow' -and -not ($entry.PropagationFlags -band [Security.AccessControl.PropagationFlags]::InheritOnly) -and ($entry.FileSystemRights -band $replace) -and $entry.IdentityReference.Value -notin $trusted){throw 'Gateway installation ancestor can be replaced by a non-system/non-administrator identity. IT must restore protected installation permissions.'}
                }
            }
        }
        $parent=Split-Path $walk -Parent
        if($parent -eq $walk){break};$walk=$parent
    }
    # Elevated writes may only target code protected from non-administrator edits.
    # SYSTEM, Administrators and Windows TrustedInstaller are the only writers.
    $write=[Security.AccessControl.FileSystemRights]::Write -bor [Security.AccessControl.FileSystemRights]::Delete -bor [Security.AccessControl.FileSystemRights]::ChangePermissions -bor [Security.AccessControl.FileSystemRights]::TakeOwnership
    foreach($entry in (Get-Acl -LiteralPath $full).GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])) {
        if($entry.AccessControlType -ne 'Allow' -or ($entry.PropagationFlags -band [Security.AccessControl.PropagationFlags]::InheritOnly)){continue}
        $sid=$entry.IdentityReference.Value
        if(($entry.FileSystemRights -band $write) -and $sid -notin $trusted){throw 'Gateway code is writable by a non-system/non-administrator identity. IT must restore protected installation permissions before repair.'}
    }
}
function Assert-MandalaServiceReadPolicy($Paths) {
    foreach($path in @($Paths|Select-Object -Unique)) {
        foreach($entry in (Get-Acl -LiteralPath $path).GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])) {
            $sid=$entry.IdentityReference.Value
            if($entry.AccessControlType -eq 'Deny' -and $sid -in @('S-1-5-19','S-1-1-0','S-1-5-11','S-1-5-6') -and ($entry.FileSystemRights -band [Security.AccessControl.FileSystemRights]::ReadAndExecute)){throw 'Local Service has an explicit deny permission on a required gateway file/directory. IT must review that policy; the gateway has not been stopped by this plan.'}
        }
    }
}
function Grant-MandalaServiceRead($Paths) {
    $sid=[Security.Principal.SecurityIdentifier]::new('S-1-5-19')
    Assert-MandalaServiceReadPolicy $Paths
    foreach($path in @($Paths|Select-Object -Unique)) {
        $acl=Get-Acl -LiteralPath $path
        $access=[Security.AccessControl.FileSystemAccessRule]::new($sid,[Security.AccessControl.FileSystemRights]::ReadAndExecute,[Security.AccessControl.AccessControlType]::Allow)
        $acl.AddAccessRule($access);Set-Acl -LiteralPath $path -AclObject $acl
    }
}
function Get-MandalaGatewayArguments($InstallDirectory,$DataDirectory) {
    return '"'+(Join-Path $InstallDirectory 'start-gateway-resilient.mjs')+'" "'+(Join-Path $DataDirectory 'gateway.json')+'" "'+(Join-Path $DataDirectory 'startup-status\status.json')+'"'
}
function Get-MandalaDurableGatewayStartup($InstallDirectory,$DataDirectory,$RepairSource=$PSScriptRoot) {
    try {
        $task=Get-ScheduledTask -TaskName 'Mandala LAN Gateway' -ErrorAction Stop
        $node=Join-Path $InstallDirectory 'runtime\node.exe'
        if(@($task.Actions).Count -ne 1 -or $task.Actions[0].Execute -ne $node -or $task.Actions[0].WorkingDirectory.TrimEnd('\') -ne $InstallDirectory.TrimEnd('\') -or $task.Actions[0].Arguments -ne (Get-MandalaGatewayArguments $InstallDirectory $DataDirectory)){throw 'Gateway still uses the legacy or an unexpected startup action.'}
        if($task.Principal.UserId -notin @('LOCAL SERVICE','NT AUTHORITY\LOCAL SERVICE','S-1-5-19') -or $task.Principal.RunLevel -ne 'Limited'){throw 'Gateway startup must use restricted Local Service.'}
        if(@($task.Triggers).Count -ne 1 -or $task.Triggers[0].CimClass.CimClassName -ne 'MSFT_TaskBootTrigger' -or $task.Triggers[0].Delay -ne 'PT30S' -or -not $task.Triggers[0].Enabled){throw 'Gateway delayed boot trigger is missing or disabled.'}
        $s=$task.Settings
        if(-not $s.Enabled -or $s.RestartCount -ne 999 -or $s.RestartInterval -ne 'PT1M' -or $s.ExecutionTimeLimit -ne 'PT0S' -or -not $s.StartWhenAvailable -or [string]$s.MultipleInstances -ne 'IgnoreNew' -or $s.DisallowStartIfOnBatteries -or $s.StopIfGoingOnBatteries){throw 'Gateway durable restart settings are missing or changed.'}
        foreach($map in @(@('start-gateway-resilient.mjs','start-gateway-resilient.mjs'),@('gateway-startup-core.ps1','repair-core.ps1'),@('pairing-core.ps1','pairing-core.ps1'))) {
            $installed=Join-Path $InstallDirectory $map[0];$expected=Join-Path $RepairSource $map[1]
            if(-not(Test-Path -LiteralPath $installed) -or -not(Test-Path -LiteralPath $expected) -or (Get-FileHash -LiteralPath $installed).Hash -ne (Get-FileHash -LiteralPath $expected).Hash){throw ('Installed startup helper differs from this audited kit: '+$map[0])}
        }
        return [pscustomobject]@{Passed=$true;Detail='Audited resilient startup, durable boot/retry settings and maintenance helper match.'}
    } catch {return [pscustomobject]@{Passed=$false;Detail=$_.Exception.Message}}
}
function Test-MandalaDurableGatewayStartup($InstallDirectory,$DataDirectory,$RepairSource=$PSScriptRoot) {
    return (Get-MandalaDurableGatewayStartup $InstallDirectory $DataDirectory $RepairSource).Passed
}
function Test-MandalaGatewayListener($InstallDirectory,$DataDirectory,$Address) {
    try {
        if(-not $Address){$Address=(Get-Content -LiteralPath (Join-Path $DataDirectory 'gateway.json') -Raw|ConvertFrom-Json).bindAddress}
        $listener=@(Get-NetTCPConnection -LocalPort 8443 -State Listen -ErrorAction SilentlyContinue|Where-Object {$_.LocalAddress -eq $Address})
        if($listener.Count -ne 1){return $false}
        $process=Get-CimInstance Win32_Process -Filter ('ProcessId='+$listener[0].OwningProcess) -ErrorAction Stop
        $owner=Invoke-CimMethod -InputObject $process -MethodName GetOwnerSid -ErrorAction Stop
        $node=Join-Path $InstallDirectory 'runtime\node.exe'
        $expected=Get-MandalaGatewayArguments $InstallDirectory $DataDirectory
        return ($process.ExecutablePath -eq $node -and $owner.Sid -eq 'S-1-5-19' -and ($process.CommandLine -eq ('"'+$node+'" '+$expected) -or $process.CommandLine -eq ($node+' '+$expected)) -and (Get-ScheduledTask -TaskName 'Mandala LAN Gateway').State -eq 'Running')
    } catch {return $false}
}
function Set-MandalaDurableGatewayStartup($Address,$RemoteAddresses,$DataDirectory,$InstallDirectory) {
    if(-not(Test-PrivateGatewayScope $Address) -or -not @($RemoteAddresses).Count -or @($RemoteAddresses|Where-Object {-not(Test-PrivateGatewayScope $_)}).Count){throw 'Gateway requires its existing private IPv4 employee scope.'}
    $adapter=@(Get-NetIPAddress -AddressFamily IPv4|Where-Object {$_.IPAddress -eq $Address})
    if($adapter.Count -ne 1){throw 'Gateway address must identify exactly one adapter.'}
    $node=Join-Path $InstallDirectory 'runtime\node.exe'
    foreach($path in @($InstallDirectory,(Join-Path $InstallDirectory 'runtime'),$node,(Join-Path $InstallDirectory 'gateway.mjs'),(Join-Path $InstallDirectory 'security.mjs'),(Join-Path $InstallDirectory 'start-gateway-resilient.mjs'),(Join-Path $InstallDirectory 'gateway-startup-core.ps1'),(Join-Path $InstallDirectory 'pairing-core.ps1'))){Assert-ProtectedGatewayPath $path}
    $task=Get-ScheduledTask -TaskName 'Mandala LAN Gateway' -ErrorAction SilentlyContinue
    if($task){Stop-ScheduledTask -TaskName 'Mandala LAN Gateway';for($i=0;$i -lt 50 -and (Get-ScheduledTask -TaskName 'Mandala LAN Gateway').State -eq 'Running';$i++){Start-Sleep -Milliseconds 200}}
    if(@(Get-NetTCPConnection -LocalPort 8443 -State Listen -ErrorAction SilentlyContinue|Where-Object {$_.LocalAddress -eq $Address}).Count){throw 'Gateway port is still occupied after stopping its task. No unrelated process was killed.'}
    $statusDir=Join-Path $DataDirectory 'startup-status'
    if(Test-Path -LiteralPath $statusDir){if((Get-Item -LiteralPath $statusDir).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Gateway status directory must not be redirected.'}}
    New-Item -ItemType Directory $statusDir -Force|Out-Null
    $acl=New-Object Security.AccessControl.DirectorySecurity
    $acl.SetSecurityDescriptorSddlForm('D:P(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)(A;OICI;0x1301bf;;;LS)');Set-Acl -LiteralPath $statusDir -AclObject $acl
    $rules=@(Get-NetFirewallRule -DisplayName 'Mandala guided gateway HTTPS' -ErrorAction SilentlyContinue)
    if($rules.Count -gt 1){throw 'Multiple gateway firewall rules require IT review.'}
    if($rules.Count -eq 1){Set-NetFirewallRule -Name $rules[0].Name -Enabled True -Direction Inbound -Action Allow -Profile Any -InterfaceAlias $adapter[0].InterfaceAlias -LocalAddress $Address -RemoteAddress $RemoteAddresses -Protocol TCP -LocalPort 8443 -Program $node|Out-Null}
    else{New-NetFirewallRule -DisplayName 'Mandala guided gateway HTTPS' -Enabled True -Direction Inbound -Action Allow -Profile Any -InterfaceAlias $adapter[0].InterfaceAlias -LocalAddress $Address -RemoteAddress $RemoteAddresses -Protocol TCP -LocalPort 8443 -Program $node|Out-Null}
    $action=New-ScheduledTaskAction -Execute $node -Argument (Get-MandalaGatewayArguments $InstallDirectory $DataDirectory) -WorkingDirectory $InstallDirectory
    $principal=New-ScheduledTaskPrincipal -UserId 'S-1-5-19' -LogonType ServiceAccount -RunLevel Limited
    $settings=New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
    $trigger=New-ScheduledTaskTrigger -AtStartup;$trigger.Delay='PT30S'
    Register-ScheduledTask -TaskName 'Mandala LAN Gateway' -Action $action -Principal $principal -Settings $settings -Trigger $trigger -Force|Out-Null
}
function Test-PrivateGatewayScope($Scope) {
    $parts=$Scope.Split('/');$ip=$null;$prefix=32
    if($parts.Count -gt 2 -or -not [Net.IPAddress]::TryParse($parts[0],[ref]$ip) -or $ip.AddressFamily -ne [Net.Sockets.AddressFamily]::InterNetwork){return $false}
    if($parts.Count -eq 2) {
        if(-not [int]::TryParse($parts[1],[ref]$prefix)) {
            $mask=$null
            if(-not [Net.IPAddress]::TryParse($parts[1],[ref]$mask) -or $mask.AddressFamily -ne [Net.Sockets.AddressFamily]::InterNetwork){return $false}
            $bits=($mask.GetAddressBytes()|ForEach-Object {[Convert]::ToString($_,2).PadLeft(8,'0')}) -join ''
            if($bits -notmatch '^1*0*$'){return $false};$prefix=($bits -replace '0','').Length
        }
        if($prefix -gt 32 -or $prefix -lt 0){return $false}
    }
    $b=$ip.GetAddressBytes()
    return (($b[0] -eq 10 -and $prefix -ge 8) -or ($b[0] -eq 172 -and $b[1] -ge 16 -and $b[1] -le 31 -and $prefix -ge 12) -or ($b[0] -eq 192 -and $b[1] -eq 168 -and $prefix -ge 16))
}
function Get-GatewayRepairPlan($Approved,$DataDirectory=(Join-Path $env:ProgramData 'Mandala Gateway'),$RepairSource=$PSScriptRoot) {
    $task=Get-ScheduledTask -TaskName 'Mandala LAN Gateway' -ErrorAction Stop
    $install=$task.Actions[0].WorkingDirectory
    if(-not $install -or -not (Test-Path -LiteralPath $install)){throw 'Gateway installation directory is unavailable.'}
    $install=[IO.Path]::GetFullPath($install).TrimEnd('\')
    Assert-ProtectedGatewayPath $install
    Assert-ProtectedGatewayPath (Join-Path $install 'runtime')
    foreach($file in $Approved.files.PSObject.Properties) {
        $path=Join-Path $install $file.Name
        Assert-ProtectedGatewayPath $path
        $allowed=@($file.Value)
        if($file.Name -eq 'pairing-core.ps1'){$allowed+=(Get-FileHash -LiteralPath (Join-Path $RepairSource 'pairing-core.ps1')).Hash.ToLowerInvariant()}
        if(-not(Test-Path -LiteralPath $path) -or (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -notin $allowed){throw ('Audited gateway file mismatch: '+$file.Name+'. No gateway code was changed.')}
    }
    if($Approved.version -ne '1.1.0' -or $Approved.backend -ne 'nzlajptokbcgeaifgnoq' -or -not $Approved.files.'pairing-core.ps1'){throw 'Invalid approved gateway manifest.'}
    foreach($name in @('start-gateway-resilient.mjs','gateway-startup-core.ps1')){if(Test-Path -LiteralPath (Join-Path $install $name)){Assert-ProtectedGatewayPath (Join-Path $install $name)}}
    $data=$DataDirectory
    if((Get-Item $data).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Gateway data directory must not be a redirected link.'}
    $config=Get-Content -LiteralPath (Join-Path $data 'gateway.json') -Raw|ConvertFrom-Json
    if($config.port -ne 8443 -or -not(Test-PrivateGatewayScope $config.bindAddress)){throw 'Expected a configured private IPv4 gateway on port 8443.'}
    $paths=@((Join-Path $data 'gateway.json'),$config.serverPfx,$config.deviceCaCertificate,$config.enrolledDevices,(Join-Path $data 'pairing-state.json'))
    foreach($path in $paths) {
        if(-not $path -or -not [IO.Path]::GetFullPath($path).StartsWith($data.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase) -or -not(Test-Path -LiteralPath $path)){throw 'Existing guided pairing material is incomplete or outside its protected folder. It will not be replaced.'}
        if((Get-Item -LiteralPath $path).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Pairing files must not be redirected links.'}
    }
    $ip=@(Get-NetIPAddress -AddressFamily IPv4|Where-Object {$_.IPAddress -eq $config.bindAddress})
    if($ip.Count -ne 1){throw 'The reserved gateway IP is not assigned to exactly one adapter. IT must restore its existing reserved address.'}
    $profiles=@(Get-NetConnectionProfile -InterfaceIndex $ip[0].InterfaceIndex -ErrorAction SilentlyContinue)
    $rules=@(Get-NetFirewallRule -DisplayName 'Mandala guided gateway HTTPS' -ErrorAction Stop)
    if($rules.Count -ne 1){throw 'Expected exactly one existing gateway firewall rule; will not guess the employee subnet.'}
    $remotes=@(($rules[0]|Get-NetFirewallAddressFilter).RemoteAddress)
    if($remotes.Count -eq 0 -or @($remotes|Where-Object {-not(Test-PrivateGatewayScope $_)}).Count){throw 'Existing employee firewall scope is not an explicit private IPv4 address/subnet. No broad firewall exception will be created.'}
    $audited=@($Approved.files.PSObject.Properties|ForEach-Object {Join-Path $install $_.Name})
    Assert-MandalaServiceReadPolicy (@($install,(Join-Path $install 'runtime'),$data)+$paths+$audited)
    [pscustomobject]@{Install=$install;Data=$data;Address=$config.bindAddress;InterfaceAlias=$ip[0].InterfaceAlias;InterfaceIndex=$ip[0].InterfaceIndex;NetworkCategory=@($profiles|ForEach-Object {[string]$_.NetworkCategory});RemoteAddresses=$remotes;RuleName=$rules[0].Name;ProtectedFiles=$paths;AuditedCode=$audited}
}
function Repair-ConfiguredGateway($Plan,$RepairSource) {
    # Caller obtains the explicit IT maintenance confirmation before this function.
    $before=@{};foreach($path in $Plan.ProtectedFiles){$before[$path]=(Get-FileHash -LiteralPath $path).Hash}
    $stamp=[DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss')
    $backup=Join-Path $Plan.Data ('startup-backup-'+$stamp)
    New-Item -ItemType Directory $backup|Out-Null
    Export-ScheduledTask -TaskName 'Mandala LAN Gateway'|Set-Content (Join-Path $backup 'task.xml') -Encoding UTF8
    Get-GatewayTaskEvidence|ConvertTo-Json -Depth 5|Set-Content (Join-Path $backup 'task-before.json')
    # Preserve exact old firewall properties for IT; do not back up secret configs.
    $rule=Get-NetFirewallRule -Name $Plan.RuleName
    @{Name=$rule.Name;Profile=[string]$rule.Profile;Enabled=[string]$rule.Enabled;Direction=[string]$rule.Direction;Action=[string]$rule.Action;RemoteAddress=$Plan.RemoteAddresses;LocalAddress=@(($rule|Get-NetFirewallAddressFilter).LocalAddress);Program=($rule|Get-NetFirewallApplicationFilter).Program;InterfaceAlias=@(($rule|Get-NetFirewallInterfaceFilter).InterfaceAlias)}|ConvertTo-Json -Depth 5|Set-Content (Join-Path $backup 'firewall-before.json')
    Stop-ScheduledTask -TaskName 'Mandala LAN Gateway' -ErrorAction Stop
    for($i=0;$i -lt 50 -and (Get-ScheduledTask -TaskName 'Mandala LAN Gateway').State -eq 'Running';$i++){Start-Sleep -Milliseconds 200}
    if((Get-ScheduledTask -TaskName 'Mandala LAN Gateway').State -eq 'Running'){throw 'Existing gateway task did not stop; no unrelated process will be killed.'}
    if(@(Get-NetTCPConnection -LocalPort 8443 -State Listen -ErrorAction SilentlyContinue|Where-Object {$_.LocalAddress -eq $Plan.Address}).Count){throw 'Port 8443 is still occupied after stopping the task. Close the manually launched gateway; do not kill an unknown process.'}
    # Protect installed maintenance code as well as the task action. Later use of
    # the existing wizard must retain the same durable registration and scope.
    foreach($map in @(@('start-gateway-resilient.mjs','start-gateway-resilient.mjs'),@('gateway-startup-core.ps1','repair-core.ps1'),@('pairing-core.ps1','pairing-core.ps1'))) {
        $destination=Join-Path $Plan.Install $map[0]
        if(Test-Path -LiteralPath $destination){Assert-ProtectedGatewayPath $destination;Copy-Item -LiteralPath $destination -Destination (Join-Path $backup ('previous-'+$map[0]))}
        Copy-Item -LiteralPath (Join-Path $RepairSource $map[1]) -Destination $destination -Force
        Assert-ProtectedGatewayPath $destination
    }
    # Fix missing read access to the audited runtime/modules too. No code directory
    # is made writable by Local Service; certificate/configuration bytes stay intact.
    $codePaths=@($Plan.Install,(Join-Path $Plan.Install 'runtime'))+@($Plan.AuditedCode)+@('start-gateway-resilient.mjs','gateway-startup-core.ps1','pairing-core.ps1'|ForEach-Object {Join-Path $Plan.Install $_})
    Grant-MandalaServiceRead (@($Plan.Data)+$Plan.ProtectedFiles+$codePaths)
    Set-MandalaDurableGatewayStartup $Plan.Address $Plan.RemoteAddresses $Plan.Data $Plan.Install
    $durable=Get-MandalaDurableGatewayStartup $Plan.Install $Plan.Data $RepairSource
    if(-not $durable.Passed){throw $durable.Detail}
    foreach($path in $Plan.ProtectedFiles){if((Get-FileHash -LiteralPath $path).Hash -ne $before[$path]){throw 'Pairing/configuration content changed unexpectedly; gateway has not been started.'}}
    Start-ScheduledTask -TaskName 'Mandala LAN Gateway'
    $deadline=[DateTime]::UtcNow.AddSeconds(90)
    do {
        Start-Sleep -Seconds 2
        if(Test-MandalaGatewayListener $Plan.Install $Plan.Data $Plan.Address){
            return [pscustomobject]@{Backup=$backup;PreservedFiles=$Plan.ProtectedFiles.Count;Listener=$Plan.Address+':8443';Owner='Local Service';Firewall='Existing employee subnet; exact adapter/IP/program/port; all network categories';RebootRequired=$true}
        }
    } while([DateTime]::UtcNow -lt $deadline)
    throw 'Gateway did not establish its restricted listener. Task exit result and sanitized startup status are retained in this report; no certificate reset or employee retest is needed.'
}
