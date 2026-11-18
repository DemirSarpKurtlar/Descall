//! P0 test 5: no washed-out picture on HDR monitors, plus the SDR colour check.
//!
//! A test window shows six grey bands (sRGB 0, 51, 102, 153, 204, 255). It is captured
//! through the production pipeline and the luma of each band in the NV12 output is compared
//! with what a viewer should get: on an SDR monitor plain BT.709 limited range, on an HDR
//! monitor the same values after the tone curve (SDR content must come out as on an SDR
//! monitor; white near 230, not grey). Then the whole HDR monitor is captured once and its
//! luma histogram is stored in the report (the "histogram" of the plan; the owner also
//! looks at it, see the guide).

use std::time::Duration;

use descall_capture::bridge::StartRequest;
use descall_capture::hdr::monitor_hdr;
use descall_capture::ring::VideoFrameCopy;
use descall_capture::sources::Source;
use descall_capture::tonemap::{limited_luma, map_pixel, srgb_decode};
use serde_json::json;

use crate::env::Env;
use crate::harness::{sleep_ms, wait_until, Harness};
use crate::presenter::{Content, Opts, Presenter, BANDS};
use crate::report::{Status, TestResult};

/// Tolerance in 8-bit luma codes.
const TOL_SDR: u8 = 4;
const TOL_HDR: u8 = 8;
/// White must not come out grey: the old curve gave ~176.
const MIN_WHITE_HDR: u8 = 222;

fn expected(v: u8, mon: &Source) -> u8 {
    let s = v as f32 / 255.0;
    let i = monitor_hdr(mon.handle);
    if i.hdr {
        let p = i.tone_params();
        limited_luma(map_pixel([srgb_decode(s) * p.sdr_white; 3], &p))
    } else {
        limited_luma([s; 3])
    }
}

fn last_frame(req: &StartRequest) -> Result<(VideoFrameCopy, bool), String> {
    let h = Harness::start(req, true)?;
    let hdr = h.info.hdr;
    if !wait_until(Duration::from_secs(3), || h.sink.frames() > 10) {
        h.stop();
        return Err("no frames".into());
    }
    let f = h.sink.c.lock().ok().and_then(|c| c.last.clone());
    h.stop();
    f.map(|f| (f, hdr)).ok_or_else(|| "no frame".into())
}

fn band_lumas(f: &VideoFrameCopy) -> Vec<u8> {
    let (w, h) = (f.width as usize, f.height as usize);
    (0..BANDS.len())
        .map(|i| {
            let x = (2 * i + 1) * w / (2 * BANDS.len());
            let y = h * 2 / 3;
            // 5x5 average around the band centre.
            let mut s = 0u32;
            for dy in 0..5 {
                for dx in 0..5 {
                    s += f.nv12[(y + dy - 2) * w + x + dx - 2] as u32;
                }
            }
            (s / 25) as u8
        })
        .collect()
}

fn pattern_test(id: &str, name: &str, mon: &Source, tol: u8) -> TestResult {
    let p = match Presenter::spawn(Opts { x: mon.left + 60, y: mon.top + 60, width: 960, height: 540, popup: true, topmost: true, title: "DescallCaptureBench colour".into(), content: Content::Pattern }) {
        Ok(p) => p,
        Err(e) => return TestResult::new(id, name, Status::Fail).note(format!("test window: {e}")),
    };
    sleep_ms(500);
    let req = StartRequest { source_id: format!("window:{}:0", p.hwnd()), preset: Some("high".into()), cursor: Some(false), ..Default::default() };
    let r = last_frame(&req);
    drop(p);
    let (f, hdr_capture) = match r {
        Ok(v) => v,
        Err(e) => return TestResult::new(id, name, Status::Fail).note(e),
    };
    let got = band_lumas(&f);
    let want: Vec<u8> = BANDS.iter().map(|&v| expected(v, mon)).collect();
    let worst = got.iter().zip(&want).map(|(a, b)| a.abs_diff(*b)).max().unwrap_or(255);
    let mon_hdr = monitor_hdr(mon.handle).hdr;
    let white_ok = !mon_hdr || got.last().copied().unwrap_or(0) >= MIN_WHITE_HDR;
    TestResult::judged(id, name, worst <= tol && white_ok)
        .measured(format!("max error {worst}, white {}", got.last().copied().unwrap_or(0)))
        .limit(format!("<= {tol} codes{}", if mon_hdr { format!(", white >= {MIN_WHITE_HDR}") } else { String::new() }))
        .details(json!({ "bands": BANDS, "expectedY": want, "capturedY": got, "monitor": mon.id.format(), "monitorHdr": mon_hdr, "fp16Capture": hdr_capture, "hdrInfo": monitor_hdr(mon.handle) }))
}

/// 16-bin luma histogram of one full-monitor frame.
fn histogram_test(mon: &Source) -> TestResult {
    let id = format!("hdr.histogram.{}", mon.id.format().replace(':', "_"));
    let name = format!("HDR histogram {} (info)", mon.name);
    let req = StartRequest { source_id: mon.id.format(), preset: Some("high".into()), cursor: Some(false), ..Default::default() };
    match last_frame(&req) {
        Ok((f, _)) => {
            let y = &f.nv12[..(f.width * f.height) as usize];
            let mut bins = [0u64; 16];
            let mut sum = 0u64;
            let (mut clipped, mut crushed) = (0u64, 0u64);
            for &v in y {
                bins[(v as usize * 16 / 256).min(15)] += 1;
                sum += v as u64;
                clipped += (v >= 234) as u64;
                crushed += (v <= 17) as u64;
            }
            let n = y.len().max(1) as f64;
            let mean = sum as f64 / n;
            TestResult::new(&id, &name, Status::Info)
                .measured(format!("mean Y {mean:.0}, clip {:.1} %", 100.0 * clipped as f64 / n))
                .limit("-")
                .details(json!({ "bins16": bins, "meanY": mean, "clippedPct": 100.0 * clipped as f64 / n, "crushedPct": 100.0 * crushed as f64 / n, "size": [f.width, f.height] }))
        }
        Err(e) => TestResult::new(&id, &name, Status::Fail).note(e),
    }
}

pub fn run(env: &Env) -> Vec<TestResult> {
    if let Some(r) = &env.desktop_reason {
        return vec![TestResult::skip("color.sdr", "Colour accuracy (SDR path)", r), TestResult::skip("hdr.sdr_content", "HDR: SDR content not washed out", r)];
    }
    let mut out = Vec::new();
    match env.monitors.iter().find(|m| !m.hdr) {
        Some(m) => out.push(pattern_test("color.sdr", "Colour accuracy (SDR path)", m, TOL_SDR)),
        None => out.push(TestResult::skip("color.sdr", "Colour accuracy (SDR path)", "skipped (every monitor is HDR)")),
    }
    let hdr: Vec<&Source> = env.monitors.iter().filter(|m| m.hdr).collect();
    if hdr.is_empty() {
        out.push(TestResult::skip("hdr.sdr_content", "HDR: SDR content not washed out", "skipped (no HDR monitor; turn on HDR in Windows display settings)"));
    }
    for m in hdr {
        out.push(pattern_test(&format!("hdr.sdr_content.{}", m.id.format().replace(':', "_")), &format!("HDR {}: SDR content not washed out", m.name), m, TOL_HDR));
        out.push(histogram_test(m));
    }
    out
}
