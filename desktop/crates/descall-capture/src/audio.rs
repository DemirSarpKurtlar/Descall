//! Portable audio helpers: the 10 ms packetizer the loopback thread feeds, and the small
//! DSP kit the echo test uses (tone generator, Goertzel level of one frequency, RMS).

/// 48 kHz stereo f32, the format the loopback client asks the engine for.
pub const SAMPLE_RATE: u32 = 48_000;
pub const CHANNELS: u16 = 2;
/// 10 ms packets, the WebRTC audio frame size.
pub const PACKET_FRAMES: usize = 480;
/// Silence is only inserted when the delivered audio lags the wall clock by more than this
/// (loopback delivers nothing while nothing plays; small delivery jitter must not add gaps).
pub const SILENCE_LAG_FRAMES: u64 = 3 * PACKET_FRAMES as u64;

/// Cuts the engine's arbitrary-sized buffers into fixed 10 ms packets with a sample-clock
/// timestamp, and fills silence while nothing plays so the page's audio track keeps a steady
/// clock (WebRTC jitter buffers and LiveKit's audio level dislike gaps).
pub struct Packetizer {
    channels: usize,
    rate: u64,
    acc: Vec<f32>,
    silence: Vec<f32>,
    emitted_frames: u64,
    pending_flags: u32,
}

impl Packetizer {
    pub fn new(channels: u16, rate: u32) -> Self {
        let ch = channels.max(1) as usize;
        Packetizer { channels: ch, rate: rate.max(1) as u64, acc: Vec::with_capacity(PACKET_FRAMES * ch * 4), silence: vec![0.0; PACKET_FRAMES * ch], emitted_frames: 0, pending_flags: 0 }
    }

    pub fn emitted_frames(&self) -> u64 {
        self.emitted_frames
    }

    fn ts_us(&self) -> u64 {
        self.emitted_frames * 1_000_000 / self.rate
    }

    /// Append interleaved samples (`None` = `frames` of engine-flagged silence).
    pub fn push(&mut self, samples: Option<&[f32]>, frames: usize, discontinuity: bool) {
        match samples {
            Some(s) => self.acc.extend_from_slice(&s[..(frames * self.channels).min(s.len())]),
            None => self.acc.resize(self.acc.len() + frames * self.channels, 0.0),
        }
        if discontinuity {
            self.pending_flags |= crate::ring::AUDIO_DISCONTINUITY;
        }
    }

    /// Emit every complete packet, then silence up to `elapsed_us` of wall clock if the
    /// delivered audio fell behind by more than [`SILENCE_LAG_FRAMES`].
    /// `emit(samples, frames, timestamp_us, flags)`.
    pub fn drain<F: FnMut(&[f32], u32, u64, u32)>(&mut self, elapsed_us: Option<u64>, mut emit: F) {
        let n = PACKET_FRAMES * self.channels;
        let mut consumed = 0;
        while self.acc.len() - consumed >= n {
            let ts = self.ts_us();
            let flags = std::mem::take(&mut self.pending_flags);
            emit(&self.acc[consumed..consumed + n], PACKET_FRAMES as u32, ts, flags);
            consumed += n;
            self.emitted_frames += PACKET_FRAMES as u64;
        }
        self.acc.drain(..consumed);
        if let Some(elapsed) = elapsed_us {
            let due = elapsed * self.rate / 1_000_000;
            if self.emitted_frames + SILENCE_LAG_FRAMES < due && self.acc.is_empty() {
                while self.emitted_frames + PACKET_FRAMES as u64 <= due {
                    let ts = self.ts_us();
                    emit(&self.silence, PACKET_FRAMES as u32, ts, crate::ring::AUDIO_SILENT);
                    self.emitted_frames += PACKET_FRAMES as u64;
                }
            }
        }
    }
}

/// Phase-continuous sine generator (interleaved, same value on every channel).
pub struct Tone {
    pub freq: f32,
    pub amplitude: f32,
    phase: f64,
    rate: f64,
}

impl Tone {
    pub fn new(freq: f32, amplitude: f32, rate: u32) -> Self {
        Tone { freq, amplitude, phase: 0.0, rate: rate as f64 }
    }

    pub fn fill(&mut self, out: &mut [f32], channels: usize) {
        let step = std::f64::consts::TAU * self.freq as f64 / self.rate;
        for frame in out.chunks_exact_mut(channels.max(1)) {
            let v = (self.phase.sin() * self.amplitude as f64) as f32;
            frame.iter_mut().for_each(|s| *s = v);
            self.phase += step;
            if self.phase > std::f64::consts::TAU {
                self.phase -= std::f64::consts::TAU;
            }
        }
    }
}

/// Amplitude to dBFS (full-scale sine = 0 dBFS); silence is clamped to -200.
pub fn to_dbfs(amplitude: f64) -> f64 {
    if amplitude <= 1e-10 {
        -200.0
    } else {
        20.0 * amplitude.log10()
    }
}

