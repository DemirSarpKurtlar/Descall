//! Shared-memory frame ring between the Rust capture thread and the page.
//!
//! The memory is a WebView2 shared buffer (ICoreWebView2Environment12::CreateSharedBuffer,
//! posted once per share with ICoreWebView2_17::PostSharedBufferToScript, access ReadOnly
//! for script). The page gets it as an ArrayBuffer in the `sharedbufferreceived` event and
//! reads frames with a DataView; a tiny "frame N ready" web message (or a Tauri Channel
//! message) wakes it per frame. No frame bytes go through IPC.
//!
//! Layout (little endian), all offsets fixed per session:
//! ```text
//!   0  u32 magic "DSC1"        4 u32 version (1)
//!   8  u32 video_slots         12 u32 video_slot_bytes (header 64 + payload)
//!  16  u32 audio_slots         20 u32 audio_slot_bytes (header 32 + payload)
//!  24  u32 video_offset        28 u32 audio_offset
//!  32  u64 latest_video_seq    40 u64 latest_audio_seq
//!  48  u32 width  52 u32 height  56 u32 format (1 = NV12)  60 u32 sample_rate  64 u32 channels
//! video slot: u64 seq_begin, u64 seq_end, u64 timestamp_us, u32 w, u32 h, u32 y_stride,
//!             u32 uv_offset, u32 payload_len, u32 flags, ... payload at +64
//! audio slot: u64 seq_begin, u64 seq_end, u64 timestamp_us, u32 frames, u32 flags, payload at +32
//! ```
//! Seqlock rule: the writer stores `seq_begin = seq`, writes the payload, then `seq_end = seq`
//! and finally `latest_*_seq = seq` (Release). The reader copies the payload out (VideoFrame /
//! AudioData constructors copy anyway) and drops the frame if `seq_begin != seq_end` after the
//! copy. Three video slots give the page two frame periods (33 ms at 60 fps) to copy.

use std::sync::atomic::{fence, Ordering};

pub const MAGIC: u32 = u32::from_le_bytes(*b"DSC1");
pub const HEADER_BYTES: usize = 256;
pub const VIDEO_SLOT_HEADER: usize = 64;
pub const AUDIO_SLOT_HEADER: usize = 32;
pub const FORMAT_NV12: u32 = 1;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Layout {
    pub video_slots: u32,
    pub video_slot_bytes: u32,
    pub audio_slots: u32,
    pub audio_slot_bytes: u32,
    pub video_offset: u32,
    pub audio_offset: u32,
    pub total: usize,
}

impl Layout {
    /// `max_w`/`max_h`: the preset box (the frame never exceeds it, see presets::fit).
    /// Audio: 10 ms packets of f32 stereo at 48 kHz = 480 frames * 8 bytes.
    pub fn new(max_w: u32, max_h: u32) -> Self {
        let video_payload = crate::presets::nv12_size(max_w, max_h);
        let video_slot_bytes = align(VIDEO_SLOT_HEADER + video_payload, 64) as u32;
        let audio_slot_bytes = align(AUDIO_SLOT_HEADER + 480 * 2 * 4 * 2, 64) as u32; // room for 20 ms
        let video_slots = 3;
        let audio_slots = 64;
        let video_offset = HEADER_BYTES as u32;
        let audio_offset = video_offset + video_slots * video_slot_bytes;
        let total = audio_offset as usize + (audio_slots * audio_slot_bytes) as usize;
        Layout { video_slots, video_slot_bytes, audio_slots, audio_slot_bytes, video_offset, audio_offset, total }
    }
}

const fn align(v: usize, a: usize) -> usize {
    (v + a - 1) & !(a - 1)
}

/// Writer over memory the caller owns (the WebView2 shared buffer mapping, or a Vec in tests).
pub struct RingWriter {
    base: *mut u8,
    len: usize,
    layout: Layout,
    video_seq: u64,
    audio_seq: u64,
}

// The buffer is only written from the capture threads, one writer per region.
unsafe impl Send for RingWriter {}

impl RingWriter {
    /// # Safety
    /// `base..base+len` must stay mapped and writable for the writer's lifetime.
    pub unsafe fn new(base: *mut u8, len: usize, layout: Layout, sample_rate: u32, channels: u32) -> Self {
        assert!(len >= layout.total, "shared buffer too small");
        let w = RingWriter { base, len, layout, video_seq: 0, audio_seq: 0 };
        w.put_u32(0, MAGIC);
        w.put_u32(4, 1);
        w.put_u32(8, layout.video_slots);
        w.put_u32(12, layout.video_slot_bytes);
        w.put_u32(16, layout.audio_slots);
        w.put_u32(20, layout.audio_slot_bytes);
        w.put_u32(24, layout.video_offset);
        w.put_u32(28, layout.audio_offset);
        w.put_u32(56, FORMAT_NV12);
        w.put_u32(60, sample_rate);
        w.put_u32(64, channels);
        w
    }

    fn put_u32(&self, off: usize, v: u32) {
        debug_assert!(off + 4 <= self.len);
        unsafe { std::ptr::write_unaligned(self.base.add(off) as *mut u32, v.to_le()) }
    }
    fn put_u64(&self, off: usize, v: u64) {
        debug_assert!(off + 8 <= self.len);
        unsafe { std::ptr::write_unaligned(self.base.add(off) as *mut u64, v.to_le()) }
    }

