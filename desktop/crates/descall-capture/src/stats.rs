//! Share counters (lock-free, read by the host for telemetry and by the bench) and a small
//! latency histogram with percentiles.

use std::sync::atomic::{AtomicU64, Ordering};

use serde::Serialize;

/// Live counters of one share. All fields are monotonic except `black_streak`.
#[derive(Debug, Default)]
pub struct ShareStats {
    pub frames_arrived: AtomicU64,
    pub frames_paced_out: AtomicU64,
    pub frames_written: AtomicU64,
    pub frames_failed: AtomicU64,
    pub resizes: AtomicU64,
    pub convert_us_total: AtomicU64,
    pub convert_us_max: AtomicU64,
    pub audio_packets: AtomicU64,
    pub audio_silent_packets: AtomicU64,
    pub audio_discontinuities: AtomicU64,
    /// Consecutive (nearly) black frames: an exclusive-fullscreen game shows up as black
    /// with WGC; the page can suggest "share the monitor / use borderless" after ~2 s.
    pub black_streak: AtomicU64,
}

#[derive(Debug, Clone, Copy, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StatsSnapshot {
    pub frames_arrived: u64,
    pub frames_paced_out: u64,
    pub frames_written: u64,
    pub frames_failed: u64,
    pub resizes: u64,
    pub convert_us_avg: u64,
    pub convert_us_max: u64,
    pub audio_packets: u64,
    pub audio_silent_packets: u64,
    pub audio_discontinuities: u64,
    pub black_streak: u64,
}

impl ShareStats {
    pub fn add(c: &AtomicU64, v: u64) {
        c.fetch_add(v, Ordering::Relaxed);
    }

    pub fn record_convert(&self, us: u64) {
        self.convert_us_total.fetch_add(us, Ordering::Relaxed);
        self.convert_us_max.fetch_max(us, Ordering::Relaxed);
    }

    pub fn snapshot(&self) -> StatsSnapshot {
        let g = |c: &AtomicU64| c.load(Ordering::Relaxed);
        let written = g(&self.frames_written);
        StatsSnapshot {
            frames_arrived: g(&self.frames_arrived),
            frames_paced_out: g(&self.frames_paced_out),
            frames_written: written,
            frames_failed: g(&self.frames_failed),
            resizes: g(&self.resizes),
            convert_us_avg: g(&self.convert_us_total).checked_div(written).unwrap_or(0),
            convert_us_max: g(&self.convert_us_max),
            audio_packets: g(&self.audio_packets),
            audio_silent_packets: g(&self.audio_silent_packets),
            audio_discontinuities: g(&self.audio_discontinuities),
            black_streak: g(&self.black_streak),
        }
    }
}

/// Is an NV12 Y plane (tight, `w` x `h`) essentially black? Samples a 16x9 grid only, so it
/// costs nothing per frame. Limited range: black is 16.
pub fn looks_black(y_plane: &[u8], w: usize, h: usize) -> bool {
    if w == 0 || h == 0 || y_plane.len() < w * h {
        return false;
    }
    let mut max = 0u8;
    for gy in 0..9 {
        let row = (h * (2 * gy + 1)) / 18;
        for gx in 0..16 {
            let col = (w * (2 * gx + 1)) / 32;
            max = max.max(y_plane[row * w + col]);
        }
    }
    max <= 20
}

/// Sorted-sample latency summary (the bench keeps every sample; a share is minutes long at
/// most, 60 fps x 60 s = 3600 u32 values).
#[derive(Debug, Default, Clone)]
pub struct Samples {
    v: Vec<u32>,
}

#[derive(Debug, Clone, Copy, Default, Serialize, PartialEq)]
pub struct Summary {
    pub count: usize,
    pub min: f64,
    pub p50: f64,
    pub p95: f64,
    pub p99: f64,
    pub max: f64,
    pub mean: f64,
}

impl Samples {
    pub fn push(&mut self, v: u32) {
        self.v.push(v);
    }

    pub fn len(&self) -> usize {
        self.v.len()
    }

    pub fn is_empty(&self) -> bool {
        self.v.is_empty()
    }

    /// Nearest-rank percentiles; values are divided by `scale` (e.g. 1000 for us -> ms).
    pub fn summary(&self, scale: f64) -> Summary {
        if self.v.is_empty() {
            return Summary::default();
        }
        let mut s = self.v.clone();
        s.sort_unstable();
        let n = s.len();
        let pct = |p: f64| {
            let rank = ((p / 100.0) * n as f64).ceil().max(1.0) as usize;
            s[rank.min(n) - 1] as f64 / scale
        };
        let mean = s.iter().map(|&x| x as f64).sum::<f64>() / n as f64 / scale;
        Summary { count: n, min: s[0] as f64 / scale, p50: pct(50.0), p95: pct(95.0), p99: pct(99.0), max: s[n - 1] as f64 / scale, mean }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn percentiles() {
        let mut s = Samples::default();
        for i in 1..=100 {
            s.push(i * 1000);
        }
        let m = s.summary(1000.0);
        assert_eq!((m.count, m.min, m.p50, m.p95, m.p99, m.max), (100, 1.0, 50.0, 95.0, 99.0, 100.0));
        assert!((m.mean - 50.5).abs() < 1e-9);
        assert_eq!(Samples::default().summary(1.0), Summary::default());
    }

    #[test]
    fn counters_snapshot() {
        let st = ShareStats::default();
        ShareStats::add(&st.frames_written, 4);
        st.record_convert(1000);
        st.record_convert(3000);
        let s = st.snapshot();
        assert_eq!((s.frames_written, s.convert_us_avg, s.convert_us_max), (4, 1000, 3000));
        assert_eq!(ShareStats::default().snapshot().convert_us_avg, 0);
    }

    #[test]
    fn black_detection() {
        let mut y = vec![16u8; 64 * 36];
        assert!(looks_black(&y, 64, 36));
        // Grid point (gx 8, gy 4): row 36*9/18 = 18, col 64*17/32 = 34.
        y[18 * 64 + 34] = 200;
        assert!(!looks_black(&y, 64, 36));
        assert!(!looks_black(&[0; 3], 64, 36));
        assert!(!looks_black(&vec![128u8; 64 * 36], 64, 36));
    }
}
