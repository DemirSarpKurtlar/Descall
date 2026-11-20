//! "The shared surface went away" signal, portable so the logic is unit-tested.
//!
//! Two sources can report it: WGC's `GraphicsCaptureItem.Closed` event, and a watchdog
//! that polls whether the window / monitor still exists (WGC does not always raise
//! `Closed`, e.g. for an item created on a thread without a dispatcher). Whichever comes
//! first ends the share with "source-closed"; the other is ignored. Neither fires once
//! the share is being stopped on purpose.

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

/// How often the watchdog checks the source (the share ends within about this long).
pub const WATCH_INTERVAL: Duration = Duration::from_millis(100);

#[derive(Debug, Default)]
pub struct EndLatch {
    fired: AtomicBool,
    stopping: AtomicBool,
}

impl EndLatch {
    pub fn new() -> Self {
        Self::default()
    }

    /// The source is gone. True exactly once, and never after [`EndLatch::stop`].
    pub fn fire(&self) -> bool {
        !self.stopping.load(Ordering::Acquire) && !self.fired.swap(true, Ordering::AcqRel)
    }

    pub fn fired(&self) -> bool {
        self.fired.load(Ordering::Acquire)
    }

    /// The share is being stopped on purpose: no more "source-closed".
    pub fn stop(&self) {
        self.stopping.store(true, Ordering::Release);
    }

    pub fn stopping(&self) -> bool {
        self.stopping.load(Ordering::Acquire)
    }
}

/// Watchdog loop: every `interval`, ask `alive()`; when it says no, fire the latch and call
/// `on_lost` (once). Returns when the source is lost, the latch fired from elsewhere, or
/// the share is stopping. `sleep` is injectable for tests.
pub fn watch<A, L, S>(latch: &EndLatch, interval: Duration, mut alive: A, on_lost: L, mut sleep: S)
where
    A: FnMut() -> bool,
    L: FnOnce(),
    S: FnMut(Duration),
{
    loop {
        if latch.stopping() || latch.fired() {
            return;
        }
        if !alive() {
            if latch.fire() {
                on_lost();
            }
            return;
        }
        sleep(interval);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;

    #[test]
    fn fires_once_and_not_while_stopping() {
        let l = EndLatch::new();
        assert!(l.fire());
        assert!(!l.fire(), "second source is ignored");
        let l = EndLatch::new();
        l.stop();
        assert!(!l.fire(), "a deliberate stop is not source-closed");
        assert!(!l.fired());
    }

    #[test]
    fn watchdog_ends_when_the_source_disappears() {
        let l = EndLatch::new();
        let checks = Cell::new(0);
        let lost = Cell::new(0);
        let slept = Cell::new(Duration::ZERO);
        watch(&l, WATCH_INTERVAL, || {
            checks.set(checks.get() + 1);
            checks.get() < 4 // alive for three checks, then the window is destroyed
        }, || lost.set(lost.get() + 1), |d| slept.set(slept.get() + d));
        assert_eq!((checks.get(), lost.get()), (4, 1));
        assert_eq!(slept.get(), WATCH_INTERVAL * 3, "ends within one interval of the loss");
        assert!(l.fired());
    }

    #[test]
    fn watchdog_defers_to_closed_event_and_to_stop() {
        // WGC's Closed already fired: the watchdog must not report a second time.
        let l = EndLatch::new();
        assert!(l.fire());
        let lost = Cell::new(false);
        watch(&l, WATCH_INTERVAL, || false, || lost.set(true), |_| {});
        assert!(!lost.get());
        // Stopped on purpose while alive: the loop exits without firing.
        let l = EndLatch::new();
        let n = Cell::new(0);
        watch(&l, WATCH_INTERVAL, || {
            n.set(n.get() + 1);
            if n.get() == 2 {
                l.stop();
            }
            true
        }, || lost.set(true), |_| {});
        assert!(!lost.get() && !l.fired());
    }
}
