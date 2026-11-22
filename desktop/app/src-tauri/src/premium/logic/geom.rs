//! Window geometry for the Descall+ window features (port of the pure half of
//! electron/premium/windowKit.cjs and overlayKit.cjs): multi-monitor fitting, edge snapping,
//! docking, display mapping, portal frame names, bounds keys, behaviour defaults.
//! Rectangles are in physical pixels, as Tauri reports monitors and window positions.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

impl Rect {
    pub const fn new(x: i32, y: i32, width: i32, height: i32) -> Self {
        Self { x, y, width, height }
    }

    pub fn from_json(v: &Value) -> Option<Rect> {
        let n = |k: &str| v.get(k).and_then(Value::as_f64).filter(|f| f.is_finite());
        Some(Rect { x: n("x")?.round() as i32, y: n("y")?.round() as i32, width: n("width")?.round() as i32, height: n("height")?.round() as i32 })
    }

    pub fn to_json(self) -> Value {
        json!({ "x": self.x, "y": self.y, "width": self.width, "height": self.height })
    }

    pub fn contains(&self, x: i32, y: i32) -> bool {
        x >= self.x && x < self.x + self.width && y >= self.y && y < self.y + self.height
    }

    pub fn intersects(&self, b: &Rect) -> bool {
        self.x < b.x + b.width && self.x + self.width > b.x && self.y < b.y + b.height && self.y + self.height > b.y
    }
}

pub const FRAME_PREFIX: &str = "descall-premium-";
/// Portal windows the main renderer draws (window.open + createPortal).
pub const PORTAL_KINDS: &[&str] = &["call", "sidebar"];

/// Kind of a portal window from its window.open target name, or None.
pub fn kind_for_frame(frame_name: &str) -> Option<&'static str> {
    let kind = frame_name.strip_prefix(FRAME_PREFIX)?;
    PORTAL_KINDS.iter().copied().find(|k| *k == kind)
}

/// Always-on-top default per window kind when always_on_top is not active.
pub fn default_on_top(kind: &str) -> bool {
    matches!(kind, "mini" | "call" | "sidebar")
}

pub struct Size {
    pub width: i32,
    pub height: i32,
    pub min_width: i32,
    pub min_height: i32,
    pub resizable: bool,
}

pub fn size_for(kind: &str) -> Size {
    match kind {
        "call" => Size { width: 480, height: 300, min_width: 260, min_height: 170, resizable: true },
        "sidebar" => Size { width: 300, height: 640, min_width: 260, min_height: 300, resizable: false },
        _ => Size { width: 300, height: 176, min_width: 260, min_height: 150, resizable: false },
    }
}

fn valid(b: &Rect) -> bool {
    b.width > 40 && b.height > 40
}

/// Keep `bounds` usable on the current displays: at least 64x48 px of it must be on a work
/// area, else it moves (same size, clamped) to the centre of the primary work area.
pub fn fit_to_work_areas(bounds: Rect, areas: &[Rect], primary: Option<Rect>) -> Option<Rect> {
    if !valid(&bounds) {
        return None;
    }
    let visible = areas.iter().any(|a| {
        let ix = (bounds.x + bounds.width).min(a.x + a.width) - bounds.x.max(a.x);
        let iy = (bounds.y + bounds.height).min(a.y + a.height) - bounds.y.max(a.y);
        ix >= 64 && iy >= 48
    });
    if visible {
        return Some(bounds);
    }
    let Some(t) = primary.or_else(|| areas.first().copied()) else { return Some(bounds) };
    let width = bounds.width.min(t.width);
    let height = bounds.height.min(t.height);
    Some(Rect { x: t.x + (t.width - width) / 2, y: t.y + (t.height - height) / 2, width, height })
}

/// Snap bounds to work area edges within `threshold` px.
pub fn snap_to_edges(b: Rect, area: Rect, threshold: i32) -> Rect {
    let mut r = b;
    if (r.x - area.x).abs() <= threshold {
        r.x = area.x;
    }
    if (r.y - area.y).abs() <= threshold {
        r.y = area.y;
    }
    let right = area.x + area.width;
    let bottom = area.y + area.height;
    if (r.x + r.width - right).abs() <= threshold {
        r.x = right - r.width;
    }
    if (r.y + r.height - bottom).abs() <= threshold {
        r.y = bottom - r.height;
    }
    r
}

