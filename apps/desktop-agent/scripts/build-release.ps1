param(
  [Parameter(Mandatory = $true)] [string] $Version,
  [Parameter(Mandatory = $true)] [string] $SupabaseUrl,
  [Parameter(Mandatory = $true)] [string] $SupabaseAnonKey,
  [string] $SigningCertificatePath,
  [string] $SigningCertificatePassword
)

$ErrorActionPreference = "Stop"
$agentRoot = Split-Path -Parent $PSScriptRoot
$projectPath = Join-Path $agentRoot "src\Mandala.Agent\Mandala.Agent.csproj"
$configPath = Join-Path $agentRoot "src\Mandala.Agent\agent.config.json"
$publishPath = Join-Path $agentRoot "publish"
$releasePath = Join-Path $agentRoot "release\MandalaAgentSetup-$Version.exe"
$expectedProjectRef = "nzlajptokbcgeaifgnoq"

if ([string]::IsNullOrWhiteSpace($SupabaseUrl) -or [string]::IsNullOrWhiteSpace($SupabaseAnonKey)) {
  throw "Supabase URL and anon key are required to produce an installable release."
}

if ($Version -notmatch '^\d+\.\d+\.\d+$') {
  throw "Version must use major.minor.patch format, for example 1.0.10."
}

$supabaseUri = [Uri]$SupabaseUrl
$actualProjectRef = $supabaseUri.Host.Split('.')[0]
if ($supabaseUri.Scheme -ne "https" -or $actualProjectRef -ne $expectedProjectRef) {
  throw "The Windows agent build target is $actualProjectRef, but production is $expectedProjectRef."
}

try {
  Invoke-WebRequest `
    -Uri "$($SupabaseUrl.TrimEnd('/'))/auth/v1/settings" `
    -Headers @{ apikey = $SupabaseAnonKey } `
    -Method Get `
    -UseBasicParsing | Out-Null
} catch {
  throw "The supplied anonymous key was rejected by the production Supabase URL. Refusing to build. $($_.Exception.Message)"
}

@{
  supabaseUrl = $SupabaseUrl.TrimEnd("/")
  supabaseAnonKey = $SupabaseAnonKey
} | ConvertTo-Json | Set-Content -Path $configPath -Encoding utf8

function Sign-File([string] $Path) {
  if (-not (Test-Path $SigningCertificatePath)) {
    throw "The signing certificate was not found: $SigningCertificatePath"
  }

  $signTool = Get-Command signtool.exe -ErrorAction SilentlyContinue
  if (-not $signTool) {
    throw "signtool.exe is required to sign the installer. Install the Windows SDK and try again."
  }

  $signArguments = @("sign", "/fd", "SHA256", "/f", $SigningCertificatePath)
  if ($SigningCertificatePassword) {
    $signArguments += @("/p", $SigningCertificatePassword)
  }
  $signArguments += $Path
  & $signTool.Source @signArguments

  if ($LASTEXITCODE -ne 0) {
    throw "Code signing failed."
  }
}

& dotnet publish $projectPath -c Release -r win-x64 --self-contained true -p:Version=$Version -o $publishPath
if ($LASTEXITCODE -ne 0) {
  throw "The Windows agent publish step failed."
}

if ($SigningCertificatePath) {
  Sign-File (Join-Path $publishPath "Mandala.Agent.exe")
}

$publishedConfigPath = Join-Path $publishPath "agent.config.json"
$publishedConfig = Get-Content $publishedConfigPath -Raw | ConvertFrom-Json
if (([Uri]$publishedConfig.supabaseUrl).Host.Split('.')[0] -ne $expectedProjectRef) {
  throw "The published application contains the wrong Supabase backend."
}
if ($publishedConfig.supabaseAnonKey -ne $SupabaseAnonKey) {
  throw "The published application does not contain the approved anonymous key."
}

$env:MANDALA_AGENT_VERSION = $Version
& iscc (Join-Path $agentRoot "installer\MandalaAgent.iss")
if ($LASTEXITCODE -ne 0) {
  throw "The Windows installer build step failed."
}

if ($SigningCertificatePath) {
  Sign-File $releasePath
}

if (-not (Test-Path $releasePath)) {
  throw "The versioned installer was not created: $releasePath"
}
