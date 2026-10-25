using System.ComponentModel;
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

    private readonly AppConfiguration _configuration;
    private readonly SecureSessionStore _sessionStore = new();
    private readonly DispatcherTimer _pollTimer;
    private readonly TrackerMessageState _trackerMessageState = new();
    private readonly IdleAutoResumeState _autoResume = new();
    private SupabaseTimeTrackerClient? _client;
    private ActiveWorkSession? _activeSession;
    private uint _lastInputTick;
    private DateTimeOffset _lastHeartbeatAt = DateTimeOffset.MinValue;
    private DateTimeOffset _lastPendingSaveRetryAt = DateTimeOffset.MinValue;
    private readonly DesktopSessionClock _pollClock = new();
    private DateTimeOffset _lastPollAt;
    private DateTimeOffset _lastWakeSaveAttemptAt = DateTimeOffset.MinValue;
    private bool _wakeIdleStopPending;
    private bool _isSaving;
    private bool _isPolling;
    private bool _manualStopRequested;
    private DateTimeOffset _lastManualStopAttemptAt = DateTimeOffset.MinValue;
    private bool _closeConfirmed;
    private bool _sessionEnding;

    public MainWindow()
    {
        _pollClock.Start(DateTimeOffset.UtcNow);
        _lastPollAt = _pollClock.UtcNow;
        InitializeComponent();
        try { _configuration = AppConfiguration.Load(); }
        catch (Exception exception)
        {
            _configuration = new AppConfiguration("", "");
            AgentDiagnostics.Record("configuration-unreadable", AgentDiagnostics.Compact(exception.Message));
        }
        var version = GetVersion();
        var backend = _configuration.ProjectRef ?? "unconfigured";
        BuildIdentityText.Text = $"Agent v{version} · Backend {backend}" + (_configuration.UsesLanGateway ? $" · LAN {_configuration.GatewayUrl}" : "");
        AgentDiagnostics.Record("startup", $"version={version}; backend={_configuration.SupabaseUrl}");
        _pollTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(1) };
        _pollTimer.Tick += async (_, _) => await PollAsync();
        Loaded += async (_, _) => await RestoreSessionAsync();
        Closing += MainWindow_Closing;
    }

    // Closing the window must never silently stop (or keep) tracking. Ask, and
    // keep the agent running minimised unless the employee chooses to stop.
    private async void MainWindow_Closing(object? sender, CancelEventArgs e)
    {
        if (_closeConfirmed || _sessionEnding || _client is null) return;
        if (_activeSession is not null)
        {
            e.Cancel = true;
            var answer = MessageBox.Show(
                $"Mandala is tracking {_activeSession.ProjectName}.\n\nYes: stop tracking and close.\nNo: keep tracking and minimise this window.",
                "Stop tracking?", MessageBoxButton.YesNo, MessageBoxImage.Question);
            if (answer != MessageBoxResult.Yes)
            {
                WindowState = WindowState.Minimized;
                AgentDiagnostics.Record("close-kept-tracking", $"projectId={_activeSession.ProjectId}");
                return;
            }
            _autoResume.Cancel();
            _manualStopRequested = true;
            _lastManualStopAttemptAt = DateTimeOffset.MinValue;
            await ProcessManualStopAsync();
            if (_activeSession is null)
            {
                AgentDiagnostics.Record("close-after-stop", "Tracking stopped before closing.");
                _closeConfirmed = true;
                Close();
            }
            else
            {
                TrackerMessageText.Text = "Stopping… close Mandala again once it shows No active project.";
            }
            return;
        }
        if (_autoResume.IsPaused && _autoResume.Project is { } project)
        {
            e.Cancel = true;
            var answer = MessageBox.Show(
                $"Mandala is paused and will resume {project.Name} when you use this computer.\n\nYes: turn tracking off and close.\nNo: keep it ready and minimise this window.",
                "Turn tracking off?", MessageBoxButton.YesNo, MessageBoxImage.Question);
            if (answer != MessageBoxResult.Yes)
            {
                WindowState = WindowState.Minimized;
                return;
            }
            _autoResume.Cancel();
            AgentDiagnostics.Record("close-cancelled-resume", $"projectId={project.Id}");
            _closeConfirmed = true;
            Close();
        }
    }

    // Windows is shutting down or signing out: record the exact stop on this
    // computer (no dialogs, no network). It uploads when the agent next starts.
    public void SaveForShutdown()
    {
        _sessionEnding = true;
        try
        {
            _client?.SaveStopForShutdown();
            AgentDiagnostics.Record("session-ending-saved", _client?.LanDiagnosticSummary ?? "no client");
        }
        catch (Exception exception)
        {
            AgentDiagnostics.Record("session-ending-save-failure", AgentDiagnostics.Compact(exception.ToString()));
        }
    }

    private async Task RestoreSessionAsync()
    {
        _autoResume.Cancel();
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

        StoredSession? storedSession;
        try
        {
            _client = new SupabaseTimeTrackerClient(_configuration);
            storedSession = await _sessionStore.LoadAsync();
        }
        catch (Exception exception)
        {
            LoginMessageText.Text = ExtractMessage(exception, "Ask IT to check the LAN certificate and configuration.", "AGENT-LAN-CONFIG-001");
            SignInButton.IsEnabled = false;
            return;
        }

        if (storedSession is null)
        {
            return;
        }

        bool restored;
        try { restored = await _client.RestoreAsync(storedSession); }
        catch (Exception exception)
        {
            LoginMessageText.Text = ExtractMessage(exception, "Pending time could not be read. Preserve diagnostics for IT.", "AGENT-JOURNAL-001");
            return;
        }
        if (!restored)
        {
            LoginMessageText.Text = AgentDiagnostics.Format(
                "AGENT-AUTH-RESTORE-001",
                "The saved sign-in expired. Sign in again.");
            return;
        }

        SetSaving(true);
        try
        {
            await _sessionStore.SaveAsync(_client.GetStoredSession());
            ShowTracker();
            await LoadTrackerAsync();
        }
        finally { SetSaving(false); }
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

        _autoResume.Cancel();
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
            // Pause polling while the question is open, so idle saves and automatic
            // resume cannot run underneath it. A long-open question still counts as
            // idle time through the polling gap if the answer is No.
            MessageBoxResult confirmation;
            _pollTimer.Stop();
            try
            {
                confirmation = MessageBox.Show(
                    $"You are currently tracking {_activeSession!.ProjectName}. Do you want to stop it and start tracking {project.Name}?",
                    "Switch active project?",
                    MessageBoxButton.YesNo,
                    MessageBoxImage.Question);
            }
            finally { _pollTimer.Start(); }

            if (confirmation != MessageBoxResult.Yes)
            {
                return;
            }

            if (_isSaving || _wakeIdleStopPending || _manualStopRequested || _activeSession is null || _activeSession.ProjectId == project.Id)
            {
                TrackerMessageText.Text = "The timer changed while that question was open. Check the status above, then press Start Work again.";
                UpdateTrackerStatus();
                return;
            }
        }

        var previousProjectName = _activeSession?.ProjectName;
        _autoResume.Cancel();
        try
        {
            SetSaving(true);
            _trackerMessageState.ClearPersistent();
            var saveResult = await _client.StartAsync(project.Id, GetLocalDate(), switchingProject);
            _activeSession = _client.CurrentDesktopSession;
            _wakeIdleStopPending = false;
            // The previous session was stopped explicitly; don't treat the
            // question's open time as a polling gap for the new session.
            _lastPollAt = _pollClock.UtcNow;
            if (_activeSession?.ProjectId == project.Id)
            {
                _autoResume.Arm(_client.Email!, new TimeTrackerProject(_activeSession.ProjectId, _activeSession.ProjectName));
                AgentDiagnostics.Record("auto-resume-armed", $"projectId={project.Id}; email={_client.Email}");
            }
            await _sessionStore.SaveAsync(_client.GetStoredSession());
            if (switchingProject && saveResult is not null && previousProjectName is not null)
            {
                var confirmation = saveResult.Pending ? _client.PendingTimeMessage!
                    : saveResult.Superseded ? TrackerConfirmationMessages.Superseded()
                    : saveResult.TooShort ? TrackerConfirmationMessages.TooShort()
                    : TrackerConfirmationMessages.ProjectSwitch(
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
            await LoadTrackerAsync();
            TrackerMessageText.Text = ExtractMessage(exception, "Unable to start work.", "AGENT-START-001");
        }
        finally
        {
            SetSaving(false);
            await ProcessManualStopAsync();
        }
    }

    private async void StopButton_Click(object sender, RoutedEventArgs e)
    {
        _autoResume.Cancel();
        _manualStopRequested = true;
        _lastManualStopAttemptAt = DateTimeOffset.MinValue;
        AgentDiagnostics.Record("auto-resume-cancelled", "Explicit Stop; automatic tracking remains off until Start Work.");
        TrackerMessageText.Text = _trackerMessageState.ShowPersistent("Tracking stopped. Start Work to track again.");
        await ProcessManualStopAsync();
        UpdateTrackerStatus();
    }

    private async Task ProcessManualStopAsync()
    {
        if (!_manualStopRequested || _isSaving || _client is null) return;
        _activeSession ??= _client.CurrentDesktopSession;
        if (_activeSession is null)
        {
            // An uncertain start stays in the durable journal and is reconciled
            // as stopped. Cancelling intent must never discard that receipt.
            _manualStopRequested = false;
            _wakeIdleStopPending = false;
            return;
        }
        if (_pollClock.UtcNow - _lastManualStopAttemptAt < WakeNetworkGracePeriod) return;
        _lastManualStopAttemptAt = _pollClock.UtcNow;
        _manualStopRequested = !await StopTrackingAsync(false);
    }

    private async Task PollAsync()
    {
        if (_isPolling) return;
        _isPolling = true;
        try { await PollCoreAsync(); }
        finally
        {
            _isPolling = false;
            await ProcessManualStopAsync();
        }
    }

    private async Task PollCoreAsync()
    {
        var polledAt = _pollClock.UtcNow;
        var previousPollAt = _lastPollAt;
        var idleDuration = NativeIdleMonitor.GetIdleDuration();
        var currentInputTick = NativeIdleMonitor.GetLastInputTick();
        _autoResume.ObserveInput(currentInputTick, idleDuration);

        if (_client is null || _isSaving)
        {
            // Keep the previous poll time so a sleep during a save is still seen.
            return;
        }
        _lastPollAt = polledAt;

        if (_client.HasPendingSave &&
            _pollClock.UtcNow - _lastPendingSaveRetryAt >= TimeSpan.FromSeconds(10))
        {
            _lastPendingSaveRetryAt = _pollClock.UtcNow;
            try
            {
                SetSaving(true);
                var recovered = await _client.ReconcilePendingSaveAsync();
                if (recovered is not null)
                {
                    var confirmation = TrackerConfirmationMessages.Saved(recovered, _autoResume.IsPaused, true);
                    _trackerMessageState.ShowPersistent(confirmation);
                    AgentDiagnostics.Record(
                        "pending-save-confirmation-shown",
                        $"entryId={recovered.TimeEntryId}; message={AgentDiagnostics.Compact(confirmation)}");
                    await LoadTrackerAsync();
                }
                else await LoadTrackerAsync();
            }
            catch (Exception exception)
            {
                AgentDiagnostics.Record(
                    "pending-save-background-failure",
                    AgentDiagnostics.Compact(exception.ToString()));
                TrackerMessageText.Text = ExtractMessage(exception,
                    "Time is kept on this computer. Mandala has not accepted the upload yet; if this continues, use Copy diagnostics and send it to IT.",
                    "AGENT-PENDING-SAVE-001");
            }
            finally
            {
                SetSaving(false);
            }
        }

        if (_manualStopRequested)
        {
            await ProcessManualStopAsync();
            UpdateTrackerStatus();
            return;
        }

        if (_activeSession is null)
        {
            _wakeIdleStopPending = false;
            await TryAutoResumeAsync();
            UpdateTrackerStatus();
            return;
        }

        if (!_wakeIdleStopPending &&
            IdlePauseDecision.ShouldPause(idleDuration, previousPollAt, polledAt, IdleLimit))
        {
            _wakeIdleStopPending = true;
            _autoResume.Pause(_activeSession.ProjectId, currentInputTick, idleDuration);
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

        if (currentInputTick != _lastInputTick && _pollClock.UtcNow - _lastHeartbeatAt >= ActivityHeartbeatInterval)
        {
            _lastInputTick = currentInputTick;
            _lastHeartbeatAt = _pollClock.UtcNow;

            try
            {
                SetSaving(true);
                await _client.TouchAsync();
                await _sessionStore.SaveAsync(_client.GetStoredSession());
            }
            catch (DesktopSessionSupersededException superseded)
            {
                _autoResume.Cancel();
                _activeSession = null;
                TrackerMessageText.Text = _trackerMessageState.ShowPersistent(superseded.Message);
                AgentDiagnostics.Record("superseded-shown", superseded.Message);
            }
            catch (Exception exception)
            {
                TrackerMessageText.Text = ExtractMessage(exception, "Unable to record activity.", "AGENT-ACTIVITY-001");
            }
            finally { SetSaving(false); }
        }

        UpdateTrackerStatus();
    }

    private async Task TryAutoResumeAsync()
    {
        if (_client is null) return;
        var idleDuration = NativeIdleMonitor.GetIdleDuration();
        _autoResume.ObserveInput(NativeIdleMonitor.GetLastInputTick(), idleDuration);
        // Earlier time waiting for upload stays queued on this computer; it never
        // delays resuming.
        if (!_autoResume.CanAttempt(_client.Email, _pollClock.UtcNow, idleDuration,
            _activeSession is not null, _client.BlocksNewWork)) return;

        var project = _autoResume.Project!;
        var generation = _autoResume.BeginAttempt(_pollClock.UtcNow);
        AgentDiagnostics.Record("auto-resume-request", $"projectId={project.Id}; email={_client.Email}");
        try
        {
            SetSaving(true);
            // The owned desktop RPC rechecks project access and atomically
            // refuses any existing timer, even the same project on another PC.
            // Its new UUID/server timestamp never backfills the idle interval.
            await _client.StartAsync(project.Id, GetLocalDate(), false);
            _activeSession = _client.CurrentDesktopSession;
            if (_activeSession is null) return;
            if (!_autoResume.Complete(generation))
            {
                // Stop may be clicked while the request is in flight. Finish
                // that exact new session before returning to a stopped UI.
                _manualStopRequested = true;
                return;
            }
            ProjectComboBox.SelectedItem = ProjectComboBox.Items.Cast<TimeTrackerProject>()
                .FirstOrDefault(p => p.Id == project.Id);
            _lastInputTick = NativeIdleMonitor.GetLastInputTick();
            _lastHeartbeatAt = _pollClock.UtcNow;
            TrackerMessageText.Text = _trackerMessageState.ShowPersistent(TrackerConfirmationMessages.AutomaticResume(project.Name));
            AgentDiagnostics.Record("auto-resume-success", $"projectId={project.Id}; startedAt={_activeSession.StartedAt:O}");
            await _sessionStore.SaveAsync(_client.GetStoredSession());
        }
        catch (Exception exception)
        {
            // A lost response leaves its original UUID queued. Reconciliation
            // closes uncertain starts before another attempt can be made.
            var rejected = _client.CurrentDesktopSession is null &&
                (exception is AgentDiagnosticException || exception is System.Net.Http.HttpRequestException
                    { StatusCode: System.Net.HttpStatusCode.BadRequest or System.Net.HttpStatusCode.Unauthorized or System.Net.HttpStatusCode.Forbidden });
            if (rejected) _autoResume.Cancel();
            TrackerMessageText.Text = ExtractMessage(exception,
                rejected ? "Automatic resume stopped. Resolve the issue, then select a project and Start Work."
                    : "Tracking is paused. Mandala will retry when the connection is available and you are active.",
                "AGENT-AUTO-RESUME-001");
            AgentDiagnostics.Record(rejected ? "auto-resume-blocked" : "auto-resume-retry", AgentDiagnostics.Compact(exception.ToString()));
        }
        finally
        {
            SetSaving(false);
        }
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
            _activeSession = null;
            _wakeIdleStopPending = false;
            await _sessionStore.SaveAsync(_client.GetStoredSession());
            UpdateTrackerStatus();
            var confirmation = saveResult.Pending ? _client.PendingTimeMessage!
                : TrackerConfirmationMessages.Saved(saveResult, pausedForIdle, _autoResume.IsPaused);
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
            _lastHeartbeatAt = _pollClock.UtcNow;
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
            if (_client is not null) AgentDiagnostics.Record("desktop-journal-summary", _client.LanDiagnosticSummary);
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
        _lastPollAt = _pollClock.UtcNow;
    }

    private void UpdateTrackerStatus()
    {
        StartWorkButton.IsEnabled = !_isSaving && !_manualStopRequested && !_wakeIdleStopPending && _client?.BlocksNewWork != true;
        if (_autoResume.IsPaused && _autoResume.Project is { } project)
        {
            ActiveProjectText.Text = $"Paused {project.Name}";
            ElapsedText.Text = _wakeIdleStopPending
                ? "Saving time before automatic resume. Stop ends tracking."
                : _client?.HasPendingSave == true
                    ? "Resumes when you use this computer. Earlier time uploads when Mandala is reachable. Stop ends tracking."
                    : "Resumes when you use this computer. Stop ends tracking.";
            StopButton.IsEnabled = true;
            StartWorkButton.Content = "Start Work";
            StartWorkButton.IsEnabled = !_isSaving && !_wakeIdleStopPending && _client?.BlocksNewWork != true;
            return;
        }
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

        var elapsed = _client!.GetElapsed(_activeSession);
        ActiveProjectText.Text = $"Tracking {_activeSession.ProjectName}";
        ElapsedText.Text = $"{Math.Floor(elapsed.TotalHours):0}h {elapsed.Minutes:00}m active" +
            (_client.CurrentDesktopSession is not null && !_client.CurrentSessionIsConfirmed
                ? " · recorded on this computer, Mandala confirms when connected"
                : "");
        StopButton.IsEnabled = !_isSaving;
        if (_client.CurrentDesktopSession is null)
        {
            StartWorkButton.Content = "Stop first";
            StartWorkButton.IsEnabled = false;
            return;
        }
        StartWorkButton.Content = ProjectComboBox.SelectedItem is TimeTrackerProject selected && selected.Id != _activeSession.ProjectId
            ? "Start Work"
            : "Working";
    }

    private void SetSaving(bool isSaving)
    {
        _isSaving = isSaving;
        SignInButton.IsEnabled = !isSaving;
        UpdateTrackerStatus();
    }

    private static string GetLocalDate() => DateTime.Today.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

    private static string GetVersion() =>
        typeof(MainWindow).Assembly.GetName().Version?.ToString() ?? "unknown";

    private static string ExtractMessage(Exception exception, string fallback, string code) =>
        exception is AgentDiagnosticException diagnostic
            ? AgentDiagnostics.Format(diagnostic.Code, diagnostic.Message, diagnostic.InnerException)
            : AgentDiagnostics.Format(code, fallback, exception);
}
