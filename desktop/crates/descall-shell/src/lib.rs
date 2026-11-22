//! Rules of the Descall desktop shell that do not need Windows or a webview.
//!
//! Each module is a port of a pure `frontend/electron/*.cjs` module, and its tests are the
//! matching `*.selftest.mjs` / `*.unit.test.cjs` assertions. The Electron files stay the
//! reference until the Electron line is retired: when one changes, change the port too.
//!
//! | module            | Electron source                         | selftest ported                       |
//! |-------------------|-----------------------------------------|---------------------------------------|
//! | `deferral`        | updateDeferral.cjs                      | updateDeferral.selftest.mjs           |
//! | `launch`          | launchVisibility.cjs                    | launchVisibility.selftest.mjs         |
//! | `trust`           | appTrust.cjs (origin rules, Tauri origin)| appTrust.selftest.mjs                |
//! | `download`        | safeDownload.cjs                        | safeDownload.selftest.mjs             |
//! | `i18n`            | mainI18n.cjs + electron/i18n/*.json     | mainI18n.selftest.mjs                 |
//! | `notif`           | notificationStack.cjs, cardHeightFor    | notificationCallCard.selftest.mjs (6, 7) |
//! | `occlusion`       | windowOcclusion.cjs                     | windowOcclusion.unit.test.cjs         |
//! | `watchdog`        | bootWatchdog.cjs                        | bootWatchdog.selftest.mjs             |
//! | `processes`       | processScanner.cjs BLOCKLIST            | (new)                                 |
//! | `clipboard`       | clipboardText.cjs, clipboardImage.cjs   | clipboardText.selftest.mjs            |
//! | `csp` (tests only)  | cspPolicy.cjs vs tauri.conf.json        | CSP source lists                      |
//! | `pages`             | notificationCard/overlayHtml runtime    | node check of the bundled modules     |
//! | `tray_panel`        | trayMenuModel.cjs                       | trayMenu.selftest.mjs (1-4)           |
//! | `dist_path`         | appProtocolPath.cjs resolveDistFile     | (nested ./assets URLs)                |
//! | `crash`             | (new) panic text for the page           | no paths, no source locations         |
//! | `logfile`           | electron-log main.log (layout, 1 MB)    | line format, filter, rotation         |
//! | `ipc_policy`        | per-window preloads (notif, overlay...) | commands per window, capabilities     |
//! | `window_keys`       | windowKeys.cjs devToolsAllowed          | (DevTools opt-in file)                |
//! | `bridge`            | main.cjs per-sender IPC rules           | shim commands vs generate_handler!    |
//! | `main_errors`       | mainErrors.cjs (+ crash file)           | mainErrors.selftest.mjs               |
//! | `deep_link`         | (new: descall:// from argv)             | (new)                                 |
//! | `secrets`           | (new) tokens out of main.log / reports  | (new)                                 |

pub mod bridge;
pub mod clipboard;
pub mod crash;
pub mod csp;
pub mod deep_link;
pub mod deferral;
pub mod dist_path;
pub mod download;
pub mod i18n;
pub mod ipc_policy;
pub mod launch;
pub mod logfile;
pub mod main_errors;
pub mod notif;
pub mod occlusion;
pub mod pages;
pub mod processes;
pub mod secrets;
pub mod tray_panel;
pub mod trust;
pub mod watchdog;
pub mod window_keys;
