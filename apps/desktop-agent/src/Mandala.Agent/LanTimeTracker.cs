using System.Net.Http;
using System.Text.Json.Serialization;

namespace Mandala.Agent;

// Durable desktop sessions (direct and LAN). Work is recorded on this computer
// first and uploaded with an idempotent receipt, so a slow or missing network
// never loses time:
// - Start begins tracking immediately, even offline. Mandala later records the
//   start as "N seconds ago" and never lets it overlap time already saved.
// - Finished sessions wait in an upload queue; they never block the next one.
// - If another computer starts work for this account, Mandala ends the session
//   here at that moment and this agent stops and says so.
public sealed partial class SupabaseTimeTrackerClient
{
    private const double MaxStartSecondsAgo = 7 * 86400 - 60;
    // Reported with each start so the fleet can be checked from the server.
    private static readonly string AgentVersion = typeof(SupabaseTimeTrackerClient).Assembly.GetName().Version?.ToString() ?? "unknown";
    private readonly DesktopSessionClock _lanClock = new();
    private readonly TimeProvider _wallTime = TimeProvider.System;
    private readonly Func<string, DesktopSessionJournal> _createJournal = email => new DesktopSessionJournal(email);
    private DesktopSessionJournal? _journal;
    private DesktopJournalState? _journalState;
    private bool _hasOwnedDesktopSession;
    // The session started by this process; its times use the running monotonic clock.
    private string? _runningSessionId;

    public TimeSpan GetElapsed(ActiveWorkSession session) => DesktopSessionClock.Elapsed(
        session.StartedAt, CurrentDesktopSession is not null ? _lanClock.UtcNow : _wallTime.GetUtcNow());
    public ActiveWorkSession? CurrentDesktopSession => _journalState?.Session is { StoppedAt: null } session
        ? new ActiveWorkSession(session.ProjectId, session.ProjectName, session.StartedAt) : null;
    public bool CurrentSessionIsConfirmed => _journalState?.Session is { Confirmed: true };
    public bool UsesLanGateway => _configuration.UsesLanGateway;
    private int QueuedSessionCount => _journalState?.Completed?.Count ?? 0;
    public string LanDiagnosticSummary => _journalState?.Session is { } session
        ? $"gateway={_configuration.GatewayUrl}; sessionId={session.Id}; projectId={session.ProjectId}; entryDate={session.EntryDate}; startedAt={session.StartedAt:O}; lastActivityAt={session.LastActivityAt:O}; stoppedAt={session.StoppedAt:O}; confirmed={session.Confirmed}; queued={QueuedSessionCount}; pending={HasPendingSave}"
        : $"gateway={_configuration.GatewayUrl}; no current local session; queued={QueuedSessionCount}";
    public string? PendingTimeMessage =>
        _journalState?.Session is { Confirmed: false, StoppedAt: null }
            ? "Tracking on this computer. Mandala will confirm the start when the connection returns."
        : _journalState?.Session is { StoppedAt: not null } || QueuedSessionCount > 0
            ? "Time saved on this computer; waiting for Mandala to confirm upload."
        : null;

    private async Task LoadJournalAsync()
    {
        if (Email is null) return;
        _journal = _createJournal(Email);
        _journalState = await _journal.LoadAsync(Email);
        _hasOwnedDesktopSession = _journalState.Session is not null || QueuedSessionCount > 0;
        _runningSessionId = null;
        if (_journalState.Session is { StoppedAt: null } session)
        {
            // After a process restart, there is no trustworthy running clock anchor.
            // Preserve only the last durably observed activity; never count downtime.
            await PersistJournalAsync(_journalState with { Session = session with { StoppedAt = DesktopSessionTiming.StopAt(session, session.LastActivityAt) } });
        }
    }

    private async Task PersistJournalAsync(DesktopJournalState next)
    {
        await _journal!.SaveAsync(next);
        _journalState = next;
    }

    // Called while Windows shuts down or signs out: record the exact stop on this
    // computer so it uploads on the next start. No network is used.
    public void SaveStopForShutdown()
    {
        if (_journal is null || _journalState?.Session is not { StoppedAt: null } session || session.Id != _runningSessionId) return;
        var next = _journalState with { Session = session with { StoppedAt = DesktopSessionTiming.StopAt(session, _lanClock.UtcNow) } };
        _journal.Save(next);
        _journalState = next;
        _runningSessionId = null;
    }

