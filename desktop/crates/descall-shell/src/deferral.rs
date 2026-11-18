//! When a downloaded update may restart the app. Port of electron/updateDeferral.cjs.
//!
//! Downloading is always allowed. Installing is not while a voice session is busy (DM call
//! or ring, group call or ring, server voice including connecting, screen share) or while
//! the user is typing / uploading / recording. An automatic install happens only when:
//! - the user left every call and stayed out for CALL_GRACE_MS (2 min);
//! - the session is locked, or input idle for SYSTEM_IDLE_THRESHOLD_MS, outside a grace;
//! - the update never overlapped a call and the window was in the background for
//!   BACKGROUND_SETTLE_MS (12 s);
//! - prelaunch (no page yet, so no call can exist).
//! An explicit "restart now" after the user confirmed is the only mid-call install.

use serde::Serialize;

pub const CALL_GRACE_MS: u64 = 2 * 60 * 1000;
pub const SYSTEM_IDLE_THRESHOLD_MS: u64 = 2 * 60 * 1000;
pub const BACKGROUND_SETTLE_MS: u64 = 12 * 1000;
/// main.cjs UPDATE_CHECK_INTERVAL_MS and UPDATE_INSTALL_POLL_MS.
pub const UPDATE_CHECK_INTERVAL_MS: u64 = 5 * 60 * 1000;
pub const UPDATE_INSTALL_POLL_MS: u64 = 5 * 1000;

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct State {
    pub update_ready: bool,
    pub voice_busy: bool,
    /// Typing / uploading in the page. Blocks install, never arms the call grace.
    pub user_busy: bool,
    /// Epoch ms; Some while the post-call grace window runs.
    pub grace_until: Option<u64>,
    /// True once a pending update overlapped a voice session (blocks the 12 s path).
    pub call_deferral_armed: bool,
    pub app_in_background: bool,
    pub background_since: Option<u64>,
    pub system_idle_ms: u64,
    pub session_locked: bool,
    pub prelaunch: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Event {
    UpdateReady,
    VoiceBusy(bool),
    UserBusy(bool),
    /// Page crash / reload / window closed.
    ResetVoice,
    Presence { app_in_background: bool, system_idle_ms: u64, session_locked: bool, prelaunch: bool },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Action {
    Install,
    Wait,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct Decision {
    pub action: Action,
    pub reason: &'static str,
}

const fn wait(reason: &'static str) -> Decision {
    Decision { action: Action::Wait, reason }
}
const fn install(reason: &'static str) -> Decision {
    Decision { action: Action::Install, reason }
}

pub fn apply(state: &State, event: Event, now: u64) -> State {
    apply_with(state, event, now, CALL_GRACE_MS)
}

pub fn apply_with(state: &State, event: Event, now: u64, grace_ms: u64) -> State {
    let mut next = state.clone();
    match event {
        Event::UpdateReady => {
            next.update_ready = true;
            if next.voice_busy {
                next.call_deferral_armed = true;
                next.grace_until = None;
            }
        }
        Event::VoiceBusy(true) => {
            // A call starting during grace cancels the grace; the next leave starts a new one.
            next.voice_busy = true;
            next.grace_until = None;
            if next.update_ready {
                next.call_deferral_armed = true;
            }
        }
        Event::VoiceBusy(false) => {
            if next.voice_busy {
                next.voice_busy = false;
                next.grace_until = if next.update_ready && next.call_deferral_armed { Some(now + grace_ms) } else { None };
            }
        }
        Event::UserBusy(b) => next.user_busy = b,
        Event::ResetVoice => {
            // Same transition as "call ended" when a call was up; a reset while idle must not
            // start or extend a grace window.
            let cleared = State { user_busy: false, ..state.clone() };
            return apply_with(&cleared, Event::VoiceBusy(false), now, grace_ms);
        }
        Event::Presence { app_in_background, system_idle_ms, session_locked, prelaunch } => {
            next.app_in_background = app_in_background;
            next.system_idle_ms = system_idle_ms;
            next.session_locked = session_locked;
            next.prelaunch = prelaunch;
            if app_in_background {
                if next.background_since.is_none() {
                    next.background_since = Some(now);
                }
            } else {
                next.background_since = None;
            }
        }
    }
    next
}

/// `explicit_confirm`: the user confirmed "restart now" in the page.
pub fn decide(state: &State, now: u64, explicit_confirm: bool) -> Decision {
    decide_with(state, now, explicit_confirm, SYSTEM_IDLE_THRESHOLD_MS, BACKGROUND_SETTLE_MS)
}

pub fn decide_with(state: &State, now: u64, explicit_confirm: bool, idle_ms: u64, settle_ms: u64) -> Decision {
    if !state.update_ready {
        return wait("no-update");
    }
    if explicit_confirm {
        return install("user-confirmed");
    }
    if state.voice_busy {
        return wait("voice-busy");
    }
    // Unsent text / upload / recording would be lost by a restart.
    if state.user_busy {
        return wait("user-busy");
    }
    match state.grace_until {
        Some(until) if now < until => return wait("call-grace"),
        Some(_) => return install("call-grace-elapsed"),
        None => {}
    }
    if state.prelaunch {
        return install("prelaunch");
    }
    if state.session_locked {
        return install("session-locked");
    }
    if state.system_idle_ms >= idle_ms {
        return install("system-idle");
    }
    // Quiet background install only when this update never overlapped a call.
    if !state.call_deferral_armed && state.app_in_background {
        return match state.background_since {
            Some(since) if now.saturating_sub(since) >= settle_ms => install("background-quiet"),
            _ => wait("background-settling"),
        };
    }
    if state.call_deferral_armed {
        return wait("awaiting-idle");
    }
    wait("foreground-active")
}

#[cfg(test)]
mod tests {
    //! updateDeferral.selftest.mjs, case for case.
    use super::*;

    fn with(s: &State, f: impl FnOnce(&mut State)) -> State {
        let mut c = s.clone();
        f(&mut c);
        c
    }
    fn presence(bg: bool, idle: u64, locked: bool, pre: bool) -> Event {
        Event::Presence { app_in_background: bg, system_idle_ms: idle, session_locked: locked, prelaunch: pre }
    }

    #[test]
    fn constants() {
        assert_eq!(CALL_GRACE_MS, 120_000);
        assert_eq!(SYSTEM_IDLE_THRESHOLD_MS, 120_000);
        assert_eq!(BACKGROUND_SETTLE_MS, 12_000);
    }

    #[test]
    fn nothing_staged() {
        let s = with(&State::default(), |s| {
            s.voice_busy = true;
            s.system_idle_ms = SYSTEM_IDLE_THRESHOLD_MS;
        });
        assert_eq!(decide(&s, 0, true).reason, "no-update");
    }

    #[test]
    fn a_live_call_blocks_every_automatic_trigger() {
        let mut s = apply(&State::default(), Event::UpdateReady, 0);
        s = apply(&s, Event::VoiceBusy(true), 0);
        assert!(s.call_deferral_armed);
        assert_eq!(s.grace_until, None);
        let variants = [
            with(&s, |s| {
                s.system_idle_ms = SYSTEM_IDLE_THRESHOLD_MS * 2;
                s.session_locked = true;
            }),
            with(&s, |s| {
                s.app_in_background = true;
                s.background_since = Some(0);
                s.prelaunch = true;
            }),
            with(&s, |s| s.grace_until = Some(0)),
        ];
        for v in variants {
            let d = decide(&v, 60_000, false);
            assert_eq!(d, Decision { action: Action::Wait, reason: "voice-busy" });
        }
    }

    #[test]
    fn explicit_confirm_is_the_only_mid_call_install() {
        let mut s = apply(&State::default(), Event::UpdateReady, 0);
        s = apply(&s, Event::VoiceBusy(true), 0);
        assert_eq!(decide(&s, 1000, true), Decision { action: Action::Install, reason: "user-confirmed" });
    }

    #[test]
    fn leave_call_grace_cancel_and_restart() {
        let mut s = apply(&State::default(), Event::UpdateReady, 0);
        s = apply(&s, Event::VoiceBusy(true), 0);
        s = apply(&s, Event::VoiceBusy(false), 10_000);
        assert_eq!(s.grace_until, Some(10_000 + CALL_GRACE_MS));
        assert!(!s.voice_busy);
        let during = with(&s, |s| {
            s.system_idle_ms = SYSTEM_IDLE_THRESHOLD_MS;
            s.session_locked = true;
            s.app_in_background = true;
            s.background_since = Some(0);
        });
        assert_eq!(decide(&during, 70_000, false), wait("call-grace"));

        s = apply(&s, Event::VoiceBusy(true), 20_000);
        assert_eq!(s.grace_until, None);
        assert!(s.call_deferral_armed);
        assert_eq!(decide(&s, 20_000 + CALL_GRACE_MS, false).reason, "voice-busy");

        s = apply(&s, Event::VoiceBusy(false), 30_000);
        let until = s.grace_until.unwrap();
        assert_eq!(until, 30_000 + CALL_GRACE_MS);
        assert_eq!(decide(&s, until - 1, false), wait("call-grace"));
        // Re-check right before install: busy again -> no install.
        assert_eq!(decide(&with(&s, |s| s.voice_busy = true), until, false), wait("voice-busy"));
        // Grace elapsed and still idle -> install even with the window focused.
        assert_eq!(decide(&s, until, false), install("call-grace-elapsed"));
    }

    #[test]
    fn a_second_not_busy_does_not_extend_the_grace() {
        let mut s = apply(&State::default(), Event::UpdateReady, 0);
        s = apply(&s, Event::VoiceBusy(true), 0);
        s = apply(&s, Event::VoiceBusy(false), 5_000);
        let until = s.grace_until;
        s = apply(&s, Event::VoiceBusy(false), 50_000);
        assert_eq!(s.grace_until, until);
    }

    #[test]
    fn reset_starts_grace_only_if_a_call_was_up() {
        let mut s = apply(&State::default(), Event::VoiceBusy(true), 0);
        s = apply(&s, Event::UpdateReady, 1_000);
        assert!(s.call_deferral_armed);
        s = apply(&s, Event::ResetVoice, 4_000);
        assert!(!s.voice_busy);
        assert_eq!(s.grace_until, Some(4_000 + CALL_GRACE_MS));
        assert_eq!(decide(&s, 5_000, false).reason, "call-grace");

        let mut idle = apply(&State::default(), Event::UpdateReady, 0);
        idle = apply(&idle, Event::ResetVoice, 2_000);
        assert_eq!(idle.grace_until, None);
        assert!(!idle.call_deferral_armed);
        assert!(!idle.voice_busy);
    }

    #[test]
    fn idle_and_lock_install_outside_calls() {
        let mut s = apply(&State::default(), Event::UpdateReady, 0);
        s = apply(&s, presence(false, SYSTEM_IDLE_THRESHOLD_MS - 1, false, false), 0);
        assert_eq!(decide(&s, 1_000, false).reason, "foreground-active");
        s = apply(&s, presence(false, SYSTEM_IDLE_THRESHOLD_MS, false, false), 1_000);
        assert_eq!(decide(&s, 1_000, false).reason, "system-idle");
        s = apply(&s, presence(false, 0, true, false), 1_000);
        assert_eq!(decide(&s, 1_000, false).reason, "session-locked");
    }

    #[test]
    fn background_quiet_path() {
        let mut s = apply(&State::default(), Event::UpdateReady, 0);
        s = apply(&s, presence(true, 0, false, false), 1_000);
        assert_eq!(s.background_since, Some(1_000));
        assert_eq!(decide(&s, 1_000 + BACKGROUND_SETTLE_MS - 1, false).reason, "background-settling");
        assert_eq!(decide(&s, 1_000 + BACKGROUND_SETTLE_MS, false).reason, "background-quiet");
        s = apply(&s, presence(true, 0, false, false), 5_000);
        assert_eq!(s.background_since, Some(1_000), "ticks do not move the settle clock");
        s = apply(&s, presence(false, 0, false, false), 6_000);
        assert_eq!(s.background_since, None);
        s = apply(&s, Event::VoiceBusy(true), 7_000);
        s = apply(&s, Event::VoiceBusy(false), 8_000);
        s = apply(&s, presence(true, 0, false, false), 8_000);
        assert_eq!(decide(&s, 8_000 + BACKGROUND_SETTLE_MS, false).reason, "call-grace");
    }

    #[test]
    fn prelaunch_only_without_a_call() {
        let mut s = apply(&State::default(), Event::UpdateReady, 0);
        s = apply(&s, presence(false, 0, false, true), 0);
        assert_eq!(decide(&s, 0, false).reason, "prelaunch");
        s = apply(&s, Event::VoiceBusy(true), 0);
        assert_eq!(decide(&s, 0, false).reason, "voice-busy");
    }

    #[test]
    fn leaving_a_call_before_an_update_does_not_arm_a_later_grace() {
        let mut s = apply(&State::default(), Event::VoiceBusy(true), 0);
        s = apply(&s, Event::VoiceBusy(false), 1_000);
        assert_eq!(s.grace_until, None);
        assert!(!s.call_deferral_armed);
        s = apply(&s, Event::UpdateReady, 2_000);
        assert!(!s.call_deferral_armed);
    }

    #[test]
    fn typing_holds_the_install_even_hidden_and_idle() {
        let mut s = apply(&State::default(), Event::UpdateReady, 0);
        s = apply(&s, Event::UserBusy(true), 0);
        let hidden = with(&s, |s| {
            s.system_idle_ms = 1_000_000_000;
            s.session_locked = true;
            s.app_in_background = true;
        });
        assert_eq!(decide(&hidden, 1_000_000_000, false), wait("user-busy"));
        assert_eq!(decide(&s, 1_000_000_000, true).action, Action::Install);
        s = apply(&s, Event::UserBusy(false), 1);
        assert!(!s.user_busy);
    }
}
