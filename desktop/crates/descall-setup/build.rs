// Embeds the icon (resource 1, used for the window, taskbar and Apps & features), version info and
// the application manifest (asInvoker, PerMonitorV2, common controls v6). Re-runs when the UI changes
// because the UI files are compiled in with include_bytes!.
fn main() {
    for f in ["assets/setup.rc", "assets/setup.manifest", "assets/descall.ico", "ui"] {
        println!("cargo:rerun-if-changed={f}");
    }
    println!("cargo:rerun-if-env-changed=DESCALL_SETUP_PUBKEY");
    println!("cargo:rerun-if-env-changed=DESCALL_SETUP_MANIFEST_URL");
    println!("cargo:rerun-if-env-changed=DESCALL_PUBLISHER");
    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    if target_os == "windows" {
        embed_resource::compile("assets/setup.rc", embed_resource::NONE)
            .manifest_optional()
            .expect("compile setup.rc");
    }
}
