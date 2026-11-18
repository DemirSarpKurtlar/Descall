//! Embedded ("offline") payload appended to the setup exe by `tools/release.py pack`:
//!
//! `[PE image][payload.zip][manifest.json][manifest.json.minisig][b"DSPAYLD1" | zip_len | man_len | sig_len (u64 LE)]`
//!
//! The overlay is appended before Authenticode signing; signtool then adds the certificate table
//! (8-byte aligned, possibly after zero padding) after it. So the overlay ends where the PE
//! security directory points, not at the end of the file.

use std::fs::File;
use std::io::{self, Read, Seek, SeekFrom};
use std::ops::Range;
use std::path::Path;

pub const MAGIC: &[u8; 8] = b"DSPAYLD1";
const TRAILER: u64 = 32;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Overlay {
    pub zip: Range<u64>,
    pub manifest: Range<u64>,
    pub sig: Range<u64>,
}

fn u16le(b: &[u8], at: usize) -> Option<u16> {
    b.get(at..at + 2).map(|x| u16::from_le_bytes([x[0], x[1]]))
}
fn u32le(b: &[u8], at: usize) -> Option<u32> {
    b.get(at..at + 4).map(|x| u32::from_le_bytes([x[0], x[1], x[2], x[3]]))
}

/// Offset where the overlay must end: the Authenticode certificate table if the file is signed,
/// otherwise the file end. `head` is the first few KiB of the file.
pub fn overlay_end(head: &[u8], file_len: u64) -> u64 {
    let parse = || -> Option<u64> {
        if head.get(0..2)? != b"MZ" {
            return None;
        }
        let pe = u32le(head, 0x3c)? as usize;
        if head.get(pe..pe + 4)? != b"PE\0\0" {
            return None;
        }
        let opt = pe + 24;
        let dirs = match u16le(head, opt)? {
            0x20b => opt + 112,
            0x10b => opt + 96,
            _ => return None,
        };
        let sec_off = u32le(head, dirs + 4 * 8)? as u64;
        let sec_len = u32le(head, dirs + 4 * 8 + 4)? as u64;
        (sec_off > 0 && sec_len > 0 && sec_off <= file_len).then_some(sec_off)
    };
    parse().unwrap_or(file_len)
}

/// Finds the trailer within the last bytes before `end` (skipping signtool's alignment padding).
pub fn parse_trailer(tail: &[u8], end: u64) -> Option<Overlay> {
    // tail = bytes [end - tail.len(), end)
    let base = end - tail.len() as u64;
    let mut pos = tail.len();
    for _ in 0..8 {
        if pos < TRAILER as usize {
            return None;
        }
        let t = &tail[pos - TRAILER as usize..pos];
        if &t[..8] == MAGIC {
            let rd = |i: usize| u64::from_le_bytes(t[8 + i * 8..16 + i * 8].try_into().unwrap());
            let (zl, ml, sl) = (rd(0), rd(1), rd(2));
            let t_start = base + (pos as u64) - TRAILER;
            let total = zl.checked_add(ml)?.checked_add(sl)?;
            let start = t_start.checked_sub(total)?;
            return Some(Overlay {
                zip: start..start + zl,
                manifest: start + zl..start + zl + ml,
                sig: start + zl + ml..t_start,
            });
        }
        if t[TRAILER as usize - 1] != 0 {
            return None;
        }
        pos -= 1;
    }
    None
}

pub fn find(path: &Path) -> io::Result<Option<Overlay>> {
    let mut f = File::open(path)?;
    let len = f.metadata()?.len();
    let mut head = vec![0u8; 4096.min(len as usize)];
    f.read_exact(&mut head)?;
    let end = overlay_end(&head, len);
    let take = (TRAILER + 8).min(end);
    let mut tail = vec![0u8; take as usize];
    f.seek(SeekFrom::Start(end - take))?;
    f.read_exact(&mut tail)?;
    Ok(parse_trailer(&tail, end))
}

pub fn read_range(path: &Path, r: &Range<u64>) -> io::Result<Vec<u8>> {
    let mut f = File::open(path)?;
    f.seek(SeekFrom::Start(r.start))?;
    let mut v = vec![0u8; (r.end - r.start) as usize];
    f.read_exact(&mut v)?;
    Ok(v)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fake_pe(sec: Option<(u32, u32)>) -> Vec<u8> {
        let mut v = vec![0u8; 1024];
        v[0..2].copy_from_slice(b"MZ");
        v[0x3c..0x40].copy_from_slice(&0x80u32.to_le_bytes());
        v[0x80..0x84].copy_from_slice(b"PE\0\0");
        let opt = 0x80 + 24;
        v[opt..opt + 2].copy_from_slice(&0x20bu16.to_le_bytes());
        if let Some((o, l)) = sec {
            let d = opt + 112 + 32;
            v[d..d + 4].copy_from_slice(&o.to_le_bytes());
            v[d + 4..d + 8].copy_from_slice(&l.to_le_bytes());
        }
        v
    }

    fn with_overlay(mut exe: Vec<u8>) -> (Vec<u8>, u64) {
        let start = exe.len() as u64;
        exe.extend_from_slice(b"ZIPDATA!!");
        exe.extend_from_slice(b"{\"m\":1}");
        exe.extend_from_slice(b"sig");
        exe.extend_from_slice(MAGIC);
        for l in [9u64, 7, 3] {
            exe.extend_from_slice(&l.to_le_bytes());
        }
        (exe, start)
    }

    #[test]
    fn unsigned_overlay_at_file_end() {
        let (f, start) = with_overlay(fake_pe(None));
        let end = overlay_end(&f, f.len() as u64);
        assert_eq!(end, f.len() as u64);
        let o = parse_trailer(&f[f.len() - 40..], end).unwrap();
        assert_eq!(o.zip, start..start + 9);
        assert_eq!(&f[o.manifest.start as usize..o.manifest.end as usize], b"{\"m\":1}");
        assert_eq!(&f[o.sig.start as usize..o.sig.end as usize], b"sig");
    }

    #[test]
    fn signed_overlay_before_padded_cert_table() {
        let (mut f, start) = with_overlay(fake_pe(None));
        f.extend_from_slice(&[0, 0, 0, 0, 0]); // alignment padding
        let cert_at = f.len() as u32;
        f.extend_from_slice(&[0xAB; 64]); // WIN_CERTIFICATE
        let pe = fake_pe(Some((cert_at, 64)));
        f[..1024].copy_from_slice(&pe);
        let end = overlay_end(&f, f.len() as u64);
        assert_eq!(end, cert_at as u64);
        let o = parse_trailer(&f[end as usize - 40..end as usize], end).unwrap();
        assert_eq!(o.zip.start, start);
    }

    #[test]
    fn no_overlay() {
        let f = fake_pe(None);
        assert!(parse_trailer(&f[f.len() - 40..], f.len() as u64).is_none());
    }
}
