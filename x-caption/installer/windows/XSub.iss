; XSub Windows installer definition (Inno Setup 6+)
#define MyAppName "XSub"
#define MyAppVersion "0.1.0"
#define MyAppPublisher "Billy YT Sin"
#define MyAppExeName "XSub.exe"

[Setup]
AppId={{2F7ED2B2-5F8E-4B37-A795-38FF3393025F}}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={localappdata}\Programs\{#MyAppName}
DefaultGroupName={#MyAppName}
PrivilegesRequired=lowest
DisableProgramGroupPage=yes
OutputDir=.
OutputBaseFilename=XSub-Setup
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
ArchitecturesInstallIn64BitMode=x64
UninstallDisplayIcon={app}\{#MyAppExeName}
SetupIconFile=msi_installer.ico

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
; Payload prepared via installer\windows\prepare_layout.ps1
Source: "..\..\build\windows\stage\XSub\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Additional icons:"; Flags: unchecked

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Launch {#MyAppName}"; Flags: nowait postinstall skipifsilent
