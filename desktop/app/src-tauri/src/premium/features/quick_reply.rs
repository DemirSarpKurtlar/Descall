//! quick_reply (Plus): reply to a DM straight from the notification. A replyable DM becomes a
//! native Windows toast with an inline reply box (toast.rs); every other notification keeps
//! Descall's own capsules. The typed text goes to the renderer (premium:quick-reply
//! { conv, text }), which posts it through POST /api/messages/quick-reply.
//! The shell's notification code calls premium::notify_filter / premium::show_quick_reply.
//! A reply typed after Descall was closed arrives through the COM toast activator at startup;
//! it waits here until the main window and this feature are up, then goes out like any other.
#![allow(dead_code)] // reached through those shell hooks

use std::collections::{HashMap, HashSet};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde_json::{json, Value};

use crate::premium::logic::rules::{cut, parse_toast_args, parse_toast_click, reply_target, toast_args, toast_click_args};
use crate::premium::toast::{self, Handle, TOAST_CLSID};
use crate::premium::{host, lock, ok, Bus, Caller, Feature, From, Host};

const KEEP: Duration = Duration::from_secs(10 * 60);
const MAX_LIVE: usize = 20;

struct Live {
    handle: Handle,
    at: Instant,
    click: Value,
}

/// Replies waiting for the renderer (cold start), and the toast ids already answered (the
/// in-process event and the COM activator can both report the same reply).
static PENDING: Mutex<Vec<(String, String, Instant)>> = Mutex::new(Vec::new());
static REPLIED: std::sync::LazyLock<Mutex<HashSet<String>>> = std::sync::LazyLock::new(|| Mutex::new(HashSet::new()));

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
    prune();
    let id = format!("descall-qr-{:x}-{:x}", crate::premium::now_ms(), h.next_id());
    let args = toast_args(&id, &cut(conv, 70));
    match toast::show(&args, &cut(title, 120), &cut(body, 300), &h.et("quickReply.placeholder", &[]), on_activation) {
        Ok(handle) => {
            lock(&LIVE).insert(id, Live { handle, at: Instant::now(), click: click_data });
            true
        }
        Err(e) => {
            log::warn!("[premium] reply toast failed: {e}");
            false
        }
    }
}

/// Toasts older than ten minutes go, and at most MAX_LIVE stay answerable / clickable.
fn prune() {
    let mut l = lock(&LIVE);
    l.retain(|_, e| e.at.elapsed() < KEEP);
    while l.len() >= MAX_LIVE {
        let Some(oldest) = l.iter().min_by_key(|(_, e)| e.at).map(|(k, _)| k.clone()) else { break };
        l.remove(&oldest);
    }
}

/// The Descall+ "toast" notification style: a native toast without the reply box whose click
/// opens the chat (Electron's Notification click sent notification:click with this envelope;
/// tauri-plugin-notification has no click on Windows). False: the caller falls back.
pub(crate) fn show_plain(h: &Host, title: &str, body: &str, silent: bool, click: Value) -> bool {
    if support().is_err() {
        return false;
    }
    prune();
    let id = format!("descall-n-{:x}-{:x}", crate::premium::now_ms(), h.next_id());
    let xml = toast::plain_toast_xml(&toast_click_args(&id), &cut(title, 120), &cut(body, 300), silent);
    match toast::show_xml(&xml, on_activation) {
        Ok(handle) => {
            lock(&LIVE).insert(id, Live { handle, at: Instant::now(), click });
            true
        }
        Err(e) => {
            log::warn!("[premium] notification toast failed: {e}");
            false
        }
    }
}

/// Every toast activation (in-process event or COM activator, warm or cold start).
pub(crate) fn on_activation(args: String, reply: Option<String>) {
    if let Some(id) = parse_toast_click(&args) {
        let Some(h) = host() else { return };
        h.show_main();
        let click = lock(&LIVE).get(&id).map(|l| l.click.clone());
        if let Some(click) = click {
            let _ = tauri::Emitter::emit_to(&h.app, "main", "notification:click", click);
        }
        return;
    }
    let Some((id, conv)) = parse_toast_args(&args) else { return };
    let text = reply.map(|t| cut(t.trim(), 2000)).filter(|t| !t.is_empty());
    match text {
        Some(text) => {
            {
                let mut done = lock(&REPLIED);
                if done.len() > 500 {
                    done.clear();
                }
                if !done.insert(id) {
                    return;
                }
            }
            lock(&PENDING).push((conv, text, Instant::now()));
            flush();
        }
        None => {
            let Some(h) = host() else { return };
            h.show_main();
            let click = lock(&LIVE).get(&id).map(|l| l.click.clone()).unwrap_or_else(|| {
                let peer = conv.trim_start_matches("dm:");
                json!({ "data": { "type": "dm", "conversationId": peer, "fromId": peer } })
            });
            let _ = tauri::Emitter::emit_to(&h.app, "main", "notification:click", click);
        }
    }
}

/// Send waiting replies once the renderer is up and the feature runs (10 min at most).
fn flush() {
    let Some(h) = host() else { return };
    lock(&PENDING).retain(|(_, _, at)| at.elapsed() < KEEP);
    let ready = lock(&h.app_state).get("ready").and_then(Value::as_bool) == Some(true);
    if !ready || !h.is_running("quick_reply") {
        return;
    }
    for (conv, text, _) in std::mem::take(&mut *lock(&PENDING)) {
        h.send("premium:quick-reply", json!({ "conv": conv, "text": text }));
    }
}

impl Feature for F {
    fn key(&self) -> &'static str {
        "quick_reply"
    }
    fn channels(&self) -> &'static [(&'static str, From)] {
        &[("premium:quick_reply:status", From::Main)]
    }
    fn start(&self, _h: &Host) {
        flush();
    }
    fn on_bus(&self, _h: &Host, ev: &Bus) {
        if matches!(ev, Bus::App) {
            flush();
        }
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
