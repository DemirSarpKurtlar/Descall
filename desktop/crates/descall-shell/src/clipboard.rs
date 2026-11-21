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

/// Grant without a prompt? (Electron: MEDIA_PERMISSIONS for the app window.)
pub fn permission_allowed(kind: PermissionKind, url: &str, is_dev: bool) -> bool {
    match kind {
        PermissionKind::Microphone | PermissionKind::Camera | PermissionKind::Autoplay => crate::trust::is_app_url(url, is_dev),
        _ => false,
    }
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
}
