//! quick_file_drop (Plus): a small always-on-top drop zone. Files dropped on it are read in the
//! drop window, handed to the main window and sent to the chosen recent chat through the normal
//! upload path (same 100 MB cap). Paths never leave the shell; only the name and bytes do (the
//! bytes travel as blob handles, see premium_blob_put / premium_blob_take).

use std::sync::Mutex;

use serde_json::{json, Value};

use crate::premium::logic::geom;
use crate::premium::logic::rules::{cut, drop_targets, s, DROP_MAX_BYTES};
use crate::premium::logic::tray::TrayItem;
use crate::premium::overlay::{self, OpenOpts};
use crate::premium::{arg, host, lock, ok, wins, Caller, Feature, From, Host};

const ID: &str = "quickdrop";

#[derive(Default)]
pub struct F {
    tray_label: Mutex<String>,
}

static STATE: Mutex<Option<Value>> = Mutex::new(None);

fn state() -> Value {
    lock(&STATE).clone().unwrap_or_else(|| json!({ "labels": {}, "targets": [], "target": "", "status": "", "maxBytes": DROP_MAX_BYTES }))
}

fn open(h: &Host) -> Value {
    let sc = wins::scale(h);
    let b = geom::corner_bounds(wins::primary_area(h), "br", (220.0 * sc) as i32, (170.0 * sc) as i32, (24.0 * sc) as i32);
    overlay::open(h, OpenOpts { id: ID, kind: "quickdrop", owner: "quick_file_drop", bounds: b, click_through: false, opacity: 0.97, focusable: true, state: Some(state()), widget_kind: None });
    ok(json!({ "open": true }))
}

fn close(h: &Host) -> Value {
    overlay::close(h, ID);
    ok(json!({ "open": false }))
}

pub(crate) fn on_action(h: &Host, kind: &str, payload: &Value) {
    match kind {
        "close" => {
            close(h);
            h.send("premium:quick_file_drop:closed", json!({}));
        }
        "pick" => {
            let mut st = state();
            st["target"] = json!(s(payload, "target"));
            *lock(&STATE) = Some(st);
        }
        "drop" => {
            let target = s(payload, "target");
            let st = state();
            if target.is_empty() || !st["targets"].as_array().is_some_and(|t| t.iter().any(|x| x["id"] == json!(target))) {
                // Unknown target: free the uploaded bytes.
                for f in payload.get("files").and_then(Value::as_array).cloned().unwrap_or_default() {
                    let _ = h.take_blob(&f["data"]);
                }
                return;
            }
            let dropped: Vec<Value> = payload.get("files").and_then(Value::as_array).cloned().unwrap_or_default().into_iter().take(10).collect();
            // + the files the drop window could not upload (premium-hud-shim.js).
            let total = dropped.len() + payload.get("skipped").and_then(Value::as_u64).unwrap_or(0).min(10) as usize;
            // A big drop can outgrow the 300 MB blob store, which evicts the oldest bytes:
            // those files are left out and counted, so the drop zone reports a failure instead
            // of the whole drop vanishing (the page could not fetch a gone blob).
            let files: Vec<Value> = dropped
                .into_iter()
                .filter(|f| f["data"].get("__blob").is_some() && f["data"]["size"].as_u64().is_some_and(|n| n > 0 && n as usize <= DROP_MAX_BYTES) && h.has_blob(&f["data"]))
                .map(|f| {
                    let t = s(&f, "type");
                    let n = s(&f, "name");
                    json!({ "name": cut(if n.is_empty() { "file" } else { &n }, 180), "type": cut(if t.is_empty() { "application/octet-stream" } else { &t }, 120), "data": f["data"] })
                })
                .collect();
            let skipped = total - files.len();
            if files.is_empty() && skipped == 0 {
                return;
            }
            let mut next = st;
            next["target"] = json!(target);
            *lock(&STATE) = Some(next);
            h.send("premium:quick_file_drop:files", json!({ "target": target, "files": files, "skipped": skipped }));
        }
        _ => {}
    }
}

impl Feature for F {
    fn key(&self) -> &'static str {
        "quick_file_drop"
    }
    fn channels(&self) -> &'static [(&'static str, From)] {
        &[("premium:quick_file_drop:open", From::Main), ("premium:quick_file_drop:close", From::Main), ("premium:quick_file_drop:state", From::Main), ("premium:quick_file_drop:status", From::Main)]
    }
    fn stop(&self, h: &Host) {
        close(h);
        lock(&self.tray_label).clear();
        h.refresh_tray();
    }
    fn call(&self, h: &Host, ch: &str, args: &[Value], _c: &Caller) -> Result<Value, String> {
        Ok(match ch {
            "premium:quick_file_drop:open" => open(h),
            "premium:quick_file_drop:close" => close(h),
            "premium:quick_file_drop:state" => {
                let next = arg(args, 0);
                let mut st = state();
                let targets = drop_targets(&next);
                let cur = st["target"].clone();
                if next.get("labels").is_some_and(Value::is_object) {
                    st["labels"] = next["labels"].clone();
                }
                st["target"] = if targets.iter().any(|t| t["id"] == cur) { cur } else { targets.first().map(|t| t["id"].clone()).unwrap_or(json!("")) };
                st["targets"] = json!(targets);
                st["status"] = json!("");
                st["dropStatus"] = match next.get("dropStatus") {
                    None | Some(Value::Null) => Value::Null,
                    Some(v) => json!(cut(v.as_str().map(str::to_string).unwrap_or_else(|| v.to_string()).as_str(), 80)),
                };
                st["brandRgb"] = next.get("brandRgb").cloned().filter(|v| !v.is_null()).unwrap_or(json!(""));
                *lock(&STATE) = Some(st.clone());
                overlay::send(h, ID, st);
                if let Some(label) = next.get("trayLabel").and_then(Value::as_str) {
                    let label = cut(label, 60);
                    let mut cur = lock(&self.tray_label);
                    if *cur != label {
                        *cur = label;
                        drop(cur);
                        h.refresh_tray();
                    }
                }
                ok(json!({}))
            }
            _ => ok(json!({ "open": overlay::get(h, ID).is_some() })),
        })
    }
    fn tray(&self, _h: &Host) -> Vec<TrayItem> {
        let l = lock(&self.tray_label).clone();
        if l.is_empty() {
            return Vec::new();
        }
        vec![TrayItem::Item { id: "premium|drop|toggle".into(), label: l, enabled: true }]
    }
    fn on_tray(&self, h: &Host, rest: &str) -> bool {
        if rest != "drop|toggle" {
            return false;
        }
        if overlay::get(h, ID).is_some() {
            close(h);
        } else {
            open(h);
        }
        let _ = host();
        true
    }
}
