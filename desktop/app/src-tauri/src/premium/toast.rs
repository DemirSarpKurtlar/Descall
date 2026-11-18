//! Native Windows toast with an inline reply box (quick_reply). tauri-plugin-notification has no
//! reply input, so this uses WinRT ToastNotification directly with the app's AppUserModelID
//! (com.descall.app, the Start Menu shortcut written by the installer carries it and the toast
//! activator CLSID). The reply text arrives on the toast's Activated event.

pub const APP_USER_MODEL_ID: &str = "com.descall.app";
pub const TOAST_CLSID: &str = "{BCF5A315-F914-4A7E-95BD-313CBE4B661B}";

pub type OnReply = Box<dyn Fn(Option<String>) + Send + Sync>;

/// Windows only delivers toasts of an unpackaged app that has a Start Menu shortcut with its
/// AppUserModelID (an installed build; not a portable or dev run).
pub fn identity_ready() -> bool {
    #[cfg(windows)]
    {
        std::env::var_os("APPDATA")
            .map(std::path::PathBuf::from)
            .is_some_and(|d| d.join("Microsoft\\Windows\\Start Menu\\Programs\\Descall.lnk").exists())
    }
    #[cfg(not(windows))]
    {
        false
    }
}

fn esc(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;").replace('\'', "&apos;")
}

pub fn toast_xml(id: &str, title: &str, body: &str, placeholder: &str, send_label: &str) -> String {
    format!(
        r#"<toast launch="descall-qr:{id}" activationType="foreground"><visual><binding template="ToastGeneric"><text>{}</text><text>{}</text></binding></visual><actions><input id="reply" type="text" placeHolderContent="{}"/><action content="{}" arguments="descall-qr:{id}:reply" activationType="foreground" hint-inputId="reply"/></actions></toast>"#,
        esc(title),
        esc(body),
        esc(placeholder),
        esc(send_label)
    )
}

/// Show the toast. `on_activate(Some(text))` for a reply, `(None)` for a plain click.
#[cfg(windows)]
pub fn show(id: &str, title: &str, body: &str, placeholder: &str, on_activate: OnReply) -> Result<Handle, String> {
    use windows::core::{Interface, HSTRING};
    use windows::Data::Xml::Dom::XmlDocument;
    use windows::Foundation::{IPropertyValue, TypedEventHandler};
    use windows::UI::Notifications::{ToastActivatedEventArgs, ToastNotification, ToastNotificationManager};

    let xml = XmlDocument::new().map_err(|e| e.to_string())?;
    xml.LoadXml(&HSTRING::from(toast_xml(id, title, body, placeholder, "\u{27A4}"))).map_err(|e| e.to_string())?;
    let toast = ToastNotification::CreateToastNotification(&xml).map_err(|e| e.to_string())?;
    toast
        .Activated(&TypedEventHandler::<ToastNotification, windows::core::IInspectable>::new(move |_, args| {
            let text = args
                .as_ref()
                .and_then(|a| a.cast::<ToastActivatedEventArgs>().ok())
                .and_then(|a| a.UserInput().ok())
                .and_then(|set| set.Lookup(&HSTRING::from("reply")).ok())
                .and_then(|v| v.cast::<IPropertyValue>().ok())
                .and_then(|p| p.GetString().ok())
                .map(|s| s.to_string());
            on_activate(text);
            Ok(())
        }))
        .map_err(|e| e.to_string())?;
    let notifier = ToastNotificationManager::CreateToastNotifierWithId(&HSTRING::from(APP_USER_MODEL_ID)).map_err(|e| e.to_string())?;
    notifier.Show(&toast).map_err(|e| e.to_string())?;
    Ok(Handle { toast, notifier })
}

#[cfg(not(windows))]
pub fn show(_id: &str, _title: &str, _body: &str, _placeholder: &str, _on_activate: OnReply) -> Result<Handle, String> {
    Err("platform".into())
}

/// Keeps the toast (and its Activated handler) alive while it can still be answered.
pub struct Handle {
    #[cfg(windows)]
    toast: windows::UI::Notifications::ToastNotification,
    #[cfg(windows)]
    notifier: windows::UI::Notifications::ToastNotifier,
}

impl Handle {
    pub fn hide(&self) {
        #[cfg(windows)]
        {
            let _ = self.notifier.Hide(&self.toast);
        }
    }
}
