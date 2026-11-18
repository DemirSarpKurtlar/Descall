//! The work itself, shared by every mode: get a verified payload (embedded or downloaded), then
//! put it in place atomically and wire up the shell. Progress goes to the page as model patches
//! and live-log events; with no window (`/S`) the same code runs silently.

use crate::download::{sha256_bytes, Control, DlError, Downloader, Event};
use crate::layout::{self, sibling, Layout, EXE, UNINSTALLER};
use crate::manifest::{self, Manifest, Mirror};
use crate::payload::{self, Overlay};
use crate::unpack;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::{Duration, Instant};

use super::http::{Session, WinFetch};
use super::shell::{self, LinkOutcome};
use super::ui::Ui;
use super::{log, procs, sys};

#[derive(Debug)]
pub enum JobError {
    Net { code: String },
    Disk { code: String },
    Integrity { code: String, sig_ok: bool },
    Locked { procs: usize },
    Install { code: String },
    Cancelled,
}

impl JobError {
    pub fn kind(&self) -> &'static str {
        match self {
            JobError::Net { .. } => "net",
            JobError::Disk { .. } => "disk",
            JobError::Integrity { .. } => "integrity",
            JobError::Locked { .. } => "locked",
            JobError::Install { .. } => "install",
            JobError::Cancelled => "cancelled",
        }
    }
    pub fn code(&self) -> String {
        match self {
            JobError::Net { code } | JobError::Disk { code } | JobError::Integrity { code, .. } | JobError::Install { code } => code.clone(),
            JobError::Locked { .. } => "LCK-0020".into(),
            JobError::Cancelled => "USR-0001".into(),
        }
    }
}

fn from_dl(e: DlError) -> JobError {
    let code = e.code();
    if e.is_disk_full() {
        return JobError::Disk { code };
    }
    match e {
        DlError::Net(_) | DlError::Http(_) => JobError::Net { code },
        DlError::Disk(_) => JobError::Install { code },
        DlError::Integrity(_) => JobError::Integrity { code, sig_ok: true },
        DlError::Cancelled | DlError::Paused => JobError::Cancelled,
    }
}

fn io_code(prefix: &str, e: &std::io::Error) -> String {
    format!("{prefix}-{:04X}", e.raw_os_error().unwrap_or(0) as u32 & 0xffff)
}

pub enum Source {
    Embedded { exe: PathBuf, ov: Overlay },
    Web,
}

pub struct Release {
    pub m: Manifest,
    pub source: Source,
}

pub struct Ctx {
    pub layout: Layout,
    pub lang: String,
    pub allow_unsigned: bool,
    pub manifest_url: String,
    pub ctl: Arc<Control>,
    pub ui: Option<Ui>,
}

impl Ctx {
    pub fn patch(&self, v: Value) {
        if let Some(ui) = &self.ui {
            ui.patch(v);
        }
    }
}

/// Reads the release: the manifest embedded in this exe (offline installer) or the signed one online.
pub fn load_release(ctx: &Ctx) -> Result<Release, JobError> {
    let exe = std::env::current_exe().map_err(|e| JobError::Install { code: io_code("EXE", &e) })?;
    let pubkey = manifest::compiled_pubkey();
    if let Ok(Some(ov)) = payload::find(&exe) {
        let man = payload::read_range(&exe, &ov.manifest).map_err(|e| JobError::Install { code: io_code("EXE", &e) })?;
        let sig = payload::read_range(&exe, &ov.sig).map_err(|e| JobError::Install { code: io_code("EXE", &e) })?;
        let m = manifest::verify_and_parse(&man, &String::from_utf8_lossy(&sig), pubkey, ctx.allow_unsigned).map_err(|e| {
            log::error(&format!("embedded manifest rejected: {e}"));
            JobError::Integrity { code: "SIG-0BAD".into(), sig_ok: false }
        })?;
        log::info(&format!("embedded payload {} ({} bytes)", m.version, ov.zip.end - ov.zip.start));
        return Ok(Release { m, source: Source::Embedded { exe, ov } });
    }
    let s = Session::new().map_err(from_dl)?;
    let (man, _) = s.get_small(&ctx.manifest_url).map_err(from_dl)?;
    let (sig, _) = s.get_small(&format!("{}.minisig", ctx.manifest_url)).map_err(from_dl)?;
    let m = manifest::verify_and_parse(&man, &String::from_utf8_lossy(&sig), pubkey, ctx.allow_unsigned).map_err(|e| {
        log::error(&format!("manifest rejected: {e}"));
        JobError::Integrity { code: "SIG-0BAD".into(), sig_ok: false }
    })?;
    Ok(Release { m, source: Source::Web })
}

