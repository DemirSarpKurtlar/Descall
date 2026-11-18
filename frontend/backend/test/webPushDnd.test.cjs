"use strict";
// Regression (polish scan 17 Nov 2026, world-social-11): Rahatsız etme silenced iOS alerts
// only; Web Push and Android (FCM) still delivered every DM and friend request.
process.env.NODE_ENV = "test";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder";
const path = require("path");
const assert = require("assert");
const B = path.join(__dirname, "..");
const { createFakeSupabase } = require("./fakeSupabase.cjs");
const fake = createFakeSupabase({
  users: [
    { id: "u-online", presence_status: "online" },
    { id: "u-dnd", presence_status: "dnd" },
    { id: "u-none" },
  ],
});
const sp = require.resolve(path.join(B, "db/supabase"));
require.cache[sp] = { id: sp, filename: sp, loaded: true, exports: fake };
const { withoutDndRecipients } = require(path.join(B, "lib/webPush"));

(async () => {
  const all = ["u-online", "u-dnd", "u-none"];
  assert.deepStrictEqual(await withoutDndRecipients(all, { type: "dm" }), ["u-online", "u-none"], "dm skips DND");
  assert.deepStrictEqual(await withoutDndRecipients(all, { type: "friend-request" }), ["u-online", "u-none"], "friend request skips DND");
  assert.deepStrictEqual(await withoutDndRecipients(all, { type: "call" }), all, "calls still ring");
  assert.deepStrictEqual(await withoutDndRecipients(all, { type: "group-call" }), all, "group calls still ring");
  assert.deepStrictEqual(await withoutDndRecipients(all, { type: "call-ring-ended" }), all, "ring ended still clears");
  assert.deepStrictEqual(await withoutDndRecipients([], { type: "dm" }), []);
  console.log("webPushDnd test ok");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
