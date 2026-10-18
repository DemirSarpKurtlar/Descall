import test from "node:test";
import assert from "node:assert/strict";
import { friendsWhoJustCameOnline } from "./onlineRoster.js";

const me = "me";
const friendIds = ["ada", "bey"];

test("opening the app does not notify for friends who are already online", () => {
  const already = [
    { id: "ada", status: "online" },
    { id: "bey", status: "idle" },
    { id: "me", status: "online" },
  ];
  const first = friendsWhoJustCameOnline({
    previous: [],
    next: already,
    friendIds,
    myId: me,
    hasBaseline: false,
  });
  assert.deepEqual(first.newcomers, []);
  assert.equal(first.hasBaseline, true);

  const stillThere = friendsWhoJustCameOnline({
    previous: already,
    next: already,
    friendIds,
    myId: me,
    hasBaseline: first.hasBaseline,
  });
  assert.deepEqual(stillThere.newcomers, []);
});

test("a friend who connects after the baseline is notified", () => {
  const baseline = [{ id: "ada", status: "online" }, { id: "me", status: "online" }];
  const next = [...baseline, { id: "bey", status: "online" }];
  const result = friendsWhoJustCameOnline({
    previous: baseline,
    next,
    friendIds,
    myId: me,
    hasBaseline: true,
  });
  assert.deepEqual(result.newcomers.map((u) => u.id), ["bey"]);
});

test("idle and dnd arrivals count, offline and self and strangers do not", () => {
  const result = friendsWhoJustCameOnline({
    previous: [{ id: "ada", status: "online" }],
    next: [
      { id: "ada", status: "online" },
      { id: "bey", status: "dnd" },
      { id: "me", status: "online" },
      { id: "stranger", status: "online" },
      { id: "ghost", status: "offline" },
    ],
    friendIds: ["ada", "bey", "ghost"],
    myId: me,
    hasBaseline: true,
  });
  assert.deepEqual(result.newcomers.map((u) => u.id), ["bey"]);
});

test("friends loaded after the first roster still do not notify for that roster", () => {
  const roster = [{ id: "ada", status: "online" }, { id: "bey", status: "online" }];
  const first = friendsWhoJustCameOnline({
    previous: [],
    next: roster,
    friendIds: [],
    myId: me,
    hasBaseline: false,
  });
  const afterFriendsArrive = friendsWhoJustCameOnline({
    previous: roster,
    next: roster,
    friendIds,
    myId: me,
    hasBaseline: first.hasBaseline,
  });
  assert.deepEqual(afterFriendsArrive.newcomers, []);
});

import { applyPresenceDelta } from "./onlineRoster.js";

test("presence delta upserts, removes and keeps identity when nothing changes", () => {
  const base = [{ id: "ada", status: "online" }, { id: "me", status: "online" }];
  assert.equal(applyPresenceDelta(base, { up: [], rm: [] }), base);
  assert.equal(applyPresenceDelta(base, null), base);
  const added = applyPresenceDelta(base, { up: [{ id: "bey", status: "online" }], rm: [] });
  assert.deepEqual(added.map((u) => u.id), ["ada", "me", "bey"]);
  const changed = applyPresenceDelta(added, { up: [{ id: "ada", status: "dnd" }] });
  assert.equal(changed.find((u) => u.id === "ada").status, "dnd");
  assert.equal(changed.length, 3);
  const removed = applyPresenceDelta(changed, { rm: ["bey", "ghost"] });
  assert.deepEqual(removed.map((u) => u.id), ["ada", "me"]);
  const norm = applyPresenceDelta([], { up: [{ id: 5, status: "idle" }] }, (u) => ({ ...u, n: true }));
  assert.deepEqual(norm, [{ id: 5, status: "idle", n: true }]);
});

test("delta newcomers still trigger the friend-online toast logic", () => {
  const base = [{ id: "me", status: "online" }];
  const next = applyPresenceDelta(base, { up: [{ id: "ada", status: "online" }] });
  const r = friendsWhoJustCameOnline({ previous: base, next, friendIds: ["ada"], myId: "me", hasBaseline: true });
  assert.deepEqual(r.newcomers.map((u) => u.id), ["ada"]);
});
