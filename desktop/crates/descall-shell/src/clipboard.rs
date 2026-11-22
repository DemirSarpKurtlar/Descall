//! Clipboard and page permissions. Port of electron/clipboardText.cjs and
//! electron/clipboardImage.cjs, mapped to WebView2's permission kinds.
//!
//! - `clipboard:write-text`: strings only, at most 1,000,000 UTF-16 units, resolves `{ ok }`.
//! - `clipboard:read-image`: the clipboard bitmap as PNG bytes, at most 25 MB, or nothing.
//! - Permissions: the media set (microphone, camera, autoplay) is granted to the app origin
//!   without a prompt, as Electron's session handler did; everything else keeps WebView2's
//!   default (deny for clipboard-read, which Electron never granted either).

use serde::Serialize;

pub const MAX_CLIPBOARD_TEXT_CHARS: usize = 1_000_000;
pub const MAX_IMAGE_BYTES: usize = 25 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct WriteResult {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<&'static str>,
}

/// Validation before the OS write. `None` = go ahead.
pub fn check_text(text: &str) -> Option<WriteResult> {
    (text.encode_utf16().count() > MAX_CLIPBOARD_TEXT_CHARS).then_some(WriteResult { ok: false, error: Some("too_long") })
}

pub fn write_ok() -> WriteResult {
    WriteResult { ok: true, error: None }
}

pub fn write_failed() -> WriteResult {
    WriteResult { ok: false, error: Some("write_failed") }
}

/// RGBA8 -> PNG bytes; empty on bad input or when the result is over MAX_IMAGE_BYTES.
pub fn encode_png(width: u32, height: u32, rgba: &[u8]) -> Vec<u8> {
    if width == 0 || height == 0 || rgba.len() != width as usize * height as usize * 4 {
        return Vec::new();
    }
    let mut out = Vec::new();
    {
        let mut enc = png::Encoder::new(&mut out, width, height);
        enc.set_color(png::ColorType::Rgba);
        enc.set_depth(png::BitDepth::Eight);
        enc.set_compression(png::Compression::Fast);
        let Ok(mut w) = enc.write_header() else { return Vec::new() };
        if w.write_image_data(rgba).is_err() {
            return Vec::new();
        }
    }
    if out.len() > MAX_IMAGE_BYTES {
        Vec::new()
    } else {
        out
    }
}

/// WebView2 COREWEBVIEW2_PERMISSION_KIND, by name.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PermissionKind {
    Microphone,
    Camera,
    Autoplay,
    ClipboardRead,
    Notifications,
    Geolocation,
    Other,
}

/// WebView2 context menu items the app keeps (Electron main.cjs 'context-menu'): editable
/// fields get undo, redo, cut, copy, paste and select all; selected text elsewhere gets Copy
/// only. Everything else WebView2 adds (emoji, paste as plain text, back, reload, save as,
/// print, share, web capture, inspect, open link in a new window) goes.
/// `name` is ICoreWebView2ContextMenuItem::Name; separators: [`electron_menu_items`].
pub fn context_menu_keep(name: &str, editable: bool) -> bool {
    if editable {
        matches!(name, "undo" | "redo" | "cut" | "copy" | "paste" | "selectAll")
    } else {
        name == "copy"
    }
}

/// Which WebView2 menu items `(name, is_separator)` stay so the menu matches Electron's
/// ([`context_menu_keep`]; outside a field only while text is selected). Separators survive
/// only between two kept items. All false = show no menu at all.
pub fn electron_menu_items(editable: bool, has_selection: bool, items: &[(String, bool)]) -> Vec<bool> {
    let wanted = |name: &str| (editable || has_selection) && context_menu_keep(name, editable);
    let mut keep: Vec<bool> = items.iter().map(|(name, sep)| !*sep && wanted(name.as_str())).collect();
    let mut seen_item = false;
    let mut pending: Option<usize> = None;
    for (i, (_, sep)) in items.iter().enumerate() {
        if *sep {
            if seen_item && pending.is_none() {
                pending = Some(i);
            }
        } else if keep[i] {
            if let Some(p) = pending.take() {
                keep[p] = true;
            }
            seen_item = true;
        }
    }
    keep
}

