//! The shell side of the Descall+ module (src/premium): the optional hooks it exposes, wired to
//! the real tray, secret store, boot script and UI language. Notifications and account tokens
//! are routed in commands::notify and commands::system.

use tauri::AppHandle;

/// Call once in setup, after the tray exists (the premium plugin is already running).
pub fn install(app: &AppHandle) {
    // The gate check signs in with the shell's own copy of the session (as Electron did).
    crate::premium::set_token_reader(|app| crate::secure_store::get(app, crate::secure_store::TOKEN));
    // Descall+ tray items changed (focus, call, profile): rebuild on the UI thread.
    crate::premium::set_tray_rebuilder(|app| {
        let h = app.clone();
        let _ = app.run_on_main_thread(move || crate::tray::rebuild(&h));
    });
    crate::premium::set_boot_script_provider(|app, label| Some(crate::boot::boot_script_for_premium_window(app, label)));
    crate::premium::set_locale(&crate::state::locale(app));
    crate::tray::rebuild(app);
}
