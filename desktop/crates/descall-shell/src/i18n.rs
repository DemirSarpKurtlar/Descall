//! Shell text (tray, dialogs, notification capsules, voice overlay, window titles).
//! Port of electron/mainI18n.cjs. The catalogs are the Electron ones
//! (frontend/electron/i18n/<id>.json) and the locale list is frontend/src/i18n/locales.json,
//! compiled in, so the two desktop shells can never drift apart.
//!
//! Active language: the UI language the page reports (`electronAPI.setLocale`), saved for
//! the next start; else the OS languages (a Turkish device or the Istanbul time zone keeps
//! Turkish, a draft locale falls back to English). `et` falls back to English, then the key.

use serde_json::Value;
use std::sync::OnceLock;

pub const REGISTRY_JSON: &str = include_str!("../../../../frontend/src/i18n/locales.json");
pub const CATALOGS: [(&str, &str); 7] = [
    ("en", include_str!("../../../../frontend/electron/i18n/en.json")),
    ("tr", include_str!("../../../../frontend/electron/i18n/tr.json")),
    ("de", include_str!("../../../../frontend/electron/i18n/de.json")),
    ("es", include_str!("../../../../frontend/electron/i18n/es.json")),
    ("fr", include_str!("../../../../frontend/electron/i18n/fr.json")),
    ("pt-BR", include_str!("../../../../frontend/electron/i18n/pt-BR.json")),
    ("ru", include_str!("../../../../frontend/electron/i18n/ru.json")),
];

#[derive(Debug, Clone)]
pub struct Locale {
    pub id: String,
    pub live: bool,
}

struct Registry {
    fallback: String,
    locales: Vec<Locale>,
    catalogs: Vec<(String, Value)>,
}

fn registry() -> &'static Registry {
    static R: OnceLock<Registry> = OnceLock::new();
    R.get_or_init(|| {
        let v: Value = serde_json::from_str(REGISTRY_JSON).unwrap_or(Value::Null);
        let fallback = v.get("fallback").and_then(Value::as_str).unwrap_or("en").to_string();
        let mut locales: Vec<Locale> = v
            .get("locales")
            .and_then(Value::as_array)
            .map(|a| {
                a.iter()
                    .filter_map(|l| Some(Locale { id: l.get("id")?.as_str()?.to_string(), live: l.get("status").and_then(Value::as_str) == Some("live") }))
                    .collect()
            })
            .unwrap_or_default();
        if locales.is_empty() {
            locales = vec![Locale { id: "en".into(), live: true }, Locale { id: "tr".into(), live: true }];
        }
        let catalogs = CATALOGS.iter().map(|(id, text)| (id.to_string(), serde_json::from_str(text).unwrap_or(Value::Null))).collect();
        Registry { fallback, locales, catalogs }
    })
}

pub fn locale_ids() -> Vec<String> {
    registry().locales.iter().map(|l| l.id.clone()).collect()
}

pub fn fallback_locale() -> &'static str {
    &registry().fallback
}

/// Registered locale id for "tr-TR", "pt", "pt_BR", "de-AT"..., or None. `live_only`: a
/// draft does not count (OS detection); a UI choice may be a draft (preview).
pub fn match_locale(value: &str, live_only: bool) -> Option<String> {
    let raw = value.trim().replace('_', "-").to_lowercase();
    if raw.is_empty() {
        return None;
    }
    let locales = &registry().locales;
    if let Some(exact) = locales.iter().find(|l| l.id.to_lowercase() == raw) {
        return (!live_only || exact.live).then(|| exact.id.clone());
    }
    let base = raw.split('-').next().unwrap_or("");
    if !(2..=3).contains(&base.len()) || !base.bytes().all(|b| b.is_ascii_lowercase()) {
        return None;
    }
    let same = locales.iter().find(|l| l.id.to_lowercase().split('-').next() == Some(base))?;
    (!live_only || same.live).then(|| same.id.clone())
}

fn is_turkey_time_zone(tz: &str) -> bool {
    // IANA name, or the Windows time zone key name.
    tz == "Europe/Istanbul" || tz == "Turkey Standard Time"
}

