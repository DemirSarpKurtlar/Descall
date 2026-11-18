//! P0 test 4: window capture follows the window (move, other monitor, resize, covered) and
//! the share ends by itself when the window closes. Also checks the mid-share cursor
//! toggle the share bar uses.

use std::time::{Duration, Instant};

use descall_capture::bridge::{StartRequest, UpdateRequest};
use serde_json::json;

use crate::env::Env;
use crate::harness::{sleep_ms, wait_until, Harness};
use crate::presenter::{Content, Opts, Presenter};
use crate::report::{Status, TestResult};

/// "Frames keep coming": at least this many in a one-second window (the share runs at
/// 30 fps, the test window presents every vsync).
const MIN_FRAMES_PER_SEC: u64 = 15;

fn frames_during(h: &Harness, ms: u64, during: impl FnOnce()) -> u64 {
    let f0 = h.sink.frames();
    let t0 = Instant::now();
    during();
    let left = Duration::from_millis(ms).saturating_sub(t0.elapsed());
    std::thread::sleep(left);
    h.sink.frames() - f0
}

pub fn run(env: &Env) -> Vec<TestResult> {
    const IDS: [(&str, &str); 6] = [
        ("follow.move", "Window follow: moved"),
        ("follow.monitor", "Window follow: other monitor"),
        ("follow.resize", "Window follow: resized"),
        ("follow.covered", "Window follow: covered"),
        ("follow.cursor", "Cursor toggle mid-share"),
        ("follow.close", "Window closed ends the share"),
    ];
    if let Some(r) = &env.desktop_reason {
        return IDS.iter().map(|(i, n)| TestResult::skip(i, n, r)).collect();
    }
    let mon = &env.monitors[0];
    let (x0, y0) = (mon.left + 80, mon.top + 80);
    let p = match Presenter::spawn(Opts { x: x0, y: y0, width: 960, height: 540, popup: false, topmost: false, title: "DescallCaptureBench follow".into(), content: Content::Video }) {
        Ok(p) => p,
        Err(e) => return vec![TestResult::new(IDS[0].0, IDS[0].1, Status::Fail).note(format!("test window: {e}"))],
    };
    sleep_ms(500);
    let req = StartRequest { source_id: format!("window:{}:0", p.hwnd()), preset: Some("high".into()), cursor: Some(true), ..Default::default() };
    let h = match Harness::start(&req, false) {
        Ok(h) => h,
        Err(e) => return vec![TestResult::new(IDS[0].0, IDS[0].1, Status::Fail).note(format!("share failed to start: {e}"))],
    };
    let mut out = Vec::new();
    if !wait_until(Duration::from_secs(3), || h.sink.frames() > 5) {
        out.push(TestResult::new(IDS[0].0, IDS[0].1, Status::Fail).note("no frames from the window"));
        return out;
    }
    let dims0 = h.sink.dims();

    // 1. Move across the screen in 20 steps over one second.
    let n = frames_during(&h, 1000, || {
        for i in 1..=20 {
            p.move_to(x0 + i * 15, y0 + i * 10);
            sleep_ms(45);
        }
    });
    out.push(TestResult::judged(IDS[0].0, IDS[0].1, n >= MIN_FRAMES_PER_SEC).measured(format!("{n} frames/s")).limit(format!(">= {MIN_FRAMES_PER_SEC}")));

    // 2. Another monitor.
    match env.monitors.get(1) {
        Some(m2) => {
            let n = frames_during(&h, 1500, || p.move_to(m2.left + 100, m2.top + 100));
            let same = h.sink.dims() == dims0;
            let rc = p.window_rect();
            let on_m2 = rc.left >= m2.left && rc.left < m2.left + m2.width;
            out.push(
                TestResult::judged(IDS[1].0, IDS[1].1, n >= MIN_FRAMES_PER_SEC * 3 / 2 && same && on_m2)
                    .measured(format!("{n} frames/1.5 s"))
                    .limit(format!(">= {}", MIN_FRAMES_PER_SEC * 3 / 2))
                    .note(if same { String::new() } else { format!("size changed {:?} -> {:?}", dims0, h.sink.dims()) }),
            );
            p.move_to(x0, y0);
            sleep_ms(300);
        }
        None => out.push(TestResult::skip(IDS[1].0, IDS[1].1, "skipped (only one monitor)")),
    }

    // 3. Resize: frames continue at the new size.
    let n = frames_during(&h, 1500, || p.resize_client(1280, 720));
    let dims = h.sink.dims();
    let resizes = h.stats().resizes;
    out.push(
        TestResult::judged(IDS[2].0, IDS[2].1, n >= MIN_FRAMES_PER_SEC && dims.0 >= 1270 && dims.1 >= 710)
            .measured(format!("{}x{}, {n} frames", dims.0, dims.1))
            .limit("1280x720, frames")
            .details(json!({ "before": [dims0.0, dims0.1], "after": [dims.0, dims.1], "poolRecreations": resizes })),
    );

    // 4. Covered by another window: WGC reads the window's own surface.
    let rc = p.window_rect();
    let cover = Presenter::spawn(Opts { x: rc.left, y: rc.top, width: rc.right - rc.left, height: rc.bottom - rc.top, popup: true, topmost: true, title: "DescallCaptureBench cover".into(), content: Content::Pattern });
    match cover {
        Ok(c) => {
            sleep_ms(300);
            let n = frames_during(&h, 1000, || {});
            out.push(TestResult::judged(IDS[3].0, IDS[3].1, n >= MIN_FRAMES_PER_SEC).measured(format!("{n} frames/s")).limit(format!(">= {MIN_FRAMES_PER_SEC}")));
            c.close();
        }
        Err(e) => out.push(TestResult::new(IDS[3].0, IDS[3].1, Status::Fail).note(format!("cover window: {e}"))),
    }

    // 5. Cursor toggle.
    if env.caps.cursor_toggle {
        let off = h.update(&UpdateRequest { cursor: Some(false), ..Default::default() });
        let on = h.update(&UpdateRequest { cursor: Some(true), ..Default::default() });
        out.push(TestResult::judged(IDS[4].0, IDS[4].1, off && on).measured(format!("off {off}, on {on}")).limit("both applied"));
    } else {
        out.push(TestResult::skip(IDS[4].0, IDS[4].1, "skipped (Windows older than 2004)"));
    }

    // 6. Close the window: the share must end by itself with "source-closed".
    let t0 = Instant::now();
    p.request_close();
    let ended = wait_until(Duration::from_secs(3), || h.sink.ended().is_some());
    let why = h.sink.ended();
    let ms = why.as_ref().map(|(_, t)| t.duration_since(t0).as_millis()).unwrap_or(0);
    let ok = ended && why.as_ref().map(|(r, _)| r == "source-closed").unwrap_or(false);
    out.push(
        TestResult::judged(IDS[5].0, IDS[5].1, ok)
            .measured(if ended { format!("ended in {ms} ms") } else { "still running".into() })
            .limit("< 3000 ms")
            .note(why.map(|(r, _)| format!("reason: {r}")).unwrap_or_default()),
    );
    drop(p);
    h.stop();
    out
}
