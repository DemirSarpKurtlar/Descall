/**
 * Who sees the "3D Dünya" entry (phase 1).
 *
 * - Build flag: iOS / Android builds set VITE_WORLD3D=0, so the lazy world chunk
 *   (Babylon.js) and the /world3d assets are not even in those bundles.
 * - Owner rule: admins only until the owner approves (WORLD3D_PUBLIC).
 * - Desktop only: Electron and desktop browsers. Native apps, phones, tablets and
 *   touch-first screens never see it.
 * - Renderer: WebGL2 with a hardware GPU. Software rendering (SwiftShader, llvmpipe,
 *   WARP) falls back to the flat call view. Voice is never touched.
 * Pure functions; the browser probe lives in detectEnvironment / probeRenderer.
 */

export const WORLD3D_PUBLIC = false;

const MOBILE_UA = /iPhone|iPad|iPod|Android|Mobile|Silk|Kindle|webOS|BlackBerry|Opera Mini|IEMobile/i;
const SOFTWARE_RENDERER = /SwiftShader|llvmpipe|softpipe|Software|Microsoft Basic Render|WARP/i;

export function isWorldAdmin(me) {
  return Boolean(me && (me.is_admin || me.isAdmin || me.username === "admin"));
}

export function canShowWorld({
  me,
  buildEnabled = true,
  publicEnabled = WORLD3D_PUBLIC,
  native = false,
  ua = "",
  coarsePointer = false,
  screenShort = 1080,
} = {}) {
  if (!buildEnabled) return { ok: false, reason: "build" };
  if (!me) return { ok: false, reason: "signed_out" };
  if (!publicEnabled && !isWorldAdmin(me)) return { ok: false, reason: "flag" };
  if (native) return { ok: false, reason: "native" };
  if (MOBILE_UA.test(ua || "")) return { ok: false, reason: "mobile" };
  if (coarsePointer) return { ok: false, reason: "touch" };
  if (screenShort < 700) return { ok: false, reason: "small_screen" };
  return { ok: true };
}

/** Decide whether this GPU may run the world. */
export function rendererVerdict({ webgl2 = false, renderer = "", allowSoftware = false } = {}) {
  if (!webgl2) return { ok: false, reason: "no_webgl2" };
  const software = SOFTWARE_RENDERER.test(String(renderer || ""));
  if (software && !allowSoftware) return { ok: false, reason: "software", software: true };
  return { ok: true, software };
}

export function detectEnvironment(win = typeof window !== "undefined" ? window : undefined) {
  if (!win) return { native: false, ua: "", coarsePointer: false, screenShort: 1080 };
  let native = false;
  try {
    native = Boolean(win.Capacitor?.isNativePlatform?.());
  } catch {
    native = false;
  }
  let coarsePointer = false;
  try {
    // A touch laptop still has a fine pointer; only touch-first devices report coarse as primary.
    coarsePointer = Boolean(win.matchMedia?.("(pointer: coarse)")?.matches) && !win.matchMedia?.("(any-pointer: fine)")?.matches;
  } catch {
    coarsePointer = false;
  }
  const scr = win.screen || {};
  const screenShort = Math.min(scr.width || win.innerWidth || 0, scr.height || win.innerHeight || 0) || 1080;
  return { native, ua: win.navigator?.userAgent || "", coarsePointer, screenShort };
}

/** Probe WebGL2 + renderer string once (creates and drops a tiny context). */
export function probeRenderer(doc = typeof document !== "undefined" ? document : undefined) {
  if (!doc) return { webgl2: false, renderer: "" };
  try {
    const canvas = doc.createElement("canvas");
    const gl = canvas.getContext("webgl2", { failIfMajorPerformanceCaveat: false });
    if (!gl) return { webgl2: false, renderer: "" };
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return { webgl2: true, renderer: String(renderer || ""), maxTex };
  } catch {
    return { webgl2: false, renderer: "" };
  }
}
