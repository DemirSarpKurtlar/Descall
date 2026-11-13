import assert from "node:assert/strict";
import { shouldSwallowClick } from "./dragClickGuard.js";

// Minimal element stand-ins: a parent chain, contains() and closest() for the interactive check.
function el(tagName, parent = null, extra = {}) {
  const node = { tagName, parent, ...extra };
  node.contains = (other) => {
    for (let n = other; n; n = n.parent) if (n === node) return true;
    return false;
  };
  node.closest = (sel) => {
    for (let n = node; n; n = n.parent) {
      const tag = String(n.tagName).toLowerCase();
      if (sel.includes(tag) && ["button", "a", "label", "input", "select", "textarea", "summary"].includes(tag)) {
        if (tag !== "a" || n.href) return n;
      }
      if (n.role && sel.includes(`[role="${n.role}"]`)) return n;
    }
    return null;
  };
  return node;
}

const backdrop = el("DIV");
const dialog = el("DIV", backdrop);
const input = el("INPUT", dialog, { type: "password" });
const text = el("P", dialog);
const button = el("BUTTON", dialog);
const icon = el("svg", button);
const card = el("DIV", backdrop);
const cardTitle = el("SPAN", card);

// Drag that starts in a text field and ends on the backdrop: swallowed (the reported bug).
assert.equal(shouldSwallowClick({ downTarget: input, clickTarget: backdrop }), true);
// Drag-selecting dialog text and releasing outside: swallowed.
assert.equal(shouldSwallowClick({ downTarget: text, clickTarget: backdrop, selectionText: "Hesap" }), true);
// A plain click on the backdrop still closes.
assert.equal(shouldSwallowClick({ downTarget: backdrop, clickTarget: backdrop }), false);
// Press on an icon inside a button, release on the button: a real click.
assert.equal(shouldSwallowClick({ downTarget: icon, clickTarget: button }), false);
// Press on a card's title, release on the card without selecting text: a real click.
assert.equal(shouldSwallowClick({ downTarget: cardTitle, clickTarget: card }), false);
// Release on an unrelated element (not an ancestor): never swallowed.
assert.equal(shouldSwallowClick({ downTarget: input, clickTarget: card }), false);
// Checkbox inputs are not text entry.
const check = el("INPUT", dialog, { type: "checkbox" });
assert.equal(shouldSwallowClick({ downTarget: check, clickTarget: backdrop }), false);
// Missing targets.
assert.equal(shouldSwallowClick({ downTarget: null, clickTarget: backdrop }), false);

console.log("dragClickGuard.selftest.mjs: ok");
