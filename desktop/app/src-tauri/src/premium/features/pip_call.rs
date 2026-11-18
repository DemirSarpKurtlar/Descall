//! pip_call (Plus): the call in a resizable, always-on-top window. The main renderer draws it
//! (portal window via window.open, see wins::portal_open) and moves the live MediaStream into it
//! without re-encoding. Also the "pop out the call" target of multi_window.

use serde_json::{json, Value};

use crate::premium::{ok, wins, Caller, Feature, From, Host};

pub struct F;

impl Feature for F {
    fn key(&self) -> &'static str {
        "pip_call"
    }
    fn channels(&self) -> &'static [(&'static str, From)] {
        &[("premium:pip:toggle", From::App)]
    }
    fn stop(&self, h: &Host) {
        h.send("premium:close", json!({ "kind": "call" }));
        wins::close_kind(h, "call");
    }
    fn call(&self, h: &Host, _ch: &str, _args: &[Value], _c: &Caller) -> Result<Value, String> {
        let sent = h.send("premium:toggle", json!({ "kind": "call" }));
        let mut v = ok(json!({}));
        v["ok"] = json!(sent);
        Ok(v)
    }
}
