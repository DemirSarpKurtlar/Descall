//! DescallCaptureBench: the P0 acceptance tests of Descall's native screen share, as one
//! exe the owner runs on their own PC (and CI runs where it can).
//!
//! ```text
//! descall-capture-bench.exe                 run everything, print the table, write the JSON
//!   --only echo,video,follow,color,picker   run some groups
//!   --seconds N                             length of each 60 fps run (default 10)
//!   --repeat N                              run video + follow N times in one process
//!   --mode helper|inproc                    where the capture runs (default: helper process)
//!   group "inproc": video + follow once more with in-process capture, in a child process
//!   --out PATH                              JSON report path (default: next to the exe)
//!   --ci                                    no "press Enter" at the end
//!   --list                                  print the sources and capabilities, run nothing
//! exit code: 0 no FAIL, 1 at least one FAIL, 2 bench error
//! ```
//! Steps and how to read the results (Turkish): docs/desktop/ekran-paylasimi-testi.md.

#![cfg_attr(not(windows), allow(dead_code))]

mod barcode;
mod report;

#[cfg(windows)]
mod color;
#[cfg(windows)]
mod echo;
#[cfg(windows)]
mod env;
#[cfg(windows)]
mod follow;
#[cfg(windows)]
mod harness;
#[cfg(windows)]
mod presenter;
#[cfg(windows)]
mod video;

#[derive(Debug, Clone, PartialEq)]
pub struct Args {
    pub ci: bool,
    pub list: bool,
    pub out: Option<String>,
    pub only: Vec<String>,
    pub seconds: u64,
    /// Run the video and follow groups this many times in one process (lifecycle check:
    /// shares started and stopped back to back must not leave anything behind).
    pub repeat: u32,
    /// "helper" (default, the product default) or "inproc".
    pub mode: String,
    pub play_tone: Option<Vec<String>>,
}

pub const GROUPS: [&str; 6] = ["echo", "video", "follow", "color", "picker", "inproc"];

pub fn parse_args(a: &[String]) -> Result<Args, String> {
    let mut r = Args { ci: false, list: false, out: None, only: Vec::new(), seconds: 10, repeat: 1, mode: "helper".into(), play_tone: None };
    let mut i = 0;
    while i < a.len() {
        let next = |i: usize| a.get(i + 1).cloned().ok_or_else(|| format!("{} needs a value", a[i]));
        match a[i].as_str() {
            "--ci" => r.ci = true,
            "--list" => r.list = true,
            "--out" => {
                r.out = Some(next(i)?);
                i += 1;
            }
            "--seconds" => {
                r.seconds = next(i)?.parse().map_err(|_| "--seconds needs a number".to_string())?;
                r.seconds = r.seconds.clamp(2, 120);
                i += 1;
            }
            "--repeat" => {
                r.repeat = next(i)?.parse().map_err(|_| "--repeat needs a number".to_string())?;
                r.repeat = r.repeat.clamp(1, 10);
                i += 1;
            }
            "--mode" => {
                r.mode = next(i)?.to_ascii_lowercase();
                if r.mode != "helper" && r.mode != "inproc" {
                    return Err("--mode is helper or inproc".into());
                }
                i += 1;
            }
            "--only" => {
                r.only = next(i)?.split(',').map(|s| s.trim().to_ascii_lowercase()).filter(|s| !s.is_empty()).collect();
                if let Some(bad) = r.only.iter().find(|g| !GROUPS.contains(&g.as_str())) {
                    return Err(format!("unknown group {bad}; groups: {}", GROUPS.join(",")));
                }
                i += 1;
            }
            "--play-tone" => {
                r.play_tone = Some(a[i + 1..].to_vec());
                break;
            }
            "-h" | "--help" | "/?" => return Err(String::new()),
            other => return Err(format!("unknown argument {other}")),
        }
        i += 1;
    }
    Ok(r)
}

impl Args {
    pub fn wants(&self, group: &str) -> bool {
        self.only.is_empty() || self.only.iter().any(|g| g == group)
    }
}

const USAGE: &str = "descall-capture-bench [--only echo,video,follow,color,picker,inproc] [--mode helper|inproc] [--seconds N] [--repeat N] [--out report.json] [--ci] [--list]";

