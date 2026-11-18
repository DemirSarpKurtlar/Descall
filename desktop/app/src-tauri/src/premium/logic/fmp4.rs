//! In-memory ring of a fragmented MP4 stream (instant_clip native recorder).
//!
//! The Media Foundation sink writer writes fragmented MP4 (ftyp + moov, then moof + mdat
//! pairs) into a byte stream that feeds [`ClipRing::push`]. The ring keeps the init segment
//! and the fragments of the last `window_ms`, starting at a video sync sample. [`ClipRing::export`]
//! cuts a range on fragment (keyframe) boundaries and rebases the timestamps, so the file
//! starts at 0 and plays everywhere; nothing is re-encoded.

use std::collections::VecDeque;
use std::sync::Arc;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Track {
    pub id: u32,
    pub timescale: u32,
    pub video: bool,
    pub default_duration: u32,
    pub default_flags: u32,
}

/// Field of a fragment that is rewritten on export.
#[derive(Clone, Debug, PartialEq, Eq)]
enum Patch {
    /// tfdt baseMediaDecodeTime: offset in the fragment, 64-bit?, track id, original value.
    Tfdt { at: usize, wide: bool, track: u32, value: u64 },
    /// tfhd base_data_offset (absolute file position): offset, original value.
    BaseOffset { at: usize, value: u64 },
    /// mfhd sequence_number.
    Sequence { at: usize },
}

#[derive(Clone, Debug)]
pub struct Fragment {
    pub data: Vec<u8>,
    /// Position of the moof in the original stream (base_data_offset rewrite).
    pub stream_pos: u64,
    /// Start / duration in ms (the video track's clock when the fragment has video).
    pub start_ms: f64,
    pub dur_ms: f64,
    pub video: bool,
    /// The video run starts with a sync sample (a cut may start here).
    pub sync: bool,
    patches: Vec<Patch>,
}

#[derive(Debug, Default)]
pub struct ClipRing {
    pub window_ms: f64,
    pub max_bytes: usize,
    pending: Vec<u8>,
    pending_pos: u64,
    init: Vec<u8>,
    tracks: Vec<Track>,
    moof: Option<(Vec<u8>, u64)>,
    frags: VecDeque<Arc<Fragment>>,
    bytes: usize,
}

/// A frozen copy for the editor (fragments are shared, not copied).
#[derive(Clone, Debug)]
pub struct Snapshot {
    pub init: Vec<u8>,
    pub tracks: Vec<Track>,
    pub frags: Vec<Arc<Fragment>>,
}

fn be32(b: &[u8], at: usize) -> Option<u32> {
    Some(u32::from_be_bytes(b.get(at..at + 4)?.try_into().ok()?))
}

fn be64(b: &[u8], at: usize) -> Option<u64> {
    Some(u64::from_be_bytes(b.get(at..at + 8)?.try_into().ok()?))
}

/// Child boxes of a container payload: (type, payload start, end), offsets into `b`.
fn children(b: &[u8], start: usize, end: usize) -> Vec<([u8; 4], usize, usize)> {
    let mut out = Vec::new();
    let mut p = start;
    while p + 8 <= end {
        let Some(size32) = be32(b, p) else { break };
        let kind: [u8; 4] = b[p + 4..p + 8].try_into().unwrap_or([0; 4]);
        let (size, hdr) = match size32 {
            1 => match be64(b, p + 8) {
                Some(s) => (s as usize, 16),
                None => break,
            },
            0 => (end - p, 8),
            s => (s as usize, 8),
        };
        if size < hdr || p + size > end {
            break;
        }
        out.push((kind, p + hdr, p + size));
        p += size;
    }
    out
}

fn find<'a>(list: &'a [([u8; 4], usize, usize)], kind: &[u8; 4]) -> Option<&'a ([u8; 4], usize, usize)> {
    list.iter().find(|(k, _, _)| k == kind)
}

