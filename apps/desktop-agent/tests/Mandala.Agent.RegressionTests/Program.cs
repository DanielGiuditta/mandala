using System.Net;
using System.Text;
using Mandala.Agent;

await AcceptsSuccessfulEmptyHeartbeatResponse();
await PreservesServerErrorDetails();
PreservesSaveConfirmationAcrossReloadAndDiagnosticsExport();
FormatsEveryFinalizedSessionWithAReference();

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

static void AssertEqual(string expected, string actual, string scenario)
{
    if (!string.Equals(expected, actual, StringComparison.Ordinal))
    {
        throw new InvalidOperationException(
            $"Regression check failed for {scenario}. Expected '{expected}', received '{actual}'.");
    }
}
