$ErrorActionPreference = 'Stop'

function Assert-MandalaAgent($AgentPath, $CommonDataDirectory) {
    if (-not $AgentPath -or -not (Test-Path -LiteralPath $AgentPath -PathType Leaf) -or (Split-Path $AgentPath -Leaf) -ne 'Mandala.Agent.exe') {
        throw 'Mandala Agent could not be located. This does not prove it is uninstalled. Run the complete Mandala check to collect installation and connection evidence.'
    }
    # Use the same configuration precedence as AppConfiguration.Load.
    $configPath = Join-Path (Split-Path $AgentPath -Parent) 'agent.config.json'
    if (-not (Test-Path -LiteralPath $configPath)) { $configPath = Join-Path $CommonDataDirectory 'Mandala Agent\agent.config.json' }
    try { $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json }
    catch { throw 'The agent connection configuration is missing or unreadable. No startup changes were made.' }
    if (-not $config.supabaseUrl -or $config.supabaseUrl.TrimEnd('/') -ne 'https://nzlajptokbcgeaifgnoq.supabase.co' -or -not $config.supabaseAnonKey) {
        throw 'AGENT-CONFIG-BACKEND-001: The installed agent is not configured for Mandala production. Startup was not changed.'
    }
}

function Get-MandalaRegistryCandidates($SubKey = 'SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\{F2E1F144-4E47-4E47-8206-163C6BCA6D89}_is1') {
    foreach ($hive in @('LocalMachine','CurrentUser')) {
        foreach ($view in @('Registry64','Registry32')) {
            $root=$null; $key=$null
            try {
                $root=[Microsoft.Win32.RegistryKey]::OpenBaseKey($hive,$view)
                $key=$root.OpenSubKey($SubKey)
                if ($key -and $key.GetValue('InstallLocation')) {
                    [pscustomobject]@{Path=(Join-Path ($key.GetValue('InstallLocation')) 'Mandala.Agent.exe'); Scope=$(if($hive -eq 'LocalMachine'){'Machine'}else{'User'}); Source="$hive/$view"}
                }
            } catch { Write-Verbose "Could not read $hive/$view installation registration." }
            finally { if($key){$key.Dispose()}; if($root){$root.Dispose()} }
        }
    }
}

function Get-MandalaShortcutCandidates($Directories) {
    $shell=New-Object -ComObject WScript.Shell
    try {
        foreach($directory in @($Directories | Select-Object -Unique)) {
            if(-not $directory -or -not (Test-Path -LiteralPath $directory)) { continue }
            foreach($file in @(Get-ChildItem -LiteralPath $directory -Filter '*.lnk' -File -Recurse -ErrorAction SilentlyContinue)) {
                try {
                    $target=$shell.CreateShortcut($file.FullName).TargetPath
                    if($target -and [IO.Path]::GetFileName($target) -eq 'Mandala.Agent.exe') {
                        [pscustomobject]@{Path=$target; Scope='User'; Source=('Shortcut: '+$file.FullName)}
                    }
                } catch { Write-Verbose 'Unreadable shortcut skipped.' }
            }
        }
    } finally { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($shell) }
}

function Get-MandalaAgentCandidates {
    Get-MandalaRegistryCandidates
    foreach($directory in (@($env:ProgramW6432,$env:ProgramFiles,${env:ProgramFiles(x86)}) | Select-Object -Unique)) {
        if($directory) { [pscustomobject]@{Path=(Join-Path $directory 'Mandala Agent\Mandala.Agent.exe');Scope='Machine';Source='Program Files'} }
    }
    [pscustomobject]@{Path=(Join-Path $env:LOCALAPPDATA 'Programs\Mandala Agent\Mandala.Agent.exe');Scope='User';Source='User programs'}
    foreach($process in @(Get-Process -Name 'Mandala.Agent' -ErrorAction SilentlyContinue | Where-Object { $_.SessionId -eq (Get-Process -Id $PID).SessionId })) {
        if($process.Path) { [pscustomobject]@{Path=$process.Path;Scope='User';Source='Running employee agent'} }
    }
    $directories=@('Programs','CommonPrograms','DesktopDirectory','CommonDesktopDirectory','Startup','CommonStartup') | ForEach-Object { [Environment]::GetFolderPath($_) }
    Get-MandalaShortcutCandidates $directories
}

function Select-MandalaAgent($Candidates, [switch]$MachineOnly) {
    foreach($candidate in $Candidates) {
        if($MachineOnly -and $candidate.Scope -ne 'Machine') { continue }
        # Do not probe UNC/network executables or treat setup shortcuts as agents.
        if($candidate.Path -notmatch '^[a-zA-Z]:[\\/]' -or [IO.Path]::GetFileName($candidate.Path) -ne 'Mandala.Agent.exe') { continue }
        if(([IO.DriveInfo]::new([IO.Path]::GetPathRoot($candidate.Path))).DriveType -ne 'Fixed') { continue }
        if(Test-Path -LiteralPath $candidate.Path -PathType Leaf) { return $candidate }
    }
    return $null
}

function Get-MandalaAgentPath([switch]$MachineOnly) {
    $selected=Select-MandalaAgent @(Get-MandalaAgentCandidates) -MachineOnly:$MachineOnly
    if($selected) { return $selected.Path }
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
