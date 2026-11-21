// Selftest: composer auto-grow caps (5 lines iPhone, 8 iPad) and Enter rules.
import assert from "node:assert/strict";
import {
  shouldSendOnLineBreakInput,
  LINE_BREAK_ENTER_MS,
  composerDeviceClass, maxComposerHeight, composerHeight, isImeEnter, shouldSendOnEnter, heldBoxHeight,
  IPHONE_MAX_LINES, IPAD_MAX_LINES, DESKTOP_MAX_PX,
} from "./composerGrow.js";

assert.equal(IPHONE_MAX_LINES, 5);
assert.equal(IPAD_MAX_LINES, 8);
assert.equal(composerDeviceClass({ glass: true, coarse: true }), "iphone");
assert.equal(composerDeviceClass({ glass: false, coarse: true }), "ipad");
assert.equal(composerDeviceClass({}), "desktop");

assert.equal(maxComposerHeight({ device: "iphone", lineHeight: 24 }), 120);
assert.equal(maxComposerHeight({ device: "ipad", lineHeight: 22, paddingY: 28 }), 22 * 8 + 28);
assert.equal(maxComposerHeight({ device: "desktop", lineHeight: 20 }), DESKTOP_MAX_PX);
assert.equal(maxComposerHeight({ device: "iphone", lineHeight: 0 }), 120, "bad line-height falls back to 24");

// grows with text, then caps and scrolls
assert.deepEqual(composerHeight({ scrollHeight: 24, minHeight: 24, maxHeight: 120 }), { height: 24, scroll: false });
assert.deepEqual(composerHeight({ scrollHeight: 72, minHeight: 24, maxHeight: 120 }), { height: 72, scroll: false });
assert.deepEqual(composerHeight({ scrollHeight: 120, minHeight: 24, maxHeight: 120 }), { height: 120, scroll: false });
assert.deepEqual(composerHeight({ scrollHeight: 240, minHeight: 24, maxHeight: 120 }), { height: 120, scroll: true });
assert.deepEqual(composerHeight({ scrollHeight: 10, minHeight: 52, maxHeight: 120 }), { height: 52, scroll: false });

// Enter: plain sends, Shift+Enter newline, IME composition never sends
assert.equal(shouldSendOnEnter({ key: "Enter" }), true);
assert.equal(shouldSendOnEnter({ key: "Enter", shiftKey: true }), false);
assert.equal(shouldSendOnEnter({ key: "Enter", isComposing: true }), false);
assert.equal(shouldSendOnEnter({ key: "Enter", nativeEvent: { isComposing: true } }), false);
assert.equal(shouldSendOnEnter({ key: "Enter", keyCode: 229 }), false);
assert.equal(shouldSendOnEnter({ key: "Enter" }, { composing: true }), false);
assert.equal(shouldSendOnEnter({ key: "a" }), false);
assert.equal(isImeEnter(null), false);

// Soft keyboard newline committed as text (Samsung Keyboard, composing Gboard): sends on touch.
assert.equal(shouldSendOnLineBreakInput("insertLineBreak", { coarse: true }), true);
assert.equal(shouldSendOnLineBreakInput("insertParagraph", { coarse: true }), true);
assert.equal(shouldSendOnLineBreakInput("insertText", { coarse: true }), false);
assert.equal(shouldSendOnLineBreakInput("insertLineBreak", { coarse: false }), false, "desktop keeps its keydown path");
assert.equal(
  shouldSendOnLineBreakInput("insertLineBreak", { coarse: true, lastEnter: { shift: true, at: 1000 }, now: 1000 + LINE_BREAK_ENTER_MS - 1 }),
  false,
  "Shift+Enter right before is a real newline",
);
assert.equal(
  shouldSendOnLineBreakInput("insertLineBreak", { coarse: true, lastEnter: { shift: true, at: 1000 }, now: 1000 + LINE_BREAK_ENTER_MS + 500 }),
  true,
);
assert.equal(shouldSendOnLineBreakInput("insertLineBreak", { coarse: true, lastEnter: { shift: false, at: 1000 }, now: 1001 }), true);

// Measuring holds the field's box at its height (Nov 2026: on iPad / desktop
// the collapse made the chat list above taller for one forced layout, the
// browser clamped its scrollTop and the newest message slid under the
// composer). min-height follows box-sizing.
assert.equal(heldBoxHeight(96, { boxSizing: "border-box", paddingTop: "14px", paddingBottom: "14px" }), 96);
assert.equal(heldBoxHeight(96, { boxSizing: "content-box", paddingTop: "14px", paddingBottom: "14px", borderTopWidth: "1px", borderBottomWidth: "1px" }), 66);
assert.equal(heldBoxHeight(96, null), 96);
assert.equal(heldBoxHeight(10, { boxSizing: "content-box", paddingTop: "14px" }), 0);
{
  const src = (await import("node:fs")).readFileSync(new URL("../components/chat/MessageComposer.jsx", import.meta.url), "utf8");
  const grow = src.slice(src.indexOf("const prevScroll = el.scrollTop;"), src.indexOf("el.style.maxHeight = `${maxHeight}px`;"));
  const hold = grow.indexOf("box.style.minHeight = `${heldBoxHeight(");
  assert.ok(hold >= 0 && hold < grow.indexOf('el.style.height = "auto"'), "box held before the field collapses");
  assert.ok(grow.lastIndexOf("box.style.minHeight = heldMin") > grow.lastIndexOf("el.style.height = `${height}px`"), "released after the final height is set");
}

console.log("composerGrow selftest OK");
