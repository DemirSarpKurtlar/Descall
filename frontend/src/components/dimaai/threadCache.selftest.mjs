/**
 * Run: node frontend/src/components/dimaai/threadCache.selftest.mjs
 */
import assert from "node:assert/strict";
import {
  writeThreadCache,
  readThreadCache,
  peekThreadCache,
  dropThreadCache,
  clearThreadCache,
} from "./threadCache.js";

clearThreadCache();

writeThreadCache("user-a", "conv-1", {
  messages: [{ id: "m1", role: "user", content: "hi" }],
  conversation: { id: "conv-1", title: "Hello" },
});

assert.equal(readThreadCache("user-a", "conv-1")?.messages[0].id, "m1");
assert.equal(peekThreadCache("conv-1")?.conversation.title, "Hello");
assert.equal(readThreadCache("user-b", "conv-1"), null);

dropThreadCache("user-a", "conv-1");
assert.equal(readThreadCache("user-a", "conv-1"), null);

writeThreadCache("user-a", "conv-2", {
  messages: [{ id: "m2" }],
  conversation: { id: "conv-2" },
});
clearThreadCache();
assert.equal(peekThreadCache("conv-2"), null);

console.log("threadCache.selftest.mjs: ok");
