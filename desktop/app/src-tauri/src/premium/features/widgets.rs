//! widgets (Ultra): small frameless always-on-top desktop widgets (online friends, active
//! calls, notifications). The renderer's Widget Studio places them; dragging a widget by its
//! title reports the new position back (premium:widgets:moved) so the layout can be saved.
//! At most 4. Positions are in DIPs on the renderer side, physical pixels here.

use std::collections::HashMap;
use std::sync::Mutex;

use serde_json::{json, Value};

use super::Gen;
use crate::premium::logic::geom::Rect;
use crate::premium::logic::rules::{norm_widgets, s, WIDGET_KINDS};
use crate::premium::overlay::{self, OpenOpts};
use crate::premium::{arg, lock, ok, wins, Bus, Caller, Feature, From, Host};

#[derive(Default)]
pub struct F {
    moved: Gen,
    moved_label: Mutex<Option<String>>,
}

// The last state per widget kind (also used when custom_layouts applies a layout).
static WIDGET_STATE: Mutex<Option<HashMap<String, Value>>> = Mutex::new(None);

fn state_for(kind: &str) -> Option<Value> {
    lock(&WIDGET_STATE).as_ref().and_then(|m| m.get(kind).cloned())
}

/// Open / move / close widget windows to match the list. Used by custom_layouts too.
pub(crate) fn apply(h: &Host, widgets: Option<&Value>) -> Value {
    let list = norm_widgets(widgets);
    let keep: Vec<String> = list.iter().map(|w| format!("widget:{}", s(w, "id"))).collect();
    overlay::close_where(h, |o| o.id.starts_with("widget:") && !keep.contains(&o.id));
    let sc = wins::scale(h);
    let px = |v: &Value| (v.as_f64().unwrap_or(0.0) * sc).round() as i32;
    for w in &list {
        let kind = s(w, "kind");
        overlay::open(h, OpenOpts {
            id: &format!("widget:{}", s(w, "id")),
            kind: "widget",
            owner: "widgets",
            bounds: Rect::new(px(&w["x"]), px(&w["y"]), px(&w["width"]), px(&w["height"])),
            click_through: false,
            opacity: w["opacity"].as_f64().unwrap_or(0.95),
            focusable: false,
            state: state_for(&kind),
            widget_kind: Some(kind),
        });
    }
    ok(json!({ "open": list.iter().map(|w| w["id"].clone()).collect::<Vec<_>>() }))
}

fn close_all(h: &Host) -> Value {
    overlay::close_where(h, |o| o.id.starts_with("widget:"));
    ok(json!({}))
}

/// A widget page action ('moved' comes from the bus, debounced).
pub(crate) fn on_action(h: &Host, id: &str, kind: &str, payload: &Value) {
    if kind != "moved" {
        return;
    }
    let sc = wins::scale(h).max(0.1);
    let Some(b) = Rect::from_json(payload) else { return };
    let dip = |v: i32| (v as f64 / sc).round();
    h.send("premium:widgets:moved", json!({ "id": id.trim_start_matches("widget:"), "x": dip(b.x), "y": dip(b.y), "width": dip(b.width), "height": dip(b.height) }));
}

impl Feature for F {
    fn key(&self) -> &'static str {
        "widgets"
    }
    fn channels(&self) -> &'static [(&'static str, From)] {
        &[("premium:widgets:apply", From::Main), ("premium:widgets:state", From::Main), ("premium:widgets:close-all", From::Main), ("premium:widgets:status", From::Main)]
    }
    fn stop(&self, h: &Host) {
        close_all(h);
        *lock(&WIDGET_STATE) = None;
    }
    fn call(&self, h: &Host, ch: &str, args: &[Value], _c: &Caller) -> Result<Value, String> {
        Ok(match ch {
            "premium:widgets:apply" => apply(h, args.first()),
            "premium:widgets:state" => {
                let kind = arg(args, 0);
                let Some(kind) = kind.as_str().filter(|k| WIDGET_KINDS.contains(k)) else { return Ok(json!({ "ok": false })) };
                let state = Some(arg(args, 1)).filter(|v| !v.is_null()).unwrap_or(json!({}));
                lock(&WIDGET_STATE).get_or_insert_with(HashMap::new).insert(kind.into(), state.clone());
                for o in overlay::list(h) {
                    if o.widget_kind.as_deref() == Some(kind) {
                        overlay::send(h, &o.id, state.clone());
                    }
                }
                ok(json!({}))
            }
            "premium:widgets:close-all" => close_all(h),
            _ => ok(json!({ "open": overlay::list(h).into_iter().filter(|o| o.id.starts_with("widget:")).map(|o| json!({
                "id": o.id.trim_start_matches("widget:"), "kind": o.widget_kind, "bounds": overlay::window_bounds(h, &o.id).map(Rect::to_json),
            })).collect::<Vec<_>>() })),
        })
    }
    fn on_bus(&self, h: &Host, ev: &Bus) {
        match ev {
            Bus::Moved(l) if l.starts_with("widget-") => {
                *lock(&self.moved_label) = Some(l.clone());
                let g = self.moved.bump();
                h.tick("widgets", "moved", g, 250);
            }
            Bus::Tick { key: "widgets", tag: "moved", gen } if self.moved.is(*gen) => {
                if let Some(l) = lock(&self.moved_label).take() {
                    overlay::on_moved(h, &l);
                }
            }
            _ => {}
        }
    }
}
