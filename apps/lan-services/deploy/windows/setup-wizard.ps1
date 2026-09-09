param([ValidateSet('Choose','Gateway','Employee')][string]$Mode='Choose')
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
. (Join-Path $PSScriptRoot 'pairing-core.ps1')
$script:AgentName = 'MandalaAgentSetup-1.0.15.exe'
$script:AgentHash = 'acf56fe97faa161e710330e1e14652be4d31f8475c8738234ff86d10c2a660ed'
$script:GatewayData = Join-Path $env:ProgramData 'Mandala Gateway'
$script:EmployeeData = Join-Path $env:LOCALAPPDATA 'Mandala Agent\pairing'
function Show-Info($Text) { [Windows.Forms.MessageBox]::Show($Text,'Mandala setup','OK','Information') | Out-Null }
function Pick-Open($Title,$Filter='Mandala files (*.json)|*.json') {
    $dialog=New-Object Windows.Forms.OpenFileDialog
    $dialog.Title=$Title; $dialog.Filter=$Filter
    if ($dialog.ShowDialog() -eq 'OK') { return $dialog.FileName }; return $null
}
function Pick-Save($Name,$Filter='Mandala files (*.json)|*.json') {
    $dialog=New-Object Windows.Forms.SaveFileDialog
    $dialog.FileName=$Name; $dialog.Filter=$Filter; $dialog.InitialDirectory=[Environment]::GetFolderPath('Desktop')
    if ($dialog.ShowDialog() -eq 'OK') { return $dialog.FileName }; return $null
}
function New-Button($Form,$Text,$Top,$Action) {
    $button=New-Object Windows.Forms.Button
    $button.Text=$Text; $button.SetBounds(25,$Top,610,42)
    $button.Add_Click({ try { & $Action } catch { [Windows.Forms.MessageBox]::Show($_.Exception.Message,'Mandala setup needs attention','OK','Error') | Out-Null } }.GetNewClosure())
    $Form.Controls.Add($button)
}
function New-Label($Form,$Text,$Top,$Height=55) {
    $label=New-Object Windows.Forms.Label
    $label.Text=$Text; $label.SetBounds(25,$Top,610,$Height); $Form.Controls.Add($label); return $label
}
function Ensure-EmployeeAgent {
    if (Get-Process -Name 'Mandala.Agent' -ErrorAction SilentlyContinue) { throw 'Stop any current timer, then close Mandala Agent before pairing this Windows profile.' }
    $exe=Join-Path $env:ProgramFiles 'Mandala Agent\Mandala.Agent.exe'
    if (-not (Test-Path $exe) -or (Get-Item $exe).VersionInfo.ProductVersion -notmatch '^1\.0\.15(?:\.|\+|$)') {
        $installer=Join-Path $PSScriptRoot $script:AgentName
        if (-not (Test-Path $installer) -or (Get-FileHash $installer -Algorithm SHA256).Hash.ToLowerInvariant() -ne $script:AgentHash) { throw 'Ask IT to export the employee setup ZIP again with the verified 1.0.15 installer included.' }
        Show-Info 'Windows will ask for administrator approval to install the employee agent. Use this employee Windows profile for the pairing steps afterwards.'
        $result=Start-Process -FilePath $installer -ArgumentList '/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART' -Verb RunAs -Wait -PassThru
        if ($result.ExitCode -ne 0) { throw 'The employee installation did not finish.' }
    }
    $config=Read-PairingJson (Join-Path $env:ProgramData 'Mandala Agent\agent.config.json')
    if ($config.supabaseUrl.TrimEnd('/') -ne 'https://nzlajptokbcgeaifgnoq.supabase.co') { throw 'The installed employee agent targets the wrong backend.' }
}
$form=New-Object Windows.Forms.Form
$form.Text='Mandala - guided office setup'; $form.ClientSize=New-Object Drawing.Size(660,620)
$form.StartPosition='CenterScreen'; $form.FormBorderStyle='FixedDialog'; $form.MaximizeBox=$false
$form.Font=New-Object Drawing.Font('Segoe UI',10)
if ($Mode -eq 'Choose') {
    New-Label $form 'Choose this computer. Mandala creates the certificates; no office certificate authority is required.' 25 70 | Out-Null
    New-Button $form 'Internet-connected gateway computer' 115 {
        $args='-NoProfile -STA -ExecutionPolicy RemoteSigned -File "'+(Join-Path $PSScriptRoot 'setup-wizard.ps1')+'" -Mode Gateway'
        Start-Process powershell.exe -ArgumentList $args -Verb RunAs | Out-Null
        $form.Close()
    }
    New-Label $form 'For the LAN-only employee PC, first export its setup ZIP from the gateway. Copy it using your approved USB/local transfer process.' 180 100 | Out-Null
} elseif ($Mode -eq 'Gateway') {
    if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Open the gateway setup with administrator approval.' }
    New-Label $form 'Gateway computer - internet required. Keep its LAN address reserved in your router. The gateway will run automatically as the restricted Local Service account.' 15 60 | Out-Null
    $interfaces=@(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' -and $_.AddressState -eq 'Preferred' })
    New-Label $form 'Gateway LAN IPv4 address:' 80 25 | Out-Null
    $address=New-Object Windows.Forms.ComboBox; $address.SetBounds(260,77,365,28); $address.DropDownStyle='DropDownList'
    foreach($item in $interfaces) { $address.Items.Add($item.IPAddress) | Out-Null }; if($address.Items.Count -gt 0) { $address.SelectedIndex=0 }; $form.Controls.Add($address)
    New-Label $form 'Employee LAN subnet:' 112 25 | Out-Null
    $subnet=New-Object Windows.Forms.TextBox; $subnet.SetBounds(260,110,365,28)
    if($interfaces.Count -gt 0) { $subnet.Text=$interfaces[0].IPAddress+'/'+$interfaces[0].PrefixLength }; $form.Controls.Add($subnet)
    $isolation=New-Object Windows.Forms.CheckBox; $isolation.SetBounds(25,150,610,65)
    $isolation.Text='IT confirms this is a dedicated gateway and the office firewall blocks it from initiating connections to file servers and domain controllers.'; $form.Controls.Add($isolation)
    New-Button $form '1. Create certificates and start gateway' 225 {
        if(-not $isolation.Checked) { throw 'IT must confirm network isolation before enabling the gateway.' }
        if(-not $address.Text) { throw 'Choose the gateway LAN address.' }
        $key=(Read-PairingJson (Join-Path $PSScriptRoot 'gateway.example.json')).supabaseAnonKey
        $old=[Environment]::GetEnvironmentVariable('MANDALA_PAIRING_PREFLIGHT_KEY')
        try {
            $env:MANDALA_PAIRING_PREFLIGHT_KEY=$key
            & (Join-Path $PSScriptRoot 'runtime\node.exe') -e "fetch('https://nzlajptokbcgeaifgnoq.supabase.co/auth/v1/settings',{headers:{apikey:process.env.MANDALA_PAIRING_PREFLIGHT_KEY},signal:AbortSignal.timeout(10000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
            if($LASTEXITCODE -ne 0) { throw 'This computer cannot reach Mandala on the internet. Check its internet connection first.' }
        } finally { [Environment]::SetEnvironmentVariable('MANDALA_PAIRING_PREFLIGHT_KEY',$old) }
        $state=Initialize-PairingGateway $address.Text $script:GatewayData $PSScriptRoot
        Enable-PairingGateway $address.Text $subnet.Text $script:GatewayData $PSScriptRoot
        Show-Info ('Gateway configured. Next export the employee setup ZIP. Pairing code: '+(Get-PairingCode ([Convert]::FromBase64String($state.root))))
    }
    New-Button $form '2. Export employee setup ZIP' 280 {
        if(-not (Test-Path (Join-Path $script:GatewayData 'pairing-state.json'))) { throw 'Complete step 1 first.' }
        Show-Info 'Select the previously downloaded MandalaAgentSetup-1.0.15.exe. If you do not have it, use the download-page button below first.'
        $agent=Pick-Open ('Select '+$script:AgentName) 'Windows installer (*.exe)|*.exe'
        if(-not $agent) { return }
        if((Split-Path $agent -Leaf) -ne $script:AgentName -or (Get-FileHash $agent -Algorithm SHA256).Hash.ToLowerInvariant() -ne $script:AgentHash) { throw 'That is not the audited 1.0.15 employee installer. Download the correct file from the installer page.' }
        $destination=Pick-Save 'Mandala Employee Setup.zip' 'ZIP file (*.zip)|*.zip'; if(-not $destination) { return }
        $temp=Join-Path ([IO.Path]::GetTempPath()) ('MandalaEmployee-'+[Guid]::NewGuid())
        New-Item -ItemType Directory $temp | Out-Null
        try {
            foreach($file in @('setup-wizard.ps1','pairing-core.ps1','PairingCertificates.cs','configure-lan.ps1','Employee pairing.cmd')) { Copy-Item (Join-Path $PSScriptRoot $file) $temp }
            Copy-Item $agent (Join-Path $temp $script:AgentName)
            Compress-Archive -Path (Join-Path $temp '*') -DestinationPath $destination -Force
        } finally { Remove-Item $temp -Recurse -Force }
        Show-Info 'Copy this ZIP to the LAN-only PC using an IT-approved transfer. Extract it and open Employee pairing.cmd while signed in as the employee. Bring its request JSON back here.'
    }
    New-Button $form '3. Approve an employee PC request' 335 {
        $requestFile=Pick-Open 'Open the employee request JSON'; if(-not $requestFile) { return }
        $request=Read-PairingJson $requestFile
        if([Windows.Forms.MessageBox]::Show(('Approve this employee PC: '+$request.computer+'? Confirm this is the request you brought from the employee PC.'),'Approve employee PC','YesNo','Question') -ne 'Yes') { return }
        $output=Pick-Save 'Mandala connection.json'; if(-not $output) { return }
        $reply=Approve-EmployeePairing $requestFile $output $script:GatewayData
        Restart-PairingGateway
        $code=Get-PairingCode ([Convert]::FromBase64String($reply.root))
        Show-Info ('Approved. Take the connection JSON back to that employee PC and choose Complete connection. Enter this pairing code there: '+$code+'. Approving a device briefly restarts the gateway; existing agent saves remain queued during that restart.')
    }
    New-Button $form 'Show gateway pairing code' 390 {
        $state=Read-PairingJson (Join-Path $script:GatewayData 'pairing-state.json')
        Show-Info ('Gateway: https://'+$state.address+':8443'+[Environment]::NewLine+'Pairing code: '+(Get-PairingCode ([Convert]::FromBase64String($state.root))))
    }
    New-Button $form 'Open installer download page' 445 { Start-Process 'https://mandala-web-tau.vercel.app/desktop-agent' | Out-Null }
    New-Label $form 'Only public certificates move between computers. Certificates expire after one year; arrange renewal before then. Existing manual gateway configuration is preserved rather than overwritten.' 505 95 | Out-Null
} else {
    New-Label $form ('Employee PC: '+$env:COMPUTERNAME+'. Run this while signed in to the employee Windows account, not a separate administrator account. Administrator approval is requested only for installation and connection settings.') 20 85 | Out-Null
    New-Button $form '1. Install agent and create PC request' 120 {
        Ensure-EmployeeAgent
        $output=Pick-Save ('Mandala request - '+$env:COMPUTERNAME+'.json'); if(-not $output) { return }
        $request=New-EmployeePairingRequest $output $script:EmployeeData
        Show-Info 'Take this request JSON to the gateway computer. There, choose Approve an employee PC request, then bring the approved connection JSON back here. Keep using this same Windows profile.'
    }
    New-Label $form 'Pairing code from the gateway screen (32 characters):' 190 35 | Out-Null
    $pairingCode=New-Object Windows.Forms.TextBox; $pairingCode.SetBounds(25,230,610,30); $form.Controls.Add($pairingCode)
    New-Button $form '2. Complete connection' 285 {
        Ensure-EmployeeAgent
        $file=Pick-Open 'Open the approved connection JSON from the gateway'; if(-not $file) { return }
        $reply=Import-EmployeePairing $file $script:EmployeeData $pairingCode.Text.Trim()
        $args='-NoProfile -ExecutionPolicy RemoteSigned -File "'+(Join-Path $PSScriptRoot 'configure-lan.ps1')+'" -GatewayUrl '+$reply.gatewayUrl+' -DeviceCertificateThumbprint '+$reply.thumbprint
        $process=Start-Process powershell.exe -ArgumentList $args -Verb RunAs -Wait -PassThru
        if($process.ExitCode -ne 0) { throw 'Administrator approval/settings were not completed. Your certificate and request are preserved; retry Complete connection.' }
        $cert=Get-Item ('Cert:\CurrentUser\My\'+$reply.thumbprint)
        try {
            $health=Invoke-WebRequest -Uri ($reply.gatewayUrl+'/health') -Certificate $cert -UseBasicParsing -TimeoutSec 10
            $identity=$health.Content | ConvertFrom-Json
            if($identity.backend -ne 'https://nzlajptokbcgeaifgnoq.supabase.co' -or $identity.protocol -ne 1) { throw 'The gateway identity does not match production.' }
        } catch { throw ('Settings saved, but the gateway connection check failed. Ask local IT to check the gateway task, LAN and firewall. '+$_.Exception.Message) }
        Show-Info 'Connection verified. Open Mandala, sign in, work for two minutes and stop. Ask the local administrator to confirm the saved reference matches one real time entry.'
        Start-Process (Join-Path $env:ProgramFiles 'Mandala Agent\Mandala.Agent.exe') | Out-Null
    }
    New-Label $form 'The certificates are created automatically. Only public certificates move between the PCs. The employee private key remains protected in this Windows profile. Do not clear the profile or app data if a save is pending.' 360 120 | Out-Null
}
[void]$form.ShowDialog()
