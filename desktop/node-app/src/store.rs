//! Setup values at rest: one DPAPI (CurrentUser) sealed file per field in
//! `%LOCALAPPDATA%\DescallNode\secure\`, with a per-field entropy, written owner-only (the
//! same primitives as the Descall desktop app's token store, descall_migrate::win). Values
//! never go to a plain file, a log or the page; they leave only into the backend's and
//! cloudflared's process environment. Off Windows (development only) they live in memory.

#[cfg(not(windows))]
use std::collections::HashMap;
#[cfg(not(windows))]
use std::sync::Mutex;

const ENTROPY_PREFIX: &str = "descall-node/secure-store/v1/";

#[cfg(not(windows))]
static MEMORY: Mutex<Option<HashMap<String, String>>> = Mutex::new(None);

fn valid_id(id: &str) -> bool {
    descall_node::secrets::field(id).is_some()
}

#[cfg(windows)]
fn path(id: &str) -> std::path::PathBuf {
    crate::paths::secure_dir().join(format!("{id}.bin"))
}

pub fn get(id: &str) -> Option<String> {
    if !valid_id(id) {
        return None;
    }
    #[cfg(windows)]
    {
        let sealed = std::fs::read(path(id)).ok()?;
        let entropy = format!("{ENTROPY_PREFIX}{id}");
        let plain = descall_migrate::win::dpapi::unprotect(&sealed, Some(entropy.as_bytes())).ok()?;
        String::from_utf8(plain).ok().filter(|v| !v.is_empty())
    }
    #[cfg(not(windows))]
    {
        let _ = ENTROPY_PREFIX;
        MEMORY.lock().ok()?.as_ref()?.get(id).cloned()
    }
}

/// Store (or with an empty value, delete) one field. False when the store refused.
pub fn set(id: &str, value: &str) -> bool {
    if !valid_id(id) {
        return false;
    }
    #[cfg(windows)]
    {
        use descall_migrate::win::secure_file;
        let p = path(id);
        if value.is_empty() {
            if p.exists() {
                secure_file::shred(&p);
                let _ = std::fs::remove_file(&p);
            }
            return true;
        }
        if secure_file::create_owner_only_dir(&crate::paths::secure_dir()).is_err() {
            return false;
        }
        let entropy = format!("{ENTROPY_PREFIX}{id}");
        match descall_migrate::win::dpapi::protect(value.as_bytes(), Some(entropy.as_bytes())) {
            Ok(sealed) => secure_file::write_owner_only(&p, &sealed).is_ok(),
            Err(_) => false,
        }
    }
    #[cfg(not(windows))]
    {
        let Ok(mut g) = MEMORY.lock() else { return false };
        let m = g.get_or_insert_with(HashMap::new);
        if value.is_empty() {
            m.remove(id);
        } else {
            m.insert(id.to_string(), value.to_string());
        }
        true
    }
}

/// "Gizlileri sil ve durdur": every field goes.
pub fn wipe() {
    for f in descall_node::secrets::FIELDS {
        let _ = set(f.id, "");
    }
}

/// Every stored value (for the log redactor; never logged or sent to the page).
pub fn all_values() -> Vec<String> {
    let mut v: Vec<String> = Vec::new();
    for f in descall_node::secrets::FIELDS {
        if let Some(x) = get(f.id) {
            if f.id == "extraEnv" {
                v.extend(descall_node::secrets::parse_env_lines(&x).vars.into_iter().map(|(_, val)| val));
            } else if f.secret {
                v.push(x);
            }
        }
    }
    v
}

pub fn is_set(id: &str) -> bool {
    get(id).is_some()
}
