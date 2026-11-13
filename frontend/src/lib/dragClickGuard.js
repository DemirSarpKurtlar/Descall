/**
 * Drag-to-select must not close a modal.
 *
 * When a press starts inside a dialog (say, selecting the text of a field) and the button is
 * released over the backdrop, the browser fires `click` on the nearest common ancestor: the
 * backdrop. Every modal that closes on a backdrop click then closes. This guard swallows that
 * one synthetic click, app-wide, instead of patching each modal.
 *
 * It only swallows a click when all of these hold:
 *   - the press started on a different element, inside the clicked one (a drag ended outside);
 *   - the press started in a text field, or the drag left a text selection;
 *   - the clicked element is not itself interactive (a button, link, label, form control).
 * A normal click, or a press on an icon inside a button released on the button, still works.
 */

const INTERACTIVE = 'a[href], button, input, select, textarea, label, summary, [role="button"], [role="link"], [role="menuitem"], [role="tab"], [role="option"], [role="checkbox"], [role="radio"], [contenteditable=""], [contenteditable="true"]';

function isTextEntry(el) {
  if (!el || typeof el !== "object") return false;
  if (el.isContentEditable) return true;
  const tag = String(el.tagName || "").toLowerCase();
  if (tag === "textarea") return true;
  if (tag !== "input") return false;
  const type = String(el.type || "text").toLowerCase();
  return !["button", "submit", "reset", "checkbox", "radio", "range", "color", "file", "image"].includes(type);
}

/** Pure decision, exported for the selftest. */
export function shouldSwallowClick({ downTarget, clickTarget, selectionText = "" }) {
  if (!downTarget || !clickTarget || downTarget === clickTarget) return false;
  if (typeof clickTarget.contains !== "function" || !clickTarget.contains(downTarget)) return false;
  if (!isTextEntry(downTarget) && !String(selectionText || "").trim()) return false;
  if (typeof clickTarget.closest === "function" && clickTarget.closest(INTERACTIVE)) return false;
  return true;
}

let installed = false;

export function installDragClickGuard(win = typeof window !== "undefined" ? window : null) {
  if (!win || installed) return;
  installed = true;
  let downTarget = null;
  win.addEventListener("pointerdown", (e) => { downTarget = e.target; }, true);
  win.addEventListener(
    "click",
    (e) => {
      const from = downTarget;
      downTarget = null;
      if (e.detail === 0) return; // keyboard-generated click
      let selectionText = "";
      try { selectionText = win.getSelection?.()?.toString() || ""; } catch { /* ignore */ }
      if (shouldSwallowClick({ downTarget: from, clickTarget: e.target, selectionText })) {
        e.stopPropagation();
        e.preventDefault();
      }
    },
    true,
  );
}
