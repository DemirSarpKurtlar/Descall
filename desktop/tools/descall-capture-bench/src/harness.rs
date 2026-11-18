//! Drives the production `ShareHost` with an in-memory "shared buffer" and a sink that plays
//! the page's part: on every wake it copies the frame out of the ring exactly like the
//! page's VideoFrame constructor does, then records timings, sizes and barcode values.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use descall_capture::bridge::{StartInfo, StartRequest, UpdateRequest};
use descall_capture::host::{HostSink, ShareHost};
use descall_capture::ring::{RingReader, VideoFrameCopy};
use descall_capture::stats::{Samples, StatsSnapshot};

use crate::barcode;

#[derive(Default)]
pub struct Collector {
    pub frames: u64,
    pub dims: (u32, u32),
    /// written - arrival: what the native lane adds (convert + readback + ring copy), us.
    pub added_us: Samples,
    /// arrival - composition time: Windows' own WGC delivery, us.
    pub wgc_us: Samples,
    /// written - Present() call time from the barcode: glass-to-ring, us.
    pub e2e_us: Samples,
    pub counters: Vec<u32>,
    pub undecoded: u64,
    pub keep_last: bool,
    pub last: Option<VideoFrameCopy>,
    pub record_audio: bool,
    pub audio: Vec<f32>,
    pub audio_packets: u64,
    pub ended: Option<(String, Instant)>,
}

/// Plays the page. It also owns the "shared buffer": capture callbacks hold an Arc of the
/// sink, so the memory they write and read can never be freed under them.
pub struct BenchSink {
    mem: Box<[std::cell::UnsafeCell<u8>]>,
    last_audio: AtomicU64,
    pub c: Mutex<Collector>,
}

// The ring is written through a raw pointer by the capture threads (the production
// contract: one writer per region, seqlock readers), exactly like the WebView2 buffer.
unsafe impl Sync for BenchSink {}

impl BenchSink {
    fn base(&self) -> *mut u8 {
        self.mem.as_ptr() as *mut u8
    }

    fn mem(&self) -> &[u8] {
        unsafe { std::slice::from_raw_parts(self.base() as *const u8, self.mem.len()) }
    }

    pub fn reset(&self) {
        if let Ok(mut c) = self.c.lock() {
            let (keep, rec) = (c.keep_last, c.record_audio);
            *c = Collector { keep_last: keep, record_audio: rec, ..Default::default() };
        }
    }

    pub fn frames(&self) -> u64 {
        self.c.lock().map(|c| c.frames).unwrap_or(0)
    }

    pub fn dims(&self) -> (u32, u32) {
        self.c.lock().map(|c| c.dims).unwrap_or((0, 0))
    }

    pub fn ended(&self) -> Option<(String, Instant)> {
        self.c.lock().ok().and_then(|c| c.ended.clone())
    }
}

impl HostSink for BenchSink {
    fn wake(&self, _id: u32, kind: char, seq: u64) {
        let Some(r) = RingReader::new(self.mem()) else { return };
        let Ok(mut c) = self.c.lock() else { return };
        match kind {
            'v' => {
                // Like the page: copy the frame out (VideoFrame copies), drop it if torn.
                let Some(f) = r.read_video(seq) else { return };
                c.frames += 1;
                c.dims = (f.width, f.height);
                c.added_us.push(f.written_us.saturating_sub(f.arrival_us) as u32);
                c.wgc_us.push(f.arrival_us.saturating_sub(f.timestamp_us).min(u32::MAX as u64) as u32);
                match barcode::decode(&f.nv12, f.width as usize, f.height as usize, f.width as usize) {
                    Some((present_us, counter)) => {
                        if f.written_us >= present_us && f.written_us - present_us < 1_000_000 {
                            c.e2e_us.push((f.written_us - present_us) as u32);
                        }
                        c.counters.push(counter);
                    }
                    None => c.undecoded += 1,
                }
                if c.keep_last {
                    c.last = Some(f);
                }
            }
            'a' => {
                let last = self.last_audio.load(Ordering::Relaxed);
                let (pkts, new_last) = r.read_audio_since(last);
                self.last_audio.store(new_last, Ordering::Relaxed);
                c.audio_packets += pkts.len() as u64;
                if c.record_audio {
                    for p in pkts {
                        c.audio.extend_from_slice(&p.samples);
                    }
                }
            }
            _ => {}
        }
    }

    fn ended(&self, _id: u32, reason: &str) {
        if let Ok(mut c) = self.c.lock() {
            c.ended = Some((reason.to_string(), Instant::now()));
        }
    }
}

pub struct Harness {
    pub host: ShareHost,
    pub sink: Arc<BenchSink>,
    pub info: StartInfo,
}

impl Harness {
    pub fn start(req: &StartRequest, keep_last: bool) -> Result<Harness, String> {
        let host = ShareHost::new();
        let plan = host.plan(req).map_err(|e| format!("plan: {e}"))?;
        let mem: Box<[std::cell::UnsafeCell<u8>]> = (0..plan.layout.total).map(|_| std::cell::UnsafeCell::new(0u8)).collect();
        let sink = Arc::new(BenchSink { mem, last_audio: AtomicU64::new(0), c: Mutex::new(Collector { keep_last, ..Default::default() }) });
        let (base, len) = (sink.base(), sink.mem.len());
        // Safety: the sink (and with it the memory) lives as long as any capture callback.
        let info = unsafe { host.start(plan, base, len, sink.clone()) }.map_err(|e| format!("start: {e}"))?;
        Ok(Harness { host, sink, info })
    }

    pub fn stats(&self) -> StatsSnapshot {
        self.host.stats().unwrap_or_default()
    }

    pub fn update(&self, u: &UpdateRequest) -> bool {
        self.host.update(u)
    }

    pub fn stop(self) {
        self.host.stop("stopped");
    }
}

/// Wait until `cond` holds or `timeout` passes.
pub fn wait_until(timeout: Duration, mut cond: impl FnMut() -> bool) -> bool {
    let t0 = Instant::now();
    while t0.elapsed() < timeout {
        if cond() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(10));
    }
    cond()
}

pub fn sleep_ms(ms: u64) {
    std::thread::sleep(Duration::from_millis(ms));
}

/// Process CPU time (user + kernel) in 100 ns units.
pub fn process_cpu_100ns() -> u64 {
    use windows::Win32::Foundation::FILETIME;
    use windows::Win32::System::Threading::{GetCurrentProcess, GetProcessTimes};
    let (mut c, mut e, mut k, mut u) = (FILETIME::default(), FILETIME::default(), FILETIME::default(), FILETIME::default());
    unsafe {
        let _ = GetProcessTimes(GetCurrentProcess(), &mut c, &mut e, &mut k, &mut u);
    }
    let ft = |f: FILETIME| ((f.dwHighDateTime as u64) << 32) | f.dwLowDateTime as u64;
    ft(k) + ft(u)
}

pub fn logical_cpus() -> u32 {
    std::thread::available_parallelism().map(|n| n.get() as u32).unwrap_or(1)
}

/// CPU use of this process over `f`, in percent of the whole machine (Task Manager style).
pub fn measure_cpu<T>(f: impl FnOnce() -> T) -> (T, f64, Duration) {
    let c0 = process_cpu_100ns();
    let t0 = Instant::now();
    let r = f();
    let wall = t0.elapsed();
    let used = (process_cpu_100ns() - c0) as f64 / 10_000_000.0;
    (r, 100.0 * used / (wall.as_secs_f64() * logical_cpus() as f64), wall)
}
