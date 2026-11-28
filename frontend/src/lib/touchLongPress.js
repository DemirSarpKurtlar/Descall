/**
 * Touch long-press for rows of the desktop layout on a tablet (iPad app and
 * Safari, Android tablets). The desktop list hides each row's ⋯ until hover;
 * a touch screen has no hover, so every row showed a permanent ⋯ (the owner's
 * iPad photo, 27 Nov). Touch now opens the same row menu by holding the row,
 * at the finger, like right-click on desktop; the selected row keeps one ⋯
 * as the visible affordance (styles/conv-rows.css).
 *
 * iOS WebKit fires no `contextmenu` on a long-press; Android Chrome does. A
 * native one that arrives during the hold wins and the timer is dropped, so
 * the menu never opens twice. The click that ends a fired hold is swallowed,
 * so lifting the finger does not also open the conversation.
 *
 * One press is live at a time, so the state is module-level: a row that
 * re-renders mid-hold (presence, typing) gets new handler objects that still
 * cancel the running timer.
 */

export const LONG_PRESS_MS = 450;
/** Finger travel that turns the hold into a scroll (matches ServersSidebar's 8 px). */
export const LONG_PRESS_SLOP_PX = 8;

let active = null; // { x, y, fired, timer, clear }
let swallowUntil = 0;

function now() {
  return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
}

/** Stops a hold that has not fired yet. */
export function cancelTouchLongPress() {
  const a = active;
  if (a && !a.fired) {
    a.clear(a.timer);
    active = null;
  }
}

/** True while a press that already opened a menu still owns the next click. */
export function touchLongPressFired() {
  return Boolean(active?.fired) || now() < swallowUntil;
}

/**
 * After a hold fired, the browser still sends the compatibility mouse events
 * and the click of that touch. They must not reach the page: the row would
 * open the chat, and the menu's own outside-mousedown listener (document)
 * would close the menu that just opened. Window capture runs first.
 */
let guardInstalled = false;
function guardCompatEvents(e) {
  if (!touchLongPressFired()) return;
  e.preventDefault?.();
  e.stopPropagation?.();
  if (e.type === "click") {
    if (!active?.fired) active = null;
    swallowUntil = 0;
  }
}
function installGuard() {
  if (guardInstalled || typeof window === "undefined" || typeof window.addEventListener !== "function") return;
  guardInstalled = true;
  for (const type of ["mousedown", "mouseup", "click"]) window.addEventListener(type, guardCompatEvents, true);
}

/** The finger left the screen: a fired hold owns only the click that follows right now. */
function release() {
  if (active?.fired) {
    swallowUntil = now() + 400;
    active = null;
    return;
  }
  cancelTouchLongPress();
}

/**
 * Handlers for one row. fire({ clientX, clientY, target }) opens the menu.
 * Only touch and pen pointers start a hold; a mouse or trackpad keeps
 * right-click and hover.
 */
export function touchLongPressHandlers(
  fire,
  { delay = LONG_PRESS_MS, slop = LONG_PRESS_SLOP_PX, setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = (id) => clearTimeout(id) } = {}
) {
  return {
    onPointerDown(e) {
      if (!e || (e.pointerType !== "touch" && e.pointerType !== "pen")) return;
      if (e.button > 0 || e.isPrimary === false) return;
      cancelTouchLongPress();
      installGuard();
      const press = { x: e.clientX, y: e.clientY, fired: false, clear: clearTimer, target: e.currentTarget };
      press.timer = setTimer(() => {
        if (active !== press) return;
        press.fired = true;
        try {
          fire({ clientX: press.x, clientY: press.y, target: press.target });
        } catch {
          /* a failing menu must not leave the press stuck */
        }
      }, delay);
      active = press;
    },
    onPointerMove(e) {
      const a = active;
      if (!a || a.fired || !e) return;
      if (Math.hypot(e.clientX - a.x, e.clientY - a.y) > slop) cancelTouchLongPress();
    },
    onPointerUp() {
      release();
    },
    onPointerCancel() {
      release();
    },
    onContextMenuCapture() {
      // Android: the browser's own long-press contextmenu opens the menu; drop ours.
      if (active && !active.fired) {
        cancelTouchLongPress();
        swallowUntil = now() + 400;
      }
    },
    onClickCapture(e) {
      if (!touchLongPressFired()) return;
      e?.preventDefault?.();
      e?.stopPropagation?.();
      if (!active?.fired) active = null;
      swallowUntil = 0;
    },
  };
}

/** Test hook: forget any press. */
export function resetTouchLongPress() {
  if (active && !active.fired) active.clear(active.timer);
  active = null;
  swallowUntil = 0;
}
