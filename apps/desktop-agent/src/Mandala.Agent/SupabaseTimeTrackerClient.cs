using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;

namespace Mandala.Agent;

public sealed class SupabaseTimeTrackerClient
{
    private readonly AppConfiguration _configuration;
    private readonly HttpClient _httpClient;
    private StoredSession? _session;

    public SupabaseTimeTrackerClient(AppConfiguration configuration)
    {
        _configuration = configuration;
        _httpClient = new HttpClient { BaseAddress = new Uri($"{configuration.SupabaseUrl}/") };
        _httpClient.DefaultRequestHeaders.Add("apikey", configuration.SupabaseAnonKey);
    }

    public string? Email => _session?.Email;

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
        await RpcAsync<JsonElement>("pause_stale_self_work_session", new { entry_date = localDate });
        var projects = await ListProjectsAsync();
        var sessions = await GetAsync<List<ActiveSessionResponse>>("rest/v1/active_work_sessions?select=project_id,started_at");
        var active = sessions.FirstOrDefault();
        var activeProject = active is null
            ? null
            : projects.FirstOrDefault(project => project.Id == active.ProjectId);

        return new TrackerSnapshot(
            projects.Select(project => new TimeTrackerProject(project.Id, project.Name)).ToList(),
            active is null ? null : new ActiveWorkSession(active.ProjectId, activeProject?.Name ?? "Current project", active.StartedAt));
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

        return await RpcAsync<List<ProjectResponse>>("list_time_tracker_projects_for_current_user", new { });
    }

    public async Task StartAsync(string projectId, string localDate, bool confirmSwitch) =>
        await RpcAsync<JsonElement>("start_self_work_session", new
        {
            target_project_id = projectId,
            entry_date = localDate,
            confirm_switch = confirmSwitch,
        });

    public async Task StopAsync(string localDate) =>
        await RpcAsync<JsonElement>("stop_self_work_session", new { entry_date = localDate });

    public async Task TouchAsync() =>
        await RpcAsync<JsonElement>("touch_self_work_session", new { });

    private async Task<T> RpcAsync<T>(string functionName, object body) =>
        await SendAsync<T>(HttpMethod.Post, $"rest/v1/rpc/{functionName}", body);

    private async Task<T> GetAsync<T>(string path)
    {
        return await SendAuthorizedAsync<T>(() => CreateRequest(HttpMethod.Get, path));
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

    private static async Task<T> ReadResponseAsync<T>(HttpResponseMessage response)
    {
        if (!response.IsSuccessStatusCode)
        {
            var message = await response.Content.ReadAsStringAsync();
            throw new HttpRequestException(string.IsNullOrWhiteSpace(message)
                ? "Mandala could not complete the request."
                : message);
        }

        var payload = await response.Content.ReadFromJsonAsync<T>(AppConfiguration.JsonOptions);
        if (payload is null)
        {
            throw new HttpRequestException("Mandala returned an empty response.");
        }

        return payload;
    }

    private sealed record AuthResponse(string access_token, string refresh_token)
    {
        public string AccessToken => access_token;
        public string RefreshToken => refresh_token;
    }

    private sealed record ProjectResponse(string id, string name)
    {
        public string Id => id;
        public string Name => name;
    }

    private sealed record ActiveSessionResponse(string project_id, DateTimeOffset started_at)
    {
        public string ProjectId => project_id;
        public DateTimeOffset StartedAt => started_at;
    }
}

public sealed record TimeTrackerProject(string Id, string Name);
public sealed record ActiveWorkSession(string ProjectId, string ProjectName, DateTimeOffset StartedAt);
public sealed record TrackerSnapshot(IReadOnlyList<TimeTrackerProject> Projects, ActiveWorkSession? ActiveSession);