/// The language shell text uses.
pub fn resolve_locale(ui: Option<&str>, os: &[String], time_zone: &str) -> String {
    if let Some(id) = ui.and_then(|u| match_locale(u, false)) {
        return id;
    }
    let langs: Vec<String> = os.iter().filter(|l| !l.is_empty()).map(|l| l.replace('_', "-").to_lowercase()).collect();
    if let Some(tr) = match_locale("tr", true) {
        let turkish = langs.iter().any(|l| l == "tr" || l.starts_with("tr-") || l.ends_with("-tr")) || is_turkey_time_zone(time_zone);
        if turkish {
            return tr;
        }
    }
    for l in &langs {
        if let Some(hit) = match_locale(l, true) {
            return hit;
        }
    }
    registry().fallback.clone()
}

fn catalog(id: &str) -> Option<&'static Value> {
    registry().catalogs.iter().find(|(c, _)| c == id).map(|(_, v)| v)
}

fn lookup<'a>(data: Option<&'a Value>, key: &str) -> Option<&'a str> {
    let mut node = data?;
    for part in key.split('.') {
        node = node.get(part)?;
    }
    node.as_str()
}

pub fn interpolate(text: &str, vars: &[(&str, &str)]) -> String {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(start) = rest.find('{') {
        out.push_str(&rest[..start]);
        let after = &rest[start + 1..];
        match after.find('}') {
            Some(end) if after[..end].chars().all(|c| c.is_alphanumeric() || c == '_') && end > 0 => {
                let name = &after[..end];
                match vars.iter().find(|(k, _)| *k == name) {
                    Some((_, v)) => out.push_str(v),
                    None => {
                        out.push('{');
                        out.push_str(name);
                        out.push('}');
                    }
                }
                rest = &after[end + 1..];
            }
            _ => {
                out.push('{');
                rest = after;
            }
        }
    }
    out.push_str(rest);
    out
}

/// Text for `key` in `locale`, English fallback, then the key itself.
pub fn et_for(locale: &str, key: &str, vars: &[(&str, &str)]) -> String {
    let text = lookup(catalog(locale), key).or_else(|| lookup(catalog(&registry().fallback), key)).unwrap_or(key);
    interpolate(text, vars)
}

/// One namespace for every locale ({ "en": {...}, "tr": {...} }), English keys as the base.
pub fn namespace_for_all(ns: &str) -> Value {
    let base = catalog(&registry().fallback).and_then(|c| c.get(ns)).cloned().unwrap_or(Value::Object(Default::default()));
    let mut out = serde_json::Map::new();
    for l in &registry().locales {
        let mut merged = base.clone();
        if let (Some(m), Some(own)) = (merged.as_object_mut(), catalog(&l.id).and_then(|c| c.get(ns)).and_then(Value::as_object)) {
            for (k, v) in own {
                m.insert(k.clone(), v.clone());
            }
        }
        out.insert(l.id.clone(), merged);
    }
    Value::Object(out)
}

/// The saved UI language file (`ui-locale.json`, same shape as Electron's).
pub fn parse_saved_locale(json: &str) -> Option<String> {
    let v: Value = serde_json::from_str(json).ok()?;
    match_locale(v.get("locale")?.as_str()?, false)
}

pub fn saved_locale_json(id: &str) -> String {
    serde_json::json!({ "locale": id }).to_string()
}

#[cfg(test)]
mod tests {
    //! mainI18n.selftest.mjs parts 1-3 (catalog completeness, language choice, lookup).
    use super::*;
    use std::collections::BTreeMap;

    fn flatten(v: &Value, prefix: &str, out: &mut BTreeMap<String, String>) {
        if let Some(m) = v.as_object() {
            for (k, child) in m {
                let key = if prefix.is_empty() { k.clone() } else { format!("{prefix}.{k}") };
                if child.is_object() {
                    flatten(child, &key, out);
                } else {
                    out.insert(key, child.as_str().unwrap_or("").to_string());
                }
            }
        }
    }
    fn placeholders(s: &str) -> Vec<String> {
        let mut v: Vec<String> = s.split('{').skip(1).filter_map(|p| p.split_once('}').map(|(n, _)| n.to_string())).filter(|n| !n.is_empty() && n.chars().all(|c| c.is_alphanumeric() || c == '_')).collect();
        v.sort();
        v
    }

