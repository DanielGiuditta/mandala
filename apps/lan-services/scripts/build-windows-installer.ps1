param([string]$Version = '1.1.0')
$ErrorActionPreference = 'Stop'
if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid gateway version.' }
$root = Split-Path -Parent $PSScriptRoot
$production = 'https://nzlajptokbcgeaifgnoq.supabase.co'
if ($env:MANDALA_SUPABASE_URL.TrimEnd('/') -ne $production) { throw 'Incorrect production backend.' }
Invoke-WebRequest "$production/auth/v1/settings" -Headers @{apikey=$env:MANDALA_SUPABASE_ANON_KEY} | Out-Null
$nodeVersion = '24.20.0'
$archiveName = "node-v$nodeVersion-win-x64.zip"
$work = Join-Path $env:RUNNER_TEMP 'mandala-bundled-node'
New-Item -ItemType Directory -Path $work -Force | Out-Null
$archive = Join-Path $work $archiveName
Invoke-WebRequest "https://nodejs.org/dist/v$nodeVersion/$archiveName" -OutFile $archive
$sums = (Invoke-WebRequest "https://nodejs.org/dist/v$nodeVersion/SHASUMS256.txt").Content
$line = @($sums -split "`n" | Where-Object { $_.Trim() -match ("^[a-fA-F0-9]{64}\s+" + [regex]::Escape($archiveName) + '$') })
if ($line.Count -ne 1) { throw 'Official runtime checksum was not found.' }
$expected = ($line[0].Trim() -split '\s+')[0].ToLowerInvariant()
if ((Get-FileHash $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) { throw 'Node runtime checksum mismatch.' }
Expand-Archive -LiteralPath $archive -DestinationPath $work -Force
$runtime = Join-Path $work "node-v$nodeVersion-win-x64"
$publish = Join-Path $root 'publish'
New-Item -ItemType Directory -Path (Join-Path $publish 'runtime') -Force | Out-Null
Copy-Item (Join-Path $runtime 'node.exe') (Join-Path $publish 'runtime/node.exe') -Force
Copy-Item (Join-Path $runtime 'LICENSE') (Join-Path $publish 'runtime/LICENSE') -Force
Copy-Item (Join-Path $root 'deploy/windows/*') $publish -Force
Copy-Item (Join-Path $root 'gateway.mjs'), (Join-Path $root 'security.mjs') $publish -Force
Copy-Item (Join-Path $root '../desktop-agent/scripts/configure-lan.ps1') $publish -Force
$configFile = Join-Path $publish 'gateway.example.json'
$config = Get-Content $configFile -Raw | ConvertFrom-Json
$config.supabaseAnonKey = $env:MANDALA_SUPABASE_ANON_KEY
$config | ConvertTo-Json | Set-Content $configFile -Encoding utf8
$nodeHash = (Get-FileHash (Join-Path $publish 'runtime/node.exe') -Algorithm SHA256).Hash.ToLowerInvariant()
@{ version=$Version; backendProjectRef='nzlajptokbcgeaifgnoq'; nodeVersion=$nodeVersion; nodeSha256=$nodeHash; nodeArchiveSha256=$expected } | ConvertTo-Json | Set-Content (Join-Path $publish 'gateway-release.json') -Encoding utf8
$env:MANDALA_GATEWAY_VERSION=$Version
$iscc = Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 6/ISCC.exe'
& $iscc (Join-Path $root 'installer/MandalaGateway.iss')
if ($LASTEXITCODE -ne 0) { throw 'Gateway installer build failed.' }
