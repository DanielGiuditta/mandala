using Mandala.Agent;

internal static class IdleAutoResumeChecks
{
    private const string Email = "employee@example.test";
    private static readonly TimeTrackerProject Project = new("a", "Project A");
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-10-13T08:00:00Z");
    private static readonly TimeSpan Idle = TimeSpan.FromMinutes(5);
    private static readonly TimeSpan Active = TimeSpan.FromSeconds(1);

    public static void Run()
    {
        StartupAndProjectSelectionDoNotArmWork();
        InputDuringSaveAndRetryIsRetained();
        SleepAndInputTickWrapCanResume();
        StopOrAccountChangeInvalidatesInFlightWork();
        RepeatedIdleCyclesRequireFreshActivity();
        Console.WriteLine("PASS: automatic resume requires explicit work intent, current identity, returning Windows activity and a confirmed prior save; stop cancellation, retry, sleep and input-clock wrap are covered");
    }

    private static void StartupAndProjectSelectionDoNotArmWork()
    {
        var state = new IdleAutoResumeState();
        state.Pause(Project.Id, 100, Idle);
        state.ObserveInput(101, Active);
        Check(!CanAttempt(state) && state.Project is null && !state.IsPaused,
            "startup, restored credentials or an observed server timer cannot create work intent");

        state.Arm(Email, Project);
        state.ObserveInput(102, Active);
        Check(!CanAttempt(state) && !state.IsPaused, "arming an active session does not start a second timer");
        state.Pause("b", 102, Idle);
        Check(!state.IsPaused && state.Project == Project,
            "another selected or opened project cannot pause or replace the confirmed working project");

        state.Pause(Project.Id, 102, Idle);
        state.ObserveInput(103, Active);
        Check(CanAttempt(state) && state.Project == Project, "resume retains the explicitly started project");
        Check(!CanAttempt(state, hasActiveSession: true), "a currently active timer prevents a second start");
    }

    private static void InputDuringSaveAndRetryIsRetained()
    {
        var state = Paused();
        Check(!CanAttempt(state), "a freshly saved idle session does not resume without returning input");
        state.ObserveInput(100, Active);
        Check(!CanAttempt(state), "polling the same Windows input does not invent new activity");

        state.ObserveInput(101, Active);
        Check(!CanAttempt(state, hasPendingSave: true), "input during a pending save never overlaps sessions");
        Check(CanAttempt(state), "input received during saving remains usable after the save is confirmed");
        state.BeginAttempt(Now);
        state.ObserveInput(102, Active);
        Check(!CanAttempt(state, now: Now.AddSeconds(9)), "a failed start is not retried every poll");
        Check(CanAttempt(state, now: Now.AddSeconds(10)), "returning input remains latched through retry backoff");
        Check(!CanAttempt(state, now: Now.AddMinutes(6), idleDuration: Idle),
            "a latched return cannot restart work after the employee becomes idle again");
        state.ObserveInput(103, Active);
        Check(CanAttempt(state, now: Now.AddMinutes(6)), "fresh activity can restart after an outage and another idle period");
    }

    private static void SleepAndInputTickWrapCanResume()
    {
        var state = new IdleAutoResumeState();
        state.Arm(Email, Project);
        state.Pause(Project.Id, 500, Active);
        Check(!CanAttempt(state, hasPendingSave: true), "wake input waits until pre-sleep time is saved");
        Check(CanAttempt(state), "unlock input already seen at a long polling gap resumes without a second keystroke");

        state = Paused(uint.MaxValue - 2);
        state.ObserveInput(3, Active);
        Check(CanAttempt(state), "Windows input-clock wrap still detects returning input");
        state = Paused(100);
        state.ObserveInput(101, Idle);
        Check(!CanAttempt(state), "an old changed input tick with five minutes of inactivity does not resume");
    }

    private static void StopOrAccountChangeInvalidatesInFlightWork()
    {
        var state = Ready();
        var generation = state.BeginAttempt(Now);
        state.Cancel();
        Check(!state.Complete(generation) && !CanAttempt(state) && state.Project is null,
            "explicit stop during an in-flight start cannot re-enable automatic work");
        state.ObserveInput(900, Active);
        Check(!CanAttempt(state, now: Now.AddHours(1)), "input following explicit stop never restarts work");

        state = Ready();
        generation = state.BeginAttempt(Now);
        Check(!CanAttempt(state, email: "different@example.test") && state.Project is null,
            "an account change cancels the previous employee's intent");
        Check(!state.Complete(generation), "an old account's in-flight completion cannot resume work");

        state = Ready();
        generation = state.BeginAttempt(Now);
        Check(!state.CanAttempt(null, Now, Active, false, false) && !state.Complete(generation),
            "sign-out invalidates an in-flight resume");

        state = Ready();
        generation = state.BeginAttempt(Now);
        var nextProject = new TimeTrackerProject("b", "Project B");
        state.Arm(Email, nextProject);
        state.Pause(nextProject.Id, 600, Active);
        Check(!state.Complete(generation) && state.IsPaused && state.Project == nextProject,
            "completion from a canceled interval cannot consume a newly started project's pause");
    }

    private static void RepeatedIdleCyclesRequireFreshActivity()
    {
        var state = Ready();
        Check(state.Complete(state.BeginAttempt(Now)), "first returning input resumes");
        Check(!state.IsPaused && !CanAttempt(state), "a successful resume consumes the pending return");
        state.Pause(Project.Id, 200, Idle);
        Check(!CanAttempt(state, now: Now.AddMinutes(10)), "a second idle cycle cannot reuse the first return");
        state.ObserveInput(201, Active);
        Check(CanAttempt(state, now: Now.AddMinutes(10)), "a second independent return resumes the same project");
        Check(state.Complete(state.BeginAttempt(Now.AddMinutes(10))), "a second resume completes");
        Check(!state.Complete(state.BeginAttempt(Now.AddMinutes(11))), "completion without a pause is not another resume");
    }

    private static IdleAutoResumeState Paused(uint inputTick = 100)
    {
        var state = new IdleAutoResumeState();
        state.Arm(Email, Project);
        state.Pause(Project.Id, inputTick, Idle);
        return state;
    }

    private static IdleAutoResumeState Ready()
    {
        var state = Paused();
        state.ObserveInput(101, Active);
        return state;
    }

    private static bool CanAttempt(IdleAutoResumeState state, DateTimeOffset? now = null,
        TimeSpan? idleDuration = null, bool hasActiveSession = false, bool hasPendingSave = false,
        string email = Email) => state.CanAttempt(email, now ?? Now, idleDuration ?? Active, hasActiveSession, hasPendingSave);

    private static void Check(bool condition, string scenario)
    {
        if (!condition) throw new InvalidOperationException("Auto-resume regression: " + scenario);
    }
}
