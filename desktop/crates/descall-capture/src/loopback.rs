//! System audio WITHOUT Descall's own audio: WASAPI process loopback in
//! EXCLUDE_TARGET_PROCESS_TREE mode with our own PID as the target.
//!
//! Descall.exe (Tauri host) starts the WebView2 browser process, which starts the renderer
//! and the audio service utility process. All of them are in our process tree, so the
//! call audio played by the page (remote voices, sounds) is excluded at the OS mixer.
//! Viewers hear games, YouTube, Spotify... and never themselves. This is the native
//! equivalent of Chromium's `loopbackWithoutChrome` (which Electron 43.4+ uses with
//! `restrictOwnAudio`), but under our control and independent of the WebView2 version.
//!
//! Docs: AUDIOCLIENT_ACTIVATION_PARAMS / AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS /
//! PROCESS_LOOPBACK_MODE (audioclientactivationparams.h), ActivateAudioInterfaceAsync with
//! VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK, Microsoft ApplicationLoopback sample.
//! Documented minimum: build 20348; works from Windows 10 2004 (19041) in practice.
//!
//! The virtual loopback device has no mix format (GetMixFormat fails): we ask for
//! f32 / 48 kHz / stereo, and AUTOCONVERTPCM makes the engine resample for us.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;

use windows::core::{implement, Interface, Ref, HRESULT, IUnknown};
use windows::Win32::Foundation::{CloseHandle, HANDLE, WAIT_OBJECT_0};
use windows::Win32::Media::Audio::*;
use windows::Win32::Media::Multimedia::WAVE_FORMAT_IEEE_FLOAT;
use windows::Win32::System::Com::StructuredStorage::{PROPVARIANT, PROPVARIANT_0, PROPVARIANT_0_0, PROPVARIANT_0_0_0};
use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, BLOB, COINIT_MULTITHREADED};
use windows::Win32::System::Threading::{AvSetMmThreadCharacteristicsW, CreateEventW, GetCurrentProcessId, SetEvent, WaitForSingleObject};
use windows::Win32::System::Variant::VT_BLOB;

pub const SAMPLE_RATE: u32 = 48_000;
pub const CHANNELS: u16 = 2;
/// 10 ms packets, the WebRTC audio frame size.
pub const PACKET_FRAMES: usize = 480;

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
            unk.ok_or_else(|| windows::core::Error::from(HRESULT(0x80004005u32 as i32)))?.cast::<IAudioClient>()
        })();
        *self.result.lock().unwrap() = Some(res);
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
        self.stop.store(true, Ordering::Release);
        if let Some(t) = self.thread.take() {
            let _ = t.join();
        }
    }
}

