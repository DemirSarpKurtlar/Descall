; Tauri NSIS installer hooks (bundle.windows.nsis.installerHooks).
; Keeps the Electron-era shell identity so pins, toasts and Task Manager settings survive.
; Keep in sync with frontend/electron/premium/toastIdentity.cjs and installer.nsh.
!define DESCALL_AUMID "com.descall.app"
!define DESCALL_TOAST_CLSID "{BCF5A315-F914-4A7E-95BD-313CBE4B661B}"

!macro NSIS_HOOK_PREINSTALL
  ; The migrator passes /D=<old InstallLocation> so Descall.exe keeps its path. Nothing else
  ; to do here: the old files were moved to <dir>.legacy by the migrator before we run.
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; Tauri's template already names the shortcuts "Descall.lnk" (same as electron-builder)
  ; and stamps the AppUserModelID = bundle identifier = com.descall.app. The shortcut's
  ; System.AppUserModel.ToastActivatorCLSID is written by the app on first start
  ; (IPropertyStore, src/shell_identity.rs) because Tauri ships no WinShell plugin.
  WriteRegStr HKCU "Software\Classes\CLSID\${DESCALL_TOAST_CLSID}\LocalServer32" "" '"$INSTDIR\Descall.exe" --toast-activated'
!macroend

!macro NSIS_HOOK_PREUNINSTALL
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  DeleteRegKey HKCU "Software\Classes\CLSID\${DESCALL_TOAST_CLSID}"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${DESCALL_AUMID}"
!macroend
