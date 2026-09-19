param([Parameter(Mandatory=$true)][string]$PackageDirectory)
$ErrorActionPreference='Stop'
function Assert($Condition,$Message){if(-not $Condition){throw $Message}}
$entry=Join-Path $PackageDirectory 'package-entry.ps1'
$t=$null;$e=$null;$ast=[Management.Automation.Language.Parser]::ParseFile($entry,[ref]$t,[ref]$e)
Assert ($e.Count -eq 0) 'Package entry syntax invalid.'
$function=$ast.Find({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Assert-OfficePackage'},$true)
$script:packageTestRoot=$PackageDirectory
Invoke-Expression ($function.Extent.Text.Replace('$PSScriptRoot','$script:packageTestRoot'))
Get-ChildItem -LiteralPath $PackageDirectory -Recurse -Filter '*.ps1'|ForEach-Object {Set-Content -LiteralPath $_.FullName -Stream Zone.Identifier -Value "[ZoneTransfer]`r`nZoneId=3"}
Assert-OfficePackage
Assert (-not(Get-Item -LiteralPath (Join-Path $PackageDirectory 'report-core.ps1') -Stream Zone.Identifier -ErrorAction SilentlyContinue)) 'Verified dependency remains Internet blocked.'
$extra=Join-Path $PackageDirectory 'unexpected.ps1'
Set-Content -LiteralPath $extra -Value '# unexpected'
$failed=$false;try {Assert-OfficePackage}catch{$failed=$true}
Assert $failed 'Unexpected package file accepted.'
Remove-Item -LiteralPath $extra
$target=Join-Path $PackageDirectory 'READ-FIRST.txt';$original=[IO.File]::ReadAllBytes($target)
try {Add-Content -LiteralPath $target -Value 'modified';$failed=$false;try {Assert-OfficePackage}catch{$failed=$true};Assert $failed 'Changed package content accepted.'}
finally {[IO.File]::WriteAllBytes($target,$original)}
Assert-OfficePackage
Write-Host 'PASS: staged package inventory, hashes, Internet-marked dependency unblocking, extra files and tampering.'
