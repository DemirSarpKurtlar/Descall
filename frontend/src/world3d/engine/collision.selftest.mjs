// Avatar collision + camera boom clamp.
// Run: node src/world3d/engine/collision.selftest.mjs
import assert from "node:assert/strict";
import { clampBoom, makeBox, pushOutOfBox, resolve } from "./collision.js";

const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} != ${b}`);
const box = makeBox(0, 0, 1, 0.5);
// Outside: untouched.
assert.deepEqual(pushOutOfBox(3, 0, 0.25, box), [3, 0]);
// Inside near the +x face: pushed out along x by the radius.
const [x1, z1] = pushOutOfBox(0.9, 0.1, 0.25, box);
near(x1, 1.25);
near(z1, 0.1);
// Rotated 90 degrees: the long side is now along z.
const rot = makeBox(0, 0, 1, 0.5, Math.PI / 2);
const [x2, z2] = pushOutOfBox(0.2, 0.9, 0.25, rot);
near(x2, 0.2);
near(z2, 1.25);
// Room bounds + boxes together.
const bounds = { minX: 0, maxX: 6, minZ: 0, maxZ: 6, minY: 0, maxY: 3 };
const [x3, z3] = resolve(-1, 3, 0.25, [], bounds);
near(x3, 0.25);
near(z3, 3);
const [x4, z4] = resolve(3, 3, 0.25, [makeBox(3, 3, 0.5, 0.5)], bounds);
assert.ok(Math.abs(x4 - 3) >= 0.75 - 1e-9 || Math.abs(z4 - 3) >= 0.75 - 1e-9, "pushed out of the box");
// Camera boom: target in the room, boom pointing through the +x wall gets shortened.
const len = clampBoom({ x: 5, y: 1.5, z: 3 }, { x: 1, y: 0, z: 0 }, 4, bounds, 0.2);
near(len, 0.8);
const free = clampBoom({ x: 3, y: 1.5, z: 3 }, { x: 0, y: 0, z: -1 }, 2, bounds, 0.2);
near(free, 2);
console.log("collision.selftest: ok");
