/**
 * Quality presets for the 3D world and auto detection (pure).
 * Budget (desktop, Intel Iris Xe class): 60 fps target, 30 fps floor, pixel ratio <= 1.5.
 * SSAO stays off: the room has baked AO, avatars get blob shadows, and SSAO2 + the
 * default pipeline rendered black frames in testing (Babylon 9.33, WebGL2).
 */

export const PRESETS = {
  low: { id: "low", pixelRatio: 0.75, bloom: false, ssao: false, dof: false, fxaa: true, msaa: 1, mirror: false, maxAvatarsAnimated: 8, shadowBlob: true },
  medium: { id: "medium", pixelRatio: 1.0, bloom: true, ssao: false, dof: false, fxaa: true, msaa: 1, mirror: false, maxAvatarsAnimated: 16, shadowBlob: true },
  high: { id: "high", pixelRatio: 1.5, bloom: true, ssao: false, dof: true, fxaa: true, msaa: 4, mirror: true, maxAvatarsAnimated: 16, shadowBlob: true },
};

export const QUALITY_IDS = ["auto", "low", "medium", "high"];

const DISCRETE_HINT = /NVIDIA|GeForce|RTX|GTX|Radeon RX|Radeon Pro|Arc A|Apple M[1-9] (Pro|Max|Ultra)/i;
const WEAK_HINT = /Intel\(R\) (HD|UHD) Graphics [0-9]{3}\b|Mali|Adreno|PowerVR|Intel HD|GMA/i;

/** Pick a preset from what the browser tells us. */
export function autoPreset({ renderer = "", cores = 4, memoryGb = 8, devicePixelRatio = 1, software = false } = {}) {
  if (software) return "low";
  if (cores <= 2 || memoryGb <= 2) return "low";
  if (DISCRETE_HINT.test(renderer) && cores >= 6) return "high";
  if (WEAK_HINT.test(renderer)) return "low";
  if (devicePixelRatio > 1.75 && cores < 8) return "medium";
  return "medium";
}

export function resolvePreset(choice, env) {
  const id = choice && choice !== "auto" && PRESETS[choice] ? choice : autoPreset(env);
  return PRESETS[id];
}

/**
 * Frame-time governor: steps the preset down when the average frame time stays
 * above the 30 fps floor for a while (never steps up on its own).
 */
export function createGovernor({ windowFrames = 120, floorMs = 1000 / 30 } = {}) {
  const samples = [];
  return {
    push(ms) {
      samples.push(ms);
      if (samples.length > windowFrames) samples.shift();
    },
    shouldStepDown() {
      if (samples.length < windowFrames) return false;
      const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
      if (avg > floorMs * 1.1) {
        samples.length = 0;
        return true;
      }
      return false;
    },
    average() {
      return samples.length ? samples.reduce((a, b) => a + b, 0) / samples.length : 0;
    },
  };
}

export function lowerPreset(id) {
  return id === "high" ? "medium" : "low";
}
