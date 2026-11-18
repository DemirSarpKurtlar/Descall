//! Shared-memory frame ring between the Rust capture threads and the page.
//!
//! The memory is a WebView2 shared buffer (ICoreWebView2Environment12::CreateSharedBuffer,
//! posted once per share with ICoreWebView2_17::PostSharedBufferToScript, read-only for
//! script). The page gets it as an ArrayBuffer in the `sharedbufferreceived` event and reads
//! frames with a DataView; a tiny "frame N ready" web message wakes it per frame. No frame
//! bytes go through IPC. `desktop/app/shim/native-screen-share.js` is the JS reader and
//! [`RingReader`] is the Rust reader (bench and tests); both follow the same rules.
//!
//! Layout version 2 (little endian), all offsets fixed per session:
//! ```text
//!   0 u32 magic "DSC1"          4 u32 version (2)
//!   8 u32 video_slots          12 u32 video_slot_bytes (64 header + payload, 64-aligned)
//!  16 u32 audio_slots          20 u32 audio_slot_bytes (32 header + payload, 64-aligned)
//!  24 u32 video_offset         28 u32 audio_offset
//!  32 u64 latest_video_seq     40 u64 latest_audio_seq
//!  48 u32 width   52 u32 height   56 u32 format (1 = NV12)
//!  60 u32 sample_rate          64 u32 channels
//!  68 u32 state (0 init, 1 live, 2 ended)
//!  72 u32 flags (1 audio, 2 hdr tone-mapped, 4 cursor)
//!  76 u32 max_width            80 u32 max_height
//!  88 u64 video_frames_rejected (frames that did not fit the box; should stay 0)
//!  96 u64 total_bytes
//! video slot: 0 u64 seq_begin, 8 u64 seq_end, 16 u64 timestamp_us, 24 u32 w, 28 u32 h,
//!             32 u32 y_stride, 36 u32 uv_offset, 40 u32 payload_len, 44 u32 flags,
//!             48 u64 arrival_us, 56 u64 written_us, payload at +64
//! audio slot: 0 u64 seq_begin, 8 u64 seq_end, 16 u64 timestamp_us, 24 u32 frames,
//!             28 u32 flags (1 silent, 2 discontinuity), payload at +32 (interleaved f32)
//! ```
//!
//! Seqlock rule. Writer: `seq_begin = seq`, payload, slot header, `seq_end = seq`, then
//! `latest_*_seq = seq`. Reader: check `seq_end == seq` (the slot holds a complete `seq`),
//! copy the payload out, then check `seq_begin == seq` (no newer write started meanwhile);
//! otherwise drop the copy. Three video slots give the page two frame periods to copy
//! (33 ms at 60 fps); 64 audio slots are 640 ms of 10 ms packets.

use std::sync::atomic::{fence, Ordering};

pub const MAGIC: u32 = u32::from_le_bytes(*b"DSC1");
pub const VERSION: u32 = 2;
pub const HEADER_BYTES: usize = 256;
pub const VIDEO_SLOT_HEADER: usize = 64;
pub const AUDIO_SLOT_HEADER: usize = 32;
pub const FORMAT_NV12: u32 = 1;
pub const VIDEO_SLOTS: u32 = 3;
pub const AUDIO_SLOTS: u32 = 64;
/// Largest audio packet a slot holds: 20 ms of 48 kHz stereo f32.
pub const AUDIO_MAX_FRAMES: usize = 960;
pub const AUDIO_MAX_CHANNELS: usize = 2;

pub const STATE_INIT: u32 = 0;
pub const STATE_LIVE: u32 = 1;
pub const STATE_ENDED: u32 = 2;

pub const FLAG_AUDIO: u32 = 1;
pub const FLAG_HDR: u32 = 2;
pub const FLAG_CURSOR: u32 = 4;

pub const AUDIO_SILENT: u32 = 1;
pub const AUDIO_DISCONTINUITY: u32 = 2;

