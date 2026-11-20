//! P0 test 1, the echo test: viewers must never hear the call back.
//!
//! Three tones play at the same time:
//! - 1000 Hz inside this process (stands in for the call audio Descall plays);
//! - 1250 Hz from a child process (stands in for the WebView2 audio process, which is a
//!   descendant of Descall.exe): the exclusion must cover the whole tree;
//! - 440 Hz from a process started under explorer.exe, i.e. outside our tree (stands in for
//!   a game or YouTube): it must be captured.
//!
//! Two process-loopback captures run over the same 3 s: the production one (EXCLUDE our
//! tree) and a control (INCLUDE our tree) that proves the test tones really reached the
//! mixer, so a muted or missing device can never produce a false pass.
//!
//! Pass: own tones below -60 dBFS in the production capture, control above -30 dBFS,
//! other app above -40 dBFS.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use descall_capture::audio::{peak_dbfs, rms_dbfs, tone_dbfs, Tone, CHANNELS, SAMPLE_RATE};
use descall_capture::loopback::{self, Mode};
use serde_json::json;
use windows::core::PWSTR;
use windows::Win32::Foundation::{CloseHandle, HANDLE, WAIT_OBJECT_0};
use windows::Win32::Media::Audio::*;
use windows::Win32::Media::Multimedia::WAVE_FORMAT_IEEE_FLOAT;
use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_ALL, COINIT_MULTITHREADED};
use windows::Win32::System::RemoteDesktop::ProcessIdToSessionId;
use windows::Win32::System::Threading::*;

use crate::env::Env;
use crate::report::{Status, TestResult};

pub const OWN_HZ: f32 = 1000.0;
pub const CHILD_HZ: f32 = 1250.0;
pub const OTHER_HZ: f32 = 440.0;
pub const TONE_AMP: f32 = 0.5;
pub const ECHO_LIMIT_DBFS: f64 = -60.0;
pub const CONTROL_MIN_DBFS: f64 = -30.0;
pub const OTHER_MIN_DBFS: f64 = -40.0;
pub const NO_AUDIO: &str = "skipped (no audio device)";

/// Play a sine on the default output device until `stop` or `dur` (shared-mode WASAPI).
pub fn play_tone(freq: f32, amp: f32, dur: Duration, stop: Arc<AtomicBool>) -> Result<(), String> {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        let r = (|| -> windows::core::Result<()> {
            let e: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
            let dev = e.GetDefaultAudioEndpoint(eRender, eConsole)?;
            let client: IAudioClient = dev.Activate(CLSCTX_ALL, None)?;
            let block = CHANNELS * 4;
            let fmt = WAVEFORMATEX {
                wFormatTag: WAVE_FORMAT_IEEE_FLOAT as u16,
                nChannels: CHANNELS,
                nSamplesPerSec: SAMPLE_RATE,
                nAvgBytesPerSec: SAMPLE_RATE * block as u32,
                nBlockAlign: block,
                wBitsPerSample: 32,
                cbSize: 0,
            };
            client.Initialize(AUDCLNT_SHAREMODE_SHARED, AUDCLNT_STREAMFLAGS_EVENTCALLBACK | AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM | AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY, 500_000, 0, &fmt, None)?;
            let ev = CreateEventW(None, false, false, None)?;
            client.SetEventHandle(ev)?;
            let size = client.GetBufferSize()?;
            let render: IAudioRenderClient = client.GetService()?;
            let mut tone = Tone::new(freq, amp, SAMPLE_RATE);
            let ch = CHANNELS as usize;
            let fill = |n: u32, tone: &mut Tone| -> windows::core::Result<()> {
                if n == 0 {
                    return Ok(());
                }
                let p = render.GetBuffer(n)?;
                let s = std::slice::from_raw_parts_mut(p as *mut f32, n as usize * ch);
                tone.fill(s, ch);
                render.ReleaseBuffer(n, 0)
            };
            fill(size, &mut tone)?;
            client.Start()?;
            let t0 = Instant::now();
            while !stop.load(Ordering::Acquire) && t0.elapsed() < dur {
                if WaitForSingleObject(ev, 100) == WAIT_OBJECT_0 {
                    let pad = client.GetCurrentPadding()?;
                    fill(size - pad, &mut tone)?;
                }
            }
            let _ = client.Stop();
            let _ = CloseHandle(ev);
            Ok(())
        })();
        CoUninitialize();
        r.map_err(|e| e.to_string())
    }
}