/// `on_packet(interleaved_f32, frames, timestamp_us, silent)` is called every 10 ms.
/// Silence is emitted while nothing plays, so the page's audio track keeps a steady clock
/// (WebRTC jitter buffers and LiveKit's audio level do not like gaps).
pub fn start_excluding_self<F>(mut on_packet: F) -> crate::Result<LoopbackCapture>
where
    F: FnMut(&[f32], u32, u64, bool) + Send + 'static,
{
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
            let run = || -> crate::Result<(IAudioClient, IAudioCaptureClient, HANDLE)> {
                let client = activate_excluding(unsafe { GetCurrentProcessId() })?;
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
                    // 20 ms engine buffer: enough headroom for a busy machine, low latency.
                    client.Initialize(AUDCLNT_SHAREMODE_SHARED, flags, 200_000, 0, &fmt, None)?;
                    let ev = CreateEventW(None, false, false, None)?;
                    client.SetEventHandle(ev)?;
                    let cap: IAudioCaptureClient = client.GetService()?;
                    client.Start()?;
                    Ok((client, cap, ev))
                }
            };
            let (client, cap, ev) = match run() {
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
            let _mmcss = unsafe { AvSetMmThreadCharacteristicsW(windows::core::w!("Pro Audio"), &mut task) };

            let ch = CHANNELS as usize;
            let mut acc: Vec<f32> = Vec::with_capacity(PACKET_FRAMES * ch * 4);
            let silence = vec![0f32; PACKET_FRAMES * ch];
            let t0 = std::time::Instant::now();
            let mut emitted_frames: u64 = 0;
            let mut emit = |acc: &mut Vec<f32>, emitted: &mut u64, force_silence: bool| {
                while acc.len() >= PACKET_FRAMES * ch {
                    let ts = *emitted * 1_000_000 / SAMPLE_RATE as u64;
                    on_packet(&acc[..PACKET_FRAMES * ch], PACKET_FRAMES as u32, ts, false);
                    acc.drain(..PACKET_FRAMES * ch);
                    *emitted += PACKET_FRAMES as u64;
                }
                if force_silence {
                    // Wall clock ran ahead of delivered audio: nothing is playing.
                    let due = t0.elapsed().as_micros() as u64 * SAMPLE_RATE as u64 / 1_000_000;
                    while *emitted + (PACKET_FRAMES as u64) <= due {
                        let ts = *emitted * 1_000_000 / SAMPLE_RATE as u64;
                        on_packet(&silence, PACKET_FRAMES as u32, ts, true);
                        *emitted += PACKET_FRAMES as u64;
                    }
                }
            };

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
                        let n = frames as usize * ch;
                        if flags & (AUDCLNT_BUFFERFLAGS_SILENT.0 as u32) != 0 || data.is_null() {
                            acc.extend(std::iter::repeat(0f32).take(n));
                        } else {
                            let s = unsafe { std::slice::from_raw_parts(data as *const f32, n) };
                            acc.extend_from_slice(s);
                        }
                        unsafe { let _ = cap.ReleaseBuffer(frames); }
                    }
                }
                emit(&mut acc, &mut emitted_frames, !woke);
            }
            unsafe {
                let _ = client.Stop();
                let _ = CloseHandle(ev);
                CoUninitialize();
            }
        })
        .expect("spawn loopback thread");

    match ready_rx.recv() {
        Ok(Ok(())) => Ok(LoopbackCapture { stop, thread: Some(thread) }),
        Ok(Err(e)) => {
            let _ = thread.join();
            Err(e)
        }
        Err(_) => Err(crate::CaptureError::LoopbackUnsupported),
    }
}

/// ActivateAudioInterfaceAsync on the process-loopback virtual device, excluding `pid`'s tree.
fn activate_excluding(pid: u32) -> crate::Result<IAudioClient> {
    let mut params = AUDIOCLIENT_ACTIVATION_PARAMS {
        ActivationType: AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK,
        Anonymous: AUDIOCLIENT_ACTIVATION_PARAMS_0 {
            ProcessLoopbackParams: AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS {
                TargetProcessId: pid,
                ProcessLoopbackMode: PROCESS_LOOPBACK_MODE_EXCLUDE_TARGET_PROCESS_TREE,
            },
        },
    };
    let pv = PROPVARIANT {
        Anonymous: PROPVARIANT_0 {
            Anonymous: std::mem::ManuallyDrop::new(PROPVARIANT_0_0 {
                vt: VT_BLOB,
                wReserved1: 0,
                wReserved2: 0,
                wReserved3: 0,
                Anonymous: PROPVARIANT_0_0_0 {
                    blob: BLOB { cbSize: std::mem::size_of::<AUDIOCLIENT_ACTIVATION_PARAMS>() as u32, pBlobData: &mut params as *mut _ as *mut u8 },
                },
            }),
        },
    };
    let done = unsafe { CreateEventW(None, true, false, None)? };
    let slot: Arc<Mutex<Option<windows::core::Result<IAudioClient>>>> = Arc::new(Mutex::new(None));
    let handler: IActivateAudioInterfaceCompletionHandler = Activation { done, result: slot.clone() }.into();
    let result = (|| -> crate::Result<IAudioClient> {
        let _op = unsafe { ActivateAudioInterfaceAsync(VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK, &IAudioClient::IID, Some(&pv), &handler)? };
        if unsafe { WaitForSingleObject(done, 5_000) } != WAIT_OBJECT_0 {
            return Err(crate::CaptureError::LoopbackUnsupported);
        }
        let r = slot.lock().unwrap().take();
        match r {
            Some(Ok(c)) => Ok(c),
            Some(Err(e)) => Err(e.into()),
            None => Err(crate::CaptureError::LoopbackUnsupported),
        }
    })();
    unsafe { let _ = CloseHandle(done); }
    // `params` must outlive the activation call; it lives on this stack frame until here.
    let _ = &mut params;
    result
}
