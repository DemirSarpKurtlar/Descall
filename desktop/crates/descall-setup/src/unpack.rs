//! Unpacks the verified payload zip into a staging folder next to the install folder.
//! Paths are sanitised (no `..`, no absolute paths, no drive letters); anything odd aborts.

use std::fs::{self, File};
#[cfg(test)]
use std::io::Seek;
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct Unpacked {
    pub files: u32,
    pub bytes: u64,
}

#[cfg(test)]
pub fn file_count<R: Read + Seek>(reader: R) -> io::Result<u32> {
    let z = zip::ZipArchive::new(reader).map_err(io::Error::other)?;
    Ok((0..z.len()).filter(|i| z.name_for_index(*i).is_some_and(|n| n.is_ok_and(|n| !n.ends_with('/')))).count() as u32)
}

/// Extracts `zip_path` into `dest` (created). `progress(done, total)` after every file.
pub fn extract(zip_path: &Path, dest: &Path, cancel: &AtomicBool, mut progress: impl FnMut(u32, u32)) -> io::Result<Unpacked> {
    let mut z = zip::ZipArchive::new(File::open(zip_path)?).map_err(io::Error::other)?;
    let total = (0..z.len()).filter(|i| z.name_for_index(*i).is_some_and(|n| n.is_ok_and(|n| !n.ends_with('/')))).count() as u32;
    fs::create_dir_all(dest)?;
    let mut out = Unpacked::default();
    let mut buf = vec![0u8; 256 * 1024];
    for i in 0..z.len() {
        if cancel.load(Ordering::Relaxed) {
            return Err(io::Error::new(io::ErrorKind::Interrupted, "cancelled"));
        }
        let mut entry = z.by_index(i).map_err(io::Error::other)?;
        let rel: PathBuf = entry
            .enclosed_name()
            .filter(|p| p.components().all(|c| matches!(c, std::path::Component::Normal(_))))
            .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidData, format!("unsafe path in payload: {}", entry.name().map(|n| n.into_owned()).unwrap_or_default())))?;
        let target = dest.join(&rel);
        if entry.is_dir() {
            fs::create_dir_all(&target)?;
            continue;
        }
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent)?;
        }
        let mut f = File::create(&target)?;
        loop {
            let n = entry.read(&mut buf)?;
            if n == 0 {
                break;
            }
            f.write_all(&buf[..n])?;
            out.bytes += n as u64;
        }
        f.sync_all()?;
        out.files += 1;
        progress(out.files, total);
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_fixture_payload() {
        let tmp = std::env::temp_dir().join(format!("descall-setup-unpack-{}", std::process::id()));
        let _ = fs::remove_dir_all(&tmp);
        let zip = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/Descall-4.0.0-x64.zip");
        let mut seen = 0;
        let r = extract(&zip, &tmp, &AtomicBool::new(false), |d, t| {
            seen = d;
            assert!(d <= t);
        })
        .unwrap();
        assert_eq!(r.files, 4);
        assert_eq!(seen, 4);
        assert!(tmp.join("Descall.exe").is_file());
        assert!(tmp.join("resources/sounds/join.ogg").is_file());
        assert_eq!(file_count(File::open(&zip).unwrap()).unwrap(), 4);
        fs::remove_dir_all(&tmp).unwrap();
    }

    #[test]
    fn rejects_path_traversal() {
        let tmp = std::env::temp_dir().join(format!("descall-setup-evil-{}", std::process::id()));
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(&tmp).unwrap();
        let zp = tmp.join("evil.zip");
        {
            let mut w = zip::ZipWriter::new(File::create(&zp).unwrap());
            w.start_file("../outside.txt", zip::write::SimpleFileOptions::default()).unwrap();
            w.write_all(b"x").unwrap();
            w.finish().unwrap();
        }
        let err = extract(&zp, &tmp.join("out"), &AtomicBool::new(false), |_, _| {}).unwrap_err();
        assert_eq!(err.kind(), io::ErrorKind::InvalidData);
        assert!(!tmp.join("outside.txt").exists());
        fs::remove_dir_all(&tmp).unwrap();
    }
}
