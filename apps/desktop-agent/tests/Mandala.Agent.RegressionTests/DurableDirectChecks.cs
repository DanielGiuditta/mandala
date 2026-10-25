using System.Net;
using System.Text;
using System.Text.Json;
using Mandala.Agent;

// These checks use the production client and journal (real DPAPI on Windows).
// HTTP terminates in this handler: fixture credentials cannot leave this process.
internal static class DurableDirectChecks
{
    private const string Date = "2026-10-13";
    private const string Email = "direct-fixture@example.test";

    public static async Task RunAsync()
    {
        await WithFixture(async (client, backend, time, directory) =>
        {
            Check(!client.UsesLanGateway, "fixture exercises direct Supabase mode");
            await client.StartAsync("a", Date, false);
            time.Advance(60);
            await client.TouchAsync();
            time.Advance(600);
            var firstSave = await client.StopAsync(Date);
            var first = backend.Sessions.Values.Single();
            Check(!firstSave.Pending && firstSave.TimeEntryId == first.time_entry_id,
                "idle pause confirms the exact first receipt");
            Check(first.stopped_at == first.started_at.AddMinutes(6),
                "idle stop is capped at last observed activity plus five minutes");

            time.Advance(120);
            var returnAt = time.Wall;
            await client.StartAsync("a", Date, false);
            var resumed = backend.Sessions.Values.Single(session => session.stopped_at is null);
            Check(resumed.id != first.id && resumed.started_at == returnAt && resumed.started_at > first.stopped_at,
                "returning input starts a fresh server interval without filling the idle gap");
            var snapshot = await client.GetSnapshotAsync(Date);
            time.Advance(45);
            Check(client.GetElapsed(snapshot.ActiveSession!).TotalSeconds == 45,
                "direct resumed duration uses its confirmed monotonic clock");
            var secondSave = await client.StopAsync(Date);
            Check(!secondSave.Pending && secondSave.TimeEntryId != firstSave.TimeEntryId && backend.Sessions.Count == 2,
                "two intervals produce two distinct, confirmed receipts");
            Check(backend.Routes.All(route => route != "health" && route != "start_self_work_session"),
                "new direct sessions use durable RPCs without a LAN health request");
        });

        await WithFixture(async (client, backend, time, directory) =>
        {
            backend.LoseStart = true;
            await client.StartAsync("a", Date, false);
            var originalId = backend.Sessions.Keys.Single();
            Check(client.HasPendingSave && client.CurrentDesktopSession is not null,
                "a lost direct start keeps tracking on this computer and is durably pending");
            await client.StartAsync("a", Date, false);
            Check(backend.StartIds.Distinct().Single() == originalId, "pressing Start again never creates a second session identity");
            time.Advance(600);
            var restarted = new SupabaseTimeTrackerClient(backend, time, directory, useLanGateway: false);
            Check(await restarted.RestoreAsync(new StoredSession("fixture", "fixture", Email)), "direct credentials restore");
            var recovered = await restarted.ReconcilePendingSaveAsync();
            var original = backend.Sessions[originalId];
            Check(recovered is { Pending: false, TooShort: true } && original.stopped_at == original.started_at,
                "with no recorded activity, restart saves the lost start as zero time using the same UUID");
            Check(backend.StartIds.Count(id => id == originalId) == 2 && backend.Sessions.Count == 1,
                "lost direct start is retried idempotently before any new start");

            var freshAt = time.Wall;
            await restarted.StartAsync("a", Date, false);
            var fresh = backend.Sessions.Values.Single(session => session.stopped_at is null);
            Check(fresh.id != originalId && fresh.started_at == freshAt,
                "confirmed recovery permits a safe fresh interval at the current server time");
        });

        await WithFixture(async (client, backend, time, directory) =>
        {
            await client.StartAsync("a", Date, false);
            time.Advance(90);
            backend.LoseFinish = true;
            Check((await client.StopAsync(Date)).Pending && client.HasPendingSave,
                "lost committed direct finish is visibly pending");
            var saved = backend.Sessions.Values.Single();
            time.Advance(30);
            await client.StartAsync("a", Date, false);
            Check(client.CurrentDesktopSession is not null, "a pending finish is queued and never blocks returning work");
            var recovered = await client.ReconcilePendingSaveAsync();
            Check(recovered is { Pending: false } && recovered.TimeEntryId == saved.time_entry_id && !client.HasPendingSave,
                "direct finish retry confirms the original receipt");
            var resumed = backend.Sessions.Values.Single(session => session.stopped_at is null);
            Check(backend.Sessions.Count == 2 && backend.FinishRequests == 2 && resumed.started_at >= saved.stopped_at,
                "a lost finish response cannot duplicate or overlap saved time");
        });

        foreach (var otherProject in new[] { "a", "b" })
            await WithFixture(async (client, backend, time, directory) =>
            {
                var other = backend.SeedOtherDevice(otherProject);
                var snapshot = await client.GetSnapshotAsync(Date);
                Check(snapshot.ActiveSession is null && !string.IsNullOrWhiteSpace(snapshot.Warning),
                    "another device's desktop timer is displayed as a conflict instead of local active work");
                await client.StartAsync("a", Date, false);
                var ended = backend.Sessions[other.id];
                Check(ended.stopped_at is not null && ended.superseded_by is not null && client.CurrentDesktopSession?.ProjectId == "a",
                    "Start here ends the other computer's open session instead of being blocked, project " + otherProject);
                Check(backend.FinishRequests == 0 && backend.TouchRequests == 0,
                    "this computer never finishes or touches the other computer's session");
            });

        await WithFixture(async (client, backend, time, directory) =>
        {
            backend.AllowProjectA = false;
            try
            {
                await client.StartAsync("a", Date, false);
                throw new InvalidOperationException("Direct regression: revoked project unexpectedly started.");
            }
            catch (AgentDiagnosticException exception) when (exception.Code == "AGENT-PROJECT-UNAVAILABLE") { }
            Check(backend.Sessions.Count == 0 && !client.HasPendingSave,
                "current project authorization rejects the start without an active or pending interval");
            backend.AllowProjectA = true;
            await client.StartAsync("a", Date, false);
            Check(backend.Sessions.Count == 1, "an explicit authorized retry can start once access returns");
        });

        await WithFixture(async (client, backend, time, directory) =>
        {
            backend.SeedLegacySession("a");
            var snapshot = await client.GetSnapshotAsync(Date);
            Check(snapshot.ActiveSession?.ProjectId == "a", "an earlier direct-client legacy timer remains visible after upgrade");
            var saved = await client.StopAsync(Date);
            Check(!saved.Pending && backend.LegacyEntries.Single() == saved.TimeEntryId && backend.LegacySession is null,
                "an earlier legacy timer can still stop and confirm its saved entry");
            await client.StartAsync("a", Date, false);
            Check(backend.Sessions.Count == 1 && backend.Routes.All(route => route != "start_self_work_session"),
                "after stopping legacy work, all new direct sessions use durable receipts");
        });

        await WithFixture(async (client, backend, time, directory) =>
        {
            await client.StartAsync("a", Date, false);
            time.Advance(60);
            await client.StopAsync(Date);
            backend.SeedLegacySession("a");
            var other = backend.LegacySession;
            var routeCount = backend.Routes.Count;
            var snapshot = await client.GetSnapshotAsync(Date);
            Check(snapshot.ActiveSession is null && !string.IsNullOrWhiteSpace(snapshot.Warning),
                "after owned work, a remote web timer is a conflict rather than an adopted legacy timer");
            await client.TouchAsync();
            await Reject(() => client.StopAsync(Date), "a remote web timer cannot be stopped by the paused desktop client");
            Check(backend.LegacySession == other && backend.LegacyEntries.Count == 0,
                "remote web work remains unchanged while this client is paused");
            Check(backend.Routes.Skip(routeCount).All(route => route is not
                ("pause_stale_self_work_session" or "touch_self_work_session" or "stop_self_work_session")),
                "snapshot, activity and stop cannot mutate a remote web timer after owned work");
        });

        await WithFixture(async (client, backend, time, directory) =>
        {
            await client.StartAsync("a", Date, false);
            time.Advance(120);
            backend.Offline = true;
            Check((await client.StopAsync(Date)).Pending, "offline direct stop persists locally");
            var restarted = new SupabaseTimeTrackerClient(backend, time, directory, useLanGateway: false);
            Check(await restarted.RestoreAsync(new StoredSession("fixture", "fixture", Email)),
                "offline direct restart retains recoverable work");
            time.Advance(30);
            await restarted.StartAsync("b", Date, false);
            Check(restarted.CurrentDesktopSession?.ProjectId == "b", "an offline restart still lets new work start on this computer");
            time.Advance(240);
            await restarted.TouchAsync();
            backend.Offline = false;
            await restarted.ReconcilePendingSaveAsync();
            var first = backend.Sessions.Values.Single(session => session.project_id == "a");
            var second = backend.Sessions.Values.Single(session => session.project_id == "b");
            Check(first.stopped_at == first.started_at.AddSeconds(120),
                "offline direct restart preserves the original stop time");
            Check(second.started_at == first.stopped_at!.Value.AddSeconds(30) && second.stopped_at is null,
                "the offline start uploads at its real time and keeps running");
        });

        Console.WriteLine("PASS: direct client/journal covers idle-to-fresh-session timing, lost start and finish responses, restart/outage recovery with new offline work, takeover of another computer's session, revoked access and legacy stop compatibility; all HTTP handled in memory");
    }

