using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Mandala.Agent;

// Compiled only into the regression executable. Every HTTP request is handled
// in memory; no production credentials, sockets or accounts are available.
namespace Mandala.Agent
{
    public sealed partial class SupabaseTimeTrackerClient
    {
        internal SupabaseTimeTrackerClient(HttpMessageHandler handler, TimeProvider time, string directory,
            bool useLanGateway = true)
        {
            _configuration = new AppConfiguration($"https://{AppConfiguration.ProductionProjectRef}.supabase.co", "fixture");
            if (useLanGateway)
                _configuration = _configuration with { GatewayUrl = "https://fixture.invalid", DeviceCertificateThumbprint = "fixture" };
            _httpClient = new HttpClient(handler) { BaseAddress = new Uri("https://fixture.invalid/") };
            _lanClock = new DesktopSessionClock(time);
            _wallTime = time;
            // Real DPAPI on Windows; the same journal JSON without DPAPI elsewhere.
            _createJournal = email => new DesktopSessionJournal(email, directory, protect: OperatingSystem.IsWindows());
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

// Follows the server rules in supabase/migrations/20261024210000_keep_all_desktop_time.sql:
// backdated starts that never overlap saved time, a new start ending any open
// session, late uploads capped at that point, and a superseded heartbeat error.
internal sealed class FixtureUpstream : HttpMessageHandler
{
    public DateTimeOffset Start = DateTimeOffset.Parse("2026-09-23T12:00:32Z");
    public Func<DateTimeOffset>? Now; // server clock; the fixed Start when not set
    public readonly Dictionary<string, Receipt> Sessions = new();
    public bool Offline, LoseStart, LoseFinish, DenyFinish, WrongReceipt;
    public int FinishRequests;
    public string? LastAgentVersion, LastDeviceName;
    public sealed record Receipt(string id, string project_id, DateTimeOffset started_at,
        DateTimeOffset? stopped_at = null, string? time_entry_id = null, string? superseded_by = null,
        DateTimeOffset? stop_limit_at = null, bool client_finished = false, DateTimeOffset? server_now = null);
    private DateTimeOffset ServerNow => Now?.Invoke() ?? Start;

    // Another computer signs in with the same account and starts work.
    public string StartOnOtherComputer(string projectId)
    {
        var id = Guid.NewGuid().ToString();
        CreateSession(id, projectId, 0);
        return id;
    }

    private void CreateSession(string id, string projectId, double secondsAgo)
    {
        var started = ServerNow.AddSeconds(-secondsAgo);
        bool moved;
        do
        {
            moved = false;
            foreach (var saved in Sessions.Values.Where(s => s.stopped_at is { } stop && s.started_at <= started && stop > started))
            { started = saved.stopped_at!.Value; moved = true; }
        } while (moved);
        foreach (var open in Sessions.Values.Where(s => s.stopped_at is null).ToList())
            Sessions[open.id] = open with { stopped_at = started, stop_limit_at = started, superseded_by = id };
        Sessions[id] = new Receipt(id, projectId, started);
    }

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
                LastAgentVersion = body.RootElement.TryGetProperty("agent_version", out var version) ? version.GetString() : null;
                LastDeviceName = body.RootElement.TryGetProperty("device_name", out var device) ? device.GetString() : null;
                if (!Sessions.ContainsKey(id))
                {
                    var secondsAgo = body.RootElement.TryGetProperty("started_seconds_ago", out var ago) ? ago.GetDouble() : 0;
                    CreateSession(id, body.RootElement.GetProperty("target_project_id").GetString()!, secondsAgo);
                }
                data = Sessions[id] with { server_now = ServerNow };
                if (LoseStart) { LoseStart = false; throw new HttpRequestException("Lost committed start response"); }
            }
            else if (op == "finish_desktop_work_session")
            {
                FinishRequests++;
                if (DenyFinish) return Response(403, new { error = "Access revoked" });
                var stop = body.RootElement.GetProperty("stopped_at").GetDateTimeOffset();
                var s = Sessions[id];
                if (stop < s.started_at) return Response(400, new { error = "Negative duration" });
                if (s.stopped_at is null)
                    Sessions[id] = s with { stopped_at = stop, time_entry_id = stop == s.started_at ? null : Guid.NewGuid().ToString(), client_finished = true };
                else if (s.stop_limit_at is { } limit && !s.client_finished)
                {
                    var final = stop < limit ? stop : limit;
                    Sessions[id] = s with { stopped_at = final, time_entry_id = final == s.started_at ? null : Guid.NewGuid().ToString(), client_finished = true };
                }
                data = WrongReceipt ? Sessions[id] with { id = "wrong" } : Sessions[id];
                if (LoseFinish) { LoseFinish = false; throw new HttpRequestException("Lost committed finish response"); }
            }
            else if (op == "touch_desktop_work_session")
            {
                if (Sessions[id] is { stopped_at: not null, stop_limit_at: not null, client_finished: false })
                    return Response(400, new { code = "P0001", message = "AGENT-SESSION-SUPERSEDED: This account started work on another computer." });
                data = new { };
            }
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
    private static double Seconds(FixtureUpstream.Receipt receipt) => (receipt.stopped_at!.Value - receipt.started_at).TotalSeconds;

    public static async Task RunAsync()
    {
        var time = new FixtureTime(); var clock = new DesktopSessionClock(time); clock.Start(time.Wall.AddSeconds(32));
        time.Advance(120); time.Wall = time.Wall.AddHours(-3);
        Check((clock.UtcNow - DateTimeOffset.Parse("2026-09-23T12:00:32Z")).TotalSeconds == 120, "monotonic clock ignores Windows rollback");
        time.Wall = time.Wall.AddHours(6);
        Check(DesktopSessionClock.Elapsed(clock.UtcNow.AddSeconds(32), clock.UtcNow) == TimeSpan.Zero, "elapsed display never negative");

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
                Check(Seconds(entry) == 120, "exact saved duration with skew " + skew);
            });

