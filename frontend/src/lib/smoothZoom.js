/**
 * Ctrl + mouse wheel zoom for the desktop app, like a browser's page zoom but smooth:
 * each wheel push adds speed and the zoom glides and slows down on its own (ice, not
 * steps), so a fast flick travels further than a slow one. Trackpad pinch (Ctrl + wheel
 * with small deltas) feels direct. Ctrl + 0 eases back to 100 %, Ctrl + = / Ctrl + -
 * glide one step. The level is remembered between launches.
 *
 * The physics run on the zoom's logarithm, so zooming in and out feel the same.
 *
 * Performance: setting the real page zoom re-lays out the whole app, which is far too
 * heavy to do every frame (it dropped to ~5 fps). While the zoom is moving, the page is
 * only scaled on the GPU (a CSS transform on <body>, origin top-left like page zoom); the
 * real zoom is applied once when the motion stops, and the transform is removed in the
 * same frame.
 */
export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 2;
const LOG_MIN = Math.log(MIN_ZOOM);
const LOG_MAX = Math.log(MAX_ZOOM);
const STORE_KEY = "descall:zoom";
/**
 * Polish pass: the page must stay at least this large in CSS px at any zoom. At 200 % in a
 * 1280×800 window the page was 640×400 and fell into the phone layout under the desktop
 * title bar (GLASS_DESKTOP_MIN_WIDTH is 960).
 */
export const MIN_CSS_WIDTH = 960;
export const MIN_CSS_HEIGHT = 600;

/** Largest zoom that keeps the page at least MIN_CSS_WIDTH × MIN_CSS_HEIGHT (never below 100 %). */
export function maxZoomForWindow({ dipWidth, dipHeight } = {}) {
  const w = Number(dipWidth);
  const h = Number(dipHeight);
  if (!(w > 0) || !(h > 0)) return MAX_ZOOM;
  const fit = Math.min(w / MIN_CSS_WIDTH, h / MIN_CSS_HEIGHT);
  return Math.max(1, Math.min(MAX_ZOOM, Math.floor(fit * 100) / 100));
}

// One mouse notch (deltaY 100) glides ~10 %: travel = impulse / FRICTION.
// FRICTION 9: the glide settles in ~0.6 s (it was ~1.2 s and felt too slippery).
export const IMPULSE_PER_PX = 0.00855; // log-zoom per second added per wheel pixel
export const FRICTION = 9; // 1/s: speed decays as exp(-FRICTION * t)
const STOP_SPEED = 0.004; // log-zoom per second
const MAX_SPEED = 9; // a hard flick can still cross the whole 50-200 % range
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
  let zMax = LOG_MAX; // window-dependent ceiling (setMax)
  let target = null; // eased target (keyboard / reset), log units
  return {
    get zoom() { return Math.exp(z); },
    get moving() { return target !== null || Math.abs(v) > STOP_SPEED; },
    get max() { return Math.exp(zMax); },
    /** Window-dependent ceiling; a zoom above it eases back down. Returns true when it did. */
    setMax(zoom) {
      zMax = Math.log(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Number(zoom) || MAX_ZOOM)));
      if (target !== null && target > zMax) target = zMax;
      if (z > zMax + 0.0005) { v = 0; target = zMax; return true; }
      return false;
    },
    push(pixels) {
      target = null;
      v = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, v - pixels * IMPULSE_PER_PX));
    },
    easeTo(zoom) {
      v = 0;
      target = Math.min(zMax, Math.log(clampZoom(zoom)));
    },
    nudge(direction) {
      const base = target ?? z;
      target = Math.max(LOG_MIN, Math.min(zMax, base + Math.sign(direction) * KEY_STEP));
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
      if (z >= zMax) { z = zMax; v = 0; }
      if (Math.abs(v) <= STOP_SPEED) v = 0;
      return Math.exp(z);
    },
  };
}

/** GPU preview scale while moving: the target zoom relative to the zoom actually applied. */
export function previewScale(zoom, applied) {
  const a = Number(applied) > 0 ? Number(applied) : 1;
  const s = clampZoom(zoom) / a;
  return Math.abs(s - 1) < 0.0005 ? 1 : s;
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
  // Window size in DIP = CSS px × the zoom actually applied (the GPU preview never changes it).
  const windowMax = (zoomNow) => maxZoomForWindow({
    dipWidth: (typeof window !== "undefined" ? window.innerWidth : 0) * zoomNow,
    dipHeight: (typeof window !== "undefined" ? window.innerHeight : 0) * zoomNow,
  });
  let current = 1;
  try { current = typeof bridge.get === "function" ? Number(bridge.get()) || 1 : 1; } catch { current = 1; }
  const startMax = windowMax(current);
  // A stored zoom above this window's ceiling starts at the ceiling.
  const physics = createZoomPhysics(Math.min(readStored(), startMax));
  physics.setMax(startMax);
  let applied = physics.zoom;
  bridge.set(applied);
  const body = typeof document !== "undefined" ? document.body : null;
  const setPreview = (scale) => {
    if (!body) return;
    if (scale === 1) {
      body.style.removeProperty("transform");
      body.style.removeProperty("transform-origin");
      body.style.removeProperty("will-change");
      return;
    }
    body.style.transformOrigin = "0 0";
    body.style.willChange = "transform";
    body.style.transform = `scale(${scale.toFixed(4)})`;
  };
  const commit = (zoom) => {
    if (Math.abs(zoom - applied) > 0.0005) { bridge.set(zoom); applied = zoom; }
    setPreview(1);
  };
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
        // On <html>, not <body>: the body is scaled while the zoom moves.
        document.documentElement.appendChild(pill);
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
    showPill(zoom);
    if (physics.moving) {
      setPreview(previewScale(zoom, applied));
      raf = requestAnimationFrame(frame);
    } else {
      commit(zoom);
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
  // A smaller window lowers the ceiling: an over-large zoom eases back to it.
  let resizeTimer = 0;
  const onResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (physics.setMax(windowMax(applied))) kick(); }, 150);
  };
  window.addEventListener("wheel", onWheel, { passive: false, capture: true });
  window.addEventListener("keydown", onKey, true);
  window.addEventListener("resize", onResize);
  return () => {
    window.removeEventListener("wheel", onWheel, { capture: true });
    window.removeEventListener("keydown", onKey, true);
    window.removeEventListener("resize", onResize);
    clearTimeout(resizeTimer);
    if (raf) cancelAnimationFrame(raf);
    commit(physics.zoom);
    installed = false;
  };
}
