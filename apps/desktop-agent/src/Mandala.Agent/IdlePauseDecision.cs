namespace Mandala.Agent;

public static class IdlePauseDecision
{
    public static bool ShouldPause(
        TimeSpan windowsIdleDuration,
        DateTimeOffset previousPollAt,
        DateTimeOffset currentPollAt,
        TimeSpan idleLimit)
    {
        var pollGap = currentPollAt - previousPollAt;
        return windowsIdleDuration >= idleLimit || pollGap >= idleLimit;
    }
}
