//! multi_account (Ultra): each extra account runs in its own window ("acct-<id>") with its own
//! WebView2 data directory (`premium/accounts/<id>/webview`): separate localStorage, IndexedDB,
//! cookies and cache, so nothing of account A leaks into account B. Each account's session token
//! is sealed with DPAPI in the shell's secret store as `account-<id>` (crate::secure_store, the
//! same entry the Electron import fills); the account window's
//! secureToken.set / clear land there (never in the owner's store). Descall+ calls from an
//! account window are refused (entitlements belong to the main account). The tray label is the
//! username claim of the account's own token. Cost: one browser process per account, cap 3.

use std::sync::Mutex;

use serde_json::{json, Value};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

use crate::premium::logic::rules::{cut, jwt_username, s};
use crate::premium::logic::tray::{self, TrayItem};
use crate::premium::{arg, host, iso_now, lock, ok, wins, Caller, Feature, From, Host};

const MAX_EXTRA: usize = 3;
const FILE: &str = "accounts";

/// In an account window: send secureToken.set / clear to this account's own token file.
const TOKEN_REDIRECT: &str = r#"(() => {
  "use strict";
  const T = window.__TAURI__;
  if (!T || !T.core || window.top !== window) return;
  const orig = T.core.invoke.bind(T.core);
  const own = (token) => orig("premium_invoke", { channel: "premium:multi_account:token", args: [token] });
  try {
    T.core.invoke = (cmd, args, opts) => {
      if (cmd === "token_set") return own(String((args && args.token) || ""));
      if (cmd === "token_clear") return own(null);
      return orig(cmd, args, opts);
    };
  } catch (_) { /* frozen: the shell's token_set calls premium::account_token */ }
})();"#;

#[derive(Default)]
pub struct F {
    labels: Mutex<Value>,
}

fn valid_id(id: &str) -> bool {
    id.len() == 12 && id.bytes().all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
}

fn accounts(h: &Host) -> Vec<Value> {
    h.read_json(FILE).and_then(|v| v.get("accounts").and_then(Value::as_array).cloned()).unwrap_or_default().into_iter().filter(|a| valid_id(&s(a, "id"))).collect()
}

fn write_accounts(h: &Host, list: &[Value]) {
    h.write_json(FILE, &json!({ "accounts": list }));
}

fn dir(h: &Host, id: &str) -> std::path::PathBuf {
    h.premium_dir().join("accounts").join(id)
}

fn token_key(id: &str) -> String {
    format!("account-{id}")
}

fn token(h: &Host, id: &str) -> Option<String> {
    crate::secure_store::get(&h.app, &token_key(id)).filter(|t| !t.is_empty())
}

fn label_for(h: &Host, a: &Value) -> String {
    let id = s(a, "id");
    let name = token(h, &id).map(|t| jwt_username(&t)).unwrap_or_default();
    if name.is_empty() { s(a, "label") } else { name }
}

fn window_label(id: &str) -> String {
    format!("acct-{id}")
}

/// secureToken.set / clear from an account window. False when `label` is not one.
pub(crate) fn store_token(h: &Host, label: &str, tok: Option<&str>) -> bool {
    let Some(id) = label.strip_prefix("acct-").filter(|id| valid_id(id)) else { return false };
    if !accounts(h).iter().any(|a| s(a, "id") == id) {
        return false;
    }
    // An empty value removes the entry.
    crate::secure_store::set(&h.app, &token_key(id), tok.unwrap_or_default());
    h.refresh_tray();
    true
}

fn open(h: &Host, id: &str) -> Value {
    let Some(acct) = accounts(h).into_iter().find(|a| s(a, "id") == id) else { return json!({ "ok": false, "error": "missing" }) };
    let label = window_label(id);
    if let Some(w) = h.app.get_webview_window(&label) {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
        return ok(json!({ "id": id }));
    }
    let Some(url) = super::multi_window::app_url(h, "/") else { return json!({ "ok": false, "error": "no-main" }) };
    let origin = url.origin();
    let tok = token(h, id).unwrap_or_default();
    let script = format!("{}\n{TOKEN_REDIRECT}", super::multi_window::app_window_script(h, &label, &tok));
    let title = Some(label_for(h, &acct)).filter(|l| !l.is_empty()).unwrap_or_else(|| "Descall".into());
    let built = WebviewWindowBuilder::new(&h.app, &label, WebviewUrl::External(url))
        .title(title)
        .inner_size(1200.0, 800.0)
        .min_inner_size(900.0, 600.0)
        .decorations(false)
        .data_directory(dir(h, id).join("webview"))
        .use_https_scheme(true)
        .disable_drag_drop_handler() // HTML5 file drops into chats, as in the main window
        .general_autofill_enabled(false) // no browser autofill dropdown, as in Electron
        .initialization_script(&script)
        .on_navigation(move |u| u.origin() == origin)
        .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
        .build();
    match built {
        Ok(_) => {
            wins::track(h, &label, "account", "multi_account", json!({ "id": id }));
            ok(json!({ "id": id }))
        }
        Err(e) => {
            log::warn!("[premium] account window failed: {e}");
            json!({ "ok": false, "error": "failed" })
        }
    }
}

