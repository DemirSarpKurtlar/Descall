//! Native Windows toast with an inline reply box (quick_reply). tauri-plugin-notification has no
//! reply input, so this uses WinRT ToastNotification directly with the app's AppUserModelID.
//!
//! Two activation paths, both ending in the same handler (`OnActivate(arguments, reply)`):
//!  - while Descall runs, the toast's own Activated event;
//!  - the COM toast activator (INotificationActivationCallback, CLSID below). Windows uses it
//!    when the toast is answered after Descall was closed: it starts
//!    `"<install dir>\Descall.exe" -Embedding`, Descall registers the class object at startup
//!    ([`register_activator`]) and Windows delivers the reply to it. The arguments carry the
//!    conversation, so the reply is not lost on a cold start.
//!
//! Installer (per user, same values as frontend/electron/installer.nsh):
//!  - Start Menu shortcut `Descall.lnk` with System.AppUserModel.ID = `com.descall.app` and
//!    System.AppUserModel.ToastActivatorCLSID = `{BCF5A315-F914-4A7E-95BD-313CBE4B661B}`;
//!  - `HKCU\Software\Classes\CLSID\{BCF5A315-F914-4A7E-95BD-313CBE4B661B}` (default) = `Descall`;
//!  - `HKCU\Software\Classes\CLSID\{BCF5A315-F914-4A7E-95BD-313CBE4B661B}\LocalServer32`
//!    (default) = `"<install dir>\Descall.exe"`;
//!  - uninstall deletes `HKCU\Software\Classes\CLSID\{BCF5A315-F914-4A7E-95BD-313CBE4B661B}`.

pub const APP_USER_MODEL_ID: &str = "com.descall.app";
pub const TOAST_CLSID: &str = "{BCF5A315-F914-4A7E-95BD-313CBE4B661B}";
#[cfg(windows)]
const TOAST_CLSID_U128: u128 = 0xBCF5A315_F914_4A7E_95BD_313CBE4B661B;

/// (toast arguments, typed reply or None for a plain click).
pub type OnActivate = fn(String, Option<String>);

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

/// `args` comes from rules::toast_args (id + conversation).
pub fn toast_xml(args: &str, title: &str, body: &str, placeholder: &str) -> String {
    format!(
        r#"<toast launch="{a}" activationType="foreground"><visual><binding template="ToastGeneric"><text>{}</text><text>{}</text></binding></visual><actions><input id="reply" type="text" placeHolderContent="{}"/><action content="&#x27A4;" arguments="{a}|reply" activationType="foreground" hint-inputId="reply"/></actions></toast>"#,
        esc(title),
        esc(body),
        esc(placeholder),
        a = esc(args)
    )
}

