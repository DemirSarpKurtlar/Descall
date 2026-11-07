"use strict";

/**
 * The expanded notification and the Apple Watch thread for a server channel show role
 * mentions as "@Rol adı", never the stored <@&roleId> token.
 *   node frontend/backend/test/channelThreadRoles.unit.test.cjs
 */

process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";

const assert = require("node:assert/strict");
const { createFakeSupabase } = require("./fakeSupabase.cjs");
const { createNotifyActions } = require("../lib/notifyActions");

const ROLE = "11111111-1111-4111-8111-111111111111";
const GONE = "22222222-2222-4222-8222-222222222222";

const fake = createFakeSupabase({
  users: [{ id: "u-me", username: "demir" }, { id: "u-mod", username: "mod", display_name: "Mod" }],
  servers: [{ id: "s-1", name: "Sunucu" }],
  server_roles: [{ id: ROLE, server_id: "s-1", name: "Tasarım" }],
  server_messages: [
    { id: "m-1", channel_id: "c-1", sender_id: "u-mod", content: `<@&${ROLE}> yeni logoya bakın`, created_at: "2026-11-07T10:00:00Z" },
    { id: "m-2", channel_id: "c-1", sender_id: "u-mod", content: `eski rol <@&${GONE}>`, created_at: "2026-11-07T10:01:00Z" },
  ],
});

const actions = createNotifyActions({
  getDb: () => fake,
  state: { bannedUserIds: new Set() },
  assertTextChannelAccess: async () => ({ channel: { id: "c-1", server_id: "s-1", name: "genel" }, permissions: -1n }),
  serverPermissions: { Permissions: { VIEW_CHANNEL: 1n, READ_MESSAGE_HISTORY: 2n }, hasPermission: () => true },
  maskProfanity: (s) => s,
});

(async () => {
  const out = await actions.thread("u-me", { conv: "channel:c-1" });
  const texts = out.messages.map((m) => m.text);
  assert.deepEqual(texts, ["@Tasarım yeni logoya bakın", "eski rol @rol"], "tokens become role names (unknown -> @rol)");
  assert.ok(texts.every((t) => !t.includes("<@&")), "no raw tokens");
  console.log("channelThreadRoles unit test OK");
})().catch((err) => { console.error(err); process.exit(1); });
