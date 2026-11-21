; Tauri NSIS installer hooks (bundle.windows.nsis.installerHooks).
; Keeps the Electron-era shell identity so pins, toasts and Task Manager settings survive.
; Keep in sync with frontend/electron/premium/toastIdentity.cjs and installer.nsh.
!define DESCALL_AUMID "com.descall.app"
!define DESCALL_TOAST_CLSID "{BCF5A315-F914-4A7E-95BD-313CBE4B661B}"
; Capture helper next to Descall.exe (bundle.externalBin, tauri.capture-host.conf.json). It
; lives in Descall's kill-on-close job and normally exits with the app; if one is still
; running (a share being torn down) its file would be locked during update or uninstall.
!define DESCALL_CAPTURE_HOST "descall-capture-host.exe"

!macro DESCALL_STOP_CAPTURE_HOST
  Push $0 ; keep the template's $0
  nsExec::Exec 'taskkill /F /IM "${DESCALL_CAPTURE_HOST}"'
  Pop $0 ; exit code (128 = none running)
  Pop $0
!macroend

!macro NSIS_HOOK_PREINSTALL
  ; The migrator passes /D=<old InstallLocation> so Descall.exe keeps its path. The old files
  ; were moved to <dir>.legacy by the migrator before we run.
  !insertmacro DESCALL_STOP_CAPTURE_HOST
!macroend

; System.AppUserModel.ToastActivatorCLSID on a shortcut (port of installer.nsh
; Descall_SetToastClsid): IShellLinkW -> IPersistFile::Load -> IPropertyStore::SetValue
; (PKEY_AppUserModel_ToastActivatorCLSID, VT_CLSID) -> Commit -> IPersistFile::Save. Windows
; only hands a reply typed into a toast to a closed Descall through this activator; Tauri's
; template writes the AppUserModelID but not this property, and re-creates the .lnk on every
; install and update.
!macro DESCALL_SET_TOAST_CLSID LNK
  Push $0
  Push $1
  Push $2
  Push $3
  Push $4
  Push $5
  Push $6
  ${If} ${FileExists} "${LNK}"
    System::Call 'ole32::CoCreateInstance(g "{00021401-0000-0000-C000-000000000046}", p 0, i 1, g "{000214F9-0000-0000-C000-000000000046}", *p .r1) i .r0'
    ${If} $0 = 0
      System::Call '$1->0(g "{0000010b-0000-0000-C000-000000000046}", *p .r2) i .r0'
      ${If} $0 = 0
        System::Call '$2->5(w "${LNK}", i 2) i .r0'
        ${If} $0 = 0
          System::Call '$1->0(g "{886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99}", *p .r3) i .r0'
          ${If} $0 = 0
            System::Call '*(g "{9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3}", i 26) p .r4'
            System::Call '*(g "${DESCALL_TOAST_CLSID}") p .r5'
            System::Call '*(&i2 72, &i2 0, &i2 0, &i2 0, p r5, p 0) p .r6'
            System::Call '$3->6(p r4, p r6) i .r0'
            ${If} $0 = 0
              System::Call '$3->7() i .r0'
            ${EndIf}
            System::Free $6
            System::Free $5
            System::Free $4
            System::Call '$3->2()'
          ${EndIf}
          System::Call '$2->6(p 0, i 1) i .r0'
        ${EndIf}
        System::Call '$2->2()'
      ${EndIf}
      System::Call '$1->2()'
    ${EndIf}
  ${EndIf}
  Pop $6
  Pop $5
  Pop $4
  Pop $3
  Pop $2
  Pop $1
  Pop $0
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; Tauri's template already names the shortcuts "Descall.lnk" (same as electron-builder)
  ; and stamps the AppUserModelID = bundle identifier = com.descall.app; the toast activator
  ; CLSID is added here (startMenuFolder is "", so the link sits directly in $SMPROGRAMS).
  !insertmacro DESCALL_SET_TOAST_CLSID "$SMPROGRAMS\Descall.lnk"
  WriteRegStr HKCU "Software\Classes\CLSID\${DESCALL_TOAST_CLSID}" "" "Descall"
  WriteRegStr HKCU "Software\Classes\CLSID\${DESCALL_TOAST_CLSID}\LocalServer32" "" '"$INSTDIR\Descall.exe" --toast-activated'
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  !insertmacro DESCALL_STOP_CAPTURE_HOST
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ; An update (the updater runs the new installer with /UPDATE, which runs this uninstaller
  ; with /UPDATE first) must keep the user's "Start with Windows" choice and the toast
  ; activator: before, every update silently turned auto-start off. Only a real uninstall
  ; removes them.
  ${If} $UpdateMode <> 1
    DeleteRegKey HKCU "Software\Classes\CLSID\${DESCALL_TOAST_CLSID}"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${DESCALL_AUMID}"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "${DESCALL_AUMID}"
  ${EndIf}
!macroend
