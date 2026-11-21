/**
 * Premium theme scenes on Android: play, then settle.
 *
 * Round 1 froze the drift / specks / sheen layers and the chromeveil / iriscape
 * glass rim on Android (each frame of a 12-72 s loop re-blurs every glass bar
 * above it). This keeps some life: html.g-scene-live is set for INTRO_MS after
 * the app opens, after the theme changes (data-theme) and after the app comes
 * back to the foreground; while it is off, styles/android-motion.css and
 * styles/glass/android-fx.css hold the scene animations paused (they stop
 * where they are, no jump back to frame 0). Only android-scoped CSS reads the
 * class, so iOS / web / desktop are unaffected. Reduced motion: never live.
 */
export const SCENE_LIVE_CLASS = "g-scene-live";
export const INTRO_MS = 7000;
export const RESUME_MS = 4000;

function wantsMotion(win) {
  try {
    if (win.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return false;
  } catch {
    /* ignore */
  }
  return !win.document.documentElement.classList.contains("reduce-motion");
}

export function installSceneIntro(win = typeof window !== "undefined" ? window : undefined, deps = {}) {
  const doc = win?.document;
  const root = doc?.documentElement;
  if (!root?.classList || typeof doc.addEventListener !== "function") return () => {};
  const setT = deps.setTimeout || win.setTimeout.bind(win);
  const clearT = deps.clearTimeout || win.clearTimeout.bind(win);
  let timer = 0;

  const settle = () => {
    timer = 0;
    root.classList.remove(SCENE_LIVE_CLASS);
  };
  const play = (ms) => {
    if (!wantsMotion(win)) return settle();
    if (timer) clearT(timer);
    if (!root.classList.contains(SCENE_LIVE_CLASS)) root.classList.add(SCENE_LIVE_CLASS);
    timer = setT(settle, ms);
  };
  const onVisible = () => {
    if (doc.visibilityState !== "hidden") play(RESUME_MS);
  };
  const onResume = () => play(RESUME_MS);

  let lastTheme = root.getAttribute("data-theme");
  let mo = null;
  if (typeof win.MutationObserver === "function") {
    mo = new win.MutationObserver(() => {
      const theme = root.getAttribute("data-theme");
      if (theme === lastTheme) return;
      lastTheme = theme;
      play(INTRO_MS);
    });
    mo.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
  }
  doc.addEventListener("visibilitychange", onVisible);
  doc.addEventListener("resume", onResume);
  play(INTRO_MS);

  return () => {
    mo?.disconnect();
    doc.removeEventListener("visibilitychange", onVisible);
    doc.removeEventListener("resume", onResume);
    if (timer) clearT(timer);
    root.classList.remove(SCENE_LIVE_CLASS);
  };
}