pub mod off {
    pub const MAGIC: usize = 0;
    pub const VERSION: usize = 4;
    pub const VIDEO_SLOTS: usize = 8;
    pub const VIDEO_SLOT_BYTES: usize = 12;
    pub const AUDIO_SLOTS: usize = 16;
    pub const AUDIO_SLOT_BYTES: usize = 20;
    pub const VIDEO_OFFSET: usize = 24;
    pub const AUDIO_OFFSET: usize = 28;
    pub const LATEST_VIDEO: usize = 32;
    pub const LATEST_AUDIO: usize = 40;
    pub const WIDTH: usize = 48;
    pub const HEIGHT: usize = 52;
    pub const FORMAT: usize = 56;
    pub const SAMPLE_RATE: usize = 60;
    pub const CHANNELS: usize = 64;
    pub const STATE: usize = 68;
    pub const FLAGS: usize = 72;
    pub const MAX_WIDTH: usize = 76;
    pub const MAX_HEIGHT: usize = 80;
    pub const REJECTED: usize = 88;
    pub const TOTAL: usize = 96;
    // video slot
    pub const V_SEQ_BEGIN: usize = 0;
    pub const V_SEQ_END: usize = 8;
    pub const V_TS: usize = 16;
    pub const V_W: usize = 24;
    pub const V_H: usize = 28;
    pub const V_Y_STRIDE: usize = 32;
    pub const V_UV_OFFSET: usize = 36;
    pub const V_LEN: usize = 40;
    pub const V_FLAGS: usize = 44;
    pub const V_ARRIVAL: usize = 48;
    pub const V_WRITTEN: usize = 56;
    // audio slot
    pub const A_SEQ_BEGIN: usize = 0;
    pub const A_SEQ_END: usize = 8;
    pub const A_TS: usize = 16;
    pub const A_FRAMES: usize = 24;
    pub const A_FLAGS: usize = 28;
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Layout {
    pub video_slots: u32,
    pub video_slot_bytes: u32,
    pub audio_slots: u32,
    pub audio_slot_bytes: u32,
    pub video_offset: u32,
    pub audio_offset: u32,
    pub max_w: u32,
    pub max_h: u32,
    pub total: usize,
}

impl Layout {
    /// `max_w`/`max_h`: the preset box (a frame never exceeds it, see presets::fit).
    pub fn new(max_w: u32, max_h: u32) -> Self {
        let (max_w, max_h) = (max_w.max(2) & !1, max_h.max(2) & !1);
        let video_payload = crate::presets::nv12_size(max_w, max_h);
        let video_slot_bytes = align(VIDEO_SLOT_HEADER + video_payload, 64) as u32;
        let audio_slot_bytes = align(AUDIO_SLOT_HEADER + AUDIO_MAX_FRAMES * AUDIO_MAX_CHANNELS * 4, 64) as u32;
        let video_offset = HEADER_BYTES as u32;
        let audio_offset = video_offset + VIDEO_SLOTS * video_slot_bytes;
        let total = audio_offset as usize + (AUDIO_SLOTS * audio_slot_bytes) as usize;
        Layout { video_slots: VIDEO_SLOTS, video_slot_bytes, audio_slots: AUDIO_SLOTS, audio_slot_bytes, video_offset, audio_offset, max_w, max_h, total }
    }

    pub fn video_slot(&self, seq: u64) -> usize {
        self.video_offset as usize + ((seq % self.video_slots as u64) as usize) * self.video_slot_bytes as usize
    }

    pub fn audio_slot(&self, seq: u64) -> usize {
        self.audio_offset as usize + ((seq % self.audio_slots as u64) as usize) * self.audio_slot_bytes as usize
    }
}

const fn align(v: usize, a: usize) -> usize {
    (v + a - 1) & !(a - 1)
}

/// Why a write was refused (never a panic in production: a bad frame is just skipped).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WriteError {
    Detached,
    TooLarge,
    BadSource,
}

/// Writer over memory the caller owns (the WebView2 shared buffer mapping, or a Vec).
pub struct RingWriter {
    base: *mut u8,
    len: usize,
    layout: Layout,
    video_seq: u64,
    audio_seq: u64,
    rejected: u64,
}

// The buffer is only written from the capture threads, behind the share's mutex.
unsafe impl Send for RingWriter {}

