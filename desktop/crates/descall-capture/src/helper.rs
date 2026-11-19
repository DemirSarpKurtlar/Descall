//! Out-of-process capture: both halves. Protocol and the why: helper_proto.rs.
//!
//! App side ([`HelperShare`]): creates a named file mapping for the frame ring, starts the
//! helper (`descall-capture-host.exe`, or any exe that calls [`host_main`] when given
//! [`HOST_ARG`]) inside a kill-on-close job object, and forwards every announced frame and
//! audio packet from the mapping into the WebView2 shared buffer. If the helper dies
//! (device removed, a crash inside GraphicsCapture.dll) it is restarted on the same mapping
//! and the share goes on; after too many restarts the share ends with "device-lost" or
//! "capture-failed".
//!
//! Helper side ([`host_main`]): runs the normal in-process pipeline (pipeline.rs) into the
//! mapping and reports over stdout.

use std::io::{BufRead, BufReader, Write};
use std::os::windows::io::AsRawHandle;
use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use windows::core::HSTRING;
use windows::Win32::Foundation::{CloseHandle, HANDLE, INVALID_HANDLE_VALUE};
use windows::Win32::System::JobObjects::*;
use windows::Win32::System::Memory::*;

use crate::bridge::UpdateRequest;
pub use crate::helper_proto::HOST_ARG;
use crate::helper_proto::{end_reason_after_exit, Command, DeviceLost, Event, HelperJob, HelperReady, RestartPolicy, EXIT_DEVICE_LOST};
use crate::pipeline::{self, ShareRequest};
use crate::ring::{FrameTimes, Layout, RingReader, RingWriter};
use crate::stats::StatsSnapshot;
use crate::wgc::Target;

pub const HELPER_EXE: &str = "descall-capture-host.exe";
const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const READY_TIMEOUT: Duration = Duration::from_secs(10);

/// How to start the helper.
#[derive(Debug, Clone, PartialEq)]
pub struct HelperSpawn {
    pub exe: PathBuf,
    pub args: Vec<String>,
}

/// `descall-capture-host.exe` next to the running exe, unless `DESCALL_CAPTURE_INPROC=1`.
pub fn default_spawn() -> Option<HelperSpawn> {
    if std::env::var("DESCALL_CAPTURE_INPROC").map(|v| v == "1").unwrap_or(false) {
        return None;
    }
    let exe = std::env::current_exe().ok()?.parent()?.join(HELPER_EXE);
    exe.is_file().then_some(HelperSpawn { exe, args: Vec::new() })
}

/* ---------------------------------------------------------------- shared memory */

struct Mapping {
    handle: HANDLE,
    view: MEMORY_MAPPED_VIEW_ADDRESS,
    len: usize,
}

// The view is plain shared memory; the ring's seqlock rules govern access.
unsafe impl Send for Mapping {}
unsafe impl Sync for Mapping {}

impl Mapping {
    fn create(name: &str, len: usize) -> crate::Result<Mapping> {
        let handle = unsafe { CreateFileMappingW(INVALID_HANDLE_VALUE, None, PAGE_READWRITE, (len as u64 >> 32) as u32, len as u32, &HSTRING::from(name))? };
        Self::map(handle, len)
    }

    fn open(name: &str, len: usize) -> crate::Result<Mapping> {
        let handle = unsafe { OpenFileMappingW(FILE_MAP_ALL_ACCESS.0, false, &HSTRING::from(name))? };
        Self::map(handle, len)
    }

    fn map(handle: HANDLE, len: usize) -> crate::Result<Mapping> {
        let view = unsafe { MapViewOfFile(handle, FILE_MAP_ALL_ACCESS, 0, 0, len) };
        if view.Value.is_null() {
            let e = windows::core::Error::from_thread();
            unsafe {
                let _ = CloseHandle(handle);
            }
            return Err(e.into());
        }
        Ok(Mapping { handle, view, len })
    }

    fn base(&self) -> *mut u8 {
        self.view.Value as *mut u8
    }

    fn bytes(&self) -> &[u8] {
        unsafe { std::slice::from_raw_parts(self.base() as *const u8, self.len) }
    }
}

impl Drop for Mapping {
    fn drop(&mut self) {
        unsafe {
            let _ = UnmapViewOfFile(self.view);
            let _ = CloseHandle(self.handle);
        }
    }
}

