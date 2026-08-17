namespace Mandala.Agent;

internal sealed class TrackerMessageState
{
    private string? _persistentMessage;

    public void ClearPersistent() => _persistentMessage = null;

    public string ShowPersistent(string message)
    {
        _persistentMessage = message;
        return message;
    }

    public string ResolveAfterLoad(string? warning, string fallback)
    {
        if (!string.IsNullOrWhiteSpace(warning))
        {
            return warning;
        }

        return _persistentMessage ?? fallback;
    }

    public string CombineWithPersistent(string message) =>
        string.IsNullOrWhiteSpace(_persistentMessage)
            ? message
            : $"{_persistentMessage}{Environment.NewLine}{message}";
}
