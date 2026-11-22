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

/// Renderer reloads after a WebView2 renderer crash, per app run (Electron reloaded only
/// during boot and left a dead white window after it).
pub const MAX_RENDERER_CRASH_RELOADS: u32 = 3;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RendererGone {
    /// Reload the page (the session lives in localStorage / IndexedDB and survives).
    Reload,
    /// Ask the user: Retry (reload / restart) or wait / quit.
    Ask,
    /// WebView2 restarts the process itself (GPU, utility) or it was a sub-frame: report only.
    ReportOnly,
}

/// WebView2 ProcessFailed (COREWEBVIEW2_PROCESS_FAILED_KIND) for the main window, plus the
/// summary name it is reported under (electronAPI.onMainError, kind `render-process-gone`).
pub fn renderer_gone_action(kind: i32, crash_reloads: u32) -> (RendererGone, &'static str) {
    match kind {
        // The browser process is gone: this WebView cannot come back, only the app can.
        0 => (RendererGone::Ask, "browser-process-exited"),
        1 if crash_reloads < MAX_RENDERER_CRASH_RELOADS => (RendererGone::Reload, "render-process-exited"),
        1 => (RendererGone::Ask, "render-process-exited"),
        // Hung renderer: never reload a live call on our own; Wait / Reload like Electron.
        2 => (RendererGone::Ask, "render-process-unresponsive"),
        3 => (RendererGone::ReportOnly, "frame-render-process-exited"),
        4 => (RendererGone::ReportOnly, "utility-process-exited"),
        5 => (RendererGone::ReportOnly, "sandbox-helper-process-exited"),
        6 => (RendererGone::ReportOnly, "gpu-process-exited"),
        _ => (RendererGone::ReportOnly, "process-exited"),
    }
}

/// main.cjs 'unresponsive': ask Wait / Reload only after the page stayed hung this long.
pub const HANG_ASK_AFTER_MS: u64 = 10_000;
/// No RENDER_PROCESS_UNRESPONSIVE report for this long: the page answered again, and the
/// next report starts a new hang.
pub const HANG_EPISODE_GAP_MS: u64 = 15_000;

/// Hung main-frame renderer (WebView2 ProcessFailed kind 2). Electron had one 'unresponsive'
/// per hang, a 'responsive' after it, and asked once, 10 s in, only with the window on screen.
/// WebView2 raises kind 2 again every few seconds while the page stays hung and has no
/// "responsive" event: asking on every report put the dialog straight back after Wait (and
/// asked with the window hidden in the tray). One ask per hang, reported once.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct HangWatch {
    /// First report of the current hang (0: none yet).
    pub since_ms: u64,
    pub last_ms: u64,
    pub asked: bool,
}

impl HangWatch {
    pub const fn new() -> Self {
        HangWatch { since_ms: 0, last_ms: 0, asked: false }
    }

    /// A kind 2 report at `now_ms`. Returns the hang it belongs to (its first report time) and
    /// whether it starts a new one (report it, and check back after HANG_ASK_AFTER_MS).
    pub fn report(&mut self, now_ms: u64) -> (u64, bool) {
        let new = self.since_ms == 0 || now_ms.saturating_sub(self.last_ms) > HANG_EPISODE_GAP_MS;
        if new {
            *self = HangWatch { since_ms: now_ms.max(1), last_ms: now_ms, asked: false };
        }
        self.last_ms = now_ms;
        (self.since_ms, new)
    }

    /// HANG_ASK_AFTER_MS after hang `since_ms` began: ask now? Only for that hang, once, and
    /// only with the window on screen (main.cjs checked isVisible()).
    pub fn due(&mut self, since_ms: u64, visible: bool) -> bool {
        if self.since_ms != since_ms || self.asked || !visible {
            return false;
        }
        self.asked = true;
        true
    }
}

#[cfg(test)]
mod tests {
    //! bootWatchdog.selftest.mjs and paintWatchdog.selftest.mjs (logic parts).
    use super::*;

    #[test]
    fn one_ask_per_hang() {
        let mut h = HangWatch::new();
        let (hang, new) = h.report(1_000);
        assert!(new, "first report starts a hang (reported once)");
        // WebView2 repeats the report every few seconds while hung: same hang, not reported again.
        assert_eq!(h.report(4_000), (hang, false));
        assert_eq!(h.report(8_000), (hang, false));
        assert!(h.due(hang, true), "10 s in, window on screen: ask");
        assert_eq!(h.report(12_000), (hang, false));
        assert!(!h.due(hang, true), "Wait: never asked again during the same hang");
        // Quiet for longer than the gap: the page answered; a later hang asks again.
        let (next, new) = h.report(12_000 + HANG_EPISODE_GAP_MS + 1);
        assert!(new && next != hang);
        assert!(!h.due(hang, true), "a stale check of the old hang does nothing");
        assert!(h.due(next, true));
    }

    #[test]
    fn hidden_window_is_not_asked() {
        let mut h = HangWatch::new();
        let (hang, _) = h.report(0);
        assert!(h.since_ms != 0, "a report at time 0 still opens a hang");
        assert!(!h.due(hang, false), "hidden in the tray / minimized: no dialog (main.cjs isVisible)");
        let mut once = HangWatch::new();
        let (only, _) = once.report(50_000);
        assert!(once.due(only, true), "a single report (no repeats) is still asked once");
    }

    #[test]
    fn bounded_backoff_then_ask() {
        assert_eq!([0, 1, 2, 3].map(next_load_retry_delay), [Some(1000), Some(3000), Some(8000), None]);
    }

    #[test]
    fn renderer_gone() {
        assert_eq!(renderer_gone_action(1, 0), (RendererGone::Reload, "render-process-exited"));
        assert_eq!(renderer_gone_action(1, MAX_RENDERER_CRASH_RELOADS).0, RendererGone::Ask, "no reload loop");
        assert_eq!(renderer_gone_action(0, 0).0, RendererGone::Ask);
        assert_eq!(renderer_gone_action(2, 0).0, RendererGone::Ask, "a hung call is never reloaded silently");
        for k in [3, 4, 5, 6, 7, 8, 9, 42] {
            assert_eq!(renderer_gone_action(k, 0).0, RendererGone::ReportOnly, "kind {k}");
        }
    }

    #[test]
    fn crash_reloads() {
        assert!(should_reload_after_crash(false, 0, false));
        assert!(!should_reload_after_crash(false, MAX_BOOT_CRASH_RELOADS, false));
        assert!(!should_reload_after_crash(true, 0, false));
        assert!(!should_reload_after_crash(false, 0, true));
        assert_eq!(BOOT_RETRY_STORAGES, ["serviceworkers", "cachestorage"], "a boot retry never wipes the session");
        const { assert!(READY_FALLBACK_MS <= 20_000) };
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
        const { assert!(PAINT_NUDGE_MS < PAINT_RELOAD_MS && PAINT_RELOAD_MS < PAINT_ASK_MS) };
        const { assert!(PAINT_RELOAD_MS > 14_000, "the page's own 14 s watchdog goes first") };
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