struct Rate {
    last_t: Instant,
    last_b: u64,
    speed: f64,
}

impl Rate {
    fn new(b: u64) -> Self {
        let n = Instant::now();
        Rate { last_t: n, last_b: b, speed: 0.0 }
    }
    fn update(&mut self, b: u64) -> Option<f64> {
        let dt = self.last_t.elapsed().as_secs_f64();
        if dt < 0.25 {
            return None;
        }
        let inst = (b.saturating_sub(self.last_b)) as f64 / dt;
        self.speed = if self.speed == 0.0 { inst } else { self.speed * 0.7 + inst * 0.3 };
        self.last_t = Instant::now();
        self.last_b = b;
        Some(self.speed)
    }
}

/// Gets the payload zip onto disk and verified. Returns its path.
pub fn fetch_payload(ctx: &Ctx, rel: &Release) -> Result<PathBuf, JobError> {
    let m = &rel.m;
    let dl = Downloader::new(m, &ctx.layout.cache_root());
    let parts = m.part_count();
    let total = m.payload.size;
    match &rel.source {
        Source::Embedded { exe, ov } => {
            ctx.patch(json!({ "dl": { "phase": "verify", "embedded": true, "parts": parts, "part": parts, "got": total, "total": total, "files": { "done": 0, "total": m.payload.files } } }));
            log::event("l_embedded", json!({ "size": total }), "");
            fs::create_dir_all(&dl.dir).map_err(|e| JobError::Disk { code: io_code("DSK", &e) })?;
            copy_range_verified(exe, ov, &dl.data_path(), &m.payload.sha256, |f| ctx.patch(json!({ "dl": { "verify": f } })))?;
            log::event("l_verify_ok", json!({}), "");
            Ok(dl.data_path())
        }
        Source::Web => {
            let s = Session::new().map_err(from_dl)?;
            let mirror = pick_mirror(&s, m);
            let url = m.payload_url(&mirror.0);
            let label = mirror.0.label_for(&ctx.lang);
            let st = dl.load();
            ctx.patch(json!({ "dl": {
                "phase": "download", "embedded": false, "parts": parts, "part": dl.parts_done(&st) + 1, "got": dl.bytes_done(&st), "total": total,
                "server": { "label": label, "ms": mirror.1 }, "files": { "done": 0, "total": m.payload.files } } }));
            log::event("l_mirror", json!({ "host": mirror.0.host(), "ms": mirror.1 }), "");
            log::event("l_connected", json!({ "host": mirror.0.host(), "tls": mirror.2 }), "");
            log::event("l_manifest", json!({ "v": m.version, "n": parts, "size": total }), "");
            let mut fetch = WinFetch { session: &s };
            let mut rate = Rate::new(dl.bytes_done(&st));
            let mut last_line = Instant::now() - Duration::from_secs(5);
            let mut last_patch = Instant::now() - Duration::from_secs(5);
            loop {
                let mut on_event = |ev: Event| match ev {
                    Event::Cached { part } => log::event("l_part_cached", json!({ "i": part + 1, "n": parts }), ""),
                    Event::Resumed { part, got } => log::event("l_resume", json!({ "i": part + 1, "n": parts, "got": got }), ""),
                    Event::PartDone { part, bytes, secs } => {
                        log::event("l_part_ok", json!({ "i": part + 1, "n": parts, "size": bytes, "secs": (secs * 10.0).round() / 10.0 }), "");
                        ctx.patch(json!({ "dl": { "part": (part + 2).min(parts) } }));
                    }
                    Event::Progress { total_got, part, part_got, part_len } => {
                        if let Some(sp) = rate.update(total_got) {
                            let eta = if sp > 1.0 { (total - total_got) as f64 / sp } else { -1.0 };
                            if last_patch.elapsed() > Duration::from_millis(120) {
                                last_patch = Instant::now();
                                ctx.patch(json!({ "dl": { "phase": "download", "paused": false, "part": part + 1, "got": total_got, "speed": sp, "eta": if eta < 0.0 { Value::Null } else { json!(eta) } } }));
                            }
                        }
                        if last_line.elapsed() > Duration::from_millis(600) {
                            last_line = Instant::now();
                            log_rep("l_part_dl", json!({ "i": part + 1, "n": parts, "got": part_got, "size": part_len }));
                        }
                    }
                };
                match dl.run(&mut fetch, &url, &ctx.ctl, &mut on_event) {
                    Ok(()) => break,
                    Err(DlError::Paused) => {
                        let st = dl.load();
                        log::event("l_paused", json!({}), "");
                        ctx.patch(json!({ "dl": { "paused": true, "speed": 0, "got": dl.bytes_done(&st) } }));
                        while ctx.ctl.pause.load(Ordering::Relaxed) && !ctx.ctl.cancel.load(Ordering::Relaxed) {
                            std::thread::sleep(Duration::from_millis(150));
                        }
                        if ctx.ctl.cancel.load(Ordering::Relaxed) {
                            return Err(JobError::Cancelled);
                        }
                        log::event("l_resumed", json!({}), "");
                        ctx.patch(json!({ "dl": { "paused": false } }));
                        rate = Rate::new(dl.bytes_done(&dl.load()));
                    }
                    Err(e) => {
                        let st = dl.load();
                        if let DlError::Net(_) | DlError::Http(_) = e {
                            log::event("l_net_lost", json!({ "code": e.code() }), "err");
                            log::event("l_saved", json!({ "n": dl.parts_done(&st), "size": dl.bytes_done(&st) }), "");
                        } else {
                            log::event("l_error", json!({ "code": e.code() }), "err");
                        }
                        if matches!(e, DlError::Integrity(_)) {
                            let _ = dl.reset();
                        }
                        return Err(from_dl(e));
                    }
                }
            }
            ctx.patch(json!({ "dl": { "phase": "verify", "got": total, "part": parts, "speed": 0, "verify": 0 } }));
            let mut last = Instant::now();
            dl.verify_full(|f| {
                if last.elapsed() > Duration::from_millis(80) {
                    last = Instant::now();
                    ctx.patch(json!({ "dl": { "verify": f } }));
                }
            })
            .map_err(|e| {
                let _ = dl.reset();
                from_dl(e)
            })?;
            log::event("l_verify_ok", json!({}), "");
            Ok(dl.data_path())
        }
    }
}

