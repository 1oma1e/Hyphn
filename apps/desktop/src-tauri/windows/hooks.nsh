; Hooks of the Hyphn installer (Tauri NSIS, installMode perMachine): the
; Windows webcam and the OBS source come with the app, in the same single
; admin prompt (ADR-0022). The app lives in Program Files, which the camera
; service (Local Service) can read, so the DLL is registered where it is.

!define HYPHN_CLSID "SOFTWARE\Classes\CLSID\{10FA7DA4-A7FE-49E4-B4E9-1A77EDCFEB6E}"

!macro NSIS_HOOK_POSTINSTALL
  Push $0
  ; 64-bit registry view: the camera service is 64-bit.
  SetRegView 64
  WriteRegStr HKLM "${HYPHN_CLSID}" "" "Hyphn"
  WriteRegStr HKLM "${HYPHN_CLSID}\InprocServer32" "" "$INSTDIR\native\hyphn_vcam.dll"
  WriteRegStr HKLM "${HYPHN_CLSID}\InprocServer32" "ThreadingModel" "Both"
  ReadEnvStr $0 PROGRAMDATA
  ; Diagnostic log folder: only the camera service writes, everyone reads.
  CreateDirectory "$0\Hyphn"
  nsExec::Exec 'icacls "$0\Hyphn" /inheritance:r /grant:r *S-1-5-18:(OI)(CI)F *S-1-5-32-544:(OI)(CI)F *S-1-5-19:(OI)(CI)M *S-1-5-32-545:(OI)(CI)RX'
  Pop $0
  ; OBS source, if OBS is installed.
  IfFileExists "$PROGRAMFILES64\obs-studio\bin\64bit\obs64.exe" 0 hyphn_no_obs
    Push $0
    ReadEnvStr $0 PROGRAMDATA
    CreateDirectory "$0\obs-studio\plugins\hyphn-obs\bin\64bit"
    CopyFiles /SILENT "$INSTDIR\native\hyphn-obs.dll" "$0\obs-studio\plugins\hyphn-obs\bin\64bit"
    Pop $0
  hyphn_no_obs:
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  Push $0
  SetRegView 64
  DeleteRegKey HKLM "${HYPHN_CLSID}"
  ReadEnvStr $0 PROGRAMDATA
  Delete /REBOOTOK "$0\obs-studio\plugins\hyphn-obs\bin\64bit\hyphn-obs.dll"
  RMDir /r "$0\obs-studio\plugins\hyphn-obs"
  RMDir /r "$0\Hyphn"
  Pop $0
!macroend
