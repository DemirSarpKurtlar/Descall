/**
 * Cosmetic loops run only while they are on screen.
 *
 * Name effects, avatar frames / effects, flares, auras, bubbles, badges and
 * shop previews are infinite CSS animations (the shop screen alone mounts 240+).
 * Chromium keeps ticking an animation that is scrolled out of view: style
 * recalc and paint invalidation every frame for rows nobody sees, and while one
 * such loop runs the page never stops producing frames. Each animated cosmetic
 * root is watched with one IntersectionObserver; out of view it gets
 * data-cx-off and styles/cosmetic-motion.css pauses it and its descendants
 * (paused, not removed: it resumes where it stopped when scrolled back in).
 * Idle / hidden app is handled globally by lib/appVisibility.js (html.app-idle,
 * html.app-hidden). A data attribute, not a class, so a React className update
 * never drops it.
 */
import "../styles/cosmetic-motion.css";

export const OFF_ATTR = "data-cx-off";

/** Roots of every infinite cosmetic loop (styles/cosmetics*.css, shop2-c*.css, name-effects-sigil.css). */
export const COSMETIC_ROOT_SELECTOR = [
  ".cosmetic-name-effect",
  ".s2-name-colour",
  ".cosmetic-avatar-effect",
  ".cosmetic-presence-flare",
  ".cosmetic-profile-aura",
  ".cosmetic-chat-bubble",
  ".cosmetic-typing-flare",
  ".ui-avatar-frame-overlay",
  ".s2-badge",
  ".vt2-skin",
  ".vt2-preview",
  ".s2-tile",
  ".shop-theme-swatch",
  ".shop-rarity-mythic",
  ".shop-gift-sparkle",
].join(",");

/** 1 viewport-ish margin would wake rows early; a small one avoids a visible restart at the edge. */
export const ROOT_MARGIN = "48px";

export function installCosmeticMotion(win = typeof window !== "undefined" ? window : undefined) {
  const doc = win?.document;
  if (!doc?.body || typeof win.IntersectionObserver !== "function" || typeof win.MutationObserver !== "function") {
    return () => {};
  }
  const watched = new WeakSet();
  const io = new win.IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const el = e.target;
        if (!el.isConnected) {
          io.unobserve(el);
          watched.delete(el);
          continue;
        }
        if (e.isIntersecting) {
          if (el.hasAttribute(OFF_ATTR)) el.removeAttribute(OFF_ATTR);
        } else if (!el.hasAttribute(OFF_ATTR)) {
          el.setAttribute(OFF_ATTR, "");
        }
      }
    },
    { rootMargin: ROOT_MARGIN }
  );
  const watch = (el) => {
    if (watched.has(el)) return;
    watched.add(el);
    io.observe(el);
  };
  const scan = (node) => {
    if (node.nodeType !== 1) return;
    if (node.matches(COSMETIC_ROOT_SELECTOR)) watch(node);
    if (node.firstElementChild) node.querySelectorAll(COSMETIC_ROOT_SELECTOR).forEach(watch);
  };
  const onAttr = (el) => {
    // A row re-rendered with a newly equipped cosmetic (className change).
    if (!watched.has(el) && el.matches(COSMETIC_ROOT_SELECTOR)) watch(el);
  };
  const mo = new win.MutationObserver((records) => {
    for (const r of records) {
      if (r.type === "attributes") onAttr(r.target);
      else for (const n of r.addedNodes) scan(n);
    }
  });
  mo.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
  scan(doc.body);
  return () => {
    mo.disconnect();
    io.disconnect();
    doc.querySelectorAll(`[${OFF_ATTR}]`).forEach((el) => el.removeAttribute(OFF_ATTR));
  };
}