/// Grant without a prompt? (Electron: MEDIA_PERMISSIONS for the app window.)
pub fn permission_allowed(kind: PermissionKind, url: &str, is_dev: bool) -> bool {
    match kind {
        PermissionKind::Microphone | PermissionKind::Camera | PermissionKind::Autoplay => crate::trust::is_app_url(url, is_dev),
        _ => false,
    }
}

/// Permissions the shell stores as granted for the app origin at startup (WebView2
/// ICoreWebView2Profile4::SetPermissionState), the counterpart of Electron's
/// setPermissionCheckHandler, which answered true for media on every check. Without it a fresh
/// WebView2 profile (every user right after the move from Electron) had no camera grant until
/// the first video call: enumerateDevices gave one unnamed camera, so Settings > Voice & Video
/// showed an empty camera choice, and navigator.permissions said "prompt". Only kinds that
/// permission_allowed already grants on request; nothing new is allowed.
pub fn pregranted(is_dev: bool) -> Vec<(PermissionKind, &'static str)> {
    let mut origins = vec![crate::trust::APP_ORIGIN];
    if is_dev {
        origins.push(crate::trust::DEV_ORIGIN);
    }
    let mut out = Vec::new();
    for o in origins {
        for k in [PermissionKind::Microphone, PermissionKind::Camera] {
            out.push((k, o));
        }
    }
    out
}

/// The PermissionRequested answer: `Some(true)` allow, `Some(false)` deny without WebView2's
/// prompt, `None` leave WebView2's default. Electron's permission handler refused everything
/// outside the media list silently, so the Tauri app never shows a browser prompt either
/// (e.g. Notification.requestPermission() in the maintenance gate; Descall notifies natively).
/// Autoplay outside the app and kinds this list does not know keep WebView2's default.
pub fn permission_decision(kind: PermissionKind, url: &str, is_dev: bool) -> Option<bool> {
    if permission_allowed(kind, url, is_dev) {
        return Some(true);
    }
    match kind {
        PermissionKind::Microphone | PermissionKind::Camera | PermissionKind::ClipboardRead | PermissionKind::Notifications | PermissionKind::Geolocation => Some(false),
        PermissionKind::Autoplay | PermissionKind::Other => None,
    }
}

#[cfg(test)]
mod tests {
    //! clipboardText.selftest.mjs / clipboardImage selftest logic.
    use super::*;

    fn menu(spec: &[&str]) -> Vec<(String, bool)> {
        spec.iter().map(|s| if *s == "-" { (String::new(), true) } else { (s.to_string(), false) }).collect()
    }
    fn kept(spec: &[&str], keep: &[bool]) -> Vec<String> {
        spec.iter().zip(keep).filter(|(_, k)| **k).map(|(s, _)| s.to_string()).collect()
    }

    // Moved from app/src-tauri/src/webview.rs (T9): one menu rule for the shell.
    #[test]
    fn editable_field_gets_electrons_edit_menu() {
        let spec = ["emoji", "-", "undo", "redo", "-", "cut", "copy", "paste", "pasteAndMatchStyle", "-", "selectAll", "-", "other", "inspectElement"];
        let keep = electron_menu_items(true, false, &menu(&spec));
        assert_eq!(kept(&spec, &keep), ["undo", "redo", "-", "cut", "copy", "paste", "-", "selectAll"]);
    }

    #[test]
    fn selected_text_gets_copy_only() {
        let spec = ["copy", "-", "share", "webCapture", "-", "inspectElement"];
        assert_eq!(kept(&spec, &electron_menu_items(false, true, &menu(&spec))), ["copy"]);
    }

    #[test]
    fn page_without_selection_gets_no_menu() {
        let spec = ["back", "forward", "reload", "-", "saveAs", "print", "-", "inspectElement"];
        assert!(!electron_menu_items(false, false, &menu(&spec)).iter().any(|k| *k));
        // A link or image without a selection: nothing either (the page's own menus handle those).
        let link = ["openLinkInNewWindow", "copyLinkLocation", "-", "copy"];
        assert!(!electron_menu_items(false, false, &menu(&link)).iter().any(|k| *k));
    }

