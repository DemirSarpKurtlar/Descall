/**
 * Soft noise gate (downward expander) for the voice chain, polish 3.9.x (calls-03).
 *
 * Replaces @sapphi-red/web-noise-suppressor's NoiseGateWorkletNode, which is a
 * hard switch: per 128-sample block it either copies the input or leaves the
 * output at exact zero, with no attack or release. After the GTCRN suppressor
 * (which takes pauses below -70 dBFS) it closed after every phrase, sent ~30 %
 * of frames as digital zero (Opus DTX on/off at each pause) and clipped word
 * edges and quiet syllables (1-4 % of speech frames cut by >= 20 dB).
 *
 * Here the open / close decision (thresholds with hysteresis + hold) only sets
 * a TARGET gain: 1 when open, `floorDb` (default -30 dB) when closed, and the
 * applied gain glides there per sample: fast attack (5 ms) so word onsets
 * pass, slow release (120 ms) so endings fade instead of being cut. Never
 * exact zero.
 *
 * Plain ES module with no imports: it is loaded both as an AudioWorklet module
 * (noiseSuppression.js, `?url`) and by softGate.selftest.mjs in node.
 */

export const SOFT_GATE_PROCESSOR = "descall-soft-gate";

export const SOFT_GATE_DEFAULTS = Object.freeze({
  openThreshold: -60,
  closeThreshold: -70,
  holdMs: 250,
  attackMs: 5,
  releaseMs: 120,
  floorDb: -30,
});

const dbToLin = (db) => Math.pow(10, db / 20);

/** Pure gate core. `process(inputs, outputs)` takes arrays of Float32Array channels. */
export function createSoftGate(options = {}, sampleRate = 48000, blockSize = 128) {
  const o = { ...SOFT_GATE_DEFAULTS };
  for (const key of Object.keys(SOFT_GATE_DEFAULTS)) {
    const n = Number(options?.[key]);
    if (Number.isFinite(n)) o[key] = n;
  }
  if (o.closeThreshold > o.openThreshold) o.closeThreshold = o.openThreshold;
  const open = dbToLin(o.openThreshold);
  const close = dbToLin(o.closeThreshold);
  const floor = Math.min(1, dbToLin(Math.min(0, o.floorDb)));
  const holdBlocks = Math.ceil((Math.max(0, o.holdMs) / 1000) * sampleRate / blockSize);
  // One-pole smoothing coefficients per sample (time constant = ms).
  const coef = (ms) => 1 - Math.exp(-1 / (Math.max(0.1, ms) / 1000 * sampleRate));
  const attack = coef(o.attackMs);
  const release = coef(o.releaseMs);

  let isOpen = false;
  let held = 0;
  let gain = floor;

  function decide(level) {
    if (!isOpen) {
      if (level > open) {
        isOpen = true;
        held = 0;
      }
      return;
    }
    if (level >= close) {
      held = 0;
    } else if (held >= holdBlocks) {
      isOpen = false;
    } else {
      held += 1;
    }
  }

  return {
    get gain() {
      return gain;
    },
    get isOpen() {
      return isOpen;
    },
    process(input, output) {
      const channels = Math.min(input.length, output.length);
      if (!channels) return;
      const frames = input[0].length;
      let level = 0;
      for (let c = 0; c < channels; c += 1) {
        const ch = input[c];
        let sum = 0;
        for (let i = 0; i < frames; i += 1) sum += ch[i] * ch[i];
        level += Math.sqrt(sum / Math.max(1, frames)) / channels;
      }
      decide(level);
      const target = isOpen ? 1 : floor;
      let g = gain;
      const k = target > g ? attack : release;
      if (channels === 1) {
        const inp = input[0];
        const out = output[0];
        for (let i = 0; i < frames; i += 1) {
          g += (target - g) * k;
          out[i] = inp[i] * g;
        }
      } else {
        for (let i = 0; i < frames; i += 1) {
          g += (target - g) * k;
          for (let c = 0; c < channels; c += 1) output[c][i] = input[c][i] * g;
        }
      }
      gain = g;
    },
  };
}

if (typeof AudioWorkletProcessor !== "undefined" && typeof registerProcessor === "function") {
  class SoftGateProcessor extends AudioWorkletProcessor {
    constructor(options) {
      super();
      // `sampleRate` is a global of the AudioWorkletGlobalScope.
      this.gate = createSoftGate(options?.processorOptions || {}, sampleRate, 128);
    }

    process(inputs, outputs) {
      const input = inputs[0];
      const output = outputs[0];
      if (input && input.length && input[0] && input[0].length && output && output.length) {
        this.gate.process(input, output);
      }
      return true;
    }
  }
  registerProcessor(SOFT_GATE_PROCESSOR, SoftGateProcessor);
}
