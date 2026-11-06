/**
 * Noise gate and level-meter math for the Descall+ mic chain (noise_gate,
 * voice_activity_monitor, mic monitor). Pure functions, no Web Audio.
 *
 * The gate itself is @sapphi-red/web-noise-suppressor's NoiseGateWorkletNode
 * (open / close threshold in dBFS + hold); this file maps the user's single
 * "threshold" slider onto those parameters and turns analyser samples into a
 * 0..100 meter.
 */

export const DB_FLOOR = -100;
export const GATE_MIN_DB = -80;
export const GATE_MAX_DB = -10;
export const DEFAULT_GATE_DB = -52;
export const DEFAULT_HYSTERESIS_DB = 10;
export const DEFAULT_HOLD_MS = 120;

export function clamp(n, lo, hi) {
  const v = Number(n);
  if (!Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}

/** Linear amplitude (0..1+) -> dBFS. 0 -> DB_FLOOR. */
export function linearToDb(amp) {
  const a = Math.abs(Number(amp) || 0);
  if (a <= 0) return DB_FLOOR;
  return Math.max(DB_FLOOR, 20 * Math.log10(a));
}

/** dBFS -> linear amplitude. */
export function dbToLinear(db) {
  const d = Number(db);
  if (!Number.isFinite(d) || d <= DB_FLOOR) return 0;
  return Math.pow(10, d / 20);
}

/** RMS of a Float32Array-like (time domain samples, -1..1). */
export function rms(samples) {
  const n = samples?.length || 0;
  if (!n) return 0;
  let sum = 0;
  for (let i = 0; i < n; i += 1) {
    const s = samples[i];
    sum += s * s;
  }
  return Math.sqrt(sum / n);
}

/** dBFS -> 0..100 for a meter whose left edge is `floorDb`. */
export function meterPercent(db, floorDb = -80) {
  const d = Number(db);
  if (!Number.isFinite(d) || d <= floorDb) return 0;
  if (d >= 0) return 100;
  return Math.round(((d - floorDb) / -floorDb) * 100);
}

/** Inverse of meterPercent: where a threshold sits on the meter. */
export function percentToDb(pct, floorDb = -80) {
  const p = clamp(pct, 0, 100);
  return floorDb + (p / 100) * -floorDb;
}

/**
 * Gate parameters for NoiseGateWorkletNode from the user's threshold.
 * The gate opens at the threshold and closes `hysteresisDb` lower, so speech
 * tails do not chop; hold keeps it open briefly after the level drops.
 */
export function gateParams({ thresholdDb = DEFAULT_GATE_DB, hysteresisDb = DEFAULT_HYSTERESIS_DB, holdMs = DEFAULT_HOLD_MS } = {}) {
  const open = clamp(thresholdDb, GATE_MIN_DB, GATE_MAX_DB);
  const hyst = clamp(hysteresisDb, 0, 30);
  return {
    openThreshold: Math.round(open * 10) / 10,
    closeThreshold: Math.round((open - hyst) * 10) / 10,
    holdMs: Math.round(clamp(holdMs, 0, 1000)),
  };
}

/**
 * Display-side gate state (the meter shows "open" / "closed" like the worklet
 * would). state = { open, heldUntil }. Returns the next state.
 */
export function stepGate(state, levelDb, nowMs, params = gateParams()) {
  const prev = state || { open: false, heldUntil: 0 };
  if (levelDb >= params.openThreshold) return { open: true, heldUntil: nowMs + params.holdMs };
  if (prev.open) {
    if (levelDb >= params.closeThreshold) return { open: true, heldUntil: nowMs + params.holdMs };
    if (nowMs < prev.heldUntil) return { open: true, heldUntil: prev.heldUntil };
  }
  return { open: false, heldUntil: 0 };
}

/**
 * Meter smoothing: fast attack, slow release (so a meter does not flicker).
 * Returns the new displayed dB.
 */
export function smoothLevel(prevDb, nextDb, { attack = 0.6, release = 0.15 } = {}) {
  const p = Number.isFinite(prevDb) ? prevDb : DB_FLOOR;
  const n = Number.isFinite(nextDb) ? nextDb : DB_FLOOR;
  const k = n > p ? attack : release;
  return p + (n - p) * k;
}

/** Mic input gain: slider percent (0..200) -> GainNode value (0..2). */
export function gainFromPercent(pct) {
  return Math.round(clamp(pct, 0, 200)) / 100;
}
