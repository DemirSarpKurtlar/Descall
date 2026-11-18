//! Runtime capability gates. Version numbers are the documented minimums:
//! - WGC CreateForWindow/CreateForMonitor interop: Windows 10 1903 (18362).
//! - GraphicsCaptureSession.IsCursorCaptureEnabled: Windows 10 2004 (19041).
//! - GraphicsCaptureSession.IsBorderRequired: 20348 (Windows 11 / Server 2022); before it the
//!   yellow border is always drawn on Windows 10.
//! - Process loopback (AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK): documented 20348,
//!   works from Windows 10 2004 (19041) in practice (OBS 28 "Application Audio Capture",
//!   win-capture-audio). We gate on 19041 and verify the activation result at runtime.
//! - MinUpdateInterval: Windows 11 24H2 era; detected with ApiInformation, otherwise frames
//!   are paced in software.
//!
//! The Windows build asks ApiInformation where a property exists; these numbers are the
//! fallback when it cannot (and the telemetry dimension).

use serde::Serialize;

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct Caps {
    pub build: u32,
    pub wgc: bool,
    pub cursor_toggle: bool,
    pub borderless: bool,
    pub process_loopback: bool,
    pub min_update_interval: bool,
    /// Native lane supported at all (Windows 10 2004+ with WGC).
    pub native: bool,
}

pub const MIN_WGC: u32 = 18362;
pub const MIN_CURSOR_TOGGLE: u32 = 19041;
pub const MIN_BORDERLESS: u32 = 20348;
pub const MIN_PROCESS_LOOPBACK: u32 = 19041;
/// The supported floor of the native lane (plan section 2.4).
pub const MIN_NATIVE: u32 = 19041;

pub fn for_build(build: u32) -> Caps {
    Caps {
        build,
        wgc: build >= MIN_WGC,
        cursor_toggle: build >= MIN_CURSOR_TOGGLE,
        borderless: build >= MIN_BORDERLESS,
        process_loopback: build >= MIN_PROCESS_LOOPBACK,
        min_update_interval: false,
        native: build >= MIN_NATIVE,
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

/// What this machine supports, with the API presence checks the build number cannot tell.
#[cfg(windows)]
pub fn current() -> Caps {
    let mut c = for_build(current_build());
    c.wgc = c.wgc && crate::wgc::is_supported();
    c.cursor_toggle = c.wgc && crate::wgc::session_property_present("IsCursorCaptureEnabled");
    c.borderless = c.wgc && crate::wgc::session_property_present("IsBorderRequired");
    c.min_update_interval = c.wgc && crate::wgc::session_property_present("MinUpdateInterval");
    c.native = c.native && c.wgc;
    c
}

#[cfg(test)]
mod tests {
    #[test]
    fn version_gates() {
        let c = super::for_build(19045);
        assert!(c.wgc && c.cursor_toggle && c.process_loopback && c.native && !c.borderless);
        assert!(super::for_build(22631).borderless);
        let old = super::for_build(18363);
        assert!(old.wgc && !old.process_loopback && !old.native && !old.cursor_toggle);
        assert!(!super::for_build(17763).wgc);
    }
}
