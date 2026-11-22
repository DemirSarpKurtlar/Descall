//! multi_window (Plus): pop a DM, group or server channel out into its own window: the same app
//! on a route (`/direct/<name>?popout=1`), with the same electronAPI shim. The same route is
//! focused instead of opened twice; at most 4 pop-outs. A call cannot move to another renderer,
//! so "pop out the call" is the pip_call window.

use serde_json::{json, Value};
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::premium::logic::geom::Rect;
use crate::premium::logic::rules::{valid_route, POPOUT_MAX};
use crate::premium::{arg, ok, wins, Bus, Caller, Feature, From, Host};

const SHIM: &str = include_str!("../../../../shim/electron-api-shim.js");
const NATIVE_SHARE: &str = include_str!("../../../../shim/native-screen-share.js");

pub struct F;

/// Init script of a Descall app window opened by Descall+: the shell's boot script for that
/// label (or a minimal one), the electronAPI shim and the native screen-share lane.
pub(crate) fn app_window_script(h: &Host, label: &str, token: &str) -> String {
    let boot = h.boot_script_for(label).unwrap_or_else(|| {
        let boot = json!({ "version": h.app.package_info().version.to_string(), "platform": "win32", "token": if token.is_empty() { Value::Null } else { json!(token) }, "reducedTransparency": false });
        format!("window.__DESCALL_BOOT__ = {boot};")
    });
    format!("{boot}\n{SHIM}\n{NATIVE_SHARE}")
}

/// URL of a route on the app origin (the main window's origin).
pub(crate) fn app_url(h: &Host, route: &str) -> Option<tauri::Url> {
    let main = h.app.get_webview_window("main")?.url().ok()?;
    main.join(route).ok()
}

fn popouts(h: &Host) -> Vec<(String, crate::premium::AuxEntry)> {
    wins::list(h, Some("popout"))
}

fn open(h: &Host, route: &Value, bounds: Option<Rect>) -> Value {
    let Some(r) = route.as_str().and_then(valid_route) else { return json!({ "ok": false, "error": "bad-route" }) };
    if let Some((label, _)) = popouts(h).into_iter().find(|(_, e)| e.meta.get("route").and_then(Value::as_str) == Some(r.as_str())) {
        if let Some(w) = h.app.get_webview_window(&label) {
            let _ = w.unminimize();
            wins::show(h, &w, "popout");
            let _ = w.set_focus();
        }
        return ok(json!({ "reused": true }));
    }
    if popouts(h).len() >= POPOUT_MAX {
        return json!({ "ok": false, "error": "limit", "max": POPOUT_MAX });
    }
    let Some(url) = app_url(h, &format!("{r}?popout=1")) else { return json!({ "ok": false, "error": "no-main" }) };
    let n = popouts(h).len() as i32 + 1;
    let b = bounds.and_then(|b| wins::fit(h, b)).or_else(|| wins::saved_bounds(h, "popout", Some(&r))).or_else(|| {
        let m = h.app.get_webview_window("main").and_then(|m| wins::bounds(&m))?;
        let sc = wins::scale(h);
        wins::fit(h, Rect::new(m.x + (40.0 * sc) as i32 * n, m.y + (40.0 * sc) as i32 * n, (860.0 * sc) as i32, (680.0 * sc) as i32))
    });
    let label = format!("popout-{}", h.next_id());
    let origin = url.origin();
    let script = app_window_script(h, &label, &h.renderer_token());
    let built = WebviewWindowBuilder::new(&h.app, &label, WebviewUrl::External(url))
        .devtools(crate::webview::devtools_allowed(&h.app)) // support opt-in only (webview.rs)
        .title("Descall")
        .decorations(false)
        .min_inner_size(420.0, 360.0)
        .inner_size(860.0, 680.0)
        .visible(false)
        .always_on_top(wins::on_top_for(h, "popout"))
        .use_https_scheme(true)
        // Same WebView2 browser arguments as the main window (shared user data folder; other
        // arguments make the WebView2 environment fail with ERROR_INVALID_STATE).
        .additional_browser_args(crate::BROWSER_ARGS)
        .disable_drag_drop_handler() // HTML5 file drops into chats, as in the main window
        .general_autofill_enabled(false) // no browser autofill dropdown, as in Electron
        .initialization_script(&script)
        .on_navigation(move |u| u.origin() == origin)
        .on_new_window(|u, _| {
            if u.scheme() == "https" {
                if let Some(h) = crate::premium::host() {
                    use tauri_plugin_opener::OpenerExt;
                    let _ = h.app.opener().open_url(u.as_str(), None::<&str>);
                }
            }
            tauri::webview::NewWindowResponse::Deny
        })
        .build();
    let w = match built {
        Ok(w) => w,
        Err(e) => {
            log::warn!("[premium] pop-out failed: {e}");
            return json!({ "ok": false, "error": "failed" });
        }
    };
    if let Some(b) = b {
        wins::set_bounds(&w, b);
    }
    // No browser menu / shortcuts, media without prompts: as in the main window.
    crate::webview::install_permission_handler(&w);
    crate::webview::install_browser_guards(&w);
    wins::track(h, &label, "popout", "multi_window", json!({ "route": r }));
    wins::apply_behaviour(h, &label, "popout");
    wins::show(h, &w, "popout");
    ok(json!({}))
}

impl Feature for F {
    fn key(&self) -> &'static str {
        "multi_window"
    }
    fn channels(&self) -> &'static [(&'static str, From)] {
        &[("premium:popout:open", From::App), ("premium:popout:list", From::App), ("premium:popout:close-all", From::Main)]
    }
    fn stop(&self, h: &Host) {
        wins::close_kind(h, "popout");
    }
    fn call(&self, h: &Host, ch: &str, args: &[Value], _c: &Caller) -> Result<Value, String> {
        Ok(match ch {
            "premium:popout:open" => open(h, &arg(args, 0), None),
            "premium:popout:list" => ok(json!({ "max": POPOUT_MAX, "windows": popouts(h).iter().map(|(_, e)| json!({ "route": e.meta["route"] })).collect::<Vec<_>>() })),
            _ => {
                wins::close_kind(h, "popout");
                ok(json!({}))
            }
        })
    }
    fn on_bus(&self, h: &Host, ev: &Bus) {
        match ev {
            Bus::PopoutOpen { route, bounds } => {
                open(h, &json!(route), *bounds);
            }
            // The page's title bar shows maximise state (Electron 'window:maximized').
            Bus::Resized(label) if label.starts_with("popout-") => {
                if let Some(w) = h.app.get_webview_window(label) {
                    let _ = w.emit_to(label.as_str(), "window:maximized", w.is_maximized().unwrap_or(false));
                }
            }
            _ => {}
        }
    }
}
