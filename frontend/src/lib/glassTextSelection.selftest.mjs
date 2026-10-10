/**
 * Run: node frontend/src/lib/glassTextSelection.selftest.mjs
 * Long-press selection is blocked on glass chrome and allowed in fields.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  blockGlassTextEvent,
  clearBlockedGlassSelection,
  glassSelectionAllowed,
} from "./glassTextSelection.js";

function el(tag, { type, contentEditable, parent } = {}) {
  const node = {
    nodeType: 1,
    tagName: tag,
    parentElement: parent || null,
    type: type || "",
    isContentEditable: contentEditable === "" || contentEditable === "true",
    getAttribute(name) {
      if (name === "type") return type ?? null;
      if (name === "contenteditable") return contentEditable ?? null;
      return null;
    },
  };
  return node;
}

const menu = el("DIV");
const label = el("SPAN", { parent: menu });
const button = el("BUTTON", { parent: menu });
const bubble = el("DIV");
const bubbleText = el("P", { parent: bubble });
const header = el("H3");
const textarea = el("TEXTAREA");
const composer = el("DIV");
const composerField = el("TEXTAREA", { parent: composer });
const search = el("INPUT", { type: "search" });
const checkbox = el("INPUT", { type: "checkbox" });
const editable = el("DIV", { contentEditable: "true" });
const insideEditable = el("SPAN", { parent: editable });

assert.equal(glassSelectionAllowed(label), false, "menu label");
assert.equal(glassSelectionAllowed(button), false, "menu button");
assert.equal(glassSelectionAllowed(bubbleText), false, "bubble text");
assert.equal(glassSelectionAllowed(header), false, "header");
assert.equal(glassSelectionAllowed(checkbox), false, "checkbox is not a text field");
assert.equal(glassSelectionAllowed(textarea), true);
assert.equal(glassSelectionAllowed(composerField), true, "composer");
assert.equal(glassSelectionAllowed(search), true);
assert.equal(glassSelectionAllowed(insideEditable), true);

function press(target) {
  let prevented = false;
  const blocked = blockGlassTextEvent({
    target,
    preventDefault() { prevented = true; },
  });
  return { blocked, prevented };
}

for (const node of [label, button, bubbleText, header, checkbox]) {
  const r = press(node);
  assert.equal(r.blocked, true);
  assert.equal(r.prevented, true);
}
for (const node of [textarea, composerField, search, insideEditable]) {
  const r = press(node);
  assert.equal(r.blocked, false);
  assert.equal(r.prevented, false);
}

{
  const ranges = { n: 1 };
  const sel = {
    isCollapsed: false,
    anchorNode: label,
    focusNode: label,
    removeAllRanges() { ranges.n = 0; this.isCollapsed = true; },
  };
  const doc = { getSelection: () => sel };
  assert.equal(clearBlockedGlassSelection(doc), true);
  assert.equal(ranges.n, 0, "a selection on Yanıtla is cleared");
}
{
  const sel = {
    isCollapsed: false,
    anchorNode: composerField,
    focusNode: composerField,
    removeAllRanges() { throw new Error("composer selection must stay"); },
  };
  assert.equal(clearBlockedGlassSelection({ getSelection: () => sel }), false);
}

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../styles/glass/selection.css"), "utf8");
assert.match(css, /html\.glass-ui \*/);
assert.match(css, /-webkit-user-select:\s*none !important/);
assert.match(css, /-webkit-touch-callout:\s*none !important/);
assert.match(css, /-webkit-tap-highlight-color:\s*transparent/);
assert.match(css, /html\.glass-ui textarea/);
assert.match(css, /user-select:\s*text !important/);

const ui = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "glassUi.js"), "utf8");
assert.match(ui, /installGlassTextSelection/);
const bridge = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../ios/App/App/DescallBridgeViewController.swift"), "utf8");
assert.match(bridge, /allowsLinkPreview = false/);

console.log("glassTextSelection.selftest ok");
