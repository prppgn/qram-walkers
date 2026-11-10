; Inno Setup script of the Windows installer; run through build.py, which defines
; AppVersion, SourceDir (the PyInstaller folder), OutputDir, OutputName and IconFile.
; Installs for the current user only: no administrator rights needed.

[Setup]
AppId={{6F1D4E0B-6C7E-4C55-9C8B-9A3E2B7F4A21}
AppName=qram-walkers
AppVersion={#AppVersion}
AppPublisher=The qram-walkers authors
AppPublisherURL=https://github.com/prppgn/qram-walkers
DefaultDirName={localappdata}\Programs\qram-walkers
DefaultGroupName=qram-walkers
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir={#OutputDir}
OutputBaseFilename={#OutputName}
SetupIconFile={#IconFile}
UninstallDisplayIcon={app}\qram-walkers.exe
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\qram-walkers"; Filename: "{app}\qram-walkers.exe"
Name: "{autodesktop}\qram-walkers"; Filename: "{app}\qram-walkers.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\qram-walkers.exe"; Description: "{cm:LaunchProgram,qram-walkers}"; Flags: nowait postinstall skipifsilent