/// One job object for all helpers of this process: KILL_ON_JOB_CLOSE, so a helper never
/// outlives the app (the handle closes when the app exits, however it exits).
fn job() -> Option<HANDLE> {
    static JOB: OnceLock<Option<isize>> = OnceLock::new();
    JOB.get_or_init(|| unsafe {
        let h = CreateJobObjectW(None, None).ok()?;
        let mut info = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        SetInformationJobObject(h, JobObjectExtendedLimitInformation, &info as *const _ as *const _, std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32).ok()?;
        Some(h.0 as isize)
    })
    .map(|h| HANDLE(h as *mut _))
}

/* ---------------------------------------------------------------- app side */

enum Msg {
    Ev(Event),
    Eof,
}

struct Running {
    child: Child,
    rx: Receiver<Msg>,
}

struct Inner {
    spawn: HelperSpawn,
    job: HelperJob,
    mapping: Mapping,
    target: Arc<Mutex<RingWriter>>,
    sink: Arc<dyn pipeline::Sink>,
    stdin: Mutex<Option<ChildStdin>>,
    child_pid: AtomicU64,
    stopping: AtomicBool,
    closed: AtomicBool,
    device_lost: AtomicBool,
    failed: AtomicBool,
    restarts: AtomicU64,
    stats: Mutex<StatsSnapshot>,
}

impl Inner {
    /// Start a helper on the mapping and wait for "ready".
    fn launch(&self) -> crate::Result<(Running, HelperReady)> {
        let mut child = std::process::Command::new(&self.spawn.exe)
            .args(&self.spawn.args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| crate::CaptureError::Helper(format!("spawn {}: {e}", self.spawn.exe.display())))?;
        if let Some(j) = job() {
            unsafe {
                let _ = AssignProcessToJobObject(j, HANDLE(child.as_raw_handle()));
            }
        }
        self.child_pid.store(child.id() as u64, Ordering::Release);
        let mut stdin = child.stdin.take().ok_or_else(|| crate::CaptureError::Helper("no stdin".into()))?;
        let stdout = child.stdout.take().ok_or_else(|| crate::CaptureError::Helper("no stdout".into()))?;
        let (tx, rx) = mpsc::channel();
        let _ = std::thread::Builder::new().name("descall-helper-reader".into()).spawn(move || {
            for line in BufReader::new(stdout).lines() {
                let Ok(line) = line else { break };
                if let Some(e) = Event::parse(&line) {
                    if tx.send(Msg::Ev(e)).is_err() {
                        return;
                    }
                }
            }
            let _ = tx.send(Msg::Eof);
        });
        let start = Command::Start(Box::new(self.job.clone())).line();
        if writeln!(stdin, "{start}").and_then(|_| stdin.flush()).is_err() {
            let _ = child.kill();
            let _ = child.wait();
            return Err(crate::CaptureError::Helper("helper closed its input".into()));
        }
        let t0 = Instant::now();
        loop {
            let left = READY_TIMEOUT.saturating_sub(t0.elapsed());
            match rx.recv_timeout(left) {
                Ok(Msg::Ev(Event::Ready(r))) => {
                    if let Ok(mut s) = self.stdin.lock() {
                        *s = Some(stdin);
                    }
                    return Ok((Running { child, rx }, r));
                }
                Ok(Msg::Ev(Event::Error(e))) => {
                    let _ = child.wait();
                    return Err(crate::CaptureError::Helper(e));
                }
                Ok(Msg::Ev(Event::Lost(d))) => crate::d3d::record_device_lost(*d),
                Ok(Msg::Ev(_)) => {}
                Ok(Msg::Eof) | Err(RecvTimeoutError::Disconnected) => {
                    let code = child.wait().ok().and_then(|s| s.code()).unwrap_or(-1);
                    return Err(crate::CaptureError::Helper(format!("helper exited during start (0x{:08X})", code as u32)));
                }
                Err(RecvTimeoutError::Timeout) => {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(crate::CaptureError::Helper("helper did not start in 10 s".into()));
                }
            }
        }
    }