    #[test]
    fn context_menu_items_like_electron() {
        for name in ["undo", "redo", "cut", "copy", "paste", "selectAll"] {
            assert!(context_menu_keep(name, true), "{name} in an editable field");
        }
        for name in ["back", "reload", "saveAs", "print", "share", "inspectElement", "openLinkInNewWindow", "webCapture"] {
            assert!(!context_menu_keep(name, true), "{name} never");
            assert!(!context_menu_keep(name, false), "{name} never");
        }
        assert!(context_menu_keep("copy", false), "selected text: Copy");
        assert!(!context_menu_keep("paste", false), "no paste outside editable fields");
        assert!(!context_menu_keep("selectAll", false));
    }

    #[test]
    fn text_limits() {
        assert_eq!(check_text("hello"), None);
        assert_eq!(check_text(&"x".repeat(MAX_CLIPBOARD_TEXT_CHARS)), None);
        assert_eq!(check_text(&"x".repeat(MAX_CLIPBOARD_TEXT_CHARS + 1)), Some(WriteResult { ok: false, error: Some("too_long") }));
        assert_eq!(serde_json::to_string(&write_ok()).unwrap(), r#"{"ok":true}"#);
        assert_eq!(serde_json::to_string(&write_failed()).unwrap(), r#"{"ok":false,"error":"write_failed"}"#);
    }

    #[test]
    fn png_encoding() {
        let png = encode_png(2, 1, &[255, 0, 0, 255, 0, 0, 255, 128]);
        assert_eq!(&png[..8], b"\x89PNG\r\n\x1a\n");
        let dec = png::Decoder::new(std::io::Cursor::new(png));
        let reader = dec.read_info().unwrap();
        assert_eq!((reader.info().width, reader.info().height), (2, 1));
        assert!(encode_png(2, 2, &[0; 4]).is_empty(), "size mismatch");
        assert!(encode_png(0, 0, &[]).is_empty());
    }

    #[test]
    fn permissions_only_for_the_app_origin() {
        assert!(permission_allowed(PermissionKind::Microphone, "https://tauri.localhost/direct/1", false));
        assert!(permission_allowed(PermissionKind::Camera, "https://tauri.localhost/", false));
        assert!(!permission_allowed(PermissionKind::Microphone, "https://evil.example/", false));
        assert!(!permission_allowed(PermissionKind::Microphone, "http://localhost:5173/", false));
        assert!(permission_allowed(PermissionKind::Microphone, "http://localhost:5173/", true));
        for k in [PermissionKind::ClipboardRead, PermissionKind::Geolocation, PermissionKind::Notifications, PermissionKind::Other] {
            assert!(!permission_allowed(k, "https://tauri.localhost/", false), "{k:?}");
        }
    }

    #[test]
    fn no_browser_prompts_like_electron() {
        assert_eq!(permission_decision(PermissionKind::Microphone, "https://tauri.localhost/", false), Some(true));
        assert_eq!(permission_decision(PermissionKind::Autoplay, "https://tauri.localhost/", false), Some(true));
        // Electron refused these without UI; WebView2 would ask.
        assert_eq!(permission_decision(PermissionKind::Notifications, "https://tauri.localhost/", false), Some(false));
        assert_eq!(permission_decision(PermissionKind::Geolocation, "https://tauri.localhost/", false), Some(false));
        assert_eq!(permission_decision(PermissionKind::ClipboardRead, "https://tauri.localhost/", false), Some(false));
        assert_eq!(permission_decision(PermissionKind::Camera, "https://evil.example/", false), Some(false));
        // WebView2's own default.
        assert_eq!(permission_decision(PermissionKind::Autoplay, "https://www.youtube.com/", false), None);
        assert_eq!(permission_decision(PermissionKind::Other, "https://tauri.localhost/", false), None);
    }

    #[test]
    fn pregranted_media_is_only_what_a_request_would_get() {
        let release = pregranted(false);
        assert_eq!(release, vec![(PermissionKind::Microphone, "https://tauri.localhost"), (PermissionKind::Camera, "https://tauri.localhost")]);
        for (k, origin) in pregranted(true) {
            assert_eq!(permission_decision(k, &format!("{origin}/"), true), Some(true), "{k:?} {origin}");
        }
        assert!(pregranted(true).iter().any(|(_, o)| *o == "http://localhost:5173"));
        assert!(!release.iter().any(|(k, _)| matches!(k, PermissionKind::Notifications | PermissionKind::ClipboardRead | PermissionKind::Geolocation)));
    }
}
