using System.Globalization;
using System.Windows;
using System.Windows.Threading;

namespace Mandala.Agent;

public partial class MainWindow : Window
{
    private static readonly TimeSpan IdleLimit = TimeSpan.FromMinutes(5);
    private static readonly TimeSpan ActivityHeartbeatInterval = TimeSpan.FromSeconds(15);

    private readonly AppConfiguration _configuration = AppConfiguration.Load();
    private readonly SecureSessionStore _sessionStore = new();
    private readonly DispatcherTimer _pollTimer;
    private SupabaseTimeTrackerClient? _client;
    private ActiveWorkSession? _activeSession;
    private uint _lastInputTick;
    private DateTimeOffset _lastHeartbeatAt = DateTimeOffset.MinValue;
    private bool _isSaving;

    public MainWindow()
    {
        InitializeComponent();
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
            await _sessionStore.SaveAsync(_client.GetStoredSession());
            PasswordBox.Clear();
            ShowTracker();
            await LoadTrackerAsync();
        }
        catch (Exception exception)
        {
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

        try
        {
            SetSaving(true);
            await _client.StartAsync(project.Id, GetLocalDate(), switchingProject);
            await _sessionStore.SaveAsync(_client.GetStoredSession());
            await LoadTrackerAsync();
        }
        catch (Exception exception)
        {
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
        if (_client is null || _activeSession is null || _isSaving)
        {
            return;
        }

        var idleDuration = NativeIdleMonitor.GetIdleDuration();
        if (idleDuration >= IdleLimit)
        {
            await StopTrackingAsync(true);
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

    private async Task StopTrackingAsync(bool pausedForIdle)
    {
        if (_client is null || _activeSession is null || _isSaving)
        {
            return;
        }

        try
        {
            SetSaving(true);
            await _client.StopAsync(GetLocalDate());
            await _sessionStore.SaveAsync(_client.GetStoredSession());
            _activeSession = null;
            UpdateTrackerStatus();
            TrackerMessageText.Text = pausedForIdle
                ? "Timer paused after 5 minutes without Windows activity. Start Work to resume."
                : string.Empty;
        }
        catch (Exception exception)
        {
            TrackerMessageText.Text = ExtractMessage(exception, "Unable to stop work.", "AGENT-STOP-001");
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

            TrackerMessageText.Text = snapshot.Warning
                ?? (snapshot.Projects.Count == 0
                    ? AgentDiagnostics.Format(
                        "AGENT-PROJECTS-EMPTY",
                        "Mandala returned no active projects. Ask your admin to confirm this agent is connected to the same workspace as the web app.")
                    : string.Empty);

            _lastInputTick = NativeIdleMonitor.GetLastInputTick();
            _lastHeartbeatAt = DateTimeOffset.UtcNow;
            UpdateTrackerStatus();
        }
        catch (Exception exception)
        {
            TrackerMessageText.Text = ExtractMessage(exception, "Unable to load the time tracker.", "AGENT-LOAD-001");
        }
    }

    private void ShowTracker()
    {
        LoginPanel.Visibility = Visibility.Collapsed;
        TrackerPanel.Visibility = Visibility.Visible;
        var version = typeof(MainWindow).Assembly.GetName().Version?.ToString() ?? "unknown";
        SignedInAsText.Text = _client?.Email is { Length: > 0 } email
            ? $"Signed in as {email} · Agent v{version}"
            : $"Agent v{version}";
        _pollTimer.Start();
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
        StartWorkButton.IsEnabled = !isSaving;
        StopButton.IsEnabled = !isSaving && _activeSession is not null;
    }

    private static string GetLocalDate() => DateTime.Today.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

    private static string ExtractMessage(Exception exception, string fallback, string code) =>
        exception is AgentDiagnosticException diagnostic
            ? AgentDiagnostics.Format(diagnostic.Code, diagnostic.Message, diagnostic.InnerException)
            : AgentDiagnostics.Format(code, fallback, exception);
}
