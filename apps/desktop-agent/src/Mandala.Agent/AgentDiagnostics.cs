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
