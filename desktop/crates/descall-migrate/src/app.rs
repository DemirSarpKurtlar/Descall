//! The new app's half of the migrator contract, kept next to the migrator's half so both
//! are tested together on any host:
//! - the command line [`crate::runner`] starts the new app with, and how the app reads it;
//! - the [`crate::health`] reports the app writes (`started`, `ready`, `failed`);
//! - the import marker that makes the handoff import run once per migration;
//! - how the app's own `GET /api/auth/me` check maps to the `authOk` / failure codes.
//!
//! The Tauri app (desktop/app/src-tauri/src/migration.rs) only adds the I/O around these.

use serde::{Deserialize, Serialize};

use crate::health::HealthReport;

/// Set when the migrator started the app (first start after the move).
pub const MIGRATED_FLAG: &str = "--migrated";
/// Followed by the job's migration id (health.json must carry it).
pub const MIGRATION_ID_FLAG: &str = "--migration-id";
/// Electron was in the tray: the new app starts hidden too. The same flag as the login
/// auto-start (`--autostart --hidden`), so the app's cold-start rule already hides it.
pub const HIDDEN_FLAG: &str = "--hidden";

/// Arguments for `Descall.exe` after a successful setup.
pub fn launch_args(migration_id: &str, hidden: bool) -> Vec<String> {
    let mut args = vec![MIGRATED_FLAG.to_string(), MIGRATION_ID_FLAG.to_string(), migration_id.to_string()];
    if hidden {
        args.push(HIDDEN_FLAG.into());
    }
    args
}

/// The migration id when the app was started by the migrator (`argv[0]` is skipped).
/// None for a normal start, or when the id is missing or malformed.
pub fn migration_id_from_args<S: AsRef<str>>(argv: &[S]) -> Option<String> {
    let args: Vec<&str> = argv.iter().skip(1).map(|a| a.as_ref()).collect();
    if !args.contains(&MIGRATED_FLAG) {
        return None;
    }
    let value = args.iter().enumerate().find_map(|(i, a)| {
        if *a == MIGRATION_ID_FLAG {
            args.get(i + 1).copied()
        } else {
            a.strip_prefix("--migration-id=")
        }
    })?;
    crate::job::is_migration_id(value).then(|| value.to_string())
}

/// Who writes the report and when.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Reporter {
    pub migration_id: String,
    pub pid: u32,
    pub version: String,
}

impl Reporter {
    fn base(&self, stage: &str, now_unix: u64) -> HealthReport {
        HealthReport {
            migration_id: self.migration_id.clone(),
            stage: stage.into(),
            pid: self.pid,
            version: self.version.clone(),
            at_unix: now_unix,
            ..Default::default()
        }
    }

    /// As soon as the process runs (the migrator extends its wait and watches the pid).
    pub fn started(&self, now_unix: u64) -> HealthReport {
        self.base("started", now_unix)
    }

    /// The page mounted, the handoff was imported and the session works (`signed_out`:
    /// the handoff carried no session, so there was nothing to check).
    pub fn ready(&self, now_unix: u64, signed_out: bool) -> HealthReport {
        HealthReport { first_paint: true, handoff_imported: true, auth_ok: !signed_out, signed_out, ..self.base("ready", now_unix) }
    }

    /// A fatal start error: the migrator rolls back at once.
    pub fn failed(&self, now_unix: u64, code: &str) -> HealthReport {
        HealthReport { error: Some(code.chars().take(80).collect()), ..self.base("failed", now_unix) }
    }
}

/// `migration/imported` in the app's data folder: written after the one-time import.
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ImportMarker {
    /// Empty when the import ran on a normal start (manual install, OSCrypt fallback).
    #[serde(default)]
    pub migration_id: String,
    /// The handoff carried a session (main token or an extra account).
    #[serde(default)]
    pub has_session: bool,
    /// Secret-store key of the session to check (`auth-token` or `account-<id>`).
    #[serde(default)]
    pub session_key: Option<String>,
    #[serde(default)]
    pub at_unix: u64,
}

impl ImportMarker {
    /// Older markers were a bare `1`: they still mean "already imported".
    pub fn parse(bytes: &[u8]) -> ImportMarker {
        serde_json::from_slice(bytes).unwrap_or_default()
    }
}

/// Run the import? Once per app install, and again only for a migration the marker does
/// not record yet (a manual install that later gets migrated over must still take its
/// handoff, or the migrator would wait for a session that never arrives).
pub fn should_import(marker: Option<&[u8]>, migration_id: Option<&str>) -> bool {
    match (marker, migration_id) {
        (None, _) => true,
        (Some(_), None) => false,
        (Some(m), Some(id)) => ImportMarker::parse(m).migration_id != id,
    }
}

/// Outcome of the app's own `GET /api/auth/me` with the imported session.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AuthCheck {
    Ok,
    /// The server refused the token: the user would be signed out, so roll back.
    Rejected,
    /// No answer or a server error: try again until the migrator's timeout decides.
    Retry,
}

