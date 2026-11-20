//! Thumbnail helpers that do not need Windows: base64 data URLs and a CPU box downscale
//! (used by the GDI thumbnail path and to turn the bench's FP16 readback into a histogram).

const B64: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

pub fn base64(data: &[u8]) -> String {
    let mut out = String::with_capacity(data.len().div_ceil(3) * 4);
    for chunk in data.chunks(3) {
        let b = [chunk[0], *chunk.get(1).unwrap_or(&0), *chunk.get(2).unwrap_or(&0)];
        let n = ((b[0] as u32) << 16) | ((b[1] as u32) << 8) | b[2] as u32;
        out.push(B64[(n >> 18) as usize & 63] as char);
        out.push(B64[(n >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 { B64[(n >> 6) as usize & 63] as char } else { '=' });
        out.push(if chunk.len() > 2 { B64[n as usize & 63] as char } else { '=' });
    }
    out
}

pub fn data_url(mime: &str, data: &[u8]) -> String {
    format!("data:{mime};base64,{}", base64(data))
}

/// Box-filter downscale of a BGRA image (`src_stride` bytes per row) to `dw` x `dh`.
/// Alpha is forced to 255 (window captures carry garbage alpha).
pub fn downscale_bgra(src: &[u8], sw: usize, sh: usize, src_stride: usize, dw: usize, dh: usize) -> Vec<u8> {
    let mut out = vec![0u8; dw * dh * 4];
    if sw == 0 || sh == 0 || dw == 0 || dh == 0 || src.len() < src_stride * (sh - 1) + sw * 4 {
        return out;
    }
    for y in 0..dh {
        let y0 = y * sh / dh;
        let y1 = ((y + 1) * sh / dh).max(y0 + 1).min(sh);
        for x in 0..dw {
            let x0 = x * sw / dw;
            let x1 = ((x + 1) * sw / dw).max(x0 + 1).min(sw);
            let mut acc = [0u32; 3];
            for yy in y0..y1 {
                let row = &src[yy * src_stride..];
                for xx in x0..x1 {
                    let p = &row[xx * 4..xx * 4 + 3];
                    acc[0] += p[0] as u32;
                    acc[1] += p[1] as u32;
                    acc[2] += p[2] as u32;
                }
            }
            let n = ((y1 - y0) * (x1 - x0)) as u32;
            let o = (y * dw + x) * 4;
            out[o] = (acc[0] / n) as u8;
            out[o + 1] = (acc[1] / n) as u8;
            out[o + 2] = (acc[2] / n) as u8;
            out[o + 3] = 255;
        }
    }
    out
}

/// BGRA (sRGB, full range) to tight NV12 (BT.709 limited range), the CPU twin of the video
/// processor conversion. Used when the GPU has no video processor (WARP without video
/// support) and by tests. `w` and `h` must be even. Chroma is the 2x2 average.
pub fn bgra_to_nv12(src: &[u8], w: usize, h: usize, stride: usize, out: &mut Vec<u8>) {
    out.clear();
    out.resize(w * h * 3 / 2, 0);
    if w == 0 || h == 0 || w % 2 != 0 || h % 2 != 0 || src.len() < stride * (h - 1) + w * 4 {
        return;
    }
    // x1024 fixed point, BT.709 limited: Y = 16 + 219 * (0.2126 R + 0.7152 G + 0.0722 B).
    let luma = |b: i32, g: i32, r: i32| -> u8 { (16 + ((187 * r + 629 * g + 63 * b + 512) >> 10)).clamp(16, 235) as u8 };
    let (y_plane, uv_plane) = out.split_at_mut(w * h);
    for y in 0..h {
        let row = &src[y * stride..];
        for x in 0..w {
            let p = &row[x * 4..x * 4 + 3];
            y_plane[y * w + x] = luma(p[0] as i32, p[1] as i32, p[2] as i32);
        }
    }
    for cy in 0..h / 2 {
        for cx in 0..w / 2 {
            let mut s = [0i32; 3];
            for (dy, dx) in [(0, 0), (0, 1), (1, 0), (1, 1)] {
                let o = (2 * cy + dy) * stride + (2 * cx + dx) * 4;
                s[0] += src[o] as i32;
                s[1] += src[o + 1] as i32;
                s[2] += src[o + 2] as i32;
            }
            let (b, g, r) = (s[0], s[1], s[2]); // sums of 4
            let cb = 128 + ((-103 * r - 347 * g + 450 * b + 2048) >> 12);
            let cr = 128 + ((450 * r - 408 * g - 42 * b + 2048) >> 12);
            uv_plane[cy * w + cx * 2] = cb.clamp(16, 240) as u8;
            uv_plane[cy * w + cx * 2 + 1] = cr.clamp(16, 240) as u8;
        }
    }
}

/// IEEE half to f32 (the FP16 frame pool format, R16G16B16A16_FLOAT).
pub fn f16_to_f32(h: u16) -> f32 {
    let sign = if h & 0x8000 != 0 { -1.0f32 } else { 1.0 };
    let exp = ((h >> 10) & 0x1f) as i32;
    let man = (h & 0x3ff) as f32;
    match exp {
        0 => sign * man * 2f32.powi(-24),
        31 => {
            if man == 0.0 {
                sign * f32::INFINITY
            } else {
                f32::NAN
            }
        }
        e => sign * (1.0 + man / 1024.0) * 2f32.powi(e - 15),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base64_rfc4648_vectors() {
        for (i, o) in [("", ""), ("f", "Zg=="), ("fo", "Zm8="), ("foo", "Zm9v"), ("foob", "Zm9vYg=="), ("fooba", "Zm9vYmE="), ("foobar", "Zm9vYmFy")] {
            assert_eq!(base64(i.as_bytes()), o);
        }
        assert_eq!(data_url("image/jpeg", &[0xff, 0xd8]), "data:image/jpeg;base64,/9g=");
    }

    #[test]
    fn downscale_averages_blocks() {
        // 4x2 -> 2x1: left block (10, 30) and right block (50, 70) per channel.
        let mut src = vec![0u8; 4 * 2 * 4];
        for y in 0..2 {
            for x in 0..4 {
                let v = [10u8, 10, 50, 50][x] + 20 * y as u8;
                src[(y * 4 + x) * 4..(y * 4 + x) * 4 + 4].copy_from_slice(&[v, v, v, 0]);
            }
        }
        let out = downscale_bgra(&src, 4, 2, 16, 2, 1);
        assert_eq!(out, vec![20, 20, 20, 255, 60, 60, 60, 255]);
        // Padded stride and upscale request (each source pixel replicated).
        let out = downscale_bgra(&[1, 2, 3, 0, 9, 9, 9, 9], 1, 1, 8, 2, 2);
        assert_eq!(out, vec![1, 2, 3, 255, 1, 2, 3, 255, 1, 2, 3, 255, 1, 2, 3, 255]);
        assert_eq!(downscale_bgra(&[], 4, 4, 16, 2, 2), vec![0; 16]);
    }

    #[test]
    fn nv12_conversion_matches_bt709_limited() {
        let px = |b: u8, g: u8, r: u8| [b, g, r, 255];
        let mut out = Vec::new();
        let cases: [([u8; 4], u8, u8, u8); 5] = [
            (px(255, 255, 255), 235, 128, 128),
            (px(0, 0, 0), 16, 128, 128),
            (px(0, 0, 255), 63, 102, 240),  // red
            (px(0, 255, 0), 173, 42, 26),   // green
            (px(255, 0, 0), 32, 240, 118),  // blue
        ];
        for (p, ey, ecb, ecr) in cases {
            let src: Vec<u8> = p.iter().copied().cycle().take(2 * 2 * 4).collect();
            bgra_to_nv12(&src, 2, 2, 8, &mut out);
            let (y, cb, cr) = (out[0], out[4], out[5]);
            assert!(y.abs_diff(ey) <= 1 && cb.abs_diff(ecb) <= 1 && cr.abs_diff(ecr) <= 1, "{p:?}: {y} {cb} {cr}");
            assert!(out[..4].iter().all(|&v| v == y));
        }
        // Odd sizes are refused (zeroed output of the right length).
        bgra_to_nv12(&[0; 64], 3, 2, 12, &mut out);
        assert_eq!(out.len(), 9);
    }

    #[test]
    fn half_floats() {
        assert_eq!(f16_to_f32(0x3c00), 1.0);
        assert_eq!(f16_to_f32(0xc000), -2.0);
        assert_eq!(f16_to_f32(0x4900), 10.0);
        assert_eq!(f16_to_f32(0x0000), 0.0);
        assert!(f16_to_f32(0x7c00).is_infinite());
        assert!((f16_to_f32(0x0001) - 5.960_464_5e-8).abs() < 1e-12);
    }
}
