$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\scripts\startup-repair\startup-core.ps1')
function Assert($Condition, $Message) { if (-not $Condition) { throw $Message } }
function Reject($Action, $Message) {
    $failed = $false
    try { & $Action | Out-Null } catch { $failed = $true }
    Assert $failed $Message
}
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('Mandala startup audit ' + [Guid]::NewGuid())
$startup = Join-Path $fixture 'Startup'
$backup = Join-Path $fixture 'backups'
$userStartup = Join-Path $fixture 'User Startup'
$installation = Join-Path $fixture 'Installed Agent'
New-Item -ItemType Directory -Path $startup, $installation, $userStartup | Out-Null
$agent = Join-Path $installation 'Mandala.Agent.exe'
$shell = New-Object -ComObject WScript.Shell
function Make-Link($Path, $Target, $Arguments = '') {
    $link = $shell.CreateShortcut($Path)
    $link.TargetPath = $Target
    $link.Arguments = $Arguments
    $link.Save()
}
try {
    foreach ($file in @(Get-ChildItem (Join-Path $PSScriptRoot '..\scripts\startup-repair') -Filter '*.ps1')) {
        $tokens=$null; $errors=$null
        [Management.Automation.Language.Parser]::ParseFile($file.FullName, [ref]$tokens, [ref]$errors) | Out-Null
        Assert ($errors.Count -eq 0) ('PowerShell 5 syntax: ' + $file.Name + ' ' + ($errors | Out-String))
    }
    Reject { Assert-MandalaAgent $agent $fixture } 'Missing agent accepted.'
    # A real executable with no network/credentials, to prove that Windows can
    # follow the repaired .lnk (including paths with spaces) without a wizard.
    Add-Type -TypeDefinition 'using System; using System.IO; public class StartupFixture { public static void Main() { File.WriteAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "launched.txt"), Environment.CurrentDirectory); } }' -OutputAssembly $agent -OutputType WindowsApplication
    $configPath = Join-Path $installation 'agent.config.json'
    '{"supabaseUrl":"https://wrong.supabase.co","supabaseAnonKey":"fixture"}' | Set-Content $configPath
    Reject { Assert-MandalaAgent $agent $fixture } 'Wrong production backend accepted.'
    '{"supabaseUrl":"https://nzlajptokbcgeaifgnoq.supabase.co","supabaseAnonKey":"fixture"}' | Set-Content $configPath
    Assert-MandalaAgent $agent $fixture
    $configHash = (Get-FileHash $configPath).Hash
    $pending = Join-Path $fixture 'pending-time.json'
    'preserve pending work' | Set-Content $pending
    $pendingHash = (Get-FileHash $pending).Hash
    $other = Join-Path $startup 'PDFCreator.lnk'
    Make-Link $other 'C:\Windows\notepad.exe'
    $otherHash = (Get-FileHash $other).Hash
    $wizard = Join-Path $startup 'Mandala office setup.lnk'
    Make-Link $wizard 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' '-NoProfile -File "C:\Program Files\Mandala Gateway\setup-wizard.ps1"'
    # Reproduce the reported missing common shortcut plus wrong setup shortcut.
    Repair-MandalaStartupFolder $startup $agent $backup -CreateShortcut
    Assert (Test-MandalaStartupShortcut $startup $agent) 'Missing shortcut was not repaired.'
    Assert (-not (Test-Path $wizard)) 'Setup wizard remains in startup.'
    Assert ((Get-FileHash $other).Hash -eq $otherHash) 'Unrelated startup entry changed.'
    Assert (@(Get-ChildItem $backup -Filter '*.lnk').Count -eq 1) 'Wrong shortcut was not backed up.'
    # Reproduce a canonical shortcut that incorrectly points at the wizard.
    Make-Link (Join-Path $startup 'Mandala Agent.lnk') 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' '-File "C:\Mandala\setup-wizard.ps1"'
    Repair-MandalaStartupFolder $startup $agent $backup -CreateShortcut
    Repair-MandalaStartupFolder $startup $agent $backup -CreateShortcut
    Assert (Test-MandalaStartupShortcut $startup $agent) 'Repeat repair changed the target.'
    Assert (@(Get-ChildItem $startup -Filter 'Mandala*.lnk').Count -eq 1) 'Repair created duplicate launchers.'
    Make-Link (Join-Path $userStartup 'Mandala Agent.lnk') $agent
    Make-Link (Join-Path $userStartup 'Mandala setup.lnk') 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' '-File "C:\Mandala\setup-wizard.ps1"'
    Repair-MandalaStartupFolder $userStartup $agent $backup
    Assert (@(Get-ChildItem $userStartup -Filter '*.lnk').Count -eq 0) 'Current-user duplicate or wizard remains.'
    Assert ((Get-FileHash $configPath).Hash -eq $configHash) 'Connection settings changed.'
    Assert ((Get-FileHash $pending).Hash -eq $pendingHash) 'Pending work changed.'
    Start-Process -FilePath (Join-Path $startup 'Mandala Agent.lnk')
    $marker = Join-Path $installation 'launched.txt'
    for ($i=0; $i -lt 50 -and -not (Test-Path $marker); $i++) { Start-Sleep -Milliseconds 100 }
    Assert (Test-Path $marker) 'Windows could not launch the repaired shortcut.'
    Assert ((Get-Content $marker -Raw) -eq $installation) 'Incorrect shortcut working directory.'
    Write-Host 'PASS: missing/wrong shortcut repair; wizard backup; repeat repair; duplicate cleanup; unrelated files/config/pending work preserved; actual .lnk launch on Windows.'
} finally {
    [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($shell)
    Remove-Item $fixture -Recurse -Force
}
