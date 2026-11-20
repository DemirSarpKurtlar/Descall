//! Frame pacer for the capture callback: caps the frame rate at `max_fps` without losing
//! frames to the compositor's refresh grid.
//!
//! WGC delivers frames on DWM composition ticks. On a 144 Hz monitor the ticks are 6.94 ms
//! apart, so 60 fps content arrives 13.9 ms or 20.8 ms apart (16.67 ms on average). A pacer
//! that drops every frame closer than 90 % of the period to the previous one throws away the
//! 13.9 ms frames, and a MinUpdateInterval of exactly one period makes the compositor wait
//! for the third tick every time (20.8 ms, 48 fps). Both lost about 20 % of the frames on a
//! 144 Hz desktop.
//!
//! This pacer keeps a deadline grid instead: a frame is taken when it arrives no more than a
//! quarter period before its deadline, and the next deadline is one period after the
//! previous deadline, not after the frame. Early and late frames average out, so 60 fps
//! content on any refresh rate passes whole, and a faster source is still capped at
//! `max_fps` on average. After a pause (nothing new on screen) the grid restarts at the next
//! frame, so the first frame after the pause is never held back and no burst follows.

/// How early (as a fraction of the period) a frame may arrive and still be taken.
const EARLY_DIV: i64 = 4;

#[derive(Debug, Clone, Default)]
pub struct Pacer {
    next_due: Option<i64>,
}

impl Pacer {
    pub fn new() -> Self {
        Pacer { next_due: None }
    }

    /// `ts` and `interval` in 100 ns units (frame SystemRelativeTime, frame period).
    /// Returns true when this frame should be delivered.
    pub fn admit(&mut self, ts: i64, interval: i64) -> bool {
        let interval = interval.max(1);
        let Some(due) = self.next_due else {
            self.next_due = Some(ts.saturating_add(interval));
            return true;
        };
        if ts.saturating_add(interval / EARLY_DIV) < due {
            return false;
        }
        // More than a whole period late: the source paused or skipped. Restart the grid at
        // this frame rather than letting the next frames catch up in a burst. (Up to a period
        // late is just the refresh grid: a 60 fps source on a 75 Hz monitor lands 10 ms late
        // now and then, and keeping the grid lets the next frames through.)
        let next = if ts > due.saturating_add(interval) { ts.saturating_add(interval) } else { due.saturating_add(interval) };
        self.next_due = Some(next);
        true
    }

    /// Forget the grid (resize, rate change); the next frame is always taken.
    pub fn reset(&mut self) {
        self.next_due = None;
    }
}

/// MinUpdateInterval for a frame period: half the period, so the compositor still never
/// delivers far above the cap, but its refresh grid can no longer push a 60 fps source down to
/// every third tick. The pacer above does the exact capping.
pub fn min_update_interval_100ns(interval: i64) -> i64 {
    (interval / 2).max(1)
}

#[cfg(test)]
mod tests {
    use super::*;

    const MS: f64 = 10_000.0;

    /// Frames of a `src_fps` source as a compositor at `hz` delivers them: each new frame at
    /// the first refresh tick at or after it was produced (duplicates merged).
    fn delivered(src_fps: f64, hz: f64, seconds: f64) -> Vec<i64> {
        let tick = 1000.0 / hz;
        let mut out: Vec<i64> = Vec::new();
        let n = (seconds * src_fps) as usize;
        for i in 0..n {
            let produced = i as f64 * 1000.0 / src_fps;
            let at = (produced / tick).ceil() * tick;
            let t = (at * MS) as i64;
            if out.last() != Some(&t) {
                out.push(t);
            }
        }
        out
    }

    fn admitted(ts: &[i64], fps: u32) -> usize {
        let interval = crate::presets::frame_interval_100ns(fps);
        let mut p = Pacer::new();
        ts.iter().filter(|&&t| p.admit(t, interval)).count()
    }

    #[test]
    fn sixty_fps_content_passes_whole_on_common_refresh_rates() {
        for hz in [60.0, 75.0, 120.0, 144.0, 165.0, 240.0] {
            let ts = delivered(60.0, hz, 10.0);
            let got = admitted(&ts, 60);
            // Every distinct frame the compositor delivered (a 60 Hz source on a 75 Hz grid
            // cannot lose anything either).
            assert!(got as f64 >= ts.len() as f64 * 0.99, "{hz} Hz: {got} of {} frames", ts.len());
        }
    }

    #[test]
    fn fast_source_is_capped_at_max_fps() {
        for hz in [144.0, 165.0, 240.0] {
            let ts = delivered(hz, hz, 10.0);
            let got = admitted(&ts, 60) as f64 / 10.0;
            assert!((58.0..=61.0).contains(&got), "{hz} Hz source: {got} fps");
            let got30 = admitted(&ts, 30) as f64 / 10.0;
            assert!((29.0..=31.0).contains(&got30), "{hz} Hz source at 30: {got30} fps");
        }
    }

    #[test]
    fn the_old_rule_lost_a_fifth_of_the_frames_at_144_hz() {
        // Regression guard for the bug this pacer replaces: drop when closer than 90 % of
        // the period to the previous frame.
        let ts = delivered(60.0, 144.0, 10.0);
        let interval = crate::presets::frame_interval_100ns(60);
        let mut last = i64::MIN;
        let old = ts
            .iter()
            .filter(|&&t| {
                if last != i64::MIN && t - last < interval * 9 / 10 {
                    return false;
                }
                last = t;
                true
            })
            .count();
        assert!((old as f64) < ts.len() as f64 * 0.9, "old rule kept {old} of {}", ts.len());
        assert!(admitted(&ts, 60) as f64 >= ts.len() as f64 * 0.99);
    }

    #[test]
    fn no_burst_after_a_pause() {
        let interval = crate::presets::frame_interval_100ns(60);
        let mut p = Pacer::new();
        assert!(p.admit(0, interval));
        // One second of nothing new on screen, then a 144 Hz burst of changes.
        let start = 10_000_000;
        let tick = (1000.0 / 144.0 * MS) as i64;
        let got = (0..144).filter(|i| p.admit(start + i * tick, interval)).count();
        assert!((59..=61).contains(&got), "{got} frames in the second after the pause");
        // The first frame after the pause is taken at once.
        let mut q = Pacer::new();
        q.admit(0, interval);
        assert!(q.admit(start, interval));
    }

    #[test]
    fn reset_takes_the_next_frame() {
        let interval = crate::presets::frame_interval_100ns(60);
        let mut p = Pacer::new();
        assert!(p.admit(0, interval));
        assert!(!p.admit(1, interval));
        p.reset();
        assert!(p.admit(2, interval));
    }

    #[test]
    fn min_update_interval_is_half_the_period() {
        assert_eq!(min_update_interval_100ns(166_666), 83_333);
        assert_eq!(min_update_interval_100ns(0), 1);
    }
}
