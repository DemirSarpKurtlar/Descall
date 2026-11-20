//! QPC clock in the units WGC and WASAPI use. `Direct3D11CaptureFrame.SystemRelativeTime`
//! is QPC converted to 100 ns, so "now" on the same scale gives frame latency directly.

use std::sync::OnceLock;

use windows::Win32::System::Performance::{QueryPerformanceCounter, QueryPerformanceFrequency};

fn freq() -> i64 {
    static F: OnceLock<i64> = OnceLock::new();
    *F.get_or_init(|| {
        let mut f = 0i64;
        let _ = unsafe { QueryPerformanceFrequency(&mut f) };
        f.max(1)
    })
}

pub fn qpc() -> i64 {
    let mut c = 0i64;
    let _ = unsafe { QueryPerformanceCounter(&mut c) };
    c
}

/// QPC ticks to 100 ns units without overflow for any realistic uptime.
pub fn ticks_to_100ns(ticks: i64) -> i64 {
    let f = freq();
    (ticks / f) * 10_000_000 + (ticks % f) * 10_000_000 / f
}

/// Now, in 100 ns units (same scale as SystemRelativeTime).
pub fn now_100ns() -> i64 {
    ticks_to_100ns(qpc())
}

/// Now, in microseconds (the ring's timestamp unit).
pub fn now_us() -> u64 {
    (now_100ns() / 10) as u64
}
