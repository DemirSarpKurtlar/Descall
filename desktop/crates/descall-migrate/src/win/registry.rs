//! Typed registry access for [`crate::regsnap`] values.

use windows::core::{HSTRING, PWSTR};
use windows::Win32::Foundation::{ERROR_FILE_NOT_FOUND, WIN32_ERROR};
use windows::Win32::System::Registry::*;

use crate::regsnap::{Hive, RegData, RegValue};

fn root(h: Hive) -> HKEY {
    match h {
        Hive::Hkcu => HKEY_CURRENT_USER,
        Hive::Hklm => HKEY_LOCAL_MACHINE,
    }
}

fn io(e: WIN32_ERROR) -> std::io::Error {
    std::io::Error::from_raw_os_error(e.0 as i32)
}

fn name_param(name: &str) -> HSTRING {
    HSTRING::from(name)
}

pub fn read(hive: Hive, key: &str, name: &str) -> RegData {
    let k = HSTRING::from(key);
    let n = name_param(name);
    let mut ty = REG_VALUE_TYPE::default();
    let mut len = 0u32;
    let flags = RRF_RT_ANY | RRF_NOEXPAND;
    let r = unsafe { RegGetValueW(root(hive), &k, &n, flags, Some(&mut ty), None, Some(&mut len)) };
    if r.is_err() {
        return RegData::Absent;
    }
    let mut buf = vec![0u8; len as usize + 4];
    let mut len2 = buf.len() as u32;
    let r = unsafe { RegGetValueW(root(hive), &k, &n, flags, Some(&mut ty), Some(buf.as_mut_ptr() as *mut _), Some(&mut len2)) };
    if r.is_err() {
        return RegData::Absent;
    }
    buf.truncate(len2 as usize);
    let text = |b: &[u8]| {
        let w: Vec<u16> = b.chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).collect();
        let end = w.iter().position(|&c| c == 0).unwrap_or(w.len());
        String::from_utf16_lossy(&w[..end])
    };
    match ty {
        REG_SZ => RegData::Sz(text(&buf)),
        REG_EXPAND_SZ => RegData::ExpandSz(text(&buf)),
        REG_DWORD if buf.len() >= 4 => RegData::Dword(u32::from_le_bytes([buf[0], buf[1], buf[2], buf[3]])),
        _ => RegData::Binary(buf),
    }
}

pub fn write(v: &RegValue) -> std::io::Result<()> {
    let k = HSTRING::from(v.key.as_str());
    let n = name_param(&v.name);
    let r = unsafe {
        match &v.data {
            RegData::Absent => {
                let r = RegDeleteKeyValueW(root(v.hive), &k, &n);
                if r == ERROR_FILE_NOT_FOUND {
                    return Ok(());
                }
                r
            }
            RegData::Sz(s) | RegData::ExpandSz(s) => {
                let w: Vec<u16> = s.encode_utf16().chain([0]).collect();
                let ty = if matches!(v.data, RegData::ExpandSz(_)) { REG_EXPAND_SZ } else { REG_SZ };
                RegSetKeyValueW(root(v.hive), &k, &n, ty.0, Some(w.as_ptr() as *const _), (w.len() * 2) as u32)
            }
            RegData::Dword(d) => RegSetKeyValueW(root(v.hive), &k, &n, REG_DWORD.0, Some(d as *const u32 as *const _), 4),
            RegData::Binary(b) => RegSetKeyValueW(root(v.hive), &k, &n, REG_BINARY.0, Some(b.as_ptr() as *const _), b.len() as u32),
        }
    };
    if r.is_ok() {
        Ok(())
    } else {
        Err(io(r))
    }
}

pub fn subkeys(hive: Hive, key: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut h = HKEY::default();
    if unsafe { RegOpenKeyExW(root(hive), &HSTRING::from(key), Some(0), KEY_READ, &mut h) }.is_err() {
        return out;
    }
    let mut i = 0u32;
    loop {
        let mut name = [0u16; 256];
        let mut len = name.len() as u32;
        let r = unsafe { RegEnumKeyExW(h, i, Some(PWSTR(name.as_mut_ptr())), &mut len, None, None, None, None) };
        if r.is_err() {
            break;
        }
        out.push(String::from_utf16_lossy(&name[..len as usize]));
        i += 1;
    }
    unsafe {
        let _ = RegCloseKey(h);
    }
    out
}

pub fn delete_tree(hive: Hive, key: &str) -> std::io::Result<()> {
    if key.trim_matches('\\').is_empty() || !key.contains('\\') {
        return Err(std::io::Error::other("refusing to delete a top-level key"));
    }
    let r = unsafe { RegDeleteTreeW(root(hive), &HSTRING::from(key)) };
    if r.is_ok() || r == ERROR_FILE_NOT_FOUND {
        Ok(())
    } else {
        Err(io(r))
    }
}

/// Windows build number (CurrentBuildNumber; GetVersionEx lies without a manifest).
pub fn os_build() -> u32 {
    match read(Hive::Hklm, r"SOFTWARE\Microsoft\Windows NT\CurrentVersion", "CurrentBuildNumber") {
        RegData::Sz(s) => s.trim().parse().unwrap_or(0),
        _ => 0,
    }
}

/// Find Electron's Uninstall entry (HKCU first, then HKLM; 64- and 32-bit views).
pub fn find_electron() -> Option<crate::sys::ElectronInstall> {
    use crate::regsnap::UNINSTALL;
    let roots: [(Hive, &str, bool); 3] =
        [(Hive::Hkcu, UNINSTALL, false), (Hive::Hklm, UNINSTALL, true), (Hive::Hklm, r"Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall", true)];
    for (hive, base, per_machine) in roots {
        for sub in subkeys(hive, base) {
            let key = format!(r"{base}\{sub}");
            let display = match read(hive, &key, "DisplayName") {
                RegData::Sz(s) => s,
                _ => continue,
            };
            let uninstall = match read(hive, &key, "UninstallString") {
                RegData::Sz(s) | RegData::ExpandSz(s) => s,
                _ => String::new(),
            };
            if display.starts_with("Descall") && uninstall.contains("Uninstall Descall.exe") {
                let loc = match read(hive, &key, "InstallLocation") {
                    RegData::Sz(s) | RegData::ExpandSz(s) => crate::paths::clean_install_location(&s),
                    _ => continue,
                };
                let ver = match read(hive, &key, "DisplayVersion") {
                    RegData::Sz(s) => s,
                    _ => String::new(),
                };
                return Some(crate::sys::ElectronInstall { key_path: key, per_machine, install_location: loc, display_version: ver });
            }
        }
    }
    None
}
