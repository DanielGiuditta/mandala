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
$releasePath = Join-Path $agentRoot "release\MandalaAgentSetup.exe"

if ([string]::IsNullOrWhiteSpace($SupabaseUrl) -or [string]::IsNullOrWhiteSpace($SupabaseAnonKey)) {
  throw "Supabase URL and anon key are required to produce an installable release."
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

$env:MANDALA_AGENT_VERSION = $Version
& iscc (Join-Path $agentRoot "installer\MandalaAgent.iss")
if ($LASTEXITCODE -ne 0) {
  throw "The Windows installer build step failed."
}

if ($SigningCertificatePath) {
  Sign-File $releasePath
}
