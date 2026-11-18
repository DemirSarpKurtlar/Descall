//! Runtime capability gates. Version numbers are the documented minimums:
//! - WGC CreateForWindow/CreateForMonitor interop: Windows 10 1903 (18362).
//! - GraphicsCaptureSession.IsCursorCaptureEnabled: Windows 10 2004 (19041).
//! - GraphicsCaptureSession.IsBorderRequired: 20348 (Windows 11 / Server 2022); before it the
//!   yellow border is always drawn on Windows 10.
//! - Process loopback (AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK): documented 20348,
//!   works from Windows 10 2004 (19041) in practice (OBS 28 "Application Audio Capture",
//!   win-capture-audio). We gate on 19041 and verify the activation result at runtime.
//! The Windows build calls ApiInformation where a property exists; these numbers are the
//! fallback when it does not (and the telemetry dimension).

use serde::Serialize;

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
pub struct Caps {
    pub build: u32,
    pub wgc: bool,
    pub cursor_toggle: bool,
    pub borderless: bool,
    pub process_loopback: bool,
}

pub const MIN_WGC: u32 = 18362;
pub const MIN_CURSOR_TOGGLE: u32 = 19041;
pub const MIN_BORDERLESS: u32 = 20348;
pub const MIN_PROCESS_LOOPBACK: u32 = 19041;

pub fn for_build(build: u32) -> Caps {
    Caps {
        build,
        wgc: build >= MIN_WGC,
        cursor_toggle: build >= MIN_CURSOR_TOGGLE,
        borderless: build >= MIN_BORDERLESS,
        process_loopback: build >= MIN_PROCESS_LOOPBACK,
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn win10_22h2_has_loopback_but_border() {
        let c = super::for_build(19045);
        assert!(c.wgc && c.cursor_toggle && c.process_loopback && !c.borderless);
        assert!(super::for_build(22631).borderless);
        assert!(!super::for_build(18363).process_loopback);
    }
}

/// Real OS build (RtlGetVersion is not subject to the manifest version lie).
#[cfg(windows)]
pub fn current_build() -> u32 {
    use windows::Wdk::System::SystemServices::RtlGetVersion;
    use windows::Win32::System::SystemInformation::OSVERSIONINFOW;
    let mut v = OSVERSIONINFOW { dwOSVersionInfoSize: std::mem::size_of::<OSVERSIONINFOW>() as u32, ..Default::default() };
    let _ = unsafe { RtlGetVersion(&mut v) };
    v.dwBuildNumber
}

#[cfg(windows)]
pub fn current() -> Caps {
    let mut c = for_build(current_build());
    c.wgc = c.wgc && crate::wgc::is_supported();
    c
}

#[cfg(all(test, windows))]
mod probe {
    /// `cargo test -p descall-capture -- --ignored probe_` on a Windows box: prints what this
    /// machine supports and tries the process-loopback activation (no device = clean error).
    #[test]
    #[ignore]
    fn probe_caps_and_loopback() {
        let c = super::current();
        println!("caps: {c:?}");
        println!("sources: {}", crate::sources::list_all().len());
        match crate::loopback::start_excluding_self(|_, _, _, _| {}) {
            Ok(l) => { std::thread::sleep(std::time::Duration::from_millis(200)); l.stop(); println!("loopback: ok"); }
            Err(e) => println!("loopback: {e}"),
        }
    }
}
