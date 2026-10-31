/**
 * 3.7.15 idle CPU. Measured (electron/e2e/idlePerf.e2e.cjs): ANY infinite CSS
 * animation on screen, even a 4 px dot, makes the compositor redraw the whole
 * window at 60 fps, about 24% of a core in the GPU process, with or without
 * backdrop-filter. Discord idles near 0% because nothing loops at rest.
 *
 * Two classes on <html>, both pause CSS animations (styles/app-backgrounded.css):
 * - `app-backgrounded` (Electron): main sends `app:visibility` on minimize /
 *   hide-to-tray / restore / show. main.cjs keeps the renderer fully awake
 *   (backgroundThrottling: false, so sockets and message sounds keep working
 *   in the tray), which means Chromium never reports the page as hidden.
 * - `app-idle` (every platform): the window lost focus, or no pointer / key /
 *   wheel / touch input for IDLE_MS. Shop effects, theme glows and badges play
 *   while someone is looking and using the app, and stop at rest. Never set
 *   while in a call or voice channel (lib/voiceBusy). Spinners and progress keep
 *   running (carve-out in the stylesheet).
 * Sockets, timers, notifications and sounds are untouched.
 */
import "../styles/app-backgrounded.css";
import { getVoiceBusy, subscribeVoiceBusy } from "./voiceBusy";

export const BACKGROUNDED_CLASS = "app-backgrounded";
export const IDLE_CLASS = "app-idle";
export const IDLE_MS = 15_000;
const INPUT_EVENTS = ["pointermove", "pointerdown", "keydown", "wheel", "touchstart"];

export function applyAppVisibility(root, { backgrounded } = {}) {
  if (!root?.classList) return false;
  root.classList.toggle(BACKGROUNDED_CLASS, Boolean(backgrounded));
  return root.classList.contains(BACKGROUNDED_CLASS);
}

export function installAppVisibility(win = typeof window !== "undefined" ? window : undefined) {
  const api = win?.electronAPI;
  if (!api || typeof api.onAppVisibility !== "function") return () => {};
  const root = win.document?.documentElement;
  const off = api.onAppVisibility((payload) => applyAppVisibility(root, payload));
  return typeof off === "function" ? off : () => {};
}

/**
 * Idle / blur pause. `deps` makes it testable without a DOM.
 * Returns a cleanup function.
 */
export function installIdlePause(win = typeof window !== "undefined" ? window : undefined, deps = {}) {
  const root = win?.document?.documentElement;
  if (!root?.classList || typeof win.addEventListener !== "function") return () => {};
  const idleMs = deps.idleMs ?? IDLE_MS;
  const isBusy = deps.isBusy || getVoiceBusy;
  const onBusy = deps.subscribeBusy || subscribeVoiceBusy;
  const setT = deps.setTimeout || win.setTimeout.bind(win);
  const clearT = deps.clearTimeout || win.clearTimeout.bind(win);
  let timer = 0;
  let lastInput = 0;

  const setIdle = (on) => {
    const idle = Boolean(on) && !isBusy();
    if (root.classList.contains(IDLE_CLASS) !== idle) root.classList.toggle(IDLE_CLASS, idle);
  };
  const arm = () => {
    if (timer) clearT(timer);
    timer = setT(() => { timer = 0; setIdle(true); }, idleMs);
  };
  const onInput = () => {
    // pointermove fires per pixel: re-arm at most every 250 ms.
    const now = Date.now();
    if (root.classList.contains(IDLE_CLASS)) setIdle(false);
    if (now - lastInput < 250 && timer) return;
    lastInput = now;
    arm();
  };
  const onBlur = () => { if (timer) clearT(timer); timer = 0; setIdle(true); };
  const onFocus = () => { setIdle(false); arm(); };

  for (const ev of INPUT_EVENTS) win.addEventListener(ev, onInput, { passive: true, capture: true });
  win.addEventListener("blur", onBlur);
  win.addEventListener("focus", onFocus);
  const offBusy = typeof onBusy === "function" ? onBusy((busy) => { if (busy) setIdle(false); else arm(); }) : null;
  arm();
  return () => {
    for (const ev of INPUT_EVENTS) win.removeEventListener(ev, onInput, { capture: true });
    win.removeEventListener("blur", onBlur);
    win.removeEventListener("focus", onFocus);
    if (typeof offBusy === "function") offBusy();
    if (timer) clearT(timer);
    root.classList.remove(IDLE_CLASS);
  };
}
