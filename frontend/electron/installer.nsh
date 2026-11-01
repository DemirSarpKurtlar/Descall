!macro customHeader
  ; Custom installer header
!macroend

!macro customWelcomePage
  ; Show welcome page with app info
!macroend

!macro customInstallMode
  ; Allow user to choose install mode
!macroend

; --descall-clean=1 wipes the install dir before files are copied. The recovery
; launcher passes it when the updated exe never reaches JavaScript.
!macro customInit
  ${StdUtils.GetParameter} $R0 "descall-clean" ""
  ${if} $R0 == "1"
    StrLen $R1 $INSTDIR
    ${if} $R1 >= 10
      StrCpy $R1 $INSTDIR "" -8
      ${if} $R1 == "\Descall"
        DetailPrint "Clean reinstall: removing the previous Descall files"
        SetOutPath "$TEMP"
        RMDir /r "$INSTDIR"
        CreateDirectory "$INSTDIR"
        SetOutPath "$INSTDIR"
      ${endif}
    ${endif}
  ${endif}
!macroend

; QuitAndInstall used to start NSIS while Descall.exe still had ffmpeg.dll
; mapped. A stale or half-written DLL is Windows 0xc000007b. Wait until the
; image is gone, then let the file copy run.
;
; Do not shell out to cmd.exe, tasklist, or find.exe. A pipe such as
; `tasklist | find /I "Descall.exe"` opens a visible Windows Terminal window
; (title: find /I "Descall.exe") on every retry. Toolhelp32 is in-process.
; un. functions are only legal in the uninstaller compile.

!macro Descall_ImageRunning _ID
  ; $R0 = image name. Sets $R1 to 1 when that image is running. Preserves $R5.
  Push $R5
  Push $R6
  StrCpy $R1 0
  System::Call 'kernel32::CreateToolhelp32Snapshot(i 2, i 0) i.r2'
  IntCmp $R2 0 descall_ir_exit_${_ID}
  IntCmp $R2 -1 descall_ir_exit_${_ID}
  System::Alloc 1024
  Pop $R3
  System::Call '*$R3(i 556)'
  System::Call 'kernel32::Process32FirstW(i r2, i r3) i.r4'
  StrCmp $R4 0 descall_ir_close_${_ID}
  descall_ir_loop_${_ID}:
    System::Call '*$R3(i,i,i.r6,i,i,i,i,i,i,&w256.r5)'
    StrCmp $R5 $R0 descall_ir_yes_${_ID} descall_ir_next_${_ID}
  descall_ir_yes_${_ID}:
    StrCpy $R1 1
    Goto descall_ir_close_${_ID}
  descall_ir_next_${_ID}:
    System::Call 'kernel32::Process32NextW(i r2, i r3) i.r4'
    StrCmp $R4 0 descall_ir_close_${_ID} descall_ir_loop_${_ID}
  descall_ir_close_${_ID}:
    System::Free $R3
    System::Call 'kernel32::CloseHandle(i r2)'
  descall_ir_exit_${_ID}:
    Pop $R6
    Pop $R5
!macroend

!macro Descall_KillImage _ID
  ; Terminate every ${PRODUCT_FILENAME}.exe. Preserves $R5.
  Push $R5
  Push $R6
  Push $R7
  System::Call 'kernel32::CreateToolhelp32Snapshot(i 2, i 0) i.r2'
  IntCmp $R2 0 descall_ki_exit_${_ID}
  IntCmp $R2 -1 descall_ki_exit_${_ID}
  System::Alloc 1024
  Pop $R3
  System::Call '*$R3(i 556)'
  System::Call 'kernel32::Process32FirstW(i r2, i r3) i.r4'
  StrCmp $R4 0 descall_ki_close_${_ID}
  descall_ki_loop_${_ID}:
    System::Call '*$R3(i,i,i.r6,i,i,i,i,i,i,&w256.r5)'
    StrCmp $R5 "${PRODUCT_FILENAME}.exe" descall_ki_term_${_ID} descall_ki_next_${_ID}
  descall_ki_term_${_ID}:
    ; PROCESS_TERMINATE = 0x0001. A denied open is skipped.
    System::Call 'kernel32::OpenProcess(i 1, i 0, i r6) i.r7'
    IntCmp $R7 0 descall_ki_next_${_ID}
    System::Call 'kernel32::TerminateProcess(i r7, i 1) i.r4'
    System::Call 'kernel32::CloseHandle(i r7)'
  descall_ki_next_${_ID}:
    System::Call 'kernel32::Process32NextW(i r2, i r3) i.r4'
    StrCmp $R4 0 descall_ki_close_${_ID} descall_ki_loop_${_ID}
  descall_ki_close_${_ID}:
    System::Free $R3
    System::Call 'kernel32::CloseHandle(i r2)'
  descall_ki_exit_${_ID}:
    Pop $R7
    Pop $R6
    Pop $R5
