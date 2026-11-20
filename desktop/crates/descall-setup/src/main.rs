//! Descall-Setup.exe: per-user installer, updater and migration window for the Tauri desktop app.
//!
//! One small exe, four modes (see `cli`): interactive install (draft B welcome -> progress -> done),
//! in-app update toast, the Electron -> Tauri migration screen, and uninstall. The window is a
//! frameless WebView2 (wry/tao) showing `ui/` (embedded), so it looks exactly like the draft.
#![cfg_attr(all(windows, not(test)), windows_subsystem = "windows")]
#![cfg_attr(not(windows), allow(dead_code))]

mod cli;
mod download;
mod layout;
mod manifest;
mod payload;
mod unpack;

#[cfg(windows)]
mod win;

fn main() {
    let args = cli::parse(std::env::args().skip(1));
    #[cfg(windows)]
    {
        std::process::exit(win::run(args));
    }
    #[cfg(not(windows))]
    {
        let _ = args;
        eprintln!("Descall-Setup runs on Windows only. On other systems use `cargo test` and tools/render.cjs.");
        std::process::exit(2);
    }
}
