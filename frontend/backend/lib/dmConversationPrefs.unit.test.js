"use strict";

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";

const assert = require("assert");
const { isUuid, toPublicPref, mergePrefPatch } = require("./dmConversationPrefs");

assert.equal(isUuid("3f1c0a2e-4b5d-6789-abcd-ef0123456789"), true);
assert.equal(isUuid("not-a-uuid"), false);
assert.equal(isUuid(""), false);

const empty = toPublicPref(null, "peer-1");
assert.equal(empty.peerId, "peer-1");
assert.equal(empty.pinned, false);
assert.equal(empty.muted, false);
assert.equal(empty.hidden, false);
assert.equal(empty.markedUnread, false);

const fromRow = toPublicPref({
  peer_id: "abc",
  pinned: true,
  muted: 1,
  hidden: false,
  marked_unread: true,
  pinned_at: "2026-01-01T00:00:00.000Z",
});
assert.equal(fromRow.peerId, "abc");
assert.equal(fromRow.pinned, true);
assert.equal(fromRow.muted, true);
assert.equal(fromRow.markedUnread, true);
assert.equal(fromRow.pinnedAt, "2026-01-01T00:00:00.000Z");

const now = "2026-08-26T00:00:00.000Z";
const pinned = mergePrefPatch(null, { pinned: true, now });
assert.equal(pinned.pinned, true);
assert.equal(pinned.hidden, false);
assert.equal(pinned.pinned_at, now);

const stillPinned = mergePrefPatch(
  { pinned: true, pinned_at: "2026-01-01T00:00:00.000Z", muted: false, hidden: false, marked_unread: false },
  { muted: true, now: "2026-08-26T12:00:00.000Z" },
);
assert.equal(stillPinned.pinned, true);
assert.equal(stillPinned.pinned_at, "2026-01-01T00:00:00.000Z");
assert.equal(stillPinned.muted, true);

const closed = mergePrefPatch(
  { pinned: true, pinned_at: now, muted: false, hidden: false, marked_unread: false },
  { hidden: true, now },
);
assert.equal(closed.hidden, true);
assert.equal(closed.pinned, false);
assert.equal(closed.pinned_at, null);

const pinClosed = mergePrefPatch(
  { pinned: false, muted: false, hidden: true, marked_unread: false, pinned_at: null },
  { pinned: true, now },
);
assert.equal(pinClosed.pinned, true);
assert.equal(pinClosed.hidden, false);

console.log("dmConversationPrefs.unit.test.js: ok");
