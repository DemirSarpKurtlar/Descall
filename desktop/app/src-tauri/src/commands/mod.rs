//! Tauri commands behind the `window.electronAPI` shim. One module per preload.cjs group.

pub mod app;
pub mod notify;
pub mod overlay;
pub mod premium;
pub mod screen;
pub mod system;
pub mod updates;
pub mod window;

use std::sync::atomic::AtomicBool;

#[derive(Default)]
pub struct AppState {
    /// voice:set-busy (call, ring, server voice, screen share): updates wait (updateDeferral.cjs).
    pub voice_busy: AtomicBool,
    /// activity:set-busy (typing, upload, recording).
    pub user_busy: AtomicBool,
}