!macroend

; Installer messages in the user's language. $LANGUAGE is the Windows language id the
; multi-language installer picked (electron-builder nsis.installerLanguages):
; 1055 tr, 1031 de, 1034 es, 1036 fr, 1046 pt-BR, 1049 ru, anything else English.
; Each macro leaves the text in $R9.
!macro Descall_Text_StillOpen
  StrCpy $R9 "Descall is still open. Close it, then retry the update."
  StrCmp $LANGUAGE 1055 0 +2
    StrCpy $R9 "Descall hâlâ açık. Kapatıp güncellemeyi yeniden dene."
  StrCmp $LANGUAGE 1031 0 +2
    StrCpy $R9 "Descall ist noch geöffnet. Schließe es und versuche das Update erneut."
  StrCmp $LANGUAGE 1034 0 +2
    StrCpy $R9 "Descall sigue abierto. Ciérralo y vuelve a intentar la actualización."
  StrCmp $LANGUAGE 1036 0 +2
    StrCpy $R9 "Descall est encore ouvert. Ferme-le, puis relance la mise à jour."
  StrCmp $LANGUAGE 1046 0 +2
    StrCpy $R9 "O Descall ainda está aberto. Feche-o e tente a atualização novamente."
  StrCmp $LANGUAGE 1049 0 +2
    StrCpy $R9 "Descall всё ещё открыт. Закройте его и повторите обновление."
!macroend

!macro Descall_Text_Damaged
  StrCpy $R9 "Descall could not finish the update because a program file is damaged or the wrong architecture (0xc000007b). Download a fresh installer."
  StrCmp $LANGUAGE 1055 0 +2
    StrCpy $R9 "Bir program dosyası bozuk ya da yanlış mimaride olduğu için Descall güncellemeyi tamamlayamadı (0xc000007b). Yeni bir kurulum dosyası indir."
  StrCmp $LANGUAGE 1031 0 +2
    StrCpy $R9 "Descall konnte das Update nicht abschließen, weil eine Programmdatei beschädigt ist oder die falsche Architektur hat (0xc000007b). Lade ein neues Installationsprogramm herunter."
  StrCmp $LANGUAGE 1034 0 +2
    StrCpy $R9 "Descall no pudo terminar la actualización porque un archivo del programa está dañado o es de otra arquitectura (0xc000007b). Descarga un instalador nuevo."
  StrCmp $LANGUAGE 1036 0 +2
    StrCpy $R9 "Descall n'a pas pu terminer la mise à jour : un fichier du programme est endommagé ou d'une autre architecture (0xc000007b). Télécharge un nouvel installateur."
  StrCmp $LANGUAGE 1046 0 +2
    StrCpy $R9 "O Descall não conseguiu concluir a atualização porque um arquivo do programa está danificado ou é de outra arquitetura (0xc000007b). Baixe um instalador novo."
  StrCmp $LANGUAGE 1049 0 +2
    StrCpy $R9 "Descall не удалось завершить обновление: файл программы повреждён или собран для другой архитектуры (0xc000007b). Скачайте новый установщик."
!macroend

!macro Descall_Text_Installing
  StrCpy $R9 "Installing Descall..."
  StrCmp $LANGUAGE 1055 0 +2
    StrCpy $R9 "Descall kuruluyor..."
  StrCmp $LANGUAGE 1031 0 +2
    StrCpy $R9 "Descall wird installiert..."
  StrCmp $LANGUAGE 1034 0 +2
    StrCpy $R9 "Instalando Descall..."
  StrCmp $LANGUAGE 1036 0 +2
    StrCpy $R9 "Installation de Descall..."
  StrCmp $LANGUAGE 1046 0 +2
    StrCpy $R9 "Instalando o Descall..."
  StrCmp $LANGUAGE 1049 0 +2
    StrCpy $R9 "Установка Descall..."
!macroend

!ifndef BUILD_UNINSTALLER
Function DescallWaitUntilClosed
  StrCpy $R5 0
  descallWaitApp:
    StrCpy $R0 "${PRODUCT_FILENAME}.exe"
    !insertmacro Descall_ImageRunning Inst
    StrCmp $R1 1 descallStillOpen descallAppStopped
  descallStillOpen:
    !insertmacro Descall_KillImage Inst
    Sleep 400
    IntOp $R5 $R5 + 1
    IntCmp $R5 25 descallGiveUp descallWaitApp descallGiveUp
  descallGiveUp:
    !insertmacro Descall_Text_StillOpen
    MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$R9" /SD IDCANCEL IDRETRY descallWaitApp
    Quit
  descallAppStopped:
    Sleep 800