/// `--play-tone <hz> <seconds>`: the child / other-app mode of this exe.
pub fn child_main(args: &[String]) -> i32 {
    let hz: f32 = args.first().and_then(|s| s.parse().ok()).unwrap_or(440.0);
    let secs: u64 = args.get(1).and_then(|s| s.parse().ok()).unwrap_or(8);
    match play_tone(hz, TONE_AMP, Duration::from_secs(secs.min(60)), Arc::new(AtomicBool::new(false))) {
        Ok(()) => 0,
        Err(_) => 3,
    }
}

struct Child(HANDLE);

impl Drop for Child {
    fn drop(&mut self) {
        unsafe {
            let _ = TerminateProcess(self.0, 0);
            let _ = CloseHandle(self.0);
        }
    }
}

fn explorer_pid() -> Option<u32> {
    let mut mine = 0u32;
    unsafe {
        let _ = ProcessIdToSessionId(GetCurrentProcessId(), &mut mine);
    }
    descall_capture::echo_guard::snapshot().into_iter().filter(|p| p.exe.eq_ignore_ascii_case("explorer.exe")).map(|p| p.pid).find(|&pid| {
        let mut s = u32::MAX;
        unsafe { ProcessIdToSessionId(pid, &mut s).is_ok() && s == mine }
    })
}

/// Start this exe in `--play-tone` mode, as our child or re-parented under `parent`.
fn spawn_tone(hz: f32, secs: u32, parent: Option<u32>) -> Result<Child, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let mut cmd: Vec<u16> = format!("\"{}\" --play-tone {hz} {secs}", exe.display()).encode_utf16().chain([0]).collect();
    let mut pi = PROCESS_INFORMATION::default();
    unsafe {
        match parent {
            None => {
                let si = STARTUPINFOW { cb: std::mem::size_of::<STARTUPINFOW>() as u32, ..Default::default() };
                CreateProcessW(None, Some(PWSTR(cmd.as_mut_ptr())), None, None, false, CREATE_NO_WINDOW, None, None, &si, &mut pi).map_err(|e| e.to_string())?;
            }
            Some(ppid) => {
                let hp = OpenProcess(PROCESS_CREATE_PROCESS, false, ppid).map_err(|e| format!("open parent: {e}"))?;
                let mut size = 0usize;
                let _ = InitializeProcThreadAttributeList(None, 1, None, &mut size);
                let mut buf = vec![0u8; size.max(64)];
                let list = LPPROC_THREAD_ATTRIBUTE_LIST(buf.as_mut_ptr() as *mut _);
                let r = (|| -> windows::core::Result<()> {
                    InitializeProcThreadAttributeList(Some(list), 1, None, &mut size)?;
                    UpdateProcThreadAttribute(list, 0, PROC_THREAD_ATTRIBUTE_PARENT_PROCESS as usize, Some(&hp as *const HANDLE as *const _), std::mem::size_of::<HANDLE>(), None, None)?;
                    let si = STARTUPINFOEXW { StartupInfo: STARTUPINFOW { cb: std::mem::size_of::<STARTUPINFOEXW>() as u32, ..Default::default() }, lpAttributeList: list };
                    CreateProcessW(None, Some(PWSTR(cmd.as_mut_ptr())), None, None, false, CREATE_NO_WINDOW | EXTENDED_STARTUPINFO_PRESENT, None, None, &si.StartupInfo, &mut pi)
                })();
                DeleteProcThreadAttributeList(list);
                let _ = CloseHandle(hp);
                r.map_err(|e| e.to_string())?;
            }
        }
        let _ = CloseHandle(pi.hThread);
    }
    Ok(Child(pi.hProcess))
}

