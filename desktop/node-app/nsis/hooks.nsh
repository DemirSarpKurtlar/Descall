; Descall Node installer hooks (Tauri NSIS).
; Before an update or an uninstall the running node hands its users to Render first:
; "DescallNode.exe --stop" reaches the running instance (single instance), which drains
; (up to 10 s), stops the backend and cloudflared and exits.

!macro NSIS_HOOK_PREINSTALL
  IfFileExists "$INSTDIR\DescallNode.exe" 0 +3
    ExecWait '"$INSTDIR\DescallNode.exe" --stop'
    Sleep 1500
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  IfFileExists "$INSTDIR\DescallNode.exe" 0 +3
    ExecWait '"$INSTDIR\DescallNode.exe" --stop'
    Sleep 1500
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $UpdateMode <> 1
    ; Login auto-start. The DPAPI secrets and logs in %LOCALAPPDATA%\DescallNode stay unless
    ; the owner deletes them ("Gizlileri sil ve durdur" in the popover, or the folder).
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "DescallNode"
  ${EndIf}
!macroend