fn main() {
    let argv: Vec<String> = std::env::args().skip(1).collect();
    // Started by the bench itself as the capture helper (helper mode).
    #[cfg(windows)]
    if argv.first().map(|a| a == descall_capture::helper::HOST_ARG).unwrap_or(false) {
        std::process::exit(descall_capture::helper::host_main());
    }
    let args = match parse_args(&argv) {
        Ok(a) => a,
        Err(e) => {
            if !e.is_empty() {
                eprintln!("{e}");
            }
            eprintln!("{USAGE}");
            std::process::exit(if e.is_empty() { 0 } else { 2 });
        }
    };
    std::process::exit(run(args, argv));
}

#[cfg(not(windows))]
fn run(_args: Args, _argv: Vec<String>) -> i32 {
    eprintln!("descall-capture-bench runs on Windows 10 2004+ only.");
    2
}

#[cfg(windows)]
fn run(args: Args, argv: Vec<String>) -> i32 {
    use report::{Status, TestResult};

    report::install_panic_hook();
    if let Some(t) = &args.play_tone {
        return echo::child_main(t);
    }
    harness::set_mode(match (args.mode.as_str(), std::env::current_exe()) {
        ("helper", Ok(exe)) => descall_capture::host::CaptureMode::Helper(descall_capture::helper::HelperSpawn { exe, args: vec![descall_capture::helper::HOST_ARG.into()] }),
        _ => descall_capture::host::CaptureMode::InProcess,
    });
    unsafe {
        use windows::Win32::UI::HiDpi::{SetProcessDpiAwarenessContext, DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2};
        let _ = SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
    }
    println!("DescallCaptureBench {} - native screen share P0 tests", env!("CARGO_PKG_VERSION"));
    println!("Checking this machine...");
    let env = env::detect();
    println!(
        "Windows build {} | GPU: {}{} | monitors: {} ({} HDR) | audio output: {} | desktop: {}",
        env.caps.build,
        env.adapter.description,
        if env.software_gpu() { " (software)" } else { "" },
        env.monitors.len(),
        env.monitors.iter().filter(|m| m.hdr).count(),
        if env.audio_device { "yes" } else { "no" },
        env.desktop_reason.clone().unwrap_or_else(|| "yes".into())
    );
    if args.list {
        let hub = descall_capture::thumbs::ThumbnailHub::new();
        for s in hub.sources(false) {
            println!("  {:<22} {:<7} {:>5}x{:<5} {} {}", s.id, s.kind, s.width, s.height, s.name, s.exe.unwrap_or_default());
        }
        println!("{}", serde_json::to_string_pretty(&env.json()).unwrap_or_default());
        return 0;
    }
    println!("Do not touch the mouse or keyboard while the test windows are on screen.\n");

    let path = args.out.clone().unwrap_or_else(default_report_path);
    let machine = env.json();
    let mut results: Vec<TestResult> = Vec::new();
    // One group at a time: print its rows at once and rewrite the JSON report after it, so a
    // crash in a later group still leaves every earlier result on screen and on disk.
    let group = |label: &str, id: &str, run: &dyn Fn() -> Vec<TestResult>, results: &mut Vec<TestResult>| {
        println!("- {label}...");
        report::set_current(id);
        let rows = match std::panic::catch_unwind(std::panic::AssertUnwindSafe(run)) {
            Ok(rows) => rows,
            // Only reachable in an unwinding build (CI); the release exe aborts after the hook.
            Err(p) => vec![TestResult::new(&format!("{id}.panic"), &format!("{label}: bench panicked"), Status::Fail).note(report::panic_text(&*p))],
        };
        for r in &rows {
            println!("    {:<4} {}  {}{}", r.status.label(), r.name, r.measured, if r.note.is_empty() { String::new() } else { format!("  ({})", r.note) });
        }
        results.extend(rows);
        write_report(&path, &machine, results, &argv, false);
    };
    if args.wants("echo") {
        group("Echo test (3 tones, 4 s)", "echo", &|| {
            let mut v = echo::run(&env);
            v.push(echo::guard(&env));
            v
        }, &mut results);
    }
    if args.wants("picker") {
        group("Picker sources and live thumbnails", "picker", &|| vec![picker(&env)], &mut results);
    }
    if args.wants("video") {
        group(&format!("1080p60 run ({} s)", args.seconds), "video.1080p60", &|| video::run(&env, "hfr1080", "1080p60", args.seconds), &mut results);
        group(&format!("1440p60 run ({} s)", args.seconds), "video.1440p60", &|| video::run(&env, "hfr1440", "1440p60", args.seconds), &mut results);
    }
    if args.wants("follow") {
        group("Window follow", "follow", &|| follow::run(&env), &mut results);
    }
    if args.wants("color") {
        group("Colour and HDR", "color", &|| color::run(&env), &mut results);
    }
    // Extra rounds of the share-heavy groups in the same process.
    for round in 2..=args.repeat {
        let tag = |rows: Vec<TestResult>| report::tag_round(rows, round);
        if args.wants("video") {
            group(&format!("Round {round}: 1080p60 run ({} s)", args.seconds), &format!("video.1080p60.round{round}"), &|| tag(video::run(&env, "hfr1080", "1080p60", args.seconds)), &mut results);
            group(&format!("Round {round}: 1440p60 run ({} s)", args.seconds), &format!("video.1440p60.round{round}"), &|| tag(video::run(&env, "hfr1440", "1440p60", args.seconds)), &mut results);
        }
        if args.wants("follow") {
            group(&format!("Round {round}: window follow"), &format!("follow.round{round}"), &|| tag(follow::run(&env)), &mut results);
        }
    }
    // In-process capture once more, isolated in a child process: Windows' frame-pool thread
    // can kill the process when the GPU device is removed (the reason helper mode exists).
    if args.wants("inproc") && args.mode == "helper" {
        group("In-process mode (child process)", "inproc", &|| inproc_round(&env, args.seconds), &mut results);
    }
    let lost = descall_capture::d3d::device_lost_events();
    if !lost.is_empty() {
        let reasons: Vec<String> = lost.iter().map(|d| format!("{} ({})", d.reason, d.seen_in)).collect();
        results.push(
            TestResult::new("device.lost", "Capture device lost during the run (info)", Status::Info)
                .measured(format!("{} time(s)", lost.len()))
                .limit("-")
                .note(reasons.join(", "))
                .details(serde_json::to_value(&lost).unwrap_or_default()),
        );
    }
    if results.is_empty() {
        results.push(TestResult::new("none", "No test selected", Status::Skip));
    }

    println!();
    print!("{}", report::table(&results));
    write_report(&path, &machine, &results, &argv, true);
    let code = report::exit_code(&results);
    if !args.ci {
        println!("\nPress Enter to close.");
        let mut s = String::new();
        let _ = std::io::stdin().read_line(&mut s);
    }
    code
}