impl RingWriter {
    /// # Safety
    /// `base..base+len` must stay mapped and writable until [`RingWriter::detach`] is called
    /// or the writer is dropped.
    pub unsafe fn new(base: *mut u8, len: usize, layout: Layout, sample_rate: u32, channels: u32) -> Self {
        assert!(len >= layout.total && !base.is_null(), "shared buffer too small");
        // Fresh header: zero it so a reused allocation never shows stale sequence numbers.
        unsafe { std::ptr::write_bytes(base, 0, HEADER_BYTES) };
        let w = RingWriter { base, len, layout, video_seq: 0, audio_seq: 0, rejected: 0 };
        w.put_u32(off::MAGIC, MAGIC);
        w.put_u32(off::VERSION, VERSION);
        w.put_u32(off::VIDEO_SLOTS, layout.video_slots);
        w.put_u32(off::VIDEO_SLOT_BYTES, layout.video_slot_bytes);
        w.put_u32(off::AUDIO_SLOTS, layout.audio_slots);
        w.put_u32(off::AUDIO_SLOT_BYTES, layout.audio_slot_bytes);
        w.put_u32(off::VIDEO_OFFSET, layout.video_offset);
        w.put_u32(off::AUDIO_OFFSET, layout.audio_offset);
        w.put_u32(off::FORMAT, FORMAT_NV12);
        w.put_u32(off::SAMPLE_RATE, sample_rate);
        w.put_u32(off::CHANNELS, channels);
        w.put_u32(off::MAX_WIDTH, layout.max_w);
        w.put_u32(off::MAX_HEIGHT, layout.max_h);
        w.put_u64(off::TOTAL, layout.total as u64);
        // Slot sequence words of a recycled buffer must not match a future sequence.
        for i in 0..layout.video_slots as u64 {
            let s = layout.video_slot(i);
            w.put_u64(s + off::V_SEQ_BEGIN, 0);
            w.put_u64(s + off::V_SEQ_END, 0);
        }
        for i in 0..layout.audio_slots as u64 {
            let s = layout.audio_slot(i);
            w.put_u64(s + off::A_SEQ_BEGIN, 0);
            w.put_u64(s + off::A_SEQ_END, 0);
        }
        fence(Ordering::Release);
        w.put_u32(off::STATE, STATE_LIVE);
        w
    }

    pub fn layout(&self) -> Layout {
        self.layout
    }

    fn put_u32(&self, o: usize, v: u32) {
        debug_assert!(o + 4 <= self.len);
        unsafe { std::ptr::write_unaligned(self.base.add(o) as *mut u32, v.to_le()) }
    }

    fn put_u64(&self, o: usize, v: u64) {
        debug_assert!(o + 8 <= self.len);
        unsafe { std::ptr::write_unaligned(self.base.add(o) as *mut u64, v.to_le()) }
    }

    pub fn set_flags(&self, flags: u32) {
        if self.is_attached() {
            self.put_u32(off::FLAGS, flags);
        }
    }

    /// Mark the ring ended (the page stops reading even if the end message is lost) and stop
    /// writing. Called under the share's mutex right before the shared buffer is closed:
    /// every later write is a no-op (a WGC callback may still be in flight after Close).
    pub fn detach(&mut self) {
        if self.is_attached() {
            fence(Ordering::Release);
            self.put_u32(off::STATE, STATE_ENDED);
        }
        self.base = std::ptr::null_mut();
        self.len = 0;
    }

    pub fn is_attached(&self) -> bool {
        !self.base.is_null()
    }

    pub fn video_seq(&self) -> u64 {
        self.video_seq
    }

    pub fn audio_seq(&self) -> u64 {
        self.audio_seq
    }

