//! Release manifest: what to download, from where, and how to check it.
//!
//! `manifest.json` is signed with minisign (the same key as the Tauri updater, `tauri signer`),
//! and `manifest.json.minisig` sits next to it. The signature covers the payload SHA-256, the
//! per-part SHA-256 list and the mirror list, so a compromised CDN can neither swap bytes nor
//! redirect the download.
//!
//! ```json
//! { "product": "Descall", "version": "4.0.0", "arch": "x64", "minWindowsBuild": 19041,
//!   "payload": { "file": "Descall-4.0.0-x64.zip", "sha256": "…", "size": 19293798,
//!                "installedSize": 96468992, "files": 346, "partSize": 1363148, "parts": ["…", …] },
//!   "mirrors": [ { "base": "https://cdn.descall.com/desktop/4.0.0/", "label": { "tr": "İstanbul", "en": "Istanbul" } } ],
//!   "notes": [ { "tr": "…", "en": "…" } ], "legacyBackupDays": 14 }
//! ```

use serde::Deserialize;
use std::collections::BTreeMap;
use std::fmt;

#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Manifest {
    pub product: String,
    pub version: String,
    #[serde(default = "default_arch")]
    pub arch: String,
    #[serde(default)]
    pub min_windows_build: u32,
    pub payload: Payload,
    #[serde(default)]
    pub mirrors: Vec<Mirror>,
    #[serde(default)]
    pub notes: Vec<BTreeMap<String, String>>,
    #[serde(default)]
    pub legacy_backup_days: Option<u32>,
}

fn default_arch() -> String {
    "x64".into()
}

#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Payload {
    pub file: String,
    pub sha256: String,
    pub size: u64,
    #[serde(default)]
    pub installed_size: u64,
    #[serde(default)]
    pub files: u32,
    pub part_size: u64,
    pub parts: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, PartialEq)]
pub struct Mirror {
    pub base: String,
    #[serde(default)]
    pub label: BTreeMap<String, String>,
}

impl Mirror {
    pub fn label_for(&self, lang: &str) -> String {
        self.label
            .get(lang)
            .or_else(|| self.label.get(lang.split('-').next().unwrap_or(lang)))
            .or_else(|| self.label.get("en"))
            .cloned()
            .unwrap_or_else(|| host_of(&self.base).to_string())
    }
    pub fn host(&self) -> &str {
        host_of(&self.base)
    }
}

pub fn host_of(url: &str) -> &str {
    let rest = url.split_once("://").map(|x| x.1).unwrap_or(url);
    rest.split(['/', ':', '?']).next().unwrap_or(rest)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ManifestError {
    /// No public key compiled in (dev build) and unsigned manifests not allowed.
    NoKey,
    BadSignature(String),
    Parse(String),
    Invalid(&'static str),
}

impl fmt::Display for ManifestError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ManifestError::NoKey => write!(f, "no manifest public key in this build"),
            ManifestError::BadSignature(e) => write!(f, "manifest signature invalid: {e}"),
            ManifestError::Parse(e) => write!(f, "manifest parse error: {e}"),
            ManifestError::Invalid(e) => write!(f, "manifest invalid: {e}"),
        }
    }
}

/// minisign public key (base64, as printed by `tauri signer generate` / `minisign -G`), set at build time.
pub fn compiled_pubkey() -> Option<&'static str> {
    option_env!("DESCALL_SETUP_PUBKEY").filter(|k| !k.trim().is_empty())
}

/// Checks the minisign signature over the exact manifest bytes, then parses and validates.
pub fn verify_and_parse(bytes: &[u8], minisig: &str, pubkey: Option<&str>, allow_unsigned: bool) -> Result<Manifest, ManifestError> {
    match pubkey {
        Some(pk) => {
            let pk = minisign_verify::PublicKey::from_base64(pk.trim()).map_err(|e| ManifestError::BadSignature(e.to_string()))?;
            let sig = minisign_verify::Signature::decode(minisig).map_err(|e| ManifestError::BadSignature(e.to_string()))?;
            pk.verify(bytes, &sig, false).map_err(|e| ManifestError::BadSignature(e.to_string()))?;
        }
        None if allow_unsigned => {}
        None => return Err(ManifestError::NoKey),
    }
    let m: Manifest = serde_json::from_slice(bytes).map_err(|e| ManifestError::Parse(e.to_string()))?;
    m.validate()?;
    Ok(m)
}

fn is_sha256(s: &str) -> bool {
    s.len() == 64 && s.bytes().all(|b| b.is_ascii_hexdigit())
}

