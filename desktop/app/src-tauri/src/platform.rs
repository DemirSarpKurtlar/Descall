//! Small Windows reads the shell needs (Electron got them from powerMonitor, nativeTheme,
//! app.getPreferredSystemLanguages, setLoginItemSettings and tasklist.exe). Every function
//! has a harmless non-Windows fallback so the crate still type-checks elsewhere.

/// Milliseconds since the last keyboard / mouse input (powerMonitor.getSystemIdleTime).
pub fn system_idle_ms() -> u64 {
    #[cfg(windows)]
    unsafe {
        use windows::Win32::System::SystemInformation::GetTickCount64;
        use windows::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};
        let mut lii = LASTINPUTINFO { cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32, dwTime: 0 };
        if GetLastInputInfo(&mut lii).as_bool() {
            // dwTime is a 32-bit tick: compare in the 32-bit domain (wraps every 49.7 days).
            let now = GetTickCount64() as u32;
            return now.wrapping_sub(lii.dwTime) as u64;
        }
        0
    }
    #[cfg(not(windows))]
    0
}

/// The process AppUserModelID, before the first window (Electron toastIdentity.cjs
/// app.setAppUserModelId). Same id as the Start Menu shortcut, the Run value and the toasts
/// (descall_setup::layout::APP_ID, premium/toast.rs). Without it only a start from that
/// shortcut carried the id: Descall started by Windows at sign-in (Run key), by an update, by
/// a toast or a descall:// link got a second taskbar button next to the pinned one, and its
/// overlay badge and thumbnail buttons sat on that second button.
pub fn set_app_user_model_id() {
    #[cfg(windows)]
    unsafe {
        use windows::core::w;
        use windows::Win32::UI::Shell::SetCurrentProcessExplicitAppUserModelID;
        if let Err(e) = SetCurrentProcessExplicitAppUserModelID(w!("com.descall.app")) {
            log::warn!("[shell] AppUserModelID not set: {e}");
        }
    }
}

/// Lock screen up (powerMonitor 'lock-screen'): the input desktop cannot be opened for
/// switching while Winlogon's secure desktop is active.
pub fn session_locked() -> bool {
    #[cfg(windows)]
    unsafe {
        use windows::Win32::System::StationsAndDesktops::{CloseDesktop, OpenInputDesktop, DESKTOP_CONTROL_FLAGS, DESKTOP_SWITCHDESKTOP};
        match OpenInputDesktop(DESKTOP_CONTROL_FLAGS(0), false, DESKTOP_SWITCHDESKTOP) {
            Ok(h) => {
                let _ = CloseDesktop(h);
                false
            }
            Err(_) => true,
        }
    }
    #[cfg(not(windows))]
    false
}

const PERSONALIZE: &str = r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize";

/// Settings > Personalization > Colors > Transparency effects off.
pub fn reduced_transparency() -> bool {
    #[cfg(windows)]
    {
        windows_registry::CURRENT_USER.open(PERSONALIZE).and_then(|k| k.get_u32("EnableTransparency")).map(|v| v == 0).unwrap_or(false)
    }
    #[cfg(not(windows))]
    {
        let _ = PERSONALIZE;
        false
    }
}

/// Blocks until a value under the Personalize key changes (RegNotifyChangeKeyValue: no
/// polling, the thread sleeps in the kernel). False when the key cannot be watched; the
/// caller then falls back to a slow poll.
pub fn wait_personalize_change() -> bool {
    #[cfg(windows)]
    unsafe {
        use windows::Win32::Foundation::ERROR_SUCCESS;
        use windows::Win32::System::Registry::{RegCloseKey, RegNotifyChangeKeyValue, RegOpenKeyExW, HKEY, HKEY_CURRENT_USER, KEY_NOTIFY, REG_NOTIFY_CHANGE_LAST_SET};
        let path = windows_core::HSTRING::from(PERSONALIZE);
        let mut key = HKEY::default();
        if RegOpenKeyExW(HKEY_CURRENT_USER, &path, None, KEY_NOTIFY, &mut key) != ERROR_SUCCESS {
            return false;
        }
        let r = RegNotifyChangeKeyValue(key, false, REG_NOTIFY_CHANGE_LAST_SET, None, false);
        let _ = RegCloseKey(key);
        r == ERROR_SUCCESS
    }
    #[cfg(not(windows))]
    {
        false
    }
}

