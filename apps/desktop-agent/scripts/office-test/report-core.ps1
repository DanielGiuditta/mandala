# Required checkpoints and optional shareable copies have separate failure boundaries.
function Assert-OfficeLocalPath([string]$Path) {
    $full=[IO.Path]::GetFullPath($Path)
    if($full.StartsWith('\\') -or ([IO.DriveInfo]::new([IO.Path]::GetPathRoot($full))).DriveType -ne 'Fixed'){throw 'Recovery storage must be on a local fixed drive.'}
    $walk=$full
    while($walk) {
        if(Test-Path -LiteralPath $walk) {
            if((Get-Item -LiteralPath $walk -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Recovery storage must not follow redirected files or folders.'}
        }
        $parent=Split-Path $walk -Parent
        if($parent -eq $walk){break};$walk=$parent
    }
    return $full
}
function New-OfficePrivateDirectory([string]$Path,[switch]$AdministratorsOnly) {
    $full=Assert-OfficeLocalPath $Path
    $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $trusted=@('S-1-5-18','S-1-5-32-544')
    if(-not $AdministratorsOnly){$trusted+=$sid}
    if(Test-Path -LiteralPath $full) {
        if(-not(Test-Path -LiteralPath $full -PathType Container)){throw 'Recovery directory is occupied by a file.'}
        $acl=Get-Acl -LiteralPath $full
        # Do not take ownership of or silently change an existing unrelated path.
        if($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -notin $trusted){throw 'Recovery directory has an unexpected owner.'}
        $writes=[Security.AccessControl.FileSystemRights]::Write -bor [Security.AccessControl.FileSystemRights]::Delete -bor [Security.AccessControl.FileSystemRights]::ChangePermissions -bor [Security.AccessControl.FileSystemRights]::TakeOwnership -bor [Security.AccessControl.FileSystemRights]::DeleteSubdirectoriesAndFiles
        foreach($rule in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])) {
            if($rule.AccessControlType -eq 'Allow' -and ($rule.FileSystemRights -band $writes) -and $rule.IdentityReference.Value -notin $trusted){throw 'Recovery directory is writable by another Windows account.'}
        }
    } else {
        $acl=New-Object Security.AccessControl.DirectorySecurity
        $sddl='O:BAG:BAD:P(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)'
        if(-not $AdministratorsOnly){$sddl='O:'+ $sid +'G:'+ $sid +'D:P(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)(A;OICI;FA;;;'+$sid+')'}
        $acl.SetSecurityDescriptorSddlForm($sddl)
        # .NET Framework creates the directory with its private ACL in one call.
        [void][IO.Directory]::CreateDirectory($full,$acl)
    }
    [void](Assert-OfficeLocalPath $full)
    return $full
}
function Initialize-OfficeStorage([string]$Role) {
    $admin=$Role -eq 'gateway'
    $parent=if($admin){$env:ProgramData}else{$env:LOCALAPPDATA}
    $root=New-OfficePrivateDirectory (Join-Path $parent 'Mandala Office Recovery') -AdministratorsOnly:$admin
    $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $account=New-OfficePrivateDirectory (Join-Path $root $sid) -AdministratorsOnly:$admin
    $reports=New-OfficePrivateDirectory (Join-Path $account 'reports') -AdministratorsOnly:$admin
    return [pscustomobject]@{Root=$account;StateFile=(Join-Path $account ($Role+'.json'));Reports=$reports;AdministratorsOnly=$admin}
}
function Write-OfficeCheckpoint($State,[string]$Path) {
    [void](Assert-OfficeLocalPath $Path)
    [void](Assert-OfficeLocalPath (Split-Path $Path -Parent))
    $json=$State|ConvertTo-Json -Depth 30
    $temporary=$Path+'.'+[Guid]::NewGuid().ToString('N')+'.tmp'
    $bytes=(New-Object Text.UTF8Encoding($false)).GetBytes($json)
    $stream=$null
    try {
        $stream=[IO.File]::Open($temporary,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
        $stream.Write($bytes,0,$bytes.Length);$stream.Flush($true);$stream.Dispose();$stream=$null
        [void](Assert-OfficeLocalPath $Path)
        if(Test-Path -LiteralPath $Path){[IO.File]::Replace($temporary,$Path,$null)}else{[IO.File]::Move($temporary,$Path)}
    } finally {
        if($stream){$stream.Dispose()}
        if(Test-Path -LiteralPath $temporary){Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue}
    }
}
function Write-OfficeNewText([string]$Path,[string]$Text) {
    [void](Assert-OfficeLocalPath $Path)
    $bytes=(New-Object Text.UTF8Encoding($false)).GetBytes($Text)
    $stream=[IO.File]::Open($Path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try {$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
}
function Export-OfficeSnapshot($State,$Storage,[string]$DesktopDirectory) {
    $errors=@();$localBundle=$null;$desktopBundle=$null;$snapshotDirectory=$null
    $safeComputer=$State.Computer -replace '[^a-zA-Z0-9_-]','_'
    $name='Mandala-'+$safeComputer+'-'+$State.Role+'-'+$State.KitVersion+'-'+$State.SnapshotId
    try {
        $snapshotDirectory=New-OfficePrivateDirectory (Join-Path $Storage.Reports $name) -AdministratorsOnly:$Storage.AdministratorsOnly
        Write-OfficeNewText (Join-Path $snapshotDirectory 'report.json') ($State|ConvertTo-Json -Depth 30)
        $lines=@('MANDALA TIME TRACKING '+$State.KitVersion,('Computer: '+$State.Computer),('Role: '+$State.Role),('Run: '+$State.RunId),('Snapshot: '+$State.SnapshotId),('Saved UTC: '+$State.SavedUtc),('Phase: '+$State.Phase),('Result: '+$State.Result),'')
        foreach($c in $State.Checks){$lines+=('['+$c.Status+'] '+$c.Id+': '+$c.Detail)}
        foreach($s in $State.Scenarios){$lines+=('['+$s.Status+'] '+$s.Kind+': '+$s.Detail)}
        $lines+=@('','This snapshot describes only the run and time above. Older bundles are preserved.','Return both computers reports, including the employee baseline if time tests were blocked.','Do not repeat time tests, reinstall, delete pairing or clear pending work.','Production verification and IT isolation confirmation are required before clearance.')
        Write-OfficeNewText (Join-Path $snapshotDirectory 'SUMMARY.txt') ($lines -join "`r`n")
        $localBundle=$snapshotDirectory+'.zip'
        [void](Assert-OfficeLocalPath $localBundle)
        if(Test-Path -LiteralPath $localBundle){throw 'Snapshot name already exists.'}
        Compress-Archive -LiteralPath @((Join-Path $snapshotDirectory 'report.json'),(Join-Path $snapshotDirectory 'SUMMARY.txt')) -DestinationPath $localBundle -ErrorAction Stop
        if($DesktopDirectory) { try {
            # A brand-new private child and never-overwritten filename prevent old
            # reports, links or locked files from becoming elevated write targets.
            [void](Assert-OfficeLocalPath $DesktopDirectory)
            if(-not(Test-Path -LiteralPath $DesktopDirectory -PathType Container)){throw 'Desktop is unavailable.'}
            $destination=New-OfficePrivateDirectory (Join-Path $DesktopDirectory ('Mandala report '+$State.SnapshotId)) -AdministratorsOnly:$Storage.AdministratorsOnly
            $desktopBundle=Join-Path $destination ($name+'.zip')
            [IO.File]::Copy($localBundle,$desktopBundle,$false)
        } catch {$desktopBundle=$null;$errors+=[pscustomobject]@{Stage='desktop-copy';Code=$_.Exception.GetType().Name;Detail='Desktop copy unavailable. Use the protected local report.'}} }
    } catch {$localBundle=$null;$errors+=[pscustomobject]@{Stage='local-bundle';Code=$_.Exception.GetType().Name;Detail='Report bundle unavailable. The authoritative local checkpoint is retained.'}}
    if($errors.Count -and $snapshotDirectory -and (Test-Path -LiteralPath $snapshotDirectory)) {
        try {
            Write-OfficeNewText (Join-Path $snapshotDirectory 'export-errors.json') ($errors|ConvertTo-Json -Depth 5)
            if($localBundle){Compress-Archive -LiteralPath (Join-Path $snapshotDirectory 'export-errors.json') -DestinationPath $localBundle -Update -ErrorAction Stop}
        } catch {Write-Warning 'Export error details could not be bundled; the local checkpoint remains authoritative.'}
    }
    return [pscustomobject]@{SnapshotId=$State.SnapshotId;SavedUtc=$State.SavedUtc;LocalBundle=$localBundle;DesktopBundle=$desktopBundle;Checkpoint=$Storage.StateFile;Errors=$errors}
}
function Save-OfficeSnapshot($State,$Storage,[string]$DesktopDirectory) {
    $State|Add-Member -NotePropertyName SnapshotId -NotePropertyValue ([DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ')+'-'+[Guid]::NewGuid().ToString('N').Substring(0,8)) -Force
    $State|Add-Member -NotePropertyName SavedUtc -NotePropertyValue ([DateTimeOffset]::UtcNow.ToString('o')) -Force
    # This write is mandatory. No caller may mutate before it succeeds.
    Write-OfficeCheckpoint $State $Storage.StateFile
    # Everything below is optional export. Never throw into approved operations.
    try {$result=Export-OfficeSnapshot $State $Storage $DesktopDirectory}
    catch {$result=[pscustomobject]@{SnapshotId=$State.SnapshotId;SavedUtc=$State.SavedUtc;LocalBundle=$null;DesktopBundle=$null;Checkpoint=$Storage.StateFile;Errors=@([pscustomobject]@{Stage='export';Code=$_.Exception.GetType().Name;Detail='Export unavailable; use the local checkpoint.'})}}
    $State|Add-Member -NotePropertyName LastExport -NotePropertyValue $result -Force
    if($result.Errors.Count){Write-Warning ('Report copy unavailable; preserved checkpoint: '+$Storage.StateFile)}
    return $result
}
