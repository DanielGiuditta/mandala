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
    protected override void OnExit(ExitEventArgs e)
    {
        _instanceMutex?.Dispose();
        base.OnExit(e);
    }
}
