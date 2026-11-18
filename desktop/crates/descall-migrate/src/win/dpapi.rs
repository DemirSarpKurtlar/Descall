//! DPAPI (CryptProtectData / CryptUnprotectData), CurrentUser scope. Used for the handoff
//! file and for the new app's own secret store (token, account tokens, app-lock record),
//! the same primitive Chromium/Electron use under safeStorage on Windows.

use windows::Win32::Foundation::{LocalFree, HLOCAL};
use windows::Win32::Security::Cryptography::{CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB};

fn blob(data: &[u8]) -> CRYPT_INTEGER_BLOB {
    CRYPT_INTEGER_BLOB { cbData: data.len() as u32, pbData: data.as_ptr() as *mut u8 }
}

fn take(out: CRYPT_INTEGER_BLOB) -> Vec<u8> {
    let v = unsafe { std::slice::from_raw_parts(out.pbData, out.cbData as usize) }.to_vec();
    unsafe {
        let _ = LocalFree(Some(HLOCAL(out.pbData as *mut _)));
    }
    v
}

pub fn protect(plain: &[u8], entropy: Option<&[u8]>) -> crate::Result<Vec<u8>> {
    let input = blob(plain);
    let ent = entropy.map(blob);
    let mut out = CRYPT_INTEGER_BLOB::default();
    unsafe {
        CryptProtectData(&input, None, ent.as_ref().map(|e| e as *const _), None, None, CRYPTPROTECT_UI_FORBIDDEN, &mut out)?;
    }
    Ok(take(out))
}

pub fn unprotect(sealed: &[u8], entropy: Option<&[u8]>) -> crate::Result<Vec<u8>> {
    let input = blob(sealed);
    let ent = entropy.map(blob);
    let mut out = CRYPT_INTEGER_BLOB::default();
    unsafe {
        CryptUnprotectData(&input, None, ent.as_ref().map(|e| e as *const _), None, None, CRYPTPROTECT_UI_FORBIDDEN, &mut out)?;
    }
    Ok(take(out))
}

#[cfg(test)]
mod tests {
    #[test]
    fn round_trip_and_entropy_binding() {
        let sealed = super::protect(b"eyJhbGciOi.eyJzdWIiOiIx.c2ln", Some(b"descall/test")).unwrap();
        assert_eq!(super::unprotect(&sealed, Some(b"descall/test")).unwrap(), b"eyJhbGciOi.eyJzdWIiOiIx.c2ln");
        assert!(super::unprotect(&sealed, Some(b"other")).is_err(), "wrong entropy must fail");
    }
}
