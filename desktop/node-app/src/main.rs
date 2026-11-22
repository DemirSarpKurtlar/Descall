//! Descall Node: the owner's Windows PC as the second backend node of the Descall hybrid
//! server (Render primary + this PC). A tray-only Tauri 2 app, no main window:
//!
//! * supervises the bundled Node.js runtime running frontend/backend (env from the DPAPI
//!   store + DESCALL_NODE_*), inside a Windows Job Object sized from `dc:cfg:pc`;
//! * runs cloudflared (`tunnel run`, token in its env) for https://pc.descall.com;
//! * registers with the primary and heartbeats (`/api/node/register`), follows cfg changes;
//! * drains gracefully (users to Render) on shutdown, sleep, quit, Pause, schedule end and
//!   game mode; restarts with backoff when the backend dies;
//! * shows the Draft A tray popover (src/popover.rs, ui/) and a first-run setup in it.
//!
//! The rules live in the pure, tested crate `descall-node`; this binary wires them up.
//! Why a per-user tray app and not a Windows service: the popover, the DPAPI CurrentUser
//! store, game detection (foreground window, GPU of the signed-in session) and
//! WM_QUERYENDSESSION all belong to the owner's session; a session-0 service would need a
//! second process and IPC for each of them. It starts at sign-in (HKCU Run) and "service
//! stop" is `DescallNode.exe --stop` (used by the installer), which drains like Quit.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod runner;
mod logger;
mod net;
mod paths;
mod popover;
mod settings;
mod store;
mod sys;
mod tray;
#[cfg(windows)]
mod win;

use std::sync::{Arc, Mutex};

use serde_json::Value;
use tauri::{Manager, RunEvent};

use crate::runner::{Msg, Shared, Signals};

fn main() {
    logger::init();
    let argv: Vec<String> = std::env::args().collect();
    if argv.iter().any(|a| a == "--stop") {
        // No running instance got this (single instance forwards it otherwise): nothing to stop.
        log::info!("[app] --stop with no running node");
    }
    let (tx, rx) = std::sync::mpsc::channel::<Msg>();
    let signals = Arc::new(Signals::default());
    let shared = Arc::new(Shared { tx: Mutex::new(tx.clone()), state: Mutex::new(Value::Null), beat: Mutex::new(Default::default()), signals: signals.clone() });
    let rx = Mutex::new(Some(rx));

    let app = tauri::Builder::default()
        // First: a second launch exits before touching anything. "--stop" (installer, service
        // stop) drains and quits the running node; anything else opens its popover.
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if argv.iter().any(|a| a == "--stop") {
                if let Some(s) = app.try_state::<Arc<Shared>>() {
                    s.send(Msg::Act("quit".into()));
                }
            } else {
                popover::show_async(app, None);
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .manage(shared.clone())
        .setup(move |app| {
            let handle = app.handle().clone();
            let st = settings::Settings::load();
            let lang = st.lang.clone().unwrap_or_else(|| descall_node::i18n::pick(&[std::env::var("LANG").unwrap_or_default()]).to_string());
            if let Err(e) = tray::create(&handle, &lang) {
                log::error!("[tray] could not create the tray icon: {e}");
            }
            // Start with Windows: turned on once on the first start; the owner's choice stays.
            if !st.autostart_decided && !cfg!(debug_assertions) {
                let mut st = st.clone();
                sys::set_autostart(true);
                st.autostart_decided = true;
                st.save();
            }
            sys::watch_power(tx.clone(), signals.clone());
            let core_rx = rx.lock().unwrap().take().expect("one setup");
            let sh = shared.clone();
            std::thread::Builder::new()
                .name("descall-node-supervisor".into())
                .spawn(move || runner::Core::new(handle, sh).run(core_rx))
                .expect("supervisor thread");
            runner::start_register_loop(shared.clone());
            // First run: open the setup right away.
            if !runner::configured() {
                let h = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(std::time::Duration::from_millis(1200)).await;
                    popover::show(&h, None);
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            popover::node_state,
            popover::node_act,
            popover::node_cfg,
            popover::node_setup_save,
            popover::node_setup_wipe,
            popover::node_autostart,
            popover::node_logs,
            popover::node_resize,
        ])
        .build(tauri::generate_context!())
        .expect("Descall Node failed to start");

    app.run(|app, event| {
        if let RunEvent::ExitRequested { code: None, api, .. } = event {
            // Not our own exit (the supervisor exits with a code after draining): keep running
            // in the tray; Quit goes through the drain.
            let _ = app;
            api.prevent_exit();
        }
    });
}

#[cfg(test)]
mod tests {
    /// Single instance before every other plugin, and `--stop` reaches the running node.
    #[test]
    fn single_instance_first_and_stop_forwarded() {
        let main = include_str!("main.rs");
        let b = &main[main.find("tauri::Builder::default()").unwrap()..];
        let first = b.find(".plugin(").unwrap();
        assert!(b[first..].starts_with(".plugin(tauri_plugin_single_instance::init("));
        assert!(b[first..first + 600].contains("\"--stop\"") && b[first..first + 600].contains("Msg::Act(\"quit\""));
    }

    /// The popover may only listen; its commands check the label.
    #[test]
    fn popover_capability_is_minimal() {
        let cap: serde_json::Value = serde_json::from_str(include_str!("../capabilities/popover.json")).unwrap();
        assert_eq!(cap["windows"], serde_json::json!(["popover"]));
        let perms: Vec<&str> = cap["permissions"].as_array().unwrap().iter().filter_map(|p| p.as_str()).collect();
        assert_eq!(perms, vec!["core:event:allow-listen", "core:event:allow-unlisten"]);
        let pop = include_str!("popover.rs");
        assert_eq!(pop.matches("#[tauri::command]").count(), pop.matches("mine(&window)?").count());
    }

    /// No secret value is ever formatted into a log line by the setup command.
    #[test]
    fn setup_logs_names_only() {
        let pop = include_str!("popover.rs");
        let save = &pop[pop.find("fn node_setup_save").unwrap()..pop.find("fn node_setup_wipe").unwrap()];
        for line in save.lines().filter(|l| l.contains("log::")) {
            assert!(line.contains("names.join"), "{line}");
        }
    }
}
