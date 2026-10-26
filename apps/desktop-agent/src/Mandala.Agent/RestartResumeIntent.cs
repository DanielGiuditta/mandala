using System.IO;
using System.Runtime.Versioning;
using System.Security.Cryptography;
using System.Text.Json;

namespace Mandala.Agent;

// The project the employee last explicitly started, kept on this computer so
// tracking can resume after an unexpected restart such as a power cut. It is
// used only for the same Windows user (DPAPI, per-user folder) and Mandala
// account, on the same local day, and only after new keyboard or mouse input.
// Explicit Stop deletes it.
public sealed record RestartResumeIntent(string Email, string ProjectId, string ProjectName, string LocalDate);

internal static class RestartResumeDecision
{
    public static TimeTrackerProject? ProjectToResume(RestartResumeIntent? intent, string? email, string localDate) =>
        intent is not null
        && !string.IsNullOrWhiteSpace(email)
        && string.Equals(intent.Email, email, StringComparison.OrdinalIgnoreCase)
        && string.Equals(intent.LocalDate, localDate, StringComparison.Ordinal)
        && !string.IsNullOrWhiteSpace(intent.ProjectId)
            ? new TimeTrackerProject(intent.ProjectId, intent.ProjectName)
            : null;
}

[SupportedOSPlatform("windows")]
public sealed class RestartResumeIntentStore
{
    private readonly string _path;
    private readonly bool _protect;

    public RestartResumeIntentStore(string? directory = null) : this(directory, protect: true) { }

    // Regression tests on non-Windows hosts store the same JSON without DPAPI.
    internal RestartResumeIntentStore(string? directory, bool protect)
    {
        _path = Path.Combine(
            directory ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Mandala Agent"),
            "resume-intent.dat");
        _protect = protect;
    }

    public RestartResumeIntent? Load()
    {
        try
        {
            if (!File.Exists(_path)) return null;
            var stored = File.ReadAllBytes(_path);
            var plain = _protect ? ProtectedData.Unprotect(stored, null, DataProtectionScope.CurrentUser) : stored;
            return JsonSerializer.Deserialize<RestartResumeIntent>(plain, AppConfiguration.JsonOptions);
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException or CryptographicException or JsonException)
        {
            // An unreadable file only means no automatic resume; it never holds time.
            Clear();
            return null;
        }
    }

    // Synchronous and atomic, like the time journal.
    public void Save(RestartResumeIntent intent)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(_path)!);
        var json = JsonSerializer.SerializeToUtf8Bytes(intent, AppConfiguration.JsonOptions);
        var bytes = _protect ? ProtectedData.Protect(json, null, DataProtectionScope.CurrentUser) : json;
        var temporary = _path + ".tmp";
        using (var stream = new FileStream(temporary, FileMode.Create, FileAccess.Write, FileShare.None, 4096, FileOptions.WriteThrough))
        {
            stream.Write(bytes);
            stream.Flush(flushToDisk: true);
        }
        File.Move(temporary, _path, overwrite: true);
    }

    public void Clear()
    {
        try
        {
            if (File.Exists(_path)) File.Delete(_path);
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            AgentDiagnostics.Record("restart-resume-clear-failure", AgentDiagnostics.Compact(exception.Message));
        }
    }
}