/// Live line that replaces the previous one with the same key (the part counter in the draft).
fn log_rep(key: &str, args: Value) {
    log::event_rep(key, args);
}

/// Nearest mirror by round trip (at most four probed), with its TLS version.
fn pick_mirror(s: &Session, m: &Manifest) -> (Mirror, u32, String) {
    let mut best: Option<(Mirror, u32, String)> = None;
    for mi in m.mirrors.iter().take(4) {
        if let Some((ms, tls)) = s.probe(&m.payload_url(mi)) {
            if best.as_ref().is_none_or(|b| ms < b.1) {
                best = Some((mi.clone(), ms, tls));
            }
        }
    }
    best.unwrap_or_else(|| (m.mirrors.first().cloned().unwrap_or(Mirror { base: "https://cdn.descall.com/".into(), label: Default::default() }), 0, "TLS".into()))
}

fn copy_range_verified(exe: &Path, ov: &Overlay, dest: &Path, sha: &str, mut progress: impl FnMut(f64)) -> Result<(), JobError> {
    if let Ok(existing) = fs::read(dest) {
        if sha256_bytes(&existing) == sha {
            progress(1.0);
            return Ok(());
        }
    }
    let disk = |e: std::io::Error| if matches!(e.raw_os_error(), Some(112) | Some(39)) { JobError::Disk { code: io_code("DSK", &e) } } else { JobError::Install { code: io_code("EXE", &e) } };
    let mut src = fs::File::open(exe).map_err(disk)?;
    src.seek(SeekFrom::Start(ov.zip.start)).map_err(disk)?;
    let mut out = fs::File::create(dest).map_err(disk)?;
    let len = ov.zip.end - ov.zip.start;
    let mut left = len;
    let mut h = Sha256::new();
    let mut buf = vec![0u8; 256 * 1024];
    while left > 0 {
        let n = (left as usize).min(buf.len());
        src.read_exact(&mut buf[..n]).map_err(disk)?;
        h.update(&buf[..n]);
        out.write_all(&buf[..n]).map_err(disk)?;
        left -= n as u64;
        progress((len - left) as f64 / len as f64);
    }
    out.sync_all().map_err(disk)?;
    if crate::download::hex(&h.finalize()) != sha {
        let _ = fs::remove_file(dest);
        return Err(JobError::Integrity { code: "SHA-0BAD".into(), sig_ok: true });
    }
    Ok(())
}

#[derive(Debug, Clone)]
pub struct InstallOpts {
    /// `None`: keep whatever the user has (update / migration).
    pub autostart: Option<bool>,
    pub desktop: bool,
    pub start_menu: bool,
    pub auto_update: bool,
    /// Migration: an Electron install still sitting in the folder is moved to `<dir>.legacy`
    /// (kept 14 days for rollback) instead of being replaced.
    pub legacy_backup: bool,
}

