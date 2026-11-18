//! Owner-only files for the handoff: DACL "D:P(A;;FA;;;OW)(A;;FA;;;SY)" (protected: the
//! owner and SYSTEM only, no inherited Users/Administrators entries), created with
//! CREATE_NEW so nobody can pre-create the path, shredded after use. The work folder gets
//! the same DACL.

use std::os::windows::ffi::OsStrExt;
use std::path::Path;

use windows::core::{w, PCWSTR};
use windows::Win32::Foundation::{CloseHandle, LocalFree, HLOCAL};
use windows::Win32::Security::Authorization::{ConvertStringSecurityDescriptorToSecurityDescriptorW, SDDL_REVISION_1};
use windows::Win32::Security::{PSECURITY_DESCRIPTOR, SECURITY_ATTRIBUTES};
use windows::Win32::Storage::FileSystem::{
    CreateDirectoryW, CreateFileW, FlushFileBuffers, WriteFile, CREATE_NEW, FILE_ATTRIBUTE_NOT_CONTENT_INDEXED, FILE_GENERIC_WRITE, FILE_SHARE_NONE,
};

pub const OWNER_ONLY_SDDL: PCWSTR = w!("D:P(A;;FA;;;OW)(A;;FA;;;SY)");
pub const OWNER_ONLY_DIR_SDDL: PCWSTR = w!("D:P(A;OICI;FA;;;OW)(A;OICI;FA;;;SY)");

fn wide(path: &Path) -> Vec<u16> {
    path.as_os_str().encode_wide().chain([0]).collect()
}

struct Sd(PSECURITY_DESCRIPTOR);
impl Drop for Sd {
    fn drop(&mut self) {
        unsafe {
            let _ = LocalFree(Some(HLOCAL(self.0 .0)));
        }
    }
}

fn sd(sddl: PCWSTR) -> crate::Result<Sd> {
    let mut sd = PSECURITY_DESCRIPTOR::default();
    unsafe { ConvertStringSecurityDescriptorToSecurityDescriptorW(sddl, SDDL_REVISION_1, &mut sd, None)? };
    Ok(Sd(sd))
}

/// Create `bytes` at `path` (fails if it exists), owner + SYSTEM only, flushed to disk.
pub fn write_owner_only(path: &Path, bytes: &[u8]) -> crate::Result<()> {
    let w = wide(path);
    let sd = sd(OWNER_ONLY_SDDL)?;
    let sa = SECURITY_ATTRIBUTES { nLength: std::mem::size_of::<SECURITY_ATTRIBUTES>() as u32, lpSecurityDescriptor: sd.0 .0, bInheritHandle: false.into() };
    unsafe {
        let h = CreateFileW(PCWSTR(w.as_ptr()), FILE_GENERIC_WRITE.0, FILE_SHARE_NONE, Some(&sa), CREATE_NEW, FILE_ATTRIBUTE_NOT_CONTENT_INDEXED, None)?;
        let mut written = 0u32;
        let r = WriteFile(h, Some(bytes), Some(&mut written), None);
        let f = FlushFileBuffers(h);
        let _ = CloseHandle(h);
        r?;
        f?;
        if written as usize != bytes.len() {
            let _ = std::fs::remove_file(path);
            return Err(std::io::Error::from(std::io::ErrorKind::WriteZero).into());
        }
    }
    Ok(())
}

/// Create the work folder with an owner-only DACL (existing folders are left as they are).
pub fn create_owner_only_dir(dir: &Path) -> crate::Result<()> {
    if dir.exists() {
        return Ok(());
    }
    if let Some(parent) = dir.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let w = wide(dir);
    let sd = sd(OWNER_ONLY_DIR_SDDL)?;
    let sa = SECURITY_ATTRIBUTES { nLength: std::mem::size_of::<SECURITY_ATTRIBUTES>() as u32, lpSecurityDescriptor: sd.0 .0, bInheritHandle: false.into() };
    unsafe { CreateDirectoryW(PCWSTR(w.as_ptr()), Some(&sa))? };
    Ok(())
}

/// Overwrite with zeros, then delete (best effort on SSDs; the content is DPAPI-sealed
/// anyway, this only shortens its life).
pub fn shred(path: &Path) {
    if let Ok(meta) = std::fs::metadata(path) {
        if let Ok(mut f) = std::fs::OpenOptions::new().write(true).open(path) {
            use std::io::Write;
            let _ = f.write_all(&vec![0u8; meta.len() as usize]);
            let _ = f.sync_all();
        }
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
