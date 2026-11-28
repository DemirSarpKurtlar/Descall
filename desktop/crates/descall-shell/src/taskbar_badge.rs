//! Unread badge on the taskbar button, for every user (port of electron/taskbarBadge.cjs):
//! a red disc with a white bold count ("9+" above 9), drawn at the window's scale factor
//! (16 px at 100 %, 32 px at 200 %). Same geometry and sampling as the Electron file, and no
//! trigonometry at run time, so both shells draw the same pixels: the tests pin the same
//! checksums as taskbarBadge.selftest.mjs.

const RED: [u32; 3] = [242, 63, 67];
const WHITE: [u32; 3] = [255, 255, 255];
/// Samples per pixel along each axis (16 per pixel).
const SS: u32 = 4;

/// cos of k * 15 degrees, k = 0..23 (angles grow clockwise: y points down).
const COS15: [f64; 24] = [
    1.0, 0.9659258262890683, 0.8660254037844387, 0.7071067811865476, 0.5, 0.25881904510252074,
    0.0, -0.25881904510252074, -0.5, -0.7071067811865476, -0.8660254037844387, -0.9659258262890683,
    -1.0, -0.9659258262890683, -0.8660254037844387, -0.7071067811865476, -0.5, -0.25881904510252074,
    0.0, 0.25881904510252074, 0.5, 0.7071067811865476, 0.8660254037844387, 0.9659258262890683,
];

fn cos15(k: i32) -> f64 {
    COS15[k.rem_euclid(24) as usize]
}

fn sin15(k: i32) -> f64 {
    COS15[(k - 6).rem_euclid(24) as usize]
}

type Line = Vec<(f64, f64)>;

/// Elliptical arc in glyph units, from a0 to a1 (degrees, multiples of 15, a1 > a0).
fn arc(cx: f64, cy: f64, rx: f64, ry: f64, a0: i32, a1: i32) -> Line {
    let mut pts = Vec::new();
    let mut a = a0;
    while a <= a1 {
        let k = a / 15;
        pts.push((cx + rx * cos15(k), cy + ry * sin15(k)));
        a += 15;
    }
    pts
}

fn join(parts: Vec<Line>) -> Line {
    parts.into_iter().flatten().collect()
}

/// Centre lines of each glyph (see taskbarBadge.cjs glyphLines).
fn glyph_lines(ch: char, r: f64) -> Vec<Line> {
    match ch {
        '0' => vec![join(vec![arc(0.5, r, 0.5, r, 180, 360), arc(0.5, 1.0 - r, 0.5, r, 0, 180), vec![(0.0, r)]])],
        '1' => vec![vec![(0.08, 0.24), (0.5, 0.0), (0.5, 1.0)]],
        '2' => vec![join(vec![arc(0.5, r, 0.5, r, 180, 390), vec![(0.0, 1.0), (1.0, 1.0)]])],
        '3' => vec![join(vec![arc(0.5, 0.25, 0.46, 0.25, 195, 450), arc(0.5, 0.75, 0.5, 0.25, 270, 525)])],
        '4' => vec![vec![(0.75, 1.0), (0.75, 0.0), (0.0, 0.68), (1.0, 0.68)]],
        '5' => vec![join(vec![vec![(1.0, 0.0), (0.06, 0.0), (0.02, 0.46)], arc(0.48, 0.68, 0.52, 0.32, 240, 495)])],
        '6' => vec![arc(0.5, 0.68, 0.5, 0.32, 180, 540), join(vec![vec![(0.0, 0.68)], arc(0.56, 0.5, 0.56, 0.5, 180, 285)])],
        '7' => vec![vec![(0.0, 0.0), (1.0, 0.0), (0.34, 1.0)]],
        '8' => vec![arc(0.5, 0.24, 0.42, 0.24, 0, 360), arc(0.5, 0.73, 0.5, 0.27, 0, 360)],
        '9' => glyph_lines('6', r).into_iter().map(|l| l.into_iter().map(|(u, v)| (1.0 - u, 1.0 - v)).collect()).collect(),
        '+' => vec![vec![(0.0, 0.5), (1.0, 0.5)], vec![(0.5, 0.5 - r), (0.5, 0.5 + r)]],
        _ => Vec::new(),
    }
}