#[derive(Debug, Clone)]
pub struct Report {
    pub files: u32,
    pub bytes: u64,
    pub autostart: bool,
    pub desktop: LinkOutcome,
    pub shell_items: u32,
}

/// Extracts to `<dir>.new`, swaps it in (old files kept in `<dir>.old` until it worked), then
/// registers shortcuts, autostart, toast activator, Apps & features and `setup.json`.
pub fn install_files(ctx: &Ctx, rel: &Release, zip: &Path, dir: &Path, opts: &InstallOpts) -> Result<Report, JobError> {
    let running = procs::running_in(dir);
    if !running.is_empty() {
        return Err(JobError::Locked { procs: running.len() });
    }
    let files_total = rel.m.payload.files;
    ctx.patch(json!({ "dl": { "phase": "install", "files": { "done": 0, "total": files_total } } }));
    let staging = sibling(dir, ".new");
    let _ = fs::remove_dir_all(&staging);
    let inst = |e: std::io::Error| {
        if matches!(e.raw_os_error(), Some(112) | Some(39)) {
            JobError::Disk { code: io_code("DSK", &e) }
        } else if e.raw_os_error() == Some(32) || e.raw_os_error() == Some(5) {
            JobError::Locked { procs: procs::running_in(dir).len().max(1) }
        } else {
            JobError::Install { code: io_code("INS", &e) }
        }
    };
    let mut last = Instant::now();
    let unpacked = unpack::extract(zip, &staging, &ctx.ctl.cancel, |d, t| {
        if last.elapsed() > Duration::from_millis(60) || d == t {
            last = Instant::now();
            ctx.patch(json!({ "dl": { "files": { "done": d, "total": t } } }));
        }
    })
    .map_err(|e| {
        let _ = fs::remove_dir_all(&staging);
        if e.kind() == std::io::ErrorKind::Interrupted { JobError::Cancelled } else { inst(e) }
    })?;
    log::event("l_extract", json!({ "n": unpacked.files }), "");
    if !staging.join(EXE).is_file() {
        let _ = fs::remove_dir_all(&staging);
        return Err(JobError::Integrity { code: "PKG-0EXE".into(), sig_ok: true });
    }
    if !staging.join(UNINSTALLER).is_file() {
        // The payload normally ships a signed uninstall.exe; otherwise copy this exe (without any overlay).
        copy_self_pe(&staging.join(UNINSTALLER)).map_err(inst)?;
    }

    // Swap: <dir> -> <dir>.old, <dir>.new -> <dir>. Same Descall.exe path as before.
    let electron_here = dir.join("Uninstall Descall.exe").is_file();
    let keep_legacy = opts.legacy_backup && electron_here && !sibling(dir, ".legacy").exists();
    let old = if keep_legacy { sibling(dir, ".legacy") } else { sibling(dir, ".old") };
    if !keep_legacy {
        let _ = fs::remove_dir_all(&old);
    }
    let had_old = dir.exists();
    if had_old {
        fs::rename(dir, &old).map_err(|e| {
            let _ = fs::remove_dir_all(&staging);
            inst(e)
        })?;
    } else if let Some(parent) = dir.parent() {
        fs::create_dir_all(parent).map_err(inst)?;
    }
    if let Err(e) = fs::rename(&staging, dir) {
        if had_old {
            let _ = fs::rename(&old, dir);
        }
        let _ = fs::remove_dir_all(&staging);
        return Err(inst(e));
    }
    log::event("l_swap", json!({ "dir": dir.display().to_string() }), "");

    let exe = dir.join(EXE);
    let mut shell_items = 0u32;
    let mut desktop = LinkOutcome::Skipped;
    if let Some(l) = shell::start_menu_lnk() {
        if shell::ensure_link(&l, &exe, opts.start_menu) != LinkOutcome::Skipped {
            shell_items += 1;
        }
    }
    if let Some(l) = shell::desktop_lnk() {
        desktop = shell::ensure_link(&l, &exe, opts.desktop);
        if desktop != LinkOutcome::Skipped {
            shell_items += 1;
        }
    }
    if let Some(l) = shell::taskbar_pin_lnk() {
        // Pins are never created, only kept pointing at the right exe.
        if l.exists() && shell::ensure_link(&l, &exe, false) != LinkOutcome::Skipped {
            shell_items += 1;
        }
    }
    let autostart = match opts.autostart {
        Some(on) => {
            let _ = shell::autostart_set(&exe, on);
            on
        }
        None => match shell::autostart_get() {
            Some(cur) => {
                // Keep it on, but point it at the (possibly new) exe path with the hidden-start args.
                let _ = shell::autostart_set(&exe, true);
                log::info(&format!("autostart kept (was: {cur})"));
                shell_items += 1;
                true
            }
            None => false,
        },
    };
    let _ = shell::toast_activator_set(dir);
    shell::notify_shell();
    log::event("l_shell", json!({}), "");
    let size_kb = (unpacked.bytes / 1024).min(u32::MAX as u64) as u32;
    shell::register_uninstall(&shell::UninstallEntry { dir, version: &rel.m.version, size_kb }).map_err(|e| JobError::Install { code: format!("REG-{:04X}", e.code().0 as u32 & 0xffff) })?;
    log::event("l_registry", json!({}), "");
    write_setup_json(&ctx.layout, &rel.m.version, &ctx.lang, opts.auto_update, dir);

    if keep_legacy {
        log::info(&format!("Electron files kept in {}", old.display()));
    } else if had_old && fs::remove_dir_all(&old).is_err() {
        log::warn("previous files still in use; they go at next sign-in");
        schedule_delete_tree(&old);
    }
    Ok(Report { files: unpacked.files, bytes: unpacked.bytes, autostart, desktop, shell_items })
}