    private static async Task WithFixture(Func<SupabaseTimeTrackerClient, DirectFixtureUpstream, FixtureTime, string, Task> test)
    {
        var directory = Path.Combine(Path.GetTempPath(), "mandala-direct-regression-" + Guid.NewGuid());
        var time = new FixtureTime { Wall = DateTimeOffset.Parse("2026-10-13T08:00:00Z") };
        using var backend = new DirectFixtureUpstream(time);
        try
        {
            var client = new SupabaseTimeTrackerClient(backend, time, directory, useLanGateway: false);
            await client.SignInAsync(Email, "fixture");
            await client.GetSnapshotAsync(Date);
            await test(client, backend, time, directory);
            Check(backend.Routes.All(route => route != "health"), "direct mode never requests gateway health");
        }
        finally
        {
            if (Directory.Exists(directory)) Directory.Delete(directory, recursive: true);
        }
    }

    private static async Task Reject(Func<Task> action, string scenario)
    {
        try { await action(); }
        catch (InvalidOperationException) { return; }
        catch (HttpRequestException) { return; }
        throw new InvalidOperationException("Direct regression did not reject: " + scenario);
    }

    private static void Check(bool condition, string scenario)
    {
        if (!condition) throw new InvalidOperationException("Direct regression: " + scenario);
    }
}

