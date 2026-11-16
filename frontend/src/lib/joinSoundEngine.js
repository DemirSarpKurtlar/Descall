// Market 2.0 (C4): procedural join sounds ("Katilma sesi").
//
// A join sound is a short recipe (JSON, stored with the shop item and bundled in
// backend/catalog/shop2/c4-join-sounds.json): no audio files. The client renders a recipe
// once with an OfflineAudioContext, peak-normalises it, encodes a small WAV and plays it
// through an <audio> element on the call speaker. This module is pure where it can be:
// validateRecipe / noteFreq / encodeWav / peaksOf run in node selftests.

export const RECIPE_VERSION = 1;
export const MAX_DURATION = 1.5; // seconds
export const MAX_VOICES = 16;
const WAVES = new Set(["sine", "triangle", "square", "sawtooth"]);
const FILTERS = new Set(["lowpass", "highpass", "bandpass"]);
const NOISES = new Set(["white", "pink", "brown"]);
const TYPES = new Set(["osc", "fm", "noise", "pluck"]);

const NOTE_INDEX = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "A4" -> 440, "C#5" / "Db5" -> ..., numbers pass through. NaN for junk. */
export function noteFreq(v) {
  if (typeof v === "number") return v;
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(String(v || "").trim());
  if (!m) return NaN;
  const n = NOTE_INDEX[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0);
  const octave = Number(m[3]);
  const midi = (octave + 1) * 12 + n;
  return 440 * 2 ** ((midi - 69) / 12);
}

const num = (v, lo, hi) => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
const freqOk = (v) => {
  const fq = noteFreq(v);
  return Number.isFinite(fq) && fq >= 20 && fq <= 16000;
};

/**
 * Validate a recipe. Returns { ok, errors: [] }. Rules: version 1, total length <= 1.5 s,
 * every voice ends inside it, <= 16 voices, gains 0..1, frequencies 20..16000 Hz, echo
 * feedback < 0.7 (never runs away), known types / waves / filters only.
 */
export function validateRecipe(recipe) {
  const errors = [];
  const r = recipe || {};
  if (r.v !== RECIPE_VERSION) errors.push("version");
  if (!num(r.dur, 0.15, MAX_DURATION)) errors.push("dur");
  if (r.gain !== undefined && !num(r.gain, 0.05, 1)) errors.push("gain");
  if (r.lp !== undefined && !num(r.lp, 200, 18000)) errors.push("lp");
  if (r.echo !== undefined && r.echo !== null) {
    const e = r.echo;
    if (!num(e.time, 0.03, 0.5) || !num(e.fb, 0, 0.65) || !num(e.mix, 0, 0.6)) errors.push("echo");
  }
  const voices = Array.isArray(r.voices) ? r.voices : null;
  if (!voices || !voices.length) errors.push("voices");
  else if (voices.length > MAX_VOICES) errors.push("voices.count");
  (voices || []).forEach((v, i) => {
    const at = `voice${i}`;
    if (!v || !TYPES.has(v.type)) return errors.push(`${at}.type`);
    const t = v.t ?? 0;
    if (!num(t, 0, MAX_DURATION) || !num(v.d, 0.005, MAX_DURATION)) errors.push(`${at}.time`);
    else if (num(r.dur, 0, MAX_DURATION) && t + v.d > r.dur + 1e-6) errors.push(`${at}.end`);
    if (!num(v.g, 0, 1)) errors.push(`${at}.g`);
    if (v.pan !== undefined && !num(v.pan, -1, 1)) errors.push(`${at}.pan`);
    if (v.type !== "noise" && !freqOk(v.f)) errors.push(`${at}.f`);
    if (v.f2 !== undefined && !freqOk(v.f2)) errors.push(`${at}.f2`);
    if (v.type === "osc" && v.w !== undefined && !WAVES.has(v.w)) errors.push(`${at}.w`);
    if (v.type === "fm" && (!num(v.ratio, 0.1, 16) || !num(v.idx, 0, 12))) errors.push(`${at}.fm`);
    if (v.type === "noise" && v.col !== undefined && !NOISES.has(v.col)) errors.push(`${at}.col`);
    if (v.det !== undefined && !num(v.det, -2400, 2400)) errors.push(`${at}.det`);
    if (v.vib && (!num(v.vib.r, 0.1, 30) || !num(v.vib.d, 0, 200))) errors.push(`${at}.vib`);
    if (v.filt) {
      const fl = v.filt;
      if (!FILTERS.has(fl.type) || !freqOk(fl.f) || (fl.f2 !== undefined && !freqOk(fl.f2)) || (fl.q !== undefined && !num(fl.q, 0.1, 30))) {
        errors.push(`${at}.filt`);
      }
    }
    const env = v.env || {};
    for (const k of ["a", "d", "r"]) if (env[k] !== undefined && !num(env[k], 0, MAX_DURATION)) errors.push(`${at}.env.${k}`);
    if (env.s !== undefined && !num(env.s, 0, 1)) errors.push(`${at}.env.s`);
  });
  return { ok: errors.length === 0, errors };
}

