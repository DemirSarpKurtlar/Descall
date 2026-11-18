//! global_ptt (Plus): push-to-talk from any app, including a fullscreen game.
//!
//! Hold mode: Raw Input (raw_input.rs) watches only the bound key or mouse button, with
//! RIDEV_INPUTSINK so it works while another app has the focus. It observes and never blocks
//! or injects; the key still reaches the game. It runs only during a call, so outside calls
//! there is no input listener at all.
//!
//! Fallback: if Raw Input cannot start (or forceToggle is set), a keyboard binding becomes a
//! toggle through a global hotkey with an automatic timeout, and the status reports mode
//! 'toggle' with the reason. Never fatal.
//!
//! Settings: { enabled, releaseDelayMs, toggleTimeoutMs, forceToggle }.
//! Renderer: premium:ptt { down }.

use std::sync::{Arc, Mutex};

use serde_json::{json, Value};

use super::global_mute::custom;
use super::{CallEdge, Gen};
use crate::premium::logic::hotkey_logic::is_mouse_binding;
use crate::premium::logic::ptt_logic::{binding_to_spec, Edge, PttState};
use crate::premium::logic::rules::{clamp_num, truthy};
use crate::premium::raw_input::Listener;
use crate::premium::{host, lock, now_ms, ok, Bus, Caller, Feature, From, Host};

#[derive(Default)]
pub struct F {
    edge: CallEdge,
    listener: Mutex<Option<Listener>>,
    native_error: Mutex<Option<String>>,
    state: Arc<Mutex<Option<PttState>>>,
    timer: Arc<Gen>,
}

struct Settings {
    release_delay_ms: u64,
    toggle_timeout_ms: u64,
    force_toggle: bool,
}

fn settings(h: &Host) -> Settings {
    let s = h.feature_settings("global_ptt");
    Settings {
        release_delay_ms: clamp_num(s.get("releaseDelayMs"), 0.0, 1000.0, 150.0) as u64,
        toggle_timeout_ms: clamp_num(s.get("toggleTimeoutMs"), 1000.0, 120_000.0, 10_000.0) as u64,
        force_toggle: truthy(s.get("forceToggle")),
    }
}

fn binding(h: &Host) -> String {
    h.hotkeys.bindings(&custom(h)).get("push_to_talk").cloned().unwrap_or_default()
}

/// Apply a talk transition: tell the renderer, and arm the tail / timeout tick.
fn emit(h: &Host, state: &Arc<Mutex<Option<PttState>>>, timer: &Gen, change: Option<bool>) {
    if let Some(down) = change {
        h.send("premium:ptt", json!({ "down": down }));
    }
    let deadline = lock(state).as_ref().and_then(PttState::next_deadline);
    if let Some(at) = deadline {
        let g = timer.bump();
        h.tick("global_ptt", "timer", g, at.saturating_sub(now_ms()));
    }
}

impl F {
    fn mode(&self, h: &Host) -> &'static str {
        let s = settings(h);
        if !s.force_toggle && lock(&self.native_error).is_none() && binding_to_spec(&binding(h)).is_some() {
            "hold"
        } else {
            "toggle"
        }
    }

    fn stop_listener(&self) {
        if let Some(l) = lock(&self.listener).take() {
            l.stop();
        }
    }

    fn start_listener(&self, h: &Host) {
        let Some(spec) = binding_to_spec(&binding(h)) else { return };
        let state = self.state.clone();
        let timer = self.timer.clone();
        let on_edge = Box::new(move |edge: Edge| {
            // Runs on the Raw Input thread: flip the flag and post the event, nothing more.
            let Some(h) = host() else { return };
            let change = {
                let mut st = lock(&state);
                let Some(p) = st.as_mut() else { return };
                match edge {
                    Edge::Down => p.press(now_ms()),
                    Edge::Up => p.release(now_ms()),
                }
            };
            emit(h, &state, &timer, change);
        });
        match Listener::start(spec, on_edge) {
            Ok(l) => *lock(&self.listener) = Some(l),
            Err(e) => {
                log::warn!("[premium:ptt] raw input unavailable, using toggle mode: {e}");
                *lock(&self.native_error) = Some(e.chars().take(200).collect());
                self.sync(h);
            }
        }
    }

    fn sync(&self, h: &Host) {
        let s = settings(h);
        let reset = lock(&self.state).as_mut().and_then(PttState::reset);
        if reset.is_some() {
            h.send("premium:ptt", json!({ "down": false }));
        }
        *lock(&self.state) = Some(PttState::new(s.release_delay_ms, s.toggle_timeout_ms));
        self.stop_listener();
        let c = custom(h);
        h.hotkeys.set_handler(&c, "push_to_talk", None);
        if self.mode(h) == "hold" {
            if h.in_call() {
                self.start_listener(h); // no input listener at all outside calls
            }
            return;
        }
        if !is_mouse_binding(&binding(h)) {
            let state = self.state.clone();
            let timer = self.timer.clone();
            h.hotkeys.set_handler(
                &c,
                "push_to_talk",
                Some(Arc::new(move || {
                    let Some(h) = host() else { return };
                    let change = lock(&state).as_mut().and_then(|p| p.toggle(now_ms()));
                    emit(h, &state, &timer, change);
                })),
            );
        }
    }
}

impl Feature for F {
    fn key(&self) -> &'static str {
        "global_ptt"
    }
    fn channels(&self) -> &'static [(&'static str, From)] {
        &[("premium:global_ptt:status", From::Main)]
    }
    fn start(&self, h: &Host) {
        self.edge.reset(h);
        *lock(&self.native_error) = None;
        self.sync(h);
    }
    fn stop(&self, h: &Host) {
        self.stop_listener();
        if lock(&self.state).take().and_then(|mut p| p.reset()).is_some() {
            h.send("premium:ptt", json!({ "down": false }));
        }
        self.timer.bump();
        h.hotkeys.set_handler(&custom(h), "push_to_talk", None);
    }
    fn call(&self, h: &Host, _ch: &str, _a: &[Value], _c: &Caller) -> Result<Value, String> {
        let m = self.mode(h);
        let b = binding(h);
        let err = lock(&self.native_error).clone();
        Ok(ok(json!({
            "mode": m,
            "binding": b,
            "nativeAvailable": cfg!(windows) && err.is_none(),
            "nativeError": err,
            "hookRunning": lock(&self.listener).is_some(),
            "mouseNeedsNative": m == "toggle" && is_mouse_binding(&b),
        })))
    }
    fn on_bus(&self, h: &Host, ev: &Bus) {
        match ev {
            Bus::Call if self.edge.changed(h).is_some() => self.sync(h),
            Bus::Settings(k) if k == "global_ptt" || k == "custom_hotkeys" => self.sync(h),
            Bus::Tick { key: "global_ptt", tag: "timer", gen } if self.timer.is(*gen) => {
                let change = lock(&self.state).as_mut().and_then(|p| p.tick(now_ms()));
                emit(h, &self.state, &self.timer, change);
            }
            _ => {}
        }
    }
}