/// Tracks of a moov box payload.
pub fn parse_moov(b: &[u8], start: usize, end: usize) -> Vec<Track> {
    let top = children(b, start, end);
    let mut tracks = Vec::new();
    for (_, ts, te) in top.iter().filter(|(k, _, _)| k == b"trak") {
        let trak = children(b, *ts, *te);
        let Some((_, hs, _)) = find(&trak, b"tkhd") else { continue };
        let v = b.get(*hs).copied().unwrap_or(0);
        let Some(id) = be32(b, hs + if v == 1 { 20 } else { 12 }) else { continue };
        let Some((_, ms, me)) = find(&trak, b"mdia") else { continue };
        let mdia = children(b, *ms, *me);
        let timescale = find(&mdia, b"mdhd")
            .and_then(|(_, s, _)| {
                let v = b.get(*s).copied().unwrap_or(0);
                be32(b, s + if v == 1 { 20 } else { 12 })
            })
            .unwrap_or(1000);
        let video = find(&mdia, b"hdlr").and_then(|(_, s, _)| b.get(s + 8..s + 12)).is_some_and(|h| h == b"vide");
        tracks.push(Track { id, timescale: timescale.max(1), video, default_duration: 0, default_flags: 0 });
    }
    if let Some((_, xs, xe)) = find(&top, b"mvex") {
        for (_, s, _) in children(b, *xs, *xe).iter().filter(|(k, _, _)| k == b"trex") {
            let (Some(id), Some(dur), Some(flags)) = (be32(b, s + 4), be32(b, s + 12), be32(b, s + 20)) else { continue };
            if let Some(t) = tracks.iter_mut().find(|t| t.id == id) {
                t.default_duration = dur;
                t.default_flags = flags;
            }
        }
    }
    tracks
}

struct TrafInfo {
    track: u32,
    base_time: Option<u64>,
    duration: u64,
    first_flags: Option<u32>,
}

/// Parse a moof+mdat pair into a fragment.
fn parse_fragment(data: Vec<u8>, stream_pos: u64, tracks: &[Track]) -> Option<Fragment> {
    let top = children(&data, 0, data.len());
    let (_, ms, me) = *find(&top, b"moof")?;
    let mut patches = Vec::new();
    let mut infos = Vec::new();
    for (kind, s, e) in children(&data, ms, me) {
        if &kind == b"mfhd" {
            patches.push(Patch::Sequence { at: s + 4 });
            continue;
        }
        if &kind != b"traf" {
            continue;
        }
        let traf = children(&data, s, e);
        let (_, hs, _) = *find(&traf, b"tfhd")?;
        let tf_flags = be32(&data, hs)? & 0x00FF_FFFF;
        let track = be32(&data, hs + 4)?;
        let mut p = hs + 8;
        if tf_flags & 0x1 != 0 {
            patches.push(Patch::BaseOffset { at: p, value: be64(&data, p)? });
            p += 8;
        }
        if tf_flags & 0x2 != 0 {
            p += 4;
        }
        let t = tracks.iter().find(|t| t.id == track);
        let mut def_dur = t.map(|t| t.default_duration).unwrap_or(0);
        if tf_flags & 0x8 != 0 {
            def_dur = be32(&data, p)?;
            p += 4;
        }
        if tf_flags & 0x10 != 0 {
            p += 4;
        }
        let mut def_flags = t.map(|t| t.default_flags).unwrap_or(0);
        if tf_flags & 0x20 != 0 {
            def_flags = be32(&data, p)?;
        }
        let mut info = TrafInfo { track, base_time: None, duration: 0, first_flags: None };
        if let Some((_, ds, _)) = find(&traf, b"tfdt") {
            let wide = data.get(*ds).copied() == Some(1);
            let value = if wide { be64(&data, ds + 4)? } else { be32(&data, ds + 4)? as u64 };
            patches.push(Patch::Tfdt { at: ds + 4, wide, track, value });
            info.base_time = Some(value);
        }
        for (_, rs, _) in traf.iter().filter(|(k, _, _)| k == b"trun") {
            let r_flags = be32(&data, *rs)? & 0x00FF_FFFF;
            let count = be32(&data, rs + 4)?;
            let mut q = rs + 8;
            if r_flags & 0x1 != 0 {
                q += 4;
            }
            let mut first = None;
            if r_flags & 0x4 != 0 {
                first = be32(&data, q);
                q += 4;
            }
            for i in 0..count {
                let mut dur = def_dur;
                if r_flags & 0x100 != 0 {
                    dur = be32(&data, q)?;
                    q += 4;
                }
                if r_flags & 0x200 != 0 {
                    q += 4;
                }
                if r_flags & 0x400 != 0 {
                    let f = be32(&data, q)?;
                    q += 4;
                    if i == 0 && first.is_none() {
                        first = Some(f);
                    }
                }
                if r_flags & 0x800 != 0 {
                    q += 4;
                }
                info.duration += dur as u64;
            }
            if info.first_flags.is_none() {
                info.first_flags = Some(first.unwrap_or(def_flags));
            }
        }
        infos.push(info);
    }
    let video_track = tracks.iter().find(|t| t.video).map(|t| t.id);
    let main = infos.iter().find(|i| Some(i.track) == video_track).or(infos.first())?;
    let scale = tracks.iter().find(|t| t.id == main.track).map(|t| t.timescale).unwrap_or(1000) as f64;
    let video = Some(main.track) == video_track;
    Some(Fragment {
        stream_pos,
        start_ms: main.base_time.unwrap_or(0) as f64 * 1000.0 / scale,
        dur_ms: main.duration as f64 * 1000.0 / scale,
        video,
        // sample_is_non_sync_sample = 0x10000
        sync: video && main.first_flags.is_some_and(|f| f & 0x0001_0000 == 0),
        patches,
        data,
    })
}

