//! Shared logic of the voice HUD and the gaming HUD (port of hudFeature.cjs): click-through,
//! always-on-top, transparent windows driven only by the state the renderer pushes (throttled
//! there to a few updates per second). Off until the user opens them.

use std::sync::atomic::{AtomicBool, AtomicI64, Ordering};
use std::sync::Mutex;

use serde_json::{json, Value};

use crate::premium::logic::geom::{self, Rect};
use crate::premium::logic::rules::{hud_config, hud_height, num, HudConfig};
use crate::premium::overlay::{self, OpenOpts};
use crate::premium::{arg, lock, ok, wins, Caller, Feature, From, Host};

pub struct HudFeature {
    pub key: &'static str,
    pub kind: &'static str,
    corner: &'static str,
    width: f64,
    channels: [(&'static str, From); 5],
    config: Mutex<Option<HudConfig>>,
    last: Mutex<Option<Value>>,
    visible: AtomicBool,
    /// Height the HUD page measured for its own content (window px); 0 = not yet.
    measured: AtomicI64,
}

impl HudFeature {
    pub const fn new(key: &'static str, kind: &'static str, corner: &'static str, width: f64, channels: [(&'static str, From); 5]) -> Self {
        Self { key, kind, corner, width, channels, config: Mutex::new(None), last: Mutex::new(None), visible: AtomicBool::new(false), measured: AtomicI64::new(0) }
    }

    fn id(&self) -> String {
        format!("hud:{}", self.key)
    }

    fn cfg(&self) -> HudConfig {
        lock(&self.config).clone().unwrap_or_else(|| hud_config(&json!({}), self.corner, self.width))
    }

    fn bounds(&self, h: &Host) -> Rect {
        let c = self.cfg();
        let sc = wins::scale(h);
        let w = (c.width * c.scale * sc).round() as i32;
        let measured = self.measured.load(Ordering::Relaxed);
        let state = lock(&self.last).clone().unwrap_or(json!({}));
        let hh = if measured > 0 { measured as i32 } else { (hud_height(self.kind, &state) * c.scale * sc).round() as i32 };
        geom::corner_bounds(wins::primary_area(h), &c.corner, w, hh, (c.margin * sc).round() as i32)
    }

    fn decorate(&self) -> Value {
        let mut s = lock(&self.last).clone().filter(Value::is_object).unwrap_or(json!({}));
        s["scale"] = json!(1);
        s
    }

    fn show(&self, h: &Host) -> Value {
        self.visible.store(true, Ordering::Relaxed);
        let c = self.cfg();
        overlay::open(h, OpenOpts {
            id: &self.id(),
            kind: self.kind,
            owner: self.key,
            bounds: self.bounds(h),
            click_through: c.click_through,
            opacity: c.opacity,
            focusable: false,
            state: Some(self.decorate()),
            widget_kind: None,
        });
        ok(json!({ "visible": true }))
    }

    fn hide(&self, h: &Host) -> Value {
        self.visible.store(false, Ordering::Relaxed);
        overlay::close(h, &self.id());
        ok(json!({ "visible": false }))
    }

    fn update(&self, h: &Host, state: Value) -> Value {
        let prev = hud_height(self.kind, &lock(&self.last).clone().unwrap_or(json!({})));
        *lock(&self.last) = Some(if state.is_object() { state } else { json!({}) });
        if !self.visible.load(Ordering::Relaxed) {
            return ok(json!({ "visible": false }));
        }
        if overlay::get(h, &self.id()).is_none() {
            return self.show(h);
        }
        let now = hud_height(self.kind, &lock(&self.last).clone().unwrap_or(json!({})));
        if self.measured.load(Ordering::Relaxed) == 0 && now != prev {
            overlay::set_window_bounds(h, &self.id(), self.bounds(h));
        }
        overlay::send(h, &self.id(), self.decorate());
        ok(json!({ "visible": true }))
    }

    /// 'size' from the page: it measured its content (CSS px) and needs this much height.
    pub fn on_action(&self, h: &Host, kind: &str, payload: &Value) {
        if kind != "size" {
            return;
        }
        let Some(need) = num(payload.get("need")) else { return };
        let next = (need.round().clamp(60.0, 900.0) * wins::scale(h)).round() as i64;
        if (next - self.measured.load(Ordering::Relaxed)).abs() < 2 {
            return;
        }
        self.measured.store(next, Ordering::Relaxed);
        overlay::set_window_bounds(h, &self.id(), self.bounds(h));
    }
}

/// Feature wrapper around a static HudFeature (overlay actions find it by key).
pub struct HudRef(pub &'static HudFeature);

impl Feature for HudRef {
    fn key(&self) -> &'static str {
        self.0.key
    }
    fn channels(&self) -> &'static [(&'static str, From)] {
        &self.0.channels
    }
    fn start(&self, h: &Host) {
        *lock(&self.0.config) = Some(hud_config(&h.read_json(self.0.key).unwrap_or(json!({})), self.0.corner, self.0.width));
    }
    fn stop(&self, h: &Host) {
        self.0.hide(h);
    }
    fn call(&self, h: &Host, ch: &str, args: &[Value], _c: &Caller) -> Result<Value, String> {
        let hud = self.0;
        let verb = ch.rsplit(':').next().unwrap_or("");
        Ok(match verb {
            "open" => hud.show(h),
            "close" => hud.hide(h),
            "state" => hud.update(h, arg(args, 0)),
            "config" => {
                let c = hud_config(&arg(args, 0), hud.corner, hud.width);
                h.write_json(hud.key, &c.to_json());
                *lock(&hud.config) = Some(c.clone());
                hud.measured.store(0, Ordering::Relaxed);
                if hud.visible.load(Ordering::Relaxed) {
                    hud.show(h);
                }
                ok(json!({ "config": c.to_json() }))
            }
            _ => ok(json!({
                "visible": hud.visible.load(Ordering::Relaxed),
                "config": hud.cfg().to_json(),
                "bounds": overlay::window_bounds(h, &hud.id()).map(Rect::to_json),
            })),
        })
    }
}