    #[test]
    fn one_complete_catalog_per_registered_locale() {
        let ids = locale_ids();
        assert_eq!(ids.len(), CATALOGS.len(), "one compiled catalog per registered locale");
        let mut en = BTreeMap::new();
        flatten(catalog("en").unwrap(), "", &mut en);
        for id in &ids {
            let mut cat = BTreeMap::new();
            flatten(catalog(id).unwrap_or_else(|| panic!("{id} catalog compiled in")), "", &mut cat);
            assert_eq!(cat.keys().collect::<Vec<_>>(), en.keys().collect::<Vec<_>>(), "{id}: same keys as en");
            for (k, text) in &cat {
                assert!(!text.trim().is_empty(), "{id}.{k} empty");
                assert_eq!(placeholders(text), placeholders(&en[k]), "{id}.{k} placeholders");
            }
        }
        let mut tr = BTreeMap::new();
        flatten(catalog("tr").unwrap(), "", &mut tr);
        assert_eq!(tr["tray.open"], "Descall'i Aç");
        assert_eq!(tr["tray.startWithWindows"], "Windows ile Başlat");
        assert_eq!(tr["tray.updateAndQuit"], "Güncelle ve Çık (v{version})");
    }

    #[test]
    fn language_choice() {
        let os = |v: &[&str]| v.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        assert_eq!(resolve_locale(Some("tr"), &[], ""), "tr", "UI language wins");
        assert_eq!(resolve_locale(Some("en"), &os(&["tr-TR"]), ""), "en", "UI over OS");
        assert_eq!(resolve_locale(Some("pt"), &[], ""), "pt-BR", "base language match");
        assert_eq!(resolve_locale(None, &os(&["tr-TR"]), ""), "tr");
        assert_eq!(resolve_locale(None, &os(&["en-US", "tr"]), ""), "tr");
        assert_eq!(resolve_locale(None, &os(&["en-US"]), "Europe/Istanbul"), "tr");
        assert_eq!(resolve_locale(None, &os(&["en-US"]), "Turkey Standard Time"), "tr", "Windows time zone key");
        assert_eq!(resolve_locale(None, &os(&["en-GB"]), ""), "en");
        assert_eq!(resolve_locale(None, &os(&["ja-JP"]), ""), "en", "unknown -> English");
        assert_eq!(resolve_locale(None, &[], ""), "en");
        for id in locale_ids() {
            assert_eq!(resolve_locale(None, &os(&[id.as_str()]), ""), id, "live {id}");
        }
        assert_eq!(match_locale("xx-YY", false), None);
        assert_eq!(match_locale("de_AT", false).as_deref(), Some("de"));
    }

    #[test]
    fn lookup_interpolation_fallback() {
        assert_eq!(et_for("tr", "tray.updateAndQuit", &[("version", "3.7.22")]), "Güncelle ve Çık (v3.7.22)");
        assert_eq!(et_for("ru", "tray.quit", &[]), "Выйти");
        assert_eq!(et_for("fr", "dialog.retry", &[]), "Réessayer");
        assert_eq!(et_for("tr", "no.such.key", &[]), "no.such.key");
        assert_eq!(et_for("xx", "tray.quit", &[]), "Quit", "unknown locale -> English");
        assert_eq!(interpolate("a {x} {y} {", &[("x", "1")]), "a 1 {y} {");
        assert_eq!(parse_saved_locale(&saved_locale_json("es")).as_deref(), Some("es"));
        assert_eq!(parse_saved_locale("{\"locale\":\"zz\"}"), None);
    }

    #[test]
    fn overlay_strings_for_every_locale() {
        let all = namespace_for_all("overlay");
        let keys: Vec<&String> = all.as_object().unwrap().keys().collect();
        assert_eq!(keys.len(), locale_ids().len());
        assert_eq!(all["tr"]["deafen"], "Sağırlaştır");
        assert_eq!(all["de"]["end"], "Anruf beenden");
    }
}
