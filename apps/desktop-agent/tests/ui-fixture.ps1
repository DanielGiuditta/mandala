# Isolated local accessibility fixture. No credentials, network or production time writes.
Add-Type -AssemblyName PresentationFramework
[xml]$xaml=@'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml" Title="Mandala Agent" Width="500" Height="400"><StackPanel>
<TextBlock x:Name="SignedInAsText" Text="Signed in as fixture@example.test"/>
<ComboBox x:Name="ProjectComboBox"><ComboBoxItem>A</ComboBoxItem><ComboBoxItem>B</ComboBoxItem></ComboBox>
<Button x:Name="StartWorkButton">Start Work</Button><Button x:Name="StopButton">Stop</Button>
<TextBlock x:Name="ActiveProjectText" Text="No active project"/><TextBlock x:Name="TrackerMessageText"/>
<Button x:Name="CopyDiagnosticsButton">Save / copy diagnostics for IT</Button>
</StackPanel></Window>
'@
$window=[Windows.Markup.XamlReader]::Load([Xml.XmlNodeReader]::new($xaml))
$combo=$window.FindName('ProjectComboBox');$active=$window.FindName('ActiveProjectText');$message=$window.FindName('TrackerMessageText')
$window.FindName('StartWorkButton').Add_Click({
 $name=$combo.SelectedItem.Content
 if($active.Text -ne 'No active project' -and $active.Text -ne ('Tracking '+$name)){
  if([Windows.MessageBox]::Show('Confirm switch?','Switch active project?','YesNo','Question') -ne 'Yes'){return}
 }
 $active.Text='Tracking '+$name
})
$window.FindName('StopButton').Add_Click({$active.Text='No active project';$message.Text='Time saved successfully. Reference: fixture'})
$window.ShowDialog()|Out-Null
