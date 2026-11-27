//! JSON settings store for the Descall+ desktop features (port of electron/premium/store.cjs):
//! `<app data>/premium-settings.json`, dotted paths, shallow per-feature patches. Writes go to a
//! temp file and are renamed into place; a corrupt file is moved aside and the store starts
//! empty. Plus the small per-feature JSON files of compat.cjs (`<app data>/premium/<name>.json`).

use std::fs;
use std::path::{Path, PathBuf};

use serde_json::{Map, Value};

pub const MAX_BYTES: usize = 512 * 1024;

fn bad_segment(s: &str) -> bool {
    matches!(s, "__proto__" | "prototype" | "constructor")
}

pub fn split_path(p: &str) -> Result<Vec<&str>, String> {
    let parts: Vec<&str> = p.split('.').filter(|s| !s.is_empty()).collect();
    if parts.is_empty() || parts.iter().any(|s| bad_segment(s)) {
        return Err(format!("bad store path: {p}"));
    }
    Ok(parts)
}

#[derive(Debug)]
pub struct Store {
    file: Option<PathBuf>,
    data: Map<String, Value>,
    dirty: bool,
}

impl Store {
    /// In-memory store (tests, or when the data dir is unknown).
    pub fn memory() -> Self {
        Self { file: None, data: Map::new(), dirty: false }
    }

    pub fn open(file: &Path) -> Self {
        let mut data = Map::new();
        if let Ok(raw) = fs::read_to_string(file) {
            match serde_json::from_str::<Value>(&raw) {
                Ok(Value::Object(m)) => data = m,
                _ => {
                    let ms = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
                    let mut aside = file.as_os_str().to_owned();
                    aside.push(format!(".corrupt-{ms}"));
                    let _ = fs::rename(file, PathBuf::from(aside));
                }
            }
        }
        Self { file: Some(file.to_path_buf()), data, dirty: false }
    }

    pub fn get(&self, p: &str) -> Option<Value> {
        let parts = split_path(p).ok()?;
        let mut node = self.data.get(parts[0])?;
        for part in &parts[1..] {
            node = node.as_object()?.get(*part)?;
        }
        Some(node.clone())
    }

    pub fn get_or(&self, p: &str, fallback: Value) -> Value {
        self.get(p).unwrap_or(fallback)
    }

    pub fn get_bool(&self, p: &str, fallback: bool) -> bool {
        self.get(p).and_then(|v| v.as_bool()).unwrap_or(fallback)
    }

    /// Dotted write; `Value::Null` deletes. Marks the store dirty (the host flushes it).
    pub fn set(&mut self, p: &str, value: Value) -> Result<(), String> {
        let parts = split_path(p)?;
        let (last, parents) = parts.split_last().ok_or("empty path")?;
        let mut node = &mut self.data;
        for part in parents {
            let entry = node.entry(part.to_string()).or_insert_with(|| Value::Object(Map::new()));
            if !entry.is_object() {
                *entry = Value::Object(Map::new());
            }
            node = entry.as_object_mut().expect("object");
        }
        if value.is_null() {
            node.remove(*last);
        } else {
            node.insert(last.to_string(), value);
        }
        self.dirty = true;
        Ok(())
    }

    /// Settings object of one feature ({} when unset).
    pub fn feature(&self, key: &str) -> Map<String, Value> {
        match self.get(&format!("features.{key}")) {
            Some(Value::Object(m)) => m,
            _ => Map::new(),
        }
    }

    /// Shallow merge into one feature's settings; null / missing values delete.
    pub fn patch_feature(&mut self, key: &str, patch: &Value) -> Map<String, Value> {
        let Some(patch) = patch.as_object() else { return self.feature(key) };
        let mut next = self.feature(key);
        for (k, v) in patch {
            if bad_segment(k) {
                continue;
            }
            if v.is_null() {
                next.remove(k);
            } else {
                next.insert(k.clone(), v.clone());
            }
        }
        let _ = self.set(&format!("features.{key}"), Value::Object(next.clone()));
        next
    }

    pub fn all(&self) -> Value {
        Value::Object(self.data.clone())
    }

    pub fn is_dirty(&self) -> bool {
        self.dirty
    }

    /// Write now (temp file + rename).
    pub fn flush(&mut self) -> bool {
        let Some(file) = self.file.clone() else {
            self.dirty = false;
            return true;
        };
        let Ok(text) = serde_json::to_string_pretty(&self.data) else { return false };
        if text.len() > MAX_BYTES {
            return false;
        }
        if let Some(dir) = file.parent() {
            let _ = fs::create_dir_all(dir);
        }
        // Flushed temp file + rename, retried while Windows refuses the rename (the file open
        // in a scanner); a failed rename used to keep the change only in memory until the next
        // flush, and quitting first lost it (descall_shell::durable).
        if !descall_shell::durable::replace(&file, text.as_bytes()) {
            return false;
        }
        self.dirty = false;
        true
    }
}

/// compat.cjs `c.store(name)`: one JSON file per feature under `<app data>/premium/`.
pub fn json_file(dir: &Path, name: &str) -> PathBuf {
    let clean: String = name.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '-').collect();
    dir.join(format!("{clean}.json"))
}

pub fn read_json(dir: &Path, name: &str) -> Option<Value> {
    serde_json::from_str(&fs::read_to_string(json_file(dir, name)).ok()?).ok()
}

pub fn write_json(dir: &Path, name: &str, value: &Value) -> bool {
    let _ = fs::create_dir_all(dir);
    fs::write(json_file(dir, name), value.to_string()).is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn get_set_patch_persist_and_recover() {
        let dir = std::env::temp_dir().join(format!("descall-premium-store-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let file = dir.join("premium-settings.json");
        let mut s = Store::open(&file);
        assert!(s.feature("mini_mode").is_empty());
        s.patch_feature("mini_mode", &json!({"enabled": true, "opacity": 0.9}));
        s.patch_feature("mini_mode", &json!({"opacity": null, "autoOnMinimize": true}));
        assert_eq!(Value::Object(s.feature("mini_mode")), json!({"enabled": true, "autoOnMinimize": true}));
        s.set("windows.main", json!({"x": 1, "y": 2, "width": 3, "height": 4})).unwrap();
        assert_eq!(s.get("windows.main.width"), Some(json!(3)));
        assert_eq!(s.get_or("missing.path", json!("dflt")), json!("dflt"));
        assert!(s.set("__proto__.x", json!(1)).is_err());
        assert!(s.is_dirty());
        assert!(s.flush());
        assert!(!s.is_dirty());
        let again = Store::open(&file);
        assert_eq!(Value::Object(again.feature("mini_mode")), json!({"enabled": true, "autoOnMinimize": true}));

        fs::write(&file, "{ not json").unwrap();
        let recovered = Store::open(&file);
        assert_eq!(recovered.all(), json!({}));
        assert!(fs::read_dir(&dir).unwrap().any(|e| e.unwrap().file_name().to_string_lossy().contains(".corrupt-")));

        assert!(write_json(&dir.join("premium"), "custom_layouts", &json!({"layouts": []})));
        assert_eq!(read_json(&dir.join("premium"), "custom_layouts"), Some(json!({"layouts": []})));
        assert_eq!(json_file(&dir, "../x y").file_name().unwrap(), "xy.json");
        let _ = fs::remove_dir_all(&dir);
    }
}
