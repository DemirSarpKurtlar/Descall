//! A barcode the test window draws into its top rows every frame: a 4-cell marker, the
//! QPC time of the Present call (64 bits, microseconds) and a frame counter (32 bits).
//! Decoding it from the captured NV12 Y plane gives true glass-to-ring latency and exact
//! frame drops (counter gaps) without trusting any capture-side timestamp.

pub const MARKER: [bool; 4] = [true, false, true, false];
pub const BITS: usize = 96;
pub const CELLS: usize = MARKER.len() + BITS;
/// Barcode height in rows.
pub const BAR_H: usize = 16;

pub fn cell_w(width: usize) -> usize {
    (width / CELLS).max(4)
}

fn bits(time_us: u64, counter: u32) -> impl Iterator<Item = bool> {
    MARKER.into_iter().chain((0..64).rev().map(move |i| (time_us >> i) & 1 == 1)).chain((0..32).rev().map(move |i| (counter >> i) & 1 == 1))
}

/// BGRA rows (`width` x BAR_H): white cell = 1, black = 0, the rest of the row grey.
pub fn encode(width: usize, time_us: u64, counter: u32, out: &mut Vec<u8>) {
    out.clear();
    out.resize(width * BAR_H * 4, 128);
    let cw = cell_w(width);
    let row: Vec<u8> = {
        let mut r = vec![128u8; width * 4];
        for (i, b) in bits(time_us, counter).enumerate() {
            let v = if b { 255 } else { 0 };
            for x in i * cw..((i + 1) * cw).min(width) {
                r[x * 4..x * 4 + 4].copy_from_slice(&[v, v, v, 255]);
            }
        }
        r
    };
    for y in 0..BAR_H {
        out[y * width * 4..(y + 1) * width * 4].copy_from_slice(&row);
    }
}

/// Read the barcode back from a Y plane (limited or full range). `None` if the marker is
/// not there (frame scaled, window covered, partial frame).
pub fn decode(y_plane: &[u8], width: usize, height: usize, stride: usize) -> Option<(u64, u32)> {
    let cw = cell_w(width);
    if height < BAR_H || CELLS * cw > width || y_plane.len() < stride * (BAR_H / 2) + width {
        return None;
    }
    let row = &y_plane[stride * (BAR_H / 2)..];
    let bit = |i: usize| row[i * cw + cw / 2] > 125;
    if MARKER.iter().enumerate().any(|(i, &m)| bit(i) != m) {
        return None;
    }
    let mut t = 0u64;
    for i in 0..64 {
        t = (t << 1) | bit(MARKER.len() + i) as u64;
    }
    let mut c = 0u32;
    for i in 0..32 {
        c = (c << 1) | bit(MARKER.len() + 64 + i) as u32;
    }
    Some((t, c))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// BGRA -> limited-range Y like the video processor (grey only matters here).
    fn to_y(bgra: &[u8]) -> Vec<u8> {
        bgra.chunks_exact(4).map(|p| (16 + (p[1] as u32 * 219 / 255)) as u8).collect()
    }

    #[test]
    fn round_trip_at_capture_sizes() {
        for w in [960usize, 1280, 1920, 2560] {
            let mut px = Vec::new();
            let (t, c) = (0x0123_4567_89ab_cdef, 0xdead_beef);
            encode(w, t, c, &mut px);
            let y = to_y(&px);
            assert_eq!(decode(&y, w, BAR_H, w), Some((t, c)), "width {w}");
        }
    }

    #[test]
    fn padded_stride_and_garbage() {
        let w = 1920;
        let mut px = Vec::new();
        encode(w, 42, 7, &mut px);
        let y = to_y(&px);
        let stride = 2048;
        let mut padded = vec![0u8; stride * BAR_H];
        for r in 0..BAR_H {
            padded[r * stride..r * stride + w].copy_from_slice(&y[r * w..(r + 1) * w]);
        }
        assert_eq!(decode(&padded, w, BAR_H, stride), Some((42, 7)));
        assert_eq!(decode(&vec![16u8; w * BAR_H], w, BAR_H, w), None);
        assert_eq!(decode(&vec![235u8; w * BAR_H], w, BAR_H, w), None);
        assert_eq!(decode(&y, w, 4, w), None);
        assert_eq!(decode(&y[..10], w, BAR_H, w), None);
    }
}
