"use strict";
// node frontend/backend/lib/bootDiet.selftest.cjs
const assert = require("assert");
const { listHash, emitBootFriendList } = require("./bootDiet");

const fake = (auth) => ({ handshake: { auth }, out: [], emit(e, p) { this.out.push([e, p]); } });
const list = [{ id: "a", username: "x", lastMessage: "hi" }];
const h = listHash(list);
assert.strictEqual(h.length, 22);
assert.notStrictEqual(listHash([...list, { id: "b" }]), h);

let s = fake({});
assert.strictEqual(emitBootFriendList(s, list), "full");
assert.deepStrictEqual(s.out.map((x) => x[0]), ["friend:list", "boot:hash"]);
assert.strictEqual(s.out[1][1].friends, h);

s = fake({ bootFriends: h });
assert.strictEqual(emitBootFriendList(s, list), "same");
assert.deepStrictEqual(s.out.map((x) => x[0]), ["friend:list:same", "boot:hash"]);

s = fake({ bootFriends: "stale" });
assert.strictEqual(emitBootFriendList(s, list), "full");

s = fake({ bootFriends: h });
assert.strictEqual(emitBootFriendList(s, list, { enabled: false }), "full");
assert.deepStrictEqual(s.out.map((x) => x[0]), ["friend:list"], "kill switch: exactly the old behaviour");
console.log("bootDiet.selftest.cjs: ok");
