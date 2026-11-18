//! descall-migrate: everything the one-time Electron -> Tauri move needs, shared by the
//! signed bootstrapper (DescallMigrator.exe) and the new app (import on first start).
//!
//! Flow (see Rust-gecis-teknik-plan.md section 3):
//! 1. Electron bridge release decrypts its secrets with safeStorage and pipes a Handoff JSON
//!    to the *verified* bootstrapper over stdin (never plaintext on disk).
//! 2. The bootstrapper DPAPI-protects it (CurrentUser + entropy) into an owner-only file.
//! 3. The new app imports it on first start, re-stores secrets with DPAPI, deletes the file.
//! 4. If the handoff is missing or damaged, the app falls back to decrypting the Electron
//!    files directly (oscrypt.rs): Electron's Local State key is itself DPAPI-protected.

pub mod handoff;
pub mod oscrypt;
pub mod plan;

#[cfg(windows)]
pub mod dpapi;
#[cfg(windows)]
pub mod secure_file;
#[cfg(windows)]
pub mod electron;

#[derive(Debug, thiserror::Error)]
pub enum MigrateError {
    #[error("handoff: {0}")]
    Handoff(String),
    #[error("oscrypt: {0}")]
    OsCrypt(String),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
    #[cfg(windows)]
    #[error(transparent)]
    Win(#[from] windows::core::Error),
}
pub type Result<T> = std::result::Result<T, MigrateError>;
