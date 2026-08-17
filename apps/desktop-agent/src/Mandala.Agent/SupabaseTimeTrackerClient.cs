using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Mandala.Agent;

public sealed class SupabaseTimeTrackerClient
{
    private const int SaveReconciliationAttempts = 4;
    private readonly AppConfiguration _configuration;
    private readonly HttpClient _httpClient;
    private PendingSaveCheck? _pendingSaveCheck;
    private StoredSession? _session;

    public SupabaseTimeTrackerClient(AppConfiguration configuration)
    {
        _configuration = configuration;
        _httpClient = new HttpClient { BaseAddress = new Uri($"{configuration.SupabaseUrl}/") };
        _httpClient.DefaultRequestHeaders.Add("apikey", configuration.SupabaseAnonKey);
        AgentDiagnostics.Record("client-created", $"backend={configuration.SupabaseUrl}");
    }

    public string? Email => _session?.Email;
    public bool HasPendingSave => _pendingSaveCheck is not null;

    public async Task SignInAsync(string email, string password)
    {
        using var response = await _httpClient.PostAsJsonAsync(
            "auth/v1/token?grant_type=password",
            new { email, password },
            AppConfiguration.JsonOptions);
        var payload = await ReadResponseAsync<AuthResponse>(response);
        _session = new StoredSession(payload.AccessToken, payload.RefreshToken, email.Trim().ToLowerInvariant());
    }

    public async Task<bool> RestoreAsync(StoredSession session)
    {
        _session = session;

        try
        {
            return await RefreshSessionAsync();
        }
        catch
        {
            _session = null;
            return false;
        }
    }

    public StoredSession GetStoredSession() =>
        _session ?? throw new InvalidOperationException("No authenticated session is available.");

    public async Task<TrackerSnapshot> GetSnapshotAsync(string localDate)
    {
        var projects = await ListProjectsAsync();
        var warnings = new List<string>();

        if (projects.Count > 0 && projects.All(project => string.IsNullOrWhiteSpace(project.Name)))
        {
            warnings.Add(AgentDiagnostics.Format(
                "AGENT-PROJECTS-NAMES-001",
                $"Mandala returned {projects.Count} projects, but no project names were readable."));
        }

        try
        {
            await RpcAsync<JsonElement>("pause_stale_self_work_session", new { entry_date = localDate });
        }
        catch (HttpRequestException exception)
        {
            warnings.Add(AgentDiagnostics.Format(
                "AGENT-TIMER-PAUSE-001",
                "Projects loaded, but the active timer could not be checked.",
                exception));
        }

        List<ActiveSessionResponse> sessions = [];
        try
        {
            sessions = await GetAsync<List<ActiveSessionResponse>>(
                "rest/v1/active_work_sessions?select=project_id,started_at");
        }
        catch (HttpRequestException exception)
        {
            warnings.Add(AgentDiagnostics.Format(
                "AGENT-TIMER-SESSION-001",
                "Projects loaded, but the active timer could not be checked.",
                exception));
        }

        var active = sessions.FirstOrDefault();
        var activeProject = active is null
            ? null
            : projects.FirstOrDefault(project => project.Id == active.ProjectId);

        return new TrackerSnapshot(
            projects.Select(project => new TimeTrackerProject(project.Id, project.Name)).ToList(),
            active is null ? null : new ActiveWorkSession(active.ProjectId, activeProject?.Name ?? "Current project", active.StartedAt),
            warnings.Count == 0 ? null : string.Join(" ", warnings));
    }

    private async Task<List<ProjectResponse>> ListProjectsAsync()
    {
        // The projects endpoint already applies the workspace's RLS rules:
        // admins and partners can see all active projects, while employees see
        // only projects they are assigned to. This keeps the agent aligned with
        // the same permission path used by the web app.
        try
        {
            var projects = await GetAsync<List<ProjectResponse>>(
                "rest/v1/projects?select=id,name&active=eq.true&order=name.asc");
            if (projects.Count > 0)
            {
                return projects;
            }
        }
        catch (HttpRequestException)
        {
            // Keep the RPC as a compatibility fallback for older deployments.
        }

        try
        {
            return await RpcAsync<List<ProjectResponse>>("list_time_tracker_projects_for_current_user", new { });
        }
        catch (HttpRequestException exception)
        {
            throw new AgentDiagnosticException(
                "AGENT-PROJECTS-001",
                "Mandala could not load the project list.",
                exception);
        }
    }