/// OS UI languages, most preferred first ("tr-TR", "en-US"), plus the user locale.
pub fn os_languages() -> Vec<String> {
    #[allow(unused_mut)]
    let mut out = Vec::new();
    #[cfg(windows)]
    unsafe {
        use windows::core::PWSTR;
        use windows::Win32::Globalization::{GetUserDefaultLocaleName, GetUserPreferredUILanguages, MUI_LANGUAGE_NAME};
        let mut n = 0u32;
        let mut len = 0u32;
        if GetUserPreferredUILanguages(MUI_LANGUAGE_NAME, &mut n, None, &mut len).is_ok() && len > 0 {
            let mut buf = vec![0u16; len as usize];
            if GetUserPreferredUILanguages(MUI_LANGUAGE_NAME, &mut n, Some(PWSTR(buf.as_mut_ptr())), &mut len).is_ok() {
                for part in buf.split(|c| *c == 0).filter(|p| !p.is_empty()) {
                    out.push(String::from_utf16_lossy(part));
                }
            }
        }
        let mut name = [0u16; 85];
        let n = GetUserDefaultLocaleName(&mut name);
        if n > 1 {
            out.push(String::from_utf16_lossy(&name[..(n - 1) as usize]));
        }
    }
    out
}

/// Windows time zone key name ("Turkey Standard Time"); i18n accepts it like Europe/Istanbul.
pub fn time_zone() -> String {
    #[cfg(windows)]
    {
        use windows::Win32::System::Time::{GetDynamicTimeZoneInformation, DYNAMIC_TIME_ZONE_INFORMATION};
        let mut tz = DYNAMIC_TIME_ZONE_INFORMATION::default();
        unsafe { GetDynamicTimeZoneInformation(&mut tz) };
        let key = &tz.TimeZoneKeyName;
        let end = key.iter().position(|c| *c == 0).unwrap_or(key.len());
        String::from_utf16_lossy(&key[..end])
    }
    #[cfg(not(windows))]
    String::new()
}

const RUN: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
const STARTUP_APPROVED_RUN: &str = r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run";

/// Login auto-start: the Run value exists and Task Manager has not disabled it
/// (StartupApproved\Run first byte 0x03 = disabled by the user).
pub fn autostart_enabled() -> bool {
    #[cfg(windows)]
    {
        use descall_shell::launch::RUN_VALUE;
        let present = windows_registry::CURRENT_USER.open(RUN).and_then(|k| k.get_string(RUN_VALUE)).is_ok();
        let disabled = windows_registry::CURRENT_USER
            .open(STARTUP_APPROVED_RUN)
            .and_then(|k| k.get_value(RUN_VALUE))
            .map(|v| v.first().copied() == Some(0x03))
            .unwrap_or(false);
        present && !disabled
    }
    #[cfg(not(windows))]
    {
        let _ = (RUN, STARTUP_APPROVED_RUN);
        false
    }
}

/// The current Run value data (`"C:\...\Descall.exe" --autostart --hidden`), if any.
pub fn autostart_command() -> Option<String> {
    #[cfg(windows)]
    {
        windows_registry::CURRENT_USER.open(RUN).and_then(|k| k.get_string(descall_shell::launch::RUN_VALUE)).ok()
    }
    #[cfg(not(windows))]
    {
        None
    }
}