        await WithFixture(async (client, backend, source, directory) => {
            await client.StartAsync("a", "2026-09-23", false); source.Advance(120); backend.Offline = true;
            var saved = await client.StopAsync("2026-09-23"); Check(saved.Pending && client.HasPendingSave, "offline stop retained");
            var restarted = new SupabaseTimeTrackerClient(backend, source, directory);
            Check(await restarted.RestoreAsync(new StoredSession("fixture", "fixture", "fixture@example.test")), "offline restore with pending journal");
            backend.Offline = false;
            var receipt = await restarted.ReconcilePendingSaveAsync(); Check(receipt is { Pending: false }, "offline recovery confirms exact receipt");
            await restarted.ReconcilePendingSaveAsync();
            Check(backend.Sessions.Count == 1 && backend.FinishRequests == 1, "no duplicate after reconnect and process restart");
            Check(Seconds(backend.Sessions.Values.Single()) == 120, "stopped timestamp immutable across restart");
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
            await client.StartAsync("a", "2026-09-23", false);
            Check(client.CurrentDesktopSession is not null && client.HasPendingSave, "a lost start response keeps tracking on this computer");
            source.Advance(600); var restarted = new SupabaseTimeTrackerClient(backend, source, directory);
            await restarted.RestoreAsync(new StoredSession("fixture", "fixture", "fixture@example.test"));
            await restarted.ReconcilePendingSaveAsync(); var s = backend.Sessions.Values.Single();
            Check(s.stopped_at == s.started_at, "with no recorded activity, a lost start saves no time and no duplicate");
        });

        await WithFixture(async (client, backend, source, directory) => {
            await client.StartAsync("a", "2026-09-23", false); source.Advance(90); await client.TouchAsync();
            source.Advance(7200); source.Wall = source.Wall.AddDays(1);
            var restarted = new SupabaseTimeTrackerClient(backend, source, directory);
            await restarted.RestoreAsync(new StoredSession("fixture", "fixture", "fixture@example.test"));
            await restarted.ReconcilePendingSaveAsync(); var s = backend.Sessions.Values.Single();
            Check(Seconds(s) == 90, "crash recovery counts only durable activity, not downtime or clock jump");
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
                backend.DenyFinish = false; backend.WrongReceipt = false;
                await client.StartAsync("b", "2026-09-23", false);
                Check(client.CurrentDesktopSession?.ProjectId == "b", "a rejected save stays queued for IT and never blocks new work");
            });

        await WithFixture(async (client, backend, source, directory) => {
            await client.StartAsync("a", "2026-09-23", false); source.Advance(60);
            await client.StopAsync("2026-09-23");
            var line = File.ReadLines(AgentDiagnostics.LogPath).Last(l => l.Contains("| lan-time-confirmed |"));
            Check(Regex.IsMatch(line, @"\| lan-time-confirmed \| sessionId=[a-fA-F0-9-]{36}; entryId=([a-fA-F0-9-]{36}|under-rounding-threshold)$"),
                "lan-time-confirmed keeps the exact format parsed by CI and IT office tests (check-core.ps1)");
        });

        // --- Agent 1.0.18: no gaps ---------------------------------------------------------

