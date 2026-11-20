//! Port of `resolveDistFile` in `frontend/electron/appProtocolPath.cjs` (2.13.1): the
//! desktop web build uses relative `./assets/...` URLs (Vite `base: "./"`), so a document
//! served at a nested route asks for its files under that route. The admin windows open
//! at `/admin/panel` and `/admin/signup-stats`: their scripts and styles are requested as
//! `admin/assets/index-*.js`. Tauri's asset resolver does not know that and answers with
//! `index.html` (its SPA fallback), the module script fails to parse, and the page is left
//! on the prerendered marketing home inside `index.html`.
//!
//! The rule: a key with a file extension that is not in the bundle is looked up again
//! with its leading folders dropped one at a time (`admin/assets/x.js`, then
//! `assets/x.js`). HTML documents are left alone so a route never turns into another
//! page, and keys without an extension stay SPA routes for Tauri's own fallback.

/// The bundle key to serve for `key` (no leading `/`), or `None` to keep Tauri's own
/// lookup. `exists` answers whether a key is in the bundle.
pub fn nested_asset_key(key: &str, exists: impl Fn(&str) -> bool) -> Option<String> {
    let key = key.trim_start_matches('/');
    if key.is_empty() || exists(key) {
        return None;
    }
    let file = key.rsplit('/').next().unwrap_or(key);
    let ext = match file.rsplit_once('.') {
        Some((stem, ext)) if !stem.is_empty() && !ext.is_empty() => ext.to_ascii_lowercase(),
        _ => return None,
    };
    if ext == "html" || ext == "htm" {
        return None;
    }
    let segments: Vec<&str> = key.split('/').filter(|s| !s.is_empty()).collect();
    if segments.iter().any(|s| *s == ".." || *s == ".") {
        return None;
    }
    (1..segments.len()).map(|i| segments[i..].join("/")).find(|candidate| exists(candidate))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn bundle(key: &str) -> bool {
        matches!(key, "index.html" | "assets/index-abc.js" | "assets/index-abc.css" | "brand/logo.svg" | "tray-menu/tray-menu.js" | "blog/post.html" | "post.html")
    }

    #[test]
    fn admin_window_files_resolve_from_the_nested_route() {
        assert_eq!(nested_asset_key("admin/assets/index-abc.js", bundle).as_deref(), Some("assets/index-abc.js"));
        assert_eq!(nested_asset_key("admin/assets/index-abc.css", bundle).as_deref(), Some("assets/index-abc.css"));
        assert_eq!(nested_asset_key("/admin/brand/logo.svg", bundle).as_deref(), Some("brand/logo.svg"));
        // Deeper routes (a reload on /settings/shop/item) too.
        assert_eq!(nested_asset_key("settings/shop/assets/index-abc.js", bundle).as_deref(), Some("assets/index-abc.js"));
    }

    #[test]
    fn existing_keys_and_routes_keep_the_default_lookup() {
        assert_eq!(nested_asset_key("assets/index-abc.js", bundle), None);
        assert_eq!(nested_asset_key("tray-menu/tray-menu.js", bundle), None);
        // SPA routes (no extension): Tauri falls back to index.html itself.
        assert_eq!(nested_asset_key("admin/panel", bundle), None);
        assert_eq!(nested_asset_key("", bundle), None);
    }

    #[test]
    fn html_documents_are_never_rewritten() {
        // Tauri tries `blog/whatever.html` for the route /blog/whatever: it must not
        // become the unrelated top-level page.
        assert_eq!(nested_asset_key("blog/whatever.html", bundle), None);
        assert_eq!(nested_asset_key("x/post.html", bundle), None);
    }

    #[test]
    fn missing_files_and_dot_segments_stay_missing() {
        assert_eq!(nested_asset_key("admin/assets/gone.js", bundle), None);
        assert_eq!(nested_asset_key("admin/../assets/index-abc.js", bundle), None);
        assert_eq!(nested_asset_key("admin/./assets/index-abc.js", bundle), None);
        assert_eq!(nested_asset_key("admin/.hidden", bundle), None);
    }
}
