# Drive only the verified Agent process through its public Windows accessibility UI.
# No credential reads, journal decoding, injected app code, or direct time-write API.
Add-Type -AssemblyName UIAutomationClient,UIAutomationTypes
Add-Type -ReferencedAssemblies UIAutomationClient,UIAutomationTypes -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Automation;
public static class MandalaTestInput {
  [StructLayout(LayoutKind.Sequential)] struct LASTINPUT { public uint size; public uint time; }
  [DllImport("user32.dll")] static extern bool GetLastInputInfo(ref LASTINPUT info);
  [DllImport("user32.dll")] static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
  [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
  [DllImport("kernel32.dll")] static extern uint SetThreadExecutionState(uint flags);
  public static uint LastInput() { var x = new LASTINPUT {size=8}; if(!GetLastInputInfo(ref x)) throw new Exception("Windows input state unavailable."); return x.time; }
  public static bool Cancelled() { return (GetAsyncKeyState(27) & 0x8000)!=0; }
  public static void Pulse() { mouse_event(1,1,0,0,UIntPtr.Zero); mouse_event(1,unchecked((uint)-1),0,0,UIntPtr.Zero); }
  public static void Awake(bool on) { SetThreadExecutionState(on ? 0x80000003u : 0x80000000u); }
  private static Timer promptActivity;
  private static int promptActivityFailed;
  public static bool PromptActivityActive { get { return promptActivity != null; } }
  public static void BeginPromptActivity() { BeginPromptActivity(600000); }
  public static void BeginPromptActivity(int maximumMilliseconds) {
    EndPromptActivity(); Interlocked.Exchange(ref promptActivityFailed, 0);
    var deadline=DateTime.UtcNow.AddMilliseconds(maximumMilliseconds);
    promptActivity = new Timer(_ => {
      try {
        if(Interlocked.CompareExchange(ref promptActivityFailed,0,0)!=0 || DateTime.UtcNow >= deadline || Cancelled()) { Interlocked.Exchange(ref promptActivityFailed,1); return; }
        var before=LastInput(); Pulse(); Thread.Sleep(100);
        if(LastInput()==before) Interlocked.Exchange(ref promptActivityFailed, 1);
      } catch { Interlocked.Exchange(ref promptActivityFailed, 1); }
    }, null, 0, 5000);
  }
  public static bool EndPromptActivity() {
    var timer=Interlocked.Exchange(ref promptActivity, null);
    if(timer!=null) using(var stopped=new ManualResetEvent(false)) { if(timer.Dispose(stopped)) stopped.WaitOne(); }
    return Interlocked.CompareExchange(ref promptActivityFailed,0,0)==0;
  }
  public static Task Invoke(AutomationElement element) { var p=(InvokePattern)element.GetCurrentPattern(InvokePattern.Pattern); return Task.Run(()=>p.Invoke()); }
}
'@
function Wait-Ui($Description,[scriptblock]$Condition,[int]$Seconds=45) {
    $until=[DateTimeOffset]::UtcNow.AddSeconds($Seconds)
    do {
        if([MandalaTestInput]::Cancelled()){throw 'Escape pressed. Test stopped; existing work preserved.'}
        $value=& $Condition
        if($value){return $value}
        Start-Sleep -Milliseconds 400
    } while([DateTimeOffset]::UtcNow -lt $until)
    throw ('Timed out: '+$Description+'. Do not repeat uncertain saves; return the report.')
}
function Get-AgentRoot {
    $process=Get-Process -Id $script:AgentProcessId -ErrorAction Stop
    Require ($process.Path -eq $script:AgentPath) 'Agent process identity changed.'
    $root=[Windows.Automation.AutomationElement]::RootElement.FindFirst([Windows.Automation.TreeScope]::Children,[Windows.Automation.AndCondition]::new([Windows.Automation.PropertyCondition]::new([Windows.Automation.AutomationElement]::ProcessIdProperty,[int]$script:AgentProcessId),[Windows.Automation.PropertyCondition]::new([Windows.Automation.AutomationElement]::NameProperty,'Mandala Agent')))
    Require $root 'Agent window is unavailable. Keep the employee desktop unlocked.'
    return $root
}
function Find-AgentControl($Id) {
    (Get-AgentRoot).FindFirst([Windows.Automation.TreeScope]::Descendants,[Windows.Automation.PropertyCondition]::new([Windows.Automation.AutomationElement]::AutomationIdProperty,$Id))
}
function Get-AgentControl($Id) { $control=Find-AgentControl $Id; Require ($null -ne $control) ('Expected Agent control unavailable: '+$Id); return $control }
function Get-AgentText($Id) { (Get-AgentControl $Id).Current.Name }
function Invoke-AgentButton($Id,[switch]$Async) {
    $control=Get-AgentControl $Id
    Require ($control.Current.IsEnabled -and -not $control.Current.IsOffscreen) ('Agent action unavailable: '+$Id)
    $task=[MandalaTestInput]::Invoke($control)
    if($Async){return $task}
    Wait-Ui ('button '+$Id) {$task.IsCompleted}|Out-Null
    $task.GetAwaiter().GetResult()
}
function Get-AgentProjects {
    $combo=Get-AgentControl 'ProjectComboBox'
    $expand=[Windows.Automation.ExpandCollapsePattern]$combo.GetCurrentPattern([Windows.Automation.ExpandCollapsePattern]::Pattern)
    $expand.Expand()
    try {
        Start-Sleep -Milliseconds 300
        $items=$combo.FindAll([Windows.Automation.TreeScope]::Descendants,[Windows.Automation.PropertyCondition]::new([Windows.Automation.AutomationElement]::ControlTypeProperty,[Windows.Automation.ControlType]::ListItem))
        @($items|ForEach-Object {$_.Current.Name})
    } finally {$expand.Collapse()}
}
function Select-AgentProject($Name) {
    $combo=Get-AgentControl 'ProjectComboBox'
    $expand=[Windows.Automation.ExpandCollapsePattern]$combo.GetCurrentPattern([Windows.Automation.ExpandCollapsePattern]::Pattern)
    $expand.Expand()
    try {
        Start-Sleep -Milliseconds 200
        $matches=@($combo.FindAll([Windows.Automation.TreeScope]::Descendants,[Windows.Automation.PropertyCondition]::new([Windows.Automation.AutomationElement]::ControlTypeProperty,[Windows.Automation.ControlType]::ListItem))|Where-Object {$_.Current.Name -ceq $Name})
        Require ($matches.Count -eq 1) 'Selected project name must identify exactly one allowed project.'
        ([Windows.Automation.SelectionItemPattern]$matches[0].GetCurrentPattern([Windows.Automation.SelectionItemPattern]::Pattern)).Select()
    } finally {$expand.Collapse()}
}
function Confirm-AgentSwitch([bool]$Yes) {
    $dialog=Wait-Ui 'project-switch confirmation' {
        [Windows.Automation.AutomationElement]::RootElement.FindFirst([Windows.Automation.TreeScope]::Descendants,[Windows.Automation.AndCondition]::new(
            [Windows.Automation.PropertyCondition]::new([Windows.Automation.AutomationElement]::ProcessIdProperty,[int]$script:AgentProcessId),
            [Windows.Automation.PropertyCondition]::new([Windows.Automation.AutomationElement]::NameProperty,'Switch active project?')))
    } 15
    # Standard Windows MessageBox IDs: IDYES=6, IDNO=7 (locale-independent).
    $id=if($Yes){'6'}else{'7'}
    $button=$dialog.FindFirst([Windows.Automation.TreeScope]::Descendants,[Windows.Automation.PropertyCondition]::new([Windows.Automation.AutomationElement]::AutomationIdProperty,$id))
    Require $button 'Expected Yes/No switch control unavailable; no default confirmation made.'
    $task=[MandalaTestInput]::Invoke($button)
    Wait-Ui 'switch dialog response' {$task.IsCompleted} 15|Out-Null
    $task.GetAwaiter().GetResult()
}
function Wait-AgentState($Text,[int]$Seconds=60) { Wait-Ui ('Agent state '+$Text) {(Get-AgentText 'ActiveProjectText') -ceq $Text} $Seconds|Out-Null }
function Start-AgentProject($Name) {
    Require ((Get-AgentText 'ActiveProjectText') -ceq 'No active project') 'Existing work found. Do not let the test alter a real work session.'
    Select-AgentProject $Name
    Invoke-AgentButton 'StartWorkButton'
    Wait-AgentState ('Tracking '+$Name)
}
function Wait-TestActivity([int]$Seconds=125) {
    $end=[DateTimeOffset]::UtcNow.AddSeconds($Seconds)
    while([DateTimeOffset]::UtcNow -lt $end) {
        if([MandalaTestInput]::Cancelled()){throw 'Escape pressed. Test stopped; report preserved.'}
        Write-Progress -Activity 'Automatic Mandala timer check' -Status ('Leave this PC unlocked; '+[int]($end-[DateTimeOffset]::UtcNow).TotalSeconds+' seconds remaining')
        $before=[MandalaTestInput]::LastInput();[MandalaTestInput]::Pulse();Start-Sleep -Milliseconds 100
        Require ([MandalaTestInput]::LastInput() -ne $before) 'Test input did not reach Windows. Keep the same desktop unlocked; no test result assumed.'
        Start-Sleep -Seconds 5
    }
    [MandalaTestInput]::Pulse();Start-Sleep -Seconds 3
    Write-Progress -Activity 'Automatic Mandala timer check' -Completed
}
function Close-TestAgent {
    $process=Get-Process -Id $script:AgentProcessId -ErrorAction Stop
    Require ($process.Path -eq $script:AgentPath) 'Refusing to close a different process.'
    Require ($process.CloseMainWindow()) 'Agent did not accept a normal window close.'
    Require ($process.WaitForExit(15000)) 'Agent did not close normally; it has not been force-killed.'
}
function Attach-TestAgent {
    $running=@(Get-Process -Name 'Mandala.Agent' -ErrorAction SilentlyContinue|Where-Object {$_.SessionId -eq (Get-Process -Id $PID).SessionId})
    Require ($running.Count -eq 1 -and $running[0].Path -eq $script:AgentPath) 'Expected exactly one verified employee Agent in this Windows session.'
    $script:AgentProcessId=$running[0].Id
    Wait-Ui 'Agent window' {try {Get-AgentRoot}catch {$null}} 30|Out-Null
}