impl ClipRing {
    pub fn new(window_ms: f64, max_bytes: usize) -> Self {
        Self { window_ms, max_bytes, ..Default::default() }
    }

    /// Bytes from the sink writer, in stream order.
    pub fn push(&mut self, bytes: &[u8]) {
        self.pending.extend_from_slice(bytes);
        loop {
            if self.pending.len() < 8 {
                return;
            }
            let size32 = be32(&self.pending, 0).unwrap_or(0) as usize;
            let size = match size32 {
                1 => match be64(&self.pending, 8) {
                    Some(s) => s as usize,
                    None => return,
                },
                0 => return, // "to the end of the file": not used by the fragmented sink
                s => s,
            };
            if size < 8 {
                // Corrupt stream: drop what we have and wait for the next box.
                self.pending.clear();
                return;
            }
            if self.pending.len() < size {
                return;
            }
            let b: Vec<u8> = self.pending.drain(..size).collect();
            let pos = self.pending_pos;
            self.pending_pos += size as u64;
            self.on_box(b, pos);
        }
    }

    /// The sink seeked back and rewrote bytes it had already written (only possible while they
    /// are still pending or in the init segment).
    pub fn patch(&mut self, stream_pos: u64, bytes: &[u8]) {
        let init_len = self.init.len() as u64;
        if stream_pos + bytes.len() as u64 <= init_len {
            let at = stream_pos as usize;
            self.init[at..at + bytes.len()].copy_from_slice(bytes);
        } else if stream_pos >= self.pending_pos {
            let at = (stream_pos - self.pending_pos) as usize;
            if at + bytes.len() <= self.pending.len() {
                self.pending[at..at + bytes.len()].copy_from_slice(bytes);
            }
        }
    }

    fn on_box(&mut self, b: Vec<u8>, pos: u64) {
        let kind: [u8; 4] = b[4..8].try_into().unwrap_or([0; 4]);
        let hdr = if be32(&b, 0) == Some(1) { 16 } else { 8 };
        match &kind {
            b"ftyp" => {
                self.init = b;
                self.tracks.clear();
                self.frags.clear();
                self.bytes = 0;
            }
            b"moov" => {
                self.tracks = parse_moov(&b, hdr, b.len());
                self.init.extend_from_slice(&b);
            }
            b"moof" => self.moof = Some((b, pos)),
            b"mdat" => {
                if let Some((mut moof, at)) = self.moof.take() {
                    moof.extend_from_slice(&b);
                    if let Some(f) = parse_fragment(moof, at, &self.tracks) {
                        self.bytes += f.data.len();
                        self.frags.push_back(Arc::new(f));
                        self.prune();
                    }
                }
            }
            _ => {} // styp, sidx, mfra, free: not needed for playback
        }
    }

    fn end_ms(&self) -> f64 {
        self.frags.iter().filter(|f| f.video).map(|f| f.start_ms + f.dur_ms).fold(0.0, f64::max)
    }

