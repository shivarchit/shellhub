!define APPNAME "ShellHub"
!define COMPANYNAME "Shivarchit"
!define DESCRIPTION "Lightweight web-based SSH client and server management tool."
!define VERSIONMAJOR 0
!define VERSIONMINOR 1
!define VERSIONBUILD 2

!include "MUI2.nsh"

Name "${APPNAME}"
OutFile "dist\shellhub-windows-amd64-setup.exe"
InstallDir "$PROGRAMFILES64\${APPNAME}"
InstallDirRegKey HKCU "Software\${APPNAME}" ""

RequestExecutionLevel admin

!define MUI_ABORTWARNING
!define MUI_ICON "..\assets\shellhub.ico"
!define MUI_UNICON "..\assets\shellhub.ico"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_WELCOME
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH

!insertmacro MUI_LANGUAGE "English"

Section "Install"
  SetOutPath "$INSTDIR"
  File "dist\shellhub-windows-amd64.exe"
  
  WriteRegStr HKCU "Software\${APPNAME}" "" $INSTDIR
  WriteUninstaller "$INSTDIR\uninstall.exe"
  
  ; Shortcuts
  CreateShortcut "$SMPROGRAMS\${APPNAME}.lnk" "$INSTDIR\shellhub-windows-amd64.exe" "" "$INSTDIR\shellhub-windows-amd64.exe" 0
  CreateShortcut "$DESKTOP\${APPNAME}.lnk" "$INSTDIR\shellhub-windows-amd64.exe" "" "$INSTDIR\shellhub-windows-amd64.exe" 0
SectionEnd

Section "Uninstall"
  Delete "$INSTDIR\shellhub-windows-amd64.exe"
  Delete "$INSTDIR\uninstall.exe"
  RMDir "$INSTDIR"
  
  Delete "$SMPROGRAMS\${APPNAME}.lnk"
  Delete "$DESKTOP\${APPNAME}.lnk"
  DeleteRegKey HKCU "Software\${APPNAME}"
SectionEnd
