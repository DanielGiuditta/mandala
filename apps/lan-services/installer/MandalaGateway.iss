#define AppVersion GetEnv("MANDALA_GATEWAY_VERSION")
[Setup]
AppId={{B0FFDDDA-A8CE-4B2E-97FA-654BD72551EB}
AppName=Mandala Gateway
AppVersion={#AppVersion}
AppVerName=Mandala Gateway {#AppVersion}
VersionInfoVersion={#AppVersion}.0
DefaultDirName={autopf}\Mandala Gateway
DefaultGroupName=Mandala Gateway
DisableProgramGroupPage=yes
OutputDir=..\release
OutputBaseFilename=MandalaGatewaySetup-{#AppVersion}
Compression=lzma
SolidCompression=yes
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
CloseApplications=yes
RestartApplications=no
[Files]
Source: "..\publish\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
[Icons]
Name: "{autoprograms}\Mandala Gateway"; Filename: "{app}\start-gateway.cmd"; WorkingDir: "{app}"
Name: "{autoprograms}\Mandala Gateway setup instructions"; Filename: "{app}\START-HERE.txt"