// ---------- rendering (browser) ----------

function makeNoiseBuffer(ctx, color, seconds) {
  const len = Math.max(1, Math.ceil(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let seed = 1234567;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed / 2147483647) * 2 - 1;
  };
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = rand();
    if (color === "pink") {
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      data[i] = (b0 + b1 + b2 + w * 0.1848) * 0.22;
    } else if (color === "brown") {
      last = (last + 0.02 * w) / 1.02;
      data[i] = last * 3.5;
    } else {
      data[i] = w;
    }
  }
  return buf;
}

/** ADSR on a GainNode: attack to 1, decay to s, hold, release to 0 by t + d. */
function applyEnv(param, v, t0) {
  const env = v.env || {};
  const dur = v.d;
  const a = Math.min(env.a ?? 0.004, dur * 0.9);
  const s = env.s ?? 0;
  const decay = env.d ?? Math.max(0.01, dur - a);
  const r = Math.min(env.r ?? 0.03, dur);
  const peak = v.g;
  const end = t0 + dur;
  const floor = 0.0001;
  const top = t0 + Math.max(0.001, a);
  param.setValueAtTime(floor, t0);
  param.exponentialRampToValueAtTime(Math.max(floor, peak), top);
  // Sustain: decay towards s; percussive (s = 0): exponential decay over `decay`.
  const target = s > 0 ? Math.max(floor, peak * s) : floor;
  const tau = Math.max(0.005, s > 0 ? decay / 3 : decay / 4.5);
  const relAt = Math.max(top, end - r);
  param.setTargetAtTime(target, top, tau);
  // Value the curve has reached at the release point (continuous hand-over).
  const reached = target + (peak - target) * Math.exp(-(relAt - top) / tau);
  param.setValueAtTime(Math.max(floor, reached), relAt);
  param.linearRampToValueAtTime(0, end);
}

function voiceFilter(ctx, v, t0) {
  if (!v.filt) return null;
  const fl = ctx.createBiquadFilter();
  fl.type = v.filt.type;
  fl.Q.value = v.filt.q ?? 0.8;
  const f1 = noteFreq(v.filt.f);
  fl.frequency.setValueAtTime(f1, t0);
  if (v.filt.f2 !== undefined) {
    const ft = v.filt.ft ?? v.d;
    fl.frequency.exponentialRampToValueAtTime(noteFreq(v.filt.f2), t0 + Math.max(0.01, ft));
  }
  return fl;
}

function buildVoice(ctx, v, bus) {
  const t0 = v.t ?? 0;
  const end = t0 + v.d;
  const amp = ctx.createGain();
  applyEnv(amp.gain, v, t0);
  let out = amp;
  if (v.pan && typeof ctx.createStereoPanner === "function") {
    const pan = ctx.createStereoPanner();
    pan.pan.value = v.pan;
    amp.connect(pan);
    out = pan;
  }
  out.connect(bus);
  const filt = voiceFilter(ctx, v, t0);
  const head = filt || amp;
  if (filt) filt.connect(amp);

  const sources = [];
  if (v.type === "noise") {
    const src = ctx.createBufferSource();
    src.buffer = makeNoiseBuffer(ctx, v.col || "white", v.d + 0.05);
    src.connect(head);
    sources.push(src);
  } else {
    const f = noteFreq(v.f);
    const mkOsc = (wave, det = 0) => {
      const o = ctx.createOscillator();
      o.type = wave;
      o.frequency.setValueAtTime(f, t0);
      if (v.f2 !== undefined) o.frequency.exponentialRampToValueAtTime(noteFreq(v.f2), t0 + Math.max(0.01, v.gl ?? v.d * 0.5));
      o.detune.value = (v.det || 0) + det;
      if (v.vib && v.vib.d > 0) {
        const lfo = ctx.createOscillator();
        const lg = ctx.createGain();
        lfo.frequency.value = v.vib.r;
        lg.gain.value = v.vib.d;
        lfo.connect(lg).connect(o.detune);
        lfo.start(t0);
        lfo.stop(end);
      }
      return o;
    };
    if (v.type === "osc") {
      const o = mkOsc(v.w || "sine");
      o.connect(head);
      sources.push(o);
    } else if (v.type === "pluck") {
      // Saw + triangle through a lowpass that closes fast: a plucked string body.
      const pl = ctx.createBiquadFilter();
      pl.type = "lowpass";
      pl.Q.value = 1.2;
      pl.frequency.setValueAtTime(Math.min(15000, f * (v.bright ?? 10)), t0);
      pl.frequency.exponentialRampToValueAtTime(Math.max(60, f * 1.2), t0 + Math.min(v.d, 0.35));
      pl.connect(head);
      const a = mkOsc("sawtooth");
      const b = mkOsc("triangle", 4);
      const mixA = ctx.createGain();
      mixA.gain.value = 0.55;
      a.connect(mixA).connect(pl);
      b.connect(pl);
      sources.push(a, b);
    } else if (v.type === "fm") {
      const car = mkOsc(v.w || "sine");
      const mod = ctx.createOscillator();
      mod.type = "sine";
      mod.frequency.setValueAtTime(f * v.ratio, t0);
      if (v.f2 !== undefined) mod.frequency.exponentialRampToValueAtTime(noteFreq(v.f2) * v.ratio, t0 + Math.max(0.01, v.gl ?? v.d * 0.5));
      const mg = ctx.createGain();
      const idx = v.idx * f;
      mg.gain.setValueAtTime(Math.max(0.0001, idx), t0);
      mg.gain.exponentialRampToValueAtTime(Math.max(0.0001, idx * 0.04), t0 + Math.max(0.02, v.idxD ?? v.d));
      mod.connect(mg).connect(car.frequency);
      car.connect(head);
      sources.push(car, mod);
    }
  }
  for (const s of sources) {
    s.start(t0);
    s.stop(end + 0.02);
  }
}