#[cfg(windows)]
fn write_report(path: &str, machine: &serde_json::Value, results: &[report::TestResult], argv: &[String], last: bool) {
    let mut doc = report::document(machine.clone(), results, argv);
    doc["captureMode"] = serde_json::json!(format!("{:?}", harness::mode()).split('(').next().unwrap_or_default());
    doc["deviceLost"] = serde_json::to_value(descall_capture::d3d::device_lost_events()).unwrap_or_default();
    match std::fs::write(path, serde_json::to_string_pretty(&doc).unwrap_or_default()) {
        Ok(()) if last => println!("JSON report: {path}"),
        Ok(()) => {}
        Err(e) => eprintln!("could not write {path}: {e}"),
    }
}

#[cfg(windows)]
fn default_report_path() -> String {
    let name = "descall-capture-report.json";
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.join(name)))
        .filter(|p| std::fs::OpenOptions::new().create(true).append(true).open(p).is_ok())
        .map(|p| p.display().to_string())
        .unwrap_or_else(|| name.to_string())
}

/// Video + follow with in-process capture, run by a child copy of the bench so a crash
/// inside Windows' capture code cannot end this run. Its rows come back tagged `.inproc`.
#[cfg(windows)]
fn inproc_round(env: &env::Env, seconds: u64) -> Vec<report::TestResult> {
    use report::{Status, TestResult};
    let (id, name) = ("inproc.run", "In-process capture run");
    let Ok(exe) = std::env::current_exe() else { return vec![TestResult::new(id, name, Status::Fail).note("no exe path")] };
    let out = std::env::temp_dir().join(format!("descall-bench-inproc-{}.json", std::process::id()));
    let _ = std::fs::remove_file(&out);
    let status = std::process::Command::new(&exe)
        .args(["--ci", "--mode", "inproc", "--only", "video,follow", "--seconds", &seconds.min(4).to_string(), "--out"])
        .arg(&out)
        .stdout(std::process::Stdio::null())
        .status();
    let code = status.as_ref().ok().and_then(|s| s.code()).unwrap_or(-1);
    let doc: Option<serde_json::Value> = std::fs::read_to_string(&out).ok().and_then(|t| serde_json::from_str(&t).ok());
    let _ = std::fs::remove_file(&out);
    let mut rows: Vec<TestResult> = Vec::new();
    if let Some(d) = &doc {
        for r in d["results"].as_array().into_iter().flatten() {
            let st = match r["status"].as_str() {
                Some("pass") => Status::Pass,
                Some("fail") => Status::Fail,
                Some("skip") => Status::Skip,
                _ => Status::Info,
            };
            rows.push(
                TestResult::new(&format!("{}.inproc", r["id"].as_str().unwrap_or("?")), &format!("{} [in-process]", r["name"].as_str().unwrap_or("?")), st)
                    .measured(r["measured"].as_str().unwrap_or_default())
                    .limit(r["limit"].as_str().unwrap_or_default())
                    .note(r["note"].as_str().unwrap_or_default()),
            );
        }
    }
    if code == 0 || code == 1 {
        rows.push(TestResult::new(id, name, Status::Pass).measured(format!("exit {code}")).limit("no crash"));
    } else {
        let lost = doc.as_ref().map(|d| d["deviceLost"].clone()).unwrap_or_default();
        let why = format!("in-process run crashed (exit 0x{:08X}) after {} result rows; helper mode survives this", code as u32, rows.len());
        let mut r = TestResult::cannot_run(id, name, env.software_gpu(), why).details(serde_json::json!({ "exitCode": code, "deviceLost": lost }));
        r.measured = format!("exit 0x{:08X}", code as u32);
        r.limit = "no crash".into();
        rows.push(r);
    }
    rows
}

