//! Windows 11 Snap layouts on the page's own maximize button.
//!
//! Windows shows the snap layout flyout when the pointer rests on a window's maximize
//! button, which it finds by asking WM_NCHITTEST for HTMAXBUTTON. The Descall windows are
//! frameless and their maximize button is page content inside WebView2, whose own child
//! windows (another process) answer that hit test, so the flyout never came. The shell puts a
//! small invisible child window of its own over the button (the same "drag bar" input sink
//! Windows Terminal uses): it answers HTMAXBUTTON, so Windows offers the snap layouts, and it
//! takes the button's clicks (maximize / restore), hover and press (sent back to the page so
//! the button still lights up) and right-click (the window menu).
//!
//! This module is the platform-free part: the rectangle the page reports, the hit test, the
//! pointer state machine and when the sink is used at all. app/src-tauri/src/snap.rs does the
//! Win32 side.

/// First Windows 11 build: Windows 10 has no snap layout flyout, so no input sink there.
pub const WINDOWS_11_BUILD: u32 = 22000;

/// Support kill switch in the app data folder (like devtools-enabled): with this file the
/// maximize button is plain page content again.
pub const DISABLE_FILE: &str = "snap-layouts-disabled";

/// Largest sink the shell accepts, in physical pixels. A caption button is 46 x 32 CSS px; at
/// 200 % zoom on a 300 % screen that is 276 x 192. Anything bigger is not a maximize button
/// and must not cover the page.
pub const MAX_W: i32 = 400;
pub const MAX_H: i32 = 260;

/// The button as the page measured it: CSS px from the top-left of the viewport and the
/// page's devicePixelRatio (screen scale times page zoom).
#[derive(Debug, Clone, Copy, PartialEq, serde::Deserialize)]
pub struct CssRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub dpr: f64,
}

/// Physical pixels in the window's client area (the webview fills it).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct PxRect {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

impl PxRect {
    /// The hit test: is this client point on the button? Right and bottom edges are outside,
    /// like a Win32 RECT.
    pub fn contains(&self, x: i32, y: i32) -> bool {
        x >= self.x && y >= self.y && x < self.x + self.width && y < self.y + self.height
    }
}

/// The page's rectangle in physical client pixels, or None when it cannot be a maximize
/// button in this window (not finite, empty, too large, outside the client area). Edges are
/// rounded outwards so the sink never leaves a sliver of the button to the page.
pub fn to_physical(r: &CssRect, client_w: i32, client_h: i32) -> Option<PxRect> {
    let vals = [r.x, r.y, r.width, r.height, r.dpr];
    if vals.iter().any(|v| !v.is_finite()) || r.dpr <= 0.0 || r.width <= 0.0 || r.height <= 0.0 {
        return None;
    }
    let left = (r.x * r.dpr).floor();
    let top = (r.y * r.dpr).floor();
    let right = ((r.x + r.width) * r.dpr).ceil();
    let bottom = ((r.y + r.height) * r.dpr).ceil();
    let px = PxRect { x: left as i32, y: top as i32, width: (right - left) as i32, height: (bottom - top) as i32 };
    if px.width <= 0 || px.height <= 0 || px.width > MAX_W || px.height > MAX_H {
        return None;
    }
    if px.x < 0 || px.y < 0 || client_w <= 0 || client_h <= 0 || px.x + px.width > client_w || px.y + px.height > client_h {
        return None;
    }
    Some(px)
}

/// The sink is used on Windows 11 unless support turned it off.
pub fn sink_enabled(windows_build: Option<u32>, disabled_file: bool) -> bool {
    !disabled_file && windows_build.is_some_and(|b| b >= WINDOWS_11_BUILD)
}

/// "CurrentBuildNumber" from HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion.
pub fn parse_build(s: &str) -> Option<u32> {
    s.trim().parse().ok()
}

/// What the pointer did on the sink (non-client mouse messages).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Pointer {
    /// WM_NCMOUSEMOVE
    Move,
    /// WM_NCMOUSELEAVE / WM_MOUSELEAVE
    Leave,
    /// WM_NCLBUTTONDOWN
    Down,
    /// WM_NCLBUTTONUP
    Up,
    /// WM_NCRBUTTONUP
    RightUp,
}

/// Visual state of the page's button, sent to the page as `window:snap-state`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Visual {
    #[default]
    None,
    Hover,
    Press,
}

impl Visual {
    pub fn as_str(self) -> &'static str {
        match self {
            Visual::None => "none",
            Visual::Hover => "hover",
            Visual::Press => "press",
        }
    }
}

/// What the sink does in answer.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Action {
    /// Maximize, or restore a maximized window (the button's click).
    ToggleMaximize,
    /// The window menu at the cursor (right-click on the title bar does the same).
    SystemMenu,
}

