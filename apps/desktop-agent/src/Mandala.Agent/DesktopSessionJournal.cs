using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Runtime.Versioning;

namespace Mandala.Agent;

// A single durable session is retained until the backend returns its exact receipt.
// Windows user protection binds it to this login; atomic replacement survives process interruption.
[SupportedOSPlatform("windows")]
public sealed class DesktopSessionJournal
{
    private readonly string _path;
    public DesktopSessionJournal(string email, string? directory = null)
    {
        var name = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(email.ToLowerInvariant())));
        _path = Path.Combine(directory ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Mandala Agent"), $"time-{name}.dat");
    }

    public async Task<DesktopJournalState> LoadAsync(string email)
    {
        if (!File.Exists(_path)) return new DesktopJournalState(email, [], null);
        // Corruption is an actionable error: never discard pending work silently.
        var encrypted = await File.ReadAllBytesAsync(_path);
        var plain = ProtectedData.Unprotect(encrypted, null, DataProtectionScope.CurrentUser);
        var state = JsonSerializer.Deserialize<DesktopJournalState>(plain, AppConfiguration.JsonOptions)
            ?? throw new InvalidDataException("Pending time could not be read. Preserve diagnostics for IT.");
        if (!string.Equals(state.Email, email, StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("Pending time belongs to a different account.");
        return state;
    }

    public async Task SaveAsync(DesktopJournalState state)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(_path)!);
        var bytes = ProtectedData.Protect(JsonSerializer.SerializeToUtf8Bytes(state, AppConfiguration.JsonOptions), null, DataProtectionScope.CurrentUser);
        var temporary = _path + ".tmp";
        using (var stream = new FileStream(temporary, FileMode.Create, FileAccess.Write, FileShare.None, 4096, FileOptions.WriteThrough))
        {
            await stream.WriteAsync(bytes);
            stream.Flush(flushToDisk: true);
        }
        File.Move(temporary, _path, overwrite: true);
    }
}
