//! System audio WITHOUT Descall's own audio: WASAPI process loopback in
//! EXCLUDE_TARGET_PROCESS_TREE mode with our own PID as the target.
//!
//! Descall.exe (Tauri host) starts the WebView2 browser process, which starts the renderer
//! and the audio service utility process. All of them are in our process tree, so the call
//! audio the page plays (remote voices, sounds) is excluded at the OS mixer. Viewers hear
//! games, YouTube, Spotify... and never themselves. This is the native equivalent of
//! Chromium's `loopbackWithoutChrome`, but under our control and independent of the
//! WebView2 version. echo_guard.rs double-checks the tree assumption at runtime.
//!
//! Docs: AUDIOCLIENT_ACTIVATION_PARAMS / AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS /
//! PROCESS_LOOPBACK_MODE, ActivateAudioInterfaceAsync with
//! VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK, the Microsoft ApplicationLoopback sample.
//! Documented minimum: build 20348; works from Windows 10 2004 (19041) in practice.
//!
//! The virtual loopback device has no mix format (GetMixFormat fails): we ask for
//! f32 / 48 kHz / stereo, and AUTOCONVERTPCM makes the engine convert for us. The virtual
//! device follows the default output device, so switching headphones keeps working.
//!
//! [`Mode::IncludeTree`] exists for the echo test's control measurement only (it proves the
//! test tone really reached the mixer); production code only uses [`start_excluding_self`].

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;

use windows::core::{implement, IUnknown, Interface, Ref, HRESULT};
use windows::Win32::Foundation::{CloseHandle, HANDLE, WAIT_OBJECT_0};
use windows::Win32::Media::Audio::*;
use windows::Win32::Media::Multimedia::WAVE_FORMAT_IEEE_FLOAT;
use windows::Win32::System::Com::StructuredStorage::{PROPVARIANT, PROPVARIANT_0, PROPVARIANT_0_0, PROPVARIANT_0_0_0};
use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CoUninitialize, BLOB, CLSCTX_ALL, COINIT_MULTITHREADED};
use windows::Win32::System::Threading::{AvRevertMmThreadCharacteristics, AvSetMmThreadCharacteristicsW, CreateEventW, GetCurrentProcessId, SetEvent, WaitForSingleObject};
use windows::Win32::System::Variant::VT_BLOB;

pub use crate::audio::{CHANNELS, PACKET_FRAMES, SAMPLE_RATE};
use crate::audio::Packetizer;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Mode {
    /// Everything except `pid` and its descendants (production).
    ExcludeTree(u32),
    /// Only `pid` and its descendants (echo-test control).
    IncludeTree(u32),
}

#[implement(IActivateAudioInterfaceCompletionHandler)]
struct Activation {
    done: HANDLE,
    result: Arc<Mutex<Option<windows::core::Result<IAudioClient>>>>,
}

impl IActivateAudioInterfaceCompletionHandler_Impl for Activation_Impl {
    fn ActivateCompleted(&self, op: Ref<IActivateAudioInterfaceAsyncOperation>) -> windows::core::Result<()> {
        let res = (|| {
            let op = op.ok()?;
            let mut hr = HRESULT(0);
            let mut unk: Option<IUnknown> = None;
            unsafe { op.GetActivateResult(&mut hr, &mut unk)? };
            hr.ok()?;
            unk.ok_or_else(|| windows::core::Error::from(windows::Win32::Foundation::E_FAIL))?.cast::<IAudioClient>()
        })();
        if let Ok(mut slot) = self.result.lock() {
            *slot = Some(res);
        }
        unsafe { SetEvent(self.done)? };
        Ok(())
    }
}

pub struct LoopbackCapture {
    stop: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
}

impl LoopbackCapture {
    pub fn stop(mut self) {
        self.halt();
    }

    fn halt(&mut self) {
        self.stop.store(true, Ordering::Release);
        if let Some(t) = self.thread.take() {
            let _ = t.join();
        }
    }
}

impl Drop for LoopbackCapture {
    fn drop(&mut self) {
        self.halt();
    }
}

/// Is there a default output device at all? (hosted CI machines and some servers have none)
pub fn default_render_device_present() -> bool {
    crate::imaging::ensure_com();
    unsafe {
        let Ok(e) = CoCreateInstance::<_, IMMDeviceEnumerator>(&MMDeviceEnumerator, None, CLSCTX_ALL) else { return false };
        e.GetDefaultAudioEndpoint(eRender, eConsole).is_ok()
    }
}