fn capture(mode: Mode, buf: Arc<Mutex<Vec<f32>>>, skip_until: Instant) -> Result<loopback::LoopbackCapture, String> {
    loopback::start(mode, move |s, _frames, _ts, _flags| {
        if Instant::now() >= skip_until {
            if let Ok(mut b) = buf.lock() {
                b.extend_from_slice(s);
            }
        }
    })
    .map_err(|e| e.to_string())
}

/// Progress line plus the crash reporter's "last step", so a native crash names the step.
fn step(s: &str) {
    use std::io::Write as _;
    println!("    echo: {s}...");
    let _ = std::io::stdout().flush();
    crate::crash::set_step(&format!("echo: {s}"));
}

pub fn run(env: &Env) -> Vec<TestResult> {
    const OWN: (&str, &str) = ("echo.own_tone", "Echo: own 1 kHz tone in loopback");
    const CHILD: (&str, &str) = ("echo.child_tone", "Echo: child process tone (tree)");
    const OTHER: (&str, &str) = ("echo.other_app", "Other app audio is captured");
    const CONTROL: (&str, &str) = ("echo.control", "Echo control: tones reached mixer");
    if !env.audio_device {
        let r = NO_AUDIO;
        return [OWN, CHILD, OTHER, CONTROL].iter().map(|(i, n)| TestResult::skip(i, n, r)).collect();
    }
    if !env.caps.process_loopback {
        return vec![TestResult::new(OWN.0, OWN.1, Status::Fail).note(format!("process loopback needs Windows 10 2004+, this is build {}: shares would be video-only", env.caps.build))];
    }
    let pid = unsafe { GetCurrentProcessId() };
    step("find explorer.exe");
    let explorer = explorer_pid();
    step("start the other-app tone (440 Hz, under explorer.exe)");
    let (other, other_err) = match explorer {
        Some(ep) => match spawn_tone(OTHER_HZ, 8, Some(ep)) {
            Ok(c) => (Some(c), None),
            Err(e) => (None, Some(e)),
        },
        None => (None, Some("no explorer.exe in this session".to_string())),
    };
    step("start the child-process tone (1250 Hz)");
    let child = spawn_tone(CHILD_HZ, 8, None);
    step("start our own tone (1000 Hz)");
    let stop = Arc::new(AtomicBool::new(false));
    let st = stop.clone();
    let own = std::thread::spawn(move || play_tone(OWN_HZ, TONE_AMP, Duration::from_secs(8), st));
    std::thread::sleep(Duration::from_millis(700));

    let excl = Arc::new(Mutex::new(Vec::new()));
    let ctrl = Arc::new(Mutex::new(Vec::new()));
    let skip_until = Instant::now() + Duration::from_millis(300);
    step("start the loopback capture (everything except our process tree)");
    let c_excl = capture(Mode::ExcludeTree(pid), excl.clone(), skip_until);
    step("start the control capture (only our process tree)");
    let c_ctrl = capture(Mode::IncludeTree(pid), ctrl.clone(), skip_until);
    step("capture for 3.3 s");
    std::thread::sleep(Duration::from_millis(3300));
    let excl_err = c_excl.as_ref().err().cloned();
    step("stop the loopback capture");
    if let Ok(c) = c_excl {
        c.stop();
    }
    step("stop the control capture");
    if let Ok(c) = c_ctrl {
        c.stop();
    }
    step("stop our own tone");
    stop.store(true, Ordering::Release);
    let own_err = own.join().ok().and_then(|r| r.err());
    let child_err = child.as_ref().err().cloned();
    step("stop the child and other-app tones");
    drop(child);
    drop(other);
    step("measure the tones");

    if let Some(e) = excl_err {
        return vec![TestResult::new(OWN.0, OWN.1, Status::Fail).note(format!("process loopback failed to start: {e} (the share would be video-only)"))];
    }
    let ex = excl.lock().map(|v| v.clone()).unwrap_or_default();
    let ct = ctrl.lock().map(|v| v.clone()).unwrap_or_default();
    let ch = CHANNELS as usize;
    let lv = |b: &[f32], f: f32| tone_dbfs(b, ch, SAMPLE_RATE, f);
    let (own_ex, child_ex, other_ex) = (lv(&ex, OWN_HZ), lv(&ex, CHILD_HZ), lv(&ex, OTHER_HZ));
    let (own_ct, child_ct, other_ct) = (lv(&ct, OWN_HZ), lv(&ct, CHILD_HZ), lv(&ct, OTHER_HZ));
    let control_ok = own_ct > CONTROL_MIN_DBFS && (child_err.is_some() || child_ct > CONTROL_MIN_DBFS);
    let details = json!({
        "seconds": ex.len() as f64 / (SAMPLE_RATE as f64 * ch as f64),
        "exclude": { "own1000": own_ex, "child1250": child_ex, "other440": other_ex, "rms": rms_dbfs(&ex), "peak": peak_dbfs(&ex) },
        "control": { "own1000": own_ct, "child1250": child_ct, "other440": other_ct, "rms": rms_dbfs(&ct) },
        "rejectionDb": own_ct - own_ex,
        "errors": { "ownTone": own_err, "childTone": child_err, "otherApp": other_err },
    });
    let ctl_note = if control_ok { String::new() } else { "control failed: the test tone did not reach the mixer, result not valid".into() };
    let mut out = vec![
        TestResult::judged(OWN.0, OWN.1, control_ok && own_ex < ECHO_LIMIT_DBFS).measured(format!("{own_ex:.1} dBFS")).limit(format!("< {ECHO_LIMIT_DBFS} dBFS")).note(ctl_note.clone()).details(details),
        match &child_err {
            None => TestResult::judged(CHILD.0, CHILD.1, control_ok && child_ex < ECHO_LIMIT_DBFS).measured(format!("{child_ex:.1} dBFS")).limit(format!("< {ECHO_LIMIT_DBFS} dBFS")),
            Some(e) => TestResult::new(CHILD.0, CHILD.1, Status::Fail).note(format!("child tone: {e}")),
        },
        match &other_err {
            None => TestResult::judged(OTHER.0, OTHER.1, other_ex > OTHER_MIN_DBFS).measured(format!("{other_ex:.1} dBFS")).limit(format!("> {OTHER_MIN_DBFS} dBFS")),
            Some(e) => TestResult::skip(OTHER.0, OTHER.1, &format!("skipped (could not start a process outside our tree: {e}); play YouTube and check the guide")),
        },
        TestResult::judged(CONTROL.0, CONTROL.1, control_ok).measured(format!("{own_ct:.1} dBFS")).limit(format!("> {CONTROL_MIN_DBFS} dBFS")),
    ];
    if let Some(e) = own_err {
        out[0] = TestResult::new(OWN.0, OWN.1, Status::Fail).note(format!("could not play the test tone: {e}"));
    }
    out
}

/// INFO row: the runtime echo guard (audio sessions vs our process tree).
pub fn guard(env: &Env) -> TestResult {
    if !env.audio_device {
        return TestResult::skip("echo.guard", "Echo guard audit (info)", NO_AUDIO);
    }
    step("audit the audio sessions (echo guard)");
    match descall_capture::echo_guard::audit() {
        Ok(a) => TestResult::new("echo.guard", "Echo guard audit (info)", if a.safe() { Status::Info } else { Status::Fail })
            .measured(format!("{} sessions, tree {}", a.sessions.len(), a.tree_size))
            .limit("no escaped WebView2")
            .details(serde_json::to_value(&a).unwrap_or_default()),
        Err(descall_capture::CaptureError::NoAudioDevice) => TestResult::skip("echo.guard", "Echo guard audit (info)", NO_AUDIO),
        Err(e) => TestResult::skip("echo.guard", "Echo guard audit (info)", &format!("skipped ({e})")),
    }
}
