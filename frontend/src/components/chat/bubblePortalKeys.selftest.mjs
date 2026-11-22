// Run: node src/components/chat/bubblePortalKeys.selftest.mjs
// Tauri sweep 2 (frontend/e2e/tauriScreens.e2e.cjs "image-viewer"): the image viewer is a portal
// rendered inside the message bubble's React tree, so its keys bubble through the bubble's
// onKeyDown. With the hover bar up (the pointer was on the message when its image was clicked)
// the bubble's Escape branch called preventDefault + stopPropagation: the viewer's window
// Escape listener never ran and Escape did not close the viewer. Keys whose target is outside
// the bubble's DOM (portals) are not the bubble's.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("./MessageList.jsx", import.meta.url), "utf8");
const start = src.indexOf("const onBubbleKeyDown = (e) => {");
assert.ok(start > 0, "onBubbleKeyDown exists");
const body = src.slice(start, src.indexOf("\n  };", start));
const guard = body.indexOf("if (!e.currentTarget.contains(e.target)) return;");
const escape = body.indexOf('e.key === "Escape"');
assert.ok(guard > 0, "portal keys are ignored by the bubble");
assert.ok(escape > guard, "the guard runs before the Escape branch that stops propagation");
console.log("bubblePortalKeys.selftest ok");
