; Compiles to a genuine self-contained 64-bit Windows per-user installer.
Unicode true
Target amd64-unicode
RequestExecutionLevel user
SetCompressor /FINAL zlib
ManifestDPIAware true

!include "MUI2.nsh"

Name "Mark & Listen"
OutFile "${OUTPUT}"
InstallDir "$LOCALAPPDATA\Programs\Mark and Listen"
Icon "${ICON}"
UninstallIcon "${ICON}"
VIProductVersion "${APP_VERSION}"
VIAddVersionKey /LANG=1033 "ProductName" "Mark & Listen"
VIAddVersionKey /LANG=1033 "FileDescription" "Mark & Listen Setup"
VIAddVersionKey /LANG=1033 "ProductVersion" "${APP_VERSION}"
VIAddVersionKey /LANG=1033 "FileVersion" "${APP_VERSION}"

!define APP_ID "MarkAndListen"
!define UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "Mark & Listen 설치"
!define MUI_WELCOMEPAGE_TEXT "Windows 64비트용 Mark & Listen을 현재 사용자 계정에 설치합니다. 실행 중인 Mark & Listen이 있으면 먼저 닫아 주세요."
!define MUI_FINISHPAGE_RUN "$INSTDIR\Mark-and-Listen.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Mark & Listen 시작"
!define MUI_FINISHPAGE_RUN_NOTCHECKED

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Korean"
!insertmacro MUI_LANGUAGE "English"

Section "Mark & Listen"
  SetShellVarContext current
  SetRegView 64
  SetOutPath "$INSTDIR"
  File /r "${STAGE}/*"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateShortCut "$SMPROGRAMS\Mark & Listen.lnk" "$INSTDIR\Mark-and-Listen.exe" "" "$INSTDIR\resources\app\desktop\mark-and-listen.ico"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayName" "Mark & Listen"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayIcon" "$INSTDIR\resources\app\desktop\mark-and-listen.ico"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  SetShellVarContext current
  SetRegView 64
  ; Clean only installed product paths, never exam records or user-managed Codex.
  Delete "$SMPROGRAMS\Mark & Listen.lnk"
  DeleteRegKey HKCU "${UNINSTALL_KEY}"
  Delete "$INSTDIR\Mark-and-Listen.exe"
  Delete "$INSTDIR\Uninstall.exe"
  Delete "$INSTDIR\*.dll"
  Delete "$INSTDIR\*.pak"
  Delete "$INSTDIR\*.json"
  Delete "$INSTDIR\*.bin"
  Delete "$INSTDIR\*.dat"
  Delete "$INSTDIR\*.html"
  Delete "$INSTDIR\LICENSE*"
  Delete "$INSTDIR\version"
  Delete "$INSTDIR\README.md"
  RMDir /r "$INSTDIR\locales"
  RMDir /r "$INSTDIR\resources"
  RMDir "$INSTDIR"
SectionEnd