/// Production entry point: system audio minus Descall's whole process tree.
/// `on_packet(interleaved_f32, frames, timestamp_us, flags)` is called every 10 ms
/// (ring::AUDIO_SILENT / AUDIO_DISCONTINUITY flags).
pub fn start_excluding_self<F>(on_packet: F) -> crate::Result<LoopbackCapture>
where
    F: FnMut(&[f32], u32, u64, u32) + Send + 'static,
{
    start(Mode::ExcludeTree(unsafe { GetCurrentProcessId() }), on_packet)
}

pub fn start<F>(mode: Mode, mut on_packet: F) -> crate::Result<LoopbackCapture>
where
    F: FnMut(&[f32], u32, u64, u32) + Send + 'static,
{
    let build = crate::caps::current_build();
    if build < crate::caps::MIN_PROCESS_LOOPBACK {
        return Err(crate::CaptureError::LoopbackUnsupported);
    }
    let stop = Arc::new(AtomicBool::new(false));
    let (ready_tx, ready_rx) = std::sync::mpsc::channel::<crate::Result<()>>();
    let stop_t = stop.clone();
    let thread = std::thread::Builder::new()
        .name("descall-loopback".into())
        .spawn(move || {
            let init = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
            if init.is_err() {
                let _ = ready_tx.send(Err(windows::core::Error::from(init).into()));
                return;
            }
            let setup = || -> crate::Result<(IAudioClient, IAudioCaptureClient, HANDLE)> {
                let client = activate(mode)?;
                let block_align = CHANNELS * 4;
                let fmt = WAVEFORMATEX {
                    wFormatTag: WAVE_FORMAT_IEEE_FLOAT as u16,
                    nChannels: CHANNELS,
                    nSamplesPerSec: SAMPLE_RATE,
                    nAvgBytesPerSec: SAMPLE_RATE * block_align as u32,
                    nBlockAlign: block_align,
                    wBitsPerSample: 32,
                    cbSize: 0,
                };
                let flags = AUDCLNT_STREAMFLAGS_LOOPBACK | AUDCLNT_STREAMFLAGS_EVENTCALLBACK | AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM | AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY;
                unsafe {
                    // 20 ms engine buffer: headroom for a busy machine, still low latency.
                    client.Initialize(AUDCLNT_SHAREMODE_SHARED, flags, 200_000, 0, &fmt, None)?;
                    let ev = CreateEventW(None, false, false, None)?;
                    client.SetEventHandle(ev)?;
                    let cap: IAudioCaptureClient = client.GetService()?;
                    client.Start()?;
                    Ok((client, cap, ev))
                }
            };
            let (client, cap, ev) = match setup() {
                Ok(v) => {
                    let _ = ready_tx.send(Ok(()));
                    v
                }
                Err(e) => {
                    let _ = ready_tx.send(Err(e));
                    unsafe { CoUninitialize() };
                    return;
                }
            };
            let mut task = 0u32;
            let mmcss = unsafe { AvSetMmThreadCharacteristicsW(windows::core::w!("Pro Audio"), &mut task) };

            let ch = CHANNELS as usize;
            let mut pk = Packetizer::new(CHANNELS, SAMPLE_RATE);
            let t0 = std::time::Instant::now();
            // Audio timestamps on the same QPC clock as the video frames (sample clock
            // from here), so receivers see one time base for the share's two tracks.
            let base_us = crate::clock::now_us();
            let mut on_packet = move |s: &[f32], f: u32, ts: u64, fl: u32| on_packet(s, f, base_us + ts, fl);
            while !stop_t.load(Ordering::Acquire) {
                let woke = unsafe { WaitForSingleObject(ev, 20) } == WAIT_OBJECT_0;
                if woke {
                    loop {
                        let next = unsafe { cap.GetNextPacketSize() }.unwrap_or(0);
                        if next == 0 {
                            break;
                        }
                        let mut data: *mut u8 = std::ptr::null_mut();
                        let mut frames = 0u32;
                        let mut flags = 0u32;
                        if unsafe { cap.GetBuffer(&mut data, &mut frames, &mut flags, None, None) }.is_err() {
                            break;
                        }
                        let silent = flags & (AUDCLNT_BUFFERFLAGS_SILENT.0 as u32) != 0 || data.is_null();
                        let disc = flags & (AUDCLNT_BUFFERFLAGS_DATA_DISCONTINUITY.0 as u32) != 0;
                        if silent {
                            pk.push(None, frames as usize, disc);
                        } else {
                            let s = unsafe { std::slice::from_raw_parts(data as *const f32, frames as usize * ch) };
                            pk.push(Some(s), frames as usize, disc);
                        }
                        unsafe {
                            let _ = cap.ReleaseBuffer(frames);
                        }
                    }
                }
                let elapsed = t0.elapsed().as_micros() as u64;
                pk.drain(Some(elapsed), &mut on_packet);
            }
            unsafe {
                let _ = client.Stop();
                let _ = CloseHandle(ev);
                if let Ok(h) = mmcss {
                    let _ = AvRevertMmThreadCharacteristics(h);
                }
                CoUninitialize();
            }
        })
        .map_err(|_| crate::CaptureError::LoopbackUnsupported)?;

    match ready_rx.recv() {
        Ok(Ok(())) => Ok(LoopbackCapture { stop, thread: Some(thread) }),
        Ok(Err(e)) => {
            let _ = thread.join();
            Err(e)
        }
        Err(_) => Err(crate::CaptureError::LoopbackUnsupported),
    }
}