fn add(h: &Host) -> Value {
    let mut list = accounts(h);
    if list.len() >= MAX_EXTRA {
        return json!({ "ok": false, "error": "limit", "max": MAX_EXTRA });
    }
    let mut raw = [0u8; 6];
    if getrandom::fill(&mut raw).is_err() {
        return json!({ "ok": false, "error": "failed" });
    }
    let id: String = raw.iter().map(|b| format!("{b:02x}")).collect();
    list.push(json!({ "id": id, "label": "", "createdAt": iso_now() }));
    write_accounts(h, &list);
    let _ = std::fs::create_dir_all(dir(h, &id));
    h.refresh_tray();
    open(h, &id)
}

fn remove(h: &Host, id: &str) -> Value {
    let list = accounts(h);
    if !list.iter().any(|a| s(a, "id") == id) {
        return json!({ "ok": false, "error": "missing" });
    }
    if let Some(w) = h.app.get_webview_window(&window_label(id)) {
        let _ = w.destroy();
    }
    crate::secure_store::set(&h.app, &token_key(id), "");
    // The WebView2 browser process may still hold the profile for a moment.
    let d = dir(h, id);
    std::thread::spawn(move || {
        for _ in 0..10 {
            if std::fs::remove_dir_all(&d).is_ok() || !d.exists() {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(500));
        }
    });
    write_accounts(h, &list.into_iter().filter(|a| s(a, "id") != id).collect::<Vec<_>>());
    h.refresh_tray();
    ok(json!({}))
}

impl Feature for F {
    fn key(&self) -> &'static str {
        "multi_account"
    }
    fn channels(&self) -> &'static [(&'static str, From)] {
        &[
            ("premium:multi_account:list", From::Main),
            ("premium:multi_account:add", From::Main),
            ("premium:multi_account:open", From::Main),
            ("premium:multi_account:remove", From::Main),
            ("premium:multi_account:labels", From::Main),
        ]
    }
    fn stop(&self, h: &Host) {
        for (label, _) in wins::list(h, Some("account")) {
            if let Some(w) = h.app.get_webview_window(&label) {
                let _ = w.destroy();
            }
        }
    }
    fn call(&self, h: &Host, ch: &str, args: &[Value], _c: &Caller) -> Result<Value, String> {
        let id = arg(args, 0).as_str().unwrap_or("").to_string();
        Ok(match ch {
            "premium:multi_account:list" => ok(json!({
                "accounts": accounts(h).iter().map(|a| {
                    let id = s(a, "id");
                    json!({
                        "id": id, "label": label_for(h, a), "createdAt": a["createdAt"],
                        "open": h.app.get_webview_window(&window_label(&id)).is_some(),
                        "signedIn": token(h, &id).is_some(),
                    })
                }).collect::<Vec<_>>(),
                "max": MAX_EXTRA,
            })),
            "premium:multi_account:add" => add(h),
            "premium:multi_account:open" => open(h, &id),
            "premium:multi_account:remove" => remove(h, &id),
            _ => {
                let n = arg(args, 0);
                *lock(&self.labels) = json!({ "menu": cut(&s(&n, "menu"), 40), "add": cut(&s(&n, "add"), 40), "main": cut(&s(&n, "main"), 60), "unnamed": cut(&s(&n, "unnamed"), 40) });
                h.refresh_tray();
                ok(json!({}))
            }
        })
    }
    fn tray(&self, h: &Host) -> Vec<TrayItem> {
        let l = lock(&self.labels).clone();
        let list: Vec<(String, String)> = accounts(h).iter().map(|a| (s(a, "id"), label_for(h, a))).collect();
        tray::accounts(&s(&l, "menu"), &s(&l, "main"), &s(&l, "add"), &s(&l, "unnamed"), &list, MAX_EXTRA)
    }
    fn on_tray(&self, h: &Host, rest: &str) -> bool {
        let Some(what) = rest.strip_prefix("account|") else { return false };
        match what {
            "main" => h.show_main(),
            "add" => {
                add(h);
            }
            id => {
                open(h, id);
            }
        }
        let _ = host();
        true
    }
}
