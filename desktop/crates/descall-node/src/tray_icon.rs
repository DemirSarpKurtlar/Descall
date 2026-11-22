//! The tray icon: a rounded square in the state colour with "DN" in white (the draft's tray
//! mark). Purple = active, yellow = game mode, grey = paused / stopped, accent blue = busy
//! (starting, draining, retrying), red = error. Drawn here as straight RGBA at the size the
//! shell asks for (16 px at 100 %, 20 / 24 / 32 px scaled).

use crate::supervisor::Phase;

pub const PC: [u8; 3] = [0xb4, 0x7c, 0xff];
pub const GAME: [u8; 3] = [0xf5, 0xb8, 0x4a];
pub const PAUSED: [u8; 3] = [0x8f, 0x99, 0xb8];
pub const BUSY: [u8; 3] = [0x58, 0x7a, 0xf5];
pub const ERROR: [u8; 3] = [0xff, 0x5d, 0x73];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Tone {
    Active,
    Game,
    Paused,
    Busy,
    Error,
}

impl Tone {
    pub fn rgb(self) -> [u8; 3] {
        match self {
            Tone::Active => PC,
            Tone::Game => GAME,
            Tone::Paused => PAUSED,
            Tone::Busy => BUSY,
            Tone::Error => ERROR,
        }
    }
    pub fn key(self) -> &'static str {
        match self {
            Tone::Active => "active",
            Tone::Game => "game",
            Tone::Paused => "paused",
            Tone::Busy => "busy",
            Tone::Error => "error",
        }
    }
}

pub fn tone(phase: Phase) -> Tone {
    match phase {
        Phase::Active => Tone::Active,
        Phase::Game => Tone::Game,
        Phase::Paused | Phase::Stopped | Phase::Setup => Tone::Paused,
        Phase::Starting | Phase::Draining | Phase::Drained | Phase::Backoff => Tone::Busy,
        Phase::Error => Tone::Error,
    }
}

const D: [u8; 7] = [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110];
const N: [u8; 7] = [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001];

fn glyph_on(g: &[u8; 7], col: u32, row: u32) -> bool {
    g[row as usize] & (1 << (4 - col)) != 0
}

/// "DN" covers this text pixel (col 0..11, row 0..7).
fn text_on(col: u32, row: u32) -> bool {
    match col {
        0..=4 => glyph_on(&D, col, row),
        6..=10 => glyph_on(&N, col - 6, row),
        _ => false,
    }
}

/// Coverage (0..=16) of pixel (x, y) by a rounded square of side `n` and corner radius `r`.
fn coverage(x: u32, y: u32, n: f64, r: f64) -> u32 {
    let mut c = 0;
    for sy in 0..4 {
        for sx in 0..4 {
            let px = x as f64 + (sx as f64 + 0.5) / 4.0;
            let py = y as f64 + (sy as f64 + 0.5) / 4.0;
            let qx = (px - n / 2.0).abs() - (n / 2.0 - r);
            let qy = (py - n / 2.0).abs() - (n / 2.0 - r);
            let inside = if qx > 0.0 && qy > 0.0 { qx * qx + qy * qy <= r * r } else { qx <= r && qy <= r };
            if inside {
                c += 1;
            }
        }
    }
    c
}

/// Straight RGBA, `size` x `size`.
pub fn rgba(t: Tone, size: u32) -> Vec<u8> {
    let size = size.clamp(8, 256);
    let n = size as f64;
    let r = n * 0.25;
    let k = ((n * 0.72 / 11.0).floor() as u32).max(1);
    let (tw, th) = (11 * k, 7 * k);
    let (ox, oy) = ((size.saturating_sub(tw)) / 2, (size.saturating_sub(th)) / 2);
    let [cr, cg, cb] = t.rgb();
    let mut out = vec![0u8; (size * size * 4) as usize];
    for y in 0..size {
        for x in 0..size {
            let cov = coverage(x, y, n, r);
            if cov == 0 {
                continue;
            }
            let i = ((y * size + x) * 4) as usize;
            let in_text = x >= ox && y >= oy && x < ox + tw && y < oy + th && text_on((x - ox) / k, (y - oy) / k);
            let (pr, pg, pb) = if in_text { (255, 255, 255) } else { (cr, cg, cb) };
            out[i] = pr;
            out[i + 1] = pg;
            out[i + 2] = pb;
            out[i + 3] = (cov * 255 / 16) as u8;
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn px(buf: &[u8], size: u32, x: u32, y: u32) -> [u8; 4] {
        let i = ((y * size + x) * 4) as usize;
        [buf[i], buf[i + 1], buf[i + 2], buf[i + 3]]
    }

    #[test]
    fn colours_follow_the_state() {
        assert_eq!(tone(Phase::Active), Tone::Active);
        assert_eq!(tone(Phase::Game), Tone::Game);
        assert_eq!(tone(Phase::Paused), Tone::Paused);
        assert_eq!(tone(Phase::Draining), Tone::Busy);
        assert_eq!(tone(Phase::Error), Tone::Error);
        assert_eq!(Tone::Active.rgb(), [0xb4, 0x7c, 0xff]);
        assert_eq!(Tone::Game.rgb(), [0xf5, 0xb8, 0x4a]);
    }

    #[test]
    fn drawn_icon() {
        for size in [16, 20, 24, 32] {
            let b = rgba(Tone::Active, size);
            assert_eq!(b.len(), (size * size * 4) as usize);
            assert_eq!(px(&b, size, 0, 0)[3], 0, "rounded corner is transparent");
            // An edge pixel in the middle of the left side is the state colour, opaque.
            assert_eq!(px(&b, size, 0, size / 2), [0xb4, 0x7c, 0xff, 255]);
            // There is white text.
            assert!(b.chunks(4).any(|p| p == [255, 255, 255, 255]), "size {size}");
        }
        let g = rgba(Tone::Game, 16);
        assert_eq!(px(&g, 16, 0, 8), [0xf5, 0xb8, 0x4a, 255]);
        // The D's top-left corner at 16 px: text block 11x7 at (2, 4).
        assert_eq!(px(&g, 16, 2, 4), [255, 255, 255, 255]);
    }
}
