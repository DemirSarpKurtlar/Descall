//! quick_reply (Plus): reply to a DM straight from the notification. A replyable DM becomes a
//! native Windows toast with an inline reply box (toast.rs); every other notification keeps
//! Descall's own capsules. The typed text goes to the renderer (premium:quick-reply
//! { conv, text }), which posts it through POST /api/messages/quick-reply.
//! The shell's notification code calls premium::notify_filter / premium::show_quick_reply.
#![allow(dead_code)] // reached through those shell hooks

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde_json::{json, Value};

use crate::premium::logic::rules::{cut, reply_target};
use crate::premium::toast::{self, Handle, TOAST_CLSID};
use crate::premium::{lock, ok, Caller, Feature, From, Host};

const KEEP: Duration = Duration::from_secs(10 * 60);
const MAX_LIVE: usize = 20;

struct Live {
    handle: Handle,
    at: Instant,
}

#[derive(Default)]
pub struct F;

/// Toasts that can still be answered (their Activated handler lives with them).
static LIVE: std::sync::LazyLock<Mutex<HashMap<String, Live>>> = std::sync::LazyLock::new(|| Mutex::new(HashMap::new()));

fn support() -> Result<(), &'static str> {
    if !cfg!(windows) {
        return Err("platform");
    }
    if !toast::identity_ready() {
        return Err("identity");
    }
    Ok(())
}

/// Marks replyable DMs (`quickReply: { conv }`) while the feature runs.
pub(crate) fn filter(h: &Host, payload: Value) -> Option<Value> {
    if !h.is_running("quick_reply") {
        return Some(payload);
    }
    let data = payload.get("options").and_then(|o| o.get("data")).cloned().unwrap_or(json!({}));
    let Some(conv) = reply_target(&data) else { return Some(payload) };
    let mut p = payload;
    p["quickReply"] = json!({ "conv": conv });
    Some(p)
}

/// Show a native reply toast; false = the caller shows the capsule instead.
pub(crate) fn show(h: &Host, title: &str, body: &str, conv: &str, click_data: Value) -> bool {
    if !h.is_running("quick_reply") || support().is_err() {
        return false;
    }
    {
        let mut l = lock(&LIVE);
        l.retain(|_, e| e.at.elapsed() < KEEP);
        while l.len() >= MAX_LIVE {
            let Some(oldest) = l.iter().min_by_key(|(_, e)| e.at).map(|(k, _)| k.clone()) else { break };
            l.remove(&oldest);
        }
    }
    let id = format!("descall-qr-{:x}-{:x}", crate::premium::now_ms(), h.next_id());
    let conv = cut(conv, 70);
    let replied = Arc::new(std::sync::atomic::AtomicBool::new(false));
    let on = {
        let conv = conv.clone();
        Box::new(move |text: Option<String>| {
            let Some(h) = crate::premium::host() else { return };
            match text {
                Some(t) => {
                    let body = cut(t.trim(), 2000);
                    if !body.is_empty() && !replied.swap(true, std::sync::atomic::Ordering::Relaxed) {
                        h.send("premium:quick-reply", json!({ "conv": conv, "text": body }));
                    }
                }
                None => {
                    h.show_main();
                    let _ = tauri::Emitter::emit_to(&h.app, "main", "notification:click", click_data.clone());
                }
            }
        })
    };
    match toast::show(&id, &cut(title, 120), &cut(body, 300), &h.et("quickReply.placeholder", &[]), on) {
        Ok(handle) => {
            lock(&LIVE).insert(id, Live { handle, at: Instant::now() });
            true
        }
        Err(e) => {
            log::warn!("[premium] reply toast failed: {e}");
            false
        }
    }
}

impl Feature for F {
    fn key(&self) -> &'static str {
        "quick_reply"
    }
    fn channels(&self) -> &'static [(&'static str, From)] {
        &[("premium:quick_reply:status", From::Main)]
    }
    fn stop(&self, _h: &Host) {
        for (_, l) in lock(&LIVE).drain() {
            l.handle.hide();
        }
    }
    fn call(&self, _h: &Host, _ch: &str, _a: &[Value], _c: &Caller) -> Result<Value, String> {
        Ok(match support() {
            Ok(()) => ok(json!({ "mode": "native", "reason": Value::Null, "clsid": TOAST_CLSID })),
            Err(r) => ok(json!({ "mode": "unavailable", "reason": r, "clsid": TOAST_CLSID })),
        })
    }
}
