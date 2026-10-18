import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { liveCallRoute, callUrlTarget } from "./callRouteSync.js";

const dm = liveCallRoute({ mode: "outgoing", peer: { id: 7, username: "xest" }, callType: "voice" }, null);
assert.ok(dm.callPath.startsWith(dm.chatPath) && dm.callPath.endsWith("/call/voice"));
// Call starts → go to its /call URL once.
assert.equal(callUrlTarget(dm, dm.chatPath, null), dm.callPath);
// Connecting/active: browsing other DMs, groups, servers is NOT undone (the bug).
for (const p of ["/app/dm/kettle02", "/app/groups/9", "/app/servers/3/channels/1", "/app/friends"]) {
  assert.equal(callUrlTarget(dm, p, dm.key), null, p);
}
// outgoing → active keeps the same key: no yank.
const active = liveCallRoute({ mode: "active", peer: { id: 7, username: "xest" } }, null);
assert.equal(active.key, dm.key);
assert.equal(callUrlTarget(active, "/app/dm/kettle02", dm.key), null);
// Back on the call's own chat → canonical /call URL.
assert.equal(callUrlTarget(active, active.chatPath, active.key), active.callPath);
assert.equal(callUrlTarget(active, active.callPath, active.key), null);
// Group call.
const g = liveCallRoute(null, { isInCall: true, activeGroupId: 9 });
assert.ok(g.callPath.endsWith("/call"));
assert.equal(callUrlTarget(g, "/app/dm/xest", g.key), null);
assert.equal(liveCallRoute({ mode: null }, { isInCall: false }), null);

// Wiring: App uses the helper, the old unconditional replace is gone, pill returns to call.
const app = readFileSync(new URL("../App.jsx", import.meta.url), "utf8");
assert.ok(app.includes("callUrlTarget(route, location.pathname"));
assert.ok(!/if \(location\.pathname !== callPath\) navigate\(callPath/.test(app));
assert.ok(app.includes("onReturnToCall={returnToCall}"));
const ov = readFileSync(new URL("../components/CallOverlay.jsx", import.meta.url), "utf8");
assert.ok(ov.includes("onReturnToCall?.()"));
console.log("callRouteSync selftest OK");
