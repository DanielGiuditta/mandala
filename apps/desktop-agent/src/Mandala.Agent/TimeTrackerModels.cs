namespace Mandala.Agent;

public sealed record TimeTrackerProject(string Id, string Name)
{
    public override string ToString() => Name;
}
public sealed record ActiveWorkSession(string ProjectId, string ProjectName, DateTimeOffset StartedAt);
public sealed record TimeEntrySaveResult(string TimeEntryId, bool Pending = false, bool TooShort = false);
public sealed record TrackerSnapshot(IReadOnlyList<TimeTrackerProject> Projects, ActiveWorkSession? ActiveSession, string? Warning);
public sealed record DesktopSession(
    string Id, string ProjectId, string ProjectName, string EntryDate,
    DateTimeOffset StartedAt, DateTimeOffset LastActivityAt,
    bool Confirmed = false, DateTimeOffset? StoppedAt = null);
public sealed record DesktopJournalState(string Email, IReadOnlyList<TimeTrackerProject> Projects, DesktopSession? Session);
