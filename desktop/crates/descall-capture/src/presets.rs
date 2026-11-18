//! Quality presets, mirrored from frontend/src/lib/webrtcScreenShare.js
//! (SCREEN_QUALITY_PRESETS + RESOLUTION_MAP) so the native lane scales on the GPU to the
//! exact size the page would have asked getDisplayMedia for.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ContentHint {
    Motion,
    Detail,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Quality {
    pub width: u32,
    pub height: u32,
    pub fps: u32,
    pub hint: ContentHint,
}

/// `resolution` key as used by the page ("480p" .. "2160p").
pub fn resolution(key: &str) -> (u32, u32) {
    match key {
        "480p" => (854, 480),
        "1080p" => (1920, 1080),
        "1440p" => (2560, 1440),
        "2160p" => (3840, 2160),
        _ => (1280, 720),
    }
}

/// Named presets of the quality window (smooth / balanced / high / ultra / text) plus the
/// two native-only presets the Rust lane adds (1080p60, 1440p60).
pub fn preset(id: &str) -> Quality {
    let q = |r: &str, fps, hint| {
        let (width, height) = resolution(r);
        Quality { width, height, fps, hint }
    };
    match id {
        "smooth" => q("480p", 20, ContentHint::Motion),
        "balanced" => q("720p", 24, ContentHint::Motion),
        "high" => q("1080p", 30, ContentHint::Motion),
        "ultra" => q("1440p", 30, ContentHint::Motion),
        "text" => q("1080p", 20, ContentHint::Detail),
        "hfr1080" => q("1080p", 60, ContentHint::Motion),
        "hfr1440" => q("1440p", 60, ContentHint::Motion),
        _ => q("720p", 24, ContentHint::Motion),
    }
}

/// Fit the source into the preset box, keep aspect ratio, never upscale, even sizes (NV12).
pub fn fit(src_w: u32, src_h: u32, q: &Quality) -> (u32, u32) {
    if src_w == 0 || src_h == 0 {
        return (2, 2);
    }
    let scale = f64::min(1.0, f64::min(q.width as f64 / src_w as f64, q.height as f64 / src_h as f64));
    let even = |v: f64| ((v.round() as u32).max(2)) & !1;
    (even(src_w as f64 * scale), even(src_h as f64 * scale))
}

/// NV12 bytes per frame.
pub const fn nv12_size(w: u32, h: u32) -> usize {
    (w as usize) * (h as usize) * 3 / 2
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn fit_keeps_aspect_and_never_upscales() {
        let q = preset("hfr1440");
        assert_eq!(fit(3840, 2160, &q), (2560, 1440));
        assert_eq!(fit(1920, 1080, &q), (1920, 1080));
        assert_eq!(fit(3440, 1440, &q), (2560, 1072));
        assert_eq!(fit(1001, 601, &preset("hfr1080")), (1000, 600));
    }
    #[test]
    fn bandwidth_budget() {
        // 1440p60 NV12 = 5.53 MB/frame, 332 MB/s through the ring: one memcpy per frame.
        assert_eq!(nv12_size(2560, 1440), 5_529_600);
        assert_eq!(nv12_size(1920, 1080) * 60, 186_624_000);
    }
}
