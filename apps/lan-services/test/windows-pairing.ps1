param([Parameter(Mandatory=$true)][string]$InstallDirectory)
$ErrorActionPreference='Stop'
. (Join-Path $InstallDirectory 'pairing-core.ps1')
function Assert($Condition,$Message) { if(-not $Condition) { throw $Message } }
function Reject($Action,$Message) { $rejected=$false; try { & $Action | Out-Null } catch { $rejected=$true }; Assert $rejected $Message }
# Parse the shipped UI using Windows PowerShell 5, without displaying a modal window.
$tokens=$null; $errors=$null
[Management.Automation.Language.Parser]::ParseFile((Join-Path $InstallDirectory 'setup-wizard.ps1'),[ref]$tokens,[ref]$errors) | Out-Null
Assert ($errors.Count -eq 0) ('Wizard syntax: '+($errors | Out-String))
$fixture=Join-Path $env:ProgramData ('Mandala pairing audit '+[Guid]::NewGuid())
$data=Join-Path $fixture 'gateway'; $profile=Join-Path $fixture 'employee'
New-Item -ItemType Directory -Path $fixture | Out-Null
$requestPath=Join-Path $fixture 'request.json'; $replyPath=Join-Path $fixture 'reply.json'
$rootThumbs=@(); $leafThumb=$null; $taskCreated=$false
try {
    $state=Initialize-PairingGateway '127.0.0.1' $data $InstallDirectory
    $root=[Convert]::FromBase64String($state.root)
    $rootThumbs+=([Security.Cryptography.X509Certificates.X509Certificate2]::new($root)).Thumbprint
    Assert (((Get-Content (Join-Path $data 'enrolled-devices.json') -Raw) -replace '\s','') -eq '[]') 'New gateway must have no approved devices.'
    $request=New-EmployeePairingRequest $requestPath $profile
    $leafThumb=$request.thumbprint
    $rootThumbs+=([Security.Cryptography.X509Certificates.X509Certificate2]::new([Convert]::FromBase64String($request.root))).Thumbprint
    $cert=Get-Item ('Cert:\CurrentUser\My\'+$leafThumb)
    Assert $cert.HasPrivateKey 'Employee private key missing.'
    Reject { $cert.Export([Security.Cryptography.X509Certificates.X509ContentType]::Pfx,'audit') } 'Employee private key must not be exportable.'
    foreach($thumb in $rootThumbs) { Assert (-not (Test-Path ('Cert:\CurrentUser\My\'+$thumb))) 'An issuer private key was persisted.' }
    Approve-EmployeePairing $requestPath $replyPath $data | Out-Null
    # A repeated approval repairs the allowlist if a previous write was interrupted.
    Write-PairingJson (Join-Path $data 'enrolled-devices.json') @()
    Approve-EmployeePairing $requestPath $replyPath $data | Out-Null
    Assert (@(Read-PairingJson (Join-Path $data 'enrolled-devices.json')).Count -eq 1) 'Repeated approval must produce one enrollment.'
    $code=Get-PairingCode $root
    Reject { Import-EmployeePairing $replyPath $profile '00000000000000000000000000000000' } 'Wrong gateway pairing code accepted.'
    $bad=Read-PairingJson $replyPath; $bad.userSid='S-1-5-18'
    $badPath=Join-Path $fixture 'wrong-profile.json'; Write-PairingJson $badPath $bad
    Reject { Import-EmployeePairing $badPath $profile $code } 'Another Windows profile accepted.'
    $reply=Import-EmployeePairing $replyPath $profile $code
    $store=New-Object Security.Cryptography.X509Certificates.X509Store('My','CurrentUser')
    try { $store.Open('ReadOnly'); Assert ($store.Certificates.Find('FindByThumbprint',$leafThumb,$true).Count -eq 1) 'Agent validOnly certificate lookup failed.' } finally { $store.Close() }
    # Match Program Files read permissions for this installer audit's temporary directory.
    & icacls.exe $InstallDirectory /grant '*S-1-5-19:(OI)(CI)RX' /T /Q | Out-Null
    if($LASTEXITCODE -ne 0) { throw 'Could not prepare installed fixture permissions.' }
    $taskCreated=$true
    Enable-PairingGateway '127.0.0.1' '127.0.0.0/8' $data $InstallDirectory
    $task=Get-ScheduledTask -TaskName 'Mandala LAN Gateway'
    Assert ($task.Principal.UserId -in @('LOCAL SERVICE','NT AUTHORITY\LOCAL SERVICE','S-1-5-19')) ('Gateway task is not Local Service: '+$task.Principal.UserId)
    Assert ($task.Principal.RunLevel -eq 'Limited') 'Gateway task is elevated.'
    [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
    $health=Invoke-WebRequest -Uri ($reply.gatewayUrl+'/health') -Certificate $cert -UseBasicParsing -TimeoutSec 10
    $identity=$health.Content | ConvertFrom-Json
    Assert ($identity.backend -eq 'https://nzlajptokbcgeaifgnoq.supabase.co' -and $identity.protocol -eq 1) 'Pairing did not reach the production-configured gateway.'
    Reject { Invoke-WebRequest -Uri ($reply.gatewayUrl+'/health') -UseBasicParsing -TimeoutSec 5 } 'Gateway accepted a request without a client certificate.'
    Write-PairingJson (Join-Path $data 'enrolled-devices.json') @()
    $status=0
    try { Invoke-WebRequest -Uri ($reply.gatewayUrl+'/health') -Certificate $cert -UseBasicParsing -TimeoutSec 5 | Out-Null } catch { $status=[int]$_.Exception.Response.StatusCode }
    Assert ($status -eq 403) 'Revoked paired device was not denied.'
    Write-Host 'Guided Windows pairing audit passed: Windows PowerShell 5; generated certificates; non-exportable employee key; no persistent issuer key; profile/code rejection; validOnly lookup; restricted Local Service task; trusted HTTPS with client certificate; missing/revoked client denied.'
} finally {
    if($taskCreated) { Stop-ScheduledTask -TaskName 'Mandala LAN Gateway' -ErrorAction SilentlyContinue; Unregister-ScheduledTask -TaskName 'Mandala LAN Gateway' -Confirm:$false -ErrorAction SilentlyContinue; Start-Sleep -Seconds 1 }
    Get-NetFirewallRule -DisplayName 'Mandala guided gateway HTTPS' -ErrorAction SilentlyContinue | Remove-NetFirewallRule
    if($leafThumb -and (Test-Path ('Cert:\CurrentUser\My\'+$leafThumb))) { Remove-Item ('Cert:\CurrentUser\My\'+$leafThumb) -DeleteKey }
    foreach($thumb in $rootThumbs) { if(Test-Path ('Cert:\CurrentUser\Root\'+$thumb)) { Remove-Item ('Cert:\CurrentUser\Root\'+$thumb) } }
    Remove-Item $fixture -Recurse -Force
}