    fn forward_video(&self, seq: u64) {
        let Some(r) = RingReader::new(self.mapping.bytes()) else { return };
        let Some((m, payload)) = r.video_view(seq) else { return };
        let written = crate::clock::now_us();
        let t = FrameTimes { timestamp_us: m.timestamp_us, arrival_us: m.arrival_us, written_us: written };
        let out = self.target.lock().ok().and_then(|mut w| w.write_nv12(m.width, m.height, payload, m.width as usize, t).ok());
        // Seqlock: drop the announcement if the helper started rewriting that slot meanwhile
        // (the next frame replaces it in the page's ring).
        if let (Some(s), true) = (out, r.video_still(seq)) {
            self.sink.video(s);
        }
    }

    fn forward_audio(&self, last: &mut u64) {
        let Some(r) = RingReader::new(self.mapping.bytes()) else { return };
        let (pkts, new_last) = r.read_audio_since(*last);
        *last = new_last;
        for p in pkts {
            let s = self.target.lock().ok().and_then(|mut w| w.write_audio(&p.samples, p.frames, p.timestamp_us, p.flags).ok());
            if let Some(s) = s {
                self.sink.audio(s);
            }
        }
    }

    /// Forwarder: runs until the share stops or ends.
    fn run(self: Arc<Self>, mut cur: Running) {
        let mut policy = RestartPolicy::default();
        let mut last_audio = 0u64;
        let mut last_end: Option<String> = None;
        loop {
            match cur.rx.recv() {
                Ok(Msg::Ev(Event::Video(s))) => self.forward_video(s),
                Ok(Msg::Ev(Event::Audio(_))) => self.forward_audio(&mut last_audio),
                Ok(Msg::Ev(Event::Stats(s))) => {
                    if let Ok(mut st) = self.stats.lock() {
                        *st = s;
                    }
                }
                Ok(Msg::Ev(Event::Lost(d))) => {
                    self.device_lost.store(true, Ordering::Release);
                    crate::d3d::record_device_lost(*d);
                }
                Ok(Msg::Ev(Event::End(r))) => last_end = Some(r),
                Ok(Msg::Ev(Event::Ready(_))) | Ok(Msg::Ev(Event::Error(_))) => {}
                Ok(Msg::Eof) | Err(_) => {
                    let code = cur.child.wait().ok().and_then(|s| s.code()).unwrap_or(-1);
                    if self.stopping.load(Ordering::Acquire) {
                        return;
                    }
                    if let Some(reason) = end_reason_after_exit(last_end.as_deref()) {
                        if reason == "source-closed" {
                            self.closed.store(true, Ordering::Release);
                        }
                        self.sink.source_closed();
                        return;
                    }
                    if last_end.is_none() && code != EXIT_DEVICE_LOST {
                        // Died without a word: most likely GraphicsCapture threw on a removed
                        // device before our watchdog saw it. Keep a record for the report.
                        crate::d3d::record_device_lost(DeviceLost { reason: format!("helper exit 0x{:08X}", code as u32), seen_in: "helper exit".into(), ..Default::default() });
                    }
                    if !policy.allow(Instant::now()) {
                        if last_end.as_deref() == Some("device-lost") || code == EXIT_DEVICE_LOST {
                            self.device_lost.store(true, Ordering::Release);
                        } else {
                            self.failed.store(true, Ordering::Release);
                        }
                        self.sink.source_closed();
                        return;
                    }
                    self.restarts.fetch_add(1, Ordering::AcqRel);
                    log::warn!("capture helper exited (0x{:08X}, {:?}); restarting", code as u32, last_end);
                    match self.launch() {
                        Ok((next, _)) => {
                            cur = next;
                            last_audio = 0;
                            last_end = None;
                        }
                        Err(e) => {
                            log::error!("capture helper restart failed: {e}");
                            self.failed.store(true, Ordering::Release);
                            self.sink.source_closed();
                            return;
                        }
                    }
                }
            }
        }
    }

    fn send(&self, c: &Command) -> bool {
        match self.stdin.lock() {
            Ok(mut g) => match g.as_mut() {
                Some(s) => writeln!(s, "{}", c.line()).and_then(|_| s.flush()).is_ok(),
                None => false,
            },
            Err(_) => false,
        }
    }
}

/// A share whose capture runs in the helper process.
pub struct HelperShare {
    inner: Arc<Inner>,
    forwarder: Option<JoinHandle<()>>,
    pub ready: HelperReady,
}

