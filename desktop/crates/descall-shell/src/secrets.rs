//! Sign-in secrets out of anything the shell writes down or reports: main.log lines (the
//! shell's own and the page's), the crash file and `app:main-error` summaries (Sentry).
//!
//! What counts: JSON Web Tokens (Supabase access tokens, signed-URL tokens), the word after
//! `Bearer`, and the value of a secret-looking URL / form / JSON parameter (`token=`,
//! `refresh_token=`, `X-Amz-Signature=`, `"access_token":"..."`). Supabase refresh tokens and
//! storage signatures are not JWTs, so the JWT rule alone let them through, and the shell's
//! own lines were not redacted at all: a failed download logged reqwest's
//! "error sending request for url (https://...supabase.co/storage/v1/object/sign/x?token=...)".
//! Whitespace and everything else are kept as they are.

pub const TOKEN: &str = "<token>";
pub const REDACTED: &str = "<redacted>";

/// Parameter names whose value is a secret (compared without case).
const SECRET_KEYS: &[&str] = &[
    "token",
    "access_token",
    "refresh_token",
    "id_token",
    "provider_token",
    "provider_refresh_token",
    "auth_token",
    "authtoken",
    "session_token",
    "jwt",
    "apikey",
    "api_key",
    "password",
    "passwd",
    "secret",
    "client_secret",
    "signature",
    "sig",
    "x-amz-signature",
    "x-amz-credential",
    "x-amz-security-token",
    "x-goog-signature",
    "x-goog-credential",
    "authorization",
];

fn is_jwt(part: &str) -> bool {
    part.starts_with("eyJ") && part.matches('.').count() >= 2 && part.len() > 20
}

/// A word that is or contains a JWT.
fn has_jwt(word: &str) -> bool {
    word.split(|c: char| !(c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))).any(is_jwt)
}

fn is_key_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || matches!(c, '_' | '-')
}

fn ends_value(c: char) -> bool {
    matches!(c, '&' | '#' | ';' | '"' | '\'' | ')' | ',' | ']' | '}' | '<' | '>')
}

/// Replace the values of secret parameters inside one word (no whitespace in it).
fn redact_params(word: &str) -> String {
    let chars: Vec<char> = word.chars().collect();
    let mut out = String::with_capacity(word.len());
    let mut i = 0;
    while i < chars.len() {
        // A key starts at the word start or after a separator.
        let at_key_start = i == 0 || matches!(chars[i - 1], '?' | '&' | '#' | ';' | '"' | '\'' | '(' | ',' | '{' | '[');
        if at_key_start && is_key_char(chars[i]) {
            let mut j = i;
            while j < chars.len() && is_key_char(chars[j]) {
                j += 1;
            }
            let key: String = chars[i..j].iter().collect();
            // key=value, key:value or "key":"value" (JSON).
            let mut k = j;
            if k < chars.len() && chars[k] == '"' {
                k += 1;
            }
            let sep = k < chars.len() && (chars[k] == '=' || chars[k] == ':');
            if sep && SECRET_KEYS.iter().any(|s| s.eq_ignore_ascii_case(&key)) {
                k += 1;
                let quoted = k < chars.len() && chars[k] == '"';
                if quoted {
                    k += 1;
                }
                let start = k;
                while k < chars.len() && !ends_value(chars[k]) {
                    k += 1;
                }
                out.extend(&chars[i..start]);
                if k > start {
                    out.push_str(REDACTED);
                }
                i = k;
                continue;
            }
            out.extend(&chars[i..j]);
            i = j;
            continue;
        }
        out.push(chars[i]);
        i += 1;
    }
    out
}

