param([Parameter(Mandatory=$true)][string]$Agent)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '..\scripts\office-test\check-core.ps1')
. (Join-Path $PSScriptRoot '..\scripts\office-test\ui-driver.ps1')
$script:AgentPath=$Agent
$p=Start-Process -FilePath $Agent -WorkingDirectory (Split-Path $Agent) -PassThru
try {
 $script:AgentProcessId=$p.Id
 Wait-Ui 'approved Agent login window' {try{Get-AgentRoot}catch{$null}} 45|Out-Null
 $identity=Get-AgentText 'BuildIdentityText'
 Require ($identity -like '*1.0.16*' -and $identity -like '*nzlajptokbcgeaifgnoq*') 'Actual installed Agent identity is wrong.'
 Require ((Get-AgentControl 'SignInButton').Current.IsEnabled) 'Actual approved Agent sign-in unavailable.'
 Get-AgentControl 'EmailTextBox'|Out-Null
 # Never enter credentials or sign into production in this CI audit.
 Close-TestAgent
 Write-Host 'PASS: approved installed executable opens and exposes expected real accessibility controls/version/backend.'
} finally {if(-not $p.HasExited){$p.Kill()}}
