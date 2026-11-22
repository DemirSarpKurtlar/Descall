//! Integrity of the bundled runtime. The installer carries `runtime/node.exe`,
//! `runtime/cloudflared.exe` and the backend; the build writes `runtime-manifest.json` with
//! the SHA-256 of each executable (checked against the pinned values in
//! desktop/node-app/runtime.lock.json at build time). The app checks node.exe and
//! cloudflared.exe against it before every first spawn, so a replaced binary is never run
//! with the owner's secrets in its environment.

use serde::Deserialize;
use sha2::{Digest, Sha256};

#[derive(Debug, Clone, Deserialize, PartialEq)]
pub struct Entry {
    pub path: String,
    pub sha256: String,
    #[serde(default)]
    pub size: Option<u64>,
}

#[derive(Debug, Clone, Deserialize, PartialEq)]
pub struct Manifest {
    pub files: Vec<Entry>,
    #[serde(default)]
    pub node: Option<String>,
    #[serde(default)]
    pub cloudflared: Option<String>,
}

pub fn parse(text: &str) -> Option<Manifest> {
    serde_json::from_str(text).ok()
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    hex(&Sha256::digest(bytes))
}

pub fn hex(d: &[u8]) -> String {
    d.iter().map(|b| format!("{b:02x}")).collect()
}

/// Streaming hasher for big files (node.exe is ~80 MB).
#[derive(Default)]
pub struct Hasher(Sha256);

impl Hasher {
    pub fn update(&mut self, chunk: &[u8]) {
        self.0.update(chunk);
    }
    pub fn finish(self) -> String {
        hex(&self.0.finalize())
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Check {
    Ok,
    Missing(String),
    Mismatch(String),
    NotInManifest(String),
}

/// Check the files the app is about to run. `digest(path)` returns the file's SHA-256 hex or
/// None when it cannot be read.
pub fn verify(m: &Manifest, wanted: &[&str], digest: &dyn Fn(&str) -> Option<String>) -> Check {
    for w in wanted {
        let Some(e) = m.files.iter().find(|e| e.path.eq_ignore_ascii_case(w)) else {
            return Check::NotInManifest((*w).into());
        };
        match digest(&e.path) {
            None => return Check::Missing(e.path.clone()),
            Some(d) if !d.eq_ignore_ascii_case(e.sha256.trim()) => return Check::Mismatch(e.path.clone()),
            Some(_) => {}
        }
    }
    Check::Ok
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hashes() {
        assert_eq!(sha256_hex(b"abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
        let mut h = Hasher::default();
        h.update(b"a");
        h.update(b"bc");
        assert_eq!(h.finish(), sha256_hex(b"abc"));
    }

    #[test]
    fn verify_runtime() {
        let m = parse(r#"{ "node": "v24.22.3", "files": [ { "path": "runtime/node.exe", "sha256": "BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD" }, { "path": "runtime/cloudflared.exe", "sha256": "00" } ] }"#).unwrap();
        let abc = |_: &str| Some(sha256_hex(b"abc"));
        assert_eq!(verify(&m, &["runtime/node.exe"], &abc), Check::Ok);
        assert_eq!(verify(&m, &["runtime/node.exe", "runtime/cloudflared.exe"], &abc), Check::Mismatch("runtime/cloudflared.exe".into()));
        assert_eq!(verify(&m, &["runtime/node.exe"], &|_| None), Check::Missing("runtime/node.exe".into()));
        assert_eq!(verify(&m, &["backend/server.js"], &abc), Check::NotInManifest("backend/server.js".into()));
        assert!(parse("nope").is_none());
    }
}
