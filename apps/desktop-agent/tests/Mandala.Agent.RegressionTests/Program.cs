using System.Net;
using System.Text;
using Mandala.Agent;

await AcceptsSuccessfulEmptyHeartbeatResponse();
await PreservesServerErrorDetails();
PreservesSaveConfirmationAcrossReloadAndDiagnosticsExport();
FormatsEveryFinalizedSessionWithAReference();
RecoversAStopAfterTheServerSavedButTheResponseWasLost();
RecoversAProjectSwitchAfterTheServerSavedButTheResponseWasLost();
FailsClosedWhenTheRecoveredSaveIsAmbiguousOrTheSessionStateIsWrong();

Console.WriteLine("PASS: Mandala Agent regression checks");

static async Task AcceptsSuccessfulEmptyHeartbeatResponse()
{
    using var response = new HttpResponseMessage(HttpStatusCode.NoContent);
    await AgentHttpResponse.EnsureSuccessAsync(response);
}

static async Task PreservesServerErrorDetails()
{
    using var response = new HttpResponseMessage(HttpStatusCode.BadRequest)
    {
        Content = new StringContent("heartbeat rejected", Encoding.UTF8, "text/plain"),
    };

    try
    {
        await AgentHttpResponse.EnsureSuccessAsync(response);
        throw new InvalidOperationException("Expected the failed response to throw.");
    }
    catch (HttpRequestException exception) when (exception.Message == "heartbeat rejected")
    {
    }
}

static void PreservesSaveConfirmationAcrossReloadAndDiagnosticsExport()
{
    const string confirmation = "Time saved successfully. Reference: abc12345";
    const string diagnostics = "Diagnostics copied and saved to Desktop: report.txt";
    var messages = new TrackerMessageState();

    AssertEqual(confirmation, messages.ShowPersistent(confirmation), "show persistent confirmation");
    AssertEqual(confirmation, messages.ResolveAfterLoad(null, string.Empty), "survive tracker reload");
    AssertEqual(
        $"{confirmation}{Environment.NewLine}{diagnostics}",
        messages.CombineWithPersistent(diagnostics),
        "survive diagnostics export");

    messages.ClearPersistent();
    AssertEqual(string.Empty, messages.ResolveAfterLoad(null, string.Empty), "clear on a new start");
}

static void FormatsEveryFinalizedSessionWithAReference()
{
    const string entryId = "abc12345-6789-4abc-def0-123456789abc";

    AssertEqual(
        "Time saved successfully. Reference: abc12345",
        TrackerConfirmationMessages.ManualStop(entryId),
        "manual stop reference");
    AssertEqual(
        "Timer paused after 5 minutes without Windows activity. Time saved successfully. Reference: abc12345. Start Work to resume.",
        TrackerConfirmationMessages.IdlePause(entryId),
        "idle pause reference");
    AssertEqual(
        "Gold Shop time saved successfully. Reference: abc12345. Now tracking Stapati test 1.",
        TrackerConfirmationMessages.ProjectSwitch("Gold Shop", "Stapati test 1", entryId),
        "project switch reference");
}

static void RecoversAStopAfterTheServerSavedButTheResponseWasLost()
{
    var before = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "existing-entry" };
    var after = new[] { "existing-entry", "saved-after-sleep" };

    AssertEqual(
        "saved-after-sleep",
        TimeEntrySaveReconciliation.FindRecoveredEntry(before, after, activeProjectId: null, expectedActiveProjectId: null) ?? string.Empty,
        "recover stop after a lost response");
}

static void RecoversAProjectSwitchAfterTheServerSavedButTheResponseWasLost()
{
    var before = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "existing-entry" };
    var after = new[] { "existing-entry", "saved-before-switch" };

    AssertEqual(
        "saved-before-switch",
        TimeEntrySaveReconciliation.FindRecoveredEntry(before, after, "new-project", "new-project") ?? string.Empty,
        "recover switch after a lost response");
}

static void FailsClosedWhenTheRecoveredSaveIsAmbiguousOrTheSessionStateIsWrong()
{
    var before = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "existing-entry" };

    AssertEqual(
        string.Empty,
        TimeEntrySaveReconciliation.FindRecoveredEntry(
            before,
            new[] { "existing-entry", "new-entry-one", "new-entry-two" },
            activeProjectId: null,
            expectedActiveProjectId: null) ?? string.Empty,
        "reject an ambiguous recovered save");
    AssertEqual(
        string.Empty,
        TimeEntrySaveReconciliation.FindRecoveredEntry(
            before,
            new[] { "existing-entry", "new-entry" },
            activeProjectId: "old-project",
            expectedActiveProjectId: "new-project") ?? string.Empty,
        "reject a switch with the wrong active project");
}

static void AssertEqual(string expected, string actual, string scenario)
{
    if (!string.Equals(expected, actual, StringComparison.Ordinal))
    {
        throw new InvalidOperationException(
            $"Regression check failed for {scenario}. Expected '{expected}', received '{actual}'.");
    }
}
