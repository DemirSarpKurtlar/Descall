// node src/lib/channelOverridesView.selftest.mjs
import assert from "node:assert/strict";
import { overridesView, moveNeedsSyncChoice } from "./channelOverridesView.js";

const deny = { targetType: "role", targetId: "every", deny: { VIEW_CHANNEL: true } };

// New backend: synced child shows the category's rules, marked inherited.
let v = await overridesView({ overrides: [], synced: true, parentId: "cat", inherited: [deny] }, { parentId: "cat" });
assert.equal(v.synced, true);
assert.equal(v.parentId, "cat");
assert.equal(v.rows.length, 1);
assert.equal(v.rows[0].inherited, true);
// Synced with an empty category: still synced, nothing to show.
v = await overridesView({ overrides: [], synced: true, parentId: "cat", inherited: [] });
assert.equal(v.synced, true);
assert.equal(v.rows.length, 0);
// Own rules: shown as they are.
v = await overridesView({ overrides: [deny], synced: false, parentId: "cat", inherited: [] });
assert.equal(v.synced, false);
assert.equal(v.rows[0].inherited, undefined);
// Old backend: second request for the category.
let asked = null;
v = await overridesView({ overrides: [] }, { parentId: "cat", fetchParent: async (id) => { asked = id; return { overrides: [deny] }; } });
assert.equal(asked, "cat");
assert.equal(v.synced, true);
// A category itself is never "synced".
v = await overridesView({ overrides: [], synced: true, parentId: "x", inherited: [deny] }, { isCategory: true });
assert.equal(v.synced, false);

// P8: choice only when both sides have rules and the category changes.
const rules = { ch1: { overrides: [deny] }, catA: { overrides: [deny] }, catB: { overrides: [] }, ch2: { overrides: [] } };
const getOverrides = async (id) => rules[id];
assert.equal(await moveNeedsSyncChoice({ channel: { id: "ch1", type: "text", parentId: null }, newParentId: "catA", getOverrides }), true);
assert.equal(await moveNeedsSyncChoice({ channel: { id: "ch1", type: "text", parentId: null }, newParentId: "catB", getOverrides }), false);
assert.equal(await moveNeedsSyncChoice({ channel: { id: "ch2", type: "text", parentId: null }, newParentId: "catA", getOverrides }), false);
assert.equal(await moveNeedsSyncChoice({ channel: { id: "ch1", type: "text", parentId: "catA" }, newParentId: "catA", getOverrides }), false);
assert.equal(await moveNeedsSyncChoice({ channel: { id: "ch1", type: "text" }, newParentId: "catA", getOverrides: async () => { throw new Error("x"); } }), false);
console.log("channelOverridesView selftest ok");