    fn prune(&mut self) {
        let end = self.end_ms();
        // Never drop the last sync point.
        while let Some(next_sync) = self.frags.iter().skip(1).position(|f| f.sync).map(|i| i + 1) {
            let too_old = end - self.frags[next_sync].start_ms > self.window_ms;
            let too_big = self.bytes > self.max_bytes;
            let lead_junk = !self.frags[0].sync;
            if !(too_old || too_big || lead_junk) {
                break;
            }
            // Drop everything before the next sync point.
            for _ in 0..next_sync {
                if let Some(f) = self.frags.pop_front() {
                    self.bytes -= f.data.len();
                }
            }
        }
    }

    pub fn buffered_ms(&self) -> f64 {
        let start = self.frags.iter().find(|f| f.sync).map(|f| f.start_ms);
        start.map(|s| (self.end_ms() - s).max(0.0)).unwrap_or(0.0)
    }

    pub fn bytes(&self) -> usize {
        self.bytes
    }

    pub fn ready(&self) -> bool {
        !self.init.is_empty() && self.frags.iter().any(|f| f.sync)
    }

    pub fn snapshot(&self) -> Snapshot {
        Snapshot { init: self.init.clone(), tracks: self.tracks.clone(), frags: self.frags.iter().cloned().collect() }
    }
}

impl Snapshot {
    fn first_sync(&self) -> Option<usize> {
        self.frags.iter().position(|f| f.sync)
    }

    /// Start of the timeline (first sync fragment), ms.
    pub fn base_ms(&self) -> f64 {
        self.first_sync().map(|i| self.frags[i].start_ms).unwrap_or(0.0)
    }

    pub fn length_ms(&self) -> f64 {
        let base = self.base_ms();
        self.frags.iter().filter(|f| f.video).map(|f| f.start_ms + f.dur_ms - base).fold(0.0, f64::max)
    }

    /// Video fragments as editor "chunks": (sync, start µs from base, duration µs, bytes).
    pub fn chunks(&self) -> Vec<(bool, i64, i64, usize)> {
        let base = self.base_ms();
        let Some(first) = self.first_sync() else { return Vec::new() };
        self.frags[first..].iter().filter(|f| f.video).map(|f| (f.sync, ((f.start_ms - base) * 1000.0).round() as i64, (f.dur_ms * 1000.0).round() as i64, f.data.len())).collect()
    }

