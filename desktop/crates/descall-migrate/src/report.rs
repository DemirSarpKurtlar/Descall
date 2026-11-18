//! The outcome report for `POST /api/desktop/migration/report`.
//!
//! The migrator has no network code (smaller, nothing to proxy, nothing to leak). It
//! leaves `state.json`; the app that runs next sends [`outcome`]: the new app after a
//! success, the Electron bridge after a rollback or a skip. The field names and event
//! names are the server's whitelist (backend/lib/desktopMigration.js).

use serde::Serialize;

use crate::plan::Step;
use crate::state::MigrationState;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StepSummary {
    pub step: &'static str,
    pub ok: bool,
    pub ms: u64,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Outcome {
    pub install_id: String,
    pub migration_id: String,
    /// done | skipped | rollback_ok | needs_help | in_progress
    pub event: &'static str,
    /// Last step that failed (or the current one while in progress).
    pub step: Option<&'static str>,
    pub code: Option<String>,
    pub duration_ms: u64,
    pub strategy: Option<&'static str>,
    pub per_machine: bool,
    pub resumes: u32,
    pub steps: Vec<StepSummary>,
}

pub fn event_for(state: &MigrationState) -> &'static str {
    match state.step {
        Step::Done => "done",
        Step::NeedsHelp => "needs_help",
        Step::Skipped if state.history.iter().any(|h| h.step == Step::Rollback && h.ok) => "rollback_ok",
        Step::Skipped => "skipped",
        _ => "in_progress",
    }
}

pub fn outcome(state: &MigrationState) -> Outcome {
    let failed = state.history.iter().rev().find(|h| !h.ok).map(|h| h.step.as_str());
    Outcome {
        install_id: state.job.install_id.clone(),
        migration_id: state.job.id.clone(),
        event: event_for(state),
        step: if state.step.is_terminal() { failed } else { Some(state.step.as_str()) },
        code: state.failure.clone(),
        duration_ms: state.history.iter().map(|h| h.ms).sum(),
        strategy: state.layout.as_ref().map(|l| l.strategy.as_str()),
        per_machine: state.layout.as_ref().map(|l| l.per_machine).unwrap_or(state.job.per_machine_hint),
        resumes: state.resumes,
        steps: state.history.iter().take(40).map(|h| StepSummary { step: h.step.as_str(), ok: h.ok, ms: h.ms }).collect(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::StepRecord;

    #[test]
    fn events_follow_the_final_step() {
        let mut s = MigrationState::new(crate::job::tests::sample(), 1);
        assert_eq!(event_for(&s), "in_progress");
        s.history = vec![
            StepRecord { step: Step::Preflight, ok: true, ms: 10, code: None },
            StepRecord { step: Step::InstallNew, ok: false, ms: 2000, code: Some("setup_exit_2".into()) },
            StepRecord { step: Step::Rollback, ok: true, ms: 300, code: None },
        ];
        s.failure = Some("setup_exit_2".into());
        s.step = Step::Skipped;
        let o = outcome(&s);
        assert_eq!(o.event, "rollback_ok");
        assert_eq!(o.step, Some("install_new"));
        assert_eq!(o.code.as_deref(), Some("setup_exit_2"));
        assert_eq!(o.duration_ms, 2310);
        let v = serde_json::to_value(&o).unwrap();
        assert!(v.get("migrationId").is_some() && v.get("durationMs").is_some());
        s.history.truncate(1);
        assert_eq!(event_for(&s), "skipped");
        s.step = Step::Done;
        assert_eq!(event_for(&s), "done");
        s.step = Step::NeedsHelp;
        assert_eq!(event_for(&s), "needs_help");
    }
}