    private async Task<TrackerSnapshot> GetLanSnapshotAsync()
    {
        if (_journalState is null) await LoadJournalAsync();
        string? warning = PendingTimeMessage;
        try
        {
            var projects = await RpcAsync<List<ProjectResponse>>("list_time_tracker_projects_for_current_user", new { });
            await PersistJournalAsync(_journalState! with { Projects = projects.Select(p => new TimeTrackerProject(p.Id, p.Name)).ToList() });
        }
        catch (Exception exception) when (IsConnectionFailure(exception))
        {
            warning ??= "Mandala is unavailable. Work you start is recorded on this computer and uploads when the connection returns.";
        }
        var current = _journalState!.Session;
        return new TrackerSnapshot(_journalState.Projects,
            current is { StoppedAt: null }
                ? new ActiveWorkSession(current.ProjectId, current.ProjectName, current.StartedAt) : null,
            warning);
    }

    private async Task<TimeEntrySaveResult?> StartLanAsync(string projectId, string localDate, bool confirmSwitch)
    {
        if (_journalState is null) await LoadJournalAsync();
        TimeEntrySaveResult? saved = null;
        if (_journalState!.Session is { StoppedAt: null } current)
        {
            if (current.ProjectId == projectId) return null;
            if (!confirmSwitch) throw new InvalidOperationException("Confirm the project switch first.");
            saved = await StopLanAsync();
            AgentDiagnostics.Record("lan-switch-previous-saved", $"entryId={saved.TimeEntryId}; pending={saved.Pending}");
        }
        // A finished session still waiting for upload joins the queue; it never blocks new work.
        if (_journalState!.Session is { StoppedAt: not null } waiting)
            await PersistJournalAsync(_journalState with { Session = null, Completed = [.. _journalState.Completed ?? [], waiting] });
        await BeginLanAsync(projectId, localDate);
        return saved;
    }

    private async Task BeginLanAsync(string projectId, string localDate)
    {
        // Refresh live project access when Mandala is reachable. Offline, the last
        // list from Mandala is used and access is rechecked when the start uploads.
        try
        {
            var projects = await RpcAsync<List<ProjectResponse>>("list_time_tracker_projects_for_current_user", new { });
            await PersistJournalAsync(_journalState! with { Projects = projects.Select(p => new TimeTrackerProject(p.Id, p.Name)).ToList() });
        }
        catch (Exception exception) when (IsConnectionFailure(exception))
        {
            AgentDiagnostics.Record("lan-start-offline", AgentDiagnostics.Compact(exception.Message));
        }
        var project = _journalState!.Projects.SingleOrDefault(p => p.Id == projectId)
            ?? throw new AgentDiagnosticException("AGENT-PROJECT-UNAVAILABLE", "This project is no longer available. Select an available project and Start Work.");

        // Tracking starts now, on this computer's monotonic clock.
        _lanClock.Start(_wallTime.GetUtcNow());
        var now = _lanClock.UtcNow;
        var session = new DesktopSession(Guid.NewGuid().ToString(), projectId, project.Name, localDate, now, now);
        await PersistJournalAsync(_journalState with { Session = session });
        _runningSessionId = session.Id;
        _hasOwnedDesktopSession = true;
        try
        {
            await ConfirmCurrentAsync(firstAttempt: true);
        }
        catch (Exception exception) when (IsConnectionFailure(exception))
        {
            AgentDiagnostics.Record("lan-start-local", $"sessionId={session.Id}; {AgentDiagnostics.Compact(exception.Message)}");
        }
    }

    private async Task ConfirmCurrentAsync(bool firstAttempt = false)
    {
        var session = _journalState!.Session!;
        try
        {
            var confirmed = await ConfirmAsync(session, running: session.Id == _runningSessionId && session.StoppedAt is null);
            await PersistJournalAsync(_journalState with { Session = confirmed });
            if (confirmed.StoppedAt is not null && session.StoppedAt is null) _runningSessionId = null;
        }
        catch (HttpRequestException exception) when (firstAttempt && exception.StatusCode == System.Net.HttpStatusCode.BadRequest)
        {
            // Only an explicit rejection of the FIRST request proves no session
            // was created. A rejected retry may follow a lost successful response.
            if (_journalState?.Session?.Id == session.Id)
            {
                await PersistJournalAsync(_journalState with { Session = null });
                _runningSessionId = null;
            }
            throw;
        }
    }