/// A toast without the reply box (the Descall+ "toast" notification style). A click comes back
/// through the same activation paths and opens the chat, like Electron's Notification click.
pub fn plain_toast_xml(args: &str, title: &str, body: &str, silent: bool) -> String {
    format!(
        r#"<toast launch="{a}" activationType="foreground"><visual><binding template="ToastGeneric"><text>{}</text><text>{}</text></binding></visual>{}</toast>"#,
        esc(title),
        esc(body),
        if silent { r#"<audio silent="true"/>"# } else { "" },
        a = esc(args)
    )
}

/// Show the reply toast; its Activated event calls `on_activate`.
pub fn show(args: &str, title: &str, body: &str, placeholder: &str, on_activate: OnActivate) -> Result<Handle, String> {
    show_xml(&toast_xml(args, title, body, placeholder), on_activate)
}

/// Show a toast from its XML; its Activated event calls `on_activate`.
#[cfg(windows)]
pub fn show_xml(toast_xml: &str, on_activate: OnActivate) -> Result<Handle, String> {
    use windows::core::{Interface, HSTRING};
    use windows::Data::Xml::Dom::XmlDocument;
    use windows::Foundation::{IPropertyValue, TypedEventHandler};
    use windows::UI::Notifications::{ToastActivatedEventArgs, ToastNotification, ToastNotificationManager};

    let xml = XmlDocument::new().map_err(|e| e.to_string())?;
    xml.LoadXml(&HSTRING::from(toast_xml)).map_err(|e| e.to_string())?;
    let toast = ToastNotification::CreateToastNotification(&xml).map_err(|e| e.to_string())?;
    toast
        .Activated(&TypedEventHandler::<ToastNotification, windows::core::IInspectable>::new(move |_, a| {
            let Some(a) = a.as_ref().and_then(|a| a.cast::<ToastActivatedEventArgs>().ok()) else { return Ok(()) };
            let args = a.Arguments().map(|s| s.to_string()).unwrap_or_default();
            let text = a
                .UserInput()
                .ok()
                .and_then(|set| set.Lookup(&HSTRING::from("reply")).ok())
                .and_then(|v| v.cast::<IPropertyValue>().ok())
                .and_then(|p| p.GetString().ok())
                .map(|s| s.to_string());
            on_activate(args, text);
            Ok(())
        }))
        .map_err(|e| e.to_string())?;
    let notifier = ToastNotificationManager::CreateToastNotifierWithId(&HSTRING::from(APP_USER_MODEL_ID)).map_err(|e| e.to_string())?;
    notifier.Show(&toast).map_err(|e| e.to_string())?;
    Ok(Handle { toast, notifier })
}

#[cfg(not(windows))]
pub fn show_xml(_toast_xml: &str, _on_activate: OnActivate) -> Result<Handle, String> {
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

/// Register the COM toast activator for this process (call once at startup, before Windows
/// times out waiting for the class after a cold start). Lives on its own MTA thread.
#[cfg(windows)]
pub fn register_activator(on_activate: OnActivate) {
    use windows::core::{implement, IUnknown, Interface, Ref, BOOL, GUID, PCWSTR};
    use windows::Win32::Foundation::{CLASS_E_NOAGGREGATION, E_POINTER};
    use windows::Win32::System::Com::{CoInitializeEx, CoRegisterClassObject, IClassFactory, IClassFactory_Impl, CLSCTX_LOCAL_SERVER, COINIT_MULTITHREADED, REGCLS_MULTIPLEUSE};
    use windows::Win32::UI::Notifications::{INotificationActivationCallback, INotificationActivationCallback_Impl, NOTIFICATION_USER_INPUT_DATA};

    #[implement(INotificationActivationCallback)]
    struct Activator(OnActivate);

    impl INotificationActivationCallback_Impl for Activator_Impl {
        fn Activate(&self, _aumid: &PCWSTR, invokedargs: &PCWSTR, data: *const NOTIFICATION_USER_INPUT_DATA, count: u32) -> windows::core::Result<()> {
            let args = if invokedargs.is_null() { String::new() } else { unsafe { invokedargs.to_string() }.unwrap_or_default() };
            let mut reply = None;
            if !data.is_null() {
                for item in unsafe { std::slice::from_raw_parts(data, count as usize) } {
                    let key = unsafe { item.Key.to_string() }.unwrap_or_default();
                    if key == "reply" {
                        reply = unsafe { item.Value.to_string() }.ok();
                    }
                }
            }
            let f = self.0;
            std::thread::spawn(move || f(args, reply));
            Ok(())
        }
    }

    #[implement(IClassFactory)]
    struct Factory(OnActivate);

    impl IClassFactory_Impl for Factory_Impl {
        fn CreateInstance(&self, outer: Ref<IUnknown>, riid: *const GUID, ppv: *mut *mut core::ffi::c_void) -> windows::core::Result<()> {
            if outer.is_some() {
                return Err(CLASS_E_NOAGGREGATION.into());
            }
            if ppv.is_null() || riid.is_null() {
                return Err(E_POINTER.into());
            }
            let unk: IUnknown = Activator(self.0).into();
            unsafe { unk.query(riid, ppv).ok() }
        }
        fn LockServer(&self, _lock: BOOL) -> windows::core::Result<()> {
            Ok(())
        }
    }

    let _ = std::thread::Builder::new().name("premium-toast-activator".into()).spawn(move || unsafe {
        if CoInitializeEx(None, COINIT_MULTITHREADED).is_err() {
            return;
        }
        let factory: IClassFactory = Factory(on_activate).into();
        let clsid = GUID::from_u128(TOAST_CLSID_U128);
        match CoRegisterClassObject(&clsid, &factory, CLSCTX_LOCAL_SERVER, REGCLS_MULTIPLEUSE) {
            Ok(_cookie) => {
                // The MTA (and the registration) stays for the life of the process.
                loop {
                    std::thread::park();
                }
            }
            Err(e) => log::warn!("[premium] toast activator not registered: {e}"),
        }
    });
}

#[cfg(not(windows))]
pub fn register_activator(_on_activate: OnActivate) {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plain_toast_has_no_reply_box() {
        let x = plain_toast_xml("descall-n|id-1", "Ayşe <3", "selam & naber", false);
        assert!(x.starts_with(r#"<toast launch="descall-n|id-1" activationType="foreground">"#));
        assert!(x.contains("<text>Ayşe &lt;3</text><text>selam &amp; naber</text>"));
        assert!(!x.contains("<input") && !x.contains("<audio"));
        assert!(plain_toast_xml("a", "t", "b", true).contains(r#"<audio silent="true"/>"#));
        assert!(toast_xml("a", "t", "b", "p").contains(r#"<input id="reply""#));
    }
}