fn round(x: f64) -> f64 {
    (x + 0.5).floor()
}

/// "3", "9+" (Discord shows 9+ above nine). "" for 0.
pub fn badge_text(count: i64) -> String {
    match count {
        n if n <= 0 => String::new(),
        n if n > 9 => "9+".into(),
        n => n.to_string(),
    }
}

/// Overlay size in device pixels for a scale factor (16 px at 100 %).
pub fn badge_size(scale_factor: f64) -> u32 {
    let s = if scale_factor.is_finite() && scale_factor > 0.0 { scale_factor } else { 1.0 };
    round(16.0 * s).clamp(16.0, 64.0) as u32
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Layout {
    pub gw: f64,
    pub gh: f64,
    pub sw: f64,
    pub gap: f64,
    pub x0: f64,
    pub y0: f64,
}

/// Text box at `size` px (whole pixels, whole-pixel stroke up to 24 px).
pub fn layout(text: &str, size: u32) -> Layout {
    let size_f = size as f64;
    let len = text.chars().count() as f64;
    let two = len > 1.0;
    let mut gh = round(size_f * if two { 0.5 } else { 0.6 });
    let mut gw = round(size_f * if two { 0.31 } else { 0.38 });
    let mut sw = size_f * if two { 0.125 } else { 0.14 };
    if size <= 24 {
        sw = round(sw).max(2.0);
    }
    let mut gap = if two { round(size_f * 0.06).max(1.0) } else { 0.0 };
    if (size_f - gh) % 2.0 != 0.0 {
        gh += 1.0;
    }
    let total = |gw: f64, gap: f64| len * gw + (len - 1.0) * gap;
    if (size_f - total(gw, gap)) % 2.0 != 0.0 {
        if two {
            gap += 1.0;
        } else {
            gw += 1.0;
        }
    }
    Layout { gw, gh, sw, gap, x0: (size_f - total(gw, gap)) / 2.0, y0: (size_f - gh) / 2.0 }
}

fn segments(text: &str, size: u32) -> (Vec<[f64; 4]>, f64) {
    let l = layout(text, size);
    let cw = l.gw - l.sw;
    let chh = l.gh - l.sw;
    let r = (cw / 2.0 / chh).min(0.5);
    let mut out = Vec::new();
    for (i, ch) in text.chars().enumerate() {
        let ox = l.x0 + i as f64 * (l.gw + l.gap) + l.sw / 2.0;
        let oy = l.y0 + l.sw / 2.0;
        for line in glyph_lines(ch, r) {
            for w in line.windows(2) {
                out.push([ox + w[0].0 * cw, oy + w[0].1 * chh, ox + w[1].0 * cw, oy + w[1].1 * chh]);
            }
        }
    }
    (out, l.sw / 2.0)
}

fn near_segment(px: f64, py: f64, segs: &[[f64; 4]], half2: f64) -> bool {
    segs.iter().any(|&[x1, y1, x2, y2]| {
        let dx = x2 - x1;
        let dy = y2 - y1;
        let len2 = dx * dx + dy * dy;
        let t = if len2 > 0.0 { ((px - x1) * dx + (py - y1) * dy) / len2 } else { 0.0 };
        let t = t.clamp(0.0, 1.0);
        let ex = px - (x1 + t * dx);
        let ey = py - (y1 + t * dy);
        ex * ex + ey * ey <= half2
    })
}

/// The badge as straight RGBA, `size` x `size`, or None for 0 (no badge).
pub fn render_rgba(count: i64, size: u32) -> Option<Vec<u8>> {
    let text = badge_text(count);
    if text.is_empty() {
        return None;
    }
    let s = size.clamp(8, 256);
    let (segs, half) = segments(&text, s);
    let half2 = half * half;
    let c = s as f64 / 2.0;
    let r2 = c * c;
    let n = SS * SS;
    let mut data = vec![0u8; (s * s * 4) as usize];
    for y in 0..s {
        for x in 0..s {
            let (mut disc, mut ink) = (0u32, 0u32);
            for sy in 0..SS {
                let py = y as f64 + (sy as f64 + 0.5) / SS as f64;
                for sx in 0..SS {
                    let px = x as f64 + (sx as f64 + 0.5) / SS as f64;
                    let (dx, dy) = (px - c, py - c);
                    if dx * dx + dy * dy > r2 {
                        continue;
                    }
                    disc += 1;
                    if near_segment(px, py, &segs, half2) {
                        ink += 1;
                    }
                }
            }
            if disc == 0 {
                continue;
            }
            let i = ((y * s + x) * 4) as usize;
            for k in 0..3 {
                data[i + k] = round((WHITE[k] * ink + RED[k] * (disc - ink)) as f64 / disc as f64) as u8;
            }
            data[i + 3] = round((255 * disc) as f64 / n as f64) as u8;
        }
    }
    Some(data)
}

/// FNV-1a 32 over the pixels (the checksum taskbarBadge.selftest.mjs pins too).
pub fn checksum(data: &[u8]) -> String {
    let mut h: u32 = 0x811c_9dc5;
    for &b in data {
        h ^= b as u32;
        h = h.wrapping_mul(0x0100_0193);
    }
    format!("{h:08x}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn text_size_and_zero() {
        assert_eq!(badge_text(0), "");
        assert_eq!(badge_text(-4), "");
        for n in 1..=9 {
            assert_eq!(badge_text(n), n.to_string());
        }
        assert_eq!(badge_text(10), "9+");
        assert_eq!(badge_text(12345), "9+");
        assert!(render_rgba(0, 16).is_none(), "no badge at 0");
        assert_eq!(badge_size(1.0), 16);
        assert_eq!(badge_size(1.25), 20);
        assert_eq!(badge_size(1.5), 24);
        assert_eq!(badge_size(2.0), 32);
        assert_eq!(badge_size(f64::NAN), 16);
        assert_eq!(badge_size(10.0), 64);
    }

    #[test]
    fn discord_look() {
        for n in 1..=10 {
            let px = render_rgba(n, 16).unwrap();
            assert_eq!(px.len(), 16 * 16 * 4);
            assert_eq!(px[3], 0, "{n}: corner transparent");
            let white = px.chunks_exact(4).filter(|p| p == &[255, 255, 255, 255]).count();
            let red = px.chunks_exact(4).filter(|p| p == &[242, 63, 67, 255]).count();
            assert!(white >= 10, "{n}: white count drawn ({white})");
            assert!(red > white, "{n}: on a red disc");
        }
        // 16 px: whole-pixel layout, so straight strokes land on pixel edges.
        let l = layout("3", 16);
        assert_eq!((l.gw, l.gh, l.sw, l.x0, l.y0), (6.0, 10.0, 2.0, 5.0, 3.0));
        let l = layout("9+", 16);
        assert_eq!((l.gw, l.gh, l.sw, l.gap, l.x0, l.y0), (5.0, 8.0, 2.0, 2.0, 2.0, 4.0));
    }

    #[test]
    fn same_pixels_as_electron() {
        // taskbarBadge.selftest.mjs pins the same values.
        for (n, s, sum) in [
            (1, 16, "09eba214"),
            (3, 16, "9ee59464"),
            (8, 16, "44b056b5"),
            (42, 16, "6840393f"),
            (5, 20, "74903d2d"),
            (9, 24, "70196b0a"),
            (3, 32, "04537ae8"),
            (10, 32, "8b92f326"),
            (6, 48, "83d6cfd9"),
        ] {
            assert_eq!(checksum(&render_rgba(n, s).unwrap()), sum, "{n} at {s} px");
        }
    }
}
