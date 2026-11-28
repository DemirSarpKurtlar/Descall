//! Tiny raster icons for the taskbar (port of electron/premium/badgeIcon.cjs): 16x16 glyphs
//! for the thumbnail toolbar. Pixels are BGRA, top-down, ready for CreateIconIndirect. The
//! unread badge is free for every user now: descall_shell::taskbar_badge (crate::taskbar).

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
    fn glyphs() {
        for (name, rows) in GLYPHS {
            assert!(rows.iter().all(|r| r.len() == 16), "{name}");
            assert!(glyph(name).unwrap().data.contains(&255), "{name}");
        }
        assert!(glyph("nope").is_none());
    }
}
