using System.Windows;
using System.Security.Principal;
using System.Threading;

namespace Mandala.Agent;

public partial class App : Application
{
    private Mutex? _instanceMutex;
    protected override void OnStartup(StartupEventArgs e)
    {
        // Two processes must never overwrite the same user's durable time journal.
        var identity = WindowsIdentity.GetCurrent().User?.Value ?? Environment.UserName;
        _instanceMutex = new Mutex(true, $"Global\\MandalaAgent-{identity}", out var created);
        if (!created)
        {
            MessageBox.Show("Mandala Agent is already running for this Windows user.", "Mandala Agent");
            Shutdown();
            return;
        }
        base.OnStartup(e);
    }
    // Sign-out, restart or shutdown: record the exact stop on this computer
    // before Windows ends the process. It uploads on the next start.
    protected override void OnSessionEnding(SessionEndingCancelEventArgs e)
    {
        (MainWindow as MainWindow)?.SaveForShutdown();
        base.OnSessionEnding(e);
    }

    protected override void OnExit(ExitEventArgs e)
    {
        _instanceMutex?.Dispose();
        base.OnExit(e);
    }
}
