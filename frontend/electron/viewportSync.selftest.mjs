import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { viewportMismatch, attachViewportSync } = createRequire(import.meta.url)("./viewportSync.cjs");
// Field report: page stuck at 745x480 in a 1024x549 client.
assert.equal(viewportMismatch({ content: { width: 1024, height: 549 }, inner: { w: 745, h: 480 } }), true);
assert.equal(viewportMismatch({ content: { width: 1024, height: 549 }, inner: { w: 1024, h: 549 } }), false);
assert.equal(viewportMismatch({ content: { width: 1280, height: 800 }, inner: { w: 1024, h: 640 }, zoom: 1.25 }), false, "zoom aware");
// Listens to every size-changing window event.
const ev = [];
attachViewportSync({ on: (e) => ev.push(e), once() {} });
for (const e of ["maximize", "unmaximize", "restore", "resize", "enter-full-screen", "leave-full-screen"]) assert.ok(ev.includes(e), e);
console.log("viewportSync.selftest.mjs: ok");
