//! instant_clip (Ultra), shell side: capture source list, the save hotkey, the save-to-disk
//! dialog, CPU / RAM metrics, and the native recorder (premium/clip.rs: native capture lane +
//! Media Foundation H.264 / AAC into an in-memory fragmented MP4 ring, game audio without the
//! call). premium-shim.js exposes it to the page as window.__descallNativeClip with the same
//! interface as the page's WebCodecs recorder, which stays as the fallback.
//!
//! Native channels: native-start { sourceId, windowSec, height, fps, audio } -> { info },
//! native-info, native-stop, native-snapshot -> { id, chunks, lengthMs, ... },
//! native-export (id, fromMs, toMs) -> { data: blob handle of an MP4 }, native-release (id).

use std::collections::VecDeque;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde_json::{json, Value};
use tauri::Manager;

use crate::premium::clip::{Opts, Recorder};
use crate::premium::logic::fmp4::Snapshot;
use crate::premium::logic::rules::{clamp_num, cut, s, safe_file_name, truthy};
use crate::premium::{arg, host, lock, now_ms, ok, platform, wins, Caller, Feature, From, Host};

#[derive(Default)]
pub struct F {
    rec: Mutex<Option<Recorder>>,
    snaps: Mutex<VecDeque<(u64, Snapshot)>>,
}

impl F {
    fn native(&self, h: &Host, ch: &str, args: &[Value]) -> Value {
        let a0 = arg(args, 0);
        match ch {
            "premium:instant_clip:native-start" => {
                if let Some(r) = lock(&self.rec).take() {
                    r.stop();
                }
                let opts = Opts {
                    source_id: cut(&s(&a0, "sourceId"), 200),
                    window_sec: if clamp_num(a0.get("windowSec"), 10.0, 120.0, 30.0) >= 60.0 { 60 } else { 30 },
                    height: clamp_num(a0.get("height"), 360.0, 1440.0, 720.0) as u32,
                    fps: clamp_num(a0.get("fps"), 10.0, 60.0, 30.0) as u32,
                    audio: a0.get("audio").is_none_or(|v| truthy(Some(v))),
                };
                match Recorder::start(opts) {
                    Ok(r) => {
                        let info = r.info();
                        *lock(&self.rec) = Some(r);
                        ok(json!({ "info": info }))
                    }
                    Err(e) => json!({ "ok": false, "error": e }),
                }
            }
            "premium:instant_clip:native-info" => match lock(&self.rec).as_ref() {
                Some(r) => ok(json!({ "info": r.info() })),
                None => ok(json!({ "info": { "running": false, "native": true } })),
            },
            "premium:instant_clip:native-stop" => {
                if let Some(r) = lock(&self.rec).take() {
                    r.stop();
                }
                ok(json!({}))
            }
            "premium:instant_clip:native-snapshot" => {
                let Some(snap) = lock(&self.rec).as_ref().map(Recorder::snapshot) else { return json!({ "ok": false, "error": "not-running" }) };
                let chunks: Vec<Value> = snap.chunks().into_iter().map(|(key, ts, dur, bytes)| json!({ "key": key, "ts": ts, "dur": dur, "bytes": bytes })).collect();
                if chunks.is_empty() {
                    return json!({ "ok": false, "error": "empty" });
                }
                let id = h.next_id();
                let out = ok(json!({
                    "id": id,
                    "chunks": chunks,
                    "lengthMs": snap.length_ms().round(),
                    "bytes": snap.frags.iter().map(|f| f.data.len()).sum::<usize>(),
                    "at": now_ms(),
                }));
                let mut list = lock(&self.snaps);
                list.push_back((id, snap));
                while list.len() > 2 {
                    list.pop_front(); // the editor shows one snapshot at a time
                }
                out
            }
            "premium:instant_clip:native-export" => {
                let id = a0.as_u64().unwrap_or(0);
                let from = clamp_num(args.get(1), 0.0, 1e9, 0.0);
                let to = clamp_num(args.get(2), 0.0, 1e9, 1e9);
                let bytes = lock(&self.snaps).iter().find(|(i, _)| *i == id).and_then(|(_, s)| s.export(from, to));
                match bytes {
                    Some(b) => ok(json!({ "data": h.put_blob(b), "mime": "video/mp4" })),
                    None => json!({ "ok": false, "error": "gone" }),
                }
            }
            _ => {
                let id = a0.as_u64().unwrap_or(0);
                lock(&self.snaps).retain(|(i, _)| *i != id);
                ok(json!({}))
            }
        }
    }
}

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
            ("premium:instant_clip:native-start", From::Main),
            ("premium:instant_clip:native-info", From::Main),
            ("premium:instant_clip:native-stop", From::Main),
            ("premium:instant_clip:native-snapshot", From::Main),
            ("premium:instant_clip:native-export", From::Main),
            ("premium:instant_clip:native-release", From::Main),
        ]
    }
    fn stop(&self, h: &Host) {
        h.hotkeys.unregister_owner("instant_clip");
        if let Some(r) = lock(&self.rec).take() {
            r.stop();
        }
        lock(&self.snaps).clear();
    }
    fn call(&self, h: &Host, ch: &str, args: &[Value], _c: &Caller) -> Result<Value, String> {
        if ch.starts_with("premium:instant_clip:native-") {
            return Ok(self.native(h, ch, args));
        }
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
