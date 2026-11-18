//! Find the Electron install and the shell state it registered.
//!
//! electron-builder (oneClick: false, allowElevation) writes
//! `HK{CU|LM}\Software\Microsoft\Windows\CurrentVersion\Uninstall\{GUID}` with DisplayName
//! "Descall <ver>", InstallLocation and "UninstallString" pointing at "Uninstall Descall.exe".
//! The GUID is derived from appId com.descall.app; we match on DisplayName + uninstaller name
//! instead of hard-coding it. Autostart: Electron app.setLoginItemSettings writes the Run
//! value named after the AppUserModelID ("com.descall.app") with "--autostart --hidden";
//! Task Manager's enable/disable lives in Explorer\StartupApproved\Run under the same name.

use windows::core::{HSTRING, PCWSTR};
use windows::Win32::System::Registry::*;

#[derive(Debug, Clone, Default)]
pub struct ElectronInstall {
    pub key_path: String,
    pub per_machine: bool,
    pub install_location: String,
    pub display_version: String,
    pub uninstall_string: String,
}

pub const UNINSTALL: &str = r"Software\Microsoft\Windows\CurrentVersion\Uninstall";
pub const RUN: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
pub const STARTUP_APPROVED_RUN: &str = r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run";
pub const RUN_VALUE: &str = "com.descall.app";
pub const TOAST_CLSID: &str = "{BCF5A315-F914-4A7E-95BD-313CBE4B661B}";

fn read_string(key: HKEY, name: &str) -> Option<String> {
    let mut buf = vec![0u16; 2048];
    let mut len = (buf.len() * 2) as u32;
    let r = unsafe {
        RegGetValueW(key, PCWSTR::null(), &HSTRING::from(name), RRF_RT_REG_SZ, None, Some(buf.as_mut_ptr() as *mut _), Some(&mut len))
    };
    if r.is_err() {
        return None;
    }
    let n = (len as usize / 2).saturating_sub(1);
    Some(String::from_utf16_lossy(&buf[..n]))
}

pub fn find() -> Option<ElectronInstall> {
    for (root, per_machine) in [(HKEY_CURRENT_USER, false), (HKEY_LOCAL_MACHINE, true)] {
        let mut parent = HKEY::default();
        if unsafe { RegOpenKeyExW(root, &HSTRING::from(UNINSTALL), Some(0), KEY_READ, &mut parent) }.is_err() {
            continue;
        }
        let mut i = 0u32;
        loop {
            let mut name = [0u16; 256];
            let mut name_len = name.len() as u32;
            let r = unsafe { RegEnumKeyExW(parent, i, Some(windows::core::PWSTR(name.as_mut_ptr())), &mut name_len, None, None, None, None) };
            if r.is_err() {
                break;
            }
            i += 1;
            let sub = String::from_utf16_lossy(&name[..name_len as usize]);
            let mut k = HKEY::default();
            if unsafe { RegOpenKeyExW(parent, &HSTRING::from(sub.as_str()), Some(0), KEY_READ, &mut k) }.is_err() {
                continue;
            }
            let display = read_string(k, "DisplayName").unwrap_or_default();
            let uninstall = read_string(k, "UninstallString").unwrap_or_default();
            if display.starts_with("Descall") && uninstall.contains("Uninstall Descall.exe") {
                let found = ElectronInstall {
                    key_path: format!(r"{UNINSTALL}\{sub}"),
                    per_machine,
                    install_location: read_string(k, "InstallLocation").unwrap_or_default(),
                    display_version: read_string(k, "DisplayVersion").unwrap_or_default(),
                    uninstall_string: uninstall,
                };
                unsafe { let _ = RegCloseKey(k); let _ = RegCloseKey(parent); }
                return Some(found);
            }
            unsafe { let _ = RegCloseKey(k); }
        }
        unsafe { let _ = RegCloseKey(parent); }
    }
    None
}

/// (enabled in Run, disabled by the user in Task Manager)
pub fn autostart_state() -> (bool, bool) {
    let mut run = HKEY::default();
    let enabled = unsafe { RegOpenKeyExW(HKEY_CURRENT_USER, &HSTRING::from(RUN), Some(0), KEY_READ, &mut run) }.is_ok()
        && read_string(run, RUN_VALUE).is_some();
    let mut approved = HKEY::default();
    let mut disabled = false;
    if unsafe { RegOpenKeyExW(HKEY_CURRENT_USER, &HSTRING::from(STARTUP_APPROVED_RUN), Some(0), KEY_READ, &mut approved) }.is_ok() {
        let mut data = [0u8; 12];
        let mut len = data.len() as u32;
        let r = unsafe {
            RegGetValueW(approved, PCWSTR::null(), &HSTRING::from(RUN_VALUE), RRF_RT_REG_BINARY, None, Some(data.as_mut_ptr() as *mut _), Some(&mut len))
        };
        disabled = r.is_ok() && len > 0 && data[0] == 0x03;
    }
    (enabled, disabled)
}
