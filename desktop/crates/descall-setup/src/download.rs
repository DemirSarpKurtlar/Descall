//! Resumable, part-verified payload download.
//!
//! The payload is one file on the CDN, fetched as fixed-size byte ranges ("parts"). Every part
//! has its own SHA-256 in the signed manifest, so a bad part is re-fetched alone and nothing
//! unverified is ever kept. Progress survives crashes, reboots and network loss in
//! `%LOCALAPPDATA%\Descall-Setup\cache\<version>\` (`payload.part` + `state.json`); a half part
//! resumes with an HTTP Range request from the exact byte where it stopped.

use crate::manifest::Manifest;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Instant;

#[derive(Debug)]
pub enum DlError {
    /// WinHTTP / WinSock error code (12029 = cannot connect -> "NET-2EFD").
    Net(u32),
    Http(u16),
    Disk(io::Error),
    /// A part (or with `None` the whole file) did not match the signed manifest.
    Integrity(Option<usize>),
    Cancelled,
    Paused,
}

impl DlError {
    pub fn code(&self) -> String {
        match self {
            DlError::Net(c) => format!("NET-{c:04X}"),
            DlError::Http(s) => format!("HTTP-{s}"),
            DlError::Disk(e) => format!("DSK-{:04X}", e.raw_os_error().unwrap_or(0) as u32 & 0xffff),
            DlError::Integrity(_) => "SHA-0BAD".into(),
            DlError::Cancelled => "USR-0001".into(),
            DlError::Paused => "USR-0002".into(),
        }
    }
    pub fn is_disk_full(&self) -> bool {
        // ERROR_DISK_FULL (112), ERROR_HANDLE_DISK_FULL (39)
        matches!(self, DlError::Disk(e) if matches!(e.raw_os_error(), Some(112) | Some(39)) || e.kind() == io::ErrorKind::StorageFull)
    }
}

impl From<io::Error> for DlError {
    fn from(e: io::Error) -> Self {
        DlError::Disk(e)
    }
}

impl std::fmt::Display for DlError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            DlError::Disk(e) => write!(f, "{} ({e})", self.code()),
            DlError::Integrity(Some(p)) => write!(f, "{} (part {p})", self.code()),
            _ => write!(f, "{}", self.code()),
        }
    }
}

/// Byte-range GET. Implemented with WinHTTP on Windows and by a mock in tests.
pub trait Fetch {
    /// Streams bytes `[from, to)` of `url` into `sink`; returns when the range is complete.
    fn fetch(&mut self, url: &str, from: u64, to: u64, sink: &mut dyn FnMut(&[u8]) -> Result<(), DlError>) -> Result<(), DlError>;
}

#[derive(Default)]
pub struct Control {
    pub pause: AtomicBool,
    pub cancel: AtomicBool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct State {
    pub sha256: String,
    pub done: Vec<bool>,
    pub partial_part: Option<usize>,
    pub partial_bytes: u64,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Event {
    /// Part already on disk and verified (from an earlier run).
    Cached { part: usize },
    /// Part continues from `got` bytes in.
    Resumed { part: usize, got: u64 },
    Progress { total_got: u64, part: usize, part_got: u64, part_len: u64 },
    PartDone { part: usize, bytes: u64, secs: f64 },
}

pub struct Downloader<'a> {
    pub m: &'a Manifest,
    pub dir: PathBuf,
}

impl<'a> Downloader<'a> {
    pub fn new(m: &'a Manifest, cache_root: &Path) -> Self {
        Downloader { m, dir: cache_root.join(&m.version) }
    }
    pub fn data_path(&self) -> PathBuf {
        self.dir.join("payload.part")
    }
    fn state_path(&self) -> PathBuf {
        self.dir.join("state.json")
    }

    /// Deletes everything downloaded for this version ("Download again").
    pub fn reset(&self) -> io::Result<()> {
        match fs::remove_dir_all(&self.dir) {
            Err(e) if e.kind() != io::ErrorKind::NotFound => Err(e),
            _ => Ok(()),
        }
    }

    fn save(&self, st: &State) -> io::Result<()> {
        let tmp = self.dir.join("state.json.tmp");
        fs::write(&tmp, serde_json::to_vec(st).map_err(io::Error::other)?)?;
        fs::rename(tmp, self.state_path())
    }

