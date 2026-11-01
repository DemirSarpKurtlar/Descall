// Client and server agree on the 3D world wire format.
// Run: node src/world3d/net/protocol.selftest.mjs
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import * as P from "./protocol.js";

const require = createRequire(import.meta.url);
const S = require("../../../backend/lib/world3d/worldCore.js");

assert.deepEqual(P.STATES, S.STATES, "STATES differ between client and server");
assert.deepEqual(P.EMOTES, S.EMOTES, "EMOTES differ between client and server");
assert.equal(P.MAX_AVATARS, S.MAX_AVATARS);
assert.equal(P.SNAP_HZ, S.SNAP_HZ);

const wire = P.encodeSnapshot({ x: 1.234, y: 0, z: -2.345, yaw: 0.12345, state: P.STATE.walk, emote: P.EMOTE.wave, emoteSeq: 300, seat: -1 });
assert.deepEqual(wire, [1.23, 0, -2.35, 0.123, 1, 1, 44, -1]);
// What the client sends survives the server validation unchanged.
assert.deepEqual(S.sanitizeSnapshot(wire), wire);
assert.deepEqual(P.decodeSnapshot(wire), { x: 1.23, y: 0, z: -2.35, yaw: 0.123, state: 1, emote: 1, emoteSeq: 44, seat: -1 });
assert.equal(P.decodeSnapshot([1, 2]), null);
assert.equal(P.decodeSnapshot([NaN, 0, 0, 0, 0, 0, 0, -1]), null);

console.log("protocol.selftest: ok");
