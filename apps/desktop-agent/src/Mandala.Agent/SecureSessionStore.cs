using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Mandala.Agent;

public sealed class SecureSessionStore
{
    private readonly string _path = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "Mandala Agent",
        "session.dat");

    public async Task SaveAsync(StoredSession session)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(_path)!);
        var plainText = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(session, AppConfiguration.JsonOptions));
        var encrypted = ProtectedData.Protect(plainText, null, DataProtectionScope.CurrentUser);
        await File.WriteAllBytesAsync(_path, encrypted);
    }

    public async Task<StoredSession?> LoadAsync()
    {
        if (!File.Exists(_path))
        {
            return null;
        }

        try
        {
            var encrypted = await File.ReadAllBytesAsync(_path);
            var plainText = ProtectedData.Unprotect(encrypted, null, DataProtectionScope.CurrentUser);
            return JsonSerializer.Deserialize<StoredSession>(plainText, AppConfiguration.JsonOptions);
        }
        catch (CryptographicException)
        {
            await ClearAsync();
            return null;
        }
    }

    public Task ClearAsync()
    {
        if (File.Exists(_path))
        {
            File.Delete(_path);
        }

        return Task.CompletedTask;
    }
}

public sealed record StoredSession(string AccessToken, string RefreshToken, string Email);
