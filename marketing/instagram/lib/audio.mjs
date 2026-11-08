/**
 * Procedural audio bed: a quiet four-chord pad with a soft pulse, synthesised from sine
 * waves. Original and deterministic (seeded by the script id), so there is nothing to
 * license. "silence" gives a silent stereo track instead.
 */
import { writeFileSync } from "node:fs";

const RATE = 48000;

function seedFrom(text) {
  let h = 2166136261;
  for (const ch of String(text)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

const midiHz = (m) => 440 * 2 ** ((m - 69) / 12);

// Progressions as MIDI chords (root position triads plus a ninth for colour).
const PROGRESSIONS = [
  [[57, 60, 64, 71], [53, 57, 60, 67], [48, 52, 55, 62], [55, 59, 62, 69]], // Am F C G
  [[50, 53, 57, 64], [46, 50, 53, 60], [53, 57, 60, 67], [48, 52, 55, 62]], // Dm Bb F C
  [[52, 55, 59, 66], [48, 52, 55, 62], [55, 59, 62, 69], [50, 54, 57, 64]], // Em C G D
];

/** Float32 stereo samples (interleaved) for `seconds`. */
export function synthPad(seconds, seedText = "descall", { volume = 0.16 } = {}) {
  const seed = seedFrom(seedText);
  const prog = PROGRESSIONS[seed % PROGRESSIONS.length];
  const bpm = [92, 96, 100][(seed >>> 3) % 3];
  const beat = 60 / bpm;
  const chordLen = beat * 4;
  const n = Math.round(seconds * RATE);
  const out = new Float32Array(n * 2);
  const fadeIn = 0.6;
  const fadeOut = 1.4;
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const ci = Math.floor(t / chordLen) % prog.length;
    const local = t - Math.floor(t / chordLen) * chordLen;
    const chord = prog[ci];
    // Chord swell: slow attack, gentle release into the next chord.
    const env = Math.min(1, local / 0.5) * (0.75 + 0.25 * Math.cos((Math.PI * local) / chordLen));
    let l = 0;
    let r = 0;
    chord.forEach((m, k) => {
      const f = midiHz(m);
      const det = 1 + (k % 2 ? 0.0021 : -0.0017);
      const a = 0.22 / (1 + k * 0.35);
      l += a * Math.sin(2 * Math.PI * f * t) + 0.35 * a * Math.sin(2 * Math.PI * f * det * t);
      r += a * Math.sin(2 * Math.PI * f * det * t + 0.4) + 0.35 * a * Math.sin(2 * Math.PI * f * t + 1.1);
    });
    // Soft low pulse on every beat (a pitched-down sine thump).
    const bt = t % beat;
    const bass = midiHz(chord[0] - 12);
    const thump = Math.exp(-bt * 9) * Math.sin(2 * Math.PI * bass * bt) * 0.45;
    // Master envelope.
    let m = 1;
    if (t < fadeIn) m = t / fadeIn;
    if (t > seconds - fadeOut) m = Math.max(0, (seconds - t) / fadeOut);
    out[i * 2] = (l * env + thump) * volume * m;
    out[i * 2 + 1] = (r * env + thump) * volume * m;
  }
  return out;
}

/** 16-bit PCM WAV bytes of interleaved stereo float samples. */
export function encodeWav(samples, channels = 2, rate = RATE) {
  const frames = samples.length / channels;
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(36 + samples.length * 2, 4);
  buf.write("WAVE", 8, "ascii");
  buf.write("fmt ", 12, "ascii");
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(channels, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * channels * 2, 28);
  buf.writeUInt16LE(channels * 2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(frames * channels * 2, 40);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  return buf;
}

export function writeAudioBed(path, seconds, { kind = "pad", seed = "descall" } = {}) {
  const samples = kind === "silence" ? new Float32Array(Math.round(seconds * RATE) * 2) : synthPad(seconds, seed);
  writeFileSync(path, encodeWav(samples));
  return path;
}
