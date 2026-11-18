//! Descall's own notification capsules (electron/notificationWindow.cjs and the
//! showAppNotification part of main.cjs): transparent, frameless, always-on-top windows at
//! the top centre of the work area, calls first, at most three, grouped by tag.
//! The capsule page (descall-shell://localhost/notif.html) renders with the Electron
//! notificationCard.cjs and talks back through `notif_action` (window.notifAPI).

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Duration;

use descall_shell::notif::{self, Entry, Rect};
use serde::Deserialize;
use serde_json::{json, Value};
use tauri::{AppHandle, LogicalPosition, Manager, Runtime, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use crate::state::{self, main_in_front, show_main, to_main};

#[derive(Deserialize, Default)]
pub struct ShowPayload {
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub options: Value,
}

struct Capsule {
    id: u64,
    label: String,
    tag: String,
    call: bool,
    height: f64,
    count: u32,
    title: String,
    body: String,
    data: Value,
    /// Visible (after the page loaded); only shown capsules take a slot in the stack.
    shown: bool,
    duration_ms: u64,
    remaining_ms: u64,
    paused: bool,
    /// Bumped on every re-arm; a timer only fires for its own generation.
    timer_gen: u64,
}

#[derive(Default)]
pub struct Notifications {
    next_id: Mutex<u64>,
    list: Mutex<Vec<Capsule>>,
    by_tag: Mutex<HashMap<String, u64>>,
}

fn str_of<'a>(v: &'a Value, k: &str) -> &'a str {
    v.get(k).and_then(Value::as_str).unwrap_or("")
}

/// Monitor work area for the stack (logical px): Descall's own visible window, else the
/// monitor under the cursor, else the primary one.
fn anchor_area<R: Runtime>(app: &AppHandle<R>) -> Rect {
    let monitor = state::main_window(app)
        .filter(|w| w.is_visible().unwrap_or(false) && !w.is_minimized().unwrap_or(false))
        .and_then(|w| w.current_monitor().ok().flatten())
        .or_else(|| app.cursor_position().ok().and_then(|p| app.monitor_from_point(p.x, p.y).ok().flatten()))
        .or_else(|| app.primary_monitor().ok().flatten());
    match monitor {
        Some(m) => {
            let s = m.scale_factor();
            let wa = m.work_area();
            Rect { x: wa.position.x as f64 / s, y: wa.position.y as f64 / s, width: wa.size.width as f64 / s, height: wa.size.height as f64 / s }
        }
        None => Rect { x: 0.0, y: 0.0, width: 1280.0, height: 720.0 },
    }
}

fn reposition_all<R: Runtime>(app: &AppHandle<R>) {
    let n = app.state::<Notifications>();
    let list = n.list.lock().unwrap();
    let entries: Vec<Entry> = list.iter().filter(|c| c.shown).map(|c| Entry { id: c.id, call: c.call, height: c.height }).collect();
    let placed = notif::stack_positions(anchor_area(app), &entries);
    for p in placed {
        if let Some(c) = list.iter().find(|c| c.id == p.entry.id) {
            if let Some(w) = app.get_webview_window(&c.label) {
                ease_to(w, p.x, p.y);
            }
        }
    }
}

/// Windows ignores animated SetWindowPos: step the window over ~120 ms (moveWindow in
/// notificationWindow.cjs). A jump across monitors is immediate.
fn ease_to<R: Runtime>(w: WebviewWindow<R>, x: f64, y: f64) {
    let scale = w.scale_factor().unwrap_or(1.0);
    let Ok(from) = w.outer_position() else { return };
    let (fx, fy) = (from.x as f64 / scale, from.y as f64 / scale);
    if (fx - x).abs() < 0.5 && (fy - y).abs() < 0.5 {
        return;
    }
    if (fx - x).abs() > 400.0 || (fy - y).abs() > 600.0 {
        let _ = w.set_position(LogicalPosition::new(x, y));
        return;
    }
    tauri::async_runtime::spawn(async move {
        const STEPS: u32 = 8;
        for i in 1..=STEPS {
            let t = i as f64 / STEPS as f64;
            let e = 1.0 - (1.0 - t).powi(3);
            let _ = w.set_position(LogicalPosition::new((fx + (x - fx) * e).round(), (fy + (y - fy) * e).round()));
            tokio::time::sleep(Duration::from_millis(15)).await;
        }
    });
}

fn arm_timer<R: Runtime>(app: &AppHandle<R>, id: u64) {
    let n = app.state::<Notifications>();
    let mut list = n.list.lock().unwrap();
    let Some(c) = list.iter_mut().find(|c| c.id == id) else { return };
    c.timer_gen += 1;
    if c.paused || !c.shown || c.remaining_ms == 0 {
        return;
    }
    let (gen, wait) = (c.timer_gen, c.remaining_ms + notif::SAFETY_GRACE_MS);
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_millis(wait)).await;
        let current = app.state::<Notifications>().list.lock().unwrap().iter().find(|c| c.id == id).map(|c| c.timer_gen);
        if current == Some(gen) {
            dismiss(&app, id, "timeout");
        }
    });
}

