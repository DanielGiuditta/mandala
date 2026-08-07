namespace Mandala.Agent;

internal static class TrackerConfirmationMessages
{
    public static string ManualStop(string timeEntryId) =>
        $"Time saved successfully. Reference: {ShortReference(timeEntryId)}";

    public static string IdlePause(string timeEntryId) =>
        $"Timer paused after 5 minutes without Windows activity. Time saved successfully. Reference: {ShortReference(timeEntryId)}. Start Work to resume.";

    public static string ProjectSwitch(string previousProjectName, string currentProjectName, string timeEntryId) =>
        $"{previousProjectName} time saved successfully. Reference: {ShortReference(timeEntryId)}. Now tracking {currentProjectName}.";

    private static string ShortReference(string timeEntryId) =>
        timeEntryId.Length <= 8 ? timeEntryId : timeEntryId[..8];
}
