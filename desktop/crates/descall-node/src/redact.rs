//! Log redaction. Every line this app writes (its own, the backend's stdout / stderr and
//! cloudflared's) passes through [`Redactor::redact`] before it reaches a file or the popover's
//! log viewer. Two layers:
//!
//! 1. the exact values of every stored secret (node key, tunnel token, Supabase service key,
//!    JWT secret, LiveKit keys, Key Value URL, extra env values), longest first;
//! 2. shapes that are secret whatever their value: node keys (`dsk_node_...`), JWT-like and
//!    cloudflared tokens (`eyJ...`), Supabase secret keys (`sb_secret_...`), `Bearer ...`,
//!    passwords inside URLs (`redis://user:pass@host`) and `KEY=value` / `"key": "value"` pairs
//!    whose name says secret, token, key or password.

use std::sync::OnceLock;

use regex::Regex;

pub const MASK: &str = "[gizli]";
/// Shorter values are not matched literally (they would hit ordinary words).
pub const MIN_LITERAL: usize = 6;

#[derive(Debug, Clone, Default)]
pub struct Redactor {
    literals: Vec<String>,
}

fn patterns() -> &'static [(Regex, &'static str)] {
    static P: OnceLock<Vec<(Regex, &'static str)>> = OnceLock::new();
    P.get_or_init(|| {
        let r = |s: &str| Regex::new(s).expect("static redaction pattern");
        vec![
            (r(r"dsk_node_[A-Za-z0-9_-]{8,}"), "dsk_node_[gizli]"),
            (r(r"sb_secret_[A-Za-z0-9_-]{8,}"), "sb_secret_[gizli]"),
            (r(r"eyJ[A-Za-z0-9_-]{8,}(?:\.[A-Za-z0-9_-]{4,}){0,2}"), MASK),
            (r(r"(?i)(bearer\s+)[A-Za-z0-9._~+/=-]{8,}"), "${1}[gizli]"),
            (r(r"([a-z][a-z0-9+.-]*://[^\s:/@]*:)[^\s@/]+@"), "${1}[gizli]@"),
            (r(r#"(?i)((?:[a-z0-9_-]*(?:secret|token|password|passwd|api[_-]?key|service[_-]?key|private[_-]?key|role[_-]?key))["']?\s*[:=]\s*["']?)[^\s"',;&]{4,}"#), "${1}[gizli]"),
            (r(r"(?i)(--token[\s=]+)\S+"), "${1}[gizli]"),
        ]
    })
}

impl Redactor {
    pub fn new<I: IntoIterator<Item = S>, S: AsRef<str>>(secrets: I) -> Redactor {
        let mut r = Redactor::default();
        r.set_secrets(secrets);
        r
    }

    pub fn set_secrets<I: IntoIterator<Item = S>, S: AsRef<str>>(&mut self, secrets: I) {
        let mut v: Vec<String> = secrets.into_iter().map(|s| s.as_ref().trim().to_string()).filter(|s| s.chars().count() >= MIN_LITERAL).collect();
        // Longest first: a secret that contains another is masked whole.
        v.sort_by_key(|s| std::cmp::Reverse(s.len()));
        v.dedup();
        self.literals = v;
    }

    pub fn literal_count(&self) -> usize {
        self.literals.len()
    }

    pub fn redact(&self, line: &str) -> String {
        let mut out = line.to_string();
        for s in &self.literals {
            if out.contains(s.as_str()) {
                out = out.replace(s.as_str(), MASK);
            }
        }
        for (re, rep) in patterns() {
            if re.is_match(&out) {
                out = re.replace_all(&out, *rep).into_owned();
            }
        }
        out
    }
}

/// Shape-only redaction (no stored secrets known yet, e.g. the first lines of a start).
pub fn redact_shapes(line: &str) -> String {
    Redactor::default().redact(line)
}

#[cfg(test)]
mod tests {
    use super::*;

    const NODE_KEY: &str = "dsk_node_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCd";
    const JWT: &str = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.c2lnbmF0dXJlLXZhbHVl";

    #[test]
    fn stored_secrets_never_reach_the_line() {
        let r = Redactor::new(["lk-secret-value-123", "short", "my-jwt-secret-xyz"]);
        assert_eq!(r.literal_count(), 2);
        let out = r.redact("livekit ok lk-secret-value-123 and my-jwt-secret-xyz; short stays");
        assert!(!out.contains("lk-secret-value-123") && !out.contains("my-jwt-secret-xyz"));
        assert!(out.contains("short stays"));
    }

    #[test]
    fn longest_secret_first() {
        let r = Redactor::new(["abcdefgh", "abcdefgh-ijkl"]);
        assert_eq!(r.redact("x abcdefgh-ijkl y"), "x [gizli] y");
    }

    #[test]
    fn known_shapes() {
        let cases = [
            (format!("register with {NODE_KEY} ok"), "dsk_node_[gizli]"),
            (format!("key={JWT}"), "[gizli]"),
            ("Authorization: Bearer abcdefghijklmnop".to_string(), "Bearer [gizli]"),
            ("REDIS_URL=rediss://default:p4ssw0rd-long@oregon-keyvalue.render.com:6379".to_string(), "[gizli]"),
            ("connect rediss://default:p4ssw0rd-long@host:6379 ok".to_string(), "default:[gizli]@host"),
            ("SUPABASE_SERVICE_ROLE_KEY=sb_secret_abcdefgh12345678".to_string(), "[gizli]"),
            (r#"{"jwtSecret": "s3cr3t-value"}"#.to_string(), "[gizli]"),
            ("cloudflared tunnel run --token eyJhIjoiYWJjZGVmIn0abcdef".to_string(), "--token [gizli]"),
        ];
        for (input, want) in cases {
            let out = redact_shapes(&input);
            assert!(out.contains(want), "{input} -> {out}");
            assert!(!out.contains("p4ssw0rd") && !out.contains("s3cr3t") && !out.contains("abcdefghijklmnop"), "{out}");
        }
    }

    #[test]
    fn ordinary_lines_stay() {
        for line in ["Server listening on port 3210", "[socket] 126 connections, p95 18 ms", "GET /api/node/health 200", "token bucket refilled"] {
            assert_eq!(redact_shapes(line), line);
        }
    }
}