/// Level of the `freq` component in dBFS (sine amplitude), Hann-windowed Goertzel over the
/// whole buffer, loudest channel. A full-scale sine at `freq` reads ~0 dBFS.
pub fn tone_dbfs(interleaved: &[f32], channels: usize, rate: u32, freq: f32) -> f64 {
    let ch = channels.max(1);
    let n = interleaved.len() / ch;
    if n < 16 {
        return -200.0;
    }
    let w = std::f64::consts::TAU * freq as f64 / rate as f64;
    let coeff = 2.0 * w.cos();
    let mut best = 0.0f64;
    for c in 0..ch {
        let (mut s1, mut s2) = (0.0f64, 0.0f64);
        let mut wsum = 0.0f64;
        for i in 0..n {
            let hann = 0.5 - 0.5 * (std::f64::consts::TAU * i as f64 / (n - 1) as f64).cos();
            wsum += hann;
            let x = interleaved[i * ch + c] as f64 * hann;
            let s0 = x + coeff * s1 - s2;
            s2 = s1;
            s1 = s0;
        }
        let power = s1 * s1 + s2 * s2 - coeff * s1 * s2;
        let amp = 2.0 * power.max(0.0).sqrt() / wsum;
        best = best.max(amp);
    }
    to_dbfs(best)
}

/// RMS of all samples in dBFS (RMS of a full-scale sine reads -3 dBFS).
pub fn rms_dbfs(samples: &[f32]) -> f64 {
    if samples.is_empty() {
        return -200.0;
    }
    let sum: f64 = samples.iter().map(|&s| (s as f64) * (s as f64)).sum();
    to_dbfs((sum / samples.len() as f64).sqrt())
}

pub fn peak_dbfs(samples: &[f32]) -> f64 {
    to_dbfs(samples.iter().fold(0.0f32, |m, &s| m.max(s.abs())) as f64)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tone(freq: f32, amp: f32, frames: usize) -> Vec<f32> {
        let mut v = vec![0.0; frames * 2];
        Tone::new(freq, amp, SAMPLE_RATE).fill(&mut v, 2);
        v
    }

    #[test]
    fn goertzel_reads_tone_levels() {
        let a = tone(1000.0, 0.5, 48_000);
        assert!((tone_dbfs(&a, 2, SAMPLE_RATE, 1000.0) - to_dbfs(0.5)).abs() < 0.2);
        // A neighbour tone does not leak into the 1 kHz bin.
        let b = tone(440.0, 0.5, 48_000);
        assert!(tone_dbfs(&b, 2, SAMPLE_RATE, 1000.0) < -90.0);
        // -60 dBFS threshold resolution: a 1 kHz tone at -66 dBFS under a loud 440 Hz tone.
        let mut mix = tone(440.0, 0.5, 48_000);
        let quiet = tone(1000.0, 0.0005, 48_000);
        mix.iter_mut().zip(quiet).for_each(|(m, q)| *m += q);
        let l = tone_dbfs(&mix, 2, SAMPLE_RATE, 1000.0);
        assert!((l - to_dbfs(0.0005)).abs() < 1.0, "{l}");
        assert!(tone_dbfs(&[0.0; 2000], 2, SAMPLE_RATE, 1000.0) <= -200.0);
    }

    #[test]
    fn rms_and_peak() {
        let a = tone(1000.0, 1.0, 48_000);
        assert!((rms_dbfs(&a) + 3.01).abs() < 0.05);
        assert!(peak_dbfs(&a).abs() < 0.01);
        assert_eq!(rms_dbfs(&[]), -200.0);
    }

    #[test]
    fn packetizer_cuts_10ms_packets_with_sample_clock() {
        let mut p = Packetizer::new(2, SAMPLE_RATE);
        let mut got = Vec::new();
        p.push(Some(&vec![0.25; 700 * 2]), 700, false);
        p.drain(None, |s, f, ts, fl| got.push((s.len(), f, ts, fl)));
        assert_eq!(got, vec![(960, 480, 0, 0)]);
        p.push(Some(&vec![0.25; 300 * 2]), 300, true);
        p.drain(None, |s, f, ts, fl| got.push((s.len(), f, ts, fl)));
        assert_eq!(got[1], (960, 480, 10_000, crate::ring::AUDIO_DISCONTINUITY));
        assert_eq!(p.emitted_frames(), 960);
        // Engine-flagged silence counts as audio.
        p.push(None, 480, false);
        p.drain(None, |_, _, ts, fl| got.push((0, 0, ts, fl)));
        assert_eq!(got[2], (0, 0, 20_000, 0));
    }

    #[test]
    fn packetizer_fills_silence_only_when_far_behind() {
        let mut p = Packetizer::new(2, SAMPLE_RATE);
        let mut n = 0;
        // 25 ms of wall clock, nothing delivered: within the jitter allowance (30 ms).
        p.drain(Some(25_000), |_, _, _, _| n += 1);
        assert_eq!(n, 0);
        let mut flags = Vec::new();
        p.drain(Some(100_000), |_, f, ts, fl| {
            assert_eq!(f, 480);
            flags.push((ts, fl));
        });
        assert_eq!(flags.len(), 10);
        assert!(flags.iter().all(|&(_, f)| f == crate::ring::AUDIO_SILENT));
        assert_eq!(flags.last().unwrap().0, 90_000);
        // Real audio resumes on the same clock.
        p.push(Some(&vec![0.1; 960]), 480, false);
        p.drain(Some(105_000), |_, _, ts, fl| flags.push((ts, fl)));
        assert_eq!(flags.last().copied(), Some((100_000, 0)));
    }
}