/// Same rule as frontend/src/lib/bootSessionCheck.js (401/403 sign out, the rest retries).
pub fn auth_check(status: u16) -> AuthCheck {
    match status {
        200..=299 => AuthCheck::Ok,
        401 | 403 => AuthCheck::Rejected,
        _ => AuthCheck::Retry,
    }
}

/// Failure codes the app writes into health.json (the migrator reports them as `app_<code>`).
pub mod codes {
    /// Started with `--migrated` but no handoff file was there.
    pub const HANDOFF_MISSING: &str = "handoff_missing";
    /// The handoff could not be unsealed, parsed or validated (expired, other migration).
    pub const HANDOFF_INVALID: &str = "handoff_invalid";
    /// `GET /api/auth/me` answered 401/403 for the imported session.
    pub const AUTH_REJECTED: &str = "auth_rejected";
    /// The app could not start (panic, WebView2 missing).
    pub const START_FAILED: &str = "start_failed";
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::health::{evaluate, Verdict};

    const ID: &str = "mig-1234-x";

    fn rep() -> Reporter {
        Reporter { migration_id: ID.into(), pid: 4242, version: "4.0.0".into() }
    }
    fn judge(r: &HealthReport, launched: u64) -> Verdict {
        evaluate(Some(&serde_json::to_vec(r).unwrap()), ID, launched)
    }

    #[test]
    fn launch_args_round_trip() {
        let exe = "C:\\Apps\\Descall\\Descall.exe".to_string();
        for hidden in [false, true] {
            let argv: Vec<String> = std::iter::once(exe.clone()).chain(launch_args(ID, hidden)).collect();
            assert_eq!(migration_id_from_args(&argv).as_deref(), Some(ID));
            assert_eq!(argv.iter().any(|a| a == HIDDEN_FLAG), hidden);
        }
        assert_eq!(migration_id_from_args(&[&exe, "--migrated", "--migration-id=mig-5678-y"]).as_deref(), Some("mig-5678-y"));
        // A normal start, a missing or hostile id, and an id without --migrated: no migration.
        assert_eq!(migration_id_from_args(&[&exe]), None);
        assert_eq!(migration_id_from_args(&[&exe, "-Embedding"]), None, "COM activation is a normal start");
        assert_eq!(migration_id_from_args(&[&exe, "--migrated"]), None);
        assert_eq!(migration_id_from_args(&[&exe, "--migrated", "--migration-id", "..\\x"]), None);
        assert_eq!(migration_id_from_args(&[&exe, "--migration-id", ID]), None);
        assert_eq!(migration_id_from_args(&["--migrated", "--migration-id", ID]), None, "argv[0] is the exe");
    }

    #[test]
    fn reports_are_what_the_runner_accepts() {
        assert_eq!(judge(&rep().started(1000), 1000), Verdict::Started { pid: 4242 });
        assert_eq!(judge(&rep().ready(1001, false), 1000), Verdict::Ready);
        assert_eq!(judge(&rep().ready(1001, true), 1000), Verdict::Ready, "signed out: no auth check needed");
        assert_eq!(judge(&rep().failed(1001, codes::AUTH_REJECTED), 1000), Verdict::Failed("auth_rejected".into()));
        // The JSON keys the runner reads (camelCase, shared struct).
        let v = serde_json::to_value(rep().ready(7, false)).unwrap();
        for k in ["migrationId", "stage", "pid", "version", "firstPaint", "authOk", "signedOut", "handoffImported", "atUnix"] {
            assert!(v.get(k).is_some(), "{k}");
        }
        assert_eq!(v["stage"], "ready");
    }

    #[test]
    fn import_runs_once_per_migration() {
        assert!(should_import(None, None));
        assert!(should_import(None, Some(ID)));
        assert!(!should_import(Some(b"1"), None), "legacy marker");
        let m = serde_json::to_vec(&ImportMarker { migration_id: ID.into(), has_session: true, session_key: Some("auth-token".into()), at_unix: 5 }).unwrap();
        assert!(!should_import(Some(&m), Some(ID)));
        assert!(!should_import(Some(&m), None));
        assert!(should_import(Some(&m), Some("mig-other-9")));
        assert!(should_import(Some(b"1"), Some(ID)), "a manual install migrated over later");
        assert_eq!(ImportMarker::parse(&m).session_key.as_deref(), Some("auth-token"));
    }

    #[test]
    fn auth_statuses() {
        assert_eq!(auth_check(200), AuthCheck::Ok);
        assert_eq!(auth_check(401), AuthCheck::Rejected);
        assert_eq!(auth_check(403), AuthCheck::Rejected);
        for s in [0, 404, 429, 500, 503] {
            assert_eq!(auth_check(s), AuthCheck::Retry, "{s}");
        }
    }
}
