import { useEffect, useRef } from "react";

const FOCUSABLE =
  'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

function visible(el) {
  return el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
}

export function focusablesIn(root) {
  if (!root) return [];
  return Array.from(root.querySelectorAll(FOCUSABLE)).filter((el) => !el.closest("[inert]") && visible(el));
}

// The Electron title bar (window controls) stays usable over every modal.
const KEEP = ".titlebar";

/**
 * Makes everything outside `el` inert (each ancestor's siblings, up to <body>), so Tab and a
 * screen reader's virtual cursor stay in the modal. Returns a function that restores exactly
 * what it changed. Layers added to the page later (a nested sheet, a toast) are left alone,
 * and so is anything matching `keep`.
 */
export function inertOutside(el, keep = KEEP) {
  const doc = el?.ownerDocument;
  if (!doc?.body || !doc.body.contains(el)) return () => {};
  const changed = [];
  const shield = (sib) => {
    if (sib.inert || sib.tagName === "SCRIPT" || sib.tagName === "STYLE") return;
    if (keep && sib.matches(keep)) return;
    if (keep && sib.querySelector(keep)) {
      for (const child of Array.from(sib.children)) shield(child);
      return;
    }
    sib.inert = true;
    changed.push(sib);
  };
  for (let node = el; node && node !== doc.body; node = node.parentElement) {
    const parent = node.parentElement;
    if (!parent) break;
    for (const sib of Array.from(parent.children)) {
      if (sib !== node) shield(sib);
    }
  }
  return () => {
    for (const sib of changed) sib.inert = false;
  };
}

// Open modals, innermost last: only the top one wraps Tab.
const stack = [];

// Some openers drop their own focus on click (the rail buttons blur to hide their tooltip),
// so the opener is often the element that just lost focus, not document.activeElement.
let lastBlur = { el: null, at: 0 };
if (typeof document !== "undefined") {
  document.addEventListener("focusout", (e) => { lastBlur = { el: e.target, at: Date.now() }; }, true);
}
function openerNow() {
  const a = document.activeElement;
  if (a && a !== document.body) return a;
  return Date.now() - lastBlur.at < 1500 ? lastBlur.el : null;
}

/**
 * Modal focus handling (WCAG 2.4.3): while `open`, remembers what had focus, moves focus
 * into the modal (`initialFocus` ref or function, else the first focusable, else the modal
 * itself), keeps Tab / Shift+Tab inside it, makes the rest of the page inert, and on close
 * gives focus back to where it was.
 *
 * `ref` is the modal element (role="dialog"). `delay` (ms) postpones the initial focus,
 * e.g. until a presentation spring has started.
 */
export default function useModalFocus(open, ref, { initialFocus = null, delay = 0, enabled = true } = {}) {
  const optsRef = useRef({ initialFocus, delay });
  optsRef.current = { initialFocus, delay };

  useEffect(() => {
    if (!open || !enabled || typeof document === "undefined") return undefined;
    const el = ref.current;
    if (!el) return undefined;
    const prev = openerNow();
    // If the opener disappears (a menu item that closed its menu), its nearest focusable ancestor.
    const fallback = prev?.parentElement?.closest?.("[tabindex], button, a[href], input, textarea, select") || null;
    const entry = { el };
    stack.push(entry);
    const restoreInert = inertOutside(el);

    const focusIn = () => {
      if (el.contains(document.activeElement)) return;
      const { initialFocus: pick } = optsRef.current;
      const target = typeof pick === "function" ? pick() : pick?.current;
      const next = target || focusablesIn(el)[0];
      if (next) {
        next.focus({ preventScroll: true });
        return;
      }
      if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
      el.focus({ preventScroll: true });
    };
    const timer = setTimeout(focusIn, optsRef.current.delay || 0);

    const onKey = (e) => {
      if (e.key !== "Tab" || stack[stack.length - 1] !== entry) return;
      const active = document.activeElement;
      // Focus is in a newer layer this modal does not own (a portaled picker): leave it.
      if (active && active !== document.body && !el.contains(active) && !active.closest("[inert]")) return;
      const list = focusablesIn(el);
      if (!list.length) {
        e.preventDefault();
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && (active === first || !el.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !el.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("keydown", onKey, true);
      const i = stack.indexOf(entry);
      if (i >= 0) stack.splice(i, 1);
      restoreInert();
      const active = document.activeElement;
      // Only take focus back when it is still in the closing modal (or nowhere).
      if (active && active !== document.body && !el.contains(active)) return;
      const back = [prev, fallback].find((n) => n && n.isConnected && !n.closest("[inert]") && typeof n.focus === "function");
      back?.focus({ preventScroll: true });
    };
  }, [open, enabled, ref]);
}
