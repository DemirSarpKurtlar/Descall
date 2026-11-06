/**
 * Descall+ audio runtime: the glue between the per-feature settings
 * (featureSettings.js) and the existing voice code.
 *
 * Synchronous getters are needed inside the mic chain (noiseSuppression.js),
 * so this module mirrors the settings of the audio features in memory.
 * Every getter returns the "feature off" value unless the membership includes
 * the key (hasPremiumFeature) AND the user switched it on, so free users get
 * exactly today's chain.
 */
import { getFeatureSettings, onFeatureSettings, setFeatureSettings } from "../featureSettings.js";
import { hasPremiumFeature, subscribePremium } from "../premiumStore.js";
import { gainFromPercent, gateParams } from "./noiseGateMath.js";

export const AUDIO_KEYS = Object.freeze([
  "mic_presets",
  "noise_gate",
  "mic_monitor",
  "voice_activity_monitor",
  "auto_device_switch",
  "audio_routing",
  "audio_device_profiles",
  "stream_audio_control",
]);

/** Settings defaults per feature (also used by the settings panels). */
export const AUDIO_DEFAULTS = Object.freeze({
  mic_presets: Object.freeze({ gain: 100, activePresetId: null, presets: [] }),
  noise_gate: Object.freeze({ enabled: false, thresholdDb: -52, hysteresisDb: 10, holdMs: 120 }),
  mic_monitor: Object.freeze({ enabled: false, volume: 80 }),
  voice_activity_monitor: Object.freeze({ enabled: true }),
  auto_device_switch: Object.freeze({ enabled: false, inputOrder: [], outputOrder: [], headsetFirst: true }),
  audio_routing: Object.freeze({ enabled: false, callOutput: "", notificationOutput: "" }),
  audio_device_profiles: Object.freeze({ profiles: [], activeId: null }),
  stream_audio_control: Object.freeze({ sendVolume: 100, sendMuted: false, viewVolume: 100, viewMuted: false }),
});

const mirror = new Map();
const listeners = new Set();
let started = false;

function emit(key) {
  for (const fn of [...listeners]) {
    try { fn(key, settingsOf(key)); } catch { /* ignore */ }
  }
}

export function settingsOf(key) {
  return { ...(AUDIO_DEFAULTS[key] || {}), ...(mirror.get(key) || {}) };
}

/** Feature entitled and switched on. Features without an enabled flag count as on when entitled. */
export function featureOn(key) {
  if (!hasPremiumFeature(key)) return false;
  const s = settingsOf(key);
  // Settings > Descall+ owns features.<key>.enabled; keys without a default are on unless switched off.
  return "enabled" in (AUDIO_DEFAULTS[key] || {}) ? Boolean(s.enabled) : s.enabled !== false;
}

export function onAudioSettings(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function updateAudioSettings(key, patch) {
  const next = await setFeatureSettings(key, patch);
  mirror.set(key, next || {});
  emit(key);
  return next;
}

/** Load the mirror once (App start); later changes arrive through onFeatureSettings. */
export function startPremiumAudioRuntime() {
  if (started) return;
  started = true;
  onFeatureSettings((key, value) => {
    if (!AUDIO_KEYS.includes(key)) return;
    mirror.set(key, value || {});
    emit(key);
  });
  subscribePremium(() => emit("*"));
  for (const key of AUDIO_KEYS) {
    getFeatureSettings(key).then((v) => { mirror.set(key, v || {}); emit(key); }).catch(() => {});
  }
}

/**
 * What the mic chain needs (noiseSuppression.js):
 *   gain:  GainNode value (1 = unchanged)
 *   gate:  NoiseGateWorkletNode params from the user's threshold, or null (built-in gate)
 *   forceChain: run the Web Audio chain even with noise suppression off
 *   monitor: { on, volume 0..1 }
 */
export function premiumMicChain() {
  const presetsOn = featureOn("mic_presets");
  const gainPct = presetsOn ? Number(settingsOf("mic_presets").gain) : 100;
  const gain = Number.isFinite(gainPct) ? gainFromPercent(gainPct) : 1;
  const gateOn = featureOn("noise_gate");
  const gate = gateOn ? gateParams(settingsOf("noise_gate")) : null;
  const monitorOn = featureOn("mic_monitor");
  const monitor = { on: monitorOn, volume: Math.max(0, Math.min(1, Number(settingsOf("mic_monitor").volume ?? 80) / 100)) };
  return { gain, gate, monitor, forceChain: gain !== 1 || Boolean(gate) || monitorOn };
}

/** Separate output for notification sounds (audio_routing), or null = follow the default. */
export function notificationSinkId() {
  if (!featureOn("audio_routing")) return null;
  const id = settingsOf("audio_routing").notificationOutput;
  return typeof id === "string" && id ? id : null;
}

/** Output for call audio chosen in the audio routing panel, or null = the regular setting. */
export function callSinkId() {
  if (!featureOn("audio_routing")) return null;
  const id = settingsOf("audio_routing").callOutput;
  return typeof id === "string" ? id : null;
}

/** Screen-share audio: { send: 0..2, view: 0..2 } gains, or null when the feature is off. */
export function streamAudioGains() {
  if (!featureOn("stream_audio_control")) return null;
  const s = settingsOf("stream_audio_control");
  const g = (v, muted) => (muted ? 0 : Math.max(0, Math.min(2, (Number(v) || 0) / 100)));
  return { send: g(s.sendVolume ?? 100, s.sendMuted), view: g(s.viewVolume ?? 100, s.viewMuted) };
}

/** Test hook. */
export function __setMirror(key, value) {
  mirror.set(key, value);
}