/// Bounds docked to the left / right edge of a work area.
pub fn docked_bounds(area: Rect, edge: &str, width: i32) -> Rect {
    let w = width.min(area.width);
    Rect { x: if edge == "left" { area.x } else { area.x + area.width - w }, y: area.y, width: w, height: area.height }
}

/// Map bounds saved on display `from` onto display `to`, keeping relative position and size.
pub fn map_between_displays(b: Rect, from: Option<Rect>, to: Option<Rect>) -> Rect {
    let (Some(from), Some(to)) = (from, to) else { return b };
    if from == to || from.width == 0 || from.height == 0 {
        return b;
    }
    let sx = to.width as f64 / from.width as f64;
    let sy = to.height as f64 / from.height as f64;
    Rect {
        x: (to.x as f64 + (b.x - from.x) as f64 * sx).round() as i32,
        y: (to.y as f64 + (b.y - from.y) as f64 * sy).round() as i32,
        width: ((b.width as f64 * sx).round() as i32).max(200),
        height: ((b.height as f64 * sy).round() as i32).max(120),
    }
}

/// Default bounds of a portal window on the primary work area (bottom right; sidebar docked).
pub fn default_bounds(kind: &str, area: Rect, sidebar_edge: &str, scale: f64) -> Rect {
    let size = size_for(kind);
    let s = |v: i32| (v as f64 * scale).round() as i32;
    if kind == "sidebar" {
        return docked_bounds(area, sidebar_edge, s(size.width));
    }
    let margin = s(18);
    let offset = if kind == "call" { s(size_for("mini").height) + margin } else { 0 };
    let (w, h) = (s(size.width), s(size.height));
    Rect { x: area.x + area.width - w - margin, y: (area.y + margin).max(area.y + area.height - h - margin - offset), width: w, height: h }
}

/// Store key of a window's remembered bounds.
pub fn bounds_key(kind: &str, route: Option<&str>) -> String {
    if kind != "popout" {
        return format!("bounds.{kind}");
    }
    let mut slug = String::new();
    let mut last_us = false;
    for c in route.unwrap_or("").chars() {
        if c.is_ascii_alphanumeric() {
            slug.push(c);
            last_us = false;
        } else if !last_us {
            slug.push('_');
            last_us = true;
        }
    }
    let slug: String = slug.chars().take(80).collect();
    format!("bounds.popout_{}", if slug.is_empty() { "route".into() } else { slug })
}

/// Opacity clamp of window_opacity (30 % .. 100 %); the main window never fades.
pub fn clamp_opacity(kind: &str, v: Option<f64>) -> f64 {
    if kind == "main" {
        return 1.0;
    }
    match v {
        Some(n) if n.is_finite() => n.clamp(0.3, 1.0),
        _ => 1.0,
    }
}

/// Is the point on the left / right edge of the display bounds (screen_edge_actions)?
pub fn at_edge(x: i32, y: i32, bounds: Rect, edge: &str) -> bool {
    if y < bounds.y || y >= bounds.y + bounds.height {
        return false;
    }
    if edge == "left" {
        x <= bounds.x + 1
    } else {
        x >= bounds.x + bounds.width - 2
    }
}

/// How long the display bounds under the pointer are reused before they are looked up again.
pub const EDGE_DISPLAY_TTL_MS: u64 = 2000;

/// screen_edge_actions: display bounds under the pointer, reused while the pointer stays on
/// that display and they are fresh (the lookup is a main-thread hop for the monitor list).
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct EdgeDisplay(Option<(Rect, u64)>);

impl EdgeDisplay {
    pub fn get(&mut self, x: i32, y: i32, now: u64, lookup: impl FnOnce() -> Option<Rect>) -> Option<Rect> {
        if let Some((b, at)) = self.0 {
            if b.contains(x, y) && now.saturating_sub(at) < EDGE_DISPLAY_TTL_MS {
                return Some(b);
            }
        }
        let b = lookup()?;
        self.0 = Some((b, now));
        Some(b)
    }
}

/// screen_edge_actions dwell timer. The poll reads only the cursor position each tick;
/// `on_edge` (display lookup and edge setting) runs only when the pointer moved, `delay` only
/// while a stay on the edge is pending.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct EdgeDwell {
    last: Option<(i32, i32)>,
    on_edge: bool,
    since: Option<u64>,
    fired: bool,
}

