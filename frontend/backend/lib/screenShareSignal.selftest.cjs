const assert = require("node:assert/strict");
const { sanitizeScreenAnnouncement } = require("./screenShareSignal");

assert.deepEqual(
  sanitizeScreenAnnouncement({ streamId: "abc", videoMid: "1", audioMid: "2", junk: "no" }),
  { v: 1, streamId: "abc", videoMid: "1", audioMid: "2" }
);
assert.equal(sanitizeScreenAnnouncement(null), null);
assert.equal(sanitizeScreenAnnouncement({ streamId: "" }), null);
assert.equal(sanitizeScreenAnnouncement({ streamId: "x".repeat(200) }).streamId.length, 128);

console.log("screenShareSignal.selftest ok");