impl HelperShare {
    /// `target` is the page's ring (the WebView2 shared buffer).
    pub fn start(spawn: HelperSpawn, req: &ShareRequest, layout: Layout, target: Arc<Mutex<RingWriter>>, sink: Arc<dyn pipeline::Sink>) -> crate::Result<HelperShare> {
        static NEXT: AtomicU64 = AtomicU64::new(1);
        let name = format!("Local\\DescallCapture-{}-{}-{}", std::process::id(), NEXT.fetch_add(1, Ordering::Relaxed), crate::clock::qpc());
        let mapping = Mapping::create(&name, layout.total)?;
        let (target_kind, handle) = match req.target {
            Target::Monitor(h) => ("monitor", h),
            Target::Window(h) => ("window", h),
        };
        let job = HelperJob {
            mapping: name,
            bytes: layout.total,
            max_w: layout.max_w,
            max_h: layout.max_h,
            target_kind: target_kind.into(),
            handle,
            quality: req.quality,
            cursor: req.cursor,
            audio: req.system_audio,
            exclude_pid: std::process::id(),
        };
        let inner = Arc::new(Inner {
            spawn,
            job,
            mapping,
            target,
            sink,
            stdin: Mutex::new(None),
            child_pid: AtomicU64::new(0),
            stopping: AtomicBool::new(false),
            closed: AtomicBool::new(false),
            device_lost: AtomicBool::new(false),
            failed: AtomicBool::new(false),
            restarts: AtomicU64::new(0),
            stats: Mutex::new(StatsSnapshot::default()),
        });
        let (running, ready) = inner.launch()?;
        let i2 = inner.clone();
        let forwarder = std::thread::Builder::new().name("descall-helper-forward".into()).spawn(move || i2.run(running)).map_err(|e| crate::CaptureError::Helper(e.to_string()))?;
        Ok(HelperShare { inner, forwarder: Some(forwarder), ready })
    }

    pub fn detach_ring(&self) {
        if let Ok(mut r) = self.inner.target.lock() {
            r.detach();
        }
    }

    /// Ask the helper to stop, give it 3 s, then kill it; join the forwarder.
    pub fn stop(mut self) {
        self.detach_ring();
        self.inner.stopping.store(true, Ordering::Release);
        let _ = self.inner.send(&Command::Stop);
        if let Ok(mut g) = self.inner.stdin.lock() {
            g.take(); // EOF as well
        }
        if let Some(f) = self.forwarder.take() {
            let t0 = Instant::now();
            while !f.is_finished() && t0.elapsed() < Duration::from_secs(3) {
                std::thread::sleep(Duration::from_millis(5));
            }
            if !f.is_finished() {
                kill_pid(self.inner.child_pid.load(Ordering::Acquire) as u32);
            }
            let _ = f.join();
        }
    }

    pub fn update(&self, u: &UpdateRequest) -> bool {
        self.inner.send(&Command::Update(u.clone()))
    }

    pub fn stats(&self) -> StatsSnapshot {
        let mut s = self.inner.stats.lock().map(|s| *s).unwrap_or_default();
        s.helper_restarts = self.inner.restarts.load(Ordering::Acquire);
        s
    }

    pub fn source_closed(&self) -> bool {
        self.inner.closed.load(Ordering::Acquire)
    }

    pub fn device_lost(&self) -> bool {
        self.inner.device_lost.load(Ordering::Acquire)
    }

    pub fn failed(&self) -> bool {
        self.inner.failed.load(Ordering::Acquire)
    }
}

fn kill_pid(pid: u32) {
    use windows::Win32::System::Threading::{OpenProcess, TerminateProcess, PROCESS_TERMINATE};
    if pid == 0 {
        return;
    }
    unsafe {
        if let Ok(h) = OpenProcess(PROCESS_TERMINATE, false, pid) {
            let _ = TerminateProcess(h, 1);
            let _ = CloseHandle(h);
        }
    }
}

/* ---------------------------------------------------------------- helper side */

enum HostMsg {
    Cmd(String),
    Eof,
    SourceClosed,
    Tick,
}

fn emit(e: &Event) {
    let mut o = std::io::stdout().lock();
    let _ = writeln!(o, "{}", e.line());
    let _ = o.flush();
}

