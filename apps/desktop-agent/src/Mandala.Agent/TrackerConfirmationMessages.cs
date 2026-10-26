namespace Mandala.Agent;

internal static class TrackerConfirmationMessages
{
    public static string ManualStop(string timeEntryId) =>
        $"Time saved successfully. Reference: {ShortReference(timeEntryId)}";

    public static string IdlePause(string timeEntryId, bool automaticallyResume = false) =>
        $"Timer paused after 5 minutes without Windows activity. Time saved successfully. Reference: {ShortReference(timeEntryId)}. " +
        (automaticallyResume ? "Tracking will resume when you use this computer. Stop ends tracking." : "Start Work to resume.");

    public static string AutomaticResume(string projectName) =>
        $"Resumed {projectName} after Windows activity. Idle time was not added.";

    public static string RestartResumePending(string projectName) =>
        $"Mandala restarted. Tracking {projectName} resumes when you use the keyboard or mouse. Time while this computer was off is not counted. Stop ends tracking.";

    public static string RestartResumed(string projectName) =>
        $"Resumed {projectName} after the restart. Time while this computer was off was not added.";

    public static string ProjectSwitch(string previousProjectName, string currentProjectName, string timeEntryId) =>
        $"{previousProjectName} time saved successfully. Reference: {ShortReference(timeEntryId)}. Now tracking {currentProjectName}.";

    public static string TooShort() =>
        "Session closed after less than 18 seconds, so no hours were added.";

    public static string Superseded() =>
        "This account started work on another computer, so tracking here stopped. Time on this computer was saved up to then.";

    // One wording for every saved session, including ones closed by another computer.
    public static string Saved(TimeEntrySaveResult result, bool pausedForIdle, bool automaticallyResume) =>
        result.Superseded ? Superseded()
        : result.TooShort ? TooShort()
        : pausedForIdle ? IdlePause(result.TimeEntryId, automaticallyResume)
        : ManualStop(result.TimeEntryId);

    private static string ShortReference(string timeEntryId) =>
        timeEntryId.Length <= 8 ? timeEntryId : timeEntryId[..8];
}
