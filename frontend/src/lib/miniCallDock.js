/**
 * Draggable mini call card physics (2.11.1). Pure, no DOM, unit-tested.
 *
 * Model (iOS PiP style):
 *  - 1:1 tracking while dragging; past the viewport edge the overshoot is
 *    rubber-banded (UIScrollView curve, c = 0.55).
 *  - On release the resting point is the *projected* position (momentum,
 *    deceleration rate 0.998/ms), snapped to the nearest of 6 anchors
 *    (4 corners + left/right middle), then a spring carries the card there
 *    starting from the release velocity (velocity handoff).
 *  - Anchors keep clear of "keep-out" rects (bottom user/voice panel,
 *    composer) so the card never parks over them.
 *  - Anchor id is persisted; the pixel position is recomputed on resize.
 *  - Safe insets (2.11.3): the top edge sits below the Electron custom title
 *    bar (and the macOS traffic lights) plus a margin, so a top anchor never
 *    slides under the bar. Every resting position is clamped into the safe
 *    box on load and on resize.
 */

export const DOCK_STORAGE_KEY = "descall:mini-call-dock";
export const DOCK_MARGIN = 16;
export const DECELERATION = 0.998;
export const RUBBER_C = 0.55;
/** Electron custom title bar height (titlebar.css --electron-titlebar-h). */
export const ELECTRON_TITLEBAR_H = 40;
/** macOS traffic lights (titleBarStyle "hidden"): bottom edge of the buttons incl. their hit slop. */
export const MAC_TRAFFIC_LIGHTS_BOTTOM = 32;
export const ANCHORS = ["top-left", "top-right", "mid-left", "mid-right", "bottom-left", "bottom-right"];

/** Distance travelled by a flick before coming to rest (px), v in px/ms. */
export function project(v, decel = DECELERATION) {
  // Apple: (v[px/s] / 1000) * d / (1 - d); v here is px/ms.
  return v * decel / (1 - decel);
}

/** Rubber-band an overshoot `x` past a boundary for a dimension `d`. */
export function rubberband(x, d, c = RUBBER_C) {
  if (x <= 0) return 0;
  return (1 - 1 / ((x * c) / d + 1)) * d;
}

/** Apply rubber banding to a raw drag position against [min,max]. */
export function bandAxis(raw, min, max, dim) {
  if (raw < min) return min - rubberband(min - raw, dim);
  if (raw > max) return max + rubberband(raw - max, dim);
  return raw;
}

/**
 * Safe area for the card inside the window.
 * @param {{electron?:boolean, platform?:string, titlebarH?:number, margin?:number, bottom?:number}} env
 *   titlebarH: measured bottom of the custom title bar (falls back to 40 on Electron).
 *   bottom: extra bottom inset (Windows taskbar overlap, --electron-bottom-inset).
 * @returns {{top:number,right:number,bottom:number,left:number}}
 */
export function dockInsets(env = {}, m = DOCK_MARGIN) {
  const margin = Number.isFinite(env.margin) ? env.margin : m;
  let chrome = 0;
  if (env.electron) {
    const measured = Number(env.titlebarH);
    chrome = Number.isFinite(measured) && measured > 0 ? measured : ELECTRON_TITLEBAR_H;
    if (env.platform === "darwin") chrome = Math.max(chrome, MAC_TRAFFIC_LIGHTS_BOTTOM);
  }
  const bottom = Math.max(0, Number(env.bottom) || 0);
  return { top: Math.ceil(chrome) + margin, right: margin, bottom: bottom + margin, left: margin };
}

function normInsets(insets, m) {
  if (typeof insets === "number") return { top: insets, right: insets, bottom: insets, left: insets };
  return {
    top: insets?.top ?? m,
    right: insets?.right ?? m,
    bottom: insets?.bottom ?? m,
    left: insets?.left ?? m,
  };
}

/**
 * Clamp a resting position so the whole card stays inside the safe box.
 * When the window is too small for the card, the top/left edge wins so the
 * avatar, name and status stay visible below the title bar.
 */
