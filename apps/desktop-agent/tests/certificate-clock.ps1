$ErrorActionPreference='Stop'
if($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted'){throw 'Certificate trust fixtures run only on disposable GitHub-hosted Windows runners.'}
. (Join-Path $PSScriptRoot '..\scripts\office-test\check-core.ps1')
function Assert($Condition,$Message){if(-not $Condition){throw $Message}}
function Reject($Action,$Message){$failed=$false;try{& $Action|Out-Null}catch{$failed=$true};Assert $failed $Message}
$now=[DateTimeOffset]'2026-09-23T12:00:00Z'
Assert-ProductionClock 'Wed, 23 Sep 2026 12:00:00 GMT' $now $now.AddMilliseconds(500) 0.5
foreach($skew in @(-3600,-32,32,3600)) {
 Reject {Assert-ProductionClock 'Wed, 23 Sep 2026 12:00:00 GMT' $now.AddSeconds($skew) $now.AddSeconds($skew+0.5) 0.5} 'Office/production clock discrepancy passed.'
}
Reject {Assert-ProductionClock '' $now $now 0} 'Missing production date passed.'
Reject {Assert-ProductionClock 'not a date' $now $now 0} 'Malformed production date passed.'
Reject {Assert-ProductionClock 'Wed, 23 Sep 2026 12:00:00 GMT' $now $now.AddSeconds(10) 10} 'Slow ambiguous sample passed.'
Reject {Assert-ProductionClock 'Wed, 23 Sep 2026 12:00:00 GMT' $now $now.AddSeconds(32) 0.5} 'Clock step during sampling passed.'
Write-Host 'PASS: production-relative clock checks detect shared office skew, invalid dates, clock steps and ambiguous latency.'
$created=@();$trusted=$null
function New-TestLeaf($Root,$Purpose='1.3.6.1.5.5.7.3.2',$Before=(Get-Date).AddHours(-1),$After=(Get-Date).AddDays(1)) {
 New-SelfSignedCertificate -Type Custom -Subject 'CN=Mandala fixture device' -Signer $Root -CertStoreLocation 'Cert:\CurrentUser\My' -KeyAlgorithm RSA -KeyLength 2048 -HashAlgorithm SHA256 -KeyUsage DigitalSignature,KeyEncipherment -NotBefore $Before -NotAfter $After -TextExtension @('2.5.29.19={critical}{text}ca=0',('2.5.29.37={critical}{text}'+$Purpose))
}
try {
 $root=New-SelfSignedCertificate -Type Custom -Subject ('CN=Mandala pairing issuer '+[Guid]::NewGuid().ToString('N')) -CertStoreLocation 'Cert:\CurrentUser\My' -KeyAlgorithm RSA -KeyLength 2048 -HashAlgorithm SHA256 -KeyUsage CertSign,CRLSign -NotBefore (Get-Date).AddYears(-1) -NotAfter (Get-Date).AddYears(1) -TextExtension @('2.5.29.19={critical}{text}ca=1')
 $created+=$root.Thumbprint
 $leaf=New-TestLeaf $root;$created+=$leaf.Thumbprint
 Reject {Assert-EmployeeCertificate $leaf $leaf.Thumbprint} 'Untrusted pairing issuer was accepted.'
 $store=New-Object Security.Cryptography.X509Certificates.X509Store('Root','CurrentUser')
 try {$store.Open('ReadWrite');$store.Add([Security.Cryptography.X509Certificates.X509Certificate2]::new($root.RawData));$trusted=$root.Thumbprint}finally{$store.Close()}
 Assert-EmployeeCertificate $leaf $leaf.Thumbprint
 Reject {Assert-EmployeeCertificate $leaf ('0'*40)} 'Wrong paired identity was accepted.'
 $public=[Security.Cryptography.X509Certificates.X509Certificate2]::new($leaf.RawData)
 try {Reject {Assert-EmployeeCertificate $public $public.Thumbprint} 'Missing employee private key passed.'}finally{$public.Dispose()}
 Reject {Assert-EmployeeCertificate $root $root.Thumbprint} 'CA certificate accepted as employee leaf.'
 $badBytes=[byte[]]$leaf.RawData.Clone();$badBytes[$badBytes.Length-1]=$badBytes[$badBytes.Length-1] -bxor 1
 $badPublic=[Security.Cryptography.X509Certificates.X509Certificate2]::new($badBytes)
 $key=[Security.Cryptography.X509Certificates.RSACertificateExtensions]::GetRSAPrivateKey($leaf)
 $bad=[Security.Cryptography.X509Certificates.RSACertificateExtensions]::CopyWithPrivateKey($badPublic,$key)
 try {Reject {Assert-EmployeeCertificate $bad $bad.Thumbprint} 'Forged signature accepted with matching key and identity.'}finally{$bad.Dispose();$badPublic.Dispose();$key.Dispose()}
 $server=New-TestLeaf $root '1.3.6.1.5.5.7.3.1';$created+=$server.Thumbprint
 Reject {Assert-EmployeeCertificate $server $server.Thumbprint} 'Server-only certificate accepted for client authentication.'
 $expired=New-TestLeaf $root '1.3.6.1.5.5.7.3.2' (Get-Date).AddDays(-2) (Get-Date).AddDays(-1);$created+=$expired.Thumbprint
 Reject {Assert-EmployeeCertificate $expired $expired.Thumbprint} 'Expired employee certificate passed.'
 $future=New-TestLeaf $root '1.3.6.1.5.5.7.3.2' (Get-Date).AddDays(1) (Get-Date).AddDays(2);$created+=$future.Thumbprint
 Reject {Assert-EmployeeCertificate $future $future.Thumbprint} 'Not-yet-valid employee certificate passed.'
 Write-Host 'PASS: valid private pairing certificate accepted; untrusted issuer, wrong identity, missing private key, CA leaf, forged signature, wrong purpose, expired and future certificates rejected.'
} finally {
 if($trusted){Remove-Item -LiteralPath ('Cert:\CurrentUser\Root\'+$trusted) -ErrorAction Stop}
 foreach($thumb in $created){Remove-Item -LiteralPath ('Cert:\CurrentUser\My\'+$thumb) -ErrorAction Stop}
}
