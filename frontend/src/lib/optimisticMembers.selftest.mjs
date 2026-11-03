import assert from "node:assert/strict";
import { removeMemberOptimistic, patchMemberOptimistic, runOptimistic } from "./optimisticMembers.js";

const list = [{ userId: "a" }, { userId: "b", timeoutUntil: null, nickname: "x" }, { userId: "c" }];

{
  const { next, undo } = removeMemberOptimistic(list, "b");
  assert.deepEqual(next.map((m) => m.userId), ["a", "c"]);
  assert.deepEqual(undo(next).map((m) => m.userId), ["a", "b", "c"]);
  // undo is idempotent if the row came back via realtime
  assert.equal(undo(list).length, 3);
  // undo after another removal still restores safely
  assert.deepEqual(undo([{ userId: "a" }]).map((m) => m.userId), ["a", "b"]);
  assert.equal(removeMemberOptimistic(list, "zz").next, list);
}
{
  const { next, undo } = patchMemberOptimistic(list, "b", { timeoutUntil: "2030-01-01" });
  assert.equal(next[1].timeoutUntil, "2030-01-01");
  const later = next.map((m) => (m.userId === "b" ? { ...m, nickname: "y" } : m));
  const back = undo(later);
  assert.equal(back[1].timeoutUntil, null);
  assert.equal(back[1].nickname, "y");
}
{
  let state = list;
  const update = (fn) => { state = fn(state); };
  let seen = null;
  const r = await runOptimistic({
    update,
    change: (l) => removeMemberOptimistic(l, "a"),
    request: async () => { assert.equal(state.length, 2); throw new Error("nope"); },
    onError: (e) => { seen = e.message; },
  });
  assert.equal(r.ok, false);
  assert.equal(seen, "nope");
  assert.deepEqual(state.map((m) => m.userId), ["a", "b", "c"]);
  const ok = await runOptimistic({ update, change: (l) => removeMemberOptimistic(l, "c"), request: async () => 7 });
  assert.equal(ok.ok, true);
  assert.equal(ok.result, 7);
  assert.equal(state.length, 2);
}
console.log("optimisticMembers selftest ok");
