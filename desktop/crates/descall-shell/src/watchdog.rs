//! Boot and paint watchdog decisions. Port of electron/bootWatchdog.cjs.
//!
//! The page reports boot milestones (`electronAPI.bootState(phase, ms)`): `painted` once
//! the HTML boot splash is gone, `app-mounted` when React mounted, and a few failure
//! phases. Until `painted`, the shell nudges a fresh frame, then clean-reloads once (Service
//! Worker + Cache Storage only, never localStorage / IndexedDB / cookies), then asks the
//! user with Retry / Quit.

use serde::Serialize;

pub const READY_FALLBACK_MS: u64 = 15_000;
pub const LOAD_RETRY_DELAYS_MS: [u64; 3] = [1000, 3000, 8000];
pub const MAX_BOOT_CRASH_RELOADS: u32 = 2;
pub const PAINT_NUDGE_MS: u64 = 12_000;
pub const PAINT_RELOAD_MS: u64 = 22_000;
pub const PAINT_ASK_MS: u64 = 45_000;
pub const MAX_PAINT_RELOADS: u32 = 1;
/// What a boot retry clears. Never localStorage / IndexedDB / cookies: the session lives there.
pub const BOOT_RETRY_STORAGES: [&str; 2] = ["serviceworkers", "cachestorage"];
pub const BOOT_PHASES: [&str; 7] = ["painted", "splash-failed", "auto-retry", "app-mounted", "visible", "inline-missing", "forced-dismiss"];

/// Delay before the next load attempt, or None when it is time to ask the user.
pub fn next_load_retry_delay(failures: usize) -> Option<u64> {
    LOAD_RETRY_DELAYS_MS.get(failures).copied()
}

pub fn should_reload_after_crash(booted: bool, crash_reloads: u32, clean_exit: bool) -> bool {
    !booted && !clean_exit && crash_reloads < MAX_BOOT_CRASH_RELOADS
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum PaintStep {
    None,
    Nudge,
    Reload,
    Ask,
}

pub fn paint_watchdog_step(painted: bool, elapsed_ms: u64, reloads: u32, asked: bool) -> PaintStep {
    if painted {
        return PaintStep::None;
    }
    if elapsed_ms >= PAINT_ASK_MS && !asked {
        return PaintStep::Ask;
    }
    if elapsed_ms >= PAINT_RELOAD_MS && reloads < MAX_PAINT_RELOADS {
        return PaintStep::Reload;
    }
    if elapsed_ms >= PAINT_NUDGE_MS {
        return PaintStep::Nudge;
    }
    PaintStep::None
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct BootReport {
    pub phase: &'static str,
    pub ms: Option<u64>,
}

/// Sanitize a page boot report (untrusted input).
pub fn normalize_boot_report(phase: &str, ms: f64) -> Option<BootReport> {
    let phase = BOOT_PHASES.iter().find(|p| **p == phase)?;
    Some(BootReport { phase, ms: (ms.is_finite() && ms >= 0.0).then(|| ms.round() as u64) })
}

/// A report that ends the paint watchdog.
pub fn ends_paint_watch(phase: &str) -> bool {
    matches!(phase, "painted" | "forced-dismiss")
}

#[cfg(test)]
mod tests {
    //! bootWatchdog.selftest.mjs and paintWatchdog.selftest.mjs (logic parts).
    use super::*;

    #[test]
    fn bounded_backoff_then_ask() {
        assert_eq!([0, 1, 2, 3].map(next_load_retry_delay), [Some(1000), Some(3000), Some(8000), None]);
    }

    #[test]
    fn crash_reloads() {
        assert!(should_reload_after_crash(false, 0, false));
        assert!(!should_reload_after_crash(false, MAX_BOOT_CRASH_RELOADS, false));
        assert!(!should_reload_after_crash(true, 0, false));
        assert!(!should_reload_after_crash(false, 0, true));
        assert_eq!(BOOT_RETRY_STORAGES, ["serviceworkers", "cachestorage"], "a boot retry never wipes the session");
        assert!(READY_FALLBACK_MS <= 20_000);
    }

    #[test]
    fn paint_steps() {
        assert_eq!(paint_watchdog_step(true, 99_000, 0, false), PaintStep::None);
        assert_eq!(paint_watchdog_step(false, 5_000, 0, false), PaintStep::None);
        assert_eq!(paint_watchdog_step(false, PAINT_NUDGE_MS, 0, false), PaintStep::Nudge);
        assert_eq!(paint_watchdog_step(false, PAINT_RELOAD_MS, 0, false), PaintStep::Reload);
        assert_eq!(paint_watchdog_step(false, PAINT_RELOAD_MS, MAX_PAINT_RELOADS, false), PaintStep::Nudge, "one automatic clean reload");
        assert_eq!(paint_watchdog_step(false, PAINT_ASK_MS, 1, false), PaintStep::Ask);
        assert_eq!(paint_watchdog_step(false, PAINT_ASK_MS, 1, true), PaintStep::Nudge);
        assert!(PAINT_NUDGE_MS < PAINT_RELOAD_MS && PAINT_RELOAD_MS < PAINT_ASK_MS);
        assert!(PAINT_RELOAD_MS > 14_000, "the page's own 14 s watchdog goes first");
    }

    #[test]
    fn boot_reports_are_sanitized() {
        assert_eq!(normalize_boot_report("painted", 812.4), Some(BootReport { phase: "painted", ms: Some(812) }));
        assert_eq!(normalize_boot_report("rm -rf", 1.0), None);
        assert_eq!(normalize_boot_report("app-mounted", -1.0), Some(BootReport { phase: "app-mounted", ms: None }));
        assert_eq!(normalize_boot_report("painted", f64::NAN).unwrap().ms, None);
        assert!(ends_paint_watch("forced-dismiss") && !ends_paint_watch("app-mounted"));
    }
}
