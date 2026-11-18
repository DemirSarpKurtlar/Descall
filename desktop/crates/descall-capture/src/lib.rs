//! descall-capture: native screen share for the Descall Tauri shell (Windows x64).
//!
//! Pipeline (the "native lane", see Rust-gecis-teknik-plan.md section 2):
//!
//! ```text
//!  WGC (monitor | window, cursor on/off, no yellow border)
//!    -> ID3D11Texture2D BGRA8 (SDR) or RGBA16F (HDR monitor, scRGB)
//!    -> [HDR only] tone-map pass to BT.709 SDR
//!    -> ID3D11VideoProcessor: scale to the quality preset + BGRA->NV12 (GPU)
//!    -> staging texture, Map, memcpy into a slot of the shared ring (ring.rs)
//!    -> WebView2 shared buffer (PostSharedBufferToScript, once per session)
//!    -> page: VideoFrame(NV12) -> MediaStreamTrackGenerator -> RTCPeerConnection / LiveKit
//!
//!  WASAPI process loopback, EXCLUDE_TARGET_PROCESS_TREE(our PID)
//!    -> f32 48 kHz stereo, 10 ms packets -> same ring (audio region)
//!    -> page: AudioData -> MediaStreamTrackGenerator(kind "audio")
//! ```
//!
//! Every Windows-only module is `cfg(windows)`; the pure parts (ring layout, presets,
//! version gates) build and unit-test on any host, so CI on Linux still covers them.

pub mod presets;
pub mod ring;
pub mod caps;

#[cfg(windows)]
pub mod d3d;
#[cfg(windows)]
pub mod sources;
#[cfg(windows)]
pub mod wgc;
#[cfg(windows)]
pub mod convert;
#[cfg(windows)]
pub mod hdr;
#[cfg(windows)]
pub mod loopback;
#[cfg(windows)]
pub mod pipeline;

#[derive(Debug, thiserror::Error)]
pub enum CaptureError {
    #[error("Windows.Graphics.Capture is not supported on this system")]
    WgcUnsupported,
    #[error("process loopback needs Windows 10 2004 (build 19041) or newer")]
    LoopbackUnsupported,
    #[error("source not found: {0}")]
    SourceNotFound(String),
    #[error("the capture item was closed (window closed or monitor removed)")]
    ItemClosed,
    #[cfg(windows)]
    #[error(transparent)]
    Win(#[from] windows_core::Error),
}

pub type Result<T> = std::result::Result<T, CaptureError>;
