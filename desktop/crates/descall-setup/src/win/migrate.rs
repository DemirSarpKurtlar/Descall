//! Migration screen steps (technical plan 3.2/3.3) that run after the new core is in place:
//! settings files, session handoff check, shell identity, Electron cache cleanup.
//! Secrets never pass through here: the migrator seals them (DPAPI) into handoff.bin and the app
//! imports them on first start; we only check that the sealed file is there.

use crate::layout::{Layout, ELECTRON_CACHE_DIRS};
use serde::Deserialize;
use std::fs;
use std::path::Path;

/// Non-secret counts the migrator writes next to handoff.bin (`summary.json`).
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Summary {
    pub from_version: Option<String>,
    pub settings: Option<u32>,
    pub shortcuts: Option<u32>,
}

pub fn summary(l: &Layout) -> Summary {
    fs::read(l.migration_dir().join("summary.json")).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default()
}

fn copy_tree(from: &Path, to: &Path, n: &mut u32) {
    let Ok(rd) = fs::read_dir(from) else { return };
    let _ = fs::create_dir_all(to);
    for e in rd.flatten() {
        let p = e.path();
        let dest = to.join(e.file_name());
        if p.is_dir() {
            copy_tree(&p, &dest, n);
        } else if !dest.exists() && fs::copy(&p, &dest).is_ok() {
            *n += 1;
        }
    }
}

/// Copies premium settings, layouts and window state (never overwriting what the new app wrote).
/// Returns the number of settings items moved.
pub fn copy_settings(l: &Layout) -> u32 {
    let src = l.electron_data();
    let dst = l.app_data().join("premium");
    let _ = fs::create_dir_all(&dst);
    let mut items = 0u32;
    if let Ok(b) = fs::read(src.join("premium-settings.json")) {
        if let Ok(v) = serde_json::from_slice::<serde_json::Value>(&b) {
            items += v.as_object().map(|o| o.len() as u32).unwrap_or(0);
        }
        let d = dst.join("premium-settings.json");
        if !d.exists() {
            let _ = fs::write(d, b);
        }
    }
    let ws = l.app_data().join("window-state.json");
    if !ws.exists() && fs::copy(src.join("window-state.json"), &ws).is_ok() {
        items += 1;
    }
    copy_tree(&src.join("premium"), &dst, &mut items);
    items
}

/// The sealed session handoff from the migrator, or Electron's own encrypted token the app can
/// read with its OSCrypt fallback. `false` means one more sign-in.
pub fn session_available(l: &Layout) -> bool {
    l.migration_dir().join("handoff.bin").is_file() || (l.electron_data().join("Local State").is_file() && l.electron_data().join("auth-token.bin").is_file())
}

fn tree_size(p: &Path) -> u64 {
    let Ok(md) = fs::symlink_metadata(p) else { return 0 };
    if md.is_file() {
        return md.len();
    }
    if md.file_type().is_symlink() {
        return 0;
    }
    fs::read_dir(p).map(|rd| rd.flatten().map(|e| tree_size(&e.path())).sum()).unwrap_or(0)
}

/// Total bytes in the Electron cache folders that will be cleared.
pub fn cache_bytes(l: &Layout) -> u64 {
    ELECTRON_CACHE_DIRS.iter().map(|d| tree_size(&l.electron_data().join(d))).sum()
}

/// Deletes the cache folders one by one; `progress(done_bytes)` after each.
pub fn clean_caches(l: &Layout, mut progress: impl FnMut(u64)) -> u64 {
    let mut done = 0u64;
    for d in ELECTRON_CACHE_DIRS {
        let p = l.electron_data().join(d);
        let sz = tree_size(&p);
        if sz > 0 && fs::remove_dir_all(&p).is_ok() {
            done += sz;
        } else if sz > 0 {
            // Locked leftovers: count what went.
            done += sz.saturating_sub(tree_size(&p));
        }
        progress(done);
    }
    done
}
