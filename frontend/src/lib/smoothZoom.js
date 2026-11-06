/**
 * Ctrl + mouse wheel zoom for the desktop app, like a browser's page zoom but smooth:
 * each wheel push adds speed and the zoom glides and slows down on its own (ice, not
 * steps), so a fast flick travels further than a slow one. Trackpad pinch (Ctrl + wheel
 * with small deltas) feels direct. Ctrl + 0 eases back to 100 %, Ctrl + = / Ctrl + -
 * glide one step. The level is remembered between launches.
 *
 * The physics run on the zoom's logarithm, so zooming in and out feel the same.
 */
export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 2;
const LOG_MIN = Math.log(MIN_ZOOM);
const LOG_MAX = Math.log(MAX_ZOOM);
const STORE_KEY = "descall:zoom";

// One mouse notch (deltaY 100) glides ~10 %: travel = impulse / FRICTION.
export const IMPULSE_PER_PX = 0.0048; // log-zoom per second added per wheel pixel
export const FRICTION = 4.6; // 1/s: speed decays as exp(-FRICTION * t)
const STOP_SPEED = 0.004; // log-zoom per second
const MAX_SPEED = 6;
const KEY_STEP = 0.1; // Ctrl + = / - : ~10 %

/** Wheel delta in pixels (lines and pages converted), positive = scroll down = zoom out. */
export function wheelPixels(e) {
  const mode = e.deltaMode || 0;
  const k = mode === 1 ? 16 : mode === 2 ? 400 : 1;
  return (Number(e.deltaY) || 0) * k;
}

/** The pure state machine: z = ln(zoom), v = speed in log-zoom per second. */
export function createZoomPhysics(startZoom = 1) {
  let z = Math.log(clampZoom(startZoom));
  let v = 0;
  let target = null; // eased target (keyboard / reset), log units
  return {
    get zoom() { return Math.exp(z); },
    get moving() { return target !== null || Math.abs(v) > STOP_SPEED; },
    push(pixels) {
      target = null;
      v = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, v - pixels * IMPULSE_PER_PX));
    },
    easeTo(zoom) {
      v = 0;
      target = Math.log(clampZoom(zoom));
    },
    nudge(direction) {
      const base = target ?? z;
      target = Math.max(LOG_MIN, Math.min(LOG_MAX, base + Math.sign(direction) * KEY_STEP));
      v = 0;
    },
    /** Advance dt seconds. Returns the zoom. */
    step(dt) {
      const t = Math.max(0, Math.min(0.05, dt));
      if (target !== null) {
        // Critically damped ease toward the target (~180 ms).
        const k = 1 - Math.exp(-t * 16);
        z += (target - z) * k;
        if (Math.abs(target - z) < 0.0008) { z = target; target = null; }
        return Math.exp(z);
      }
      // Exact integral of v * exp(-F t) over the step: glides, then settles.
      const decay = Math.exp(-FRICTION * t);
      z += (v * (1 - decay)) / FRICTION;
      v *= decay;
      if (z <= LOG_MIN) { z = LOG_MIN; v = 0; }
      if (z >= LOG_MAX) { z = LOG_MAX; v = 0; }
      if (Math.abs(v) <= STOP_SPEED) v = 0;
      return Math.exp(z);
    },
  };
}

export function clampZoom(zoom) {
  const n = Number(zoom);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, n));
}

function readStored() {
  try { return clampZoom(Number(localStorage.getItem(STORE_KEY)) || 1); } catch { return 1; }
}
function store(zoom) {
  try { localStorage.setItem(STORE_KEY, String(Math.round(zoom * 1000) / 1000)); } catch { /* ignore */ }
}

let installed = false;

/** Install on the desktop app's main window. `bridge` is window.electronAPI.zoom. */
export function installSmoothZoom(bridge = typeof window !== "undefined" ? window.electronAPI?.zoom : null) {
  if (installed || !bridge || typeof bridge.set !== "function") return () => {};
  installed = true;
  const physics = createZoomPhysics(readStored());
  bridge.set(physics.zoom);
  let raf = 0;
  let last = 0;
  let saveTimer = 0;
  let pill = null;
  let pillTimer = 0;

  const showPill = (zoom) => {
    try {
      if (!pill) {
        const css = document.createElement("style");
        css.textContent = ".dsc-zoom-pill{position:fixed;top:14px;left:50%;z-index:2147483000;transform:translate(-50%,-6px);padding:6px 12px;border-radius:999px;background:rgba(24,26,31,.92);color:#f5f5f7;font-weight:600;font-size:var(--fs-13,13px);line-height:1.2;font-variant-numeric:tabular-nums;box-shadow:0 8px 24px rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.12);opacity:0;pointer-events:none;transition:opacity .2s ease,transform .2s ease}.dsc-zoom-pill.is-on{opacity:1;transform:translate(-50%,0)}@media (prefers-reduced-motion:reduce){.dsc-zoom-pill{transition:none}}";
        document.head.appendChild(css);
        pill = document.createElement("div");
        pill.className = "dsc-zoom-pill";
        pill.setAttribute("role", "status");
        pill.setAttribute("aria-live", "polite");
        document.body.appendChild(pill);
      }
      const lang = document.documentElement.lang || undefined;
      pill.textContent = new Intl.NumberFormat(lang, { style: "percent", maximumFractionDigits: 0 }).format(zoom);
      pill.classList.add("is-on");
      clearTimeout(pillTimer);
      pillTimer = setTimeout(() => pill && pill.classList.remove("is-on"), 1100);
    } catch { /* ignore */ }
  };

  const frame = (now) => {
    const dt = last ? (now - last) / 1000 : 1 / 60;
    last = now;
    const zoom = physics.step(dt);
    bridge.set(zoom);
    showPill(zoom);
    if (physics.moving) {
      raf = requestAnimationFrame(frame);
    } else {
      raf = 0;
      last = 0;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => store(physics.zoom), 300);
    }
  };
  const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };

  const onWheel = (e) => {
    if (!e.ctrlKey || e.defaultPrevented) return;
    e.preventDefault(); // no native step zoom, no page scroll
    physics.push(wheelPixels(e));
    kick();
  };
  const onKey = (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    if (e.key === "0") { e.preventDefault(); physics.easeTo(1); kick(); }
    else if (e.key === "=" || e.key === "+") { e.preventDefault(); physics.nudge(1); kick(); }
    else if (e.key === "-") { e.preventDefault(); physics.nudge(-1); kick(); }
  };
  window.addEventListener("wheel", onWheel, { passive: false, capture: true });
  window.addEventListener("keydown", onKey, true);
  return () => {
    window.removeEventListener("wheel", onWheel, { capture: true });
    window.removeEventListener("keydown", onKey, true);
    if (raf) cancelAnimationFrame(raf);
    installed = false;
  };
}
