//! App lock PIN hashing (port of electron/premium/pinHash.cjs). scrypt with a random 16-byte
//! salt, the same parameters and record shape as Electron, so a migrated record still
//! verifies. The caller seals the record at rest (DPAPI). Comparison is constant time.

use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use serde_json::{json, Value};

pub const N: u64 = 16384;
pub const R: u32 = 8;
pub const P: u32 = 1;
pub const KEYLEN: usize = 32;

pub fn valid_pin(pin: &str) -> bool {
    (4..=12).contains(&pin.len()) && pin.bytes().all(|b| b.is_ascii_digit())
}

fn derive(pin: &str, salt: &[u8], n: u64, r: u32, p: u32, len: usize) -> Option<Vec<u8>> {
    if !n.is_power_of_two() || n < 2 || len == 0 || len > 64 || r == 0 || p == 0 || (r as u64) * (p as u64) >= 1 << 30 {
        return None;
    }
    // 128 * N * r bytes must stay under Electron's maxmem (64 MiB).
    if 128u64.saturating_mul(n).saturating_mul(r as u64) > 64 * 1024 * 1024 {
        return None;
    }
    let params = scrypt::Params::new(n.trailing_zeros() as u8, r, p, len).ok()?;
    let mut out = vec![0u8; len];
    scrypt::scrypt(pin.as_bytes(), salt, &params, &mut out).ok()?;
    Some(out)
}

/// Record `{ v: 1, salt, hash, N, r, p, keylen }` (base64 fields), or None for an invalid PIN.
pub fn hash_pin(pin: &str, salt: Option<[u8; 16]>) -> Option<Value> {
    if !valid_pin(pin) {
        return None;
    }
    let salt = match salt {
        Some(s) => s,
        None => {
            let mut s = [0u8; 16];
            getrandom::fill(&mut s).ok()?;
            s
        }
    };
    let key = derive(pin, &salt, N, R, P, KEYLEN)?;
    Some(json!({ "v": 1, "salt": B64.encode(salt), "hash": B64.encode(key), "N": N, "r": R, "p": P, "keylen": KEYLEN }))
}

fn ct_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

pub fn verify_pin(pin: &str, record: Option<&Value>) -> bool {
    let Some(rec) = record else { return false };
    if rec.get("v").and_then(Value::as_u64) != Some(1) || !valid_pin(pin) {
        return false;
    }
    let field = |k: &str| rec.get(k).and_then(Value::as_str).and_then(|s| B64.decode(s).ok());
    let (Some(salt), Some(want)) = (field("salt"), field("hash")) else { return false };
    let num = |k: &str, d: u64| rec.get(k).and_then(Value::as_u64).unwrap_or(d);
    match derive(pin, &salt, num("N", N), num("r", R as u64) as u32, num("p", P as u64) as u32, want.len()) {
        Some(got) => ct_eq(&got, &want),
        None => false,
    }
}

/// Lockout after repeated failures: 5 free tries, then 30 s doubling up to 15 min.
pub fn lockout_ms(failures: u32) -> u64 {
    if failures < 5 {
        return 0;
    }
    let shift = (failures - 5).min(20);
    (30_000u64 << shift).min(15 * 60 * 1000)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pins() {
        assert!(valid_pin("1234"));
        assert!(!valid_pin("123"));
        assert!(!valid_pin("12a4"));
        assert!(!valid_pin("1234567890123"));
        assert!(hash_pin("12", None).is_none());

        let rec = hash_pin("482913", None).unwrap();
        assert_eq!(rec["v"], 1);
        assert!(!rec.to_string().contains("482913"), "PIN never stored in clear");
        assert_eq!(B64.decode(rec["salt"].as_str().unwrap()).unwrap().len(), 16);
        assert!(verify_pin("482913", Some(&rec)));
        assert!(!verify_pin("482914", Some(&rec)));
        assert!(!verify_pin("", Some(&rec)));
        assert!(!verify_pin("482913", None));
        let mut bad = rec.clone();
        bad["hash"] = json!(B64.encode([0u8; 32]));
        assert!(!verify_pin("482913", Some(&bad)));

        let rec2 = hash_pin("482913", None).unwrap();
        assert_ne!(rec2["salt"], rec["salt"]);
        assert_ne!(rec2["hash"], rec["hash"]);
        assert!(verify_pin("482913", Some(&rec2)));

        assert_eq!(lockout_ms(0), 0);
        assert_eq!(lockout_ms(4), 0);
        assert_eq!(lockout_ms(5), 30_000);
        assert_eq!(lockout_ms(6), 60_000);
        assert_eq!(lockout_ms(30), 15 * 60_000);
    }

    #[test]
    fn electron_record_still_verifies() {
        // pinHash.cjs hashPin("482913", Buffer.alloc(16, 7)) on Node 22.
        let electron = json!({"v":1,"salt":"BwcHBwcHBwcHBwcHBwcHBw==","hash":"ceeAK31Hn4nX2Tc8d90Uv1PQjkNcKRPltOgCXgQLdwc=","N":16384,"r":8,"p":1,"keylen":32});
        assert!(verify_pin("482913", Some(&electron)));
        assert!(!verify_pin("482912", Some(&electron)));
        assert_eq!(hash_pin("482913", Some([7u8; 16])).unwrap()["hash"], electron["hash"]);
    }
}
