//! window_layouts (Ultra): save the arrangement (main window, call window, sidebar, pop-outs)
//! under a name and put it back later. Each window keeps its monitor; when that monitor is
//! gone the position maps proportionally onto the primary one. Applying opens missing windows
//! and moves open ones; it never closes anything. Max 12 layouts.

use serde_json::{json, Value};
use tauri::{Manager, WebviewWindow};

use crate::premium::logic::geom::{self, Rect};
use crate::premium::logic::rules::{cut, s, WINDOW_LAYOUTS_MAX};
use crate::premium::{arg, fail, iso_now, now_ms, ok, wins, Bus, Caller, Feature, From, Host};

pub struct F;

fn layouts(h: &Host) -> Vec<Value> {
    h.store().get("layouts").and_then(|v| v.as_array().cloned()).unwrap_or_default()
}

fn describe(h: &Host, w: &WebviewWindow) -> Option<Value> {
    let b = wins::bounds(w)?;
    let d = wins::display_for(h, b).map(|(db, _)| json!({ "id": format!("{},{}", db.x, db.y), "bounds": db.to_json() }));
    Some(json!({ "bounds": b.to_json(), "display": d, "maximized": w.is_maximized().unwrap_or(false) }))
}

fn capture(h: &Host, name: &str) -> Value {
    let main = h.app.get_webview_window("main").and_then(|w| describe(h, &w));
    let windows: Vec<Value> = wins::list(h, None)
        .into_iter()
        .filter(|(_, e)| matches!(e.kind.as_str(), "call" | "sidebar" | "popout"))
        .filter_map(|(l, e)| {
            let mut d = describe(h, &h.app.get_webview_window(&l)?)?;
            d["kind"] = json!(e.kind);
            d["route"] = e.meta.get("route").cloned().unwrap_or(Value::Null);
            Some(d)
        })
        .collect();
    let name = cut(name.trim(), 40);
    json!({
        "id": format!("l{:x}{:04x}", now_ms(), h.next_id() & 0xffff),
        "name": if name.is_empty() { "Layout".to_string() } else { name },
        "createdAt": iso_now(),
        "main": main,
        "windows": windows,
    })
}

/// Saved bounds -> bounds on today's monitors.
fn place(h: &Host, entry: &Value) -> Option<Rect> {
    let b = Rect::from_json(entry.get("bounds")?)?;
    let saved = entry.get("display").and_then(|d| d.get("bounds")).and_then(Rect::from_json);
    let (list, i) = wins::displays(h);
    let same = saved.filter(|s| list.iter().any(|(db, _)| db == s));
    let mapped = if same.is_some() { b } else { geom::map_between_displays(b, saved, list.get(i).map(|d| d.0)) };
    wins::fit(h, mapped)
}

fn apply(h: &Host, layout: &Value) {
    if let (Some(w), Some(m)) = (h.app.get_webview_window("main"), layout.get("main").filter(|m| !m.is_null())) {
        if let Some(b) = place(h, m) {
            let _ = w.unmaximize();
            wins::set_bounds(&w, b);
            if m.get("maximized").and_then(Value::as_bool) == Some(true) {
                let _ = w.maximize();
            }
        }
    }
    for e in layout.get("windows").and_then(Value::as_array).cloned().unwrap_or_default() {
        let Some(b) = place(h, &e) else { continue };
        let kind = s(&e, "kind");
        if kind == "popout" {
            let route = s(&e, "route");
            match wins::list(h, Some("popout")).into_iter().find(|(_, x)| x.meta.get("route").and_then(Value::as_str) == Some(route.as_str())) {
                Some((l, _)) => {
                    if let Some(w) = h.app.get_webview_window(&l) {
                        wins::set_bounds(&w, b);
                    }
                }
                None => h.bus(Bus::PopoutOpen { route, bounds: Some(b) }),
            }
            continue;
        }
        if !geom::PORTAL_KINDS.contains(&kind.as_str()) {
            continue;
        }
        h.store_set(&geom::bounds_key(&kind, None), b.to_json());
        match h.app.get_webview_window(wins::portal_label(&kind)) {
            Some(w) => wins::set_bounds(&w, b),
            None => {
                h.send("premium:open", json!({ "kind": kind }));
            }
        }
    }
}

impl Feature for F {
    fn key(&self) -> &'static str {
        "window_layouts"
    }
    fn channels(&self) -> &'static [(&'static str, From)] {
        &[("premium:layouts:list", From::App), ("premium:layouts:save", From::Main), ("premium:layouts:apply", From::Main), ("premium:layouts:delete", From::Main)]
    }
    fn call(&self, h: &Host, ch: &str, args: &[Value], _c: &Caller) -> Result<Value, String> {
        let id = arg(args, 0);
        Ok(match ch {
            "premium:layouts:list" => ok(json!({ "layouts": layouts(h).iter().map(|l| json!({
                "id": l["id"], "name": l["name"], "createdAt": l["createdAt"],
                "windows": l.get("windows").and_then(Value::as_array).map(|a| a.len()).unwrap_or(0) + usize::from(l.get("main").is_some_and(|m| !m.is_null())),
            })).collect::<Vec<_>>() })),
            "premium:layouts:save" => {
                let mut list = layouts(h);
                if list.len() >= WINDOW_LAYOUTS_MAX {
                    return Ok(json!({ "ok": false, "error": "limit", "max": WINDOW_LAYOUTS_MAX }));
                }
                let l = capture(h, id.as_str().unwrap_or(""));
                let new_id = l["id"].clone();
                list.push(l);
                h.store_set("layouts", json!(list));
                ok(json!({ "id": new_id }))
            }
            "premium:layouts:apply" => match layouts(h).into_iter().find(|l| l["id"] == id) {
                Some(l) => {
                    apply(h, &l);
                    ok(json!({}))
                }
                None => fail("not-found"),
            },
            _ => {
                let rest: Vec<Value> = layouts(h).into_iter().filter(|l| l["id"] != id).collect();
                h.store_set("layouts", json!(rest));
                ok(json!({}))
            }
        })
    }
}
