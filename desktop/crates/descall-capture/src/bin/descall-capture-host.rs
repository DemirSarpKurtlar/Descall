//! descall-capture-host.exe: the capture helper process. Descall starts it next to itself
//! (see descall_capture::helper); it runs Windows.Graphics.Capture and the GPU conversion
//! out of the app process, so a device loss or a crash inside GraphicsCapture.dll cannot
//! take Descall down. No window, no console: it talks over stdin/stdout only.
#![cfg_attr(windows, windows_subsystem = "windows")]

fn main() {
    #[cfg(windows)]
    std::process::exit(descall_capture::helper::host_main());
    #[cfg(not(windows))]
    {
        eprintln!("descall-capture-host runs on Windows only");
        std::process::exit(2);
    }
}
