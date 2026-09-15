$ErrorActionPreference = 'Stop'

function Assert-MandalaAgent($AgentPath, $CommonDataDirectory) {
    if (-not (Test-Path -LiteralPath $AgentPath -PathType Leaf) -or (Split-Path $AgentPath -Leaf) -ne 'Mandala.Agent.exe') {
        throw 'Mandala Agent is not installed. This repair does not install the agent or the gateway.'
    }
    # Use the same configuration precedence as AppConfiguration.Load.
    $configPath = Join-Path (Split-Path $AgentPath -Parent) 'agent.config.json'
    if (-not (Test-Path -LiteralPath $configPath)) { $configPath = Join-Path $CommonDataDirectory 'Mandala Agent\agent.config.json' }
    $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
    if (-not $config.supabaseUrl -or $config.supabaseUrl.TrimEnd('/') -ne 'https://nzlajptokbcgeaifgnoq.supabase.co' -or -not $config.supabaseAnonKey) {
        throw 'AGENT-CONFIG-BACKEND-001: The installed agent is not configured for Mandala production. Startup was not changed.'
    }
}

function Get-MandalaAgentPath {
    $key = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\{F2E1F144-4E47-4E47-8206-163C6BCA6D89}_is1'
    $installation = Get-ItemProperty -LiteralPath $key -ErrorAction SilentlyContinue
    if ($installation -and $installation.InstallLocation) { return Join-Path $installation.InstallLocation 'Mandala.Agent.exe' }
    return Join-Path $env:ProgramFiles 'Mandala Agent\Mandala.Agent.exe'
}

function Test-MandalaSetupShortcut($Shortcut, $Name) {
    # Only our named shortcuts to our setup entry points. Never remove other apps.
    if ($Name -notlike 'Mandala*') { return $false }
    $targetName = [IO.Path]::GetFileName($Shortcut.TargetPath)
    return ($targetName -in @('setup-wizard.ps1', 'Employee pairing.cmd')) -or
        ($targetName -in @('powershell.exe', 'pwsh.exe', 'cmd.exe') -and
         $Shortcut.Arguments -match '(?i)(?:[\\/]|\b)(setup-wizard\.ps1|Employee pairing\.cmd)(?:"|\s|$)')
}

function Test-MandalaStartupShortcut($StartupDirectory, $AgentPath) {
    $path = Join-Path $StartupDirectory 'Mandala Agent.lnk'
    if (-not (Test-Path -LiteralPath $path)) { return $false }
    $shell = New-Object -ComObject WScript.Shell
    try {
        $shortcut = $shell.CreateShortcut($path)
        return $shortcut.TargetPath -eq $AgentPath -and [string]::IsNullOrWhiteSpace($shortcut.Arguments) -and
            $shortcut.WorkingDirectory -eq (Split-Path $AgentPath -Parent)
    } finally { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($shell) }
}

function Repair-MandalaStartupFolder($StartupDirectory, $AgentPath, $BackupDirectory, [switch]$CreateShortcut) {
    New-Item -ItemType Directory -Path $StartupDirectory -Force | Out-Null
    $shell = New-Object -ComObject WScript.Shell
    try {
        $canonical = Join-Path $StartupDirectory 'Mandala Agent.lnk'
        # Write and validate the replacement before moving any old shortcuts.
        $temporary = $null
        if ($CreateShortcut) {
            $temporary = Join-Path $StartupDirectory ('Mandala startup repair-' + [Guid]::NewGuid() + '.lnk')
            $link = $shell.CreateShortcut($temporary)
            $link.TargetPath = $AgentPath
            $link.WorkingDirectory = Split-Path $AgentPath -Parent
            $link.Arguments = ''
            $link.Description = 'Open Mandala Agent when you sign in to Windows'
            $link.Save()
            $saved = $shell.CreateShortcut($temporary)
            if ($saved.TargetPath -ne $AgentPath -or $saved.Arguments) { throw 'Could not verify the new agent shortcut.' }
        }
        foreach ($file in @(Get-ChildItem -LiteralPath $StartupDirectory -Filter '*.lnk' -File)) {
            if ($file.FullName -eq $temporary) { continue }
            $link = $shell.CreateShortcut($file.FullName)
            if ($file.FullName -eq $canonical -or $link.TargetPath -eq $AgentPath -or (Test-MandalaSetupShortcut $link $file.BaseName)) {
                New-Item -ItemType Directory -Path $BackupDirectory -Force | Out-Null
                $backup = Join-Path $BackupDirectory ($file.BaseName + '-' + [Guid]::NewGuid() + '.lnk')
                Move-Item -LiteralPath $file.FullName -Destination $backup
                Write-Output ('Backed up startup shortcut: ' + $file.Name)
            }
        }
        if ($CreateShortcut) {
            Move-Item -LiteralPath $temporary -Destination $canonical
            if (-not (Test-MandalaStartupShortcut $StartupDirectory $AgentPath)) { throw 'The repaired startup shortcut did not verify.' }
            Write-Output ('Verified startup target: ' + $AgentPath)
        }
    } finally {
        if ($temporary -and (Test-Path -LiteralPath $temporary)) { Remove-Item -LiteralPath $temporary }
        [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($shell)
    }
}
