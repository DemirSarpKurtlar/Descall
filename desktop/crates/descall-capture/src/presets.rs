//! Quality presets, mirrored from frontend/src/lib/webrtcScreenShare.js
//! (SCREEN_QUALITY_PRESETS + RESOLUTION_MAP) so the native lane scales on the GPU to the
//! exact size the page would have asked getDisplayMedia for. Two native-only presets
//! (`hfr1080`, `hfr1440`) add 60 fps up to 1440p.
//!
//! Limits of the native lane:
//! - at most 60 fps;
//! - above 30 fps the box is at most 2560x1440 (1440p60 is the top preset);
//! - at 30 fps or less the box may go up to 3840x2160 (the page's "2160p" key);
//! - the source is never upscaled, the aspect ratio is kept and sizes are even (NV12).

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

pub const MAX_FPS: u32 = 60;
pub const MIN_FPS: u32 = 1;
/// Largest box above 30 fps.
pub const HFR_MAX: (u32, u32) = (2560, 1440);
/// Largest box at 30 fps or less.
pub const MAX_BOX: (u32, u32) = (3840, 2160);
pub const MIN_BOX: (u32, u32) = (320, 180);

/// Every named preset, in the order the quality window lists them.
pub const PRESET_IDS: [&str; 7] = ["smooth", "balanced", "high", "ultra", "text", "hfr1080", "hfr1440"];

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

/// Named presets of the quality window plus the two native 60 fps presets.
/// Unknown ids get the group default (720p24).
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

/// Turn whatever the page asked for (getDisplayMedia ideal/max values, possibly missing or
/// absurd) into a box the native lane can deliver. See the module docs for the rules.
pub fn clamp_request(width: Option<u32>, height: Option<u32>, fps: Option<u32>, hint: ContentHint) -> Quality {
    let fps = fps.unwrap_or(30).clamp(MIN_FPS, MAX_FPS);
    let (max_w, max_h) = if fps > 30 { HFR_MAX } else { MAX_BOX };
    let mut w = width.unwrap_or(1920).clamp(MIN_BOX.0, max_w);
    let mut h = height.unwrap_or(1080).clamp(MIN_BOX.1, max_h);
    // A portrait or odd request keeps its shape but must fit the landscape limit by area too.
    let max_px = (max_w as u64) * (max_h as u64);
    if (w as u64) * (h as u64) > max_px {
        let s = ((max_px as f64) / ((w as f64) * (h as f64))).sqrt();
        w = ((w as f64 * s) as u32).max(MIN_BOX.0);
        h = ((h as f64 * s) as u32).max(MIN_BOX.1);
    }
    Quality { width: w & !1, height: h & !1, fps, hint }
}

/// Fit the source into the preset box, keep aspect ratio, never upscale, even sizes (NV12).
pub fn fit(src_w: u32, src_h: u32, q: &Quality) -> (u32, u32) {
    fit_box(src_w, src_h, q.width, q.height)
}

/// Same as [`fit`] for an arbitrary box (thumbnails use it too).
pub fn fit_box(src_w: u32, src_h: u32, box_w: u32, box_h: u32) -> (u32, u32) {
    if src_w == 0 || src_h == 0 || box_w == 0 || box_h == 0 {
        return (2, 2);
    }
    let scale = f64::min(1.0, f64::min(box_w as f64 / src_w as f64, box_h as f64 / src_h as f64));
    let even = |v: f64| ((v.round() as u32).max(2)) & !1;
    (even(src_w as f64 * scale), even(src_h as f64 * scale))
}

/// NV12 bytes per frame.
pub const fn nv12_size(w: u32, h: u32) -> usize {
    (w as usize) * (h as usize) * 3 / 2
}

/// Frame period in 100 ns units (the WGC timestamp unit).
pub fn frame_interval_100ns(fps: u32) -> i64 {
    10_000_000i64 / fps.clamp(MIN_FPS, MAX_FPS) as i64
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
        assert_eq!(fit(0, 600, &q), (2, 2));
        // Portrait window into a landscape box.
        assert_eq!(fit(1080, 1920, &preset("high")), (608, 1080));
    }

    #[test]
    fn bandwidth_budget() {
        // 1440p60 NV12 = 5.53 MB/frame, 332 MB/s through the ring: one memcpy per frame.
        assert_eq!(nv12_size(2560, 1440), 5_529_600);
        assert_eq!(nv12_size(1920, 1080) * 60, 186_624_000);
    }

    #[test]
    fn presets_cover_the_quality_window_and_hfr() {
        assert_eq!(preset("hfr1440"), Quality { width: 2560, height: 1440, fps: 60, hint: ContentHint::Motion });
        assert_eq!(preset("hfr1080").fps, 60);
        assert_eq!(preset("text").hint, ContentHint::Detail);
        assert_eq!(preset("nope"), preset("balanced"));
        for id in PRESET_IDS {
            let p = preset(id);
            assert_eq!(clamp_request(Some(p.width), Some(p.height), Some(p.fps), p.hint), p, "{id}");
        }
    }

    #[test]
    fn clamp_caps_60fps_at_1440p_and_30fps_at_2160p() {
        let q = clamp_request(Some(3840), Some(2160), Some(60), ContentHint::Motion);
        assert_eq!((q.width, q.height, q.fps), (2560, 1440, 60));
        let q = clamp_request(Some(3840), Some(2160), Some(30), ContentHint::Motion);
        assert_eq!((q.width, q.height, q.fps), (3840, 2160, 30));
        let q = clamp_request(Some(10_000), Some(10), Some(500), ContentHint::Motion);
        assert_eq!((q.width, q.height, q.fps), (2560, 180, 60));
        let q = clamp_request(None, None, None, ContentHint::Motion);
        assert_eq!((q.width, q.height, q.fps), (1920, 1080, 30));
        let q = clamp_request(Some(0), Some(0), Some(0), ContentHint::Motion);
        assert_eq!((q.width, q.height, q.fps), (320, 180, 1));
        // Portrait box at 60 fps keeps its area under the 1440p limit.
        let q = clamp_request(Some(1440), Some(2560), Some(60), ContentHint::Motion);
        assert!(q.width as u64 * q.height as u64 <= 2560 * 1440, "{q:?}");
        assert!(q.width % 2 == 0 && q.height % 2 == 0);
    }

    #[test]
    fn frame_interval() {
        assert_eq!(frame_interval_100ns(60), 166_666);
        assert_eq!(frame_interval_100ns(0), 10_000_000);
        assert_eq!(frame_interval_100ns(1000), 166_666);
    }
}
