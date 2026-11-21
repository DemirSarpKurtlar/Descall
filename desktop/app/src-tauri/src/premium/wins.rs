//! Descall+ windows (port of the Electron half of windowKit.cjs): the registry of tracked
//! windows, portal windows (call, sidebar) the main renderer draws into, monitor work areas,
//! always-on-top / opacity behaviour and remembered bounds.

use serde_json::{json, Value};
use tauri::webview::{NewWindowFeatures, NewWindowResponse};
use tauri::{Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindow, WebviewWindowBuilder, Wry};

use super::logic::geom::{self, Rect};
use super::{lock, platform, AuxEntry, Bus, Host};

// ---- monitors -------------------------------------------------------------------------------------

/// (monitor bounds, work area) of every display, and the primary's index.
pub fn displays(h: &Host) -> (Vec<(Rect, Rect)>, usize) {
    let list: Vec<(Rect, Rect)> = h
        .app
        .available_monitors()
        .unwrap_or_default()
        .iter()
        .map(|m| {
            let (p, s, wa) = (m.position(), m.size(), m.work_area());
            (Rect::new(p.x, p.y, s.width as i32, s.height as i32), Rect::new(wa.position.x, wa.position.y, wa.size.width as i32, wa.size.height as i32))
        })
        .collect();
    let primary = h.app.primary_monitor().ok().flatten().map(|m| (m.position().x, m.position().y));
    let idx = primary.and_then(|(x, y)| list.iter().position(|(b, _)| b.x == x && b.y == y)).unwrap_or(0);
    (list, idx)
}

pub fn primary_area(h: &Host) -> Rect {
    let (list, i) = displays(h);
    list.get(i).map(|d| d.1).unwrap_or(Rect::new(0, 0, 1280, 720))
}

pub fn fit(h: &Host, b: Rect) -> Option<Rect> {
    let (list, i) = displays(h);
    let areas: Vec<Rect> = list.iter().map(|d| d.1).collect();
    geom::fit_to_work_areas(b, &areas, areas.get(i).copied())
}

/// (display bounds, work area) the rectangle is on.
pub fn display_for(h: &Host, b: Rect) -> Option<(Rect, Rect)> {
    let (list, i) = displays(h);
    geom::area_matching(b, &list, i)
}

pub fn display_at(h: &Host, x: i32, y: i32) -> Option<(Rect, Rect)> {
    let (list, i) = displays(h);
    list.iter().find(|(b, _)| b.contains(x, y)).copied().or_else(|| list.get(i).copied())
}

pub fn scale(h: &Host) -> f64 {
    h.app.primary_monitor().ok().flatten().map(|m| m.scale_factor()).unwrap_or(1.0)
}

// ---- window helpers ---------------------------------------------------------------------------------

pub fn bounds(w: &WebviewWindow) -> Option<Rect> {
    let p = w.outer_position().ok()?;
    let s = w.outer_size().ok()?;
    Some(Rect::new(p.x, p.y, s.width as i32, s.height as i32))
}

pub fn set_bounds(w: &WebviewWindow, b: Rect) {
    let _ = w.set_position(PhysicalPosition::new(b.x, b.y));
    let _ = w.set_size(PhysicalSize::new(b.width.max(1) as u32, b.height.max(1) as u32));
}

pub fn hwnd(w: &WebviewWindow) -> Option<isize> {
    #[cfg(windows)]
    {
        w.hwnd().ok().map(|h| h.0 as isize)
    }
    #[cfg(not(windows))]
    {
        let _ = w;
        None
    }
}

/// tao rewrites GWL_EXSTYLE from its own flags whenever it applies a style change on the main
/// thread (show, always-on-top, click-through, minimize / restore), which drops the
/// WS_EX_LAYERED bit set here: the opacity was lost as soon as a window was shown or pinned.
/// Queued on the main thread, it runs after the changes tao has queued before it.
pub fn set_opacity(w: &WebviewWindow, alpha: f64) {
    if let Some(hw) = hwnd(w) {
        let _ = w.run_on_main_thread(move || platform::set_opacity(hw, alpha));
    }
}