    // Uploads the start and maps times recorded on this computer onto Mandala's clock.
    private async Task<DesktopSession> ConfirmAsync(DesktopSession session, bool running)
    {
        if (UsesLanGateway)
        {
            using var health = await _httpClient.GetAsync("health");
            var identity = await ReadResponseAsync<GatewayIdentity>(health);
            if (identity.Backend != $"https://{AppConfiguration.ProductionProjectRef}.supabase.co" || identity.Protocol != 1)
                throw new InvalidOperationException("AGENT-CONFIG-BACKEND-001: The LAN gateway does not identify the production backend.");
        }

        var localNow = running ? _lanClock.UtcNow : _wallTime.GetUtcNow();
        var secondsAgo = Math.Clamp((localNow - session.StartedAt).TotalSeconds, 0, MaxStartSecondsAgo);
        var receipt = await RpcAsync<DesktopReceipt>("start_desktop_work_session", new
        {
            session_id = session.Id,
            target_project_id = session.ProjectId,
            entry_date = session.EntryDate,
            started_seconds_ago = Math.Round(secondsAgo, 3),
            agent_version = AgentVersion,
            device_name = Environment.MachineName,
        });
        if (receipt.Id != session.Id || receipt.ProjectId != session.ProjectId) throw new InvalidOperationException("The session receipt did not match. Preserve diagnostics for IT.");

        localNow = running ? _lanClock.UtcNow : _wallTime.GetUtcNow();
        var serverNow = receipt.ServerNow ?? receipt.StartedAt;
        var offset = serverNow - localNow;
        DateTimeOffset ToServer(DateTimeOffset local)
        {
            var mapped = local + offset;
            return mapped < receipt.StartedAt ? receipt.StartedAt : mapped > serverNow ? serverNow : mapped;
        }

        var lastActivity = ToServer(session.LastActivityAt);
        DateTimeOffset? stoppedAt = session.StoppedAt is { } localStop ? ToServer(localStop) : null;
        if (receipt.StoppedAt is not null && stoppedAt is null)
        {
            // A later session elsewhere already covers the time after this one;
            // stop here (Mandala caps the stop at that moment).
            stoppedAt = DesktopSessionTiming.StopAt(session with { StartedAt = receipt.StartedAt, LastActivityAt = lastActivity }, serverNow);
            AgentDiagnostics.Record("lan-start-superseded", $"sessionId={session.Id}; supersededBy={receipt.SupersededBy ?? "web timer"}");
        }
        if (running && stoppedAt is null) _lanClock.Start(serverNow);
        AgentDiagnostics.Record("lan-start-confirmed", $"sessionId={session.Id}; startedAt={receipt.StartedAt:O}; secondsAgo={secondsAgo:0}; stopped={stoppedAt:O}");
        return session with { Confirmed = true, StartedAt = receipt.StartedAt, LastActivityAt = lastActivity, StoppedAt = stoppedAt };
    }

    private async Task<TimeEntrySaveResult> FinishAsync(DesktopSession session)
    {
        var receipt = await RpcAsync<DesktopReceipt>("finish_desktop_work_session", new { session_id = session.Id, stopped_at = session.StoppedAt });
        if (receipt.Id != session.Id || receipt.ProjectId != session.ProjectId || receipt.StoppedAt is null)
            throw new InvalidOperationException("Save receipt mismatch. Pending time was retained.");
        // Exact format is parsed by CI and IT office tests (scripts/office-test/check-core.ps1).
        AgentDiagnostics.Record("lan-time-confirmed", $"sessionId={session.Id}; entryId={receipt.TimeEntryId ?? "under-rounding-threshold"}");
        if (receipt.SupersededBy is not null)
            AgentDiagnostics.Record("lan-time-superseded", $"sessionId={session.Id}; supersededBy={receipt.SupersededBy}");
        return new TimeEntrySaveResult(receipt.TimeEntryId ?? session.Id, TooShort: receipt.TimeEntryId is null,
            Superseded: receipt.SupersededBy is not null);
    }

    private async Task<TimeEntrySaveResult> StopLanAsync()
    {
        var session = _journalState!.Session ?? throw new InvalidOperationException("No local session is active.");
        if (session.StoppedAt is null)
        {
            await PersistJournalAsync(_journalState with { Session = session with { StoppedAt = DesktopSessionTiming.StopAt(session, _lanClock.UtcNow) } });
            _runningSessionId = null;
        }
        try
        {
            return (await ReconcileLanAsync()) ?? new TimeEntrySaveResult(session.Id, Pending: true);
        }
        catch (Exception exception)
        {
            // Both network failures and authorization rejections preserve work.
            AgentDiagnostics.Record("lan-save-pending", $"sessionId={session.Id}; {AgentDiagnostics.Compact(exception.Message)}");
            return new TimeEntrySaveResult(session.Id, Pending: true);
        }
    }

