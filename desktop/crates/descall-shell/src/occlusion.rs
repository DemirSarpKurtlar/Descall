//! How far the page's client rectangle extends past the display work area, and where a
//! restored window fits. Port of electron/windowOcclusion.cjs. All values are logical px
//! (DIP). 1-2 px is DPI rounding and ignored. Only a maximized / fullscreen window gets
//! insets: a restored window dragged under the taskbar overflows the screen like any other.

use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Insets {
    pub bottom_inset: i64,
    pub top_inset: i64,
    pub left_inset: i64,
    pub right_inset: i64,
}

fn keep(v: f64) -> i64 {
    let r = v.round() as i64;
    if r > 2 {
        r
    } else {
        0
    }
}

pub fn occlusion_insets(bounds: Rect, work: Rect) -> Insets {
    Insets {
        bottom_inset: keep(bounds.y + bounds.height - (work.y + work.height)),
        top_inset: keep(work.y - bounds.y),
        left_inset: keep(work.x - bounds.x),
        right_inset: keep(bounds.x + bounds.width - (work.x + work.width)),
    }
}

/// window:content-box for the page. `pinned`: maximized or fullscreen.
pub fn measure(pinned: bool, client: Option<Rect>, work: Option<Rect>) -> Insets {
    match (pinned, client, work) {
        (true, Some(c), Some(w)) => occlusion_insets(c, w),
        _ => Insets::default(),
    }
}

pub fn fills_work_area(b: Rect, w: Rect) -> bool {
    let s = 2.0;
    (b.x - w.x).abs() <= s && (b.y - w.y).abs() <= s && (b.width - w.width).abs() <= s && (b.height - w.height).abs() <= s
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Fitted {
    pub x: Option<f64>,
    pub y: Option<f64>,
    pub width: f64,
    pub height: f64,
    pub min_width: f64,
    pub min_height: f64,
}

/// Place a restored window inside the work area. Never expands; callers skip it while the
/// window is maximized.
pub fn fit_bounds_to_work_area(x: Option<f64>, y: Option<f64>, width: Option<f64>, height: Option<f64>, work: Option<Rect>, min_w: f64, min_h: f64) -> Fitted {
    let min_w = if min_w > 0.0 { min_w } else { 960.0 };
    let min_h = if min_h > 0.0 { min_h } else { 640.0 };
    let req_w = width.filter(|w| *w > 0.0).unwrap_or(1400.0).round();
    let req_h = height.filter(|h| *h > 0.0).unwrap_or(900.0).round();
    let Some(w) = work.filter(|w| w.width > 0.0 && w.height > 0.0) else {
        return Fitted { x: x.map(f64::round), y: y.map(f64::round), width: req_w, height: req_h, min_width: min_w, min_height: min_h };
    };
    let width = req_w.min(w.width.round()).max(320.0);
    let height = req_h.min(w.height.round()).max(240.0);
    let mut nx = x.unwrap_or(w.x + (w.width - width) / 2.0);
    let mut ny = y.unwrap_or(w.y + (w.height - height) / 2.0);
    let right = w.x + w.width;
    let bottom = w.y + w.height;
    if nx < w.x {
        nx = w.x;
    }
    if ny < w.y {
        ny = w.y;
    }
    if nx + width > right {
        nx = right - width;
    }
    if ny + height > bottom {
        ny = bottom - height;
    }
    Fitted { x: Some(nx.round()), y: Some(ny.round()), width, height, min_width: min_w.min(width), min_height: min_h.min(height) }
}

#[cfg(test)]
mod tests {
    //! windowOcclusion.unit.test.cjs.
    use super::*;
    const WORK: Rect = Rect { x: 0.0, y: 0.0, width: 1920.0, height: 1040.0 };
    const fn r(x: f64, y: f64, width: f64, height: f64) -> Rect {
        Rect { x, y, width, height }
    }

    #[test]
    fn insets() {
        assert_eq!(occlusion_insets(r(0.0, 0.0, 1920.0, 1040.0), WORK), Insets::default());
        assert_eq!(occlusion_insets(r(0.0, 0.0, 1920.0, 1080.0), WORK).bottom_inset, 40);
        let top = r(0.0, 48.0, 1920.0, 1032.0);
        assert_eq!(occlusion_insets(top, top), Insets::default());
        let covering = occlusion_insets(r(0.0, 0.0, 1920.0, 1080.0), top);
        assert_eq!((covering.top_inset, covering.bottom_inset), (48, 0));
        assert_eq!(occlusion_insets(r(-1.0, -1.0, 1922.0, 1042.0), WORK), Insets::default(), "2px DPI slop");
    }

    #[test]
    fn restored_windows_are_never_squeezed() {
        assert_eq!(measure(false, Some(r(20.0, 390.0, 1400.0, 900.0)), Some(WORK)), Insets::default());
        assert_eq!(measure(true, Some(r(0.0, 0.0, 1920.0, 1080.0)), Some(WORK)).bottom_inset, 40);
    }

    #[test]
    fn fitting() {
        let f = fit_bounds_to_work_area(None, None, Some(1400.0), Some(900.0), Some(WORK), 1200.0, 700.0);
        assert_eq!((f.width, f.height, f.x, f.y, f.min_width, f.min_height), (1400.0, 900.0, Some(260.0), Some(70.0), 1200.0, 700.0));
        let laptop = r(0.0, 0.0, 1536.0, 824.0);
        let f = fit_bounds_to_work_area(None, None, Some(1400.0), Some(900.0), Some(laptop), 1200.0, 700.0);
        assert_eq!((f.width, f.height, f.y, f.min_height), (1400.0, 824.0, Some(0.0), 700.0));
        let f = fit_bounds_to_work_area(Some(100.0), Some(400.0), Some(1400.0), Some(800.0), Some(WORK), 1200.0, 700.0);
        assert_eq!((f.height, f.y), (800.0, Some(240.0)));
        let short = r(10.0, 20.0, 1100.0, 640.0);
        let f = fit_bounds_to_work_area(None, None, Some(1400.0), Some(900.0), Some(short), 1200.0, 700.0);
        assert_eq!((f.width, f.height, f.x, f.y, f.min_width, f.min_height), (1100.0, 640.0, Some(10.0), Some(20.0), 1100.0, 640.0));
        assert!(fills_work_area(r(0.0, 1.0, 1921.0, 1039.0), WORK));
        assert!(!fills_work_area(r(100.0, 100.0, 1400.0, 900.0), WORK));
    }
}