    /// Copy one NV12 frame into the next slot. `src` holds `h` Y rows of `src_row_pitch`
    /// bytes followed by `h / 2` UV rows at `src_row_pitch * h` (a mapped NV12 texture).
    /// Rows are repacked tightly. Returns the sequence number to announce to the page.
    pub fn write_nv12(&mut self, w: u32, h: u32, src: &[u8], src_row_pitch: usize, timestamp_us: u64, arrival_us: u64, written_us: u64) -> Result<u64, WriteError> {
        if !self.is_attached() {
            return Err(WriteError::Detached);
        }
        let (wu, hu) = (w as usize, h as usize);
        if w == 0 || h == 0 || w % 2 != 0 || h % 2 != 0 || src_row_pitch < wu || src.len() < src_row_pitch * (hu + hu / 2) {
            return Err(WriteError::BadSource);
        }
        let y_len = wu * hu;
        let need = y_len * 3 / 2;
        let l = self.layout;
        if VIDEO_SLOT_HEADER + need > l.video_slot_bytes as usize {
            self.rejected += 1;
            self.put_u64(off::REJECTED, self.rejected);
            return Err(WriteError::TooLarge);
        }
        let seq = self.video_seq + 1;
        let slot = l.video_slot(seq);
        let payload = slot + VIDEO_SLOT_HEADER;
        self.put_u64(slot + off::V_SEQ_BEGIN, seq);
        fence(Ordering::Release);
        unsafe {
            if src_row_pitch == wu {
                std::ptr::copy_nonoverlapping(src.as_ptr(), self.base.add(payload), need);
            } else {
                for row in 0..hu {
                    std::ptr::copy_nonoverlapping(src.as_ptr().add(row * src_row_pitch), self.base.add(payload + row * wu), wu);
                }
                let uv_src = src_row_pitch * hu;
                for row in 0..hu / 2 {
                    std::ptr::copy_nonoverlapping(src.as_ptr().add(uv_src + row * src_row_pitch), self.base.add(payload + y_len + row * wu), wu);
                }
            }
        }
        self.put_u64(slot + off::V_TS, timestamp_us);
        self.put_u32(slot + off::V_W, w);
        self.put_u32(slot + off::V_H, h);
        self.put_u32(slot + off::V_Y_STRIDE, w);
        self.put_u32(slot + off::V_UV_OFFSET, y_len as u32);
        self.put_u32(slot + off::V_LEN, need as u32);
        self.put_u32(slot + off::V_FLAGS, 0);
        self.put_u64(slot + off::V_ARRIVAL, arrival_us);
        self.put_u64(slot + off::V_WRITTEN, written_us);
        fence(Ordering::Release);
        self.put_u64(slot + off::V_SEQ_END, seq);
        self.put_u32(off::WIDTH, w);
        self.put_u32(off::HEIGHT, h);
        fence(Ordering::Release);
        self.put_u64(off::LATEST_VIDEO, seq);
        self.video_seq = seq;
        Ok(seq)
    }

    /// Interleaved f32 samples (`frames * channels`).
    pub fn write_audio(&mut self, samples: &[f32], frames: u32, timestamp_us: u64, flags: u32) -> Result<u64, WriteError> {
        if !self.is_attached() {
            return Err(WriteError::Detached);
        }
        let l = self.layout;
        let bytes = std::mem::size_of_val(samples);
        if AUDIO_SLOT_HEADER + bytes > l.audio_slot_bytes as usize {
            return Err(WriteError::TooLarge);
        }
        let seq = self.audio_seq + 1;
        let slot = l.audio_slot(seq);
        self.put_u64(slot + off::A_SEQ_BEGIN, seq);
        fence(Ordering::Release);
        unsafe {
            std::ptr::copy_nonoverlapping(samples.as_ptr() as *const u8, self.base.add(slot + AUDIO_SLOT_HEADER), bytes);
        }
        self.put_u64(slot + off::A_TS, timestamp_us);
        self.put_u32(slot + off::A_FRAMES, frames);
        self.put_u32(slot + off::A_FLAGS, flags);
        fence(Ordering::Release);
        self.put_u64(slot + off::A_SEQ_END, seq);
        fence(Ordering::Release);
        self.put_u64(off::LATEST_AUDIO, seq);
        self.audio_seq = seq;
        Ok(seq)
    }
}

/// A video frame copied out of the ring.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VideoFrameCopy {
    pub seq: u64,
    pub width: u32,
    pub height: u32,
    pub timestamp_us: u64,
    pub arrival_us: u64,
    pub written_us: u64,
    /// Tight NV12: Y plane (`width * height`) then interleaved UV.
    pub nv12: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct AudioPacketCopy {
    pub seq: u64,
    pub frames: u32,
    pub timestamp_us: u64,
    pub flags: u32,
    pub samples: Vec<f32>,
}

