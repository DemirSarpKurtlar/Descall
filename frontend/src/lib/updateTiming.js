/**
 * Smart update timing (2.11.0), renderer side. Shared by the Electron update
 * chip and the web stale-chunk reload.
 *
 * Never restart or reload while the user is in a call / voice room / screen
 * share (voiceBusy), or typing / uploading (activityBusy). Apply at the next
 * idle moment: nothing busy AND (window hidden OR no input for USER_IDLE_MS).
 * The main process does the Electron install (electron/updateDeferral.cjs);
 * app quit / next launch always installs.
 */

export const USER_IDLE_MS = 2 * 60 * 1000;

/** @returns {{ action: "apply" | "wait", reason: string }} */
export function decideDeferredApply({ voiceBusy = false, activityBusy = false, hidden = false, idleMs = 0, explicit = false } = {}) {
  if (explicit) return { action: "apply", reason: "user-confirmed" };
  if (voiceBusy) return { action: "wait", reason: "voice-busy" };
  if (activityBusy) return { action: "wait", reason: "user-busy" };
  if (hidden) return { action: "apply", reason: "hidden" };
  if (Number(idleMs) >= USER_IDLE_MS) return { action: "apply", reason: "user-idle" };
  return { action: "wait", reason: "user-active" };
}

/** Chip copy key for a ready update. */
export function updateChipKey({ voiceBusy = false, activityBusy = false } = {}) {
  if (voiceBusy) return "updateToast.readyAfterCall";
  if (activityBusy) return "updateToast.readyAfterWork";
  return "updateToast.readyIdle";
}

// ── Activity registry: composer text / uploads, keyed per source ─────────
const flags = new Map();
const listeners = new Set();
let lastBusy = false;

export function getActivityBusy() {
  return lastBusy;
}

function emit() {
  const next = [...flags.values()].some(Boolean);
  if (next === lastBusy) return;
  lastBusy = next;
  for (const fn of listeners) {
    try {
      fn(next);
    } catch {
      /* one subscriber must not break the others */
    }
  }
}

/** key: e.g. "composer:dm:42". busy: has unsent text or an upload running. */
export function setActivityFlag(key, busy) {
  if (busy) flags.set(String(key), true);
  else flags.delete(String(key));
  emit();
}

export function subscribeActivityBusy(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function resetActivityForTests() {
  flags.clear();
  lastBusy = false;
}

// ── Last input time (for the 2-minute idle rule) ────────────────────────
let lastInputAt = Date.now();
let inputBound = false;
export function bindInputTracking(target = typeof window !== "undefined" ? window : null) {
  if (!target || inputBound) return;
  inputBound = true;
  const mark = () => {
    lastInputAt = Date.now();
  };
  for (const ev of ["pointerdown", "keydown", "wheel", "touchstart", "mousemove"]) {
    target.addEventListener(ev, mark, { passive: true, capture: true });
  }
}
export function userIdleMs(now = Date.now()) {
  return Math.max(0, now - lastInputAt);
}