// Follows the server rules in supabase/migrations/20261024210000_keep_all_desktop_time.sql.
internal sealed class DirectFixtureUpstream(FixtureTime time) : HttpMessageHandler
{
    internal sealed record Receipt(string id, string project_id, DateTimeOffset started_at,
        DateTimeOffset? stopped_at = null, string? time_entry_id = null, string? superseded_by = null,
        DateTimeOffset? stop_limit_at = null, bool client_finished = false, DateTimeOffset? server_now = null);
    public readonly Dictionary<string, Receipt> Sessions = new();
    public readonly List<string> Routes = [];
    public readonly List<string> StartIds = [];
    public readonly List<string> LegacyEntries = [];
    public Receipt? LegacySession;
    public bool Offline, LoseStart, LoseFinish;
    public bool AllowProjectA = true;
    public int FinishRequests, TouchRequests;

    public Receipt SeedOtherDevice(string projectId)
    {
        var receipt = new Receipt(Guid.NewGuid().ToString(), projectId, time.Wall.AddMinutes(-1));
        Sessions.Add(receipt.id, receipt);
        return receipt;
    }

    public void SeedLegacySession(string projectId) =>
        LegacySession = new Receipt("legacy", projectId, time.Wall.AddMinutes(-2));

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken token)
    {
        if (request.RequestUri!.Host != "fixture.invalid") throw new Exception("External requests are forbidden in direct-client tests.");
        var route = request.RequestUri.AbsolutePath.Split('/').Last();
        Routes.Add(route);
        if (Offline) throw new HttpRequestException("Synthetic direct connection outage");
        if (route == "health") throw new Exception("Direct Supabase mode must not request LAN gateway health.");
        if (route == "token") return Response(new { access_token = "fixture", refresh_token = "fixture" });
        if (route is "projects" or "list_time_tracker_projects_for_current_user")
            return Response((AllowProjectA ? new[] { "a", "b" } : new[] { "b" }).Select(id => new { id, name = "Project " + id.ToUpperInvariant() }));
        if (route == "pause_stale_self_work_session") return Response(false);
        if (route == "active_work_sessions")
        {
            var active = Sessions.Values.Where(session => session.stopped_at is null)
                .Select(session => (object)new { session.project_id, session.started_at, desktop_session_id = session.id }).ToList();
            if (LegacySession is { } legacy)
                active.Add(new { legacy.project_id, legacy.started_at, desktop_session_id = (string?)null });
            return Response(active);
        }
        if (route == "people") return Response(new[] { new { id = "fixture-person" } });
        if (route == "time_entries")
            return Response(Sessions.Values.Select(session => session.time_entry_id).Where(id => id is not null)
                .Concat(LegacyEntries).Select(id => new { id }));
        if (route == "stop_self_work_session")
        {
            if (LegacySession is null) throw new Exception("There is no legacy timer to stop.");
            LegacySession = null;
            LegacyEntries.Add(Guid.NewGuid().ToString());
            return Response(new { });
        }

        using var body = JsonDocument.Parse(await request.Content!.ReadAsStringAsync(token));
        if (!body.RootElement.TryGetProperty("session_id", out var idProperty))
            throw new Exception("Unexpected non-durable direct operation: " + route);
        var id = idProperty.GetString()!;
        if (route == "start_desktop_work_session")
        {
            StartIds.Add(id);
            if (!Sessions.ContainsKey(id))
            {
                var projectId = body.RootElement.GetProperty("target_project_id").GetString()!;
                if (projectId == "a" && !AllowProjectA) return Response(new { error = "Selected project is unavailable." }, 400);
                var secondsAgo = body.RootElement.TryGetProperty("started_seconds_ago", out var ago) ? ago.GetDouble() : 0;
                var started = time.Wall.AddSeconds(-secondsAgo);
                bool moved;
                do
                {
                    moved = false;
                    foreach (var saved in Sessions.Values.Where(s => s.stopped_at is { } stop && s.started_at <= started && stop > started))
                    { started = saved.stopped_at!.Value; moved = true; }
                } while (moved);
                // A desktop start closes a leftover web timer and ends any open session elsewhere.
                if (LegacySession is not null) { LegacySession = null; LegacyEntries.Add(Guid.NewGuid().ToString()); }
                foreach (var open in Sessions.Values.Where(s => s.stopped_at is null).ToList())
                    Sessions[open.id] = open with { stopped_at = started, stop_limit_at = started, superseded_by = id };
                Sessions.Add(id, new Receipt(id, projectId, started));
            }
            if (LoseStart) { LoseStart = false; throw new HttpRequestException("Lost committed direct start response"); }
            return Response(Sessions[id] with { server_now = time.Wall });
        }
        if (route == "finish_desktop_work_session")
        {
            FinishRequests++;
            var session = Sessions[id];
            var stoppedAt = body.RootElement.GetProperty("stopped_at").GetDateTimeOffset();
            if (stoppedAt < session.started_at) return Response(new { error = "Negative duration" }, 400);
            if (session.stopped_at is null)
                Sessions[id] = session with
                {
                    stopped_at = stoppedAt,
                    time_entry_id = stoppedAt == session.started_at ? null : Guid.NewGuid().ToString(),
                    client_finished = true,
                };
            else if (session.stop_limit_at is { } limit && !session.client_finished)
            {
                var final = stoppedAt < limit ? stoppedAt : limit;
                Sessions[id] = session with
                {
                    stopped_at = final,
                    time_entry_id = final == session.started_at ? null : Guid.NewGuid().ToString(),
                    client_finished = true,
                };
            }
            if (LoseFinish) { LoseFinish = false; throw new HttpRequestException("Lost committed direct finish response"); }
            return Response(Sessions[id]);
        }
        if (route == "touch_desktop_work_session")
        {
            TouchRequests++;
            if (Sessions[id] is { stopped_at: not null, stop_limit_at: not null, client_finished: false })
                return Response(new { code = "P0001", message = "AGENT-SESSION-SUPERSEDED: This account started work on another computer." }, 400);
            return Response(new { });
        }
        throw new Exception("Unexpected direct operation: " + route);
    }

    private static HttpResponseMessage Response(object data, int status = 200) => new((HttpStatusCode)status)
    {
        Content = new StringContent(JsonSerializer.Serialize(data), Encoding.UTF8, "application/json"),
    };
}
