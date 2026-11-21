// node src/lib/settingsClose.selftest.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import { profileDraftDirty, nestedOverlayOpen, shellClickClosesSettings } from "./settingsClose.js";

const me = { displayName: "Demir", username: "demir", bio: "hi", customStatus: "" };
assert.equal(profileDraftDirty({ displayName: "Demir", bio: "hi", customStatus: "" }, me), false);
assert.equal(profileDraftDirty({ displayName: "Demir", bio: "hi there", customStatus: "" }, me), true);
assert.equal(profileDraftDirty({ displayName: "Demir 2", bio: "hi", customStatus: "" }, me), true);
assert.equal(profileDraftDirty({ displayName: "Demir", bio: "hi", customStatus: "away" }, me), true);
assert.equal(profileDraftDirty({ displayName: "demir", bio: "", customStatus: "" }, { username: "demir" }), false);
assert.equal(profileDraftDirty({ displayName: "x" }, null), false);

// Fake DOM: elements with getClientRects and contains.
const el = (name, { shown = true, children = [] } = {}) => ({
  name,
  isConnected: true,
  getClientRects: () => (shown ? [1] : []),
  contains(other) { return other === this || children.some((c) => c === other || c.contains?.(other)); },
});
const panel = el("panel");
const shell = el("shell", { children: [panel] });
const doc = (dialogs, overlays = []) => ({
  defaultView: { getComputedStyle: () => ({ visibility: "visible", display: "block" }) },
  querySelectorAll: (sel) => (sel.includes("role=") ? dialogs : overlays),
});
assert.equal(nestedOverlayOpen(panel, doc([panel, shell])), false, "the panel and its shell are not nested");
assert.equal(nestedOverlayOpen(panel, doc([panel, el("hidden cookie", { shown: false })])), false, "hidden dialogs do not count");
assert.equal(nestedOverlayOpen(panel, doc([panel, el("username")])), true, "a visible dialog above Settings owns Escape");
assert.equal(nestedOverlayOpen(panel, doc([panel], [el("crop")])), true, "a crop overlay owns Escape");
assert.equal(nestedOverlayOpen(panel, null), false);

// Wiring: Settings owns its Escape; AppLayout leaves it alone while Settings is mounted.
const panelSrc = fs.readFileSync(new URL("../components/layout/UserPanel.jsx", import.meta.url), "utf8");
assert.match(panelSrc, /nestedOverlayOpen\(/, "UserPanel checks for overlays above it before closing on Escape");
assert.match(panelSrc, /requestClose/, "UserPanel routes closes through requestClose");
const layoutSrc = fs.readFileSync(new URL("../components/layout/AppLayout.jsx", import.meta.url), "utf8");
assert.match(layoutSrc, /e\.defaultPrevented/, "AppLayout ignores an Escape already handled");
const unSrc = fs.readFileSync(new URL("../components/settings/UsernameChangeModal.jsx", import.meta.url), "utf8");
assert.match(unSrc, /stopImmediatePropagation/, "the username modal keeps its Escape to itself");
const cropSrc = fs.readFileSync(new URL("../components/ui/ImageCropModal.jsx", import.meta.url), "utf8");
assert.match(cropSrc, /Escape/, "the crop dialog closes on Escape");

// Backdrop clicks (owner report Nov 2026): a click on the photo / banner picker's or the crop
// dialog's own backdrop (portaled to <body>, so outside the shell's DOM but inside its React
// tree) closed that layer and the whole Settings window with it.
{
  const panelEl = el("panel", { children: [el("row")] });
  const shell = el("shell", { children: [panelEl] });
  const portalScrim = el("amp-scrim"); // a <body> child, not under the shell
  const click = (target) => ({ currentTarget: shell, target });
  assert.equal(shellClickClosesSettings(click(shell), panelEl), true, "the Settings dim closes Settings");
  assert.equal(shellClickClosesSettings(click(panelEl), panelEl), false, "a click in the panel does not");
  assert.equal(shellClickClosesSettings(click(portalScrim), panelEl), false, "a portaled picker / crop backdrop never closes Settings");
  assert.equal(shellClickClosesSettings({ currentTarget: null, target: shell }, panelEl), false);
  assert.equal(shellClickClosesSettings(null, panelEl), false);
  assert.match(panelSrc, /shellClickClosesSettings\(e, panelRef\.current\)/, "UserPanel's backdrop click goes through shellClickClosesSettings");
  assert.doesNotMatch(panelSrc, /if \(panelRef\.current && !panelRef\.current\.contains\(e\.target\)\) requestClose\(\)/, "no target-only check that portaled clicks pass");
}

console.log("settingsClose selftest ok");
