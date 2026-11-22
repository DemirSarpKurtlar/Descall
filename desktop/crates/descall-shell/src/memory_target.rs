//! WebView2 memory target of the main window while it sits in the tray.
//!
//! Electron keeps a hidden or minimized window at full memory (backgroundThrottling is off so
//! the socket, sounds and calls keep running). WebView2 can do better without stopping
//! anything: ICoreWebView2_19::MemoryUsageTargetLevel = Low asks the browser to trim the
//! renderer's working set while the page keeps running (scripts, timers and sockets are not
//! suspended; TrySuspend would stop them, so it is not used). Microsoft recommends Low for an
//! app that is minimized or hidden, and Normal again before it is shown.
//!
//! Rules:
//! - Low only after the window stayed hidden or minimized for [`LOW_AFTER_MS`] (a quick
//!   minimize / restore does not trim the page the user is about to look at again);
//! - never during a call, ringing, server voice or a screen share (`busy`): trimming the
//!   working set of a page that runs audio processing could make it stutter;
//! - Normal at once on show / restore / focus or when a call starts.

/// How long the window must stay in the background before the target drops to Low.
pub const LOW_AFTER_MS: u64 = 30_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Level {
    #[default]
    Normal,
    Low,
}

/// The level the main window should have. `backgrounded`: hidden to the tray or minimized.
/// `busy`: voice:set-busy (call, ringing, server voice, screen share) or the in-call card.
pub fn wanted(backgrounded: bool, busy: bool) -> Level {
    if backgrounded && !busy {
        Level::Low
    } else {
        Level::Normal
    }
}

/// What the shell does after a change.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Step {
    /// Nothing to change.
    Keep,
    /// Set Normal now.
    NormalNow,
    /// Check again after `ms` with this generation ([`Target::due`]); Low if still wanted.
    LowLater { gen: u64, ms: u64 },
}

/// Applied level plus a generation counter for the delayed drop to Low.
#[derive(Debug, Default)]
pub struct Target {
    applied: Level,
    gen: u64,
    waiting: bool,
}

impl Target {
    pub fn applied(&self) -> Level {
        self.applied
    }

    /// The wanted level changed (or was re-evaluated).
    pub fn want(&mut self, level: Level) -> Step {
        match level {
            Level::Normal => {
                // Cancels a pending drop to Low.
                self.gen = self.gen.wrapping_add(1);
                self.waiting = false;
                if self.applied == Level::Low {
                    self.applied = Level::Normal;
                    Step::NormalNow
                } else {
                    Step::Keep
                }
            }
            Level::Low => {
                if self.applied == Level::Low || self.waiting {
                    return Step::Keep;
                }
                self.gen = self.gen.wrapping_add(1);
                self.waiting = true;
                Step::LowLater { gen: self.gen, ms: LOW_AFTER_MS }
            }
        }
    }

    /// The delay of [`Step::LowLater`] ran out: true when the shell should set Low now
    /// (nothing brought the window back or started a call in between, and `still` is the
    /// wanted level read again at that moment).
    pub fn due(&mut self, gen: u64, still: Level) -> bool {
        if gen != self.gen || !self.waiting {
            return false;
        }
        self.waiting = false;
        if still != Level::Low || self.applied == Level::Low {
            return false;
        }
        self.applied = Level::Low;
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hidden_and_idle_drops_to_low_after_the_delay() {
        assert_eq!(wanted(true, false), Level::Low);
        let mut t = Target::default();
        let Step::LowLater { gen, ms } = t.want(Level::Low) else { panic!("expected a delayed drop") };
        assert_eq!(ms, LOW_AFTER_MS);
        assert_eq!(t.applied(), Level::Normal, "not before the delay");
        assert!(t.due(gen, Level::Low));
        assert_eq!(t.applied(), Level::Low);
        // Shown again: Normal at once.
        assert_eq!(t.want(Level::Normal), Step::NormalNow);
        assert_eq!(t.applied(), Level::Normal);
        assert_eq!(t.want(Level::Normal), Step::Keep, "already normal");
    }

    #[test]
    fn a_call_or_a_visible_window_keeps_normal() {
        assert_eq!(wanted(true, true), Level::Normal, "call in the tray");
        assert_eq!(wanted(false, false), Level::Normal, "on screen");
        assert_eq!(wanted(false, true), Level::Normal);
    }

    #[test]
    fn a_quick_restore_cancels_the_pending_drop() {
        let mut t = Target::default();
        let Step::LowLater { gen, .. } = t.want(Level::Low) else { panic!() };
        assert_eq!(t.want(Level::Normal), Step::Keep, "nothing was lowered yet");
        assert!(!t.due(gen, Level::Low), "the old timer is stale");
        assert_eq!(t.applied(), Level::Normal);
    }

    #[test]
    fn repeated_background_events_keep_one_timer() {
        let mut t = Target::default();
        let Step::LowLater { gen, .. } = t.want(Level::Low) else { panic!() };
        assert_eq!(t.want(Level::Low), Step::Keep, "hide after minimize: same timer");
        assert!(t.due(gen, Level::Low));
        assert_eq!(t.want(Level::Low), Step::Keep, "already low");
    }

    #[test]
    fn a_call_starting_before_the_delay_ends_keeps_normal() {
        let mut t = Target::default();
        let Step::LowLater { gen, .. } = t.want(Level::Low) else { panic!() };
        // voice:set-busy arrives; the re-evaluation says Normal.
        assert_eq!(t.want(wanted(true, true)), Step::Keep);
        assert!(!t.due(gen, Level::Low));
        // Or the timer fires but the level read at that moment is Normal.
        let Step::LowLater { gen, .. } = t.want(Level::Low) else { panic!() };
        assert!(!t.due(gen, Level::Normal));
        assert_eq!(t.applied(), Level::Normal);
    }
}
