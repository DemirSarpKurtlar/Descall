/**
 * Run: node frontend/src/lib/socketResubscribe.selftest.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { emitRoomOnce, nextGroupRejoin, resetRoomEmitBurst } from "./socketResubscribe.js";

function fakeSocket() {
  const calls = [];
  return {
    calls,
    emit(event, payload) {
      calls.push([event, payload]);
    },
  };
}

resetRoomEmitBurst();
const socket = fakeSocket();
assert.equal(emitRoomOnce(socket, "server:subscribe", { serverId: "a" }, 1000), true);
assert.equal(emitRoomOnce(socket, "server:subscribe", { serverId: "a" }, 1010), false);
assert.equal(emitRoomOnce(socket, "server:subscribe", { serverId: "b" }, 1010), true);
assert.equal(emitRoomOnce(socket, "groups:rejoin", ["g1", "g2"], 1020), true);
assert.equal(emitRoomOnce(socket, "groups:rejoin", ["g1", "g2"], 1030), false);
assert.equal(emitRoomOnce(socket, "server:subscribe", { serverId: "a" }, 1000 + 51), true);
assert.deepEqual(
  socket.calls.map((c) => c[0]),
  ["server:subscribe", "server:subscribe", "groups:rejoin", "server:subscribe"]
);

assert.deepEqual(nextGroupRejoin([], ""), { emit: false, key: "" });
assert.deepEqual(nextGroupRejoin([], '["g1"]'), { emit: false, key: "" });
assert.deepEqual(nextGroupRejoin(["g1"], ""), { emit: true, key: '["g1"]' });
assert.deepEqual(nextGroupRejoin(["g1"], '["g1"]'), { emit: false, key: '["g1"]' });
assert.deepEqual(nextGroupRejoin(["g1", "g2"], '["g1"]'), { emit: true, key: '["g1","g2"]' });
assert.deepEqual(nextGroupRejoin([null, "g1"], ""), { emit: true, key: '["g1"]' });

const app = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../App.jsx"), "utf8");
const connectSocket = app.slice(app.indexOf("const connectSocket"), app.indexOf("socket.on(\"connected\""));
assert.match(connectSocket, /socket\.on\("connect"/);
assert.doesNotMatch(connectSocket, /socket\.io\.on\("reconnect"/);
assert.match(connectSocket, /emitRoomOnce/);
assert.match(connectSocket, /nextGroupRejoin/);

console.log("socketResubscribe.selftest: ok");
