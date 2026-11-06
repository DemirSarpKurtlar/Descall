/**
 * mic_presets and audio_device_profiles: pure engines (no storage, no DOM).
 *
 * A mic preset bundles the capture settings:
 *   { id, name, gain (0..200 %), noiseMode ('off' | 'on' | 'strong'),
 *     echoCancellation, autoGainControl }
 * A device profile bundles devices and a preset:
 *   { id, name, input: { deviceId, label } | null, output: {...} | null, presetId | null }
 */
import { sameDevice, devicesOfKind } from "./devicePreference.js";

export const NOISE_MODES = Object.freeze(["off", "on", "strong"]);
export const MAX_PRESETS = 12;
export const MAX_PROFILES = 12;

/** Built-in presets (names are i18n keys under premiumAudio.presets.*). */
export const BUILTIN_PRESETS = Object.freeze([
  Object.freeze({ id: "builtin:voice", nameKey: "premiumAudio.presets.voice", gain: 100, noiseMode: "on", echoCancellation: true, autoGainControl: true, builtin: true }),
  Object.freeze({ id: "builtin:noisy", nameKey: "premiumAudio.presets.noisy", gain: 100, noiseMode: "strong", echoCancellation: true, autoGainControl: true, builtin: true }),
  Object.freeze({ id: "builtin:studio", nameKey: "premiumAudio.presets.studio", gain: 100, noiseMode: "off", echoCancellation: false, autoGainControl: false, builtin: true }),
  Object.freeze({ id: "builtin:stream", nameKey: "premiumAudio.presets.stream", gain: 110, noiseMode: "on", echoCancellation: false, autoGainControl: true, builtin: true }),
]);

function clampInt(n, lo, hi, dflt) {
  const v = Number(n);
  if (!Number.isFinite(v)) return dflt;
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

function cleanName(name) {
  return String(name || "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 40);
}

export function normalizePreset(p = {}) {
  return {
    id: String(p.id || "").slice(0, 64),
    name: cleanName(p.name),
    gain: clampInt(p.gain, 0, 200, 100),
    noiseMode: NOISE_MODES.includes(p.noiseMode) ? p.noiseMode : "on",
    echoCancellation: p.echoCancellation !== false,
    autoGainControl: p.autoGainControl !== false,
  };
}

/** Preset from the current capture settings (voiceProfile + gain). */
export function presetFromCurrent({ voiceProfile = {}, gain = 100 } = {}, name = "", id = "") {
  return normalizePreset({
    id,
    name,
    gain,
    noiseMode: voiceProfile.noiseMode,
    echoCancellation: voiceProfile.echoCancellation,
    autoGainControl: voiceProfile.autoGainControl,
  });
}

/** What applying a preset changes: { voicePatch (writeVoiceProfile), gain }. */
export function presetToPatch(preset) {
  const p = normalizePreset(preset);
  return {
    voicePatch: { noiseMode: p.noiseMode, echoCancellation: p.echoCancellation, autoGainControl: p.autoGainControl },
    gain: p.gain,
  };
}

/** Which preset (if any) the current settings equal. */
export function matchPreset(presets, current) {
  const c = normalizePreset({ ...current, id: "", name: "" });
  for (const p of presets || []) {
    const n = normalizePreset(p);
    if (n.gain === c.gain && n.noiseMode === c.noiseMode && n.echoCancellation === c.echoCancellation && n.autoGainControl === c.autoGainControl) return p.id;
  }
  return null;
}

let idSeq = 0;
export function newId(prefix, now = Date.now()) {
  idSeq = (idSeq + 1) % 1e6;
  return `${prefix}:${now.toString(36)}${idSeq.toString(36)}`;
}

/** Insert or replace a saved preset; names must be unique (case-insensitive). */
export function upsertPreset(list, preset) {
  const p = normalizePreset(preset);
  if (!p.name) return { ok: false, error: "name", list: list || [] };
  const others = (list || []).filter((x) => x.id !== p.id);
  if (others.some((x) => cleanName(x.name).toLowerCase() === p.name.toLowerCase())) return { ok: false, error: "duplicate", list: list || [] };
  if (!p.id) p.id = newId("preset");
  const exists = (list || []).some((x) => x.id === p.id);
  if (!exists && others.length >= MAX_PRESETS) return { ok: false, error: "limit", list: list || [] };
  const next = exists ? (list || []).map((x) => (x.id === p.id ? p : x)) : [...others, p];
  return { ok: true, list: next, preset: p };
}

export function removeById(list, id) {
  return (list || []).filter((x) => x.id !== id);
}

function deviceRef(d) {
  if (!d || (!d.deviceId && !d.label)) return null;
  return { deviceId: String(d.deviceId || "").slice(0, 200), label: String(d.label || "").slice(0, 120) };
}

export function normalizeProfile(p = {}) {
  return {
    id: String(p.id || "").slice(0, 64),
    name: cleanName(p.name),
    input: deviceRef(p.input),
    output: deviceRef(p.output),
    presetId: p.presetId ? String(p.presetId).slice(0, 64) : null,
  };
}

export function upsertProfile(list, profile) {
  const p = normalizeProfile(profile);
  if (!p.name) return { ok: false, error: "name", list: list || [] };
  const others = (list || []).filter((x) => x.id !== p.id);
  if (others.some((x) => cleanName(x.name).toLowerCase() === p.name.toLowerCase())) return { ok: false, error: "duplicate", list: list || [] };
  if (!p.id) p.id = newId("profile");
  const exists = (list || []).some((x) => x.id === p.id);
  if (!exists && others.length >= MAX_PROFILES) return { ok: false, error: "limit", list: list || [] };
  const next = exists ? (list || []).map((x) => (x.id === p.id ? p : x)) : [...others, p];
  return { ok: true, list: next, profile: p };
}

/**
 * Resolve a profile against the devices present now. A device that is not
 * connected resolves to null (keep the current one) and is listed in `missing`.
 * Returns { inputId, outputId, preset, missing: ['input'|'output'|'preset'] }.
 */
export function resolveProfile(profile, devices, presets = []) {
  const p = normalizeProfile(profile);
  const missing = [];
  const find = (ref, kind) => {
    if (!ref) return null;
    const hit = devicesOfKind(devices, kind).find((d) => sameDevice(ref, d));
    if (!hit) { missing.push(kind === "audioinput" ? "input" : "output"); return null; }
    return hit.deviceId;
  };
  const inputId = find(p.input, "audioinput");
  const outputId = find(p.output, "audiooutput");
  let preset = null;
  if (p.presetId) {
    preset = [...BUILTIN_PRESETS, ...(presets || [])].find((x) => x.id === p.presetId) || null;
    if (!preset) missing.push("preset");
  }
  return { inputId, outputId, preset, missing };
}
