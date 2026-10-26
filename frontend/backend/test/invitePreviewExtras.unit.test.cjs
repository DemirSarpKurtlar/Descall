"use strict";
const assert = require("node:assert/strict");
const { countVisibleOnline, invitePreviewExtras } = require("../lib/invitePreviewExtras");

const presence = new Map([
  ["a", { status: "online" }],
  ["b", { status: "idle" }],
  ["c", { status: "invisible" }],
  ["d", { status: "dnd" }],
]);
assert.equal(countVisibleOnline(["a", "b", "c", "d", "e"], presence, null), 3, "invisible + offline are not counted");
assert.equal(countVisibleOnline([], presence, null), 0);

function fakeDb({ members, user, fail }) {
  return {
    from(table) {
      const q = {
        select() { return q; }, eq() { return q; }, limit() { if (fail) throw new Error("db down"); return Promise.resolve({ data: members }); },
        maybeSingle() { return Promise.resolve({ data: table === "users" ? user : null }); },
      };
      return q;
    },
  };
}

(async () => {
  const r = await invitePreviewExtras(fakeDb({ members: [{ user_id: "a" }, { user_id: "c" }], user: { id: "m", username: "mert", display_name: "Mert", avatar_url: null } }), { serverId: "s", creatorId: "m", presence });
  assert.equal(r.onlineCount, 1);
  assert.deepEqual(r.inviter, { id: "m", username: "mert", displayName: "Mert", avatarUrl: null });
  const r2 = await invitePreviewExtras(fakeDb({ fail: true }), { serverId: "s", presence });
  assert.equal(r2.onlineCount, null, "db failure keeps preview working");
  assert.equal(r2.inviter, null);
  console.log("invitePreviewExtras ok");
})().catch((e) => { console.error(e); process.exit(1); });
