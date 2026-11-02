// Local-only voice crackle harness (never production). Synthetic mic (tremolo
// tone at a given dBFS) → acquireVoiceMicStream (the real pipeline) → local
// RTCPeerConnection pair → recorded on the receiving side and analyzed.
import { fallbackToRawMic, setNoiseMode, acquireVoiceMicStream, getNoiseSuppressionDiagnostics, MIC_FALLBACK_EVENT, disposeNoiseSuppressionSession } from "../../src/lib/noiseSuppression.js";
import { trackPeerConnection } from "../../src/lib/iceConfig.js";

const q = new URLSearchParams(location.search);
const DBFS = Number(q.get("dbfs") || -20);
const SECONDS = Number(q.get("seconds") || 10);
const FREQ = 440;
const gumCalls = [];
setNoiseMode(q.get("ns") || "on");

const MODE = q.get("mode") || "speech";
function makeNoiseMic() {
  // Steady background (fan / room noise) at DBFS RMS: what a quiet room sends.
  const ctx = new AudioContext();
  const len = ctx.sampleRate * 2; const buf = ctx.createBuffer(1, len, ctx.sampleRate); const d = buf.getChannelData(0);
  const amp = Math.pow(10, DBFS / 20) * Math.sqrt(3);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * amp;
  const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
  const dest = ctx.createMediaStreamDestination(); src.connect(dest); src.start();
  return { ctx, track: dest.stream.getAudioTracks()[0] };
}
function makeFakeMic() {
  if (MODE === "noise") return makeNoiseMic();
  // Speech-like: 140 Hz voiced source (vibrato), 12 harmonics, two formant
  // band-passes, syllable envelope at ~4 Hz. Level is the RMS while voiced.
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  const n = 13, real = new Float32Array(n), imag = new Float32Array(n);
  for (let k = 1; k < n; k++) imag[k] = 1 / (k * k);
  osc.setPeriodicWave(ctx.createPeriodicWave(real, imag));
  osc.frequency.value = 140;
  const vib = ctx.createOscillator(); vib.frequency.value = 5;
  const vibG = ctx.createGain(); vibG.gain.value = 10;
  vib.connect(vibG).connect(osc.frequency);
  const f1 = ctx.createBiquadFilter(); f1.type = "peaking"; f1.frequency.value = 700; f1.Q.value = 2; f1.gain.value = 12;
  const f2 = ctx.createBiquadFilter(); f2.type = "peaking"; f2.frequency.value = 1200; f2.Q.value = 2; f2.gain.value = 9;
  const env = ctx.createGain(); env.gain.value = 0;
  const level = ctx.createGain();
  // Calibrated so the voiced parts are at DBFS RMS (measured offline ≈ 0.62 per unit gain).
  level.gain.value = Math.pow(10, DBFS / 20) / 0.62;
  const syl = ctx.createOscillator(); syl.frequency.value = 4;
  const sylG = ctx.createGain(); sylG.gain.value = 0.4;
  const dc = ctx.createConstantSource(); dc.offset.value = 0.6;
  syl.connect(sylG).connect(env.gain); dc.connect(env.gain);
  const dest = ctx.createMediaStreamDestination();
  osc.connect(f1).connect(f2).connect(env).connect(level).connect(dest);
  osc.start(); vib.start(); syl.start(); dc.start();
  return { ctx, track: dest.stream.getAudioTracks()[0] };
}

let fake = null;
navigator.mediaDevices.getUserMedia = async (constraints) => {
  gumCalls.push(JSON.parse(JSON.stringify(constraints?.audio ?? null)));
  if (!fake) fake = makeFakeMic();
  const t = fake.track.clone();
  return new MediaStream([t]);
};

function analyze(samples, fs) {
  const frame = Math.round(fs * 0.01);
  const frames = [];
  for (let i = 0; i + frame <= samples.length; i += frame) {
    let s = 0;
    for (let j = i; j < i + frame; j++) s += samples[j] * samples[j];
    frames.push(Math.sqrt(s / frame));
  }
  // Skip the first 1.5 s (setup, jitter buffer fill).
  const skip = Math.round(1.5 / 0.01);
  // Dropout: a 10 ms frame > 20 dB below both frames 20 ms around it (holes,
  // not the slow syllable envelope, which never dips more than 14 dB).
  let dropouts = 0, silentFrames = 0, active = 0;
  for (let k = skip; k < frames.length; k++) {
    if (frames[k] < 1e-5) silentFrames++;
    const p = frames[k - 2], nx = frames[k + 2];
    if (p > 1e-4 && nx > 1e-4) { active++; if (frames[k] < 0.1 * Math.min(p, nx)) dropouts++; }
  }
  // Discontinuities (clicks): a sample step > 8x the frame's median step.
  let disc = 0, clip = 0;
  const start = skip * frame;
  for (let i = start; i + frame <= samples.length; i += frame) {
    const steps = [];
    for (let j = i + 1; j < i + frame; j++) steps.push(Math.abs(samples[j] - samples[j - 1]));
    const sorted = [...steps].sort((x, y) => x - y);
    const med = sorted[sorted.length >> 1];
    for (const st of steps) if (st > 8 * med + 2e-3) disc++;
    for (let j = i; j < i + frame; j++) if (Math.abs(samples[j]) >= 0.999) clip++;
  }
  const sec = (samples.length - start) / fs;
  const meanRms = frames.slice(skip).reduce((a, b) => a + b, 0) / Math.max(1, frames.length - skip);
  return { seconds: +sec.toFixed(2), dropoutsPerSec: +(dropouts / sec).toFixed(2), discontinuitiesPerSec: +(disc / sec).toFixed(2), clippedSamples: clip, silentFramePct: +(100 * silentFrames / Math.max(1, frames.length - skip)).toFixed(1), activeFramePct: +(100 * active / Math.max(1, frames.length - skip)).toFixed(1), meanRecvDbfs: +(20 * Math.log10(meanRms + 1e-12)).toFixed(1) };
}