/// Close a capsule; `action` decides what the page hears (click / accept / decline).
fn dismiss<R: Runtime>(app: &AppHandle<R>, id: u64, action: &str) {
    let n = app.state::<Notifications>();
    let removed = {
        let mut list = n.list.lock().unwrap();
        let idx = list.iter().position(|c| c.id == id);
        idx.map(|i| list.remove(i))
    };
    let Some(c) = removed else { return };
    {
        let mut tags = n.by_tag.lock().unwrap();
        if tags.get(&c.tag) == Some(&c.id) {
            tags.remove(&c.tag);
        }
    }
    if let Some(w) = app.get_webview_window(&c.label) {
        let _ = w.destroy();
    }
    reposition_all(app);
    let data = c.data.clone();
    match action {
        "click" => {
            show_main(app);
            // "Mesaj" on "Mert çevrimiçi" opens that DM (clickData in main.cjs).
            let click_data = if str_of(&data, "type") == "friend-online" && !str_of(&data, "userId").is_empty() {
                json!({ "type": "dm", "conversationId": data["userId"], "fromId": data["userId"], "from": str_of(&data, "username") })
            } else {
                data
            };
            to_main(app, "notification:click", json!({ "title": c.title, "body": c.body, "tag": c.tag, "data": click_data }));
        }
        "accept" => {
            show_main(app);
            to_main(app, "notification:call-accept", data);
        }
        "decline" => to_main(app, "notification:call-decline", data),
        _ => {}
    }
}

fn reveal<R: Runtime>(app: &AppHandle<R>, id: u64) {
    let label = {
        let n = app.state::<Notifications>();
        let mut list = n.list.lock().unwrap();
        let Some(c) = list.iter_mut().find(|c| c.id == id) else { return };
        if c.shown {
            return;
        }
        c.shown = true;
        c.label.clone()
    };
    if let Some(w) = app.get_webview_window(&label) {
        let _ = w.show();
        let _ = w.set_always_on_top(true);
    }
    reposition_all(app);
    arm_timer(app, id);
}

/// One capsule. Returns its id, or None when nothing was shown.
pub fn show_capsule<R: Runtime>(app: &AppHandle<R>, title: &str, options: &Value) -> Option<u64> {
    let data = options.get("data").cloned().unwrap_or(Value::Object(Default::default()));
    let data_type = str_of(&data, "type").to_string();
    let tag = options.get("tag").and_then(Value::as_str).unwrap_or("descall").to_string();
    let body = str_of(options, "body").to_string();
    let require_interaction = options.get("requireInteraction").and_then(Value::as_bool).unwrap_or(false);
    let avatar_url = options.get("avatarUrl").and_then(Value::as_str).map(str::to_string);
    let call = notif::is_call(&data_type);

    // Descall in front: the in-app UI already shows this.
    if main_in_front(app) && (call || !require_interaction) {
        return None;
    }
    // Descall+ profiles: "toast" style uses the OS notification instead of a capsule.
    if options.get("style").and_then(Value::as_str) == Some("toast") && !call {
        use tauri_plugin_notification::NotificationExt;
        let from = str_of(&data, "from");
        let preview = str_of(&data, "preview");
        let shown = app
            .notification()
            .builder()
            .title(if from.is_empty() { title } else { from }.chars().take(120).collect::<String>())
            .body(if preview.is_empty() { body.as_str() } else { preview }.chars().take(300).collect::<String>())
            .show()
            .is_ok();
        if shown {
            return None;
        }
    }

    let n = app.state::<Notifications>();
    // Grouping: another message for the same chat updates the visible capsule.
    let existing = n.by_tag.lock().unwrap().get(&tag).copied();
    if let Some(eid) = existing {
        if !call {
            let label = {
                let mut list = n.list.lock().unwrap();
                list.iter_mut().find(|c| c.id == eid).map(|c| {
                    c.count += 1;
                    c.data = data.clone();
                    c.title = title.to_string();
                    c.body = body.clone();
                    c.remaining_ms = c.duration_ms;
                    (c.label.clone(), c.count)
                })
            };
            if let Some((label, count)) = label {
                use tauri::Emitter;
                let _ = app.emit_to(label.as_str(), "notif:update", json!({ "title": title, "body": body, "data": data, "avatarUrl": avatar_url, "count": count }));
                arm_timer(app, eid);
                return Some(eid);
            }
        }
        dismiss(app, eid, "external");
    }

    // No wall of toasts.
    let visible: Vec<Entry> = n.list.lock().unwrap().iter().map(|c| Entry { id: c.id, call: c.call, height: c.height }).collect();
    for old in notif::evictions(&visible, notif::MAX_VISIBLE) {
        dismiss(app, old.id, "external");
    }

    let kind = notif::kind_of(&data_type);
    let height = notif::card_height(call, kind);
    let area = anchor_area(app);
    let width = notif::capsule_width(area.width);
    let id = {
        let mut next = n.next_id.lock().unwrap();
        *next += 1;
        *next
    };
    let label = format!("notif-{id}");
    let duration_ms = if call || require_interaction { 0 } else { notif::DEFAULT_DURATION_MS };
    const APP_KINDS: [&str; 2] = ["friend-online", "announcement"];
    let app_icon = avatar_url.is_none() && (data_type.is_empty() || APP_KINDS.contains(&data_type.as_str()));
    let from = data.get("from").or_else(|| data.get("username")).cloned().unwrap_or(Value::Null);
    let input = json!({
        "locale": state::locale(app),
        "title": title,
        "body": body,
        "data": data,
        "type": if call { "call" } else if tag.starts_with("mention") { "mention" } else { "default" },
        "avatarUrl": avatar_url,
        "appIcon": app_icon,
        "from": from,
        "duration": duration_ms,
        "count": 1,
    });
    // Planned slot for the first frame; reposition_all settles it once shown.
    let mut entries = visible.clone();
    entries.push(Entry { id, call, height });
    let slot = notif::stack_positions(area, &entries).into_iter().find(|p| p.entry.id == id);
    let (x, y) = slot.map(|p| (p.x, p.y)).unwrap_or((area.x, area.y));

    n.list.lock().unwrap().push(Capsule {
        id,
        label: label.clone(),
        tag: tag.clone(),
        call,
        height,
        count: 1,
        title: title.to_string(),
        body: body.clone(),
        data: input["data"].clone(),
        shown: false,
        duration_ms,
        remaining_ms: duration_ms,
        paused: false,
        timer_gen: 0,
    });
    n.by_tag.lock().unwrap().insert(tag, id);

    let app_load = app.clone();
    let built = WebviewWindowBuilder::new(app, &label, WebviewUrl::CustomProtocol(crate::shell_url("notif.html")))
        .title("Descall")
        .inner_size(width + notif::SHADOW_PAD * 2.0, height + notif::SHADOW_PAD * 2.0)
        .position(x, y)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible_on_all_workspaces(true)
        .focused(call)
        .focusable(call)
        .visible(false)
        .use_https_scheme(true)
        .additional_browser_args(crate::BROWSER_ARGS)
        .initialization_script(format!("window.__DESCALL_NOTIF__ = {};", input))
        .on_page_load(move |_w, p| {
            if matches!(p.event(), tauri::webview::PageLoadEvent::Finished) {
                reveal(&app_load, id);
            }
        })
        .build();
    if built.is_err() {
        dismiss(app, id, "external");
        return None;
    }
    // ready-to-show fallback (notificationWindow.cjs revealFallback).
    let app2 = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_millis(1500)).await;
        reveal(&app2, id);
    });
    Some(id)
}