/// Pointer state of the sink: the visual to show and the action, if any. A click needs the
/// press on the button (a press that started elsewhere and was released here does nothing,
/// like a real caption button); leaving drops hover and press.
pub fn step(visual: Visual, ev: Pointer) -> (Visual, Option<Action>) {
    match ev {
        Pointer::Move => (if visual == Visual::Press { Visual::Press } else { Visual::Hover }, None),
        Pointer::Leave => (Visual::None, None),
        Pointer::Down => (Visual::Press, None),
        Pointer::Up => {
            if visual == Visual::Press {
                (Visual::Hover, Some(Action::ToggleMaximize))
            } else {
                (Visual::Hover, None)
            }
        }
        Pointer::RightUp => (Visual::None, Some(Action::SystemMenu)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn css(x: f64, y: f64, w: f64, h: f64, dpr: f64) -> CssRect {
        CssRect { x, y, width: w, height: h, dpr }
    }

    #[test]
    fn the_button_scales_with_the_screen_and_the_zoom() {
        // 1400 px wide window, maximize button 46 x 32 at the right, second from the right.
        let at100 = to_physical(&css(1308.0, 0.0, 46.0, 32.0, 1.0), 1400, 900).unwrap();
        assert_eq!(at100, PxRect { x: 1308, y: 0, width: 46, height: 32 });
        let at150 = to_physical(&css(1308.0, 0.0, 46.0, 32.0, 1.5), 2100, 1350).unwrap();
        assert_eq!(at150, PxRect { x: 1962, y: 0, width: 69, height: 48 });
        // Fractional edges round outwards.
        let frac = to_physical(&css(10.3, 0.4, 20.2, 10.1, 1.25), 400, 200).unwrap();
        assert_eq!(frac, PxRect { x: 12, y: 0, width: 27, height: 14 });
    }

    #[test]
    fn nonsense_never_covers_the_page() {
        assert_eq!(to_physical(&css(f64::NAN, 0.0, 46.0, 32.0, 1.0), 1400, 900), None);
        assert_eq!(to_physical(&css(0.0, 0.0, 46.0, 32.0, 0.0), 1400, 900), None);
        assert_eq!(to_physical(&css(0.0, 0.0, 0.0, 32.0, 1.0), 1400, 900), None);
        assert_eq!(to_physical(&css(0.0, 0.0, 900.0, 600.0, 1.0), 1400, 900), None, "far too big for a button");
        assert_eq!(to_physical(&css(1380.0, 0.0, 46.0, 32.0, 1.0), 1400, 900), None, "past the right edge");
        assert_eq!(to_physical(&css(-5.0, 0.0, 46.0, 32.0, 1.0), 1400, 900), None);
        assert_eq!(to_physical(&css(0.0, 0.0, 46.0, 32.0, 1.0), 0, 0), None, "minimized: no client area");
    }

    #[test]
    fn hit_test_is_half_open() {
        let r = PxRect { x: 100, y: 0, width: 46, height: 32 };
        assert!(r.contains(100, 0));
        assert!(r.contains(145, 31));
        assert!(!r.contains(146, 10), "right edge belongs to the close button");
        assert!(!r.contains(120, 32));
        assert!(!r.contains(99, 10));
    }

    #[test]
    fn only_windows_11_and_not_when_turned_off() {
        assert!(sink_enabled(Some(22000), false));
        assert!(sink_enabled(Some(26100), false));
        assert!(!sink_enabled(Some(19045), false), "Windows 10 has no flyout");
        assert!(!sink_enabled(None, false), "unknown build: leave the button to the page");
        assert!(!sink_enabled(Some(26100), true), "support kill switch");
        assert_eq!(parse_build(" 26100 "), Some(26100));
        assert_eq!(parse_build("x"), None);
    }

    #[test]
    fn press_then_release_on_the_button_clicks() {
        let (v, a) = step(Visual::None, Pointer::Move);
        assert_eq!((v, a), (Visual::Hover, None));
        let (v, a) = step(v, Pointer::Down);
        assert_eq!((v, a), (Visual::Press, None));
        let (v, a) = step(v, Pointer::Move);
        assert_eq!((v, a), (Visual::Press, None), "moving while pressed stays pressed");
        let (v, a) = step(v, Pointer::Up);
        assert_eq!((v, a), (Visual::Hover, Some(Action::ToggleMaximize)));
    }

    #[test]
    fn leaving_cancels_and_a_stray_release_does_nothing() {
        let (v, _) = step(Visual::Press, Pointer::Leave);
        assert_eq!(v, Visual::None);
        assert_eq!(step(v, Pointer::Up), (Visual::Hover, None), "press began elsewhere");
        assert_eq!(step(Visual::Hover, Pointer::RightUp), (Visual::None, Some(Action::SystemMenu)));
        assert_eq!(Visual::Press.as_str(), "press");
    }
}