    public async Task<TimeEntrySaveResult?> StartAsync(string projectId, string localDate, bool confirmSwitch) =>
        await StartAndRecordAsync(projectId, localDate, confirmSwitch);

    private async Task<TimeEntrySaveResult?> StartAndRecordAsync(string projectId, string localDate, bool confirmSwitch)
    {
        AgentDiagnostics.Record("start-request", $"projectId={projectId}; date={localDate}; confirmSwitch={confirmSwitch}; email={Email}");
        if (confirmSwitch)
        {
            var pendingResult = await TryResolvePendingSaveAsync(localDate, projectId);
            if (pendingResult is not null)
            {
                return pendingResult;
            }
        }

        var entriesBeforeSwitch = confirmSwitch
            ? await GetTimeEntryIdsAsync(localDate)
            : null;
        Exception? operationFailure = null;

        if (entriesBeforeSwitch is not null)
        {
            _pendingSaveCheck = new PendingSaveCheck(localDate, entriesBeforeSwitch, projectId, "switch");
        }

        try
        {
            await RpcAsync<JsonElement>("start_self_work_session", new
            {
                target_project_id = projectId,
                entry_date = localDate,
                confirm_switch = confirmSwitch,
            });
            AgentDiagnostics.Record("start-success", $"projectId={projectId}; date={localDate}; confirmSwitch={confirmSwitch}");
        }
        catch (Exception exception)
        {
            AgentDiagnostics.Record("start-failure", AgentDiagnostics.Compact(exception.ToString()));
            operationFailure = exception;
        }

        if (entriesBeforeSwitch is null)
        {
            if (operationFailure is not null)
            {
                throw operationFailure;
            }

            return null;
        }

        var switchResult = await ReconcileSaveAsync(
            _pendingSaveCheck!,
            SaveReconciliationAttempts);
        if (switchResult is not null)
        {
            return switchResult;
        }

        if (operationFailure is not null)
        {
            throw operationFailure;
        }

        AgentDiagnostics.Record("switch-not-saved", $"date={localDate}; entriesBefore={entriesBeforeSwitch.Count}; newProjectId={projectId}");
        throw new AgentDiagnosticException(
            "AGENT-SWITCH-NOT-SAVED-001",
            "The project switched, but Mandala did not confirm the previous project’s time was saved. Please report this code to IT.");
    }

    public async Task<TimeEntrySaveResult> StopAsync(string localDate)
    {
        AgentDiagnostics.Record("stop-request", $"date={localDate}; email={Email}");
        var pendingResult = await TryResolvePendingSaveAsync(localDate, expectedActiveProjectId: null);
        if (pendingResult is not null)
        {
            return pendingResult;
        }

        var before = await GetTimeEntryIdsAsync(localDate);
        _pendingSaveCheck = new PendingSaveCheck(localDate, before, ExpectedActiveProjectId: null, "stop");
        Exception? operationFailure = null;

        try
        {
            await RpcAsync<JsonElement>("stop_self_work_session", new { entry_date = localDate });
            AgentDiagnostics.Record("stop-rpc-success", $"date={localDate}; entriesBefore={before.Count}");
        }
        catch (Exception exception)
        {
            AgentDiagnostics.Record("stop-rpc-failure", AgentDiagnostics.Compact(exception.ToString()));
            operationFailure = exception;
        }

        var stopResult = await ReconcileSaveAsync(
            _pendingSaveCheck,
            SaveReconciliationAttempts);
        if (stopResult is not null)
        {
            return stopResult;
        }

        if (operationFailure is not null)
        {
            throw operationFailure;
        }

        AgentDiagnostics.Record("stop-not-saved", $"date={localDate}; entriesBefore={before.Count}");
        throw new AgentDiagnosticException(
            "AGENT-STOP-NOT-SAVED-001",
            "The timer stopped, but Mandala did not confirm a saved time entry. Please report this code to IT.");
    }