/// electronAPI.showNotification(title, options) -> notification:show.
#[tauri::command]
pub fn notification_show<R: Runtime>(app: AppHandle<R>, window: WebviewWindow<R>, payload: ShowPayload) {
    // Descall+ pop-outs and admin windows never notify; the main window does.
    if window.label() != state::MAIN {
        return;
    }
    let _ = show_capsule(&app, &payload.title, &payload.options);
}

/// electronAPI.closeNotification({ tag } | { tags }): incoming-call capsules close when the
/// ring ends (accept, decline, cancel, miss, answered elsewhere).
#[tauri::command]
pub fn notification_close<R: Runtime>(app: AppHandle<R>, payload: Value) {
    let tags: Vec<String> = match payload.get("tags").and_then(Value::as_array) {
        Some(a) => a.iter().filter_map(|t| t.as_str().map(str::to_string)).collect(),
        None => payload.get("tag").and_then(Value::as_str).map(|t| vec![t.to_string()]).unwrap_or_default(),
    };
    for tag in tags {
        let id = app.state::<Notifications>().by_tag.lock().unwrap().get(&tag).copied();
        if let Some(id) = id {
            dismiss(&app, id, "external");
        }
    }
}

/// window.notifAPI.* from a capsule page (notifPreload.cjs channels notif:*).
#[tauri::command]
pub fn notif_action<R: Runtime>(app: AppHandle<R>, window: WebviewWindow<R>, action: String, remaining: Option<f64>) {
    let label = window.label().to_string();
    let id = app.state::<Notifications>().list.lock().unwrap().iter().find(|c| c.label == label).map(|c| c.id);
    let Some(id) = id else { return };
    match action.as_str() {
        "click" | "close" | "accept" | "decline" => dismiss(&app, id, &action),
        "pause" => {
            let n = app.state::<Notifications>();
            if let Some(c) = n.list.lock().unwrap().iter_mut().find(|c| c.id == id) {
                c.paused = true;
                c.timer_gen += 1;
            }
        }
        "resume" => {
            {
                let n = app.state::<Notifications>();
                if let Some(c) = n.list.lock().unwrap().iter_mut().find(|c| c.id == id) {
                    c.paused = false;
                    if let Some(ms) = remaining.filter(|m| m.is_finite()) {
                        c.remaining_ms = ms.max(0.0) as u64;
                    }
                }
            }
            arm_timer(&app, id);
        }
        _ => {}
    }
}
