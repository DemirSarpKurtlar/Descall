//! Registry values the migration may touch, snapshotted before anything changes and
//! restored on rollback. Pure data + the rules for rewriting them; the Windows reads and
//! writes are behind [`crate::sys::Sys`].

use base64::Engine;
use serde::{Deserialize, Serialize};
use std::path::Path;

use crate::paths;

pub const UNINSTALL: &str = r"Software\Microsoft\Windows\CurrentVersion\Uninstall";
pub const RUN: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
pub const RUN_ONCE: &str = r"Software\Microsoft\Windows\CurrentVersion\RunOnce";
pub const STARTUP_APPROVED_RUN: &str = r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run";
pub const GPU_PREFS: &str = r"Software\Microsoft\DirectX\UserGpuPreferences";
/// Electron app.setLoginItemSettings names the Run value after the AppUserModelID.
pub const RUN_VALUE: &str = "com.descall.app";
pub const RESUME_VALUE: &str = "DescallMigrationResume";
/// Toast activator CLSID (premium/toastIdentity.cjs and the Tauri NSIS hook use the same).
pub const TOAST_CLSID: &str = "{BCF5A315-F914-4A7E-95BD-313CBE4B661B}";

pub fn toast_server_key() -> String {
    format!(r"Software\Classes\CLSID\{TOAST_CLSID}\LocalServer32")
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Hive {
    Hkcu,
    Hklm,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", tag = "type", content = "value")]
pub enum RegData {
    Absent,
    Sz(String),
    ExpandSz(String),
    Dword(u32),
    /// base64 in JSON.
    Binary(#[serde(with = "b64")] Vec<u8>),
}

mod b64 {
    use base64::Engine;
    use serde::{Deserialize, Deserializer, Serializer};
    pub fn serialize<S: Serializer>(v: &[u8], s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&base64::engine::general_purpose::STANDARD.encode(v))
    }
    pub fn deserialize<'de, D: Deserializer<'de>>(d: D) -> Result<Vec<u8>, D::Error> {
        let s = String::deserialize(d)?;
        base64::engine::general_purpose::STANDARD.decode(s).map_err(serde::de::Error::custom)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RegValue {
    pub hive: Hive,
    pub key: String,
    /// "" = the key's default value.
    pub name: String,
    pub data: RegData,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct RegSnapshot {
    pub values: Vec<RegValue>,
    /// Subkeys of HKCU Uninstall before the new setup ran (to find what it added).
    pub uninstall_keys: Vec<String>,
}

impl RegSnapshot {
    pub fn get(&self, hive: Hive, key: &str, name: &str) -> Option<&RegData> {
        self.values.iter().find(|v| v.hive == hive && v.key.eq_ignore_ascii_case(key) && v.name.eq_ignore_ascii_case(name)).map(|v| &v.data)
    }
}

/// The values to snapshot. `electron_uninstall_key` is the full HKCU key path of
/// Electron's Uninstall entry (per-user installs only; HKLM needs elevation).
pub fn values_to_snapshot(old_exe: &Path, electron_uninstall_key: Option<&str>) -> Vec<(Hive, String, String)> {
    let mut v = vec![
        (Hive::Hkcu, RUN.to_string(), RUN_VALUE.to_string()),
        (Hive::Hkcu, STARTUP_APPROVED_RUN.to_string(), RUN_VALUE.to_string()),
        (Hive::Hkcu, toast_server_key(), String::new()),
        (Hive::Hkcu, GPU_PREFS.to_string(), old_exe.to_string_lossy().into_owned()),
    ];
    if let Some(k) = electron_uninstall_key {
        v.push((Hive::Hkcu, k.to_string(), "SystemComponent".to_string()));
    }
    v
}

/// Replace the exe path in a Run / LocalServer32 command, keeping its arguments.
/// `"C:\old\Descall.exe" --autostart --hidden` -> `"C:\new\Descall.exe" --autostart --hidden`.
/// None when the command does not start with `old_exe`.
pub fn rewrite_command(cmd: &str, old_exe: &Path, new_exe: &Path) -> Option<String> {
    let t = cmd.trim_start();
    let (exe, rest) = if let Some(stripped) = t.strip_prefix('"') {
        let end = stripped.find('"')?;
        (&stripped[..end], &stripped[end + 1..])
    } else {
        // Unquoted: the exe ends at ".exe" (any case). Searched in the original bytes: a
        // lowercased copy has other offsets once the path holds letters like "İ".
        let end = t.as_bytes().windows(4).position(|w| w.eq_ignore_ascii_case(b".exe"))? + 4;
        (&t[..end], &t[end..])
    };
    if !paths::same_path(Path::new(exe), old_exe) {
        return None;
    }
    Some(format!("\"{}\"{}", new_exe.display(), rest))
}

/// The desired value of each shell entry after the move (PatchShell). For in-place moves
/// the paths are equal and this only re-applies what the user had (the new setup may have
/// written its own defaults).
pub fn patched_values(snap: &RegSnapshot, old_exe: &Path, new_exe: &Path) -> Vec<RegValue> {
    let mut out = Vec::new();
    for v in &snap.values {
        let key = v.key.as_str();
        if key.eq_ignore_ascii_case(RUN) || key.eq_ignore_ascii_case(&toast_server_key()) {
            if let RegData::Sz(cmd) | RegData::ExpandSz(cmd) = &v.data {
                let new_cmd = rewrite_command(cmd, old_exe, new_exe).unwrap_or_else(|| cmd.clone());
                let data = if matches!(v.data, RegData::ExpandSz(_)) { RegData::ExpandSz(new_cmd) } else { RegData::Sz(new_cmd) };
                out.push(RegValue { data, ..v.clone() });
            }
        } else if key.eq_ignore_ascii_case(STARTUP_APPROVED_RUN) {
            // Task Manager on/off state: keep exactly.
            if v.data != RegData::Absent {
                out.push(v.clone());
            }
        } else if key.eq_ignore_ascii_case(GPU_PREFS) && v.data != RegData::Absent && !paths::same_path(old_exe, new_exe) {
            // The preference is keyed by exe path: copy it to the new path.
            out.push(RegValue { name: new_exe.to_string_lossy().into_owned(), ..v.clone() });
        }
    }
    out
}

/// Uninstall subkeys that exist now but not in the snapshot (added by the new setup).
pub fn added_keys(before: &[String], after: &[String]) -> Vec<String> {
    after.iter().filter(|a| !before.iter().any(|b| b.eq_ignore_ascii_case(a))).cloned().collect()
}

/// `StartupApproved\Run` data: first byte 0x02 = enabled, 0x03 = disabled by the user.
pub fn startup_disabled(data: &RegData) -> bool {
    matches!(data, RegData::Binary(b) if b.first() == Some(&0x03))
}

pub fn encode_b64(v: &[u8]) -> String {
    base64::engine::general_purpose::STANDARD.encode(v)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn rewrites_quoted_and_unquoted_commands() {
        let old = PathBuf::from(r"C:\Program Files\Descall\Descall.exe");
        let new = PathBuf::from(r"C:\Users\D\AppData\Local\Programs\Descall\Descall.exe");
        assert_eq!(
            rewrite_command(r#""C:\Program Files\Descall\Descall.exe" --autostart --hidden"#, &old, &new).as_deref(),
            Some(r#""C:\Users\D\AppData\Local\Programs\Descall\Descall.exe" --autostart --hidden"#)
        );
        assert_eq!(
            rewrite_command(r"c:\program files\descall\DESCALL.EXE --autostart", &old, &new).as_deref(),
            Some(r#""C:\Users\D\AppData\Local\Programs\Descall\Descall.exe" --autostart"#)
        );
        assert_eq!(rewrite_command(r#""C:\Other\Descall.exe""#, &old, &new), None);
        assert_eq!(rewrite_command(r#""unterminated"#, &old, &new), None);
    }

    /// Unquoted commands under a profile with non-ASCII letters (Turkish user names): the
    /// ".exe" end was found in a lowercased copy, whose byte offsets differ from the original
    /// ("İ" is 2 bytes, its lowercase 3), so the exe was cut in the wrong place (not
    /// rewritten, or a panic on a char boundary that aborted the migrator).
    #[test]
    fn rewrites_unquoted_commands_with_non_ascii_paths() {
        let new = PathBuf::from(r"C:\Users\D\AppData\Local\Programs\Descall\Descall.exe");
        let old = PathBuf::from(r"C:\Users\İsmail\AppData\Local\Programs\Descall\Descall.exe");
        assert_eq!(
            rewrite_command(r"C:\Users\İsmail\AppData\Local\Programs\Descall\Descall.exe --autostart", &old, &new).as_deref(),
            Some(r#""C:\Users\D\AppData\Local\Programs\Descall\Descall.exe" --autostart"#)
        );
        let old = PathBuf::from(r"C:\Users\İİ\Descall.exe");
        assert_eq!(rewrite_command(r"C:\Users\İİ\Descall.exe -x", &old, &new).as_deref(), Some(r#""C:\Users\D\AppData\Local\Programs\Descall\Descall.exe" -x"#));
        // No ".exe" at all, or only inside a multi-byte name: never a panic.
        assert_eq!(rewrite_command("C:\\İİİ\\Descall --x", &old, &new), None);
    }

    #[test]
    fn patch_keeps_task_manager_state_and_moves_gpu_preference() {
        let old = PathBuf::from(r"C:\Program Files\Descall\Descall.exe");
        let new = PathBuf::from(r"C:\L\Programs\Descall\Descall.exe");
        let snap = RegSnapshot {
            values: vec![
                RegValue {
                    hive: Hive::Hkcu,
                    key: RUN.into(),
                    name: RUN_VALUE.into(),
                    data: RegData::Sz(format!("\"{}\" --autostart --hidden", old.display())),
                },
                RegValue {
                    hive: Hive::Hkcu,
                    key: STARTUP_APPROVED_RUN.into(),
                    name: RUN_VALUE.into(),
                    data: RegData::Binary(vec![3, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8]),
                },
                RegValue { hive: Hive::Hkcu, key: GPU_PREFS.into(), name: old.to_string_lossy().into(), data: RegData::Sz("GpuPreference=2;".into()) },
                RegValue { hive: Hive::Hkcu, key: toast_server_key(), name: String::new(), data: RegData::Absent },
            ],
            uninstall_keys: vec![],
        };
        let out = patched_values(&snap, &old, &new);
        assert_eq!(out.len(), 3);
        assert_eq!(out[0].data, RegData::Sz(format!("\"{}\" --autostart --hidden", new.display())));
        assert!(startup_disabled(&out[1].data));
        assert_eq!(out[2].name, new.to_string_lossy());
        // JSON round trip keeps binary data.
        let back: RegSnapshot = serde_json::from_str(&serde_json::to_string(&snap).unwrap()).unwrap();
        assert_eq!(back, snap);
        // In place: GPU preference is left alone (same key).
        assert_eq!(patched_values(&snap, &old, &old).len(), 2);
    }

    #[test]
    fn finds_keys_the_setup_added() {
        let before = vec!["{8E7A-GUID}".to_string(), "Steam".to_string()];
        let after = vec!["{8e7a-guid}".to_string(), "Steam".to_string(), "Descall".to_string()];
        assert_eq!(added_keys(&before, &after), vec!["Descall".to_string()]);
        let snap_values = values_to_snapshot(Path::new(r"C:\x\Descall.exe"), Some(r"Software\...\Uninstall\{G}"));
        assert_eq!(snap_values.len(), 5);
    }
}
