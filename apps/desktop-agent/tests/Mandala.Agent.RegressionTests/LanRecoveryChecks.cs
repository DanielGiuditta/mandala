using System.Net;
using System.Text;
using System.Text.Json;
using Mandala.Agent;

// Compiled only into the regression executable. Every HTTP request is handled
// in memory; no production credentials, sockets or accounts are available.
namespace Mandala.Agent
{
    public sealed partial class SupabaseTimeTrackerClient
    {
        internal SupabaseTimeTrackerClient(HttpMessageHandler handler, TimeProvider time, string directory)
        {
            _configuration = new AppConfiguration($"https://{AppConfiguration.ProductionProjectRef}.supabase.co", "fixture")
                { GatewayUrl = "https://fixture.invalid", DeviceCertificateThumbprint = "fixture" };
            _httpClient = new HttpClient(handler) { BaseAddress = new Uri("https://fixture.invalid/") };
            _lanClock = new DesktopSessionClock(time);
            _createJournal = email => new DesktopSessionJournal(email, directory);
        }
    }
}

internal sealed class FixtureTime : TimeProvider
{
    public DateTimeOffset Wall = DateTimeOffset.Parse("2026-09-23T12:00:00Z");
    private long _ticks;
    public override DateTimeOffset GetUtcNow() => Wall;
    public override long TimestampFrequency => TimeSpan.TicksPerSecond;
    public override long GetTimestamp() => _ticks;
    public void Advance(int seconds) { _ticks += TimeSpan.FromSeconds(seconds).Ticks; Wall = Wall.AddSeconds(seconds); }
}

internal sealed class FixtureUpstream : HttpMessageHandler
{
    public DateTimeOffset Start = DateTimeOffset.Parse("2026-09-23T12:00:32Z");
    public readonly Dictionary<string, Receipt> Sessions = new();
    public bool Offline, LoseStart, LoseFinish, DenyFinish, WrongReceipt;
    public int FinishRequests;
    public sealed record Receipt(string id, string project_id, DateTimeOffset started_at,
        DateTimeOffset? stopped_at = null, string? time_entry_id = null);
    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken token)
    {
        if (request.RequestUri!.Host != "fixture.invalid") throw new Exception("External request forbidden");
        if (Offline) throw new HttpRequestException("Synthetic network outage");
        var op = request.RequestUri.AbsolutePath.Split('/').Last();
        object data;
        if (op == "health") data = new { backend = $"https://{AppConfiguration.ProductionProjectRef}.supabase.co", protocol = 1 };
        else if (op == "token") data = new { access_token = "fixture", refresh_token = "fixture" };
        else if (op == "list_time_tracker_projects_for_current_user") data = new[] { new { id = "a", name = "Project A" }, new { id = "b", name = "Project B" } };
        else
        {
            using var body = JsonDocument.Parse(await request.Content!.ReadAsStringAsync(token));
            var id = body.RootElement.GetProperty("session_id").GetString()!;
            if (op == "start_desktop_work_session")
            {
                if (!Sessions.ContainsKey(id))
                {
                    if (Sessions.Values.Any(x => x.stopped_at is null)) return Response(400, new { error = "Already active" });
                    Sessions[id] = new Receipt(id, body.RootElement.GetProperty("target_project_id").GetString()!, Start);
                }
                data = Sessions[id];
                if (LoseStart) { LoseStart = false; throw new HttpRequestException("Lost committed start response"); }
            }
            else if (op == "finish_desktop_work_session")
            {
                FinishRequests++;
                if (DenyFinish) return Response(403, new { error = "Access revoked" });
                var stop = body.RootElement.GetProperty("stopped_at").GetDateTimeOffset();
                var s = Sessions[id];
                if (stop < s.started_at) return Response(400, new { error = "Negative duration" });
                Sessions[id] = s.stopped_at is null ? s with { stopped_at = stop, time_entry_id = Guid.NewGuid().ToString() } : s;
                data = WrongReceipt ? Sessions[id] with { id = "wrong" } : Sessions[id];
                if (LoseFinish) { LoseFinish = false; throw new HttpRequestException("Lost committed finish response"); }
            }
            else if (op == "touch_desktop_work_session") data = new { };
            else throw new Exception("Unexpected operation " + op);
        }
        return Response(200, data);
    }
    private static HttpResponseMessage Response(int code, object value) => new((HttpStatusCode)code)
        { Content = new StringContent(JsonSerializer.Serialize(value), Encoding.UTF8, "application/json") };
}

