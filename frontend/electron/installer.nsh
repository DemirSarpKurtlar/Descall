!macro customHeader
  ; Custom installer header
!macroend

!macro customWelcomePage
  ; Show welcome page with app info
!macroend

!macro customInstallMode
  ; Allow user to choose install mode
!macroend

!macro customInstall
  ; Post-install actions
  DetailPrint "Installing Descall..."
  
  ; Create app data directory
  CreateDirectory "$LOCALAPPDATA\Descall"
  
  ; Write uninstall info
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Descall" \
    "DisplayName" "Descall"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Descall" \
    "DisplayIcon" "$INSTDIR\Descall.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Descall" \
    "UninstallString" "$INSTDIR\Uninstall Descall.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Descall" \
    "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Descall" \
    "Publisher" "Descall Team"
!macroend

!macro customUnInstall
  ${ifNot} ${isUpdated}
    DetailPrint "Uninstall cleanup (not an update)"
    ; optional: do not even delete userData on real uninstall — deleteAppDataOnUninstall is false.
    ; Do NOT RMDir $APPDATA\Descall or $LOCALAPPDATA\Descall. Session must survive reinstalls/updates.
    DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Descall"
  ${endIf}
!macroend
