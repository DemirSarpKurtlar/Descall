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

; DescallSetup.exe (desktop/crates/descall-setup) installs into its own folder (default
; %LOCALAPPDATA%\Programs\Descall) and writes Uninstall\Descall itself, with UninstallString
; `"<dir>\uninstall.exe" --uninstall` but without the template's Software\Descall\Descall
; install-location value. When the Tauri updater then runs this installer with /UPDATE, the
; template's .onInit falls back to $LOCALAPPDATA\Descall: a second copy was installed and
; started, while the Start menu, desktop and login entries kept starting the old folder (which
; downloaded and installed the update again on every start). Only in /UPDATE mode (there the
; template never starts the old uninstaller, PageLeaveReinstall `reinst_done`, so the folder is
; intact; a manual reinstall may be removing it), only for that exact DescallSetup entry:
; install over its folder, which from then on is a template install.
!macro DESCALL_ADOPT_SETUP_FOLDER
  ${If} $UpdateMode = 1
    Push $0
    Push $1
    ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCTNAME}" "InstallLocation"
    ReadRegStr $1 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCTNAME}" "UninstallString"
    ${If} $0 != ""
    ${AndIf} $1 == '"$0\uninstall.exe" --uninstall'
    ${AndIf} $0 != $INSTDIR
    ${AndIf} ${FileExists} "$0\${MAINBINARYNAME}.exe"
      ; SetOutPath already created the template's default folder: drop it if still empty.
      RMDir "$INSTDIR"
      StrCpy $INSTDIR $0
      SetOutPath $INSTDIR
    ${EndIf}
    Pop $1
    Pop $0
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREINSTALL
  ; The migrator passes /D=<old InstallLocation> so Descall.exe keeps its path. The old files
  ; were moved to <dir>.legacy by the migrator before we run.
  !insertmacro DESCALL_STOP_CAPTURE_HOST
  !insertmacro DESCALL_ADOPT_SETUP_FOLDER
!macroend

; System.AppUserModel.ToastActivatorCLSID on a shortcut (port of installer.nsh
; Descall_SetToastClsid): IShellLinkW -> IPersistFile::Load -> IPropertyStore::SetValue
; (PKEY_AppUserModel_ToastActivatorCLSID, VT_CLSID) -> Commit -> IPersistFile::Save. Windows
; only hands a reply typed into a toast to a closed Descall through this activator; Tauri's
; template writes the AppUserModelID but not this property. It creates the .lnk on a fresh
; install only (an /UPDATE run keeps the existing one, whose stamp survives), and on a
; migration it retargets the Electron link instead (tauri-bundler 2.10 installer.nsi
; CreateOrUpdateStartMenuShortcut), so the property is written on every install.
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
  ; An uninstall that is part of an update (/UPDATE: tauri-bundler 2.10 only passes it on the
  ; WiX migration path, older templates on every update) must keep the user's "Start with
  ; Windows" choice and the toast activator. Only a real uninstall removes them. $UpdateMode is the template's own variable (tauri-bundler 2.10 installer.nsi:
  ; `Var UpdateMode`, set from /UPDATE in un.onInit; the template guards its own Run value and
  ; shortcut removal the same way).
  ${If} $UpdateMode <> 1
    DeleteRegKey HKCU "Software\Classes\CLSID\${DESCALL_TOAST_CLSID}"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${DESCALL_AUMID}"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "${DESCALL_AUMID}"
    ; descall:// needs nothing here: tauri-cli passes plugins.deep-link to the bundler, whose
    ; template writes it on install and removes it on uninstall when it points at $INSTDIR.
  ${EndIf}
!macroend
