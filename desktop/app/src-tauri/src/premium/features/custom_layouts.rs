//! custom_layouts (Ultra): named widget layouts saved by the shell (`premium/custom_layouts.json`,
//! survives a cache wipe), applied through the widgets feature. Max 8.

use serde_json::{json, Value};

use crate::premium::logic::rules::{custom_layout_save, layouts_file};
use crate::premium::{arg, iso_now, now_ms, ok, Caller, Feature, From, Host};

pub struct F;

const FILE: &str = "custom_layouts";

impl Feature for F {
    fn key(&self) -> &'static str {
        "custom_layouts"
    }
    fn channels(&self) -> &'static [(&'static str, From)] {
        &[("premium:custom_layouts:list", From::Main), ("premium:custom_layouts:save", From::Main), ("premium:custom_layouts:remove", From::Main), ("premium:custom_layouts:apply", From::Main)]
    }
    fn call(&self, h: &Host, ch: &str, args: &[Value], _c: &Caller) -> Result<Value, String> {
        let all = layouts_file(h.read_json(FILE));
        let a0 = arg(args, 0);
        Ok(match ch {
            "premium:custom_layouts:list" => ok(all),
            "premium:custom_layouts:save" => match custom_layout_save(&all, &a0, &iso_now(), &format!("l{:x}", now_ms())) {
                Ok(next) => {
                    h.write_json(FILE, &next);
                    ok(next)
                }
                Err(e) => json!({ "ok": false, "error": e }),
            },
            "premium:custom_layouts:remove" => {
                let layouts: Vec<Value> = all["layouts"].as_array().cloned().unwrap_or_default().into_iter().filter(|l| l["id"] != a0).collect();
                let active = if all["active"] == a0 { Value::Null } else { all["active"].clone() };
                let next = json!({ "layouts": layouts, "active": active });
                h.write_json(FILE, &next);
                ok(next)
            }
            _ => {
                let layout = all["layouts"].as_array().and_then(|l| l.iter().find(|l| l["id"] == a0).cloned());
                let Some(layout) = layout else { return Ok(json!({ "ok": false, "error": "missing" })) };
                if !h.is_running("widgets") {
                    return Ok(json!({ "ok": false, "error": "widgets_off" }));
                }
                let mut next = all.clone();
                next["active"] = a0.clone();
                h.write_json(FILE, &next);
                let mut r = super::widgets::apply(h, layout.get("widgets"));
                r["layout"] = layout;
                r
            }
        })
    }
}