    /// Loads progress and re-verifies every part that claims to be done.
    pub fn load(&self) -> State {
        let n = self.m.part_count();
        let fresh = State { sha256: self.m.payload.sha256.clone(), done: vec![false; n], ..Default::default() };
        let Ok(raw) = fs::read(self.state_path()) else { return fresh };
        let Ok(mut st) = serde_json::from_slice::<State>(&raw) else { return fresh };
        if st.sha256 != self.m.payload.sha256 || st.done.len() != n {
            return fresh;
        }
        let Ok(mut f) = File::open(self.data_path()) else { return fresh };
        for i in 0..n {
            if st.done[i] && self.hash_range(&mut f, self.m.part_range(i)).ok().as_deref() != Some(self.m.payload.parts[i].as_str()) {
                st.done[i] = false;
            }
        }
        if let Some(p) = st.partial_part {
            let (s, e) = self.m.part_range(p);
            if p >= n || st.done[p] || st.partial_bytes >= e - s {
                st.partial_part = None;
                st.partial_bytes = 0;
            }
        }
        st
    }

    fn hash_range(&self, f: &mut File, (s, e): (u64, u64)) -> io::Result<String> {
        let mut h = Sha256::new();
        f.seek(SeekFrom::Start(s))?;
        let mut left = e - s;
        let mut buf = vec![0u8; 64 * 1024];
        while left > 0 {
            let want = left.min(buf.len() as u64) as usize;
            f.read_exact(&mut buf[..want])?;
            h.update(&buf[..want]);
            left -= want as u64;
        }
        Ok(hex(&h.finalize()))
    }

    pub fn bytes_done(&self, st: &State) -> u64 {
        let mut b: u64 = (0..st.done.len()).filter(|i| st.done[*i]).map(|i| {
            let (s, e) = self.m.part_range(i);
            e - s
        }).sum();
        if st.partial_part.is_some() {
            b += st.partial_bytes;
        }
        b
    }

    pub fn parts_done(&self, st: &State) -> usize {
        st.done.iter().filter(|d| **d).count()
    }

    /// Downloads every missing part. Returns `Err(Paused)` / `Err(Cancelled)` with progress saved.
    pub fn run(&self, fetch: &mut dyn Fetch, url: &str, ctl: &Control, ev: &mut dyn FnMut(Event)) -> Result<(), DlError> {
        fs::create_dir_all(&self.dir)?;
        let mut st = self.load();
        let mut f = OpenOptions::new().read(true).write(true).create(true).truncate(false).open(self.data_path())?;
        if f.metadata()?.len() != self.m.payload.size {
            f.set_len(self.m.payload.size)?;
        }
        let mut total = self.bytes_done(&st);
        for i in 0..self.m.part_count() {
            if st.done[i] {
                ev(Event::Cached { part: i });
            }
        }
        for i in 0..self.m.part_count() {
            if st.done[i] {
                continue;
            }
            let (s, e) = self.m.part_range(i);
            let mut retried = false;
            loop {
                let mut h = Sha256::new();
                let mut got = 0u64;
                if st.partial_part == Some(i) && st.partial_bytes > 0 {
                    got = st.partial_bytes;
                    f.seek(SeekFrom::Start(s))?;
                    let mut prev = vec![0u8; got as usize];
                    f.read_exact(&mut prev)?;
                    h.update(&prev);
                    ev(Event::Resumed { part: i, got });
                } else {
                    total -= st.partial_bytes.min(total);
                    st.partial_part = Some(i);
                    st.partial_bytes = 0;
                }
                let t0 = Instant::now();
                let mut since_save = 0u64;
                let from = s + got;
                f.seek(SeekFrom::Start(from))?;
                let res = {
                    let st_ref = &mut st;
                    let mut sink = |chunk: &[u8]| -> Result<(), DlError> {
                        if ctl.cancel.load(Ordering::Relaxed) {
                            return Err(DlError::Cancelled);
                        }
                        if ctl.pause.load(Ordering::Relaxed) {
                            return Err(DlError::Paused);
                        }
                        let room = (e - s - got) as usize;
                        let chunk = &chunk[..chunk.len().min(room)];
                        f.write_all(chunk)?;
                        h.update(chunk);
                        got += chunk.len() as u64;
                        total += chunk.len() as u64;
                        st_ref.partial_bytes = got;
                        since_save += chunk.len() as u64;
                        if since_save >= 256 * 1024 {
                            since_save = 0;
                            f.flush()?;
                            self.save(st_ref)?;
                        }
                        ev(Event::Progress { total_got: total, part: i, part_got: got, part_len: e - s });
                        Ok(())
                    };
                    fetch.fetch(url, from, e, &mut sink)
                };
                if let Err(err) = res {
                    f.flush()?;
                    let _ = f.sync_data();
                    self.save(&st)?;
                    return Err(err);
                }
                if got != e - s {
                    self.save(&st)?;
                    return Err(DlError::Net(12152)); // ERROR_WINHTTP_INVALID_SERVER_RESPONSE: short body
                }
                if hex(&h.finalize()) == self.m.payload.parts[i] {
                    st.done[i] = true;
                    st.partial_part = None;
                    st.partial_bytes = 0;
                    f.flush()?;
                    self.save(&st)?;
                    ev(Event::PartDone { part: i, bytes: e - s, secs: t0.elapsed().as_secs_f64() });
                    break;
                }
                // Bad part: throw it away and fetch it once more from scratch.
                total -= got.min(total);
                st.partial_part = None;
                st.partial_bytes = 0;
                self.save(&st)?;
                if retried {
                    return Err(DlError::Integrity(Some(i)));
                }
                retried = true;
            }
        }
        f.sync_all()?;
        Ok(())
    }