internal static class LanRecoveryChecks
{
    private static void Check(bool ok, string name) { if (!ok) throw new Exception("LAN regression: " + name); }
    private static async Task Reject(Func<Task> action, string name)
    {
        try { await action(); } catch (InvalidOperationException) { return; } catch (HttpRequestException) { return; }
        throw new Exception("LAN regression did not reject: " + name);
    }
    public static async Task RunAsync()
    {
        var time = new FixtureTime(); var clock = new DesktopSessionClock(time); clock.Start(time.Wall.AddSeconds(32));
        time.Advance(120); time.Wall = time.Wall.AddHours(-3);
        Check((clock.UtcNow - DateTimeOffset.Parse("2026-09-23T12:00:32Z")).TotalSeconds == 120, "monotonic clock ignores Windows rollback");
        time.Wall = time.Wall.AddHours(6);
        Check(DesktopSessionClock.Elapsed(clock.UtcNow.AddSeconds(32), clock.UtcNow) == TimeSpan.Zero, "elapsed display never negative");
        if (!OperatingSystem.IsWindows()) { Console.WriteLine("SKIP: real DPAPI LAN recovery requires Windows"); return; }
        foreach (var skew in new[] { -3600, -32, 0, 32, 3600 })
            await WithFixture(async (client, backend, source, directory) => {
                backend.Start = source.Wall.AddSeconds(skew);
                await client.StartAsync("a", "2026-09-23", false); source.Advance(60);
                source.Wall = source.Wall.AddHours(2); await client.TouchAsync(); source.Advance(60);
                source.Wall = source.Wall.AddHours(-5);
                var snapshot = await client.GetSnapshotAsync("2026-09-23");
                Check(client.GetElapsed(snapshot.ActiveSession!).TotalSeconds == 120, "display duration with skew " + skew);
                var saved = await client.StopAsync("2026-09-23");
                Check(saved is { Pending: false } && !client.HasPendingSave, "confirmed stop");
                var entry = backend.Sessions.Values.Single();
                Check((entry.stopped_at!.Value - entry.started_at).TotalSeconds == 120, "exact saved duration with skew " + skew);
            });
        await WithFixture(async (client, backend, source, directory) => {
            await client.StartAsync("a", "2026-09-23", false); source.Advance(120); backend.Offline = true;
            var saved = await client.StopAsync("2026-09-23"); Check(saved.Pending && client.HasPendingSave, "offline stop retained");
            await Reject(() => client.StartAsync("b", "2026-09-23", true), "no new start while pending");
            var restarted = new SupabaseTimeTrackerClient(backend, source, directory);
            Check(await restarted.RestoreAsync(new StoredSession("fixture", "fixture", "fixture@example.test")), "offline restore with pending journal");
            backend.Offline = false;
            var receipt = await restarted.ReconcilePendingSaveAsync(); Check(receipt is { Pending: false }, "offline recovery confirms exact receipt");
            await restarted.ReconcilePendingSaveAsync();
            Check(backend.Sessions.Count == 1 && backend.FinishRequests == 1, "no duplicate after reconnect and process restart");
            Check((backend.Sessions.Values.Single().stopped_at!.Value - backend.Start).TotalSeconds == 120, "stopped timestamp immutable across restart");
        });
        await WithFixture(async (client, backend, source, directory) => {
            await client.StartAsync("a", "2026-09-23", false); source.Advance(120); backend.LoseFinish = true;
            Check((await client.StopAsync("2026-09-23")).Pending, "lost committed response remains pending");
            var first = backend.Sessions.Values.Single().time_entry_id;
            var recovered = await client.ReconcilePendingSaveAsync();
            Check(recovered?.TimeEntryId == first && backend.Sessions.Count == 1 && backend.FinishRequests == 2, "retry returns original receipt without duplicate");
        });
        await WithFixture(async (client, backend, source, directory) => {
            backend.LoseStart = true;
            await Reject(() => client.StartAsync("a", "2026-09-23", false), "lost start response");
            source.Advance(600); var restarted = new SupabaseTimeTrackerClient(backend, source, directory);
            await restarted.RestoreAsync(new StoredSession("fixture", "fixture", "fixture@example.test"));
            await restarted.ReconcilePendingSaveAsync(); var s = backend.Sessions.Values.Single();
            Check(s.stopped_at == s.started_at, "uncertain start pauses without counting wait or duplicate");
        });
        await WithFixture(async (client, backend, source, directory) => {
            await client.StartAsync("a", "2026-09-23", false); source.Advance(90); await client.TouchAsync();
            source.Advance(7200); source.Wall = source.Wall.AddDays(1);
            var restarted = new SupabaseTimeTrackerClient(backend, source, directory);
            await restarted.RestoreAsync(new StoredSession("fixture", "fixture", "fixture@example.test"));
            await restarted.ReconcilePendingSaveAsync(); var s = backend.Sessions.Values.Single();
            Check((s.stopped_at!.Value - s.started_at).TotalSeconds == 90, "crash recovery counts only durable activity, not downtime or clock jump");
        });
        await WithFixture(async (client, backend, source, directory) => {
            await client.StartAsync("a", "2026-09-23", false); source.Advance(120);
            await Reject(() => client.StartAsync("b", "2026-09-23", false), "switch requires confirmation");
            Check(backend.Sessions.Count == 1, "cancelled switch unchanged");
            Check(await client.StartAsync("b", "2026-09-23", true) is { Pending: false }, "confirmed switch saves previous");
            Check(backend.Sessions.Count == 2 && backend.Sessions.Values.Count(s => s.stopped_at is null) == 1, "only new project active");
        });
        foreach (var deny in new[] { true, false })
            await WithFixture(async (client, backend, source, directory) => {
                await client.StartAsync("a", "2026-09-23", false); source.Advance(120);
                backend.DenyFinish = deny; backend.WrongReceipt = !deny;
                Check((await client.StopAsync("2026-09-23")).Pending && client.HasPendingSave, "revocation/mismatched receipt cannot acknowledge journal");
                Check(Directory.GetFiles(directory, "*.dat").Length == 1, "pending journal preserved");
                await Reject(() => client.StartAsync("b", "2026-09-23", true), "blocked until exact authorized receipt");
            });
        Console.WriteLine("PASS: five clock offsets, forward/backward clock jumps, real DPAPI restart, offline recovery, lost start/finish responses, idempotent receipts, confirmed switch and revoked/mismatched receipt preservation; zero network requests");
    }
    private static async Task WithFixture(Func<SupabaseTimeTrackerClient, FixtureUpstream, FixtureTime, string, Task> test)
    {
        var directory = Path.Combine(Path.GetTempPath(), "mandala-lan-regression-" + Guid.NewGuid());
        var upstream = new FixtureUpstream(); var time = new FixtureTime();
        try {
            var client = new SupabaseTimeTrackerClient(upstream, time, directory);
            await client.SignInAsync("fixture@example.test", "fixture"); await client.GetSnapshotAsync("2026-09-23");
            await test(client, upstream, time, directory);
        } finally { if (Directory.Exists(directory)) Directory.Delete(directory, true); upstream.Dispose(); }
    }
}