fn write_setup_json(l: &Layout, version: &str, lang: &str, auto_update: bool, dir: &Path) {
    let p = l.app_data();
    let _ = fs::create_dir_all(&p);
    let doc = json!({ "installedBy": "descall-setup", "version": version, "locale": lang, "autoUpdate": auto_update, "installDir": dir.display().to_string() });
    let _ = fs::write(p.join("setup.json"), serde_json::to_vec_pretty(&doc).unwrap_or_default());
}

/// Copies this exe without an appended offline payload (the overlay starts at zip.start).
fn copy_self_pe(dest: &Path) -> std::io::Result<()> {
    let me = std::env::current_exe()?;
    match payload::find(&me)? {
        Some(ov) => {
            let mut src = fs::File::open(&me)?;
            let mut out = fs::File::create(dest)?;
            std::io::copy(&mut (&mut src).take(ov.zip.start), &mut out)?;
            Ok(())
        }
        None => fs::copy(&me, dest).map(|_| ()),
    }
}

/// Files still locked by a dying process: let Windows remove them at the next boot.
pub fn schedule_delete_tree(dir: &Path) {
    use windows::core::HSTRING;
    use windows::Win32::Storage::FileSystem::{MoveFileExW, MOVEFILE_DELAY_UNTIL_REBOOT};
    let mut stack = vec![dir.to_path_buf()];
    let mut dirs = vec![];
    while let Some(d) = stack.pop() {
        if let Ok(rd) = fs::read_dir(&d) {
            for e in rd.flatten() {
                let p = e.path();
                if p.is_dir() {
                    stack.push(p);
                } else if fs::remove_file(&p).is_err() {
                    unsafe {
                        let _ = MoveFileExW(&HSTRING::from(p.as_os_str()), None, MOVEFILE_DELAY_UNTIL_REBOOT);
                    }
                }
            }
        }
        dirs.push(d);
    }
    for d in dirs.into_iter().rev() {
        if fs::remove_dir(&d).is_err() {
            unsafe {
                let _ = MoveFileExW(&HSTRING::from(d.as_os_str()), None, MOVEFILE_DELAY_UNTIL_REBOOT);
            }
        }
    }
}

/// Space check against the manifest: payload (if not cached) + unpacked size + staging margin.
pub fn space_needed(m: &Manifest) -> u64 {
    m.payload.size + m.payload.installed_size.max(m.payload.size * 3) + 8 * 1024 * 1024
}

pub fn free_space(dir: &Path) -> u64 {
    sys::disk_free(dir).unwrap_or(u64::MAX)
}

pub fn default_layout() -> Layout {
    let local = sys::known_folder(&sys::FOLDERID_LocalAppData).unwrap_or_else(|| PathBuf::from(std::env::var_os("LOCALAPPDATA").unwrap_or_default()));
    let roaming = sys::known_folder(&sys::FOLDERID_RoamingAppData).unwrap_or_else(|| PathBuf::from(std::env::var_os("APPDATA").unwrap_or_default()));
    Layout { local, roaming }
}

pub fn exe_in(dir: &Path) -> PathBuf {
    dir.join(layout::EXE)
}