    /// Whole-file SHA-256 against the signed manifest (after all parts passed).
    pub fn verify_full(&self, mut progress: impl FnMut(f64)) -> Result<(), DlError> {
        let mut f = File::open(self.data_path())?;
        let size = self.m.payload.size;
        let mut h = Sha256::new();
        let mut buf = vec![0u8; 256 * 1024];
        let mut done = 0u64;
        loop {
            let n = f.read(&mut buf)?;
            if n == 0 {
                break;
            }
            h.update(&buf[..n]);
            done += n as u64;
            progress(done as f64 / size as f64);
        }
        if done != size || hex(&h.finalize()) != self.m.payload.sha256 {
            return Err(DlError::Integrity(None));
        }
        Ok(())
    }
}

pub fn hex(b: &[u8]) -> String {
    const H: &[u8; 16] = b"0123456789abcdef";
    let mut s = String::with_capacity(b.len() * 2);
    for x in b {
        s.push(H[(x >> 4) as usize] as char);
        s.push(H[(x & 15) as usize] as char);
    }
    s
}

pub fn sha256_bytes(b: &[u8]) -> String {
    hex(&Sha256::digest(b))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::manifest::tests::{TEST_MANIFEST, TEST_PUBKEY, TEST_SIG};
    use crate::manifest::verify_and_parse;

    const ZIP: &[u8] = include_bytes!("../tests/fixtures/Descall-4.0.0-x64.zip");

    struct Mock {
        data: Vec<u8>,
        /// Fail with a network error once this many bytes have been served in total.
        fail_after: Option<u64>,
        served: u64,
        corrupt_part_once: Option<u64>,
        requests: Vec<(u64, u64)>,
    }
    impl Fetch for Mock {
        fn fetch(&mut self, _url: &str, from: u64, to: u64, sink: &mut dyn FnMut(&[u8]) -> Result<(), DlError>) -> Result<(), DlError> {
            self.requests.push((from, to));
            let mut pos = from;
            while pos < to {
                let end = (pos + 300).min(to);
                let mut chunk = self.data[pos as usize..end as usize].to_vec();
                if let Some(at) = self.corrupt_part_once {
                    if at >= pos && at < end {
                        chunk[(at - pos) as usize] ^= 0xff;
                        self.corrupt_part_once = None;
                    }
                }
                if let Some(limit) = self.fail_after {
                    if self.served + chunk.len() as u64 > limit {
                        self.fail_after = None;
                        return Err(DlError::Net(12029));
                    }
                }
                self.served += chunk.len() as u64;
                sink(&chunk)?;
                pos = end;
            }
            Ok(())
        }
    }

    fn setup(tag: &str) -> (Manifest, PathBuf) {
        let m = verify_and_parse(TEST_MANIFEST, TEST_SIG, Some(TEST_PUBKEY), false).unwrap();
        let dir = std::env::temp_dir().join(format!("descall-dl-{tag}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        (m, dir)
    }

    #[test]
    fn resumes_mid_part_after_network_loss() {
        let (m, dir) = setup("resume");
        let d = Downloader::new(&m, &dir);
        let ctl = Control::default();
        let mut mock = Mock { data: ZIP.to_vec(), fail_after: Some(2500), served: 0, corrupt_part_once: None, requests: vec![] };
        let err = d.run(&mut mock, "u", &ctl, &mut |_| {}).unwrap_err();
        assert_eq!(err.code(), "NET-2EFD");
        let st = d.load();
        assert_eq!(d.parts_done(&st), 2);
        assert_eq!(st.partial_part, Some(2));
        assert!(st.partial_bytes > 0);
        let before = d.bytes_done(&st);
        mock.requests.clear();
        let mut events = vec![];
        d.run(&mut mock, "u", &ctl, &mut |e| events.push(e)).unwrap();
        assert_eq!(mock.requests[0].0, 2048 + st.partial_bytes, "range request continues inside the part");
        assert!(events.contains(&Event::Cached { part: 0 }));
        assert!(events.iter().any(|e| matches!(e, Event::Resumed { part: 2, .. })));
        assert!(before >= 2048);
        d.verify_full(|_| {}).unwrap();
        assert_eq!(fs::read(d.data_path()).unwrap(), ZIP);
        d.reset().unwrap();
    }

    #[test]
    fn bad_part_is_refetched_once_then_fails() {
        let (m, dir) = setup("bad");
        let d = Downloader::new(&m, &dir);
        let mut mock = Mock { data: ZIP.to_vec(), fail_after: None, served: 0, corrupt_part_once: Some(1500), requests: vec![] };
        d.run(&mut mock, "u", &Control::default(), &mut |_| {}).unwrap();
        d.verify_full(|_| {}).unwrap();
        d.reset().unwrap();

        let mut evil = ZIP.to_vec();
        evil[100] ^= 1;
        let mut mock = Mock { data: evil, fail_after: None, served: 0, corrupt_part_once: None, requests: vec![] };
        let err = d.run(&mut mock, "u", &Control::default(), &mut |_| {}).unwrap_err();
        assert!(matches!(err, DlError::Integrity(Some(0))));
        d.reset().unwrap();
    }

    #[test]
    fn pause_and_cancel_keep_progress() {
        let (m, dir) = setup("pause");
        let d = Downloader::new(&m, &dir);
        let ctl = Control::default();
        let mut mock = Mock { data: ZIP.to_vec(), fail_after: None, served: 0, corrupt_part_once: None, requests: vec![] };
        let mut n = 0;
        let err = d
            .run(&mut mock, "u", &ctl, &mut |e| {
                if matches!(e, Event::PartDone { .. }) {
                    n += 1;
                    if n == 3 {
                        ctl.pause.store(true, Ordering::Relaxed);
                    }
                }
            })
            .unwrap_err();
        assert!(matches!(err, DlError::Paused));
        assert_eq!(d.parts_done(&d.load()), 3);
        ctl.pause.store(false, Ordering::Relaxed);
        d.run(&mut mock, "u", &ctl, &mut |_| {}).unwrap();
        d.verify_full(|_| {}).unwrap();
        d.reset().unwrap();
    }

    #[test]
    fn state_from_another_release_is_ignored() {
        let (m, dir) = setup("stale");
        let d = Downloader::new(&m, &dir);
        fs::create_dir_all(&d.dir).unwrap();
        fs::write(d.dir.join("state.json"), br#"{"sha256":"00","done":[true,true,true,true,true],"partial_part":null,"partial_bytes":0}"#).unwrap();
        assert_eq!(d.parts_done(&d.load()), 0);
        d.reset().unwrap();
    }

    #[test]
    fn error_codes() {
        assert_eq!(DlError::Net(12029).code(), "NET-2EFD");
        assert!(DlError::Disk(io::Error::from_raw_os_error(112)).is_disk_full());
        assert_eq!(DlError::Disk(io::Error::from_raw_os_error(112)).code(), "DSK-0070");
    }
}