    // Uploads queued sessions oldest first, then the current one. Returns the
    // receipt of the current session when it was finished here, otherwise the
    // last queued receipt, or null when nothing finished.
    private async Task<TimeEntrySaveResult?> ReconcileLanAsync()
    {
        if (_journalState is null) return null;
        TimeEntrySaveResult? result = null;
        Exception? queueFailure = null;

        foreach (var queued in (_journalState.Completed ?? []).ToList())
        {
            try
            {
                var confirmed = queued.Confirmed ? queued : await ConfirmAsync(queued, running: false);
                var saved = await FinishAsync(confirmed);
                await PersistJournalAsync(_journalState with { Completed = _journalState.Completed!.Where(s => s.Id != queued.Id).ToList() });
                result = saved;
            }
            catch (Exception exception) when (IsConnectionFailure(exception))
            {
                throw;
            }
            catch (Exception exception)
            {
                // Keep a rejected session for IT and still upload the others.
                AgentDiagnostics.Record("lan-queued-save-rejected", $"sessionId={queued.Id}; {AgentDiagnostics.Compact(exception.Message)}");
                queueFailure ??= exception;
            }
        }

        if (_journalState.Session is { } session)
        {
            if (!session.Confirmed) await ConfirmCurrentAsync();
            session = _journalState.Session!;
            if (session.StoppedAt is not null)
            {
                result = await FinishAsync(session);
                await PersistJournalAsync(_journalState with { Session = null });
            }
        }

        if (result is null && queueFailure is not null) throw queueFailure;
        return result;
    }

    private async Task TouchLanAsync()
    {
        if (_journalState?.Session is not { StoppedAt: null } session) return;
        var now = _lanClock.UtcNow;
        if (now - session.StartedAt >= TimeSpan.FromHours(24))
        {
            await StopLanAsync();
            return;
        }
        await PersistJournalAsync(_journalState with { Session = session with { LastActivityAt = now } });
        if (!session.Confirmed) return; // Uploaded with the start once Mandala confirms it.
        try { await SendWithoutResponseAsync(HttpMethod.Post, "rest/v1/rpc/touch_desktop_work_session", new { session_id = session.Id, activity_at = now }); }
        catch (Exception exception) when (IsConnectionFailure(exception))
        {
            AgentDiagnostics.Record("lan-activity-local", $"sessionId={session.Id}");
        }
        catch (HttpRequestException exception) when (exception.Message.Contains("AGENT-SESSION-SUPERSEDED", StringComparison.Ordinal))
        {
            AgentDiagnostics.Record("lan-session-superseded", $"sessionId={session.Id}");
            await PersistJournalAsync(_journalState with { Session = _journalState.Session! with { StoppedAt = DesktopSessionTiming.StopAt(session, now) } });
            _runningSessionId = null;
            try { await ReconcileLanAsync(); }
            catch (Exception uploadFailure) when (IsConnectionFailure(uploadFailure)) { }
            throw new DesktopSessionSupersededException(
                "This account started work on another computer, so tracking here stopped. Time on this computer was saved up to then.");
        }
    }

    private static bool IsConnectionFailure(Exception exception) => exception is TaskCanceledException ||
        exception is HttpRequestException { StatusCode: null or System.Net.HttpStatusCode.ServiceUnavailable or System.Net.HttpStatusCode.BadGateway or System.Net.HttpStatusCode.GatewayTimeout };
    private sealed record GatewayIdentity(string Backend, int Protocol);
    private sealed record DesktopReceipt(
        [property: JsonPropertyName("id")] string Id,
        [property: JsonPropertyName("project_id")] string ProjectId,
        [property: JsonPropertyName("started_at")] DateTimeOffset StartedAt,
        [property: JsonPropertyName("stopped_at")] DateTimeOffset? StoppedAt,
        [property: JsonPropertyName("time_entry_id")] string? TimeEntryId,
        [property: JsonPropertyName("superseded_by")] string? SupersededBy = null,
        [property: JsonPropertyName("server_now")] DateTimeOffset? ServerNow = null);
}
