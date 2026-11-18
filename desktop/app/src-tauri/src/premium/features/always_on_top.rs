//! always_on_top (Plus): per-window "keep on top" for the main window, the call window, the
//! sidebar and pop-outs (features.always_on_top.<kind>). Without it the defaults apply.

use serde_json::{json, Value};

use crate::premium::{arg, fail, ok, wins, Bus, Caller, Feature, From, Host};

const KINDS: &[&str] = &["main", "call", "sidebar", "popout"];

pub struct F;

impl Feature for F {
    fn key(&self) -> &'static str {
        "always_on_top"
    }
    fn channels(&self) -> &'static [(&'static str, From)] {
        &[("premium:window:pinned", From::App), ("premium:window:pin", From::App)]
    }
    fn start(&self, h: &Host) {
        wins::apply_all(h);
    }
    fn stop(&self, h: &Host) {
        // Back to the defaults (the gate or the switch is already off).
        wins::apply_all(h);
    }
    fn call(&self, h: &Host, ch: &str, args: &[Value], caller: &Caller) -> Result<Value, String> {
        let kind = arg(args, 0);
        let kind = kind.as_str().filter(|k| KINDS.contains(k));
        Ok(match ch {
            "premium:window:pinned" => match kind {
                Some(k) => ok(json!({ "pinned": wins::on_top_for(h, k) })),
                None => fail("bad-kind"),
            },
            _ => {
                // Portal windows are drawn by the main window, so their pin arrives from it;
                // a pop-out can only pin itself.
                let k = if caller.kind == "popout" { Some("popout") } else { kind };
                let Some(k) = k else { return Ok(fail("bad-kind")) };
                let value = crate::premium::logic::rules::truthy(args.get(1));
                h.patch_feature("always_on_top", &json!({ k: value }));
                wins::apply_all(h);
                ok(json!({ "pinned": wins::on_top_for(h, k) }))
            }
        })
    }
    fn on_bus(&self, h: &Host, ev: &Bus) {
        match ev {
            Bus::WindowOpened { label, kind } => wins::apply_behaviour(h, label, kind),
            Bus::Settings(k) if k == "always_on_top" => wins::apply_all(h),
            _ => {}
        }
    }
}