        await WithFixture(async (client, backend, source, directory) => {
            backend.Now = () => source.Wall;
            backend.Offline = true;
            await client.StartAsync("a", "2026-09-23", false);
            Check(client.CurrentDesktopSession?.ProjectId == "a" && !client.CurrentSessionIsConfirmed, "Start works offline");
            source.Advance(600); await client.TouchAsync(); source.Advance(60);
            Check((await client.StopAsync("2026-09-23")).Pending, "offline stop is kept on this computer");
            source.Advance(30);
            await client.StartAsync("b", "2026-09-23", false);
            source.Advance(300); await client.TouchAsync(); source.Advance(10);
            await client.StopAsync("2026-09-23");
            Check(backend.Sessions.Count == 0 && client.HasPendingSave, "both offline sessions wait on this computer");
            source.Advance(1200);
            backend.Offline = false;
            await client.ReconcilePendingSaveAsync();
            var a = backend.Sessions.Values.Single(s => s.project_id == "a");
            var b = backend.Sessions.Values.Single(s => s.project_id == "b");
            // Stop counts up to the moment Stop was pressed (within the idle allowance).
            Check(Seconds(a) == 660 && Seconds(b) == 310, "offline sessions upload with their real durations");
            Check(b.started_at >= a.stopped_at && (b.started_at - a.started_at).TotalSeconds == 660 + 30,
                "uploaded offline sessions keep their real start times, in order, without overlap");
            Check(!client.HasPendingSave, "queue fully uploaded");
        });

        await WithFixture(async (client, backend, source, directory) => {
            backend.Now = () => source.Wall;
            backend.LoseStart = true;
            await client.StartAsync("a", "2026-09-23", false);
            source.Advance(60); await client.TouchAsync(); source.Advance(60); await client.TouchAsync();
            await client.ReconcilePendingSaveAsync();
            Check(client.CurrentSessionIsConfirmed && client.CurrentDesktopSession is not null, "a late confirmation keeps the session running");
            source.Advance(30); await client.TouchAsync();
            await client.StopAsync("2026-09-23");
            Check(Seconds(backend.Sessions.Values.Single()) == 150, "time worked while the start response was lost is counted, not dropped");
        });

        await WithFixture(async (client, backend, source, directory) => {
            backend.Now = () => source.Wall;
            await client.StartAsync("a", "2026-09-23", false);
            source.Advance(300); await client.TouchAsync();
            source.Advance(120);
            var other = backend.StartOnOtherComputer("b");
            source.Advance(60);
            try
            {
                await client.TouchAsync();
                throw new Exception("LAN regression: superseded heartbeat was not reported");
            }
            catch (DesktopSessionSupersededException) { }
            var here = backend.Sessions.Values.Single(s => s.project_id == "a");
            Check(here.superseded_by == other && here.client_finished && Seconds(here) == 420,
                "a session taken over elsewhere is saved up to the takeover, then stops here");
            Check(client.CurrentDesktopSession is null && !client.HasPendingSave, "nothing is left running or pending here");
        });

        await WithFixture(async (client, backend, source, directory) => {
            backend.Now = () => source.Wall;
            await client.StartAsync("a", "2026-09-23", false);
            source.Advance(200); await client.TouchAsync(); source.Advance(10);
            client.SaveStopForShutdown();
            source.Advance(3600);
            var restarted = new SupabaseTimeTrackerClient(backend, source, directory);
            await restarted.RestoreAsync(new StoredSession("fixture", "fixture", "fixture@example.test"));
            await restarted.ReconcilePendingSaveAsync();
            Check(Seconds(backend.Sessions.Values.Single()) == 210, "Windows shutdown saves the exact stop, not the last heartbeat");
            Check(!string.IsNullOrWhiteSpace(backend.LastAgentVersion) && backend.LastDeviceName == Environment.MachineName,
                "each start reports the agent version and this PC's name");
        });

        await WithFixture(async (client, backend, source, directory) => {
            backend.Now = () => source.Wall;
            backend.Offline = true;
            await client.StartAsync("a", "2026-09-23", false);
            source.Advance(400); await client.TouchAsync();
            source.Advance(5000);
            var restarted = new SupabaseTimeTrackerClient(backend, source, directory);
            await restarted.RestoreAsync(new StoredSession("fixture", "fixture", "fixture@example.test"));
            backend.Offline = false;
            await restarted.ReconcilePendingSaveAsync();
            Check(Seconds(backend.Sessions.Values.Single()) == 400, "an offline session survives an app restart with its recorded activity");
        });

        Console.WriteLine("PASS: five clock offsets, clock jumps, restart, offline recovery, lost start/finish responses, idempotent receipts, confirmed switch, rejected-save queueing, offline start and queue, late confirmation, takeover, shutdown save; zero network requests");
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