impl EdgeDwell {
    /// One tick at pointer `pos`. True once per stay on the edge, after `delay` ms.
    pub fn tick(&mut self, pos: (i32, i32), now: u64, on_edge: impl FnOnce() -> bool, delay: impl FnOnce() -> u64) -> bool {
        if self.last != Some(pos) {
            self.last = Some(pos);
            self.on_edge = on_edge();
            if !self.on_edge {
                self.since = None;
                self.fired = false;
            }
        }
        if !self.on_edge || self.fired {
            return false;
        }
        let since = *self.since.get_or_insert(now);
        if now.saturating_sub(since) >= delay() {
            self.fired = true;
            return true;
        }
        false
    }
}

/// HUD / widget position from a corner preset ('tl' | 'tr' | 'bl' | 'br') plus a margin.
pub fn corner_bounds(area: Rect, corner: &str, width: i32, height: i32, margin: i32) -> Rect {
    let left = corner == "tl" || corner == "bl";
    let top = corner == "tl" || corner == "tr";
    Rect {
        x: if left { area.x + margin } else { area.x + area.width - width - margin },
        y: if top { area.y + margin } else { area.y + area.height - height - margin },
        width,
        height,
    }
}

/// Clamp a rectangle inside a work area.
pub fn clamp_to_area(b: Rect, wa: Rect) -> Rect {
    let width = b.width.min(wa.width);
    let height = b.height.min(wa.height);
    Rect { x: b.x.max(wa.x).min(wa.x + wa.width - width), y: b.y.max(wa.y).min(wa.y + wa.height - height), width, height }
}

