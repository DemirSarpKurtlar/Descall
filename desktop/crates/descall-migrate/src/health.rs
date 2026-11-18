//! The "ready" signal between the new app and the migrator.
//!
//! Contract for the Tauri app (first start with `--migrated`):
//! 1. As soon as the process runs, write `stage: "started"` (the migrator then extends its
//!    wait to the full timeout and watches the pid).
//! 2. After the first paint, `GET /api/auth/me` 200 (or `signedOut: true` when the handoff
//!    carried no session) and the handoff import, write `stage: "ready"`.
//! 3. On a fatal start error, write `stage: "failed"` with `error` (rollback starts at once).
//!
//! The file is `%APPDATA%\com.descall.app\migration\health.json`, written atomically with
//! [`write`]. It must carry the migration id of the job, so a stale file from an earlier
//! attempt never counts.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

use crate::paths;

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HealthReport {
    pub migration_id: String,
    /// "started" | "ready" | "failed"
    pub stage: String,
    #[serde(default)]
    pub pid: u32,
    #[serde(default)]
    pub version: String,
    #[serde(default)]
    pub first_paint: bool,
    #[serde(default)]
    pub auth_ok: bool,
    /// No session in the handoff: ready without /api/auth/me.
    #[serde(default)]
    pub signed_out: bool,
    #[serde(default)]
    pub handoff_imported: bool,
    #[serde(default)]
    pub at_unix: u64,
    #[serde(default)]
    pub error: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Verdict {
    /// No file yet, or a file from another attempt.
    Pending,
    /// The new process is up; `pid` lets the migrator notice a crash early.
    Started {
        pid: u32,
    },
    Ready,
    Failed(String),
}

pub fn health_path(appdata: &Path) -> PathBuf {
    appdata.join(paths::NEW_APP_ID).join("migration").join("health.json")
}

/// Judge the bytes of health.json for `migration_id`. Files written before `launched_at`
/// (minus a little clock slack) are ignored.
pub fn evaluate(bytes: Option<&[u8]>, migration_id: &str, launched_at_unix: u64) -> Verdict {
    let Some(bytes) = bytes else { return Verdict::Pending };
    let Ok(r) = serde_json::from_slice::<HealthReport>(bytes) else { return Verdict::Pending };
    if r.migration_id != migration_id {
        return Verdict::Pending;
    }
    if r.at_unix != 0 && r.at_unix + 5 < launched_at_unix {
        return Verdict::Pending;
    }
    match r.stage.as_str() {
        "ready" => {
            let signed_in = r.auth_ok || r.signed_out;
            if r.first_paint && signed_in && r.handoff_imported {
                Verdict::Ready
            } else {
                Verdict::Failed("ready_incomplete".into())
            }
        }
        "failed" => Verdict::Failed(r.error.unwrap_or_else(|| "app_failed".into()).chars().take(80).collect()),
        "started" => Verdict::Started { pid: r.pid },
        _ => Verdict::Pending,
    }
}

/// For the new app: write the report atomically.
pub fn write(appdata: &Path, report: &HealthReport) -> std::io::Result<()> {
    let bytes = serde_json::to_vec(report).map_err(std::io::Error::other)?;
    crate::write_atomic(&health_path(appdata), &bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rep(stage: &str) -> HealthReport {
        HealthReport {
            migration_id: "mig-1234-x".into(),
            stage: stage.into(),
            pid: 42,
            first_paint: true,
            auth_ok: true,
            handoff_imported: true,
            at_unix: 1000,
            ..Default::default()
        }
    }
    fn b(r: &HealthReport) -> Vec<u8> {
        serde_json::to_vec(r).unwrap()
    }

    #[test]
    fn verdicts() {
        assert_eq!(evaluate(None, "mig-1234-x", 1000), Verdict::Pending);
        assert_eq!(evaluate(Some(b"{not json"), "mig-1234-x", 1000), Verdict::Pending);
        assert_eq!(evaluate(Some(&b(&rep("ready"))), "mig-1234-x", 1000), Verdict::Ready);
        assert_eq!(evaluate(Some(&b(&rep("ready"))), "other-attempt", 1000), Verdict::Pending);
        assert_eq!(evaluate(Some(&b(&rep("ready"))), "mig-1234-x", 2000), Verdict::Pending, "stale file");
        assert_eq!(evaluate(Some(&b(&rep("started"))), "mig-1234-x", 1000), Verdict::Started { pid: 42 });
        let mut r = rep("ready");
        r.auth_ok = false;
        assert_eq!(evaluate(Some(&b(&r)), "mig-1234-x", 1000), Verdict::Failed("ready_incomplete".into()));
        r.signed_out = true;
        assert_eq!(evaluate(Some(&b(&r)), "mig-1234-x", 1000), Verdict::Ready);
        let mut f = rep("failed");
        f.error = Some("webview2_missing".into());
        assert_eq!(evaluate(Some(&b(&f)), "mig-1234-x", 1000), Verdict::Failed("webview2_missing".into()));
    }

    #[test]
    fn write_then_read() {
        let d = tempfile::tempdir().unwrap();
        write(d.path(), &rep("ready")).unwrap();
        let bytes = std::fs::read(health_path(d.path())).unwrap();
        assert_eq!(evaluate(Some(&bytes), "mig-1234-x", 999), Verdict::Ready);
    }
}
