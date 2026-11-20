//! Tiny raster icons for the taskbar (port of electron/premium/badgeIcon.cjs): an unread badge
//! (red disc with 1-2 digits or "9+") and 16x16 glyphs for the thumbnail toolbar. Pixels are
//! BGRA, top-down, ready for CreateIconIndirect.

const FONT: &[(char, [&str; 5])] = &[
    ('0', ["111", "101", "101", "101", "111"]),
    ('1', ["010", "110", "010", "010", "111"]),
    ('2', ["111", "001", "111", "100", "111"]),
    ('3', ["111", "001", "111", "001", "111"]),
    ('4', ["101", "101", "111", "001", "001"]),
    ('5', ["111", "100", "111", "001", "111"]),
    ('6', ["111", "100", "111", "101", "111"]),
    ('7', ["111", "001", "010", "010", "010"]),
    ('8', ["111", "101", "111", "101", "111"]),
    ('9', ["111", "101", "111", "001", "111"]),
    ('+', ["000", "010", "111", "010", "000"]),
];

pub const GLYPHS: &[(&str, [&str; 16])] = &[
    ("mic", [
        "................", "......####......", ".....######.....", ".....######.....", ".....######.....", ".....######.....",
        "..#..######..#..", "..#..######..#..", "..#...####...#..", "...#........#...", "....##....##....", "......####......",
        ".......##.......", ".......##.......", ".....######.....", "................",
    ]),
    ("micOff", [
        "#...............", ".#....####......", "..#..######.....", "...#.######.....", "....#######.....", ".....######.....",
        "..#..######..#..", "..#..######..#..", "..#...#####..#..", "...#.....#..#...", "....##....##....", "......####.#....",
        ".......##....#..", ".......##.....#.", ".....######....#", "................",
    ]),
    ("headphones", [
        "................", ".....######.....", "...##......##...", "..#..........#..", ".#............#.", ".#............#.",
        "#..............#", "#..............#", "####........####", "####........####", "####........####", "####........####",
        "####........####", "####........####", ".##..........##.", "................",
    ]),
    ("headphonesOff", [
        "#...............", ".#...######.....", "..###......##...", "..##.........#..", ".#..#.........#.", ".#...#........#.",
        "#.....#........#", "#......#.......#", "####....#...####", "####.....#..####", "####......#.####", "####.......#####",
        "####........####", "####.........###", ".##..........##.", "...............#",
    ]),
    ("hangup", [
        "................", "................", "................", "................", ".....######.....", "...##########...",
        "..############..", ".######..######.", ".#####....#####.", ".####......####.", "..##........##..", "................",
        "................", "................", "................", "................",
    ]),
];

#[derive(Clone, Debug)]
pub struct Bitmap {
    pub width: u32,
    pub height: u32,
    /// BGRA, top-down.
    pub data: Vec<u8>,
    pub text: String,
}

fn put(bmp: &mut Bitmap, x: i32, y: i32, rgba: [u8; 4]) {
    if x < 0 || y < 0 || x >= bmp.width as i32 || y >= bmp.height as i32 {
        return;
    }
    let i = ((y as u32 * bmp.width + x as u32) * 4) as usize;
    bmp.data[i] = rgba[2];
    bmp.data[i + 1] = rgba[1];
    bmp.data[i + 2] = rgba[0];
    bmp.data[i + 3] = rgba[3];
}

/// Overlay badge: red disc, white count. 0 -> None (no badge).
pub fn unread_badge(count: i64, size: u32) -> Option<Bitmap> {
    let n = count.max(0);
    if n == 0 {
        return None;
    }
    let text = if n > 9 { "9+".to_string() } else { n.to_string() };
    let mut bmp = Bitmap { width: size, height: size, data: vec![0; (size * size * 4) as usize], text: text.clone() };
    let c = (size as f64 - 1.0) / 2.0;
    let r = size as f64 / 2.0;
    for y in 0..size as i32 {
        for x in 0..size as i32 {
            let d = ((x as f64 - c).powi(2) + (y as f64 - c).powi(2)).sqrt();
            if d <= r - 0.5 {
                put(&mut bmp, x, y, [232, 64, 82, 255]);
            } else if d <= r {
                put(&mut bmp, x, y, [232, 64, 82, 140]);
            }
        }
    }
    let scale = ((size / 8) as i32).max(1);
    let char_w = 3 * scale;
    let gap = scale;
    let len = text.chars().count() as i32;
    let total_w = len * char_w + (len - 1) * gap;
    let x0 = ((size as f64 - total_w as f64) / 2.0).round() as i32;
    let y0 = ((size as f64 - 5.0 * scale as f64) / 2.0).round() as i32;
    for (i, ch) in text.chars().enumerate() {
        let Some((_, rows)) = FONT.iter().find(|(c, _)| *c == ch) else { continue };
        for (ry, row) in rows.iter().enumerate() {
            for (rx, bit) in row.chars().enumerate() {
                if bit != '1' {
                    continue;
                }
                for sy in 0..scale {
                    for sx in 0..scale {
                        put(&mut bmp, x0 + i as i32 * (char_w + gap) + rx as i32 * scale + sx, y0 + ry as i32 * scale + sy, [255, 255, 255, 255]);
                    }
                }
            }
        }
    }
    Some(bmp)
}

/// Thumbnail toolbar glyph (white, or red for hang up).
pub fn glyph(name: &str) -> Option<Bitmap> {
    let (_, mask) = GLYPHS.iter().find(|(n, _)| *n == name)?;
    let mut bmp = Bitmap { width: 16, height: 16, data: vec![0; 16 * 16 * 4], text: String::new() };
    let color = if name == "hangup" { [240, 71, 90, 255] } else { [255, 255, 255, 255] };
    for (y, row) in mask.iter().enumerate() {
        for (x, ch) in row.chars().enumerate() {
            if ch == '#' {
                put(&mut bmp, x as i32, y as i32, color);
            }
        }
    }
    Some(bmp)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn badge_pixels_and_glyphs() {
        assert!(unread_badge(0, 16).is_none());
        let one = unread_badge(3, 16).unwrap();
        assert_eq!(one.data.len(), 16 * 16 * 4);
        assert_eq!(one.text, "3");
        assert_eq!(unread_badge(42, 16).unwrap().text, "9+");
        assert_eq!(one.data[(8 * 16 + 8) * 4 + 3], 255, "centre is opaque");
        assert_eq!(one.data[3], 0, "corner is transparent");
        for (name, rows) in GLYPHS {
            assert!(rows.iter().all(|r| r.len() == 16), "{name}");
            assert!(glyph(name).unwrap().data.contains(&255), "{name}");
        }
        assert!(glyph("nope").is_none());
    }
}