/// Track a Descall+ window; `_feature` names the owner (logs, readability).
pub fn track(h: &Host, label: &str, kind: &str, _feature: &str, meta: Value) {
    lock(&h.windows).insert(label.to_string(), AuxEntry { kind: kind.into(), meta });
    h.bus(Bus::WindowOpened { label: label.into(), kind: kind.into() });
}

/// Tracked windows of a kind (or all), as (label, entry), still open.
pub fn list(h: &Host, kind: Option<&str>) -> Vec<(String, AuxEntry)> {
    lock(&h.windows)
        .iter()
        .filter(|(l, e)| kind.is_none_or(|k| e.kind == k) && h.app.get_webview_window(l).is_some())
        .map(|(l, e)| (l.clone(), e.clone()))
        .collect()
}

pub fn kind_of(h: &Host, label: &str) -> Option<String> {
    if label == "main" {
        return Some("main".into());
    }
    lock(&h.windows).get(label).map(|e| e.kind.clone())
}

pub fn close_kind(h: &Host, kind: &str) {
    for (label, _) in list(h, Some(kind)) {
        if let Some(w) = h.app.get_webview_window(&label) {
            let _ = w.close();
        }
    }
}

// ---- behaviour (always_on_top, window_opacity) ---------------------------------------------------------

pub fn on_top_for(h: &Host, kind: &str) -> bool {
    if h.has("always_on_top") && h.setting_bool("features.always_on_top.enabled", true) {
        if let Some(Value::Bool(b)) = h.store().get(&format!("features.always_on_top.{kind}")) {
            return b;
        }
    }
    geom::default_on_top(kind)
}

pub fn opacity_for(h: &Host, kind: &str) -> f64 {
    if !h.has("window_opacity") || kind == "main" || !h.setting_bool("features.window_opacity.enabled", true) {
        return 1.0;
    }
    let v = h.store().get(&format!("features.window_opacity.{kind}")).and_then(|v| v.as_f64()).or(Some(1.0));
    geom::clamp_opacity(kind, v)
}

pub fn apply_behaviour(h: &Host, label: &str, kind: &str) {
    let Some(w) = h.app.get_webview_window(label) else { return };
    let _ = w.set_always_on_top(on_top_for(h, kind));
    set_opacity(&w, opacity_for(h, kind));
}

/// Main window plus every tracked app window, as (label, kind).
pub fn all(h: &Host) -> Vec<(String, String)> {
    let mut out = Vec::new();
    if h.app.get_webview_window("main").is_some() {
        out.push(("main".to_string(), "main".to_string()));
    }
    for (l, e) in list(h, None) {
        if matches!(e.kind.as_str(), "call" | "sidebar" | "popout") {
            out.push((l, e.kind));
        }
    }
    out
}

pub fn apply_all(h: &Host) {
    for (label, kind) in all(h) {
        apply_behaviour(h, &label, &kind);
    }
}

// ---- portal windows -----------------------------------------------------------------------------------

/// Label of a portal kind.
pub fn portal_label(kind: &str) -> &'static str {
    if kind == "call" {
        "pip"
    } else {
        "sidebar"
    }
}

fn portal_feature(kind: &str) -> &'static str {
    if kind == "call" {
        "pip_call"
    } else {
        "desktop_sidebar"
    }
}

pub fn saved_bounds(h: &Host, kind: &str, route: Option<&str>) -> Option<Rect> {
    let b = h.store().get(&geom::bounds_key(kind, route))?;
    fit(h, Rect::from_json(&b)?)
}

pub fn sidebar_edge(h: &Host) -> String {
    if h.store().get("features.desktop_sidebar.edge").and_then(|v| v.as_str().map(str::to_string)).as_deref() == Some("left") {
        "left".into()
    } else {
        "right".into()
    }
}

