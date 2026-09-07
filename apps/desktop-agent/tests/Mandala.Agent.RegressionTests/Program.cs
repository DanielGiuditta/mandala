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
DetectsSleepEvenWhenUnlockInputResetsTheWindowsIdleClock();
RejectsUnsafeGatewayConfiguration();
CapsDisconnectedTimeAtIdleAndDailyLimits();
await RecoversProtectedTimeJournalOnWindows();

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

static void DetectsSleepEvenWhenUnlockInputResetsTheWindowsIdleClock()
{
    var previousPoll = new DateTimeOffset(2026, 8, 17, 18, 0, 0, TimeSpan.FromHours(5.5));
    var afterWake = previousPoll.AddMinutes(7);

    AssertEqual(
        "True",
        IdlePauseDecision.ShouldPause(
            windowsIdleDuration: TimeSpan.FromSeconds(1),
            previousPollAt: previousPoll,
            currentPollAt: afterWake,
            idleLimit: TimeSpan.FromMinutes(5)).ToString(),
        "detect sleep after unlock input resets native idle duration");

    AssertEqual(
        "False",
        IdlePauseDecision.ShouldPause(
            windowsIdleDuration: TimeSpan.FromMinutes(4),
            previousPollAt: previousPoll,
            currentPollAt: previousPoll.AddSeconds(1),
            idleLimit: TimeSpan.FromMinutes(5)).ToString(),
        "keep an active session below the idle limit");
}

static void AssertEqual(string expected, string actual, string scenario)
{
    if (!string.Equals(expected, actual, StringComparison.Ordinal))
    {
        throw new InvalidOperationException(
            $"Regression check failed for {scenario}. Expected '{expected}', received '{actual}'.");
    }
}

static void RejectsUnsafeGatewayConfiguration()
{
    var config = new AppConfiguration($"https://{AppConfiguration.ProductionProjectRef}.supabase.co", "test-public-key")
        { GatewayUrl = "https://mandala.office.example:8443", DeviceCertificateThumbprint = "1234" };
    AssertEqual("True", config.IsValidGateway.ToString(), "valid HTTPS LAN transport");
    foreach (var url in new[] { "http://server", "https://user:password@server", "https://server/path", "https://server?redirect=other", "https://server#fragment" })
        AssertEqual("False", (config with { GatewayUrl = url }).IsValidGateway.ToString(), "reject unsafe LAN URL");
    AssertEqual("False", (config with { SupabaseUrl = "https://izddgdizwlwnhjwnojaw.supabase.co" }).IsProductionTarget.ToString(), "reject incident backend");
    AssertEqual("False", (config with { SupabaseUrl = $"https://{AppConfiguration.ProductionProjectRef}.supabase.co/other" }).IsProductionTarget.ToString(), "reject backend path");
}

static void CapsDisconnectedTimeAtIdleAndDailyLimits()
{
    var started = DateTimeOffset.Parse("2026-09-07T09:00:00+05:30");
    var session = new DesktopSession("session", "project", "Project", "2026-09-07", started, started.AddMinutes(30), true);
    AssertEqual(started.AddMinutes(35).ToString("O"), DesktopSessionTiming.StopAt(session, started.AddHours(8)).ToString("O"), "do not count disconnected sleep");
    AssertEqual(started.AddMinutes(32).ToString("O"), DesktopSessionTiming.StopAt(session, started.AddMinutes(32)).ToString("O"), "exact manual stop");
    AssertEqual(started.ToString("O"), DesktopSessionTiming.StopAt(session, started.AddHours(-1)).ToString("O"), "clock rollback cannot create negative time");
    AssertEqual(started.AddHours(24).ToString("O"), DesktopSessionTiming.StopAt(session with { LastActivityAt = started.AddHours(25) }, started.AddHours(26)).ToString("O"), "cap unexpectedly long sessions");
}

static async Task RecoversProtectedTimeJournalOnWindows()
{
    if (!OperatingSystem.IsWindows())
    {
        Console.WriteLine("Windows DPAPI journal recovery runs in the existing Windows CI job.");
        return;
    }
    var root = Path.Combine(Path.GetTempPath(), "mandala-journal-" + Guid.NewGuid());
    try
    {
        var store = new DesktopSessionJournal("test@example.test", root);
        var start = DateTimeOffset.UtcNow;
        var state = new DesktopJournalState("test@example.test", [], new DesktopSession("session", "project", "Project", "2026-09-07", start, start, true, start.AddMinutes(5)));
        await store.SaveAsync(state);
        var restored = await new DesktopSessionJournal("test@example.test", root).LoadAsync("test@example.test");
        AssertEqual(state.Session!.StoppedAt!.Value.ToString("O"), restored.Session!.StoppedAt!.Value.ToString("O"), "recover exact stopped time after restart");
        await store.SaveAsync(state with { Session = null });
        AssertEqual("True", ((await store.LoadAsync("test@example.test")).Session is null).ToString(), "durable acknowledgment");
        var file = Directory.GetFiles(root, "*.dat").Single();
        await File.WriteAllTextAsync(file, "corrupted");
        try { await store.LoadAsync("test@example.test"); throw new InvalidOperationException("Corrupt journal was silently accepted"); }
        catch (System.Security.Cryptography.CryptographicException) { }
    }
    finally { if (Directory.Exists(root)) Directory.Delete(root, true); }
}
