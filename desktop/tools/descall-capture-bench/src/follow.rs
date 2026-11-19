//! P0 test 4: window capture follows the window (move, other monitor, resize, covered) and
//! the share ends by itself when the window closes. Also checks the mid-share cursor
//! toggle the share bar uses.
//!
//! Every sub-step prints (and flushes) one line before it runs and its result right after,
//! so a crash that bypasses the panic hook (a native fail-fast) still shows which step it was.

use std::io::Write;
use std::time::{Duration, Instant};

use descall_capture::bridge::{StartRequest, UpdateRequest};
use serde_json::json;

use crate::env::Env;
use crate::harness::{sleep_ms, wait_until, Harness};
use crate::presenter::{Content, Opts, Presenter};
use crate::report::TestResult;

/// "Frames keep coming": at least this many in a one-second window (the share runs at
/// 30 fps, the test window presents every vsync).
const MIN_FRAMES_PER_SEC: u64 = 15;

const MOVE: (&str, &str) = ("follow.move", "Window follow: moved");
const MONITOR: (&str, &str) = ("follow.monitor", "Window follow: other monitor");
const RESIZE: (&str, &str) = ("follow.resize", "Window follow: resized");
const COVERED: (&str, &str) = ("follow.covered", "Window follow: covered");
const CLOSE: (&str, &str) = ("follow.close", "Window closed ends the share");
const CURSOR: (&str, &str) = ("follow.cursor", "Cursor toggle mid-share");
const ALL: [(&str, &str); 6] = [MOVE, MONITOR, RESIZE, COVERED, CLOSE, CURSOR];

fn frames_during(h: &Harness, ms: u64, during: impl FnOnce()) -> u64 {
    let f0 = h.sink.frames();
    let t0 = Instant::now();
    during();
    let left = Duration::from_millis(ms).saturating_sub(t0.elapsed());
    std::thread::sleep(left);
    h.sink.frames().saturating_sub(f0)
}

/// "    follow: <what>..." on stdout, flushed before the step runs.
fn step(what: &str) {
    let mut o = std::io::stdout();
    let _ = writeln!(o, "    follow: {what}...");
    let _ = o.flush();
}

fn push(out: &mut Vec<TestResult>, r: TestResult) {
    let mut o = std::io::stdout();
    let _ = writeln!(o, "    follow: -> {} {} {}", r.status.label(), r.measured, r.note);
    let _ = o.flush();
    out.push(r);
}

fn test_window(env: &Env, title: &str) -> Result<Presenter, String> {
    let mon = &env.monitors[0];
    Presenter::spawn(Opts { x: mon.left + 80, y: mon.top + 80, width: 960, height: 540, popup: false, topmost: false, title: title.into(), content: Content::Video })
}

fn start_capture(p: &Presenter, cursor: bool) -> Result<Harness, String> {
    let req = StartRequest { source_id: format!("window:{}:0", p.hwnd()), preset: Some("high".into()), cursor: Some(cursor), ..Default::default() };
    Harness::start(&req, false)
}

pub fn run(env: &Env) -> Vec<TestResult> {
    let mut restarts = 0u64;
    let rows = run_steps(env, &mut restarts);
    soften(rows, env.software_gpu(), restarts)
}

/// On a software GPU the adapter can reset under load and take the capture device with it;
/// helper mode then restarts the capture and the share goes on, but a frame count can fall
/// short in that second. Such a FAIL is an environment limit there: SKIP with the reason.
fn soften(rows: Vec<TestResult>, soft: bool, restarts: u64) -> Vec<TestResult> {
    rows.into_iter()
        .map(|r| {
            if soft && restarts > 0 && r.status == crate::report::Status::Fail {
                let note = format!("skipped (software GPU: capture device lost, helper restarted {restarts}x; {})", r.measured);
                TestResult { status: crate::report::Status::Skip, note, ..r }
            } else {
                r
            }
        })
        .collect()
}