FunctionEnd
!endif

!ifdef BUILD_UNINSTALLER
Function un.DescallWaitUntilClosed
  StrCpy $R5 0
  un.descallWaitApp:
    StrCpy $R0 "${PRODUCT_FILENAME}.exe"
    !insertmacro Descall_ImageRunning Un
    StrCmp $R1 1 un.descallStillOpen un.descallAppStopped
  un.descallStillOpen:
    !insertmacro Descall_KillImage Un
    Sleep 400
    IntOp $R5 $R5 + 1
    IntCmp $R5 25 un.descallGiveUp un.descallWaitApp un.descallGiveUp
  un.descallGiveUp:
    !insertmacro Descall_Text_StillOpen
    MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$R9" /SD IDCANCEL IDRETRY un.descallWaitApp
    Quit
  un.descallAppStopped:
    Sleep 800
FunctionEnd
!endif

!macro customCheckAppRunning
  !ifdef BUILD_UNINSTALLER
    Call un.DescallWaitUntilClosed
  !else
    Call DescallWaitUntilClosed
  !endif
!macroend

!macro customInstall
  ; Post-install actions
  !insertmacro Descall_Text_Installing
  DetailPrint "$R9"

  ; Descall.exe and ffmpeg.dll must both be x64 (machine 0x8664 = 34404).
  ; Electron 41 does not ship vcruntime140.dll; only reject it when it is present
  ; and not x64. A mismatch is the 0xc000007b dialog. Abort instead of launching.
  StrCpy $0 "$PLUGINSDIR\descall-pe.ps1"
  FileOpen $1 $0 w
  FileWrite $1 "$$ErrorActionPreference='Stop'$\r$\n"
  FileWrite $1 "function M([string]$$p) {$\r$\n"
  FileWrite $1 "  if (-not (Test-Path -LiteralPath $$p)) { return 0 }$\r$\n"
  FileWrite $1 "  $$fs=[IO.File]::Open($$p,'Open','Read','Read')$\r$\n"
  FileWrite $1 "  $$b=New-Object byte[] 4096$\r$\n"
  FileWrite $1 "  $$nread=$$fs.Read($$b,0,4096)$\r$\n"
  FileWrite $1 "  $$fs.Close()$\r$\n"
  FileWrite $1 "  if ($$nread -lt 64 -or $$b[0] -ne 77 -or $$b[1] -ne 90) { return 0 }$\r$\n"
  FileWrite $1 "  $$pe=[BitConverter]::ToInt32($$b,60)$\r$\n"
  FileWrite $1 "  if ($$pe -lt 0 -or ($$pe+6) -gt $$nread) { return 0 }$\r$\n"
  FileWrite $1 "  if ($$b[$$pe] -ne 80 -or $$b[$$pe+1] -ne 69) { return 0 }$\r$\n"
  FileWrite $1 "  return [BitConverter]::ToUInt16($$b,$$pe+4)$\r$\n"
  FileWrite $1 "}$\r$\n"
  FileWrite $1 "$$exe=M '$INSTDIR\${PRODUCT_FILENAME}.exe'$\r$\n"
  FileWrite $1 "$$ff=M '$INSTDIR\ffmpeg.dll'$\r$\n"
  FileWrite $1 "$$vc=M '$INSTDIR\vcruntime140.dll'$\r$\n"
  FileWrite $1 "if ($$exe -ne 34404 -or $$ff -ne 34404) { exit 1 }$\r$\n"
  FileWrite $1 "if ($$vc -ne 0 -and $$vc -ne 34404) { exit 1 }$\r$\n"
  FileWrite $1 "exit 0$\r$\n"
  FileClose $1
  nsExec::ExecToStack `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "$0"`
  Pop $0
  Pop $1
  ${if} $0 != 0
    !insertmacro Descall_Text_Damaged
    MessageBox MB_OK|MB_ICONSTOP "$R9"
    ExecShell "open" "https://github.com/DemirSarpKurtlar/Descall/releases/latest/download/Descall-Setup.exe"
    Abort
  ${endif}

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
    "Publisher" "Descall"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Descall" \
    "DisplayVersion" "${VERSION}"
!macroend

!macro customUnInstall
  ${ifNot} ${isUpdated}
    DetailPrint "Uninstall cleanup (not an update)"
    ; optional: do not even delete userData on real uninstall — deleteAppDataOnUninstall is false.
    ; Do NOT RMDir $APPDATA\Descall or $LOCALAPPDATA\Descall. Session must survive reinstalls/updates.
    DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Descall"
  ${endIf}
!macroend
