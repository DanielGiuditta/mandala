namespace Mandala.Agent;

// Anchored to the authenticated start receipt, then advanced only by elapsed
// process time. Changing the Windows clock cannot add or subtract work.
public sealed class DesktopSessionClock(TimeProvider? timeProvider = null)
{
    private readonly TimeProvider _time = timeProvider ?? TimeProvider.System;
    private DateTimeOffset _origin;
    private long _timestamp;
    private bool _started;

    public void Start(DateTimeOffset serverStartedAt)
    {
        _origin = serverStartedAt;
        _timestamp = _time.GetTimestamp();
        _started = true;
    }

    public DateTimeOffset UtcNow => _started
        ? _origin + _time.GetElapsedTime(_timestamp)
        : throw new InvalidOperationException("No confirmed session clock is available.");

    public static TimeSpan Elapsed(DateTimeOffset start, DateTimeOffset now) =>
        now > start ? now - start : TimeSpan.Zero;
}