    /// A playable MP4 of [from_ms, to_ms] (relative to the timeline start), cut at the sync
    /// fragment at or before `from_ms`, timestamps rebased to 0. None when empty.
    pub fn export(&self, from_ms: f64, to_ms: f64) -> Option<Vec<u8>> {
        let first = self.first_sync()?;
        if self.init.is_empty() {
            return None;
        }
        let base = self.base_ms();
        let (from, to) = (base + from_ms.max(0.0), base + to_ms.max(from_ms));
        let start = (first..self.frags.len()).rev().find(|&i| self.frags[i].sync && self.frags[i].start_ms <= from + 0.5).unwrap_or(first);
        let cut_ms = self.frags[start].start_ms;
        let mut out = self.init.clone();
        let mut seq = 1u32;
        for f in &self.frags[start..] {
            if f.start_ms >= to && seq > 1 {
                break;
            }
            // Audio that starts before the cut would get a negative time: leave it out.
            if !f.video && f.start_ms + 0.5 < cut_ms {
                continue;
            }
            let new_pos = out.len() as u64;
            let mut d = f.data.clone();
            for p in &f.patches {
                match *p {
                    Patch::Sequence { at } => d[at..at + 4].copy_from_slice(&seq.to_be_bytes()),
                    Patch::BaseOffset { at, value } => {
                        let v = value.wrapping_sub(f.stream_pos).wrapping_add(new_pos);
                        d[at..at + 8].copy_from_slice(&v.to_be_bytes());
                    }
                    Patch::Tfdt { at, wide, track, value } => {
                        let scale = self.tracks.iter().find(|t| t.id == track).map(|t| t.timescale).unwrap_or(1000) as f64;
                        let shift = (cut_ms * scale / 1000.0).round() as u64;
                        let v = value.saturating_sub(shift);
                        if wide {
                            d[at..at + 8].copy_from_slice(&v.to_be_bytes());
                        } else {
                            d[at..at + 4].copy_from_slice(&(v.min(u32::MAX as u64) as u32).to_be_bytes());
                        }
                    }
                }
            }
            out.extend_from_slice(&d);
            seq += 1;
        }
        Some(out)
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    fn bx(kind: &[u8; 4], payload: &[u8]) -> Vec<u8> {
        let mut v = ((payload.len() + 8) as u32).to_be_bytes().to_vec();
        v.extend_from_slice(kind);
        v.extend_from_slice(payload);
        v
    }

    fn full(kind: &[u8; 4], version: u8, flags: u32, body: &[u8]) -> Vec<u8> {
        let mut p = vec![version];
        p.extend_from_slice(&flags.to_be_bytes()[1..]);
        p.extend_from_slice(body);
        bx(kind, &p)
    }

    fn trak(id: u32, timescale: u32, handler: &[u8; 4]) -> Vec<u8> {
        let mut tkhd = vec![0u8; 8];
        tkhd.extend_from_slice(&id.to_be_bytes());
        tkhd.extend_from_slice(&[0u8; 60]);
        let mut mdhd = vec![0u8; 8];
        mdhd.extend_from_slice(&timescale.to_be_bytes());
        mdhd.extend_from_slice(&[0u8; 8]);
        let mut hdlr = vec![0u8; 4];
        hdlr.extend_from_slice(handler);
        hdlr.extend_from_slice(&[0u8; 13]);
        let mdia = [full(b"mdhd", 0, 0, &mdhd), full(b"hdlr", 0, 0, &hdlr)].concat();
        bx(b"trak", &[full(b"tkhd", 0, 3, &tkhd), bx(b"mdia", &mdia)].concat())
    }

    pub(crate) fn init_segment() -> Vec<u8> {
        let trex = |id: u32, dur: u32| {
            let mut b = id.to_be_bytes().to_vec();
            b.extend_from_slice(&1u32.to_be_bytes());
            b.extend_from_slice(&dur.to_be_bytes());
            b.extend_from_slice(&0u32.to_be_bytes());
            b.extend_from_slice(&0x0001_0000u32.to_be_bytes());
            full(b"trex", 0, 0, &b)
        };
        let moov = [trak(1, 90_000, b"vide"), trak(2, 48_000, b"soun"), bx(b"mvex", &[trex(1, 3000), trex(2, 1024)].concat())].concat();
        [bx(b"ftyp", b"isomiso6"), bx(b"moov", &moov)].concat()
    }

    /// moof+mdat: one traf, `n` samples, first sample sync or not, tfdt in the track's clock.
    pub(crate) fn fragment(seq: u32, track: u32, tfdt: u64, n: u32, sync: bool, base_offset: Option<u64>) -> Vec<u8> {
        let mfhd = full(b"mfhd", 0, 0, &seq.to_be_bytes());
        let mut tfhd_body = track.to_be_bytes().to_vec();
        let flags = if let Some(o) = base_offset {
            tfhd_body.extend_from_slice(&o.to_be_bytes());
            0x1
        } else {
            0x2_0000
        };
        let tfhd = full(b"tfhd", 0, flags, &tfhd_body);
        let tfdt = full(b"tfdt", 1, 0, &tfdt.to_be_bytes());
        let mut trun_body = n.to_be_bytes().to_vec();
        trun_body.extend_from_slice(&(if sync { 0x0200_0000u32 } else { 0x0101_0000u32 }).to_be_bytes());
        let trun = full(b"trun", 0, 0x4, &trun_body);
        let moof = bx(b"moof", &[mfhd, bx(b"traf", &[tfhd, tfdt, trun].concat())].concat());
        [moof, bx(b"mdat", &vec![7u8; 100])].concat()
    }

    fn feed(ring: &mut ClipRing, bytes: &[u8]) {
        // Arbitrary write sizes, as the sink writer does.
        for part in bytes.chunks(37) {
            ring.push(part);
        }
    }

    #[test]
    fn parses_tracks_and_fragments() {
        let mut r = ClipRing::new(30_000.0, 1 << 30);
        feed(&mut r, &init_segment());
        assert_eq!(r.tracks.len(), 2);
        assert!(r.tracks[0].video && !r.tracks[1].video);
        assert_eq!(r.tracks[0].default_duration, 3000);
        // 1 s video fragments (30 x 3000 at 90 kHz), sync, and audio fragments between.
        for i in 0..5u64 {
            feed(&mut r, &fragment(i as u32 * 2 + 1, 1, i * 90_000, 30, true, None));
            feed(&mut r, &fragment(i as u32 * 2 + 2, 2, i * 48_000, 47, false, None));
        }
        assert!(r.ready());
        assert_eq!(r.frags.len(), 10);
        assert!((r.buffered_ms() - 5000.0).abs() < 1.0);
        let f = &r.frags[0];
        assert!(f.video && f.sync);
        assert!((f.dur_ms - 1000.0).abs() < 0.01);
        assert!(!r.frags[1].video);
    }

    #[test]
    fn prunes_to_window_on_sync_points() {
        let mut r = ClipRing::new(3000.0, 1 << 30);
        feed(&mut r, &init_segment());
        for i in 0..10u64 {
            // every other fragment starts without a keyframe
            feed(&mut r, &fragment(i as u32 + 1, 1, i * 90_000, 30, i % 2 == 0, None));
        }
        assert!(r.frags[0].sync, "the ring always starts on a keyframe");
        assert!(r.buffered_ms() <= 4000.0 + 1.0, "{}", r.buffered_ms());
        assert!(r.buffered_ms() >= 3000.0 - 1.0, "{}", r.buffered_ms());
        let mut small = ClipRing::new(60_000.0, 900);
        feed(&mut small, &init_segment());
        for i in 0..10u64 {
            feed(&mut small, &fragment(i as u32 + 1, 1, i * 90_000, 30, true, None));
        }
        assert!(small.bytes() <= 900 + 400, "byte cap");
    }

    #[test]
    fn export_cuts_on_keyframes_and_rebases() {
        let mut r = ClipRing::new(60_000.0, 1 << 30);
        feed(&mut r, &init_segment());
        let mut pos = init_segment().len() as u64;
        for i in 0..6u64 {
            let v = fragment(i as u32 * 2 + 1, 1, 900_000 + i * 90_000, 30, i % 2 == 0, Some(pos));
            pos += v.len() as u64;
            feed(&mut r, &v);
            let a = fragment(i as u32 * 2 + 2, 2, 480_000 + i * 48_000, 47, false, None);
            pos += a.len() as u64;
            feed(&mut r, &a);
        }
        let snap = r.snapshot();
        assert_eq!(snap.chunks().len(), 6);
        assert!((snap.length_ms() - 6000.0).abs() < 1.0);
        // 2.5 s .. 4 s: starts at the keyframe at 2 s, includes 2 s and 3 s (video + audio).
        let out = snap.export(2500.0, 4000.0).unwrap();
        let mut again = ClipRing::new(60_000.0, 1 << 30);
        feed(&mut again, &out);
        assert_eq!(again.tracks.len(), 2);
        let starts: Vec<(bool, f64)> = again.frags.iter().map(|f| (f.video, f.start_ms)).collect();
        assert_eq!(starts, vec![(true, 0.0), (false, 0.0), (true, 1000.0), (false, 1000.0)]);
        // mfhd renumbered, base_data_offset rewritten to the new file positions.
        let init_len = init_segment().len() as u64;
        let mut p = init_len;
        for (i, f) in again.frags.iter().enumerate() {
            for patch in &f.patches {
                match patch {
                    Patch::Sequence { at } => assert_eq!(be32(&f.data, *at), Some(i as u32 + 1)),
                    Patch::BaseOffset { value, .. } => assert_eq!(*value, p),
                    _ => {}
                }
            }
            p += f.data.len() as u64;
        }
        assert!(snap.export(0.0, 100.0).is_some());
        assert!(ClipRing::new(1.0, 1).snapshot().export(0.0, 1.0).is_none());
    }

    #[test]
    fn patches_pending_bytes() {
        let mut r = ClipRing::new(1000.0, 1 << 20);
        let init = init_segment();
        r.push(&init[..20]);
        r.patch(4, b"ftyp");
        r.push(&init[20..]);
        assert_eq!(r.tracks.len(), 2);
    }
}