/// Rust mirror of the page's reader, over a byte slice (tests, the bench).
pub struct RingReader<'a> {
    mem: &'a [u8],
}

impl<'a> RingReader<'a> {
    pub fn new(mem: &'a [u8]) -> Option<Self> {
        let r = RingReader { mem };
        (mem.len() >= HEADER_BYTES && r.u32(off::MAGIC) == MAGIC && r.u32(off::VERSION) == VERSION).then_some(r)
    }

    pub fn u32(&self, o: usize) -> u32 {
        u32::from_le_bytes(self.mem[o..o + 4].try_into().unwrap())
    }

    pub fn u64(&self, o: usize) -> u64 {
        fence(Ordering::Acquire);
        u64::from_le_bytes(self.mem[o..o + 8].try_into().unwrap())
    }

    pub fn state(&self) -> u32 {
        self.u32(off::STATE)
    }

    pub fn flags(&self) -> u32 {
        self.u32(off::FLAGS)
    }

    pub fn latest_video(&self) -> u64 {
        self.u64(off::LATEST_VIDEO)
    }

    pub fn latest_audio(&self) -> u64 {
        self.u64(off::LATEST_AUDIO)
    }

    fn layout(&self) -> (usize, usize, u64, usize, usize, u64) {
        (
            self.u32(off::VIDEO_OFFSET) as usize,
            self.u32(off::VIDEO_SLOT_BYTES) as usize,
            self.u32(off::VIDEO_SLOTS) as u64,
            self.u32(off::AUDIO_OFFSET) as usize,
            self.u32(off::AUDIO_SLOT_BYTES) as usize,
            self.u32(off::AUDIO_SLOTS) as u64,
        )
    }

    /// Copy frame `seq` out, or `None` if the slot no longer (or not yet) holds it intact.
    pub fn read_video(&self, seq: u64) -> Option<VideoFrameCopy> {
        let (vo, vb, vs, ..) = self.layout();
        if seq == 0 || vs == 0 {
            return None;
        }
        let slot = vo + ((seq % vs) as usize) * vb;
        if self.u64(slot + off::V_SEQ_END) != seq {
            return None;
        }
        let len = self.u32(slot + off::V_LEN) as usize;
        if VIDEO_SLOT_HEADER + len > vb {
            return None;
        }
        let f = VideoFrameCopy {
            seq,
            width: self.u32(slot + off::V_W),
            height: self.u32(slot + off::V_H),
            timestamp_us: self.u64(slot + off::V_TS),
            arrival_us: self.u64(slot + off::V_ARRIVAL),
            written_us: self.u64(slot + off::V_WRITTEN),
            nv12: self.mem[slot + VIDEO_SLOT_HEADER..slot + VIDEO_SLOT_HEADER + len].to_vec(),
        };
        (self.u64(slot + off::V_SEQ_BEGIN) == seq).then_some(f)
    }

