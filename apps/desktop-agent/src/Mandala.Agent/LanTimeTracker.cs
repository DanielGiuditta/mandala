using System.Net.Http;
using System.Text.Json.Serialization;

namespace Mandala.Agent;

public sealed partial class SupabaseTimeTrackerClient
{
    private DesktopSessionJournal? _journal;
    private DesktopJournalState? _journalState;
    public bool UsesLanGateway => _configuration.UsesLanGateway;
    public string LanDiagnosticSummary => _journalState?.Session is { } session
        ? $"gateway={_configuration.GatewayUrl}; sessionId={session.Id}; projectId={session.ProjectId}; entryDate={session.EntryDate}; startedAt={session.StartedAt:O}; lastActivityAt={session.LastActivityAt:O}; stoppedAt={session.StoppedAt:O}; confirmed={session.Confirmed}; pending={HasPendingSave}"
        : $"gateway={_configuration.GatewayUrl}; no pending local session";
    public string? PendingTimeMessage => _journalState?.Session is { } session
        ? !session.Confirmed ? "Start request stored on this computer. Waiting for the LAN gateway to confirm."
        : session.StoppedAt is not null ? "Time saved on this computer; waiting for the LAN gateway to confirm upload."
        : null : null;

    private async Task LoadJournalAsync()
    {
        if (!UsesLanGateway || Email is null) return;
        _journal = new DesktopSessionJournal(Email);
        _journalState = await _journal.LoadAsync(Email);
        if (_journalState.Session is { StoppedAt: null } session)
        {
            // A closed/crashed/restarted app must not count the unattended interval.
            await PersistJournalAsync(_journalState with { Session = session with { StoppedAt = DesktopSessionTiming.StopAt(session, DateTimeOffset.UtcNow) } });
        }
    }

