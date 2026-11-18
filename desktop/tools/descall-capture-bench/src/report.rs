//! Results, the console table and the JSON report (portable, unit-tested).

use serde::Serialize;
use serde_json::Value;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Status {
    Pass,
    Fail,
    Skip,
    Info,
}

impl Status {
    pub fn label(self) -> &'static str {
        match self {
            Status::Pass => "PASS",
            Status::Fail => "FAIL",
            Status::Skip => "SKIP",
            Status::Info => "INFO",
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct TestResult {
    /// Stable id for scripts ("echo.own_tone").
    pub id: String,
    pub name: String,
    pub status: Status,
    pub measured: String,
    pub limit: String,
    /// Why it was skipped / failed, or a note.
    pub note: String,
    pub details: Value,
}

impl TestResult {
    pub fn new(id: &str, name: &str, status: Status) -> Self {
        TestResult { id: id.into(), name: name.into(), status, measured: String::new(), limit: String::new(), note: String::new(), details: Value::Null }
    }

    pub fn skip(id: &str, name: &str, why: &str) -> Self {
        Self::new(id, name, Status::Skip).note(why)
    }

    pub fn measured(mut self, m: impl Into<String>) -> Self {
        self.measured = m.into();
        self
    }

    pub fn limit(mut self, l: impl Into<String>) -> Self {
        self.limit = l.into();
        self
    }

    pub fn note(mut self, n: impl Into<String>) -> Self {
        self.note = n.into();
        self
    }

    pub fn details(mut self, d: Value) -> Self {
        self.details = d;
        self
    }

    /// PASS when `ok`, FAIL otherwise.
    pub fn judged(id: &str, name: &str, ok: bool) -> Self {
        Self::new(id, name, if ok { Status::Pass } else { Status::Fail })
    }
}

#[derive(Debug, Clone, Copy, Default, Serialize, PartialEq, Eq)]
pub struct Summary {
    pub pass: usize,
    pub fail: usize,
    pub skip: usize,
    pub info: usize,
}

pub fn summarize(results: &[TestResult]) -> Summary {
    let mut s = Summary::default();
    for r in results {
        match r.status {
            Status::Pass => s.pass += 1,
            Status::Fail => s.fail += 1,
            Status::Skip => s.skip += 1,
            Status::Info => s.info += 1,
        }
    }
    s
}

/// 0 = no failure, 1 = at least one FAIL.
pub fn exit_code(results: &[TestResult]) -> i32 {
    if summarize(results).fail > 0 {
        1
    } else {
        0
    }
}

fn clip(s: &str, n: usize) -> String {
    if s.chars().count() <= n {
        s.to_string()
    } else {
        let mut t: String = s.chars().take(n.saturating_sub(3)).collect();
        t.push_str("...");
        t
    }
}

/// Fixed-width ASCII table, one row per result, notes on an indented second line.
pub fn table(results: &[TestResult]) -> String {
    const W: [usize; 4] = [44, 6, 26, 18];
    let line = format!("+{}+{}+{}+{}+\n", "-".repeat(W[0] + 2), "-".repeat(W[1] + 2), "-".repeat(W[2] + 2), "-".repeat(W[3] + 2));
    let row = |a: &str, b: &str, c: &str, d: &str| format!("| {:<w0$} | {:<w1$} | {:<w2$} | {:<w3$} |\n", clip(a, W[0]), clip(b, W[1]), clip(c, W[2]), clip(d, W[3]), w0 = W[0], w1 = W[1], w2 = W[2], w3 = W[3]);
    let mut out = String::new();
    out.push_str(&line);
    out.push_str(&row("Test", "Result", "Measured", "Limit"));
    out.push_str(&line);
    for r in results {
        out.push_str(&row(&r.name, r.status.label(), &r.measured, &r.limit));
        if !r.note.is_empty() {
            out.push_str(&row(&format!("  {}", r.note), "", "", ""));
        }
    }
    out.push_str(&line);
    let s = summarize(results);
    out.push_str(&format!("PASS {}  FAIL {}  SKIP {}  INFO {}  ->  {}\n", s.pass, s.fail, s.skip, s.info, if s.fail == 0 { "P0 OK" } else { "P0 FAILED" }));
    out
}

/// UNIX seconds to "YYYY-MM-DDTHH:MM:SSZ" (civil-from-days, no time crate).
pub fn iso8601(secs: u64) -> String {
    let days = (secs / 86_400) as i64;
    let rem = secs % 86_400;
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + if m <= 2 { 1 } else { 0 };
    format!("{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}Z", rem / 3600, (rem / 60) % 60, rem % 60)
}

pub fn now_iso() -> String {
    iso8601(std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0))
}

pub fn document(machine: Value, results: &[TestResult], args: &[String]) -> Value {
    serde_json::json!({
        "tool": "descall-capture-bench",
        "version": env!("CARGO_PKG_VERSION"),
        "reportVersion": 1,
        "generatedAt": now_iso(),
        "args": args,
        "machine": machine,
        "summary": summarize(results),
        "ok": exit_code(results) == 0,
        "results": results,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn summary_and_exit_code() {
        let mut v = vec![TestResult::judged("a", "A", true), TestResult::skip("b", "B", "no desktop session"), TestResult::new("c", "C", Status::Info)];
        assert_eq!(summarize(&v), Summary { pass: 1, fail: 0, skip: 1, info: 1 });
        assert_eq!(exit_code(&v), 0);
        v.push(TestResult::judged("d", "D", false));
        assert_eq!(exit_code(&v), 1);
    }

    #[test]
    fn table_has_rows_notes_and_verdict() {
        let v = vec![
            TestResult::judged("echo.own_tone", "Echo: own 1 kHz tone", true).measured("-92.4 dBFS").limit("< -60 dBFS"),
            TestResult::skip("video.1440p60", "1440p60 capture", "skipped (no desktop session)"),
        ];
        let t = table(&v);
        assert!(t.contains("| Echo: own 1 kHz tone"));
        assert!(t.contains("PASS") && t.contains("SKIP"));
        assert!(t.contains("  skipped (no desktop session)"));
        assert!(t.trim_end().ends_with("P0 OK"));
        let widths: Vec<usize> = t.lines().filter(|l| l.starts_with('|') || l.starts_with('+')).map(|l| l.chars().count()).collect();
        assert!(widths.windows(2).all(|w| w[0] == w[1]), "ragged table");
        assert!(table(&[TestResult::judged("x", &"y".repeat(80), false)]).contains("..."));
    }

    #[test]
    fn iso_dates() {
        assert_eq!(iso8601(0), "1970-01-01T00:00:00Z");
        assert_eq!(iso8601(951_782_400), "2000-02-29T00:00:00Z");
        assert_eq!(iso8601(1_794_960_000 + 3661), "2026-11-18T01:01:01Z");
    }

    #[test]
    fn json_document() {
        let v = vec![TestResult::judged("a", "A", false).details(serde_json::json!({"p95": 3.2}))];
        let d = document(serde_json::json!({"build": 26100}), &v, &["--ci".into()]);
        assert_eq!(d["ok"], false);
        assert_eq!(d["summary"]["fail"], 1);
        assert_eq!(d["results"][0]["status"], "fail");
        assert_eq!(d["results"][0]["details"]["p95"], 3.2);
        assert_eq!(d["machine"]["build"], 26100);
    }
}
