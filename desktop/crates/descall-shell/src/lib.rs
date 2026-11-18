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

pub mod clipboard;
pub mod deferral;
pub mod download;
pub mod i18n;
pub mod launch;
pub mod notif;
pub mod occlusion;
pub mod pages;
pub mod processes;
pub mod trust;
pub mod watchdog;
