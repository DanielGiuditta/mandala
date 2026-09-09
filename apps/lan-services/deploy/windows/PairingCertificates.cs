using System;
using System.Net;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;

public sealed class MandalaCertificateMaterial {
    public byte[] Root;
    public byte[] Certificate;
    public byte[] Pfx;
}
public static class MandalaPairingCertificates {
    // The issuer private key exists only in memory and is disposed immediately.
    // Only the leaf key is exported; no reusable signing authority is installed.
    public static MandalaCertificateMaterial Create(string name, string ip, bool server, string password) {
        using (var issuerKey = new RSACng(3072))
        using (var leafKey = new RSACng(3072)) {
            var issuerRequest = new CertificateRequest("CN=Mandala pairing issuer " + Guid.NewGuid().ToString("N"), issuerKey, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
            issuerRequest.CertificateExtensions.Add(new X509BasicConstraintsExtension(true, false, 0, true));
            issuerRequest.CertificateExtensions.Add(new X509KeyUsageExtension(X509KeyUsageFlags.KeyCertSign | X509KeyUsageFlags.CrlSign, true));
            var now = DateTimeOffset.UtcNow.AddMinutes(-5);
            using (var issuer = issuerRequest.CreateSelfSigned(now, now.AddYears(3))) {
                var request = new CertificateRequest("CN=" + name, leafKey, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
                request.CertificateExtensions.Add(new X509BasicConstraintsExtension(false, false, 0, true));
                request.CertificateExtensions.Add(new X509KeyUsageExtension(X509KeyUsageFlags.DigitalSignature | X509KeyUsageFlags.KeyEncipherment, true));
                var purposes = new OidCollection();
                purposes.Add(new Oid(server ? "1.3.6.1.5.5.7.3.1" : "1.3.6.1.5.5.7.3.2"));
                request.CertificateExtensions.Add(new X509EnhancedKeyUsageExtension(purposes, true));
                if (server) { var san = new SubjectAlternativeNameBuilder(); san.AddIpAddress(IPAddress.Parse(ip)); request.CertificateExtensions.Add(san.Build()); }
                var serial = new byte[16]; using (var random = RandomNumberGenerator.Create()) { random.GetBytes(serial); }
                serial[0] &= 0x7f;
                using (var leaf = request.Create(issuer, now, now.AddYears(1), serial))
                using (var withKey = RSACertificateExtensions.CopyWithPrivateKey(leaf, leafKey)) {
                    return new MandalaCertificateMaterial { Root = issuer.Export(X509ContentType.Cert), Certificate = leaf.Export(X509ContentType.Cert), Pfx = withKey.Export(X509ContentType.Pfx, password) };
                }
            }
        }
    }
    public static string Fingerprint(byte[] certificate) {
        using (var sha = SHA256.Create()) { return BitConverter.ToString(sha.ComputeHash(certificate)).Replace("-", ":"); }
    }
    public static bool Validate(byte[] leafBytes, byte[] rootBytes, bool server) {
        using (var leaf = new X509Certificate2(leafBytes))
        using (var root = new X509Certificate2(rootBytes))
        using (var chain = new X509Chain()) {
            if (leaf.HasPrivateKey || root.HasPrivateKey || leaf.NotAfter <= DateTime.Now || root.NotAfter <= DateTime.Now) return false;
            bool leafIsLeaf = false, rootIsCa = false;
            foreach (var ext in leaf.Extensions) if (ext is X509BasicConstraintsExtension) leafIsLeaf = !((X509BasicConstraintsExtension)ext).CertificateAuthority;
            foreach (var ext in root.Extensions) if (ext is X509BasicConstraintsExtension) rootIsCa = ((X509BasicConstraintsExtension)ext).CertificateAuthority;
            if (!leafIsLeaf || !rootIsCa) return false;
            chain.ChainPolicy.ExtraStore.Add(root);
            chain.ChainPolicy.RevocationMode = X509RevocationMode.NoCheck;
            chain.ChainPolicy.VerificationFlags = X509VerificationFlags.AllowUnknownCertificateAuthority;
            chain.ChainPolicy.ApplicationPolicy.Add(new Oid(server ? "1.3.6.1.5.5.7.3.1" : "1.3.6.1.5.5.7.3.2"));
            return chain.Build(leaf) && chain.ChainElements.Count == 2 && chain.ChainElements[1].Certificate.Thumbprint == root.Thumbprint;
        }
    }
}
