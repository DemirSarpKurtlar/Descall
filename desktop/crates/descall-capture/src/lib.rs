//! descall-capture: native screen share for the Descall desktop shell (Windows x64).
//!
//! Pipeline (the "native lane", Rust-gecis-teknik-plan.md section 2):
//!
//! ```text
//!  WGC (monitor | window, cursor on/off, no yellow border on Windows 11)
//!    -> ID3D11Texture2D BGRA8 (SDR) or RGBA16F (HDR, scRGB)
//!    -> [HDR only] tone-map pass to BT.709 SDR (hdr.rs, curve in tonemap.rs)
//!    -> ID3D11VideoProcessor: scale to the quality preset + BGRA->NV12 (GPU)
//!    -> staging texture, Map, one memcpy into a slot of the shared ring (ring.rs)
//!    -> WebView2 shared buffer (posted once per share)
//!    -> page: VideoFrame(NV12) -> MediaStreamTrackGenerator -> RTCPeerConnection / LiveKit
//!
//!  WASAPI process loopback, EXCLUDE_TARGET_PROCESS_TREE(our PID)
//!    -> f32 48 kHz stereo, 10 ms packets (audio.rs) -> same ring (audio region)
//!    -> page: AudioData -> MediaStreamTrackGenerator(kind "audio")
//! ```
//!
//! Never whole-system loopback: that is the 3.7.33 echo (viewers hear the call back). If
//! the process loopback cannot start, the share is video-only (lane L2).
//!
//! Portable modules (presets, ring, tonemap, audio, stats, bridge, encode, proctree, caps)
//! build and unit-test on any host; everything touching Windows is `cfg(windows)`.
//! [`host::ShareHost`] is the whole lifecycle behind a small sink trait, so the Tauri
//! commands are thin wrappers and the bench drives exactly the production code.

pub mod audio;
pub mod bridge;
pub mod caps;
pub mod encode;
pub mod ending;
pub mod presets;
pub mod proctree;
pub mod ring;
pub mod stats;
pub mod tonemap;

#[cfg(windows)]
pub mod clock;
#[cfg(windows)]
pub mod convert;
#[cfg(windows)]
pub mod d3d;
#[cfg(windows)]
pub mod echo_guard;
#[cfg(windows)]
pub mod hdr;
#[cfg(windows)]
pub mod host;
#[cfg(windows)]
pub mod imaging;
#[cfg(windows)]
pub mod loopback;
#[cfg(windows)]
pub mod pipeline;
#[cfg(windows)]
pub mod sources;
#[cfg(windows)]
pub mod thumbs;
#[cfg(windows)]
pub mod wgc;

#[derive(Debug, thiserror::Error)]
pub enum CaptureError {
    #[error("Windows.Graphics.Capture is not supported on this system")]
    WgcUnsupported,
    #[error("process loopback needs Windows 10 2004 (build 19041) or newer")]
    LoopbackUnsupported,
    #[error("process loopback activation timed out")]
    LoopbackTimeout,
    #[error("no audio output device")]
    NoAudioDevice,
    #[error("source not found: {0}")]
    SourceNotFound(String),
    #[error("invalid source id: {0}")]
    BadSourceId(String),
    #[error("the capture item was closed (window closed or monitor removed)")]
    ItemClosed,
    #[error("no share is running")]
    NotRunning,
    #[cfg(windows)]
    #[error(transparent)]
    Win(#[from] windows_core::Error),
}

pub type Result<T> = std::result::Result<T, CaptureError>;
