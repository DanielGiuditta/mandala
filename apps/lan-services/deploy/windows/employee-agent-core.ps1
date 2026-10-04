$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'startup-repair\startup-core.ps1')
$script:AgentName='MandalaAgentSetup-1.0.16.exe'
$script:AgentHash='f517f48ace1638cea05471224938a660bb1def0d1ac17a794a16c2737d30dccb'
$script:AgentBinaryHash='7e26d9e536aed746b3f0247c2254295726a2f8fd6206c901de2a29d1a3f38fdf'
function Get-EmployeeAgentRequirement($AgentPath, $CommonDataDirectory) {
    if (-not $AgentPath) { return 'Install' }
    Assert-MandalaAgent $AgentPath $CommonDataDirectory
    $productVersion=(Get-Item -LiteralPath $AgentPath).VersionInfo.ProductVersion
    if ($productVersion -notmatch '^(\d+\.\d+\.\d+)(?:\.\d+)?(?:\+.*)?$') { throw 'The installed Agent version could not be verified. It was left unchanged.' }
    $version=[Version]$Matches[1]
    if ($version -gt [Version]'1.0.16') { throw 'A newer Agent is installed and was left unchanged. Use pairing tools audited for that release; do not downgrade it.' }
    if ($version -lt [Version]'1.0.16') { return 'Install' }
    if ((Get-FileHash -LiteralPath $AgentPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $script:AgentBinaryHash) {
        throw 'The installed 1.0.16 Agent does not match its audited release. It was left unchanged; ask IT to verify the installation.'
    }
    return 'Ready'
}
