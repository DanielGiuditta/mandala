namespace Mandala.Agent;

public sealed record TimeTrackerProject(string Id, string Name)
{
    public override string ToString() => Name;
}
public sealed record ActiveWorkSession(string ProjectId, string ProjectName, DateTimeOffset StartedAt);
public sealed record TimeEntrySaveResult(string TimeEntryId, bool Pending = false, bool TooShort = false, bool Superseded = false);
public sealed record TrackerSnapshot(IReadOnlyList<TimeTrackerProject> Projects, ActiveWorkSession? ActiveSession, string? Warning);
public sealed record DesktopSession(
    string Id, string ProjectId, string ProjectName, string EntryDate,
    DateTimeOffset StartedAt, DateTimeOffset LastActivityAt,
    bool Confirmed = false, DateTimeOffset? StoppedAt = null);
// Completed holds finished sessions still waiting for upload (oldest first), so
// an outage never blocks the next session. Journals written before 1.0.18 have none.
public sealed record DesktopJournalState(string Email, IReadOnlyList<TimeTrackerProject> Projects, DesktopSession? Session,
    IReadOnlyList<DesktopSession>? Completed = null);

// Another computer started work for the same account, so the server ended this session.
public sealed class DesktopSessionSupersededException(string message) : Exception(message);
