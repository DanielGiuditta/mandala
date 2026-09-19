# Fixed-field diagnostics only: never copy configuration, raw task XML, raw
# command lines, secret files, arbitrary event messages or protected journals.
function Get-GatewayRecoveryEvidence {
    $result=[ordered]@{CapturedUtc=[DateTimeOffset]::UtcNow.ToString('o')}
    $task=$null;$config=$null
    try {
        $task=Get-ScheduledTask -TaskName 'Mandala LAN Gateway' -ErrorAction Stop
        $data=Join-Path $env:ProgramData 'Mandala Gateway'
        $expected=Get-MandalaGatewayArguments $task.Actions[0].WorkingDirectory $data
        $result.Task=[pscustomobject]@{
            ActionCount=@($task.Actions).Count
            Actions=@($task.Actions|ForEach-Object {[pscustomobject]@{Execute=$_.Execute;WorkingDirectory=$_.WorkingDirectory;ArgumentsMatchAuditedStartup=($_.Arguments -ceq $expected)}})
            Principal=($task.Principal|Select-Object UserId,LogonType,RunLevel)
            Triggers=@($task.Triggers|Select-Object Enabled,Delay,@{Name='Type';Expression={$_.CimClass.CimClassName}})
            Settings=($task.Settings|Select-Object Enabled,RestartCount,RestartInterval,ExecutionTimeLimit,StartWhenAvailable,MultipleInstances,DisallowStartIfOnBatteries,StopIfGoingOnBatteries)
        }
    } catch {$result.Task='Unavailable'}
    try {
        $config=Get-Content -LiteralPath (Join-Path $env:ProgramData 'Mandala Gateway\gateway.json') -Raw|ConvertFrom-Json
        $result.Adapter=@(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop|Where-Object {$_.IPAddress -eq $config.bindAddress}|Select-Object IPAddress,InterfaceIndex,InterfaceAlias,AddressState,PrefixLength)
    } catch {$result.Adapter='Unavailable'}
    try {
        $result.Firewall=@(Get-NetFirewallRule -DisplayName 'Mandala guided gateway HTTPS' -ErrorAction Stop|ForEach-Object {
            [pscustomobject]@{Name=$_.Name;Enabled=[string]$_.Enabled;Action=[string]$_.Action;Direction=[string]$_.Direction;Profile=[string]$_.Profile;PolicyStoreSourceType=[string]$_.PolicyStoreSourceType;Ports=@($_|Get-NetFirewallPortFilter|Select-Object Protocol,LocalPort,RemotePort);Addresses=@($_|Get-NetFirewallAddressFilter|Select-Object LocalAddress,RemoteAddress);Interfaces=@($_|Get-NetFirewallInterfaceFilter|Select-Object InterfaceAlias);Programs=@($_|Get-NetFirewallApplicationFilter|Select-Object Program)}
        })
    } catch {$result.Firewall='Unavailable'}
    try {
        $result.Listeners=@(Get-NetTCPConnection -LocalPort 8443 -State Listen -ErrorAction SilentlyContinue|ForEach-Object {
            $connection=$_;$process=Get-CimInstance Win32_Process -Filter ('ProcessId='+$connection.OwningProcess) -ErrorAction Stop
            $owner=Invoke-CimMethod -InputObject $process -MethodName GetOwnerSid -ErrorAction Stop
            $matches=$false
            if($task){$node=Join-Path $task.Actions[0].WorkingDirectory 'runtime\node.exe';$matches=$process.CommandLine -ceq ('"'+$node+'" '+$expected) -or $process.CommandLine -ceq ($node+' '+$expected)}
            [pscustomobject]@{LocalAddress=$connection.LocalAddress;Port=$connection.LocalPort;ProcessId=$connection.OwningProcess;Executable=$process.ExecutablePath;OwnerSid=$owner.Sid;CommandMatchesAuditedStartup=$matches}
        })
    } catch {$result.Listeners='Unavailable'}
    try {
        if(-not $task){throw 'Task unavailable'}
        $install=$task.Actions[0].WorkingDirectory
        $paths=@('runtime\node.exe','gateway.mjs','security.mjs','start-gateway-resilient.mjs','gateway-startup-core.ps1','pairing-core.ps1'|ForEach-Object {Join-Path $install $_})
        $result.Code=@($paths|ForEach-Object {
            $path=$_
            try {[pscustomobject]@{Path=$path;Sha256=(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant();Access=@((Get-Acl -LiteralPath $path).GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])|ForEach-Object {[pscustomobject]@{Sid=$_.IdentityReference.Value;Type=[string]$_.AccessControlType;Rights=[string]$_.FileSystemRights;Inherited=$_.IsInherited}})}}
            catch {[pscustomobject]@{Path=$path;Evidence='Unavailable'}}
        })
    } catch {$result.Code='Unavailable'}
    try {
        $events=Get-WinEvent -FilterHashtable @{LogName='Microsoft-Windows-TaskScheduler/Operational';StartTime=(Get-Date).AddDays(-3);Id=@(100,101,102,103,106,129,140,200,201,202,203)} -MaxEvents 150 -ErrorAction Stop
        $result.TaskEvents=@($events|ForEach-Object {
            $event=$_;$xml=[xml]$event.ToXml();$values=@{}
            foreach($item in $xml.Event.EventData.Data){$values[[string]$item.Name]=[string]$item.'#text'}
            if($values.TaskName -eq '\Mandala LAN Gateway') {
                $code=if($values.ResultCode -match '^(0x[0-9a-fA-F]+|[0-9]+)$'){$values.ResultCode}else{$null}
                [pscustomobject]@{Id=$event.Id;Utc=$event.TimeCreated.ToUniversalTime().ToString('o');RecordId=$event.RecordId;ResultCode=$code}
            }
        })
    } catch {$result.TaskEvents='Unavailable or no matching recent events'}
    return [pscustomobject]$result
}
function Get-EmployeeReadOnlyEvidence {
    $result=[ordered]@{CapturedUtc=[DateTimeOffset]::UtcNow.ToString('o');WindowsUser=[Security.Principal.WindowsIdentity]::GetCurrent().Name;UserSid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value;Mode='Read-only; no application launch, installation, pairing or timer operations'}
    try {$result.Running=@(Get-Process -Name 'Mandala.Agent' -ErrorAction SilentlyContinue|Select-Object Id,Path,StartTime)}catch{$result.Running='Unavailable'}
    # File existence is not proof of an active/pending session. Do not decrypt it.
    try {$result.JournalFileCount=@(Get-ChildItem -LiteralPath (Join-Path $env:LOCALAPPDATA 'Mandala Agent') -Filter 'time-*.dat' -File -ErrorAction SilentlyContinue).Count;$result.PendingState='Unknown; baseline does not open or decrypt the journal.'}catch{$result.PendingState='Unavailable'}
    try {
        $events=@(Read-AgentEvents (Join-Path $env:LOCALAPPDATA 'Mandala Agent\agent.log') ([DateTimeOffset]::UtcNow.AddDays(-3)))
        $result.RecentSafeEvents=@($events|Select-Object -Last 30)
    } catch {$result.RecentSafeEvents='Unavailable'}
    try {
        # Only the fixed authorized production endpoint; no credentials are sent.
        $request=[Net.HttpWebRequest]::Create('https://nzlajptokbcgeaifgnoq.supabase.co/auth/v1/settings')
        $request.Timeout=8000;$request.ReadWriteTimeout=8000;$request.AllowAutoRedirect=$false;$request.Method='GET'
        try {$response=$request.GetResponse();$response.Close();$result.DirectProductionAccess='REACHABLE - LAN-only routing requirement not met'}
        catch [Net.WebException] {
            if($_.Exception.Response){$_.Exception.Response.Close();$result.DirectProductionAccess='REACHABLE - HTTP rejection still proves direct production access'}
            else {$result.DirectProductionAccess='No response observed; IT firewall policy confirmation still required';$result.DirectProbeStatus=[string]$_.Exception.Status}
        }
    } catch {$result.DirectProductionAccess='Probe unavailable; IT policy confirmation required'}
    return [pscustomobject]$result
}
