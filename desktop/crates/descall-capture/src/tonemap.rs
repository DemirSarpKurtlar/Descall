//! HDR to SDR tone curve (CPU reference). `hdr.rs` runs the same maths in HLSL; the unit
//! tests here pin the curve, and the bench compares GPU output against it.
//!
//! Input is scRGB (linear, BT.709 primaries, 1.0 = 80 nits), which is what Windows composes
//! an HDR desktop in and what WGC returns for an R16G16B16A16Float frame pool.
//!
//! 1. Normalise so the user's "SDR content brightness" is 1.0. SDR apps (browsers, chat,
//!    the desktop) are composed at exactly that level, so after this step they are back in
//!    [0, 1] and look the same as on an SDR monitor.
//! 2. Leave luminance below the knee untouched (identity), and roll everything from the knee
//!    up to the display peak into [knee, 1] with an extended Reinhard curve on the excess.
//!    The curve is C1-continuous at the knee and maps the peak exactly to 1.0, so HDR
//!    highlights keep their gradation instead of clipping. Colour is scaled by the luminance
//!    ratio (hue preserved), then clamped to [0, 1].
//! 3. sRGB transfer, 8-bit BGRA; the video processor makes BT.709 limited-range NV12.
//!
//! The earlier spike used plain extended Reinhard on the whole range, which mapped SDR white
//! to about 0.5 linear (grey, "washed out"): exactly the complaint the native lane fixes.

use serde::Serialize;

/// Luminance below `KNEE` (in SDR-white units) passes through unchanged.
pub const KNEE: f32 = 0.9;
/// Windows' default "SDR content brightness" when it cannot be read (nits).
pub const DEFAULT_SDR_WHITE_NITS: f32 = 200.0;
/// Peak assumed when the display does not report one (nits).
pub const DEFAULT_PEAK_NITS: f32 = 1000.0;
/// scRGB 1.0 in nits.
pub const SCRGB_NITS: f32 = 80.0;

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub struct ToneParams {
    /// scRGB value of SDR white (sdr_white_nits / 80).
    pub sdr_white: f32,
    /// Display peak in SDR-white units (>= 1).
    pub peak: f32,
    pub knee: f32,
    /// false: plain clamp (an SDR monitor in FP16 capture, e.g. a followed window).
    pub enabled: bool,
}

impl ToneParams {
    pub fn new(sdr_white_nits: f32, peak_nits: f32) -> Self {
        let white = if sdr_white_nits.is_finite() && sdr_white_nits >= SCRGB_NITS { sdr_white_nits } else { DEFAULT_SDR_WHITE_NITS };
        let peak_nits = if peak_nits.is_finite() && peak_nits > 0.0 { peak_nits } else { DEFAULT_PEAK_NITS };
        ToneParams { sdr_white: white / SCRGB_NITS, peak: (peak_nits / white).max(1.0), knee: KNEE, enabled: true }
    }

    /// Identity for SDR content: scRGB 1.0 is white, nothing above it is expected.
    pub fn passthrough() -> Self {
        ToneParams { sdr_white: 1.0, peak: 1.0, knee: KNEE, enabled: false }
    }

    /// Constant buffer for the HLSL pass (must match `cbuffer Params` in hdr.rs).
    pub fn cbuffer(&self) -> [f32; 4] {
        [self.sdr_white, self.peak, self.knee, if self.enabled { 1.0 } else { 0.0 }]
    }
}

/// `DISPLAYCONFIG_SDR_WHITE_LEVEL.SDRWhiteLevel` (1000 = 80 nits) to nits.
pub fn nits_from_sdr_white_level(level: u32) -> f32 {
    level as f32 / 1000.0 * SCRGB_NITS
}

/// Tone curve on luminance in SDR-white units.
pub fn curve(l: f32, p: &ToneParams) -> f32 {
    if !p.enabled {
        return l.clamp(0.0, 1.0);
    }
    let k = p.knee;
    if l <= k {
        return l.max(0.0);
    }
    let x = (l - k) / (1.0 - k);
    let xw = ((p.peak - k) / (1.0 - k)).max(1e-3);
    let y = x * (1.0 + x / (xw * xw)) / (1.0 + x);
    (k + (1.0 - k) * y).min(1.0)
}

pub fn srgb_encode(c: f32) -> f32 {
    let c = c.clamp(0.0, 1.0);
    if c <= 0.003_130_8 {
        c * 12.92
    } else {
        1.055 * c.powf(1.0 / 2.4) - 0.055
    }
}

