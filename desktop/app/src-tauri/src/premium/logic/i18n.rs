//! Shell-side text of the Descall+ features (tray entries, taskbar tooltip, window titles,
//! launcher strings, the quick-reply placeholder): the `premium` subtree of
//! frontend/electron/i18n/<id>.json, embedded. et(key) falls back to English, then the key.

use std::sync::OnceLock;

use serde_json::Value;

const CATALOG: &str = include_str!("i18n.json");
pub const LOCALES: &[&str] = &["en", "tr", "de", "es", "fr", "pt-BR", "ru"];

fn catalog() -> &'static Value {
    static C: OnceLock<Value> = OnceLock::new();
    C.get_or_init(|| serde_json::from_str(CATALOG).unwrap_or(Value::Null))
}

/// Registered locale id for "tr-TR", "pt_BR", "de-AT" ..., or None.
pub fn match_locale(value: &str) -> Option<&'static str> {
    let raw = value.trim().replace('_', "-").to_lowercase();
    if raw.is_empty() {
        return None;
    }
    if let Some(id) = LOCALES.iter().find(|l| l.to_lowercase() == raw) {
        return Some(id);
    }
    let base = raw.split('-').next().unwrap_or("");
    LOCALES.iter().copied().find(|l| l.to_lowercase().split('-').next() == Some(base))
}

fn lookup<'a>(data: &'a Value, key: &str) -> Option<&'a str> {
    let mut node = data;
    for part in key.split('.') {
        node = node.get(part)?;
    }
    node.as_str()
}

/// `key` without the "premium." prefix, e.g. "tray.mute". Vars replace `{name}`.
pub fn et(locale: &str, key: &str, vars: &[(&str, &str)]) -> String {
    let key = key.strip_prefix("premium.").unwrap_or(key);
    let loc = match_locale(locale).unwrap_or("en");
    let text = lookup(&catalog()[loc], key).or_else(|| lookup(&catalog()["en"], key)).unwrap_or(key);
    let mut out = text.to_string();
    for (name, v) in vars {
        out = out.replace(&format!("{{{name}}}"), v);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lookup_and_fallback() {
        assert_eq!(match_locale("tr-TR"), Some("tr"));
        assert_eq!(match_locale("pt_br"), Some("pt-BR"));
        assert_eq!(match_locale("pt"), Some("pt-BR"));
        assert_eq!(match_locale("xx"), None);
        assert_eq!(et("en", "tray.mute", &[]), "Mute");
        assert_eq!(et("tr", "premium.tray.mute", &[]), "Sessize al");
        assert_eq!(et("en", "tray.inCall", &[("title", "Ada")]), "In a call: Ada");
        assert_eq!(et("xx", "taskbar.unread", &[("n", "3")]), "3 unread");
        assert_eq!(et("en", "tray.missing", &[]), "tray.missing");
        for loc in LOCALES {
            assert!(!et(loc, "launcher.placeholder", &[]).contains("launcher."), "{loc}");
        }
    }
}
