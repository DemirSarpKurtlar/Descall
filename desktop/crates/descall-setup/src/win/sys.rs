//! System facts for the welcome screen and diagnostics: Windows build, WebView2, disk, language,
//! "Animation effects", network adapters and VPN.

use std::ffi::c_void;
use std::path::{Path, PathBuf};
use windows::core::{GUID, HSTRING, PWSTR};
use windows::Win32::Globalization::{GetUserPreferredUILanguages, MUI_LANGUAGE_NAME};
use windows::Win32::NetworkManagement::IpHelper::{GetAdaptersAddresses, GAA_FLAG_INCLUDE_GATEWAYS, IP_ADAPTER_ADDRESSES_LH};
use windows::Win32::NetworkManagement::Ndis::IfOperStatusUp;
use windows::Win32::Networking::WinSock::AF_UNSPEC;
use windows::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;
use windows::Win32::System::Com::CoTaskMemFree;
use windows::Win32::UI::Shell::{SHGetKnownFolderPath, KF_FLAG_CREATE, KF_FLAG_DEFAULT};
use windows::Win32::UI::WindowsAndMessaging::{SystemParametersInfoW, SPI_GETCLIENTAREAANIMATION, SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS};

pub use windows::Win32::UI::Shell::{FOLDERID_Desktop, FOLDERID_LocalAppData, FOLDERID_Programs, FOLDERID_RoamingAppData};

pub fn known_folder(id: &GUID) -> Option<PathBuf> {
    unsafe {
        let p: PWSTR = SHGetKnownFolderPath(id, KF_FLAG_DEFAULT, None).or_else(|_| SHGetKnownFolderPath(id, KF_FLAG_CREATE, None)).ok()?;
        let s = p.to_string().ok();
        CoTaskMemFree(Some(p.0 as *const c_void));
        s.map(PathBuf::from)
    }
}

#[derive(Debug, Clone)]
pub struct OsInfo {
    pub build: u32,
    /// "Windows 11", "Windows 10 22H2"…
    pub name: String,
}

pub fn os_info() -> OsInfo {
    let key = windows_registry::LOCAL_MACHINE.open(r"SOFTWARE\Microsoft\Windows NT\CurrentVersion").ok();
    let build: u32 = key.as_ref().and_then(|k| k.get_string("CurrentBuildNumber").ok()).and_then(|b| b.parse().ok()).unwrap_or(0);
    let display = key.as_ref().and_then(|k| k.get_string("DisplayVersion").ok()).unwrap_or_default();
    let name = if build >= 22000 {
        "Windows 11".to_string()
    } else if display.is_empty() {
        "Windows 10".to_string()
    } else {
        format!("Windows 10 {display}")
    };
    OsInfo { build, name }
}

/// Installed Evergreen WebView2 runtime version, if any.
pub fn webview2_version() -> Option<String> {
    use webview2_com::Microsoft::Web::WebView2::Win32::GetAvailableCoreWebView2BrowserVersionString;
    let mut v = PWSTR::null();
    unsafe { GetAvailableCoreWebView2BrowserVersionString(windows::core::PCWSTR::null(), &mut v) }.ok()?;
    if v.is_null() {
        return None;
    }
    let s = webview2_com::take_pwstr(v);
    (!s.is_empty()).then_some(s)
}

/// Free bytes for the caller on the volume of `path` (walks up to an existing ancestor).
pub fn disk_free(path: &Path) -> Option<u64> {
    let mut p = path.to_path_buf();
    while !p.exists() {
        p = p.parent()?.to_path_buf();
    }
    let mut free = 0u64;
    unsafe { GetDiskFreeSpaceExW(&HSTRING::from(p.as_os_str()), Some(&mut free), None, None) }.ok()?;
    Some(free)
}

pub fn drive_label(path: &Path) -> String {
    let s = path.to_string_lossy();
    if s.len() >= 2 && s.as_bytes()[1] == b':' {
        s[..2].to_uppercase()
    } else {
        "\\\\".into()
    }
}

