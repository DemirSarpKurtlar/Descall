/** Stage 3: on Liquid Glass the message menu is an iOS long-press, not a tap. */
export const MESSAGE_MENU_LONG_PRESS_MS = 450;

/** Finger-up of the press that opened the menu must not hit Edit / Report / the scrim. */
export const MESSAGE_MENU_OPEN_GUARD_MS = 400;

export function messageMenuOpensOnTap(glass) {
  return !glass;
}

export function openingPressShouldSwallow(openedAt, now, guardMs = MESSAGE_MENU_OPEN_GUARD_MS) {
  return Number.isFinite(openedAt) && Number.isFinite(now) && now >= openedAt && now - openedAt < guardMs;
}

/**
 * Capture-phase swallow of pointerup/click/touchend for the opening press.
 * Installed while the finger is still down, before the menu paints under it.
 */
export function swallowOpeningPress(guardMs = MESSAGE_MENU_OPEN_GUARD_MS + 50) {
  if (typeof window === "undefined") return () => {};
  const openedAt = performance.now();
  const swallow = (ev) => {
    if (!openingPressShouldSwallow(openedAt, performance.now(), guardMs)) {
      detach();
      return;
    }
    ev.preventDefault();
    ev.stopPropagation();
    ev.stopImmediatePropagation?.();
  };
  const detach = () => {
    window.removeEventListener("pointerup", swallow, true);
    window.removeEventListener("pointercancel", swallow, true);
    window.removeEventListener("click", swallow, true);
    window.removeEventListener("touchend", swallow, true);
  };
  window.addEventListener("pointerup", swallow, true);
  window.addEventListener("pointercancel", swallow, true);
  window.addEventListener("click", swallow, true);
  window.addEventListener("touchend", swallow, true);
  window.setTimeout(detach, guardMs + 80);
  return detach;
}