    /// Unread audio packets after `last`, oldest first, skipping overwritten ones. Returns the
    /// packets and the new `last`.
    pub fn read_audio_since(&self, last: u64) -> (Vec<AudioPacketCopy>, u64) {
        let (.., ao, ab, aslots) = self.layout();
        let latest = self.latest_audio();
        let mut out = Vec::new();
        if aslots == 0 || latest <= last {
            return (out, last);
        }
        let channels = self.u32(off::CHANNELS).max(1) as usize;
        // The oldest slot may be mid-overwrite: leave one slot of margin.
        let from = (last + 1).max(latest.saturating_sub(aslots - 2));
        for s in from..=latest {
            let slot = ao + ((s % aslots) as usize) * ab;
            if self.u64(slot + off::A_SEQ_END) != s {
                continue;
            }
            let frames = self.u32(slot + off::A_FRAMES);
            let n = frames as usize * channels;
            if AUDIO_SLOT_HEADER + n * 4 > ab {
                continue;
            }
            let p = slot + AUDIO_SLOT_HEADER;
            let samples: Vec<f32> = self.mem[p..p + n * 4].chunks_exact(4).map(|c| f32::from_le_bytes(c.try_into().unwrap())).collect();
            let pkt = AudioPacketCopy { seq: s, frames, timestamp_us: self.u64(slot + off::A_TS), flags: self.u32(slot + off::A_FLAGS), samples };
            if self.u64(slot + off::A_SEQ_BEGIN) == s {
                out.push(pkt);
            }
        }
        (out, latest)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ring(w: u32, h: u32) -> (Vec<u8>, Layout) {
        let layout = Layout::new(w, h);
        (vec![0xAAu8; layout.total], layout)
    }

    #[test]
    fn writes_tight_nv12_and_reader_round_trips() {
        let (mut mem, layout) = ring(4, 4);
        let mut w = unsafe { RingWriter::new(mem.as_mut_ptr(), mem.len(), layout, 48_000, 2) };
        // 4x4 NV12 with a padded pitch of 8: Y rows 4 x 8 bytes, UV rows 2 x 8 bytes.
        let mut src = vec![0u8; 8 * 4 + 8 * 2];
        for r in 0..4 {
            for c in 0..4 {
                src[r * 8 + c] = (r * 4 + c) as u8;
            }
        }
        for r in 0..2 {
            for c in 0..4 {
                src[32 + r * 8 + c] = 100 + (r * 4 + c) as u8;
            }
        }
        let seq = w.write_nv12(4, 4, &src, 8, 1234, 1200, 1240).unwrap();
        assert_eq!(seq, 1);
        drop(w);
        let r = RingReader::new(&mem).expect("valid header");
        assert_eq!(r.state(), STATE_LIVE);
        assert_eq!(r.latest_video(), 1);
        let f = r.read_video(1).unwrap();
        assert_eq!((f.width, f.height, f.timestamp_us, f.arrival_us, f.written_us), (4, 4, 1234, 1200, 1240));
        assert_eq!(&f.nv12[..4], &[0, 1, 2, 3]);
        assert_eq!(&f.nv12[16..24], &[100, 101, 102, 103, 104, 105, 106, 107]);
        assert!(r.read_video(2).is_none());
        assert!(r.read_video(0).is_none());
    }

    #[test]
    fn tight_pitch_fast_path_matches() {
        let (mut mem, layout) = ring(4, 2);
        let mut w = unsafe { RingWriter::new(mem.as_mut_ptr(), mem.len(), layout, 48_000, 2) };
        let src: Vec<u8> = (0..12).collect();
        w.write_nv12(4, 2, &src, 4, 0, 0, 0).unwrap();
        drop(w);
        assert_eq!(RingReader::new(&mem).unwrap().read_video(1).unwrap().nv12, src);
    }

    #[test]
    fn video_slots_wrap_and_old_frames_vanish() {
        let (mut mem, layout) = ring(2, 2);
        let mut w = unsafe { RingWriter::new(mem.as_mut_ptr(), mem.len(), layout, 48_000, 2) };
        for i in 0..10u8 {
            w.write_nv12(2, 2, &[i; 6], 2, i as u64, 0, 0).unwrap();
        }
        drop(w);
        let r = RingReader::new(&mem).unwrap();
        assert_eq!(r.latest_video(), 10);
        for s in 8..=10 {
            assert_eq!(r.read_video(s).unwrap().nv12, vec![(s - 1) as u8; 6]);
        }
        assert!(r.read_video(7).is_none(), "slot reused by seq 10");
    }

    #[test]
    fn torn_slot_is_rejected() {
        let (mut mem, layout) = ring(2, 2);
        let mut w = unsafe { RingWriter::new(mem.as_mut_ptr(), mem.len(), layout, 48_000, 2) };
        w.write_nv12(2, 2, &[7; 6], 2, 0, 0, 0).unwrap();
        drop(w);
        // Simulate a writer that started seq 4 in the same slot (1 % 3 == 4 % 3).
        let slot = layout.video_slot(1);
        mem[slot..slot + 8].copy_from_slice(&4u64.to_le_bytes());
        assert!(RingReader::new(&mem).unwrap().read_video(1).is_none());
    }

    #[test]
    fn oversized_and_bad_frames_are_refused_without_panic() {
        let (mut mem, layout) = ring(4, 4);
        let mut w = unsafe { RingWriter::new(mem.as_mut_ptr(), mem.len(), layout, 48_000, 2) };
        assert_eq!(w.write_nv12(8, 8, &[0; 96], 8, 0, 0, 0), Err(WriteError::TooLarge));
        assert_eq!(w.write_nv12(3, 4, &[0; 18], 3, 0, 0, 0), Err(WriteError::BadSource));
        assert_eq!(w.write_nv12(4, 4, &[0; 10], 4, 0, 0, 0), Err(WriteError::BadSource));
        assert_eq!(w.write_audio(&[0.0; 4000], 2000, 0, 0), Err(WriteError::TooLarge));
        w.detach();
        assert_eq!(w.write_nv12(4, 4, &[0; 24], 4, 0, 0, 0), Err(WriteError::Detached));
        assert_eq!(w.write_audio(&[0.0; 4], 2, 0, 0), Err(WriteError::Detached));
        let r = RingReader::new(&mem).unwrap();
        assert_eq!(r.state(), STATE_ENDED);
        assert_eq!(r.u64(off::REJECTED), 1);
        assert_eq!(r.latest_video(), 0);
    }

    #[test]
    fn audio_reader_drains_in_order_and_skips_overwritten() {
        let (mut mem, layout) = ring(2, 2);
        let mut w = unsafe { RingWriter::new(mem.as_mut_ptr(), mem.len(), layout, 48_000, 2) };
        for i in 0..5 {
            w.write_audio(&[i as f32; 960], 480, i * 10_000, if i == 0 { AUDIO_SILENT } else { 0 }).unwrap();
        }
        let r = RingReader::new(&mem).unwrap();
        let (pkts, last) = r.read_audio_since(0);
        assert_eq!(last, 5);
        assert_eq!(pkts.iter().map(|p| p.seq).collect::<Vec<_>>(), vec![1, 2, 3, 4, 5]);
        assert_eq!(pkts[0].flags, AUDIO_SILENT);
        assert_eq!(pkts[3].samples[0], 3.0);
        assert_eq!(pkts[4].timestamp_us, 40_000);
        let (none, last2) = r.read_audio_since(5);
        assert!(none.is_empty() && last2 == 5);
        // 200 more packets: a reader that fell 640 ms behind only gets the recent window.
        for i in 5..205 {
            w.write_audio(&[0.5; 960], 480, i * 10_000, 0).unwrap();
        }
        let r = RingReader::new(&mem).unwrap();
        let (pkts, last) = r.read_audio_since(5);
        assert_eq!(last, 205);
        assert_eq!(pkts.len() as u32, AUDIO_SLOTS - 1);
        assert_eq!(pkts.first().unwrap().seq, 205 - (AUDIO_SLOTS as u64 - 2));
    }

    #[test]
    fn header_and_sizes() {
        let l = Layout::new(2560, 1440);
        assert!(l.total < 18 * 1024 * 1024, "{}", l.total);
        assert_eq!(l.video_slot_bytes % 64, 0);
        assert_eq!(l.audio_offset as usize % 64, 0);
        let (mut mem, layout) = ring(1920, 1080);
        let w = unsafe { RingWriter::new(mem.as_mut_ptr(), mem.len(), layout, 48_000, 2) };
        w.set_flags(FLAG_AUDIO | FLAG_CURSOR);
        drop(w);
        let r = RingReader::new(&mem).unwrap();
        assert_eq!(r.u32(off::MAX_WIDTH), 1920);
        assert_eq!(r.u32(off::SAMPLE_RATE), 48_000);
        assert_eq!(r.flags(), FLAG_AUDIO | FLAG_CURSOR);
        assert_eq!(r.u64(off::TOTAL), layout.total as u64);
        assert!(RingReader::new(&mem[..100]).is_none());
        // Odd boxes round down to even.
        assert_eq!(Layout::new(1001, 601).max_w, 1000);
    }
}