/// User's preferred UI languages, best first ("tr-TR", "en-US", …).
pub fn ui_languages() -> Vec<String> {
    let mut n = 0u32;
    let mut len = 0u32;
    unsafe {
        if GetUserPreferredUILanguages(MUI_LANGUAGE_NAME, &mut n, None, &mut len).is_err() || len == 0 {
            return vec![];
        }
        let mut buf = vec![0u16; len as usize];
        if GetUserPreferredUILanguages(MUI_LANGUAGE_NAME, &mut n, Some(PWSTR(buf.as_mut_ptr())), &mut len).is_err() {
            return vec![];
        }
        buf.split(|c| *c == 0).filter(|s| !s.is_empty()).map(String::from_utf16_lossy).collect()
    }
}

/// Maps the system language list to one of our seven UI languages.
pub fn pick_language(prefs: &[String]) -> &'static str {
    for p in prefs {
        let l = p.to_ascii_lowercase();
        let base = l.split(['-', '_']).next().unwrap_or("");
        match base {
            "tr" => return "tr",
            "en" => return "en",
            "de" => return "de",
            "es" => return "es",
            "fr" => return "fr",
            "pt" => return "pt-BR",
            "ru" => return "ru",
            _ => {}
        }
    }
    "en"
}

/// Windows "Animation effects" switch (Settings > Accessibility > Visual effects).
pub fn reduced_motion() -> bool {
    let mut on: i32 = 1;
    let ok = unsafe { SystemParametersInfoW(SPI_GETCLIENTAREAANIMATION, 0, Some(&mut on as *mut i32 as *mut c_void), SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS(0)) }.is_ok();
    ok && on == 0
}

#[derive(Debug, Clone, Copy, Default)]
pub struct NetState {
    /// An adapter is up with a default gateway.
    pub connected: bool,
    /// A VPN-looking adapter (PPP, tunnel, WireGuard/TAP/TUN) is up.
    pub vpn: bool,
}

pub fn net_state() -> NetState {
    let mut size: u32 = 32 * 1024;
    let mut buf: Vec<u64> = vec![0; size as usize / 8];
    let mut r = unsafe { GetAdaptersAddresses(AF_UNSPEC.0 as u32, GAA_FLAG_INCLUDE_GATEWAYS, None, Some(buf.as_mut_ptr() as *mut IP_ADAPTER_ADDRESSES_LH), &mut size) };
    if r == 111 {
        // ERROR_BUFFER_OVERFLOW
        buf = vec![0; size as usize / 8 + 1];
        r = unsafe { GetAdaptersAddresses(AF_UNSPEC.0 as u32, GAA_FLAG_INCLUDE_GATEWAYS, None, Some(buf.as_mut_ptr() as *mut IP_ADAPTER_ADDRESSES_LH), &mut size) };
    }
    let mut st = NetState::default();
    if r != 0 {
        // Unknown: do not claim the cable is out.
        st.connected = true;
        return st;
    }
    let mut p = buf.as_ptr() as *const IP_ADAPTER_ADDRESSES_LH;
    while !p.is_null() {
        let a = unsafe { &*p };
        let up = a.OperStatus == IfOperStatusUp;
        let loopback = a.IfType == 24; // IF_TYPE_SOFTWARE_LOOPBACK
        if up && !loopback {
            if !a.FirstGatewayAddress.is_null() {
                st.connected = true;
            }
            let desc = unsafe { a.Description.to_string() }.unwrap_or_default().to_ascii_lowercase();
            let tunnel = a.IfType == 23 || a.IfType == 131 || a.IfType == 53; // PPP, TUNNEL, PROP_VIRTUAL
            if tunnel || ["vpn", "wireguard", "tap-", "tun", "openvpn", "wintun"].iter().any(|k| desc.contains(k)) {
                st.vpn = true;
            }
        }
        p = a.Next;
    }
    st
}

/// True when we can create and delete a file inside `dir` (or its first existing ancestor).
pub fn writable(dir: &Path) -> bool {
    let mut p = dir.to_path_buf();
    while !p.exists() {
        match p.parent() {
            Some(x) => p = x.to_path_buf(),
            None => return false,
        }
    }
    let probe = p.join(format!(".descall-setup-{}", std::process::id()));
    let ok = std::fs::write(&probe, b"x").is_ok();
    let _ = std::fs::remove_file(&probe);
    ok
}
