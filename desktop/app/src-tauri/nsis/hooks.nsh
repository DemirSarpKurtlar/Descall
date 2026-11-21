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

!macro NSIS_HOOK_POSTINSTALL
  ; Tauri's template already names the shortcuts "Descall.lnk" (same as electron-builder)
  ; and stamps the AppUserModelID = bundle identifier = com.descall.app. The shortcut's
  ; System.AppUserModel.ToastActivatorCLSID is written by the app on first start
  ; (IPropertyStore, src/shell_identity.rs) because Tauri ships no WinShell plugin.
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
