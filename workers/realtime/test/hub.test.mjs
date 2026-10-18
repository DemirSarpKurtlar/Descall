import assert from "node:assert/strict";
import { HubCore, PING_INTERVAL_MS } from "../src/hub.js";
import { fakeCtx, fakeWs } from "./fakeCtx.mjs";

const ctx = fakeCtx();
let hub = new HubCore(ctx);
const parse = (s) => JSON.parse(s);

// no bridge → reject
assert.deepEqual(hub.acceptClient(fakeWs("c0")), { ok: false, code: 1013, reason: "bridge down" });

const bridge = fakeWs("bridge");
hub.acceptBridge(bridge);
assert.equal(parse(bridge.sent[0])[0], "hello");

const a = fakeWs("a");
const ra = hub.acceptClient(a, { uid: "u1", ip: "1.2.3.4", ua: "UA" });
assert.ok(ra.ok);
const open = parse(a.sent[0].slice(1));
assert.equal(a.sent[0][0], "0");
assert.equal(open.sid, ra.cid);
assert.deepEqual(open.upgrades, []);
assert.equal(open.pingInterval, PING_INTERVAL_MS);
assert.deepEqual(parse(bridge.sent[1]), ["o", ra.cid, { ip: "1.2.3.4", ua: "UA", origin: "", country: "" }]);
assert.equal(ctx.alarm, PING_INTERVAL_MS);

// client → bridge
hub.onMessage(a, '40{"token":"t"}');
assert.deepEqual(parse(bridge.sent[2]), ["m", ra.cid, '0{"token":"t"}']);
hub.onMessage(a, "3"); // pong ignored
assert.equal(bridge.sent.length, 3);

// bridge → client (batched ops)
const b = fakeWs("b");
const rb = hub.acceptClient(b, { uid: "u2" });
hub.onMessage(bridge, JSON.stringify([["m", ra.cid, '0{"sid":"x"}'], ["bc", [ra.cid, rb.cid, "ghost"], '2["users:update",[]]']]));
assert.deepEqual(a.sent.slice(1), ['40{"sid":"x"}', '42["users:update",[]]']);
assert.deepEqual(b.sent.slice(1), ['42["users:update",[]]']);

// survives hibernation: fresh core rebuilds the index from attachments
hub = new HubCore(ctx);
hub.onMessage(bridge, JSON.stringify(["m", rb.cid, '2["x"]']));
assert.equal(b.sent.at(-1), '42["x"]');

// server close
hub.onMessage(bridge, JSON.stringify([["x", rb.cid, "server close"]]));
assert.equal(b.closeInfo.code, 1000);

// client close → bridge x
const before = bridge.sent.length;
a.__closed = true;
hub.onClose(a);
assert.deepEqual(parse(bridge.sent[before]), ["x", ra.cid, "transport close"]);

// heartbeat
const c = fakeWs("c");
hub.acceptClient(c, {});
hub.onAlarm();
assert.equal(c.sent.at(-1), "2");

// new bridge replaces old one and drops every client
const bridge2 = fakeWs("bridge2");
hub.acceptBridge(bridge2);
assert.equal(bridge.closeInfo.code, 1000);
assert.equal(c.closeInfo.code, 1012);
// bridge close → clients closed
const d = fakeWs("d");
hub.acceptClient(d, {});
bridge2.__closed = true;
hub.onClose(bridge2);
assert.equal(d.closeInfo.code, 1012);
assert.equal(hub.health().bridge, false);
console.log("hub.test.mjs: ok");
