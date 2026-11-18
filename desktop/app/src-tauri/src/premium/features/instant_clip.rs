//! instant_clip (Ultra), shell side: capture source list, the save hotkey, the save-to-disk
//! dialog and CPU / RAM metrics. The ring buffer runs in the main renderer (WebCodecs), only
//! while the user has it on; premium-shim.js serves its desktop-source getUserMedia from the
//! native capture lane and fills the source list from electronAPI.getScreenSources().

use std::sync::Arc;
use std::time::{Duration, Instant};

use serde_json::{json, Value};
use tauri::Manager;

use crate::premium::logic::rules::{cut, safe_file_name};
use crate::premium::{arg, host, now_ms, ok, platform, wins, Caller, Feature, From, Host};

#[derive(Default)]
pub struct F;

fn metrics() -> Value {
    // percentCPUUsage semantics: CPU time over a 2 s window, summed over the process tree.
    let (c0, _, _, _) = platform::process_tree_usage();
    let t0 = Instant::now();
    std::thread::sleep(Duration::from_secs(2));
    let (c1, ws, pv, n) = platform::process_tree_usage();
    let wall = t0.elapsed().as_secs_f64() * 1e7; // 100 ns units
    let cpu = if wall > 0.0 { c1.saturating_sub(c0) as f64 / wall * 100.0 } else { 0.0 };
    let r = |x: f64| (x * 10.0).round() / 10.0;
    ok(json!({
        "at": now_ms(),
        "total": { "cpuPercent": r(cpu), "workingSetMB": r(ws as f64 / 1_048_576.0), "privateMB": r(pv as f64 / 1_048_576.0) },
        "renderer": Value::Null,
        "processes": n,
    }))
}

impl Feature for F {
    fn key(&self) -> &'static str {
        "instant_clip"
    }
    fn channels(&self) -> &'static [(&'static str, From)] {
        &[
            ("premium:instant_clip:sources", From::Main),
            ("premium:instant_clip:hotkey", From::Main),
            ("premium:instant_clip:metrics", From::Main),
            ("premium:instant_clip:save-file", From::Main),
        ]
    }
    fn stop(&self, h: &Host) {
        h.hotkeys.unregister_owner("instant_clip");
    }
    fn call(&self, h: &Host, ch: &str, args: &[Value], _c: &Caller) -> Result<Value, String> {
        Ok(match ch {
            // The shim lists the sources (native capture lane); the shell only gates the call.
            "premium:instant_clip:sources" => ok(json!({ "sources": [], "systemAudio": true, "delegate": "electronAPI.getScreenSources" })),
            "premium:instant_clip:hotkey" => {
                h.hotkeys.unregister_owner("instant_clip");
                let accel = arg(args, 0).as_str().map(|a| cut(a, 40)).unwrap_or_default();
                if accel.is_empty() {
                    return Ok(ok(json!({ "hotkey": "" })));
                }
                let f: Arc<dyn Fn() + Send + Sync> = Arc::new(|| {
                    if let Some(h) = host() {
                        if h.has("instant_clip") {
                            h.send("premium:instant_clip:save", json!({ "at": now_ms() }));
                        }
                    }
                });
                let okk = h.hotkeys.register_extra("instant_clip", &accel, f);
                json!({ "ok": okk, "hotkey": if okk { accel } else { String::new() } })
            }
            "premium:instant_clip:metrics" => metrics(),
            _ => {
                let Some(bytes) = h.take_blob(&arg(args, 1)).filter(|b| !b.is_empty()) else { return Ok(json!({ "ok": false })) };
                let name = safe_file_name(arg(args, 0).as_str().unwrap_or(""));
                let ext = name.rsplit('.').next().filter(|e| *e == "mp4" || *e == "webm").unwrap_or("webm").to_string();
                let owner = h.app.get_webview_window("main").and_then(|w| wins::hwnd(&w)).unwrap_or(0);
                let dir = h.app.path().video_dir().ok();
                match platform::save_dialog(owner, &name, dir, &ext) {
                    Some(path) => match std::fs::write(&path, bytes) {
                        Ok(()) => ok(json!({})),
                        Err(e) => json!({ "ok": false, "error": e.to_string() }),
                    },
                    None => json!({ "ok": false, "canceled": true }),
                }
            }
        })
    }
}
