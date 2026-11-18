//! Owner-only files for the handoff: DACL "D:P(A;;FA;;;OW)(A;;FA;;;SY)" (protected, the
//! owner and SYSTEM only; no inherited Users/Administrators ACEs), created with CREATE_NEW
//! so an attacker cannot pre-create the path, and deleted after import.

use std::os::windows::ffi::OsStrExt;
use std::path::Path;

use windows::core::{w, PCWSTR};
use windows::Win32::Foundation::{CloseHandle, HLOCAL, LocalFree};
use windows::Win32::Security::Authorization::{ConvertStringSecurityDescriptorToSecurityDescriptorW, SDDL_REVISION_1};
use windows::Win32::Security::{PSECURITY_DESCRIPTOR, SECURITY_ATTRIBUTES};
use windows::Win32::Storage::FileSystem::{CreateFileW, WriteFile, CREATE_NEW, FILE_ATTRIBUTE_NOT_CONTENT_INDEXED, FILE_GENERIC_WRITE, FILE_SHARE_NONE};

pub const OWNER_ONLY_SDDL: PCWSTR = w!("D:P(A;;FA;;;OW)(A;;FA;;;SY)");

pub fn write_owner_only(path: &Path, bytes: &[u8]) -> crate::Result<()> {
    let wide: Vec<u16> = path.as_os_str().encode_wide().chain([0]).collect();
    let mut sd = PSECURITY_DESCRIPTOR::default();
    unsafe {
        ConvertStringSecurityDescriptorToSecurityDescriptorW(OWNER_ONLY_SDDL, SDDL_REVISION_1, &mut sd, None)?;
        let sa = SECURITY_ATTRIBUTES { nLength: std::mem::size_of::<SECURITY_ATTRIBUTES>() as u32, lpSecurityDescriptor: sd.0, bInheritHandle: false.into() };
        let h = CreateFileW(PCWSTR(wide.as_ptr()), FILE_GENERIC_WRITE.0, FILE_SHARE_NONE, Some(&sa), CREATE_NEW, FILE_ATTRIBUTE_NOT_CONTENT_INDEXED, None);
        let _ = LocalFree(Some(HLOCAL(sd.0)));
        let h = h?;
        let mut written = 0u32;
        let r = WriteFile(h, Some(bytes), Some(&mut written), None);
        let _ = CloseHandle(h);
        r?;
    }
    Ok(())
}

/// Overwrite with zeros, then delete (best effort on SSDs, but the content is DPAPI-sealed
/// anyway; this only shortens its life).
pub fn shred(path: &Path) {
    if let Ok(meta) = std::fs::metadata(path) {
        let _ = std::fs::write(path, vec![0u8; meta.len() as usize]);
    }
    let _ = std::fs::remove_file(path);
}

#[cfg(test)]
mod tests {
    #[test]
    fn create_new_refuses_a_planted_file() {
        let p = std::env::temp_dir().join(format!("descall-handoff-test-{}.bin", std::process::id()));
        let _ = std::fs::remove_file(&p);
        super::write_owner_only(&p, b"sealed").unwrap();
        assert!(super::write_owner_only(&p, b"again").is_err(), "CREATE_NEW must not overwrite");
        assert_eq!(std::fs::read(&p).unwrap(), b"sealed");
        super::shred(&p);
        assert!(!p.exists());
    }
}