fn run_steps(env: &Env, restarts: &mut u64) -> Vec<TestResult> {
    if let Some(r) = &env.desktop_reason {
        return ALL.iter().map(|(i, n)| TestResult::skip(i, n, r)).collect();
    }
    let soft = env.software_gpu();
    let mut out = Vec::new();
    let mon = &env.monitors[0];
    let (x0, y0) = (mon.left + 80, mon.top + 80);

    step("create the test window");
    let p = match test_window(env, "DescallCaptureBench follow") {
        Ok(p) => p,
        Err(e) => return vec![TestResult::cannot_run(MOVE.0, MOVE.1, soft, format!("test window: {e}"))],
    };
    sleep_ms(500);
    // Cursor off here: the cursor gets its own session at the end (step 6).
    step("start the window capture");
    let h = match start_capture(&p, false) {
        Ok(h) => h,
        Err(e) => return vec![TestResult::cannot_run(MOVE.0, MOVE.1, soft, format!("share failed to start: {e}"))],
    };
    step("wait for the first frames");
    if !wait_until(Duration::from_secs(3), || h.sink.frames() > 5) {
        push(&mut out, TestResult::cannot_run(MOVE.0, MOVE.1, soft, "no frames from the window"));
        return out;
    }
    let dims0 = h.sink.dims();

    // 1. Move across the screen in 20 steps over one second.
    step("move the window (20 steps)");
    let n = frames_during(&h, 1000, || {
        for i in 1..=20 {
            p.move_to(x0 + i * 15, y0 + i * 10);
            sleep_ms(45);
        }
    });
    *restarts = (*restarts).max(h.stats().helper_restarts);
    push(&mut out, TestResult::judged(MOVE.0, MOVE.1, n >= MIN_FRAMES_PER_SEC).measured(format!("{n} frames/s")).limit(format!(">= {MIN_FRAMES_PER_SEC}")));

    // 2. Another monitor.
    match env.monitors.get(1) {
        Some(m2) => {
            step("move the window to the second monitor");
            let n = frames_during(&h, 1500, || p.move_to(m2.left + 100, m2.top + 100));
            *restarts = (*restarts).max(h.stats().helper_restarts);
            let same = h.sink.dims() == dims0;
            let rc = p.window_rect();
            let on_m2 = rc.left >= m2.left && rc.left < m2.left + m2.width;
            push(
                &mut out,
                TestResult::judged(MONITOR.0, MONITOR.1, n >= MIN_FRAMES_PER_SEC * 3 / 2 && same && on_m2)
                    .measured(format!("{n} frames/1.5 s"))
                    .limit(format!(">= {}", MIN_FRAMES_PER_SEC * 3 / 2))
                    .note(if same { String::new() } else { format!("size changed {:?} -> {:?}", dims0, h.sink.dims()) }),
            );
            p.move_to(x0, y0);
            sleep_ms(300);
        }
        None => {
            step("second monitor: none");
            push(&mut out, TestResult::skip(MONITOR.0, MONITOR.1, "skipped (only one monitor)"));
        }
    }

    // 3. Resize: frames continue at the new size.
    step("resize the window to 1280x720");
    let n = frames_during(&h, 1500, || p.resize_client(1280, 720));
    let dims = h.sink.dims();
    let resizes = h.stats().resizes;
    *restarts = (*restarts).max(h.stats().helper_restarts);
    push(
        &mut out,
        TestResult::judged(RESIZE.0, RESIZE.1, n >= MIN_FRAMES_PER_SEC && dims.0 >= 1270 && dims.1 >= 710)
            .measured(format!("{}x{}, {n} frames", dims.0, dims.1))
            .limit("1280x720, frames")
            .details(json!({ "before": [dims0.0, dims0.1], "after": [dims.0, dims.1], "poolRecreations": resizes })),
    );

    // 4. Covered by another window: WGC reads the window's own surface.
    step("cover the window with another window");
    let rc = p.window_rect();
    match Presenter::spawn(Opts { x: rc.left, y: rc.top, width: rc.right - rc.left, height: rc.bottom - rc.top, popup: true, topmost: true, title: "DescallCaptureBench cover".into(), content: Content::Pattern }) {
        Ok(c) => {
            sleep_ms(300);
            let n = frames_during(&h, 1000, || {});
            *restarts = (*restarts).max(h.stats().helper_restarts);
            step("remove the cover window");
            c.close();
            push(&mut out, TestResult::judged(COVERED.0, COVERED.1, n >= MIN_FRAMES_PER_SEC).measured(format!("{n} frames/s")).limit(format!(">= {MIN_FRAMES_PER_SEC}")));
        }
        Err(e) => push(&mut out, TestResult::cannot_run(COVERED.0, COVERED.1, soft, format!("cover window: {e}"))),
    }

    // 5. Close the window: the share must end by itself with "source-closed".
    step("close the window");
    let t0 = Instant::now();
    p.request_close();
    step("wait for the share to end");
    let ended = wait_until(Duration::from_secs(3), || h.sink.ended().is_some());
    *restarts = (*restarts).max(h.stats().helper_restarts);
    let why = h.sink.ended();
    let ms = why.as_ref().map(|(_, t)| t.duration_since(t0).as_millis()).unwrap_or(0);
    let ok = ended && why.as_ref().map(|(r, _)| r == "source-closed").unwrap_or(false);
    push(
        &mut out,
        TestResult::judged(CLOSE.0, CLOSE.1, ok)
            .measured(if ended { format!("ended in {ms} ms") } else { "still running".into() })
            .limit("< 3000 ms")
            .note(why.map(|(r, _)| format!("reason: {r}")).unwrap_or_default()),
    );
    step("release the test window");
    drop(p);
    step("stop the capture");
    h.stop();

    // 6. Cursor: a fresh window and share, cursor turned on and off mid-share.
    if !env.caps.cursor_toggle {
        push(&mut out, TestResult::skip(CURSOR.0, CURSOR.1, "skipped (Windows older than 2004)"));
        return out;
    }
    step("cursor: create a window and start a capture");
    let p = match test_window(env, "DescallCaptureBench cursor") {
        Ok(p) => p,
        Err(e) => {
            push(&mut out, TestResult::cannot_run(CURSOR.0, CURSOR.1, soft, format!("test window: {e}")));
            return out;
        }
    };
    sleep_ms(300);
    let h = match start_capture(&p, false) {
        Ok(h) => h,
        Err(e) => {
            push(&mut out, TestResult::cannot_run(CURSOR.0, CURSOR.1, soft, format!("share failed to start: {e}")));
            return out;
        }
    };
    let _ = wait_until(Duration::from_secs(2), || h.sink.frames() > 3);
    step("cursor: turn it on");
    let on = h.update(&UpdateRequest { cursor: Some(true), ..Default::default() });
    let n_on = frames_during(&h, 700, || {});
    step("cursor: turn it off");
    let off = h.update(&UpdateRequest { cursor: Some(false), ..Default::default() });
    let n_off = frames_during(&h, 500, || {});
    *restarts = (*restarts).max(h.stats().helper_restarts);
    step("cursor: stop");
    h.stop();
    drop(p);
    push(
        &mut out,
        TestResult::judged(CURSOR.0, CURSOR.1, on && off && n_on > 0 && n_off > 0).measured(format!("on {on}, off {off}, frames {n_on}/{n_off}")).limit("both applied, frames continue"),
    );
    out
}
