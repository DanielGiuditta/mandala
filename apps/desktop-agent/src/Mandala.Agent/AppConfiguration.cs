using System.IO;
using System.Text.Json;

namespace Mandala.Agent;

public sealed record AppConfiguration(string SupabaseUrl, string SupabaseAnonKey)
{
    public const string ProductionProjectRef = "nzlajptokbcgeaifgnoq";

    public string? ProjectRef
    {
        get
        {
            if (!Uri.TryCreate(SupabaseUrl, UriKind.Absolute, out var uri) ||
                !string.Equals(uri.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase))
            {
                return null;
            }

            var suffix = ".supabase.co";
            return uri.Host.EndsWith(suffix, StringComparison.OrdinalIgnoreCase)
                ? uri.Host[..^suffix.Length]
                : null;
        }
    }

    public bool IsConfigured =>
        Uri.TryCreate(SupabaseUrl, UriKind.Absolute, out _) &&
        !string.IsNullOrWhiteSpace(SupabaseAnonKey);

    public bool IsProductionTarget =>
        string.Equals(ProjectRef, ProductionProjectRef, StringComparison.OrdinalIgnoreCase);

    public static AppConfiguration Load()
    {
        var paths = new[]
        {
            Path.Combine(AppContext.BaseDirectory, "agent.config.json"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "Mandala Agent", "agent.config.json"),
        };

        foreach (var path in paths)
        {
            if (!File.Exists(path))
            {
                continue;
            }

            try
            {
                var configuration = JsonSerializer.Deserialize<AppConfiguration>(File.ReadAllText(path), JsonOptions);
                if (configuration is not null)
                {
                    return configuration with
                    {
                        SupabaseUrl = configuration.SupabaseUrl.TrimEnd('/'),
                        SupabaseAnonKey = configuration.SupabaseAnonKey.Trim(),
                    };
                }
            }
            catch (JsonException)
            {
                // Continue to the fallback path and show a clear message in the UI if none work.
            }
        }

        return new AppConfiguration(
            Environment.GetEnvironmentVariable("MANDALA_SUPABASE_URL")?.TrimEnd('/') ?? string.Empty,
            Environment.GetEnvironmentVariable("MANDALA_SUPABASE_ANON_KEY")?.Trim() ?? string.Empty);
    }

    public static JsonSerializerOptions JsonOptions { get; } = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };
}
