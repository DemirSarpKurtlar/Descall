// node src/lib/serverScreenQuality.selftest.mjs
import assert from "node:assert/strict";
import { cleanServerScreenQuality, readServerScreenQuality, writeServerScreenQuality } from "./serverScreenQuality.js";

const mem = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
};
assert.deepEqual(cleanServerScreenQuality(null), { resolution: "720p", fps: 20, contentHint: "motion" }, "mesh default");
assert.deepEqual(cleanServerScreenQuality({ resolution: "1080p", fps: 30, contentHint: "text" }), { resolution: "1080p", fps: 30, contentHint: "text" });
assert.deepEqual(cleanServerScreenQuality({ resolution: "8k", fps: 999, contentHint: "<b>" }), { resolution: "720p", fps: 20, contentHint: "motion" });
const store = mem();
assert.deepEqual(readServerScreenQuality(store), { resolution: "720p", fps: 20, contentHint: "motion" });
writeServerScreenQuality({ resolution: "1440p", fps: 15, contentHint: "detail" }, store);
assert.deepEqual(readServerScreenQuality(store), { resolution: "1440p", fps: 15, contentHint: "detail" });
store.setItem("descall:serverScreenQuality", "{broken");
assert.deepEqual(readServerScreenQuality(store).resolution, "720p");
console.log("serverScreenQuality selftest ok");