/// `text` without sign-in secrets; whitespace kept.
pub fn redact(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut bearer = false;
    let mut word = String::new();
    let flush = |word: &mut String, out: &mut String, bearer: &mut bool| {
        if word.is_empty() {
            return;
        }
        if *bearer || has_jwt(word) {
            out.push_str(TOKEN);
        } else {
            out.push_str(&redact_params(word));
        }
        *bearer = word.trim_matches(|c: char| !c.is_ascii_alphabetic()).eq_ignore_ascii_case("bearer");
        word.clear();
    };
    for c in text.chars() {
        if c.is_whitespace() {
            flush(&mut word, &mut out, &mut bearer);
            out.push(c);
        } else {
            word.push(c);
        }
    }
    flush(&mut word, &mut out, &mut bearer);
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    const JWT: &str = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJlLXNpZ25hdHVyZQ";

    #[test]
    fn jwts_and_bearer_values() {
        assert_eq!(redact(&format!("Authorization: Bearer abc.def.ghi token={JWT} done")), "Authorization: Bearer <token> <token> done");
        assert_eq!(redact(&format!("{{\"a\":\"{JWT}\"}}")), "<token>");
        assert_eq!(redact("bearer: xyz next"), "bearer: <token> next");
    }

    /// reqwest's error text for a failed download of a signed attachment URL (download_file).
    #[test]
    fn signed_urls_in_shell_errors() {
        let line = "[download] error sending request for url (https://abc.supabase.co/storage/v1/object/sign/att/a.pdf?token=v2.local.SECRET123&download=a.pdf)";
        let r = redact(line);
        assert!(!r.contains("SECRET123"), "{r}");
        assert_eq!(r, "[download] error sending request for url (https://abc.supabase.co/storage/v1/object/sign/att/a.pdf?token=<redacted>&download=a.pdf)");
        let s3 = redact("GET https://b.s3.amazonaws.com/x?X-Amz-Credential=AKIA1%2F2&X-Amz-Signature=deadbeef&X-Amz-Expires=60 403");
        assert!(!s3.contains("AKIA1") && !s3.contains("deadbeef") && s3.contains("X-Amz-Expires=60"), "{s3}");
    }

    #[test]
    fn non_jwt_session_secrets() {
        let r = redact("[auth] callback https://tauri.localhost/#access_token=short&refresh_token=r3fr3sh&expires_in=3600");
        assert!(!r.contains("r3fr3sh") && !r.contains("short&"), "{r}");
        assert!(r.contains("expires_in=3600"));
        let j = redact(r#"session {"refresh_token":"r3fr3sh","user":"ayse"}"#);
        assert_eq!(j, r#"session {"refresh_token":"<redacted>","user":"ayse"}"#);
        assert_eq!(redact("apikey=sb_publishable_x ok"), "apikey=<redacted> ok");
        assert_eq!(redact("password:hunter2"), "password:<redacted>");
    }

    #[test]
    fn ordinary_text_is_untouched() {
        for t in [
            "[Shop] state ready",
            "[boot] page app-mounted (812 ms)",
            "a\n  b\tc",
            "tokens left: 3",
            "notoken=1 mytoken=2",
            "https://descall.com/servers/join/AbC123?ref=x",
            "status code=500",
            "",
        ] {
            assert_eq!(redact(t), t);
        }
    }

    /// A JWT cut in half (a log line shortened to 120 characters) is not recognised any more,
    /// so callers that shorten redact first (boot::main_navigation).
    #[test]
    fn redact_before_cutting() {
        let url = format!("https://e.example/p/{JWT}/x");
        let cut_first: String = url.chars().take(50).collect();
        assert!(!has_jwt(&cut_first), "a cut token no longer matches");
        let ok: String = redact(&url).chars().take(50).collect();
        assert!(!ok.contains("eyJ"), "{ok}");
        let boot = include_str!("../../../app/src-tauri/src/boot.rs");
        assert!(boot.contains("secrets::redact(url.as_str()).chars().take(120)"), "main_navigation redacts, then cuts");
    }

    /// The DPAPI store (app/src-tauri/src/secure_store.rs): sealed with per-purpose entropy,
    /// written through a temp file and a rename (a torn write left an unreadable token and a
    /// signed-out user), and clearing an absent entry counts as cleared.
    #[test]
    fn secure_store_writes_atomically() {
        let src = include_str!("../../../app/src-tauri/src/secure_store.rs");
        assert!(src.contains("dpapi::protect(value.as_bytes(), Some(entropy.as_bytes()))"));
        // Temp file + rename, retried, never a stale previous token (crate::durable, tested there).
        assert!(src.contains("descall_shell::durable::replace(&p, &sealed)"));
        assert!(src.contains("descall_shell::durable::remove(&p)"));
        assert!(!src.contains("std::fs::write(p, sealed)"), "no direct in-place write of the sealed token");
        let durable = include_str!("durable.rs");
        assert!(durable.contains("tmp.push(\".tmp\")") && durable.contains("ErrorKind::NotFound"));
    }

    #[test]
    fn multi_byte_text_does_not_panic() {
        assert_eq!(redact("çağrı token=ş€crét bitti"), "çağrı token=<redacted> bitti");
    }
}
