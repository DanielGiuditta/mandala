using System.Runtime.InteropServices;

namespace Mandala.Agent;

public static class NativeIdleMonitor
{
    [StructLayout(LayoutKind.Sequential)]
    private struct LastInputInfo
    {
        public uint Size;
        public uint Time;
    }

    [DllImport("user32.dll")]
    private static extern bool GetLastInputInfo(ref LastInputInfo lastInputInfo);

    public static uint GetLastInputTick()
    {
        var inputInfo = new LastInputInfo { Size = (uint)Marshal.SizeOf<LastInputInfo>() };
        return GetLastInputInfo(ref inputInfo) ? inputInfo.Time : unchecked((uint)Environment.TickCount);
    }

    public static TimeSpan GetIdleDuration()
    {
        var currentTick = unchecked((uint)Environment.TickCount);
        var lastInputTick = GetLastInputTick();
        return TimeSpan.FromMilliseconds(unchecked(currentTick - lastInputTick));
    }
}
