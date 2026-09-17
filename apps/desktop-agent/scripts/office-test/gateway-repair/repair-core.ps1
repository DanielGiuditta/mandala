$ErrorActionPreference='Stop'
function Get-GatewayTaskEvidence {
    $task=Get-ScheduledTask -TaskName 'Mandala LAN Gateway' -ErrorAction SilentlyContinue
    if(-not $task){return [pscustomobject]@{Exists=$false}}
    $info=Get-ScheduledTaskInfo -TaskName 'Mandala LAN Gateway'
    [pscustomobject]@{Exists=$true;State=[string]$task.State;LastTaskResult=('0x{0:X8}' -f [uint32]$info.LastTaskResult);LastRunTime=$info.LastRunTime.ToString('o');NextRunTime=$info.NextRunTime.ToString('o');MissedRuns=$info.NumberOfMissedRuns;UserId=$task.Principal.UserId;Executable=$task.Actions[0].Execute;WorkingDirectory=$task.Actions[0].WorkingDirectory;BootTrigger=@($task.Triggers|Where-Object {$_.CimClass.CimClassName -eq 'MSFT_TaskBootTrigger'}).Count -gt 0;RestartCount=$task.Settings.RestartCount}
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
function Get-GatewayRepairPlan($Approved,$DataDirectory=(Join-Path $env:ProgramData 'Mandala Gateway')) {
    $task=Get-ScheduledTask -TaskName 'Mandala LAN Gateway' -ErrorAction Stop
    $install=$task.Actions[0].WorkingDirectory
    if(-not $install -or -not (Test-Path -LiteralPath $install)){throw 'Gateway installation directory is unavailable.'}
    $install=[IO.Path]::GetFullPath($install).TrimEnd('\')
    foreach($file in $Approved.files.PSObject.Properties) {
        $path=Join-Path $install $file.Name
        if(-not(Test-Path -LiteralPath $path) -or (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $file.Value){throw ('Audited gateway file mismatch: '+$file.Name+'. No gateway code was changed.')}
    }
    if($Approved.version -ne '1.1.0' -or $Approved.backend -ne 'nzlajptokbcgeaifgnoq'){throw 'Invalid approved gateway manifest.'}
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
    [pscustomobject]@{Install=$install;Data=$data;Address=$config.bindAddress;InterfaceAlias=$ip[0].InterfaceAlias;InterfaceIndex=$ip[0].InterfaceIndex;NetworkCategory=@($profiles|ForEach-Object {[string]$_.NetworkCategory});RemoteAddresses=$remotes;RuleName=$rules[0].Name;ProtectedFiles=$paths}
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
    # Repair only Local Service read access; preserve all certificate/key bytes.
    foreach($path in @($Plan.Data)+$Plan.ProtectedFiles) {
        $acl=Get-Acl -LiteralPath $path
        $sid=[Security.Principal.SecurityIdentifier]::new('S-1-5-19')
        $access=[Security.AccessControl.FileSystemAccessRule]::new($sid,[Security.AccessControl.FileSystemRights]::ReadAndExecute,[Security.AccessControl.AccessControlType]::Allow)
        $acl.AddAccessRule($access);Set-Acl -LiteralPath $path -AclObject $acl
    }
    $statusDir=Join-Path $Plan.Data 'startup-status';New-Item -ItemType Directory $statusDir -Force|Out-Null
    $acl=New-Object Security.AccessControl.DirectorySecurity
    $acl.SetSecurityDescriptorSddlForm('D:P(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)(A;OICI;0x1301bf;;;LS)')
    Set-Acl -LiteralPath $statusDir -AclObject $acl
    $entry=Join-Path $Plan.Install 'start-gateway-resilient.mjs'
    if(Test-Path $entry){Copy-Item $entry (Join-Path $backup 'previous-start-gateway-resilient.mjs')}
    Copy-Item -LiteralPath (Join-Path $RepairSource 'start-gateway-resilient.mjs') -Destination $entry -Force
    $node=Join-Path $Plan.Install 'runtime\node.exe'
    # Keep Windows' Public/Private category and every other firewall rule unchanged.
    # Scope this one rule to the enrolled gateway's adapter, IP, port, executable
    # and already configured employee subnet, so Public classification works too.
    Set-NetFirewallRule -Name $Plan.RuleName -Enabled True -Direction Inbound -Action Allow -Profile Any -InterfaceAlias $Plan.InterfaceAlias -LocalAddress $Plan.Address -RemoteAddress $Plan.RemoteAddresses -Protocol TCP -LocalPort 8443 -Program $node|Out-Null
    $arguments='"'+$entry+'" "'+(Join-Path $Plan.Data 'gateway.json')+'" "'+(Join-Path $statusDir 'status.json')+'"'
    $action=New-ScheduledTaskAction -Execute $node -Argument $arguments -WorkingDirectory $Plan.Install
    $principal=New-ScheduledTaskPrincipal -UserId 'S-1-5-19' -LogonType ServiceAccount -RunLevel Limited
    $settings=New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
    $trigger=New-ScheduledTaskTrigger -AtStartup;$trigger.Delay='PT30S'
    Register-ScheduledTask -TaskName 'Mandala LAN Gateway' -Action $action -Principal $principal -Settings $settings -Trigger $trigger -Force|Out-Null
    foreach($path in $Plan.ProtectedFiles){if((Get-FileHash -LiteralPath $path).Hash -ne $before[$path]){throw 'Pairing/configuration content changed unexpectedly; gateway has not been started.'}}
    Start-ScheduledTask -TaskName 'Mandala LAN Gateway'
    $deadline=[DateTime]::UtcNow.AddSeconds(90)
    do {
        Start-Sleep -Seconds 2
        $listener=@(Get-NetTCPConnection -LocalPort 8443 -State Listen -ErrorAction SilentlyContinue|Where-Object {$_.LocalAddress -eq $Plan.Address})
        if($listener.Count -eq 1){
            $process=Get-CimInstance Win32_Process -Filter ('ProcessId='+$listener[0].OwningProcess)
            $owner=Invoke-CimMethod -InputObject $process -MethodName GetOwnerSid
            if($process.ExecutablePath -eq $node -and $owner.Sid -eq 'S-1-5-19' -and (Get-ScheduledTask -TaskName 'Mandala LAN Gateway').State -eq 'Running') {
                return [pscustomobject]@{Backup=$backup;PreservedFiles=$Plan.ProtectedFiles.Count;Listener=$Plan.Address+':8443';Owner='Local Service';Firewall='Existing employee subnet; exact adapter/IP/program/port; all network categories';RebootRequired=$true}
            }
        }
    } while([DateTime]::UtcNow -lt $deadline)
    throw 'Gateway did not establish its restricted listener. Task exit result and sanitized startup status are retained in this report; no certificate reset or employee retest is needed.'
}