/// on_new_window: "about:blank#descall-premium-<kind>" from premium-shim.js.
pub fn portal_open(h: &Host, url: &tauri::Url, features: NewWindowFeatures) -> Option<NewWindowResponse<Wry>> {
    if url.scheme() != "about" || url.path() != "blank" {
        return None;
    }
    let kind = geom::kind_for_frame(url.fragment()?)?;
    if !h.is_running(portal_feature(kind)) {
        return Some(NewWindowResponse::Deny);
    }
    let label = portal_label(kind);
    if let Some(old) = h.app.get_webview_window(label) {
        let _ = old.destroy();
    }
    let size = geom::size_for(kind);
    let sc = scale(h);
    let mut b = saved_bounds(h, kind, None).unwrap_or_else(|| geom::default_bounds(kind, primary_area(h), &sidebar_edge(h), sc));
    if kind == "sidebar" {
        let area = h.app.get_webview_window("main").and_then(|m| bounds(&m)).and_then(|mb| display_for(h, mb)).map(|d| d.1).unwrap_or_else(|| primary_area(h));
        b = geom::docked_bounds(area, &sidebar_edge(h), (300.0 * sc).round() as i32);
    }
    let title = h.et(if kind == "call" { "window.call" } else { "window.sidebar" }, &[]);
    let built = WebviewWindowBuilder::new(&h.app, label, WebviewUrl::External("about:blank".parse().ok()?))
        .window_features(features)
        .title(title)
        .decorations(false)
        .resizable(size.resizable)
        .min_inner_size(size.min_width as f64, size.min_height as f64)
        .maximizable(false)
        .minimizable(kind == "call")
        .skip_taskbar(kind != "call")
        .always_on_top(on_top_for(h, kind))
        .visible_on_all_workspaces(kind != "call")
        .background_color(tauri::window::Color(0x14, 0x15, 0x1e, 0xff))
        // The portal document inherits the main window's origin (https://tauri.localhost), and
        // the requests it makes (fonts, app images) go through THIS webview's protocol filter.
        // Without https here the filter is http://tauri.localhost/* and none of them load.
        .use_https_scheme(true)
        .on_navigation(|u| u.scheme() == "about")
        .build();
    let w = match built {
        Ok(w) => w,
        Err(e) => {
            log::warn!("[premium] portal {kind} failed: {e}");
            return Some(NewWindowResponse::Deny);
        }
    };
    set_bounds(&w, b);
    set_opacity(&w, opacity_for(h, kind));
    // No browser menu / accelerator keys (Reload would empty the portal), as in the main window.
    crate::webview::install_browser_guards(&w);
    track(h, label, kind, portal_feature(kind), json!({}));
    Some(NewWindowResponse::Create { window: w })
}

/// The main renderer draws portal windows: when it reloads they are orphaned.
pub fn close_portals(h: &Host) {
    for kind in geom::PORTAL_KINDS {
        close_kind(h, kind);
    }
}

// ---- bus: remembered bounds --------------------------------------------------------------------------

pub fn on_bus(h: &Host, ev: &Bus) {
    let label = match ev {
        Bus::Moved(l) | Bus::Resized(l) => l,
        _ => return,
    };
    let Some(entry) = lock(&h.windows).get(label).cloned() else { return };
    // Restored from the taskbar (or resized): tao rewrote the window style, opacity again.
    if matches!(ev, Bus::Resized(_)) && matches!(entry.kind.as_str(), "call" | "sidebar" | "popout") {
        if let Some(w) = h.app.get_webview_window(label) {
            set_opacity(&w, opacity_for(h, &entry.kind));
        }
    }
    if !matches!(entry.kind.as_str(), "call" | "popout") {
        return;
    }
    let Some(w) = h.app.get_webview_window(label) else { return };
    if w.is_minimized().unwrap_or(false) || w.is_maximized().unwrap_or(false) {
        return;
    }
    if let Some(b) = bounds(&w) {
        let route = entry.meta.get("route").and_then(Value::as_str).map(str::to_string);
        h.store_set(&geom::bounds_key(&entry.kind, route.as_deref()), b.to_json());
    }
}