export function clampDockPosition(pos, vp, card, insets = DOCK_MARGIN) {
  const i = normInsets(insets, DOCK_MARGIN);
  const maxX = vp.w - card.w - i.right;
  const maxY = vp.h - card.h - i.bottom;
  const x = Math.max(i.left, Math.min(Number.isFinite(pos?.x) ? pos.x : i.left, maxX));
  const y = Math.max(i.top, Math.min(Number.isFinite(pos?.y) ? pos.y : i.top, maxY));
  return { x, y };
}

function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/**
 * Top-left pixel position for an anchor in a viewport, pushed clear of keep-out
 * rects (moved up above / beside them).
 * @param {{w:number,h:number}} vp  @param {{w:number,h:number}} card
 * @param {Array<{x:number,y:number,w:number,h:number}>} avoid
 */
export function anchorPoint(anchor, vp, card, avoid = [], insets = DOCK_MARGIN) {
  const i = normInsets(insets, DOCK_MARGIN);
  const left = i.left;
  const right = Math.max(i.left, vp.w - card.w - i.right);
  const top = i.top;
  const bottom = Math.max(top, vp.h - card.h - i.bottom);
  const midY = Math.max(top, top + (vp.h - i.bottom - top - card.h) / 2);
  const x = anchor.endsWith("left") ? left : right;
  let y = anchor.startsWith("top") ? top : anchor.startsWith("mid") ? midY : bottom;
  // Push up out of keep-out rects (panel / composer sit at the bottom).
  for (let k = 0; k < 4; k += 1) {
    const hit = avoid.find((r) => overlaps({ x, y, w: card.w, h: card.h }, r));
    if (!hit) break;
    y = Math.max(top, hit.y - card.h - DOCK_MARGIN);
  }
  return clampDockPosition({ x, y }, vp, card, i);
}

/** Nearest anchor to the projected resting point of the card's center. */
export function nearestAnchor(pos, vel, vp, card, avoid = [], insets = DOCK_MARGIN) {
  const px = pos.x + project(vel.x) + card.w / 2;
  const py = pos.y + project(vel.y) + card.h / 2;
  let best = ANCHORS[ANCHORS.length - 1];
  let bestD = Infinity;
  for (const a of ANCHORS) {
    const p = anchorPoint(a, vp, card, avoid, insets);
    const d = (p.x + card.w / 2 - px) ** 2 + (p.y + card.h / 2 - py) ** 2;
    if (d < bestD) { bestD = d; best = a; }
  }
  return best;
}

/**
 * One step of a critically-damped-ish spring (semi-implicit Euler).
 * response ≈ 0.35 s, damping ratio 0.82 (slight settle, Apple's default feel).
 * State {x, v} in px and px/ms; dt in ms. Returns new state.
 */
export function springStep(state, target, dt, response = 350, dampingRatio = 0.82) {
  const k = (2 * Math.PI / response) ** 2;
  const c = 4 * Math.PI * dampingRatio / response;
  const a = -k * (state.x - target) - c * state.v;
  const v = state.v + a * dt;
  return { x: state.x + v * dt, v };
}

export function springSettled(state, target) {
  return Math.abs(state.x - target) < 0.5 && Math.abs(state.v) < 0.02;
}

/** Velocity (px/ms) from recent pointer samples [{x,y,t}], last ~80 ms. */
export function releaseVelocity(samples, windowMs = 80) {
  if (!samples.length) return { x: 0, y: 0 };
  const last = samples[samples.length - 1];
  let first = last;
  for (let i = samples.length - 1; i >= 0; i -= 1) {
    if (last.t - samples[i].t > windowMs) break;
    first = samples[i];
  }
  const dt = last.t - first.t;
  if (dt <= 0) return { x: 0, y: 0 };
  return { x: (last.x - first.x) / dt, y: (last.y - first.y) / dt };
}

export function readDockAnchor(storage = globalThis.localStorage) {
  try {
    const v = storage?.getItem(DOCK_STORAGE_KEY);
    return ANCHORS.includes(v) ? v : "bottom-right";
  } catch {
    return "bottom-right";
  }
}

export function writeDockAnchor(anchor, storage = globalThis.localStorage) {
  try {
    if (ANCHORS.includes(anchor)) storage?.setItem(DOCK_STORAGE_KEY, anchor);
  } catch {
    /* private mode */
  }
}
