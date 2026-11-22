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

/**
 * The page is out of the user's sight: hidden (web tab, iOS background) or, in the desktop
 * shells, minimized / hidden to the tray. Electron and Tauri keep the renderer awake there
 * (backgroundThrottling: false, WebView2 stays "visible"), so document.visibilityState never
 * says hidden; the shell's app:visibility (html.app-backgrounded) does. A DM in the open
 * chat while Descall sat in the tray was marked read at once and never counted as unread
 * (no tray dot, no taskbar badge, the sender saw it as seen).
 */
export function pageHiddenFromUser(doc = typeof document !== "undefined" ? document : undefined) {
  if (!doc) return false;
  if (doc.visibilityState === "hidden") return true;
  return Boolean(doc.documentElement?.classList?.contains(BACKGROUNDED_CLASS));
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

/** The pause classes that freeze CSS animations (styles/app-backgrounded.css). */
const PAUSE_CLASSES = [BACKGROUNDED_CLASS, IDLE_CLASS, HIDDEN_CLASS];

/**
 * True for a one-shot (finite) CSS animation that is not done yet. Only CSS animations (they
 * carry animationName): Web Animations started by scripts (framer-motion) are not touched by
 * the pause stylesheet, and one a script paused on purpose stays paused.
 */
export function isOneShotAnimation(anim) {
  try {
    if (typeof anim?.animationName !== "string") return false;
    const timing = anim?.effect?.getComputedTiming?.();
    if (!timing || timing.iterations === Infinity) return false;
    return anim.playState !== "finished";
  } catch {
    return false;
  }
}

/**
 * Tauri: one-shot entrances finish while a pause class is on. The pause stylesheet pauses
 * EVERY animation; an element that mounts (or is mid-entrance) while html.app-idle /
 * app-backgrounded / app-hidden is on froze at its first frame, and an entrance from
 * opacity 0 (fade / rise with fill-mode both or backwards) stayed invisible but clickable:
 * a toast, a popover, a hover card, the market's cards or a message row that arrived while
 * the window was unfocused, minimized or restored without activation. In Tauri the shell
 * can leave app-backgrounded on after a restore that does not activate the window (no focus
 * event), and pointer moves do not clear it, so the invisible state lasted until a click,
 * which then landed on the invisible thing's backdrop and closed it ("opens and vanishes").
 * Infinite loops (the CPU reason for the pause) stay paused; only finite animations play,
 * through the Web Animations API, which takes precedence over animation-play-state.
 * Returns a cleanup.
 */
export function installEntranceRelease(win = typeof window !== "undefined" ? window : undefined) {
  const doc = win?.document;
  const root = doc?.documentElement;
  if (!root?.classList || typeof doc.addEventListener !== "function") return () => {};
  const pausedNow = () => PAUSE_CLASSES.some((c) => root.classList.contains(c));
  const release = (anims) => {
    for (const a of anims || []) {
      if (a?.playState === "paused" && isOneShotAnimation(a)) {
        try { a.play(); } catch { /* detached */ }
      }
    }
  };
  // A CSS animation that starts while paused still fires animationstart (Chromium / WebView2).
  const onStart = (e) => {
    if (!pausedNow()) return;
    const t = e.target;
    if (t && typeof t.getAnimations === "function") release(t.getAnimations());
  };
  doc.addEventListener("animationstart", onStart, true);
  const releaseAll = () => {
    if (pausedNow() && typeof doc.getAnimations === "function") release(doc.getAnimations());
  };
  // A staggered entrance (animation-delay) paused in its delay never fires animationstart:
  // while paused, nodes added to the page release the document's one-shot animations (one
  // pass per frame burst; mutations while paused are rare: a toast, a message, a tab).
  let mo = null;
  let domMo = null;
  let pending = 0;
  const setT = typeof win.setTimeout === "function" ? win.setTimeout.bind(win) : null;
  const clearT = typeof win.clearTimeout === "function" ? win.clearTimeout.bind(win) : null;
  const MO = win.MutationObserver;
  const watchDom = (on) => {
    if (on && !domMo && typeof MO === "function" && doc.body) {
      domMo = new MO(() => {
        if (pending || !setT) return;
        pending = setT(() => { pending = 0; releaseAll(); }, 32);
      });
      domMo.observe(doc.body, { childList: true, subtree: true });
    } else if (!on && domMo) {
      domMo.disconnect();
      domMo = null;
    }
  };
  // An entrance already running when a pause class goes on finishes as well.
  if (typeof MO === "function") {
    let was = pausedNow();
    if (was) watchDom(true);
    mo = new MO(() => {
      const now = pausedNow();
      if (now && !was) releaseAll();
      if (now !== was) watchDom(now);
      was = now;
    });
    mo.observe(root, { attributes: true, attributeFilter: ["class"] });
  }
  return () => {
    doc.removeEventListener("animationstart", onStart, true);
    if (mo) mo.disconnect();
    watchDom(false);
    if (pending && clearT) clearT(pending);
  };
}
