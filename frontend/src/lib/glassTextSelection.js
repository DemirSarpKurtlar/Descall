/**
 * iOS glass long-press must not start WebKit's text selection (blue handles,
 * the callout, or a selection that runs away across the app). Copy stays on
 * the explicit Kopyala / clipboard actions. Selection remains inside editable
 * fields: text inputs, the composer textarea, and contenteditable.
 */

const TEXT_INPUT_TYPES = new Set(["", "text", "search", "email", "url", "tel", "password", "number"]);

function elementOf(node) {
  if (!node) return null;
  if (node.nodeType === 1) return node;
  return node.parentElement || null;
}

function isTextInput(el) {
  if (!el || el.tagName !== "INPUT") return false;
  const type = String(el.getAttribute?.("type") ?? el.type ?? "text").toLowerCase();
  return TEXT_INPUT_TYPES.has(type);
}

function isEditableElement(el) {
  if (!el || el.nodeType !== 1) return false;
  if (el.tagName === "TEXTAREA" || el.tagName === "SELECT") return true;
  if (isTextInput(el)) return true;
  const ce = el.getAttribute?.("contenteditable");
  if (ce === "" || ce === "true") return true;
  if (el.isContentEditable === true) return true;
  return false;
}

/** True when this node may show the native selection UI. */
export function glassSelectionAllowed(node) {
  let el = elementOf(node);
  while (el) {
    if (isEditableElement(el)) return true;
    el = el.parentElement || null;
  }
  return false;
}

/** selectstart / contextmenu: block and return true when the press is not in a field. */
export function blockGlassTextEvent(event) {
  if (!event) return false;
  if (glassSelectionAllowed(event.target)) return false;
  event.preventDefault?.();
  return true;
}

/** selectionchange: drop a selection that escaped onto chrome, menus, or bubbles. */
export function clearBlockedGlassSelection(doc) {
  const sel = doc?.getSelection?.();
  if (!sel || sel.isCollapsed) return false;
  if (glassSelectionAllowed(sel.anchorNode) || glassSelectionAllowed(sel.focusNode)) return false;
  sel.removeAllRanges?.();
  return true;
}

let installed = false;
let detach = null;

export function installGlassTextSelection(win) {
  const doc = win?.document;
  if (!doc || installed) return detach || (() => {});
  installed = true;
  const onSelect = (event) => blockGlassTextEvent(event);
  const onMenu = (event) => blockGlassTextEvent(event);
  const onDrag = (event) => {
    if (glassSelectionAllowed(event.target)) return;
    event.preventDefault?.();
  };
  const onChange = () => clearBlockedGlassSelection(doc);
  doc.addEventListener("selectstart", onSelect, true);
  doc.addEventListener("contextmenu", onMenu, true);
  doc.addEventListener("dragstart", onDrag, true);
  doc.addEventListener("selectionchange", onChange);
  detach = () => {
    doc.removeEventListener("selectstart", onSelect, true);
    doc.removeEventListener("contextmenu", onMenu, true);
    doc.removeEventListener("dragstart", onDrag, true);
    doc.removeEventListener("selectionchange", onChange);
    installed = false;
    detach = null;
  };
  return detach;
}