/// ensureAutostartLoginItem (main.cjs): the first start turns login auto-start on once, a Run
/// value of this exe without the hidden args is rewritten, and a decision the user (or the
/// Electron app before the migration) made is never undone.
pub fn ensure_autostart(app_data: &std::path::Path, electron_user_data: Option<&std::path::Path>, migrated: bool) {
    use descall_shell::launch::{autostart_launch_action, AutostartAction, AUTOSTART_MARKER_FILE};
    let marker = app_data.join(AUTOSTART_MARKER_FILE);
    let marker_exists = marker.exists();
    let electron_decided = migrated || electron_user_data.is_some_and(|d| d.join(AUTOSTART_MARKER_FILE).exists());
    // Only a value that starts this exe is ours to rewrite (an old Electron path is not).
    let exe = std::env::current_exe().ok().map(|p| p.to_string_lossy().to_lowercase());
    let current = autostart_command().filter(|cmd| exe.as_deref().is_some_and(|e| cmd.to_lowercase().contains(e)));
    let action = autostart_launch_action(marker_exists, electron_decided, current.as_deref());
    if action != AutostartAction::None {
        log::info!("[boot] login item: {action:?}");
        set_autostart(true);
    }
    if !marker_exists {
        let _ = std::fs::write(&marker, crate::state::now_ms().to_string());
    }
}

/// Updater relaunch of a window that was minimized: on the taskbar, minimized, without taking
/// the focus (SW_SHOWMINNOACTIVE; main.cjs showInactive() then minimize()). show() is
/// SW_SHOW: it activated Descall over the game or app the user was in, for a moment.
pub fn show_minimized_inactive<R: tauri::Runtime>(w: &tauri::WebviewWindow<R>) {
    #[cfg(windows)]
    {
        if let Some(h) = w.hwnd().ok().map(|h| h.0 as isize) {
            use windows::Win32::Foundation::HWND;
            use windows::Win32::UI::WindowsAndMessaging::{ShowWindow, SW_SHOWMINNOACTIVE};
            unsafe {
                let _ = ShowWindow(HWND(h as *mut core::ffi::c_void), SW_SHOWMINNOACTIVE);
            }
            return;
        }
    }
    let _ = w.minimize();
}

/// app.setLoginItemSettings({ openAtLogin, args: ['--autostart', '--hidden'] }). Turning it on
/// from the tray also clears a Task Manager "disabled" mark, as Electron did.
pub fn set_autostart(enabled: bool) -> bool {
    #[cfg(windows)]
    {
        use descall_shell::launch::{run_command, RUN_VALUE};
        let Ok(exe) = std::env::current_exe() else { return false };
        let Ok(run) = windows_registry::CURRENT_USER.create(RUN) else { return false };
        if enabled {
            if let Ok(k) = windows_registry::CURRENT_USER.create(STARTUP_APPROVED_RUN) {
                if k.get_value(RUN_VALUE).map(|v| v.first().copied() == Some(0x03)).unwrap_or(false) {
                    let _ = k.set_bytes(RUN_VALUE, windows_registry::Type::Bytes, &[0x02, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
                }
            }
            run.set_string(RUN_VALUE, run_command(&exe.to_string_lossy())).is_ok()
        } else {
            let _ = run.remove_value(RUN_VALUE);
            true
        }
    }
    #[cfg(not(windows))]
    {
        let _ = enabled;
        false
    }
}

/// Image names of running processes (Toolhelp32, no tasklist.exe child, no console flash).
pub fn process_names() -> Vec<String> {
    #[allow(unused_mut)]
    let mut names = Vec::new();
    #[cfg(windows)]
    unsafe {
        use windows::Win32::Foundation::CloseHandle;
        use windows::Win32::System::Diagnostics::ToolHelp::{CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS};
        if let Ok(snap) = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) {
            let mut e = PROCESSENTRY32W { dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32, ..Default::default() };
            let mut ok = Process32FirstW(snap, &mut e).is_ok();
            while ok {
                let end = e.szExeFile.iter().position(|c| *c == 0).unwrap_or(e.szExeFile.len());
                names.push(String::from_utf16_lossy(&e.szExeFile[..end]));
                ok = Process32NextW(snap, &mut e).is_ok();
            }
            let _ = CloseHandle(snap);
        }
    }
    names
}
