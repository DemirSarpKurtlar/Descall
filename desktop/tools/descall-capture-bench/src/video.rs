//! P0 test 2: 1080p60 and 1440p60 through the production pipeline.
//!
//! A borderless test window of exactly the preset size presents every vsync with a
//! barcode (Present time + counter). The share captures it with the real ShareHost; the
//! sink copies every frame out like the page does. Judged as in the plan:
//! - 1080p60: added latency p95 <= 5 ms (written - WGC arrival: GPU convert, readback and
//!   the ring copy, i.e. everything the native lane adds) and added CPU <= 3 %;
//! - 1440p60: frame drops <= 1 %.
//!
//! Everything else is reported for the record (INFO). On a software GPU nothing is judged.

use std::time::Duration;

use descall_capture::bridge::StartRequest;
use descall_capture::presets::preset;
use serde_json::json;

use crate::env::Env;
use crate::harness::{measure_cpu, sleep_ms, Harness};
use crate::presenter::{Content, Opts, Presenter};
use crate::report::{Status, TestResult};

pub const LATENCY_P95_MS: f64 = 5.0;
pub const ADDED_CPU_PCT: f64 = 3.0;
pub const DROP_PCT: f64 = 1.0;

pub fn run(env: &Env, preset_id: &str, label: &str, seconds: u64) -> Vec<TestResult> {
    let id = |s: &str| format!("video.{label}.{s}");
    let name = |s: &str| format!("{label}: {s}");
    if let Some(r) = &env.desktop_reason {
        return vec![TestResult::skip(&id("run"), &name("capture run"), r)];
    }
    let q = preset(preset_id);
    let Some(mon) = env.monitors.first() else { return vec![TestResult::skip(&id("run"), &name("capture run"), "skipped (no monitor)")] };
    // Offset so the window never exactly covers a monitor (that can switch it to
    // independent flip and is not what a shared app looks like anyway).
    let opts = Opts { x: mon.left + 40, y: mon.top + 40, width: q.width as i32, height: q.height as i32, popup: true, topmost: true, title: format!("DescallCaptureBench {label}"), content: Content::Video };
    let p = match Presenter::spawn(opts) {
        Ok(p) => p,
        Err(e) => return vec![TestResult::cannot_run(&id("run"), &name("capture run"), env.software_gpu(), format!("test window: {e}"))],
    };
    sleep_ms(1000);

    // Baseline: the test window alone.
    let f0 = p.frames();
    let (_, base_cpu, base_wall) = measure_cpu(|| sleep_ms(3000));
    let present_fps = (p.frames() - f0) as f64 / base_wall.as_secs_f64();

    let req = StartRequest { source_id: format!("window:{}:0", p.hwnd()), preset: Some(preset_id.into()), cursor: Some(false), audio: Some(false), ..Default::default() };
    let h = match Harness::start(&req, false) {
        Ok(h) => h,
        Err(e) => return vec![TestResult::cannot_run(&id("run"), &name("capture run"), env.software_gpu(), format!("share failed to start: {e}"))],
    };
    sleep_ms(1000);
    h.sink.reset();
    let s0 = h.stats();
    let (_, cap_cpu, wall) = measure_cpu(|| std::thread::sleep(Duration::from_secs(seconds)));
    let s1 = h.stats();
    let (frames, dims, added, wgc, e2e, gaps, undecoded) = {
        let g = h.sink.c.lock().expect("collector");
        let mut gaps = 0u64;
        for w in g.counters.windows(2) {
            let d = w[1].wrapping_sub(w[0]);
            if d > 1 && d < 10_000 {
                gaps += (d - 1) as u64;
            }
        }
        (g.frames, g.dims, g.added_us.summary(1000.0), g.wgc_us.summary(1000.0), g.e2e_us.summary(1000.0), gaps, g.undecoded)
    };
    let info = h.info.clone();
    h.stop();
    drop(p);

    let secs = wall.as_secs_f64();
    let fps = frames as f64 / secs;
    let expected = present_fps.min(q.fps as f64) * secs;
    let drop_pct = if expected > 0.0 { (100.0 * (1.0 - frames as f64 / expected)).max(0.0) } else { 100.0 };
    let added_cpu = cap_cpu - base_cpu;
    let soft = env.software_gpu();
    let judge = |want: bool, ok: bool| if soft || !want { Status::Info } else if ok { Status::Pass } else { Status::Fail };
    let is1080 = q.height == 1080;
    let soft_note = if soft { "software GPU: measured, not judged" } else { "" };
    let details = json!({
        "preset": preset_id, "box": [q.width, q.height], "targetFps": q.fps, "capturedSize": [dims.0, dims.1],
        "presentFps": present_fps, "deliveredFps": fps, "frames": frames, "seconds": secs,
        "addedLatencyMs": added, "wgcDeliveryMs": wgc, "glassToRingMs": e2e,
        "barcodeGaps": gaps, "undecodedFrames": undecoded,
        "cpuBaselinePct": base_cpu, "cpuCapturePct": cap_cpu, "cpuAddedPct": added_cpu,
        "pipeline": { "arrived": s1.frames_arrived - s0.frames_arrived, "pacedOut": s1.frames_paced_out - s0.frames_paced_out,
                      "written": s1.frames_written - s0.frames_written, "failed": s1.frames_failed - s0.frames_failed,
                      "convertUsAvg": s1.convert_us_avg, "convertUsMax": s1.convert_us_max, "helperRestarts": s1.helper_restarts },
        "captureMode": format!("{:?}", crate::harness::mode()).split('(').next().unwrap_or_default().to_string(),
        "startInfo": { "width": info.width, "height": info.height, "fps": info.fps, "hdr": info.hdr },
        "adapter": env.adapter.description,
    });
    let size_note = if dims != (q.width, q.height) { format!("captured {}x{} (box {}x{})", dims.0, dims.1, q.width, q.height) } else { String::new() };
    let mut out = vec![
        TestResult::new(&id("latency"), &name("added latency p95"), judge(is1080, added.p95 <= LATENCY_P95_MS))
            .measured(format!("{:.2} ms (p50 {:.2})", added.p95, added.p50))
            .limit(format!("<= {LATENCY_P95_MS} ms"))
            .note(soft_note)
            .details(details.clone()),
        TestResult::new(&id("cpu"), &name("added CPU"), judge(is1080, added_cpu <= ADDED_CPU_PCT)).measured(format!("{added_cpu:.2} %")).limit(format!("<= {ADDED_CPU_PCT} %")).note(soft_note),
        TestResult::new(&id("drops"), &name("frame drops"), judge(!is1080, drop_pct <= DROP_PCT)).measured(format!("{drop_pct:.2} % ({fps:.1} fps)")).limit(format!("<= {DROP_PCT} %")).note(size_note),
        TestResult::new(&id("e2e"), &name("glass-to-ring p95 (info)"), Status::Info).measured(format!("{:.1} ms", e2e.p95)).limit("-"),
    ];
    if frames == 0 {
        out = vec![TestResult::cannot_run(&id("run"), &name("capture run"), soft, "no frames captured").details(details)];
    }
    out
}
