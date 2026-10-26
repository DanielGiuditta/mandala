namespace Mandala.Agent;

// Intent belongs to the signed-in employee. Restoring credentials, choosing a
// dropdown item or recovering a journal never arms automatic work by itself;
// from 1.0.18 the last explicit Start is also kept on this computer
// (RestartResumeIntent) and re-armed after an unexpected restart.
internal sealed class IdleAutoResumeState
{
    private static readonly TimeSpan IdleLimit = TimeSpan.FromMinutes(5);
    private string? _email;
    private uint _inputAtPause;
    private bool _activityReturned;
    private DateTimeOffset _retryAt;
    private int _generation;

    public TimeTrackerProject? Project { get; private set; }
    public bool IsPaused { get; private set; }
    // True while waiting to resume after an unexpected restart (for example a
    // power cut), until that resume completes or intent is cancelled.
    public bool AfterRestart { get; private set; }

    public void Arm(string email, TimeTrackerProject project)
    {
        Cancel();
        _email = email;
        Project = project;
    }

    // After an unexpected restart: resume the restored project only after new
    // keyboard or mouse input. Input before this moment, such as signing in to
    // Windows before Mandala started, does not count.
    public void ArmAfterRestart(string email, TimeTrackerProject project, uint inputTick)
    {
        Arm(email, project);
        IsPaused = true;
        AfterRestart = true;
        _inputAtPause = inputTick;
        _activityReturned = false;
        _retryAt = DateTimeOffset.MinValue;
    }

    public void Cancel()
    {
        _generation++;
        Project = null;
        _email = null;
        IsPaused = false;
        AfterRestart = false;
        _activityReturned = false;
        _retryAt = DateTimeOffset.MinValue;
    }

    public void Pause(string projectId, uint inputTick, TimeSpan idleDuration)
    {
        if (Project?.Id != projectId) return;
        IsPaused = true;
        AfterRestart = false;
        _inputAtPause = inputTick;
        // Unlock input may already have reset Windows idle time when a long
        // polling gap reveals sleep. Do not require another input after saving.
        _activityReturned = idleDuration < IdleLimit;
        _retryAt = DateTimeOffset.MinValue;
    }

    public void ObserveInput(uint inputTick, TimeSpan idleDuration)
    {
        if (IsPaused && inputTick != _inputAtPause && idleDuration < IdleLimit)
            _activityReturned = true;
    }

    public bool CanAttempt(string? email, DateTimeOffset now, TimeSpan idleDuration,
        bool hasActiveSession, bool hasPendingSave)
    {
        if (!string.Equals(_email, email, StringComparison.OrdinalIgnoreCase)) Cancel();
        return IsPaused && Project is not null && _activityReturned && idleDuration < IdleLimit
            && now >= _retryAt && !hasActiveSession && !hasPendingSave;
    }

    public int BeginAttempt(DateTimeOffset now)
    {
        _retryAt = now.AddSeconds(10);
        return _generation;
    }

    public bool Complete(int generation)
    {
        if (generation != _generation || !IsPaused) return false;
        IsPaused = false;
        AfterRestart = false;
        _activityReturned = false;
        return true;
    }
}
