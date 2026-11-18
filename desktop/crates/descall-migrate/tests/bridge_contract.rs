//! The JSON the Electron bridge pipes to `--receive-handoff` (frontend/electron/
//! migrationBridge.cjs). migrationBridge.selftest.mjs checks that the bridge produces
//! exactly the keys of this fixture; here we check that the crate accepts it.

use descall_migrate::handoff::{Envelope, Secret};

#[test]
fn the_bridge_envelope_parses_and_validates() {
    let raw = include_str!("fixtures/bridge-envelope.json");
    let env: Envelope = serde_json::from_str(raw).expect("envelope parses");
    env.job.validate().expect("job valid");
    env.handoff.validate(1_800_000_100).expect("handoff valid");
    assert_eq!(env.handoff.migration_id, env.job.id);
    assert!(env.job.launch_hidden);
    assert_eq!(env.job.min_win_build, Some(19041));
    assert_eq!(env.handoff.accounts[0].token, Secret("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIwMDAwMDAwMCJ9.c2lnbmF0dXJl".into()));
    assert!(env.handoff.window_state.as_ref().unwrap().maximized);
    assert!(env.handoff.autostart.enabled);
    assert_eq!(env.handoff.premium_files.len(), 2);
    let lock = env.handoff.app_lock_record.as_ref().expect("Descall+ app-lock record carried");
    assert!(descall_migrate::handoff::is_app_lock_record(&lock.0));
    assert!(env.handoff.extra.is_empty(), "no field fell through to `extra`: {:?}", env.handoff.extra.keys().collect::<Vec<_>>());
}
