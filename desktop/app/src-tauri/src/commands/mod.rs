//! Tauri commands behind the `window.electronAPI` shim (desktop/app/shim/electron-api-shim.js).
//! One module per preload.cjs group; see the mapping table in the shim header.

pub mod app;
pub mod notify;
pub mod overlay;
pub mod passkey;
pub mod screen;
pub mod system;
pub mod updates;
pub mod window;