/// The picker list with first thumbnails and icons, and how long it takes.
#[cfg(windows)]
fn picker(env: &env::Env) -> report::TestResult {
    use report::TestResult;
    let (id, name) = ("picker.sources", "Picker sources + live thumbnails");
    if let Some(r) = &env.desktop_reason {
        return TestResult::skip(id, name, r);
    }
    let hub = descall_capture::thumbs::ThumbnailHub::new();
    let t0 = std::time::Instant::now();
    let list = hub.sources(true);
    let first = t0.elapsed();
    let ids: Vec<String> = list.iter().map(|s| s.id.clone()).collect();
    let t1 = std::time::Instant::now();
    let again = hub.get(&ids, std::time::Duration::ZERO);
    let refresh = t1.elapsed();
    let screens = list.iter().filter(|s| s.kind == "screen").count();
    let with_thumb = list.iter().filter(|s| s.thumbnail_data_url.is_some()).count();
    let with_icon = list.iter().filter(|s| s.app_icon_data_url.is_some()).count();
    let bytes: usize = again.iter().filter_map(|t| t.thumbnail_data_url.as_ref().map(|u| u.len())).sum();
    TestResult::judged(id, name, screens > 0 && with_thumb >= screens)
        .measured(format!("{} sources, refresh {} ms", list.len(), refresh.as_millis()))
        .limit("every screen has a thumbnail")
        .details(serde_json::json!({
            "sources": list.len(), "screens": screens, "withThumbnail": with_thumb, "withIcon": with_icon,
            "firstListMs": first.as_millis() as u64, "refreshAllMs": refresh.as_millis() as u64, "thumbnailBytes": bytes,
        }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn a(v: &[&str]) -> Vec<String> {
        v.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn args() {
        let r = parse_args(&a(&["--ci", "--only", "echo,Video", "--seconds", "500", "--out", "x.json"])).unwrap();
        assert!(r.ci && r.wants("echo") && r.wants("video") && !r.wants("follow"));
        assert_eq!((r.seconds, r.out.as_deref()), (120, Some("x.json")));
        assert!(parse_args(&[]).unwrap().wants("hdr") || parse_args(&[]).unwrap().wants("color"));
        assert_eq!(parse_args(&a(&["--play-tone", "440", "8"])).unwrap().play_tone, Some(a(&["440", "8"])));
        assert_eq!(parse_args(&a(&["--repeat", "3"])).unwrap().repeat, 3);
        assert_eq!(parse_args(&[]).unwrap().mode, "helper");
        assert_eq!(parse_args(&a(&["--mode", "INPROC"])).unwrap().mode, "inproc");
        assert!(parse_args(&a(&["--mode", "gpu"])).is_err());
        assert!(parse_args(&a(&["--only", "inproc"])).unwrap().wants("inproc"));
        assert_eq!(parse_args(&a(&["--repeat", "99"])).unwrap().repeat, 10);
        assert_eq!(parse_args(&[]).unwrap().repeat, 1);
        assert!(parse_args(&a(&["--repeat", "x"])).is_err());
        assert!(parse_args(&a(&["--only", "nope"])).is_err());
        assert!(parse_args(&a(&["--seconds"])).is_err());
        assert!(parse_args(&a(&["--wat"])).is_err());
        assert_eq!(parse_args(&a(&["--help"])), Err(String::new()));
    }
}