struct HelperSink {
    tx: Mutex<mpsc::Sender<HostMsg>>,
}

impl pipeline::Sink for HelperSink {
    fn video(&self, seq: u64) {
        emit(&Event::Video(seq));
    }

    fn audio(&self, seq: u64) {
        emit(&Event::Audio(seq));
    }

    fn source_closed(&self) {
        if let Ok(tx) = self.tx.lock() {
            let _ = tx.send(HostMsg::SourceClosed);
        }
    }
}

/// Entry point of the capture helper process. Returns the exit code.
pub fn host_main() -> i32 {
    crate::imaging::ensure_com();
    let (tx, rx) = mpsc::channel::<HostMsg>();
    {
        let tx = tx.clone();
        let _ = std::thread::Builder::new().name("descall-host-stdin".into()).spawn(move || {
            for line in std::io::stdin().lock().lines() {
                let Ok(line) = line else { break };
                if tx.send(HostMsg::Cmd(line)).is_err() {
                    return;
                }
            }
            let _ = tx.send(HostMsg::Eof);
        });
    }
    let job = match rx.recv() {
        Ok(HostMsg::Cmd(l)) => match Command::parse(&l) {
            Some(Command::Start(j)) => *j,
            _ => {
                emit(&Event::Error("expected a start command".into()));
                return 2;
            }
        },
        _ => return 2,
    };
    let layout = Layout::new(job.max_w, job.max_h);
    if layout.total > job.bytes {
        emit(&Event::Error(format!("mapping too small: {} < {}", job.bytes, layout.total)));
        return 2;
    }
    let mapping = match Mapping::open(&job.mapping, job.bytes) {
        Ok(m) => m,
        Err(e) => {
            emit(&Event::Error(format!("open mapping: {e}")));
            return 2;
        }
    };
    let ring = Arc::new(Mutex::new(unsafe { RingWriter::new(mapping.base(), job.bytes, layout, crate::audio::SAMPLE_RATE, crate::audio::CHANNELS as u32) }));
    let target = if job.target_kind == "monitor" { Target::Monitor(job.handle) } else { Target::Window(job.handle) };
    let req = ShareRequest { target, quality: job.quality, cursor: job.cursor, system_audio: job.audio, exclude_pid: Some(job.exclude_pid) };
    let sink = Arc::new(HelperSink { tx: Mutex::new(tx.clone()) });
    let share = match pipeline::start(req, ring, sink) {
        Ok(s) => s,
        Err(e) => {
            emit(&Event::Error(e.to_string()));
            return 2;
        }
    };
    emit(&Event::Ready(HelperReady { hdr: share.hdr, audio: share.has_audio(), audio_error: share.audio_error.clone() }));
    let ticking = Arc::new(AtomicBool::new(true));
    {
        let (tx, ticking) = (tx.clone(), ticking.clone());
        let _ = std::thread::Builder::new().name("descall-host-stats".into()).spawn(move || {
            while ticking.load(Ordering::Acquire) {
                std::thread::sleep(Duration::from_millis(500));
                if tx.send(HostMsg::Tick).is_err() {
                    return;
                }
            }
        });
    }
    let mut reason = if share.source_closed() { "source-closed" } else { "stopped" };
    if reason != "source-closed" {
        loop {
            match rx.recv() {
                Ok(HostMsg::Cmd(l)) => match Command::parse(&l) {
                    Some(Command::Update(u)) => {
                        share.update(&u);
                    }
                    Some(Command::Stop) => break,
                    _ => {}
                },
                Ok(HostMsg::Tick) => emit(&Event::Stats(share.stats())),
                Ok(HostMsg::SourceClosed) => {
                    reason = "source-closed";
                    break;
                }
                Ok(HostMsg::Eof) | Err(_) => break,
            }
        }
    }
    ticking.store(false, Ordering::Release);
    let lost = share.device_lost();
    if lost {
        reason = "device-lost";
        for d in crate::d3d::device_lost_events() {
            emit(&Event::Lost(Box::new(d)));
        }
    }
    share.detach_ring();
    share.stop();
    drop(mapping);
    emit(&Event::End(reason.into()));
    if lost {
        EXIT_DEVICE_LOST
    } else {
        0
    }
}