    private async Task PersistJournalAsync(DesktopJournalState next)
    {
        await _journal!.SaveAsync(next);
        _journalState = next;
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
            warning ??= "LAN gateway unavailable. Existing work stays on this computer; starting work requires a connection.";
        }
        var current = _journalState!.Session;
        return new TrackerSnapshot(_journalState.Projects,
            current is { Confirmed: true, StoppedAt: null }
                ? new ActiveWorkSession(current.ProjectId, current.ProjectName, current.StartedAt) : null,
            warning);
    }

    private async Task<TimeEntrySaveResult?> StartLanAsync(string projectId, string localDate, bool confirmSwitch)
    {
        if (_journalState is null) await LoadJournalAsync();
        if (_journalState!.Session is { } current)
        {
            if (!current.Confirmed || current.StoppedAt is not null)
                throw new InvalidOperationException("Wait for the pending session to sync before starting another timer.");
            if (current.ProjectId == projectId) return null;
            if (!confirmSwitch) throw new InvalidOperationException("Confirm the project switch first.");
            var saved = await StopLanAsync();
            if (_journalState.Session is not null) return saved;
            // The old entry's confirmed reference remains in diagnostics if the new start fails.
            AgentDiagnostics.Record("lan-switch-previous-saved", $"entryId={saved.TimeEntryId}");
            await BeginLanAsync(projectId, localDate);
            return saved;
        }
        await BeginLanAsync(projectId, localDate);
        return null;
    }

    private async Task BeginLanAsync(string projectId, string localDate)
    {
        var project = _journalState!.Projects.SingleOrDefault(p => p.Id == projectId)
            ?? throw new InvalidOperationException("Select an available project.");
        // Check reachability before recording an intention to start. A lost response
        // after this point is reconciled with the same UUID, never another start.
        using var health = await _httpClient.GetAsync("health");
        var identity = await ReadResponseAsync<GatewayIdentity>(health);
        if (identity.Backend != $"https://{AppConfiguration.ProductionProjectRef}.supabase.co" || identity.Protocol != 1)
            throw new InvalidOperationException("AGENT-CONFIG-BACKEND-001: The LAN gateway does not identify the production backend.");
        var now = DateTimeOffset.UtcNow;
        await PersistJournalAsync(_journalState with { Session = new DesktopSession(Guid.NewGuid().ToString(), projectId, project.Name, localDate, now, now) });
        await ConfirmLanStartAsync(firstAttempt: true);
    }

    private async Task ConfirmLanStartAsync(bool firstAttempt = false)
    {
        var session = _journalState!.Session!;
        try
        {
            var receipt = await RpcAsync<DesktopReceipt>("start_desktop_work_session", new { session_id = session.Id, target_project_id = session.ProjectId, entry_date = session.EntryDate });
            if (receipt.Id != session.Id || receipt.ProjectId != session.ProjectId) throw new InvalidOperationException("The session receipt did not match. Preserve diagnostics for IT.");
            // An uncertain start is paused at confirmation, rather than silently
            // counting time while the UI said it was waiting.
            var stopped = session.StoppedAt;
            if (DateTimeOffset.UtcNow - session.StartedAt > TimeSpan.FromSeconds(20)) stopped ??= receipt.StartedAt;
            if (stopped < receipt.StartedAt) stopped = receipt.StartedAt;
            await PersistJournalAsync(_journalState with { Session = session with { Confirmed = true, StartedAt = receipt.StartedAt, LastActivityAt = receipt.StartedAt, StoppedAt = stopped } });
        }
        catch (HttpRequestException exception) when (firstAttempt && exception.StatusCode == System.Net.HttpStatusCode.BadRequest)
        {
            // Only an explicit rejection of the FIRST request proves no session
            // was created. A rejected retry may follow a lost successful response.
            await PersistJournalAsync(_journalState with { Session = null });
            throw;
        }
    }

    private async Task<TimeEntrySaveResult> StopLanAsync()
    {
        var session = _journalState!.Session ?? throw new InvalidOperationException("No local session is active.");
        if (session.StoppedAt is null)
            await PersistJournalAsync(_journalState with { Session = session with { StoppedAt = DesktopSessionTiming.StopAt(session, DateTimeOffset.UtcNow) } });
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

    private async Task<TimeEntrySaveResult?> ReconcileLanAsync()
    {
        if (_journalState?.Session is not { } session) return null;
        if (!session.Confirmed) await ConfirmLanStartAsync();
        session = _journalState!.Session!;
        if (session.StoppedAt is null) return null;
        var receipt = await RpcAsync<DesktopReceipt>("finish_desktop_work_session", new { session_id = session.Id, stopped_at = session.StoppedAt });
        if (receipt.Id != session.Id || receipt.ProjectId != session.ProjectId || receipt.StoppedAt is null)
            throw new InvalidOperationException("Save receipt mismatch. Pending time was retained.");
        await PersistJournalAsync(_journalState with { Session = null });
        AgentDiagnostics.Record("lan-time-confirmed", $"sessionId={session.Id}; entryId={receipt.TimeEntryId ?? "under-rounding-threshold"}");
        return new TimeEntrySaveResult(receipt.TimeEntryId ?? session.Id, TooShort: receipt.TimeEntryId is null);
    }

    private async Task TouchLanAsync()
    {
        if (_journalState?.Session is not { Confirmed: true, StoppedAt: null } session) return;
        var now = DateTimeOffset.UtcNow;
        if (now - session.StartedAt >= TimeSpan.FromHours(24))
        {
            await StopLanAsync();
            return;
        }
        await PersistJournalAsync(_journalState with { Session = session with { LastActivityAt = now } });
        try { await SendWithoutResponseAsync(HttpMethod.Post, "rest/v1/rpc/touch_desktop_work_session", new { session_id = session.Id, activity_at = now }); }
        catch (Exception exception) when (IsConnectionFailure(exception))
        {
            AgentDiagnostics.Record("lan-activity-local", $"sessionId={session.Id}");
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
        [property: JsonPropertyName("time_entry_id")] string? TimeEntryId);
}
