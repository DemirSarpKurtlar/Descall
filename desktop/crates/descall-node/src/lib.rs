//! Descall Node: the PC side of the hybrid server (Render primary + the owner's Windows PC as
//! a second full backend node). This crate holds every rule of the PC app that does not need
//! Windows, so it is unit-tested on any host; `desktop/node-app` (Tauri 2, tray only) wires
//! these rules to processes, the Job Object, power messages, HTTP and the popover page.
//!
//! Contract: HYBRID-CONTRACT (dc:cfg:pc shape, /api/node/register, node states). The local
//! control endpoints between this app and its own backend process are in [`local_api`].

pub mod capacity;
pub mod cfg;
pub mod env;
pub mod game;
pub mod heartbeat;
pub mod i18n;
pub mod limits;
pub mod local_api;
pub mod logrotate;
pub mod manifest;
pub mod placement;
pub mod redact;
pub mod schedule;
pub mod secrets;
pub mod supervisor;
pub mod time;
pub mod tray_icon;
pub mod usage;
pub mod view;

/// Default public hostname of the PC node (Cloudflare tunnel).
pub const DEFAULT_PUBLIC_URL: &str = "https://pc.descall.com";
/// Default primary (Render) URL.
pub const DEFAULT_PRIMARY_URL: &str = "https://des-call.onrender.com";
/// The popover's "Admin paneli" button (owner-only "Sunucu Ağı" tab of the admin panel).
pub const DEFAULT_ADMIN_URL: &str = "https://descall.com/admin/panel?tab=nodes";
/// Local port of the backend process; the tunnel's public hostname points at it.
pub const DEFAULT_PORT: u16 = 3210;
/// cloudflared metrics / readiness server (127.0.0.1 only).
pub const TUNNEL_METRICS_PORT: u16 = 20241;
/// Service version shown in the popover ("servis v1.0") and sent on register.
pub const SERVICE_VERSION: &str = "1.0.0";
