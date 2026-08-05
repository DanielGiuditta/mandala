#define AppName "Mandala Agent"
#define AppVersion GetEnv("MANDALA_AGENT_VERSION")

[Setup]
AppId={{F2E1F144-4E47-4E47-8206-163C6BCA6D89}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
VersionInfoVersion={#AppVersion}.0
VersionInfoProductVersion={#AppVersion}
DefaultDirName={autopf}\Mandala Agent
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
OutputDir=..\release
OutputBaseFilename=MandalaAgentSetup-{#AppVersion}
Compression=lzma
SolidCompression=yes
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64compatible
CloseApplications=force
RestartApplications=no

[Files]
Source: "..\publish\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\src\Mandala.Agent\agent.config.json"; DestDir: "{commonappdata}\Mandala Agent"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\Mandala Agent"; Filename: "{app}\Mandala.Agent.exe"
Name: "{commonstartup}\Mandala Agent"; Filename: "{app}\Mandala.Agent.exe"

[Run]
Filename: "{app}\Mandala.Agent.exe"; Description: "Launch Mandala Agent"; Flags: nowait postinstall skipifsilent
