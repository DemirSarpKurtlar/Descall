/** Stage 3: on Liquid Glass the message menu is an iOS long-press, not a tap. */
export const MESSAGE_MENU_LONG_PRESS_MS = 450;

export function messageMenuOpensOnTap(glass) {
  return !glass;
}

/**
 * A row (or the scrim) runs only if this finger pressed down on that control.
 * The long-press that opened the menu pressed the bubble, so its release
 * cannot Edit, Report, or dismiss.
 */
export function pressToActivate(run) {
  let armed = false;
  return {
    onPointerDown(event) {
      if (event.button != null && event.button !== 0) return;
      armed = true;
    },
    onPointerCancel() {
      armed = false;
    },
    onClick(event) {
      if (!armed) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      armed = false;
      run?.(event);
    },
  };
}

/**
 * Swallow the pointerup / touchend that is still down when the menu opens,
 * and the click that same gesture synthesizes. The guard stays until that
 * click, or until the next pointerdown (a new press on a row). No timer:
 * a long hold cannot activate the control that slid under the finger.
 */
export function swallowOpeningPress() {
  if (typeof window === "undefined") return () => {};
  let live = true;
  const stop = (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  };
  const detach = () => {
    if (!live) return;
    live = false;
    window.removeEventListener("pointerup", onUp, true);
    window.removeEventListener("pointercancel", onUp, true);
    window.removeEventListener("touchend", onUp, true);
    window.removeEventListener("click", onClick, true);
    window.removeEventListener("pointerdown", onNextDown, true);
  };
  const onUp = (event) => {
    if (!live) return;
    stop(event);
    if (event.type === "pointercancel") detach();
  };
  const onClick = (event) => {
    if (!live) return;
    stop(event);
    detach();
  };
  const onNextDown = () => {
    if (!live) return;
    detach();
  };
  window.addEventListener("pointerup", onUp, true);
  window.addEventListener("pointercancel", onUp, true);
  window.addEventListener("touchend", onUp, true);
  window.addEventListener("click", onClick, true);
  window.addEventListener("pointerdown", onNextDown, true);
  return detach;
}
