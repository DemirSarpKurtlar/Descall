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
 * - `app-hidden` (every platform, iPhone first): the page is hidden (visibilitychange,
 *   pagehide, Capacitor `pause`), e.g. the iOS app in the background or the phone
 *   locked while a call keeps the WebView running. Everything pauses, spinners too.
 * Low Power Mode / thermal serious (iOS shell, html[data-glass-lite]) and
 * prefers-reduced-motion go idle after IDLE_MS_SAVER instead of IDLE_MS.
 * Sockets, timers, notifications and sounds are untouched.
 */
import "../styles/app-backgrounded.css";
import { getVoiceBusy, subscribeVoiceBusy } from "./voiceBusy";

export const BACKGROUNDED_CLASS = "app-backgrounded";
export const IDLE_CLASS = "app-idle";
/**
 * `app-blurred`: the window lost focus, set even during a call (unlike app-idle). Only
 * decorative loops listen to it (voice tile skins, styles/app-backgrounded.css): sitting
 * in voice behind a game must not redraw the window at 60 fps (server-voice-26).
 */
export const BLURRED_CLASS = "app-blurred";
export const IDLE_MS = 15_000;
export const IDLE_MS_SAVER = 5_000;
export const HIDDEN_CLASS = "app-hidden";

/** Idle delay for the device state: shorter in Low Power Mode, when hot, or with Reduce Motion. */
export function idleDelayFor({ lowPower = false, thermal = "nominal", reducedMotion = false } = {}) {
  if (lowPower || thermal === "serious" || thermal === "critical" || reducedMotion) return IDLE_MS_SAVER;
  return IDLE_MS;
}

/** Device power state as the page can see it (glassDisplay writes data-glass-lite reasons on iOS). */
export function readPowerState(win) {
  const reasons = String(win?.document?.documentElement?.getAttribute?.("data-glass-lite") || "");
  let reducedMotion = false;
  try {
    reducedMotion = Boolean(win?.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
  } catch {
    reducedMotion = false;
  }
  return {
    lowPower: /\blowPower\b/.test(reasons),
    thermal: /\bthermal\b/.test(reasons) ? "serious" : "nominal",
    reducedMotion,
  };
}

/**
 * html.app-hidden while the page is hidden / in the background. Returns a cleanup.
 * Capacitor fires `pause` / `resume` on document (iOS and Android shells).
 */
export function installPageHiddenPause(win = typeof window !== "undefined" ? window : undefined) {
  const doc = win?.document;
  const root = doc?.documentElement;
  if (!root?.classList || typeof doc.addEventListener !== "function") return () => {};
  const set = (on) => {
    if (root.classList.contains(HIDDEN_CLASS) !== Boolean(on)) root.classList.toggle(HIDDEN_CLASS, Boolean(on));
  };
  const sync = () => set(doc.visibilityState === "hidden");
  const onHide = () => set(true);
  const onShow = () => set(false);
  doc.addEventListener("visibilitychange", sync);
  doc.addEventListener("pause", onHide);
  doc.addEventListener("resume", onShow);
  win.addEventListener?.("pagehide", onHide);
  win.addEventListener?.("pageshow", sync);
  sync();
  return () => {
    doc.removeEventListener("visibilitychange", sync);
    doc.removeEventListener("pause", onHide);
    doc.removeEventListener("resume", onShow);
    win.removeEventListener?.("pagehide", onHide);
    win.removeEventListener?.("pageshow", sync);
    root.classList.remove(HIDDEN_CLASS);
  };
}
const INPUT_EVENTS = ["pointermove", "pointerdown", "keydown", "wheel", "touchstart"];

/** Direct input (press, key, touch): the pause classes that say "not on screen" are wrong. */
export function clearStalePause(root) {
  if (!root?.classList) return;
  for (const c of [BACKGROUNDED_CLASS, HIDDEN_CLASS, BLURRED_CLASS]) {
    if (root.classList.contains(c)) root.classList.toggle(c, false);
  }
}

export function applyAppVisibility(root, { backgrounded } = {}) {
  if (!root?.classList) return false;
  root.classList.toggle(BACKGROUNDED_CLASS, Boolean(backgrounded));
  return root.classList.contains(BACKGROUNDED_CLASS);
}

/**
 * Input or focus that reaches the page proves the window is on screen. A missed "shown"
 * message (Tauri sends backgrounded:false only on focus: a window restored without being
 * activated, or shown from the tray while another app keeps the foreground) left
 * html.app-backgrounded on for good, every CSS animation paused at its first frame, and
 * the market's tiles and cards (s2-rise ... both) stayed at opacity 0: Settings > Mağaza
 * showed its header and tabs over an empty body (owner report, Tauri 4.0.1).
 */
const VISIBLE_PROOF_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart", "focus"];

export function installAppVisibility(win = typeof window !== "undefined" ? window : undefined) {
  const api = win?.electronAPI;
  if (!api || typeof api.onAppVisibility !== "function") return () => {};
  const root = win.document?.documentElement;
  const off = api.onAppVisibility((payload) => applyAppVisibility(root, payload));
  // One cleanup rule for both entry points (clearStalePause, also run by installIdlePause on
  // a press or key): the shell's own events add wheel and window focus here.
  const onSeen = () => clearStalePause(root);
  const canListen = typeof win.addEventListener === "function";
  if (canListen) for (const ev of VISIBLE_PROOF_EVENTS) win.addEventListener(ev, onSeen, { passive: true, capture: true });
  return () => {
    if (typeof off === "function") off();
    if (canListen) for (const ev of VISIBLE_PROOF_EVENTS) win.removeEventListener(ev, onSeen, { capture: true });
  };
}

/**
 * Idle / blur pause. `deps` makes it testable without a DOM.
 * Returns a cleanup function.
 */
export function installIdlePause(win = typeof window !== "undefined" ? window : undefined, deps = {}) {
  const root = win?.document?.documentElement;
  if (!root?.classList || typeof win.addEventListener !== "function") return () => {};
  const idleMs = () => deps.idleMs ?? idleDelayFor(readPowerState(win));
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
    timer = setT(() => { timer = 0; setIdle(true); }, idleMs());
  };
  const onInput = (e) => {
    // pointermove fires per pixel: re-arm at most every 250 ms.
    const now = Date.now();
    if (root.classList.contains(IDLE_CLASS)) setIdle(false);
    // A press or key means the window is on screen and focused, whatever the shell said last:
    // drop a stale backgrounded / hidden / blurred pause (Tauri can report "backgrounded" after
    // a restore with no focus event, a frameless window can read hidden, the native file
    // dialog's blur may not get its focus back). Everything mounted afterwards animates.
    if (e && (e.type === "pointerdown" || e.type === "keydown" || e.type === "touchstart")) clearStalePause(root);
    if (now - lastInput < 250 && timer) return;
    lastInput = now;
    arm();
  };
  const setBlurred = (on) => {
    if (root.classList.contains(BLURRED_CLASS) !== Boolean(on)) root.classList.toggle(BLURRED_CLASS, Boolean(on));
  };
  const onBlur = () => { if (timer) clearT(timer); timer = 0; setBlurred(true); setIdle(true); };
  const onFocus = () => { setBlurred(false); setIdle(false); arm(); };

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
    root.classList.remove(BLURRED_CLASS);
  };
}
