/**
 * The screen share ceiling for this person (owner decision 27 Nov): free 1080p / 30, Descall+ 1440p / 60,
 * admin-editable, and only where Descall+ is on sale for this platform; otherwise null (no limit,
 * today's 1440p / 60 for everyone). Set from GET /api/plus/limits (useScreenCeiling) and from the
 * server's pushes ("plus:event" screen_ceiling, the LiveKit token's screenCeiling).
 *
 * Read synchronously by lib/webrtcScreenShare.resolveScreenCaptureSize, the one size/fps function
 * every capture path uses (Electron, Tauri, web: server voice, group and 1:1 calls), so it caps the
 * NEXT share. A share that is already running is never interrupted or re-encoded by a ceiling change.
 * Dependency-free (no React) so the capture code can import it.
 */

const RES_ORDER = ["480p", "720p", "1080p", "1440p"];
const RES_H = { "480p": 480, "720p": 720, "1080p": 1080, "1440p": 1440 };

let ceilings = new Map(); // scope ("" = account, or a server id) -> { height, fps, locked }
const listeners = new Set();

function valid(c) {
  return c && Number(c.height) >= 480 && Number(c.fps) >= 5 ? { height: Number(c.height), fps: Number(c.fps), locked: c.locked !== false } : null;
}

export function setScreenCeiling(ceiling, scope = "") {
  const v = valid(ceiling);
  const key = String(scope || "");
  if (v) ceilings.set(key, v);
  else ceilings.delete(key);
  for (const fn of [...listeners]) {
    try { fn(); } catch { /* ignore */ }
  }
}

export function clearScreenCeilings() {
  ceilings = new Map();
  for (const fn of [...listeners]) fn();
}

/** The ceiling for a scope (a server id), falling back to the account-wide one; null = no limit. */
export function getScreenCeiling(scope = "") {
  return ceilings.get(String(scope || "")) || ceilings.get("") || null;
}

export function onScreenCeiling(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Cap a { width, height, fps } capture size (keeps the aspect ratio). */
export function capCaptureSize(size, ceiling) {
  const c = valid(ceiling);
  if (!c || !c.locked || !size) return size;
  const h = Number(size.height) || 0;
  const out = { ...size };
  if (h > c.height) {
    const ratio = c.height / h;
    out.height = c.height;
    out.width = Math.round((Number(size.width) || 0) * ratio / 2) * 2;
  }
  if (Number(size.fps) > c.fps) out.fps = c.fps;
  return out;
}

/** Highest allowed preset at or below a quality's resolution under the ceiling. */
export function cappedResolution(resolution, ceiling) {
  const c = valid(ceiling);
  if (!c || !c.locked) return resolution;
  let r = RES_ORDER.includes(resolution) ? resolution : "1080p";
  while (RES_H[r] > c.height && RES_ORDER.indexOf(r) > 0) r = RES_ORDER[RES_ORDER.indexOf(r) - 1];
  return r;
}
