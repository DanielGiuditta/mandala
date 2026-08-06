using System.Net;
using System.Text;
using Mandala.Agent;

await AcceptsSuccessfulEmptyHeartbeatResponse();
await PreservesServerErrorDetails();
PreservesSaveConfirmationAcrossReloadAndDiagnosticsExport();

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

static void AssertEqual(string expected, string actual, string scenario)
{
    if (!string.Equals(expected, actual, StringComparison.Ordinal))
    {
        throw new InvalidOperationException(
            $"Regression check failed for {scenario}. Expected '{expected}', received '{actual}'.");
    }
}