    private async Task<TimeEntrySaveResult?> TryResolvePendingSaveAsync(
        string localDate,
        string? expectedActiveProjectId)
    {
        var pending = _pendingSaveCheck;
        if (pending is null ||
            !string.Equals(pending.LocalDate, localDate, StringComparison.Ordinal) ||
            !string.Equals(
                pending.ExpectedActiveProjectId,
                expectedActiveProjectId,
                StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        AgentDiagnostics.Record(
            "save-reconciliation-resume",
            $"operation={pending.Operation}; date={pending.LocalDate}; expectedActiveProject={pending.ExpectedActiveProjectId ?? "none"}");
        return await ReconcileSaveAsync(pending, SaveReconciliationAttempts);
    }

    public async Task<TimeEntrySaveResult?> ReconcilePendingSaveAsync()
    {
        var pending = _pendingSaveCheck;
        if (pending is null)
        {
            return null;
        }

        AgentDiagnostics.Record(
            "save-reconciliation-background",
            $"operation={pending.Operation}; date={pending.LocalDate}; expectedActiveProject={pending.ExpectedActiveProjectId ?? "none"}");
        return await ReconcileSaveAsync(pending, SaveReconciliationAttempts);
    }

    private async Task<TimeEntrySaveResult?> ReconcileSaveAsync(
        PendingSaveCheck pending,
        int attempts)
    {
        for (var attempt = 1; attempt <= attempts; attempt += 1)
        {
            if (attempt > 1)
            {
                await Task.Delay(TimeSpan.FromMilliseconds(350 * attempt));
            }

            try
            {
                var entriesAfter = await GetTimeEntryIdsAsync(pending.LocalDate);
                var activeProjectId = await GetActiveSessionProjectIdAsync();
                var recoveredEntry = TimeEntrySaveReconciliation.FindRecoveredEntry(
                    pending.EntriesBefore,
                    entriesAfter,
                    activeProjectId,
                    pending.ExpectedActiveProjectId);

                AgentDiagnostics.Record(
                    "save-reconciliation-check",
                    $"operation={pending.Operation}; attempt={attempt}; date={pending.LocalDate}; entriesBefore={pending.EntriesBefore.Count}; entriesAfter={entriesAfter.Count}; activeProject={activeProjectId ?? "none"}; expectedActiveProject={pending.ExpectedActiveProjectId ?? "none"}; recoveredEntry={recoveredEntry ?? "none"}");

                if (recoveredEntry is null)
                {
                    continue;
                }

                _pendingSaveCheck = null;
                AgentDiagnostics.Record(
                    $"{pending.Operation}-saved",
                    $"date={pending.LocalDate}; entryId={recoveredEntry}; recovered={attempt > 1}; entriesBefore={pending.EntriesBefore.Count}; entriesAfter={entriesAfter.Count}");
                return new TimeEntrySaveResult(recoveredEntry);
            }
            catch (Exception exception)
            {
                AgentDiagnostics.Record(
                    "save-reconciliation-failure",
                    $"operation={pending.Operation}; attempt={attempt}; {AgentDiagnostics.Compact(exception.ToString())}");
            }
        }

        return null;
    }

    public async Task TouchAsync() =>
        await SendWithoutResponseAsync(HttpMethod.Post, "rest/v1/rpc/touch_self_work_session", new { });

    private async Task<T> RpcAsync<T>(string functionName, object body) =>
        await SendAsync<T>(HttpMethod.Post, $"rest/v1/rpc/{functionName}", body);

    private async Task<T> GetAsync<T>(string path)
    {
        return await SendAuthorizedAsync<T>(() => CreateRequest(HttpMethod.Get, path));
    }

    private async Task<HashSet<string>> GetTimeEntryIdsAsync(string localDate)
    {
        if (string.IsNullOrWhiteSpace(Email))
        {
            throw new AgentDiagnosticException(
                "AGENT-STOP-IDENTITY-001",
                "The signed-in person could not be confirmed before checking the saved time entry.");
        }

        var people = await GetAsync<List<PersonResponse>>(
            $"rest/v1/people?select=id&email=eq.{Uri.EscapeDataString(Email)}&active=eq.true");
        var person = people.SingleOrDefault();
        if (person is null)
        {
            throw new AgentDiagnosticException(
                "AGENT-STOP-IDENTITY-002",
                "The signed-in account is not linked to one active Mandala person record.");
        }

        var entries = await GetAsync<List<TimeEntryResponse>>(
            $"rest/v1/time_entries?select=id&person_id=eq.{person.Id}&date=eq.{Uri.EscapeDataString(localDate)}");
        AgentDiagnostics.Record("time-entry-check", $"date={localDate}; personId={person.Id}; count={entries.Count}");
        return entries.Select(entry => entry.Id).ToHashSet(StringComparer.OrdinalIgnoreCase);
    }

    private async Task<string?> GetActiveSessionProjectIdAsync()
    {
        var sessions = await GetAsync<List<ActiveSessionResponse>>(
            "rest/v1/active_work_sessions?select=project_id");
        return sessions.SingleOrDefault()?.ProjectId;
    }

    private async Task<T> SendAsync<T>(HttpMethod method, string path, object body)
    {
        return await SendAuthorizedAsync<T>(() =>
        {
            var request = CreateRequest(method, path);
            request.Content = JsonContent.Create(body, options: AppConfiguration.JsonOptions);
            return request;
        });
    }

    private async Task SendWithoutResponseAsync(HttpMethod method, string path, object body)
    {
        await SendAuthorizedWithoutResponseAsync(() =>
        {
            var request = CreateRequest(method, path);
            request.Content = JsonContent.Create(body, options: AppConfiguration.JsonOptions);
            return request;
        });
    }

    private async Task<T> SendAuthorizedAsync<T>(Func<HttpRequestMessage> createRequest)
    {
        using var response = await SendRequestAsync(createRequest);
        if (response.StatusCode != System.Net.HttpStatusCode.Unauthorized)
        {
            return await ReadResponseAsync<T>(response);
        }

        if (!await RefreshSessionAsync())
        {
            return await ReadResponseAsync<T>(response);
        }

        using var retryResponse = await SendRequestAsync(createRequest);
        return await ReadResponseAsync<T>(retryResponse);
    }

    private async Task SendAuthorizedWithoutResponseAsync(Func<HttpRequestMessage> createRequest)
    {
        using var response = await SendRequestAsync(createRequest);
        if (response.StatusCode != System.Net.HttpStatusCode.Unauthorized)
        {
            await AgentHttpResponse.EnsureSuccessAsync(response);
            return;
        }

        if (!await RefreshSessionAsync())
        {
            await AgentHttpResponse.EnsureSuccessAsync(response);
            return;
        }

        using var retryResponse = await SendRequestAsync(createRequest);
        await AgentHttpResponse.EnsureSuccessAsync(retryResponse);
    }

    private async Task<HttpResponseMessage> SendRequestAsync(Func<HttpRequestMessage> createRequest)
    {
        using var request = createRequest();
        return await _httpClient.SendAsync(request);
    }

    private async Task<bool> RefreshSessionAsync()
    {
        var session = _session;
        if (session is null)
        {
            return false;
        }

        using var response = await _httpClient.PostAsJsonAsync(
            "auth/v1/token?grant_type=refresh_token",
            new { refresh_token = session.RefreshToken },
            AppConfiguration.JsonOptions);
        var payload = await ReadResponseAsync<AuthResponse>(response);
        _session = session with
        {
            AccessToken = payload.AccessToken,
            RefreshToken = payload.RefreshToken,
        };
        return true;
    }

    private HttpRequestMessage CreateRequest(HttpMethod method, string path)
    {
        if (_session is null)
        {
            throw new InvalidOperationException("Sign in before tracking time.");
        }

        var request = new HttpRequestMessage(method, path);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _session.AccessToken);
        return request;
    }

    private static async Task<T> ReadResponseAsync<T>(HttpResponseMessage response) =>
        await AgentHttpResponse.ReadRequiredJsonAsync<T>(response, AppConfiguration.JsonOptions);

    private sealed record AuthResponse(string access_token, string refresh_token)
    {
        public string AccessToken => access_token;
        public string RefreshToken => refresh_token;
    }

    private sealed class ProjectResponse
    {
        [JsonPropertyName("id")]
        public string Id { get; init; } = string.Empty;

        [JsonPropertyName("name")]
        public string Name { get; init; } = string.Empty;
    }

    private sealed class ActiveSessionResponse
    {
        [JsonPropertyName("project_id")]
        public string ProjectId { get; init; } = string.Empty;

        [JsonPropertyName("started_at")]
        public DateTimeOffset StartedAt { get; init; }
    }

    private sealed record PendingSaveCheck(
        string LocalDate,
        HashSet<string> EntriesBefore,
        string? ExpectedActiveProjectId,
        string Operation);

    private sealed class PersonResponse
    {
        [JsonPropertyName("id")]
        public string Id { get; init; } = string.Empty;
    }

    private sealed class TimeEntryResponse
    {
        [JsonPropertyName("id")]
        public string Id { get; init; } = string.Empty;
    }
}

public sealed record TimeTrackerProject(string Id, string Name)
{
    public override string ToString() => Name;
}
public sealed record ActiveWorkSession(string ProjectId, string ProjectName, DateTimeOffset StartedAt);
public sealed record TimeEntrySaveResult(string TimeEntryId);
public sealed record TrackerSnapshot(
    IReadOnlyList<TimeTrackerProject> Projects,
    ActiveWorkSession? ActiveSession,
    string? Warning);