impl Manifest {
    pub fn validate(&self) -> Result<(), ManifestError> {
        let p = &self.payload;
        if self.version.is_empty() || self.version.len() > 32 || !self.version.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-') {
            return Err(ManifestError::Invalid("version"));
        }
        if self.arch != "x64" {
            return Err(ManifestError::Invalid("arch"));
        }
        if !is_sha256(&p.sha256) || !p.parts.iter().all(|h| is_sha256(h)) {
            return Err(ManifestError::Invalid("sha256"));
        }
        if p.size == 0 || p.part_size == 0 || p.size > 2 * 1024 * 1024 * 1024 {
            return Err(ManifestError::Invalid("size"));
        }
        if p.parts.len() as u64 != p.size.div_ceil(p.part_size) {
            return Err(ManifestError::Invalid("parts"));
        }
        if p.file.is_empty() || p.file.contains(['/', '\\', '?', '#']) || p.file.contains("..") {
            return Err(ManifestError::Invalid("file"));
        }
        if self.mirrors.iter().any(|m| !m.base.starts_with("https://") || !m.base.ends_with('/')) {
            return Err(ManifestError::Invalid("mirror"));
        }
        Ok(())
    }

    pub fn part_count(&self) -> usize {
        self.payload.parts.len()
    }

    /// Byte range `[start, end)` of part `i` inside the payload file.
    pub fn part_range(&self, i: usize) -> (u64, u64) {
        let start = i as u64 * self.payload.part_size;
        (start, (start + self.payload.part_size).min(self.payload.size))
    }

    pub fn payload_url(&self, mirror: &Mirror) -> String {
        format!("{}{}", mirror.base, self.payload.file)
    }

    /// Order in which the download tries the mirrors. `probe_ms[i]` is mirror i's probe round
    /// trip (None = no answer or not probed): answering mirrors fastest first, then the rest in
    /// manifest order, since a failed probe can be a blip and they are still worth a try when
    /// the chosen mirror breaks off mid-download.
    pub fn mirror_order(&self, probe_ms: &[Option<u32>]) -> Vec<usize> {
        let n = self.mirrors.len();
        let ms = |i: usize| probe_ms.get(i).copied().flatten();
        let mut answered: Vec<usize> = (0..n).filter(|i| ms(*i).is_some()).collect();
        answered.sort_by_key(|i| (ms(*i).unwrap_or(u32::MAX), *i));
        answered.extend((0..n).filter(|i| ms(*i).is_none()));
        answered
    }

    pub fn note_texts(&self, lang: &str) -> Vec<String> {
        self.notes
            .iter()
            .filter_map(|n| n.get(lang).or_else(|| n.get("en")).cloned())
            .collect()
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    /// Test key and a manifest signed with it by tools/sign_manifest.py (fixtures/).
    pub const TEST_PUBKEY: &str = include_str!("../tests/fixtures/test.pub");
    pub const TEST_MANIFEST: &[u8] = include_bytes!("../tests/fixtures/manifest.json");
    pub const TEST_SIG: &str = include_str!("../tests/fixtures/manifest.json.minisig");

    #[test]
    fn signed_manifest_verifies() {
        let m = verify_and_parse(TEST_MANIFEST, TEST_SIG, Some(TEST_PUBKEY), false).unwrap();
        assert_eq!(m.version, "4.0.0");
        assert_eq!(m.part_count(), m.payload.parts.len());
        let (s, e) = m.part_range(m.part_count() - 1);
        assert_eq!(e, m.payload.size);
        assert!(s < e);
        assert_eq!(m.mirrors[0].label_for("tr"), "İstanbul");
        assert_eq!(m.mirrors[0].label_for("pt-BR"), "Istanbul");
        assert_eq!(m.mirrors[0].host(), "cdn-ist.descall.com");
    }

    #[test]
    fn tampered_manifest_is_rejected() {
        let mut bad = TEST_MANIFEST.to_vec();
        let pos = bad.iter().position(|b| *b == b'4').unwrap();
        bad[pos] = b'5';
        assert!(matches!(verify_and_parse(&bad, TEST_SIG, Some(TEST_PUBKEY), false), Err(ManifestError::BadSignature(_))));
    }

    #[test]
    fn unsigned_needs_explicit_permission() {
        assert_eq!(verify_and_parse(TEST_MANIFEST, "", None, false), Err(ManifestError::NoKey));
        assert!(verify_and_parse(TEST_MANIFEST, "", None, true).is_ok());
    }

    #[test]
    fn validation_catches_bad_parts_and_mirrors() {
        let mut m: Manifest = serde_json::from_slice(TEST_MANIFEST).unwrap();
        m.payload.parts.pop();
        assert_eq!(m.validate(), Err(ManifestError::Invalid("parts")));
        let mut m: Manifest = serde_json::from_slice(TEST_MANIFEST).unwrap();
        m.mirrors[0].base = "http://cdn.descall.com/x/".into();
        assert_eq!(m.validate(), Err(ManifestError::Invalid("mirror")));
        let mut m: Manifest = serde_json::from_slice(TEST_MANIFEST).unwrap();
        m.payload.file = "..\\evil.zip".into();
        assert_eq!(m.validate(), Err(ManifestError::Invalid("file")));
    }

    #[test]
    fn mirror_order_tries_every_mirror_fastest_first() {
        let mut m: Manifest = serde_json::from_slice(TEST_MANIFEST).unwrap();
        let base = m.mirrors[0].clone();
        m.mirrors = (0..5).map(|i| Mirror { base: format!("https://m{i}.example/"), ..base.clone() }).collect();
        assert_eq!(m.mirror_order(&[Some(80), None, Some(20), Some(80)]), vec![2, 0, 3, 1, 4]);
        assert_eq!(m.mirror_order(&[]), vec![0, 1, 2, 3, 4], "no probe answered: manifest order, none dropped");
        m.mirrors.truncate(1);
        assert_eq!(m.mirror_order(&[None]), vec![0]);
    }

    #[test]
    fn host_parsing() {
        assert_eq!(host_of("https://a.b.c:8443/x"), "a.b.c");
        assert_eq!(host_of("https://cdn.descall.com/"), "cdn.descall.com");
    }
}
