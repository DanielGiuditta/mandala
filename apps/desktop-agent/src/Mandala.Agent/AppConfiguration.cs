using System.IO;
using System.Text.Json;

namespace Mandala.Agent;

public sealed record AppConfiguration(string SupabaseUrl, string SupabaseAnonKey)
{
    public string? GatewayUrl { get; init; }
    public string? DeviceCertificateThumbprint { get; init; }
    public bool UsesLanGateway => !string.IsNullOrWhiteSpace(GatewayUrl);
    public bool IsValidGateway => !UsesLanGateway ||
        (Uri.TryCreate(GatewayUrl, UriKind.Absolute, out var gateway) &&
         gateway.Scheme == Uri.UriSchemeHttps && gateway.AbsolutePath == "/" &&
         gateway.UserInfo.Length == 0 && gateway.Query.Length == 0 && gateway.Fragment.Length == 0 &&
         !string.IsNullOrWhiteSpace(DeviceCertificateThumbprint));
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
        string.Equals(SupabaseUrl.TrimEnd('/'), $"https://{ProductionProjectRef}.supabase.co", StringComparison.OrdinalIgnoreCase);

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
                    var normalized = configuration with
                    {
                        SupabaseUrl = configuration.SupabaseUrl.TrimEnd('/'),
                        SupabaseAnonKey = configuration.SupabaseAnonKey.Trim(),
                    };
                    // IT may set LAN transport without changing the audited embedded backend.
                    var lanPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "Mandala Agent", "lan.config.json");
                    if (File.Exists(lanPath))
                    {
                        var lan = JsonSerializer.Deserialize<LanConfiguration>(File.ReadAllText(lanPath), JsonOptions)
                            ?? throw new InvalidDataException("LAN configuration is invalid.");
                        if (string.IsNullOrWhiteSpace(lan.GatewayUrl) || string.IsNullOrWhiteSpace(lan.DeviceCertificateThumbprint))
                            throw new InvalidDataException("LAN configuration is incomplete.");
                        normalized = normalized with { GatewayUrl = lan.GatewayUrl, DeviceCertificateThumbprint = lan.DeviceCertificateThumbprint };
                    }
                    return normalized;
                }
            }
            catch (JsonException)
            {
                // Malformed managed settings must never silently enable direct transport.
                return new AppConfiguration("", "");
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

    private sealed record LanConfiguration(string GatewayUrl, string DeviceCertificateThumbprint);
}