async function run() {
  const t0 = performance.now();
  let fallbackAt = null, fallbackReason = null;
  window.addEventListener(MIC_FALLBACK_EVENT, (e) => { fallbackAt = performance.now() - t0; fallbackReason = e.detail?.reason; });
  const stream = await acquireVoiceMicStream({ applyStoredMute: false });
  const a = new RTCPeerConnection();
  const b = new RTCPeerConnection();
  trackPeerConnection(a);
  const gathered = (pc) => new Promise((r) => { setTimeout(r, 3000); if (pc.iceGatheringState === "complete") r(); else pc.addEventListener("icegatheringstatechange", () => pc.iceGatheringState === "complete" && r()); });
  stream.getAudioTracks().forEach((t) => a.addTrack(t, stream));
  const recvCtx = new AudioContext();
  const got = new Promise((res) => { b.ontrack = (e) => res(e.streams[0] || new MediaStream([e.track])); });
  await a.setLocalDescription(); await gathered(a); await b.setRemoteDescription(a.localDescription);
  await b.setLocalDescription(); await gathered(b); await a.setRemoteDescription(b.localDescription);
  const remote = await got;
  // Chromium needs the remote stream attached to a media element to flow.
  const el = new Audio(); el.srcObject = remote; el.muted = true; el.play().catch(() => {});
  // Record what the sender actually sends (follows replaceTrack on fallback);
  // also the far end when ICE connects (Firefox headless here gathers no candidates).
  const rec = (getTrack) => {
    const proc = recvCtx.createScriptProcessor(4096, 1, 1);
    const chunks = []; let cur = null, src = null;
    const attach = () => { const t = getTrack(); if (!t || t === cur) return; try { src?.disconnect(); } catch {} cur = t; src = recvCtx.createMediaStreamSource(new MediaStream([t])); src.connect(proc); };
    attach(); const iv = setInterval(attach, 100);
    proc.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    proc.connect(recvCtx.destination);
    return () => { clearInterval(iv); proc.disconnect(); const n = chunks.reduce((k, c) => k + c.length, 0); const all = new Float32Array(n); let o = 0; for (const c of chunks) { all.set(c, o); o += c.length; } return all; };
  };
  const stopSent = rec(() => a.getSenders()[0]?.track);
  const stopRecv = rec(() => remote.getAudioTracks()[0]);
  const diagEarly = getNoiseSuppressionDiagnostics();
  const probe = (st) => { const an = recvCtx.createAnalyser(); recvCtx.createMediaStreamSource(st).connect(an); const buf = new Float32Array(2048); return () => { an.getFloatTimeDomainData(buf); let s = 0; for (const x of buf) s += x * x; return Math.sqrt(s / buf.length); }; };
  const pLocal = probe(stream), pRemote = probe(remote);
  await new Promise((r) => setTimeout(r, 2000));
  window.__probe = { local: pLocal(), remote: pRemote(), recvState: recvCtx.state, pc: a.connectionState, cands: (a.localDescription.sdp.match(/a=candidate[^\r]*/g) || []).slice(0, 6) };
  if (q.get("forceFallbackAt")) setTimeout(() => { void fallbackToRawMic("manual"); }, Number(q.get("forceFallbackAt")));
  await new Promise((r) => setTimeout(r, SECONDS * 1000));
  const diag = getNoiseSuppressionDiagnostics();
  const sent = stopSent(), recv = stopRecv();
  const result = {
    ua: navigator.userAgent.match(/(Firefox|Chrome|HeadlessChrome)\/[\d.]+/)?.[0],
    dbfs: DBFS, mode: MODE, ns: q.get("ns") || "on", recvRate: recvCtx.sampleRate, fakeMicRate: fake?.ctx.sampleRate,
    sent: analyze(sent, recvCtx.sampleRate), recv: a.connectionState === "connected" ? analyze(recv, recvCtx.sampleRate) : null, ...analyze(sent, recvCtx.sampleRate),
    fallbackMs: fallbackAt == null ? null : Math.round(fallbackAt), fallbackReason,
    engineEarly: diagEarly.engine, probe: window.__probe, diag, gumCalls,
  };
  disposeNoiseSuppressionSession();
  a.close(); b.close();
  return result;
}
window.__runHarness = run;
window.__ready = true;
const btn = document.createElement('button'); btn.id = 'go'; btn.textContent = 'go';
btn.onclick = () => { window.__result = run().catch((e) => ({ error: String(e?.stack || e) })); };
document.body.appendChild(btn);