pub fn srgb_decode(v: f32) -> f32 {
    let v = v.clamp(0.0, 1.0);
    if v <= 0.040_45 {
        v / 12.92
    } else {
        ((v + 0.055) / 1.055).powf(2.4)
    }
}

/// One scRGB pixel to sRGB-encoded SDR [0, 1] (what the shader writes).
pub fn map_pixel(rgb: [f32; 3], p: &ToneParams) -> [f32; 3] {
    let c = [rgb[0].max(0.0) / p.sdr_white, rgb[1].max(0.0) / p.sdr_white, rgb[2].max(0.0) / p.sdr_white];
    let l = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    let s = if l > 0.0 { curve(l, p) / l } else { 0.0 };
    [srgb_encode(c[0] * s), srgb_encode(c[1] * s), srgb_encode(c[2] * s)]
}

/// BT.709 limited-range luma code (16..235) of an sRGB-encoded grey/colour, as the video
/// processor produces it (matrix applied to the gamma-encoded values).
pub fn limited_luma(srgb: [f32; 3]) -> u8 {
    let y = 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
    (16.0 + 219.0 * y.clamp(0.0, 1.0)).round() as u8
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn identity_below_knee_and_peak_to_one() {
        let p = ToneParams::new(200.0, 1000.0);
        for l in [0.0f32, 0.1, 0.5, 0.89, 0.9] {
            assert!((curve(l, &p) - l).abs() < 1e-6, "{l}");
        }
        assert!((curve(p.peak, &p) - 1.0).abs() < 1e-4);
        assert!(curve(p.peak * 10.0, &p) <= 1.0);
    }

    #[test]
    fn monotonic_and_c1_at_knee() {
        let p = ToneParams::new(240.0, 1400.0);
        let mut prev = -1.0;
        let mut l = 0.0;
        while l < p.peak * 2.0 {
            let v = curve(l, &p);
            assert!(v >= prev, "not monotonic at {l}");
            prev = v;
            l += 0.01;
        }
        let e = 1e-3;
        let slope = (curve(p.knee + e, &p) - curve(p.knee, &p)) / e;
        assert!((slope - 1.0).abs() < 0.01, "slope {slope}");
    }

    #[test]
    fn sdr_content_on_hdr_desktop_is_not_washed_out() {
        // SDR white composed at the user's SDR brightness must come out (nearly) white,
        // mid grey unchanged. The old full-range Reinhard gave Y ~ 176 for white.
        let p = ToneParams::new(200.0, 1000.0);
        let white = 200.0 / 80.0;
        let y_white = limited_luma(map_pixel([white; 3], &p));
        assert!(y_white >= 228, "white -> Y {y_white}");
        let grey = srgb_decode(0.6) * white;
        let y_grey = limited_luma(map_pixel([grey; 3], &p));
        assert_eq!(y_grey, limited_luma([0.6; 3]));
        assert_eq!(limited_luma(map_pixel([0.0; 3], &p)), 16);
        // A 1000-nit highlight reaches full white and stays above SDR white.
        let y_peak = limited_luma(map_pixel([1000.0 / 80.0; 3], &p));
        assert_eq!(y_peak, 235);
        assert!(y_peak > y_white);
    }

    #[test]
    fn hue_is_preserved_for_bright_colours() {
        let p = ToneParams::new(200.0, 1000.0);
        let out = map_pixel([20.0, 5.0, 1.0], &p);
        assert!(out[0] > out[1] && out[1] > out[2], "{out:?}");
    }

    #[test]
    fn passthrough_and_params() {
        let p = ToneParams::passthrough();
        assert_eq!(curve(0.5, &p), 0.5);
        assert_eq!(curve(3.0, &p), 1.0);
        assert_eq!(p.cbuffer()[3], 0.0);
        let q = ToneParams::new(f32::NAN, -5.0);
        assert_eq!(q.sdr_white, DEFAULT_SDR_WHITE_NITS / 80.0);
        assert_eq!(q.peak, DEFAULT_PEAK_NITS / DEFAULT_SDR_WHITE_NITS);
        assert_eq!(nits_from_sdr_white_level(2500), 200.0);
        assert!((srgb_decode(srgb_encode(0.42)) - 0.42).abs() < 1e-5);
    }
}