/// The work area a rectangle is mostly on (largest overlap), else the primary one.
pub fn area_matching(b: Rect, areas: &[(Rect, Rect)], primary: usize) -> Option<(Rect, Rect)> {
    let overlap = |a: &Rect| {
        let ix = ((b.x + b.width).min(a.x + a.width) - b.x.max(a.x)).max(0) as i64;
        let iy = ((b.y + b.height).min(a.y + a.height) - b.y.max(a.y)).max(0) as i64;
        ix * iy
    };
    let best = areas.iter().max_by_key(|(bounds, _)| overlap(bounds))?;
    if overlap(&best.0) > 0 {
        Some(*best)
    } else {
        areas.get(primary).or(areas.first()).copied()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn frames_fitting_snapping_docking_mapping() {
        assert_eq!(kind_for_frame("descall-premium-call"), Some("call"));
        assert_eq!(kind_for_frame("descall-premium-mini"), None, "mini mode is the in-app call card now");
        assert_eq!(kind_for_frame("descall-premium-evil"), None);
        assert_eq!(kind_for_frame("_blank"), None);
        let primary = Rect::new(0, 0, 1920, 1040);
        let second = Rect::new(1920, 0, 1280, 1000);
        let r = Rect::new(100, 100, 300, 200);
        assert_eq!(fit_to_work_areas(r, &[primary, second], Some(primary)), Some(r));
        let rescued = fit_to_work_areas(Rect::new(4000, 200, 400, 300), &[primary], Some(primary)).unwrap();
        assert!(rescued.x >= 0 && rescued.x + rescued.width <= 1920, "{rescued:?}");
        assert_eq!(fit_to_work_areas(Rect::new(0, 0, 0, 0), &[primary], Some(primary)), None);
        assert_eq!(snap_to_edges(Rect::new(10, 1040 - 210, 300, 200), primary, 18), Rect::new(0, 840, 300, 200));
        assert_eq!(docked_bounds(primary, "right", 300), Rect::new(1620, 0, 300, 1040));
        assert_eq!(docked_bounds(second, "left", 300), Rect::new(1920, 0, 300, 1000));
        assert_eq!(map_between_displays(Rect::new(2560, 500, 640, 400), Some(second), Some(primary)), Rect::new(960, 520, 960, 416));
        assert_eq!(bounds_key("popout", Some("/direct/deniz")), "bounds.popout__direct_deniz");
        assert_eq!(bounds_key("call", None), "bounds.call");
    }

    #[test]
    fn behaviour_defaults() {
        assert!(default_on_top("call"));
        assert!(default_on_top("sidebar"));
        assert!(!default_on_top("main"));
        assert!(!default_on_top("popout"));
        assert_eq!(clamp_opacity("call", Some(0.1)), 0.3, "clamped to 30 %");
        assert_eq!(clamp_opacity("main", Some(0.5)), 1.0, "the main window never fades");
        assert_eq!(clamp_opacity("call", None), 1.0);
    }

    #[test]
    fn edges_corners_and_areas() {
        let b = Rect::new(0, 0, 1920, 1080);
        assert!(at_edge(0, 500, b, "left"));
        assert!(!at_edge(5, 500, b, "left"));
        assert!(at_edge(1919, 500, b, "right"));
        assert!(!at_edge(1919, 1200, b, "right"));
        let wa = Rect::new(0, 0, 1920, 1040);
        assert_eq!(corner_bounds(wa, "tr", 260, 200, 16), Rect::new(1644, 16, 260, 200));
        assert_eq!(corner_bounds(wa, "bl", 260, 200, 16), Rect::new(16, 824, 260, 200));
        assert_eq!(clamp_to_area(Rect::new(1800, -50, 300, 200), wa), Rect::new(1620, 0, 300, 200));
        let areas = [(Rect::new(0, 0, 1920, 1080), wa), (Rect::new(1920, 0, 1280, 1024), Rect::new(1920, 0, 1280, 1000))];
        assert_eq!(area_matching(Rect::new(2000, 10, 100, 100), &areas, 0).unwrap().1, areas[1].1);
        assert_eq!(area_matching(Rect::new(9000, 10, 100, 100), &areas, 0).unwrap().1, wa);
        let d = default_bounds("call", wa, "right", 1.0);
        assert_eq!((d.width, d.height), (480, 300));
        assert_eq!(default_bounds("sidebar", wa, "left", 1.0), Rect::new(0, 0, 300, 1040));
    }

    #[test]
    fn edge_dwell_fires_once_and_skips_work_while_the_pointer_rests() {
        let mut d = EdgeDwell::default();
        let mut looks = 0;
        let mut delays = 0;
        let tick = |d: &mut EdgeDwell, pos: (i32, i32), now: u64, edge: bool, looks: &mut i32, delays: &mut i32| {
            d.tick(pos, now, || { *looks += 1; edge }, || { *delays += 1; 250 })
        };
        // Pointer resting away from the edge: one look, then nothing per tick.
        assert!(!tick(&mut d, (500, 500), 0, false, &mut looks, &mut delays));
        for t in 1..50 {
            assert!(!tick(&mut d, (500, 500), t * 120, false, &mut looks, &mut delays));
        }
        assert_eq!((looks, delays), (1, 0));
        // Onto the edge and resting: fires after the delay, once.
        assert!(!tick(&mut d, (0, 500), 10_000, true, &mut looks, &mut delays));
        assert!(!tick(&mut d, (0, 500), 10_120, true, &mut looks, &mut delays));
        assert!(tick(&mut d, (0, 500), 10_250, true, &mut looks, &mut delays));
        let after_fire = delays;
        for t in 0..20 {
            assert!(!tick(&mut d, (0, 500), 10_400 + t * 120, true, &mut looks, &mut delays));
        }
        assert_eq!(looks, 2, "no lookups while resting on the edge");
        assert_eq!(delays, after_fire, "no settings reads after firing");
        // Sliding along the edge keeps the stay; leaving and coming back re-arms.
        assert!(!tick(&mut d, (0, 600), 13_000, true, &mut looks, &mut delays));
        assert!(!tick(&mut d, (40, 600), 13_120, false, &mut looks, &mut delays));
        assert!(!tick(&mut d, (0, 600), 13_240, true, &mut looks, &mut delays));
        assert!(tick(&mut d, (0, 600), 13_490, true, &mut looks, &mut delays));
    }

    #[test]
    fn edge_dwell_reuses_display_bounds_on_the_same_display() {
        let mut d = EdgeDisplay::default();
        let a = Rect::new(0, 0, 1920, 1080);
        let b = Rect::new(1920, 0, 2560, 1440);
        let mut n = 0;
        let look = |d: &mut EdgeDisplay, x: i32, now: u64, n: &mut i32| d.get(x, 10, now, || { *n += 1; Some(if x < 1920 { a } else { b }) });
        assert_eq!(look(&mut d, 100, 0, &mut n), Some(a));
        assert_eq!(look(&mut d, 900, 500, &mut n), Some(a));
        assert_eq!(n, 1);
        assert_eq!(look(&mut d, 2000, 600, &mut n), Some(b), "another display: new lookup");
        assert_eq!(n, 2);
        assert_eq!(look(&mut d, 2100, 600 + EDGE_DISPLAY_TTL_MS, &mut n), Some(b), "stale: new lookup");
        assert_eq!(n, 3);
    }
}
