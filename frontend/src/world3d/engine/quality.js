/**
 * Quality presets for the 3D world and auto detection (pure).
 *
 * A preset decides which effects exist; it is only ever changed by the user (Ayar menu).
 * Frame rate is held by dynamic resolution (dynamicResolution.js), which scales the
 * render size in small steps and never toggles an effect, so nothing compiles mid-session.
 *
 * Budget: 60 fps at 1080p on an Intel Iris Xe class GPU with 8 avatars on "auto"
 * (= medium); "high" smooth on a mid-range discrete GPU.
 *   - maxPixelRatio caps the device pixel ratio (a 1.25 / 1.5 Windows scale or a Retina
 *     screen no longer means 1.5 x 1.5 the pixels).
 *   - One anti-aliasing method per preset: FXAA (low, medium) or 4x MSAA (high), never both,
 *     and the WebGL back buffer itself is never multisampled (the scene renders into the
 *     post-processing target, a multisampled canvas would only cost bandwidth).
 *   - Bloom keeps the same on-screen radius (kernel is relative to the output) but runs on a
 *     quarter-size target on medium: about 8x fewer texture reads than the old half-size one.
 *   - Depth of field and the mirror floor are high only; the mirror renders at 0.35 scale,
 *     every second frame, with a shorter blur.
 * SSAO stays off: the room has baked AO, avatars get blob shadows, and SSAO2 + the
 * default pipeline rendered black frames in testing (Babylon 9.33, WebGL2).
 */

export const PRESETS = {
  low: { id: "low", maxPixelRatio: 1, presetScale: 0.85, bloom: false, bloomScale: 0.25, ssao: false, dof: false, fxaa: true, msaa: 1, mirror: false },
  medium: { id: "medium", maxPixelRatio: 1.25, presetScale: 1, bloom: true, bloomScale: 0.25, ssao: false, dof: false, fxaa: true, msaa: 1, mirror: false },
  high: { id: "high", maxPixelRatio: 1.5, presetScale: 1, bloom: true, bloomScale: 0.5, ssao: false, dof: true, fxaa: false, msaa: 4, mirror: true },
};

export const QUALITY_IDS = ["auto", "low", "medium", "high"];

const WEAK_HINT = /Intel\(R\) (HD|UHD) Graphics [0-9]{3}\b|Mali|Adreno|PowerVR|Intel HD|GMA/i;

/**
 * "auto" starts from medium: Iris Xe class and every discrete GPU run it at 60 fps with
 * headroom, and dynamic resolution covers the rest. Only software rendering, very old
 * integrated GPUs and 2-core machines start on low. High is a manual choice.
 */
export function autoPreset({ renderer = "", cores = 4, memoryGb = 8, software = false } = {}) {
  if (software) return "low";
  if (cores <= 2 || memoryGb <= 2) return "low";
  if (WEAK_HINT.test(renderer)) return "low";
  return "medium";
}

export function resolvePreset(choice, env) {
  const id = choice && choice !== "auto" && PRESETS[choice] ? choice : autoPreset(env);
  return PRESETS[id];
}
