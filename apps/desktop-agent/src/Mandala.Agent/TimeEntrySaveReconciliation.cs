namespace Mandala.Agent;

public static class TimeEntrySaveReconciliation
{
    public static string? FindRecoveredEntry(
        IReadOnlySet<string> entriesBefore,
        IEnumerable<string> entriesAfter,
        string? activeProjectId,
        string? expectedActiveProjectId)
    {
        if (!string.Equals(
                activeProjectId,
                expectedActiveProjectId,
                StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        var newEntries = entriesAfter
            .Where(entryId => !entriesBefore.Contains(entryId))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(2)
            .ToList();

        return newEntries.Count == 1 ? newEntries[0] : null;
    }
}
