//! Native crash reporter for the owner's PC: a crash in OS or driver code (access violation,
//! heap corruption, fail-fast) kills the process without a Rust panic, so the console used to
//! show nothing after the group title. A vectored exception handler now prints, for the first
//! few fatal-looking exceptions:
//!
//! 1. one line with the code, the test group, the last step and module+offset of the fault,
//!    written from a stack buffer (no heap use: after heap corruption the heap may be locked);
//! 2. the raw call stack as module+offset, also heap-free;
//! 3. a symbolized Rust backtrace (uses the heap; works when the pdb sits next to the exe and
//!    the heap is still usable, e.g. with full page heap on, see the Turkish guide).
//!
//! The handler only observes: it returns EXCEPTION_CONTINUE_SEARCH, so a first-chance
//! exception that some system DLL handles itself carries on as before (the report says
//! "first chance" for that reason).

use std::fmt::Write as _;
use std::io::Write as _;
use std::sync::atomic::{AtomicUsize, Ordering};

use windows::core::PCWSTR;
use windows::Win32::Foundation::HMODULE;
use windows::Win32::System::Diagnostics::Debug::{AddVectoredExceptionHandler, RtlCaptureStackBackTrace, EXCEPTION_POINTERS};
use windows::Win32::System::LibraryLoader::{GetModuleFileNameW, GetModuleHandleExW, GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS, GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT};

/// Access violation, heap corruption, stack buffer overrun / fail-fast, stack overflow,
/// illegal instruction, integer divide by zero, assertion failure, and the breakpoint that
/// page heap raises when it catches a bad free (no debugger attached: the process ends).
const FATAL: [u32; 8] = [0xC000_0005, 0xC000_0374, 0xC000_0409, 0xC000_00FD, 0xC000_001D, 0xC000_0094, 0xC000_0420, 0x8000_0003];
const MAX_REPORTS: usize = 6;
const EXCEPTION_CONTINUE_SEARCH: i32 = 0;

static REPORTS: AtomicUsize = AtomicUsize::new(0);

/// Last step the test announced (fixed buffer, readable without the heap).
static STEP: std::sync::Mutex<[u8; 96]> = std::sync::Mutex::new([0; 96]);

/// Record the step that is about to run (also printed as a progress line by the caller).
pub fn set_step(s: &str) {
    if let Ok(mut b) = STEP.lock() {
        *b = [0; 96];
        let n = s.len().min(95);
        b[..n].copy_from_slice(&s.as_bytes()[..n]);
    }
}

pub fn install() {
    unsafe {
        let _ = AddVectoredExceptionHandler(1, Some(handler));
    }
}

/// Small fixed-size text buffer: `core::fmt` into it never allocates.
struct Line {
    b: [u8; 1024],
    n: usize,
}

impl Line {
    fn new() -> Self {
        Line { b: [0; 1024], n: 0 }
    }
    fn flush(&mut self) {
        // stderr only: on the console stdout and stderr are the same screen (printing to both
        // showed every line twice), and CI merges them with 2>&1.
        let _ = std::io::stdout().flush();
        let _ = std::io::stderr().write_all(&self.b[..self.n]);
        self.n = 0;
    }
}

impl std::fmt::Write for Line {
    fn write_str(&mut self, s: &str) -> std::fmt::Result {
        let room = self.b.len() - self.n;
        let k = s.len().min(room);
        self.b[self.n..self.n + k].copy_from_slice(&s.as_bytes()[..k]);
        self.n += k;
        Ok(())
    }
}

/// "name.dll+0x1234" for a code address, without the heap.
fn write_module(out: &mut Line, addr: usize) {
    unsafe {
        let mut m = HMODULE::default();
        let flags = GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT;
        if GetModuleHandleExW(flags, PCWSTR(addr as *const u16), &mut m).is_err() || m.is_invalid() {
            let _ = write!(out, "0x{addr:X}");
            return;
        }
        let mut path = [0u16; 260];
        let n = GetModuleFileNameW(Some(m), &mut path) as usize;
        let name = path[..n].rsplit(|&c| c == b'\\' as u16).next().unwrap_or(&[]);
        for &c in name {
            let _ = out.write_char(char::from_u32(c as u32).filter(|c| c.is_ascii()).unwrap_or('?'));
        }
        let _ = write!(out, "+0x{:X}", addr.wrapping_sub(m.0 as usize));
    }
}

unsafe extern "system" fn handler(info: *mut EXCEPTION_POINTERS) -> i32 {
    unsafe {
        if info.is_null() || (*info).ExceptionRecord.is_null() {
            return EXCEPTION_CONTINUE_SEARCH;
        }
        let rec = &*(*info).ExceptionRecord;
        let code = rec.ExceptionCode.0 as u32;
        if !FATAL.contains(&code) || REPORTS.fetch_add(1, Ordering::SeqCst) >= MAX_REPORTS {
            return EXCEPTION_CONTINUE_SEARCH;
        }
        let mut line = Line::new();
        let _ = write!(line, "\nNATIVE EXCEPTION 0x{code:08X} (first chance) at ");
        write_module(&mut line, rec.ExceptionAddress as usize);
        if let Ok(step) = STEP.try_lock() {
            let n = step.iter().position(|&c| c == 0).unwrap_or(step.len());
            let _ = write!(line, " | step: {}", std::str::from_utf8(&step[..n]).unwrap_or("?"));
        }
        if code == 0xC000_0005 && rec.NumberParameters >= 2 {
            let kind = match rec.ExceptionInformation[0] {
                0 => "read",
                1 => "write",
                8 => "execute",
                _ => "access",
            };
            let _ = write!(line, " | {kind} of 0x{:X}", rec.ExceptionInformation[1]);
        }
        let _ = writeln!(line);
        line.flush();

        let mut frames = [std::ptr::null_mut(); 48];
        let n = RtlCaptureStackBackTrace(0, &mut frames, None) as usize;
        let _ = writeln!(line, "raw stack ({n} frames):");
        line.flush();
        for (i, f) in frames[..n].iter().enumerate() {
            let _ = write!(line, "  #{i:02} ");
            write_module(&mut line, *f as usize);
            let _ = writeln!(line);
            line.flush();
        }

        // Symbolized backtrace: needs the heap. Skip it for heap corruption (the heap lock
        // may be held and this would hang the report); run with page heap to catch the
        // corrupting write itself as an access violation instead.
        if code != 0xC000_0374 {
            let bt = std::backtrace::Backtrace::force_capture();
            let text = format!("backtrace:\n{bt}\n");
            let _ = std::io::stderr().write_all(text.as_bytes());
        } else {
            let _ = writeln!(line, "(heap corruption: symbolized backtrace skipped; see docs/desktop/ekran-paylasimi-testi.md, page heap)");
            line.flush();
        }
        EXCEPTION_CONTINUE_SEARCH
    }
}
