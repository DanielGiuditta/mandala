using System.IO;

namespace Mandala.Agent;

public sealed class AgentDiagnosticException : Exception
{
    public AgentDiagnosticException(string code, string message, Exception? innerException = null)
        : base(message, innerException)
    {
        Code = code;
    }

    public string Code { get; }
}

public static class AgentDiagnostics
{
    private static readonly object LogLock = new();

    public static string LogPath => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "Mandala Agent",
        "agent.log");

    public static void Record(string eventName, string details)
    {
        try
        {
            var directory = Path.GetDirectoryName(LogPath);
            if (!string.IsNullOrWhiteSpace(directory))
            {
                Directory.CreateDirectory(directory);
            }

            var line = $"{DateTimeOffset.Now:yyyy-MM-dd HH:mm:ss.fff zzz} | UTC {DateTimeOffset.UtcNow:O} | {eventName} | {Compact(details)}{Environment.NewLine}";
            lock (LogLock)
            {
                File.AppendAllText(LogPath, line);
            }
        }
        catch
        {
            // Diagnostics must never prevent the time tracker from running.
        }
    }

    public static string Report()
    {
        try
        {
            var lines = File.Exists(LogPath)
                ? File.ReadAllLines(LogPath).TakeLast(100)
                : Array.Empty<string>();
            return $"Mandala Agent diagnostics{Environment.NewLine}Log: {LogPath}{Environment.NewLine}{string.Join(Environment.NewLine, lines)}";
        }
        catch (Exception exception)
        {
            return $"Mandala Agent diagnostics{Environment.NewLine}Log: {LogPath}{Environment.NewLine}Unable to read log: {Compact(exception.Message)}";
        }
    }

    public static string SaveReportToDesktop()
    {
        var desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
        var path = Path.Combine(desktop, $"MandalaAgentDiagnostics-{DateTime.Now:yyyyMMdd-HHmmss}.txt");
        File.WriteAllText(path, Report());
        return path;
    }

    public static string Format(string code, string message, Exception? exception = null)
    {
        var detail = exception is null ? string.Empty : Compact(exception.Message);
        return string.IsNullOrWhiteSpace(detail)
            ? $"Error code {code}: {message}"
            : $"Error code {code}: {message} {detail}";
    }

    public static string Compact(string? message)
    {
        if (string.IsNullOrWhiteSpace(message))
        {
            return string.Empty;
        }

        var compact = message.Replace('\r', ' ').Replace('\n', ' ').Trim();
        return compact.Length <= 280 ? compact : $"{compact[..277]}...";
    }
}