    /// Called under the share's mutex right before the shared buffer is closed: every later
    /// write is a no-op (a WGC callback may still be in flight after GraphicsCaptureSession::Close).
    pub fn detach(&mut self) {
        self.base = std::ptr::null_mut();
        self.len = 0;
    }

    pub fn is_attached(&self) -> bool {
        !self.base.is_null()
    }

    /// Copy one NV12 frame (Y plane rows of `y_stride` bytes, then the UV plane) into the next
    /// slot. `src_row_pitch` is the staging texture RowPitch; rows are repacked tightly.
    /// Returns the sequence number to announce to the page.
    pub fn write_nv12(&mut self, w: u32, h: u32, src: &[u8], src_row_pitch: usize, timestamp_us: u64) -> u64 {
        if self.base.is_null() {
            return 0;
        }
        let seq = self.video_seq + 1;
        let l = self.layout;
        let slot = l.video_offset as usize + ((seq % l.video_slots as u64) as usize) * l.video_slot_bytes as usize;
        let payload = slot + VIDEO_SLOT_HEADER;
        let (wu, hu) = (w as usize, h as usize);
        let y_len = wu * hu;
        let need = y_len * 3 / 2;
        assert!(VIDEO_SLOT_HEADER + need <= l.video_slot_bytes as usize, "frame larger than the preset box");
        self.put_u64(slot, seq);
        fence(Ordering::Release);
        unsafe {
            // Y rows, then UV rows (the UV plane starts at RowPitch * Height in a mapped NV12 texture).
            for row in 0..hu {
                std::ptr::copy_nonoverlapping(src.as_ptr().add(row * src_row_pitch), self.base.add(payload + row * wu), wu);
            }
            let uv_src = src_row_pitch * hu;
            for row in 0..hu / 2 {
                std::ptr::copy_nonoverlapping(
                    src.as_ptr().add(uv_src + row * src_row_pitch),
                    self.base.add(payload + y_len + row * wu),
                    wu,
                );
            }
        }
        self.put_u64(slot + 16, timestamp_us);
        self.put_u32(slot + 24, w);
        self.put_u32(slot + 28, h);
        self.put_u32(slot + 32, w); // y_stride (tight)
        self.put_u32(slot + 36, y_len as u32); // uv_offset
        self.put_u32(slot + 40, need as u32);
        fence(Ordering::Release);
        self.put_u64(slot + 8, seq);
        self.put_u32(48, w);
        self.put_u32(52, h);
        fence(Ordering::Release);
        self.put_u64(32, seq);
        self.video_seq = seq;
        seq
    }

    /// Interleaved f32 samples (frames * channels).
    pub fn write_audio(&mut self, samples: &[f32], frames: u32, timestamp_us: u64, silent: bool) -> u64 {
        if self.base.is_null() {
            return 0;
        }
        let seq = self.audio_seq + 1;
        let l = self.layout;
        let slot = l.audio_offset as usize + ((seq % l.audio_slots as u64) as usize) * l.audio_slot_bytes as usize;
        let bytes = std::mem::size_of_val(samples);
        assert!(AUDIO_SLOT_HEADER + bytes <= l.audio_slot_bytes as usize, "audio packet too large");
        self.put_u64(slot, seq);
        fence(Ordering::Release);
        unsafe {
            std::ptr::copy_nonoverlapping(samples.as_ptr() as *const u8, self.base.add(slot + AUDIO_SLOT_HEADER), bytes);
        }
        self.put_u64(slot + 16, timestamp_us);
        self.put_u32(slot + 24, frames);
        self.put_u32(slot + 28, silent as u32);
        fence(Ordering::Release);
        self.put_u64(slot + 8, seq);
        self.put_u64(40, seq);
        self.audio_seq = seq;
        seq
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn writes_tight_nv12_and_seqlock() {
        let layout = Layout::new(4, 4);
        let mut mem = vec![0u8; layout.total];
        let mut w = unsafe { RingWriter::new(mem.as_mut_ptr(), mem.len(), layout, 48_000, 2) };
        // 4x4 NV12 with a padded pitch of 8: Y rows 4 x 8 bytes, UV rows 2 x 8 bytes.
        let mut src = vec![0u8; 8 * 4 + 8 * 2];
        for r in 0..4 { for c in 0..4 { src[r * 8 + c] = (r * 4 + c) as u8; } }
        for r in 0..2 { for c in 0..4 { src[32 + r * 8 + c] = 100 + (r * 4 + c) as u8; } }
        let seq = w.write_nv12(4, 4, &src, 8, 1234);
        assert_eq!(seq, 1);
        let slot = layout.video_offset as usize + layout.video_slot_bytes as usize; // 1 % 3 = 1
        let rd64 = |o: usize| u64::from_le_bytes(mem[o..o + 8].try_into().unwrap());
        assert_eq!(rd64(slot), 1);
        assert_eq!(rd64(slot + 8), 1);
        assert_eq!(rd64(32), 1);
        let p = slot + VIDEO_SLOT_HEADER;
        assert_eq!(&mem[p..p + 4], &[0, 1, 2, 3]);
        assert_eq!(&mem[p + 16..p + 20], &[100, 101, 102, 103]);
        assert_eq!(&mem[p + 20..p + 24], &[104, 105, 106, 107]);
        assert_eq!(u32::from_le_bytes(mem[0..4].try_into().unwrap()), MAGIC);
    }
    #[test]
    fn layout_1440p_fits_in_a_reasonable_buffer() {
        let l = Layout::new(2560, 1440);
        assert!(l.total < 18 * 1024 * 1024, "{}", l.total);
    }
}
