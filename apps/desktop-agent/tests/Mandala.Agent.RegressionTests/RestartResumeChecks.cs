using Mandala.Agent;

// Agent 1.0.18: after an unexpected restart (for example a power cut), the last
// explicitly started project resumes only after real keyboard or mouse input,
// for the same Windows user and Mandala account, on the same local day.
internal static class RestartResumeChecks
{
    private const string Email = "employee@example.test";
    private const string Today = "2026-10-26";
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-10-26T05:00:00Z");
    private static readonly TimeSpan Idle = TimeSpan.FromMinutes(5);
    private static readonly TimeSpan Active = TimeSpan.FromSeconds(1);

    public static void Run()
    {
        OnlyTheSameAccountOnTheSameDayResumes();
        StoredIntentSurvivesARestartAndStopDeletesIt();
        AnUnreadableIntentNeverBlocksTheAgent();
        ResumeWaitsForNewInputAfterTheRestart();
        StopOrAnotherAccountCancelsARestartResume();
        Console.WriteLine("PASS: restart resume needs the same account, the same day and new keyboard/mouse input after the restart; Stop, another account, another day or an unreadable file prevent it");
    }

    private static void OnlyTheSameAccountOnTheSameDayResumes()
    {
        var intent = new RestartResumeIntent(Email, "a", "Project A", Today);
        Check(RestartResumeDecision.ProjectToResume(intent, Email, Today) is { Id: "a", Name: "Project A" }, "same account, same day resumes the last started project");
        Check(RestartResumeDecision.ProjectToResume(intent, "EMPLOYEE@example.test", Today) is { Id: "a" }, "account match ignores letter case");
        Check(RestartResumeDecision.ProjectToResume(intent, "other@example.test", Today) is null, "another Mandala account never resumes this employee's project");
        Check(RestartResumeDecision.ProjectToResume(intent, null, Today) is null, "nobody signed in: no resume");
        Check(RestartResumeDecision.ProjectToResume(intent, Email, "2026-10-27") is null, "a restart on a later day does not resume");
        Check(RestartResumeDecision.ProjectToResume(null, Email, Today) is null, "no stored intent: no resume");
        Check(RestartResumeDecision.ProjectToResume(intent with { ProjectId = "" }, Email, Today) is null, "an intent without a project does not resume");
    }

    private static void StoredIntentSurvivesARestartAndStopDeletesIt()
    {
        WithStore(directory =>
        {
            var intent = new RestartResumeIntent(Email, "a", "Project A", Today);
            new RestartResumeIntentStore(directory, protect: false).Save(intent);
            var afterRestart = new RestartResumeIntentStore(directory, protect: false);
            Check(afterRestart.Load() == intent, "the last started project is still known after the process restarts");
            afterRestart.Save(intent with { ProjectId = "b", ProjectName = "Project B" });
            Check(afterRestart.Load() is { ProjectId: "b" }, "a later explicit Start replaces the earlier project");
            afterRestart.Clear();
            Check(new RestartResumeIntentStore(directory, protect: false).Load() is null, "explicit Stop deletes it, so a later restart does not resume");
            afterRestart.Clear();
        });
    }

    private static void AnUnreadableIntentNeverBlocksTheAgent()
    {
        WithStore(directory =>
        {
            Directory.CreateDirectory(directory);
            var file = Path.Combine(directory, "resume-intent.dat");
            File.WriteAllText(file, "not json");
            Check(new RestartResumeIntentStore(directory, protect: false).Load() is null, "an unreadable file means no resume, without an error");
            Check(!File.Exists(file), "the unreadable file is removed");
        });
    }

    private static void ResumeWaitsForNewInputAfterTheRestart()
    {
        var project = new TimeTrackerProject("a", "Project A");
        var state = new IdleAutoResumeState();
        state.ArmAfterRestart(Email, project, inputTick: 500);
        Check(state.IsPaused && state.AfterRestart && state.Project == project, "restart arms a paused resume for the stored project");
        Check(!CanAttempt(state), "nothing starts without new input, even if the employee was active just before Mandala started");
        state.ObserveInput(500, Active);
        Check(!CanAttempt(state), "re-reading the same Windows input does not count");
        state.ObserveInput(501, Idle);
        Check(!CanAttempt(state, idleDuration: Idle), "input that is already five minutes old does not resume");
        state.ObserveInput(502, Active);
        Check(!CanAttempt(state, hasActiveSession: true), "an already running session prevents a second one");
        Check(CanAttempt(state), "new keyboard or mouse input resumes");
        Check(!CanAttempt(state, now: Now, idleDuration: Idle), "the five-minute idle rule still applies after the restart");
        Check(state.Complete(state.BeginAttempt(Now)) && !state.IsPaused && !state.AfterRestart, "the resume completes once and clears the restart flag");
        state.Pause("a", 600, Idle);
        Check(state.IsPaused && !state.AfterRestart, "a later idle pause is an ordinary idle pause");
    }

    private static void StopOrAnotherAccountCancelsARestartResume()
    {
        var state = new IdleAutoResumeState();
        state.ArmAfterRestart(Email, new TimeTrackerProject("a", "Project A"), 500);
        var generation = state.BeginAttempt(Now);
        state.Cancel();
        state.ObserveInput(501, Active);
        Check(!state.Complete(generation) && !CanAttempt(state, now: Now.AddMinutes(1)) && state.Project is null && !state.AfterRestart,
            "Stop while waiting after a restart cancels it, including an attempt in flight");

        state = new IdleAutoResumeState();
        state.ArmAfterRestart(Email, new TimeTrackerProject("a", "Project A"), 500);
        state.ObserveInput(501, Active);
        Check(!CanAttempt(state, email: "other@example.test") && state.Project is null, "a different signed-in account cancels the restart resume");
    }

    private static void WithStore(Action<string> test)
    {
        var directory = Path.Combine(Path.GetTempPath(), "mandala-restart-resume-" + Guid.NewGuid());
        try { test(directory); }
        finally { if (Directory.Exists(directory)) Directory.Delete(directory, true); }
    }

    private static bool CanAttempt(IdleAutoResumeState state, DateTimeOffset? now = null, TimeSpan? idleDuration = null,
        bool hasActiveSession = false, bool hasPendingSave = false, string email = Email) =>
        state.CanAttempt(email, now ?? Now.AddSeconds(30), idleDuration ?? Active, hasActiveSession, hasPendingSave);

    private static void Check(bool condition, string scenario)
    {
        if (!condition) throw new InvalidOperationException("Restart-resume regression: " + scenario);
    }
}
