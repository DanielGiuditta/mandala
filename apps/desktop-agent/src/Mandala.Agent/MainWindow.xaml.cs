using System.IO;
using System.Globalization;
using System.Windows;
using System.Windows.Threading;

namespace Mandala.Agent;

public partial class MainWindow : Window
{
    private static readonly TimeSpan IdleLimit = TimeSpan.FromMinutes(5);
    private static readonly TimeSpan ActivityHeartbeatInterval = TimeSpan.FromSeconds(15);
    private static readonly TimeSpan WakeNetworkGracePeriod = TimeSpan.FromSeconds(5);

    private readonly AppConfiguration _configuration = AppConfiguration.Load();
    private readonly SecureSessionStore _sessionStore = new();
    private readonly DispatcherTimer _pollTimer;
    private readonly TrackerMessageState _trackerMessageState = new();
    private SupabaseTimeTrackerClient? _client;
    private ActiveWorkSession? _activeSession;
    private uint _lastInputTick;
    private DateTimeOffset _lastHeartbeatAt = DateTimeOffset.MinValue;
    private DateTimeOffset _lastPendingSaveRetryAt = DateTimeOffset.MinValue;
    private DateTimeOffset _lastPollAt = DateTimeOffset.UtcNow;
    private DateTimeOffset _lastWakeSaveAttemptAt = DateTimeOffset.MinValue;
    private bool _wakeIdleStopPending;
    private bool _isSaving;

