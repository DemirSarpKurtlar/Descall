//! Where the popover opens: like Windows 11 quick settings, in the corner of the work area
//! on the taskbar's side (bottom right for the usual taskbar), 12 px from the edges, on the
//! monitor that holds the tray icon. All values in physical pixels; `scale` is the monitor's.

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

impl Rect {
    pub fn new(x: f64, y: f64, w: f64, h: f64) -> Rect {
        Rect { x, y, w, h }
    }
    fn right(&self) -> f64 {
        self.x + self.w
    }
    fn bottom(&self) -> f64 {
        self.y + self.h
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Edge {
    Bottom,
    Top,
    Left,
    Right,
}

pub const MARGIN: f64 = 12.0;
/// Logical width of the popover (the draft's 380 px card; the window is the card, its
/// shadow and rounded corners come from DWM).
pub const WIDTH: f64 = 380.0;

pub fn taskbar_edge(tray: Rect, work: Rect) -> Edge {
    if tray.y >= work.bottom() - 1.0 {
        Edge::Bottom
    } else if tray.bottom() <= work.y + 1.0 {
        Edge::Top
    } else if tray.x >= work.right() - 1.0 {
        Edge::Right
    } else if tray.right() <= work.x + 1.0 {
        Edge::Left
    } else {
        // Auto-hide taskbar or the overflow flyout: the nearest edge.
        let (cx, cy) = (tray.x + tray.w / 2.0, tray.y + tray.h / 2.0);
        let mut d = [(Edge::Bottom, work.bottom() - cy), (Edge::Top, cy - work.y), (Edge::Right, work.right() - cx), (Edge::Left, cx - work.x)];
        d.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal));
        d[0].0
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Placement {
    pub x: i32,
    pub y: i32,
    pub w: u32,
    pub h: u32,
    pub edge: Edge,
}

/// Physical window rect for a popover of `logical_w` x `logical_h` (the page reports its
/// height; it never grows past the work area).
pub fn place(tray: Rect, work: Rect, scale: f64, logical_w: f64, logical_h: f64) -> Placement {
    let s = if scale.is_finite() && scale > 0.0 { scale } else { 1.0 };
    let m = MARGIN * s;
    let w = (logical_w * s).min(work.w - 2.0 * m).max(1.0);
    let h = (logical_h * s).min(work.h - 2.0 * m).max(1.0);
    let edge = taskbar_edge(tray, work);
    let x = match edge {
        Edge::Left => work.x + m,
        _ => work.right() - m - w,
    };
    let y = match edge {
        Edge::Top => work.y + m,
        _ => work.bottom() - m - h,
    };
    Placement { x: x.round() as i32, y: y.round() as i32, w: w.round() as u32, h: h.round() as u32, edge }
}

#[cfg(test)]
mod tests {
    use super::*;

    const WORK: Rect = Rect { x: 0.0, y: 0.0, w: 2560.0, h: 1392.0 };

    #[test]
    fn bottom_right_above_the_taskbar() {
        let tray = Rect::new(2380.0, 1400.0, 32.0, 32.0);
        let p = place(tray, WORK, 1.5, WIDTH, 600.0);
        assert_eq!(p.edge, Edge::Bottom);
        assert_eq!((p.w, p.h), (570, 900));
        assert_eq!((p.x, p.y), (2560 - 18 - 570, 1392 - 18 - 900));
    }

    #[test]
    fn other_edges() {
        let top = place(Rect::new(1800.0, -40.0, 32.0, 32.0), Rect::new(0.0, 48.0, 1920.0, 1032.0), 1.0, WIDTH, 500.0);
        assert_eq!((top.edge, top.y), (Edge::Top, 60));
        let left = place(Rect::new(-48.0, 900.0, 32.0, 32.0), Rect::new(0.0, 0.0, 1872.0, 1080.0), 1.0, WIDTH, 500.0);
        assert_eq!((left.edge, left.x), (Edge::Left, 12));
        let right = place(Rect::new(1890.0, 900.0, 24.0, 24.0), Rect::new(0.0, 0.0, 1872.0, 1080.0), 1.0, WIDTH, 500.0);
        assert_eq!((right.edge, right.x), (Edge::Right, 1872 - 12 - 380));
    }

    #[test]
    fn never_taller_than_the_work_area() {
        let p = place(Rect::new(1200.0, 770.0, 24.0, 24.0), Rect::new(0.0, 0.0, 1280.0, 760.0), 1.0, WIDTH, 2000.0);
        assert_eq!(p.h, 736);
        assert_eq!(p.y, 12);
        let p = place(Rect::new(1200.0, 770.0, 24.0, 24.0), Rect::new(0.0, 0.0, 1280.0, 760.0), f64::NAN, WIDTH, 300.0);
        assert_eq!(p.h, 300);
    }
}