/// ActivateAudioInterfaceAsync on the process-loopback virtual device.
fn activate(mode: Mode) -> crate::Result<IAudioClient> {
    let (pid, loopback_mode) = match mode {
        Mode::ExcludeTree(p) => (p, PROCESS_LOOPBACK_MODE_EXCLUDE_TARGET_PROCESS_TREE),
        Mode::IncludeTree(p) => (p, PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE),
    };
    let mut params = AUDIOCLIENT_ACTIVATION_PARAMS {
        ActivationType: AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK,
        Anonymous: AUDIOCLIENT_ACTIVATION_PARAMS_0 { ProcessLoopbackParams: AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS { TargetProcessId: pid, ProcessLoopbackMode: loopback_mode } },
    };
    // ManuallyDrop: windows-rs implements Drop for PROPVARIANT as PropVariantClear, which
    // would CoTaskMemFree the VT_BLOB data, here a pointer to `params` on this stack frame.
    // That free corrupted the process heap (0xC0000374) on the first real audio device the
    // echo test met. This PROPVARIANT owns nothing, so it must never be cleared.
    let pv = std::mem::ManuallyDrop::new(PROPVARIANT {
        Anonymous: PROPVARIANT_0 {
            Anonymous: std::mem::ManuallyDrop::new(PROPVARIANT_0_0 {
                vt: VT_BLOB,
                wReserved1: 0,
                wReserved2: 0,
                wReserved3: 0,
                Anonymous: PROPVARIANT_0_0_0 { blob: BLOB { cbSize: std::mem::size_of::<AUDIOCLIENT_ACTIVATION_PARAMS>() as u32, pBlobData: &mut params as *mut _ as *mut u8 } },
            }),
        },
    });
    let done = unsafe { CreateEventW(None, true, false, None)? };
    // The completion handler runs on an MTA worker thread; IAudioClient is free-threaded
    // there even though windows-rs does not mark it Send.
    #[allow(clippy::arc_with_non_send_sync)]
    let slot: Arc<Mutex<Option<windows::core::Result<IAudioClient>>>> = Arc::new(Mutex::new(None));
    let handler: IActivateAudioInterfaceCompletionHandler = Activation { done, result: slot.clone() }.into();
    let result = (|| -> crate::Result<IAudioClient> {
        let _op = unsafe { ActivateAudioInterfaceAsync(VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK, &IAudioClient::IID, Some(&*pv), &handler)? };
        if unsafe { WaitForSingleObject(done, 5_000) } != WAIT_OBJECT_0 {
            return Err(crate::CaptureError::LoopbackTimeout);
        }
        let r = slot.lock().ok().and_then(|mut s| s.take());
        match r {
            Some(Ok(c)) => Ok(c),
            Some(Err(e)) => Err(e.into()),
            None => Err(crate::CaptureError::LoopbackUnsupported),
        }
    })();
    unsafe {
        let _ = CloseHandle(done);
    }
    // `params` is read by the activation call; it lives on this frame until here.
    let _ = &mut params;
    result
}