    public MainWindow()
    {
        InitializeComponent();
        var version = GetVersion();
        var backend = _configuration.ProjectRef ?? "unconfigured";
        BuildIdentityText.Text = $"Agent v{version} · Backend {backend}";
        AgentDiagnostics.Record("startup", $"version={version}; backend={_configuration.SupabaseUrl}");
        _pollTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(1) };
        _pollTimer.Tick += async (_, _) => await PollAsync();
        Loaded += async (_, _) => await RestoreSessionAsync();
    }

    private async Task RestoreSessionAsync()
    {
        if (!_configuration.IsConfigured)
        {
            LoginMessageText.Text = AgentDiagnostics.Format(
                "AGENT-CONFIG-001",
                "This installation is missing its Mandala connection configuration. Ask IT to reinstall the approved installer.");
            SignInButton.IsEnabled = false;
            return;
        }

        if (!_configuration.IsProductionTarget)
        {
            LoginMessageText.Text = AgentDiagnostics.Format(
                "AGENT-CONFIG-BACKEND-001",
                $"This is an outdated or invalid installer connected to backend {_configuration.ProjectRef ?? "unknown"}. Production requires {AppConfiguration.ProductionProjectRef}. Ask IT to install the current approved version.");
            SignInButton.IsEnabled = false;
            AgentDiagnostics.Record(
                "backend-blocked",
                $"actual={_configuration.ProjectRef ?? "unknown"}; expected={AppConfiguration.ProductionProjectRef}");
            return;
        }

        _client = new SupabaseTimeTrackerClient(_configuration);
        var storedSession = await _sessionStore.LoadAsync();

        if (storedSession is null)
        {
            return;
        }

        if (!await _client.RestoreAsync(storedSession))
        {
            LoginMessageText.Text = AgentDiagnostics.Format(
                "AGENT-AUTH-RESTORE-001",
                "The saved sign-in expired. Sign in again.");
            return;
        }

        await _sessionStore.SaveAsync(_client.GetStoredSession());
        ShowTracker();
        await LoadTrackerAsync();
    }

    private async void SignInButton_Click(object sender, RoutedEventArgs e)
    {
        if (_client is null || string.IsNullOrWhiteSpace(EmailTextBox.Text) || string.IsNullOrWhiteSpace(PasswordBox.Password))
        {
            LoginMessageText.Text = AgentDiagnostics.Format(
                "AGENT-AUTH-INPUT-001",
                "Enter your Mandala email and password.");
            return;
        }

        try
        {
            SetSaving(true);
            await _client.SignInAsync(EmailTextBox.Text.Trim(), PasswordBox.Password);
            AgentDiagnostics.Record("sign-in-success", $"email={_client.Email}");
            await _sessionStore.SaveAsync(_client.GetStoredSession());
            PasswordBox.Clear();
            ShowTracker();
            await LoadTrackerAsync();
        }
        catch (Exception exception)
        {
            AgentDiagnostics.Record("sign-in-failure", AgentDiagnostics.Compact(exception.ToString()));
            LoginMessageText.Text = ExtractMessage(exception, "Sign-in failed.", "AGENT-AUTH-001");
        }
        finally
        {
            SetSaving(false);
        }
    }

    private async void StartWorkButton_Click(object sender, RoutedEventArgs e)
    {
        if (_client is null || ProjectComboBox.SelectedItem is not TimeTrackerProject project || _isSaving)
        {
            TrackerMessageText.Text = AgentDiagnostics.Format(
                "AGENT-PROJECT-SELECT-001",
                "Select a project before starting work.");
            return;
        }

        var switchingProject = _activeSession is not null && _activeSession.ProjectId != project.Id;
        if (switchingProject)
        {
            var confirmation = MessageBox.Show(
                $"You are currently tracking {_activeSession!.ProjectName}. Do you want to stop it and start tracking {project.Name}?",
                "Switch active project?",
                MessageBoxButton.YesNo,
                MessageBoxImage.Question);

            if (confirmation != MessageBoxResult.Yes)
            {
                return;
            }
        }

        var previousProjectName = _activeSession?.ProjectName;
        try
        {
            SetSaving(true);
            _trackerMessageState.ClearPersistent();
            var saveResult = await _client.StartAsync(project.Id, GetLocalDate(), switchingProject);
            await _sessionStore.SaveAsync(_client.GetStoredSession());
            if (switchingProject && saveResult is not null && previousProjectName is not null)
            {
                var confirmation = TrackerConfirmationMessages.ProjectSwitch(
                    previousProjectName,
                    project.Name,
                    saveResult.TimeEntryId);
                _trackerMessageState.ShowPersistent(confirmation);
                AgentDiagnostics.Record(
                    "switch-confirmation-shown",
                    $"entryId={saveResult.TimeEntryId}; message={AgentDiagnostics.Compact(confirmation)}");
            }
            await LoadTrackerAsync();
        }
        catch (Exception exception)
        {
            AgentDiagnostics.Record("start-ui-failure", AgentDiagnostics.Compact(exception.ToString()));
            TrackerMessageText.Text = ExtractMessage(exception, "Unable to start work.", "AGENT-START-001");
        }
        finally
        {
            SetSaving(false);
        }
    }

    private async void StopButton_Click(object sender, RoutedEventArgs e) => await StopTrackingAsync(false);

    private async Task PollAsync()
    {
        var polledAt = DateTimeOffset.UtcNow;
        var previousPollAt = _lastPollAt;
        _lastPollAt = polledAt;

        if (_client is null || _isSaving)
        {
            return;
        }

        if (_client.HasPendingSave &&
            DateTimeOffset.UtcNow - _lastPendingSaveRetryAt >= TimeSpan.FromSeconds(10))
        {
            _lastPendingSaveRetryAt = DateTimeOffset.UtcNow;
            try
            {
                SetSaving(true);
                var recovered = await _client.ReconcilePendingSaveAsync();
                if (recovered is not null)
                {
                    var confirmation = TrackerConfirmationMessages.ManualStop(recovered.TimeEntryId);
                    _trackerMessageState.ShowPersistent(confirmation);
                    AgentDiagnostics.Record(
                        "pending-save-confirmation-shown",
                        $"entryId={recovered.TimeEntryId}; message={AgentDiagnostics.Compact(confirmation)}");
                    await LoadTrackerAsync();
                    return;
                }
            }
            catch (Exception exception)
            {
                AgentDiagnostics.Record(
                    "pending-save-background-failure",
                    AgentDiagnostics.Compact(exception.ToString()));
            }
            finally
            {
                SetSaving(false);
            }
        }

        if (_activeSession is null)
        {
            _wakeIdleStopPending = false;
            return;
        }

        var idleDuration = NativeIdleMonitor.GetIdleDuration();
        if (!_wakeIdleStopPending &&
            IdlePauseDecision.ShouldPause(idleDuration, previousPollAt, polledAt, IdleLimit))
        {
            _wakeIdleStopPending = true;
            _lastWakeSaveAttemptAt = polledAt;
            TrackerMessageText.Text = AgentDiagnostics.Format(
                "AGENT-WAKE-SAVE-001",
                "Windows was inactive for at least 5 minutes. The timer is paused and Mandala is waiting for the network to save the time.");
            AgentDiagnostics.Record(
                "wake-idle-detected",
                $"windowsIdleSeconds={idleDuration.TotalSeconds:0}; pollGapSeconds={(polledAt - previousPollAt).TotalSeconds:0}; projectId={_activeSession.ProjectId}");
            UpdateTrackerStatus();
            return;
        }

        if (_wakeIdleStopPending)
        {
            if (polledAt - _lastWakeSaveAttemptAt >= WakeNetworkGracePeriod)
            {
                _lastWakeSaveAttemptAt = polledAt;
                await StopTrackingAsync(true);
            }

            UpdateTrackerStatus();
            return;
        }

        var currentInputTick = NativeIdleMonitor.GetLastInputTick();
        if (currentInputTick != _lastInputTick && DateTimeOffset.UtcNow - _lastHeartbeatAt >= ActivityHeartbeatInterval)
        {
            _lastInputTick = currentInputTick;
            _lastHeartbeatAt = DateTimeOffset.UtcNow;

            try
            {
                await _client.TouchAsync();
                await _sessionStore.SaveAsync(_client.GetStoredSession());
            }
            catch (Exception exception)
            {
                TrackerMessageText.Text = ExtractMessage(exception, "Unable to record activity.", "AGENT-ACTIVITY-001");
            }
        }

        UpdateTrackerStatus();
    }

    private async Task<bool> StopTrackingAsync(bool pausedForIdle)
    {
        if (_client is null || _activeSession is null || _isSaving)
        {
            return false;
        }

        try
        {
            SetSaving(true);
            var saveResult = await _client.StopAsync(GetLocalDate());
            await _sessionStore.SaveAsync(_client.GetStoredSession());
            _activeSession = null;
            _wakeIdleStopPending = false;
            UpdateTrackerStatus();
            var confirmation = pausedForIdle
                ? TrackerConfirmationMessages.IdlePause(saveResult.TimeEntryId)
                : TrackerConfirmationMessages.ManualStop(saveResult.TimeEntryId);
            TrackerMessageText.Text = _trackerMessageState.ShowPersistent(confirmation);
            AgentDiagnostics.Record(
                pausedForIdle ? "idle-confirmation-shown" : "stop-confirmation-shown",
                $"entryId={saveResult.TimeEntryId}; message={AgentDiagnostics.Compact(confirmation)}");
            return true;
        }
        catch (Exception exception)
        {
            AgentDiagnostics.Record("stop-ui-failure", AgentDiagnostics.Compact(exception.ToString()));
            if (pausedForIdle && _wakeIdleStopPending)
            {
                TrackerMessageText.Text = AgentDiagnostics.Format(
                    "AGENT-WAKE-SAVE-001",
                    "The timer is paused. Mandala is still waiting for the network and will retry the save automatically.");
                AgentDiagnostics.Record("wake-idle-save-retry", AgentDiagnostics.Compact(exception.Message));
            }
            else
            {
                TrackerMessageText.Text = ExtractMessage(exception, "Unable to stop work.", "AGENT-STOP-001");
                await LoadTrackerAsync();
                TrackerMessageText.Text = ExtractMessage(exception, "Unable to stop work.", "AGENT-STOP-001");
            }

            return false;
        }
        finally
        {
            SetSaving(false);
        }
    }

    private async Task LoadTrackerAsync()
    {
        if (_client is null)
        {
            return;
        }

        try
        {
            var snapshot = await _client.GetSnapshotAsync(GetLocalDate());
            ProjectComboBox.ItemsSource = snapshot.Projects;
            _activeSession = snapshot.ActiveSession;
            if (_activeSession is not null)
            {
                ProjectComboBox.SelectedItem = snapshot.Projects.FirstOrDefault(project => project.Id == _activeSession.ProjectId);
            }

            var version = GetVersion();
            SignedInAsText.Text = _client.Email is { Length: > 0 } email
                ? $"Signed in as {email} · Agent v{version} · Projects returned: {snapshot.Projects.Count}"
                : $"Agent v{version} · Projects returned: {snapshot.Projects.Count}";

            var fallbackMessage = snapshot.Projects.Count == 0
                    ? AgentDiagnostics.Format(
                        "AGENT-PROJECTS-EMPTY",
                        "Mandala returned no active projects. Ask your admin to confirm this agent is connected to the same workspace as the web app.")
                    : string.Empty;
            TrackerMessageText.Text = _trackerMessageState.ResolveAfterLoad(snapshot.Warning, fallbackMessage);

            AgentDiagnostics.Record("tracker-loaded", $"email={_client.Email}; projects={snapshot.Projects.Count}; activeProject={snapshot.ActiveSession?.ProjectId ?? "none"}; warning={snapshot.Warning ?? "none"}");

            _lastInputTick = NativeIdleMonitor.GetLastInputTick();
            _lastHeartbeatAt = DateTimeOffset.UtcNow;
            if (_activeSession is null)
            {
                _wakeIdleStopPending = false;
            }
            UpdateTrackerStatus();
        }
        catch (Exception exception)
        {
            AgentDiagnostics.Record("tracker-load-failure", AgentDiagnostics.Compact(exception.ToString()));
            TrackerMessageText.Text = ExtractMessage(exception, "Unable to load the time tracker.", "AGENT-LOAD-001");
        }
    }

    private void CopyDiagnosticsButton_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            var report = AgentDiagnostics.Report();
            var path = AgentDiagnostics.SaveReportToDesktop();
            var clipboardCopied = false;
            try
            {
                Clipboard.SetText(report);
                clipboardCopied = true;
            }
            catch (Exception exception)
            {
                AgentDiagnostics.Record("diagnostics-clipboard-failure", AgentDiagnostics.Compact(exception.ToString()));
            }

            var diagnosticsMessage = clipboardCopied
                ? $"Diagnostics copied and saved to Desktop: {Path.GetFileName(path)}"
                : $"Diagnostics saved to Desktop: {Path.GetFileName(path)}. Please attach that file to WhatsApp.";
            TrackerMessageText.Text = _trackerMessageState.CombineWithPersistent(diagnosticsMessage);
        }
        catch (Exception exception)
        {
            AgentDiagnostics.Record("diagnostics-export-failure", AgentDiagnostics.Compact(exception.ToString()));
            TrackerMessageText.Text = AgentDiagnostics.Format(
                "AGENT-DIAGNOSTICS-EXPORT-001",
                "Could not create the diagnostics file. Please tell IT this code.",
                exception);
        }
    }

    private void ShowTracker()
    {
        LoginPanel.Visibility = Visibility.Collapsed;
        TrackerPanel.Visibility = Visibility.Visible;
        var version = GetVersion();
        SignedInAsText.Text = _client?.Email is { Length: > 0 } email
            ? $"Signed in as {email} · Agent v{version}"
            : $"Agent v{version}";
        _pollTimer.Start();
        _lastPollAt = DateTimeOffset.UtcNow;
    }

    private void UpdateTrackerStatus()
    {
        if (_activeSession is null)
        {
            ActiveProjectText.Text = "No active project";
            ElapsedText.Text = "";
            StopButton.IsEnabled = false;
            StartWorkButton.Content = "Start Work";
            return;
        }

        if (_wakeIdleStopPending)
        {
            ActiveProjectText.Text = $"Paused {_activeSession.ProjectName}";
            ElapsedText.Text = "Waiting for network to save time";
            StartWorkButton.IsEnabled = false;
            StopButton.IsEnabled = false;
            StartWorkButton.Content = "Paused";
            return;
        }

        var elapsed = DateTimeOffset.UtcNow - _activeSession.StartedAt;
        ActiveProjectText.Text = $"Tracking {_activeSession.ProjectName}";
        ElapsedText.Text = $"{Math.Floor(elapsed.TotalHours):0}h {elapsed.Minutes:00}m active";
        StopButton.IsEnabled = !_isSaving;
        StartWorkButton.Content = ProjectComboBox.SelectedItem is TimeTrackerProject selected && selected.Id != _activeSession.ProjectId
            ? "Start Work"
            : "Working";
    }

    private void SetSaving(bool isSaving)
    {
        _isSaving = isSaving;
        SignInButton.IsEnabled = !isSaving;
        StartWorkButton.IsEnabled = !isSaving && !_wakeIdleStopPending;
        StopButton.IsEnabled = !isSaving && _activeSession is not null && !_wakeIdleStopPending;
    }

    private static string GetLocalDate() => DateTime.Today.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

    private static string GetVersion() =>
        typeof(MainWindow).Assembly.GetName().Version?.ToString() ?? "unknown";

    private static string ExtractMessage(Exception exception, string fallback, string code) =>
        exception is AgentDiagnosticException diagnostic
            ? AgentDiagnostics.Format(diagnostic.Code, diagnostic.Message, diagnostic.InnerException)
            : AgentDiagnostics.Format(code, fallback, exception);
}
