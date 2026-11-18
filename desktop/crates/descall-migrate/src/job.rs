//! The non-secret part of what the Electron bridge hands over: which setup to run (path,
//! size and SHA-256 from the Ed25519-signed server plan), the arguments it takes, where
//! the running Electron lives and how it was shown. The migrator re-hashes the setup
//! right before it runs it, so a file swapped after the bridge's download check is refused.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

use crate::paths;
use crate::MigrateError;

pub const DEFAULT_HEALTH_TIMEOUT_SECS: u64 = 180;
pub const MAX_HEALTH_TIMEOUT_SECS: u64 = 900;
pub const MAX_SETUP_BYTES: u64 = 512 * 1024 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SetupSpec {
    pub path: PathBuf,
    pub sha256: String,
    pub size: u64,
    #[serde(default)]
    pub version: String,
    /// Argument template; `{dir}` is the target folder. NSIS default: `/S /D={dir}`.
    #[serde(default = "default_args")]
    pub args: Vec<String>,
}

pub fn default_args() -> Vec<String> {
    vec!["/S".into(), "/D={dir}".into()]
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MigrationJob {
    /// From the signed plan; also written into the handoff and expected in health.json.
    pub id: String,
    pub install_id: String,
    pub created_at_unix: u64,
    pub setup: SetupSpec,
    /// `app.getPath('exe')` of the running Electron.
    pub electron_exe: PathBuf,
    #[serde(default)]
    pub electron_version: String,
    /// Electron was hidden in the tray: start the new app hidden as well.
    #[serde(default)]
    pub launch_hidden: bool,
    /// The bridge's own guess (Program Files path); the registry decides when it can.
    #[serde(default)]
    pub per_machine_hint: bool,
    #[serde(default)]
    pub health_timeout_secs: Option<u64>,
    /// Signed-plan field: lowest Windows build the new app supports.
    #[serde(default)]
    pub min_win_build: Option<u32>,
}

fn bad(msg: impl Into<String>) -> MigrateError {
    MigrateError::Job(msg.into())
}

pub fn is_migration_id(s: &str) -> bool {
    (8..=64).contains(&s.len()) && s.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

pub fn is_sha256_hex(s: &str) -> bool {
    s.len() == 64 && s.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

impl MigrationJob {
    pub fn validate(&self) -> crate::Result<()> {
        if !is_migration_id(&self.id) {
            return Err(bad("bad migration id"));
        }
        if self.install_id.len() > 128 || !self.install_id.bytes().all(|b| b.is_ascii_graphic()) {
            return Err(bad("bad install id"));
        }
        if !is_sha256_hex(&self.setup.sha256) {
            return Err(bad("setup sha256 must be 64 lower-case hex characters"));
        }
        if self.setup.size == 0 || self.setup.size > MAX_SETUP_BYTES {
            return Err(bad("bad setup size"));
        }
        let setup_name = paths::norm(&self.setup.path);
        if !setup_name.ends_with(".exe") || !Path::new(&self.setup.path).is_absolute() && !looks_absolute_windows(&self.setup.path) {
            return Err(bad("setup must be an absolute .exe path"));
        }
        crate::setup_cmd::validate_template(&self.setup.args)?;
        if !paths::file_name_is(&self.electron_exe, paths::APP_EXE) {
            return Err(bad("electron exe must be Descall.exe"));
        }
        if !Path::new(&self.electron_exe).is_absolute() && !looks_absolute_windows(&self.electron_exe) {
            return Err(bad("electron exe must be absolute"));
        }
        if let Some(t) = self.health_timeout_secs {
            if !(30..=MAX_HEALTH_TIMEOUT_SECS).contains(&t) {
                return Err(bad("bad health timeout"));
            }
        }
        Ok(())
    }

    pub fn health_timeout_secs(&self) -> u64 {
        self.health_timeout_secs.unwrap_or(DEFAULT_HEALTH_TIMEOUT_SECS)
    }

    /// Folder that holds the running Electron (`dirname(app.getPath('exe'))`).
    pub fn electron_dir(&self) -> PathBuf {
        // Split on both separators so a Windows path behaves the same on every host.
        let s = self.electron_exe.to_string_lossy();
        match s.rfind(['\\', '/']) {
            Some(i) => PathBuf::from(&s[..i]),
            None => PathBuf::new(),
        }
    }
}

/// `C:\...` or `\\server\share\...` (so the checks hold when the tests run on Linux).
fn looks_absolute_windows(p: &Path) -> bool {
    let s = p.to_string_lossy();
    let b = s.as_bytes();
    (b.len() > 2 && b[0].is_ascii_alphabetic() && b[1] == b':' && (b[2] == b'\\' || b[2] == b'/')) || s.starts_with("\\\\")
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    pub fn sample() -> MigrationJob {
        MigrationJob {
            id: "mig-0001-abcd".into(),
            install_id: "3f2c9a1e-1111-4222-8333-444455556666".into(),
            created_at_unix: 1_000_000,
            setup: SetupSpec {
                path: PathBuf::from(r"C:\Users\Demir\AppData\Local\Descall-Migration\Descall-Setup-4.0.0.exe"),
                sha256: "a".repeat(64),
                size: 10_000_000,
                version: "4.0.0".into(),
                args: default_args(),
            },
            electron_exe: PathBuf::from(r"C:\Users\Demir\AppData\Local\Programs\Descall\Descall.exe"),
            electron_version: "3.10.0".into(),
            launch_hidden: false,
            per_machine_hint: false,
            health_timeout_secs: None,
            min_win_build: Some(19041),
        }
    }

    #[test]
    fn accepts_a_good_job_and_rejects_bad_fields() {
        sample().validate().unwrap();
        assert_eq!(sample().electron_dir().to_string_lossy().replace('\\', "/").rsplit('/').next(), Some("Descall"));
        type Mutation = Box<dyn Fn(&mut MigrationJob)>;
        let cases: Vec<Mutation> = vec![
            Box::new(|j| j.id = "short".into()),
            Box::new(|j| j.id = "has space in it".into()),
            Box::new(|j| j.setup.sha256 = "A".repeat(64)),
            Box::new(|j| j.setup.sha256 = "a".repeat(63)),
            Box::new(|j| j.setup.size = 0),
            Box::new(|j| j.setup.path = PathBuf::from("Descall-Setup.exe")),
            Box::new(|j| j.setup.path = PathBuf::from(r"C:\x\setup.msi")),
            Box::new(|j| j.setup.args = vec!["/S".into(), "\"quoted\"".into()]),
            Box::new(|j| j.electron_exe = PathBuf::from(r"C:\x\Other.exe")),
            Box::new(|j| j.health_timeout_secs = Some(5)),
        ];
        for (i, mutate) in cases.iter().enumerate() {
            let mut j = sample();
            mutate(&mut j);
            assert!(j.validate().is_err(), "case {i}");
        }
    }

    #[test]
    fn defaults_fill_in_from_minimal_json() {
        let j: MigrationJob = serde_json::from_value(serde_json::json!({
            "id": "mig-0001-abcd", "installId": "i", "createdAtUnix": 1,
            "setup": { "path": r"C:\s\Setup.exe", "sha256": "b".repeat(64), "size": 5 },
            "electronExe": r"C:\p\Descall\Descall.exe"
        }))
        .unwrap();
        assert_eq!(j.setup.args, default_args());
        assert_eq!(j.health_timeout_secs(), DEFAULT_HEALTH_TIMEOUT_SECS);
        j.validate().unwrap();
    }
}
