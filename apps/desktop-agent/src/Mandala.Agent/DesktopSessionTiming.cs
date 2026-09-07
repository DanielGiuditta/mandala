namespace Mandala.Agent;

public static class DesktopSessionTiming
{
    public static DateTimeOffset StopAt(DesktopSession session, DateTimeOffset now)
    {
        var idleEnd = session.LastActivityAt.AddMinutes(5);
        var maximum = session.StartedAt.AddHours(24);
        var end = now < idleEnd ? now : idleEnd;
        if (end > maximum) end = maximum;
        return end < session.StartedAt ? session.StartedAt : end;
    }
}