/**
 * Render a validated recipe into an AudioBuffer. `OfflineCtx` lets tests / old Safari pass
 * a constructor. Returns null when the recipe is invalid or rendering is unavailable.
 */
export async function renderRecipe(recipe, { OfflineCtx, sampleRate = 44100 } = {}) {
  if (!validateRecipe(recipe).ok) return null;
  const Ctor = OfflineCtx || globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  if (!Ctor) return null;
  const length = Math.ceil(recipe.dur * sampleRate);
  const ctx = new Ctor(2, length, sampleRate);
  const master = ctx.createGain();
  master.gain.value = 1;
  let tail = master;
  if (recipe.lp) {
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = recipe.lp;
    master.connect(lp);
    tail = lp;
  }
  tail.connect(ctx.destination);
  const bus = ctx.createGain();
  bus.connect(master);
  if (recipe.echo && recipe.echo.mix > 0) {
    const send = ctx.createGain();
    send.gain.value = recipe.echo.mix;
    const delay = ctx.createDelay(1);
    delay.delayTime.value = recipe.echo.time;
    const fb = ctx.createGain();
    fb.gain.value = recipe.echo.fb;
    const damp = ctx.createBiquadFilter();
    damp.type = "lowpass";
    damp.frequency.value = 4200;
    bus.connect(send).connect(delay).connect(damp).connect(master);
    damp.connect(fb).connect(delay);
  }
  for (const v of recipe.voices) buildVoice(ctx, v, bus);
  const buf = await ctx.startRendering();
  normalizeBuffer(buf, 0.89 * (recipe.gain ?? 1));
  return buf;
}

/** Loudest RMS a join sound may have after normalising (about -17 dBFS). */
export const RMS_CEILING = 0.14;

/**
 * Normalise in place: peak to `target`, but never louder than RMS_CEILING on average (a
 * sustained chord must not be louder than a bell), then fade the last 12 ms.
 */
export function normalizeBuffer(buf, target = 0.89) {
  let peak = 0;
  let sum = 0;
  let count = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) {
      const a = Math.abs(d[i]);
      if (a > peak) peak = a;
      sum += d[i] * d[i];
    }
    count += d.length;
  }
  const rms = count ? Math.sqrt(sum / count) : 0;
  const k = peak > 0 ? Math.min(target / peak, rms > 0 ? (RMS_CEILING * target) / 0.89 / rms : Infinity) : 1;
  const fade = Math.min(buf.length, Math.round(buf.sampleRate * 0.012));
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] *= k;
    for (let i = 0; i < fade; i++) d[d.length - 1 - i] *= i / fade;
  }
  return peak;
}

/** 16-bit PCM WAV bytes from channel arrays (Float32Array[]). */
export function encodeWav(channels, sampleRate) {
  const nCh = channels.length;
  const len = channels[0].length;
  const bytes = new ArrayBuffer(44 + len * nCh * 2);
  const v = new DataView(bytes);
  const str = (o, s) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, "RIFF");
  v.setUint32(4, 36 + len * nCh * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, nCh, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * nCh * 2, true);
  v.setUint16(32, nCh * 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, len * nCh * 2, true);
  let o = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < nCh; c++) {
      const s = Math.max(-1, Math.min(1, channels[c][i]));
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  }
  return bytes;
}

/** `n` bar heights (0..1, RMS per slice, scaled to the loudest) for the preview waveform. */
export function peaksOf(channel, n = 40) {
  const out = new Array(n).fill(0);
  const step = Math.max(1, Math.floor(channel.length / n));
  let max = 0;
  for (let i = 0; i < n; i++) {
    let sum = 0;
    const from = i * step;
    const to = Math.min(channel.length, from + step);
    for (let j = from; j < to; j++) sum += channel[j] * channel[j];
    out[i] = Math.sqrt(sum / Math.max(1, to - from));
    if (out[i] > max) max = out[i];
  }
  return out.map((x) => (max > 0 ? Math.round((x / max) * 100) / 100 : 0));
}
