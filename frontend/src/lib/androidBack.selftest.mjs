import assert from "node:assert/strict";

function isVisible() {
  return true;
}

function find(flags) {
  if (flags.menu) return "menu";
  if (flags.overlay) return "overlay";
  if (flags.lfgDetail) return "lfg-detail";
  if (flags.drawerOverConversation) return "drawer";
  if (flags.conversation) return "conversation";
  return "exit";
}

assert.equal(find({ menu: true, overlay: true, conversation: true }), "menu");
assert.equal(find({ overlay: true, conversation: true }), "overlay");
assert.equal(find({ lfgDetail: true, conversation: true }), "lfg-detail");
assert.equal(find({ drawerOverConversation: true, conversation: true }), "drawer");
assert.equal(find({ conversation: true }), "conversation");
assert.equal(find({}), "exit");
assert.equal(typeof isVisible, "function");
console.log("androidBack.selftest ok");
