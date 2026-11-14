"use strict";

/**
 * Account-ban state sync (lib/moderation.js): paginated load (> 1000 banned
 * rows), a failed reload keeps the last good state, a failed first load retries
 * with backoff instead of failing open silently, and a reload never undoes a
 * ban this process made while the read was in flight.
 */

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";

const { createFakeSupabase } = require("./fakeSupabase.cjs");

const later = new Date(Date.now() + 86400000).toISOString();
const earlier = new Date(Date.now() - 60000).toISOString();
const users = [];
for (let i = 0; i < 2350; i += 1) {
  users.push({ id: `u-${String(i).padStart(5, "0")}`, username: `user${i}`, is_banned: true, ban_category: "spam", ban_reason: "Spam", banned_at: earlier, ban_expires_at: i % 2 ? later : null });
}
users.push({ id: "u-expired", username: "expired", is_banned: true, ban_category: "spam", banned_at: earlier, ban_expires_at: earlier });
users.push({ id: "u-free", username: "free", is_banned: false });

const fake = createFakeSupabase({ users });
let failUsers = false;
const realFrom = fake.from.bind(fake);
fake.from = (name) => {
  if (failUsers && name === "users") {
    const q = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "then") return (resolve) => resolve({ data: null, error: { message: "connection reset" } });
          return () => q;
        },
      }
    );
    return q;
  }
  return realFrom(name);
};
const supabasePath = require.resolve("../db/supabase");
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };

const moderation = require("../lib/moderation");
const state = require("../runtime/sharedState");

function assert(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
}

async function run() {
  const errors = [];
  const origError = console.error;
  console.error = (...args) => errors.push(args.join(" "));
  try {
    // First load fails: loud log, backoff retry scheduled, nothing pretends to be loaded.
    failUsers = true;
    let ok = await moderation.loadModerationStateFromDb();
    assert(ok === false && !moderation.syncStatus().loadedOnce, "first load failure reported");
    assert(moderation.syncStatus().retryDelayMs === 5000, "retry in 5 s");
    assert(errors.some((e) => /CRITICAL/.test(e) && /NOT enforced/.test(e)), "loud log on first-load failure");
    ok = await moderation.loadModerationStateFromDb();
    assert(moderation.syncStatus().retryDelayMs === 10000, "backoff doubles");
    moderation.stopModerationSync();

    // Paginated load: every banned row, expired ones dropped (and cleared in the DB).
    failUsers = false;
    ok = await moderation.loadModerationStateFromDb();
    assert(ok === true && moderation.syncStatus().loadedOnce, "load succeeds");
    assert(state.bannedUserIds.size === 2350, `all 2350 bans loaded across pages, got ${state.bannedUserIds.size}`);
    assert(moderation.isBanned("u-02349") && moderation.isBanned("u-00000"), "first and last page");
    assert(!moderation.isBanned("u-expired") && !moderation.isBanned("u-free"), "expired / free not banned");
    assert(fake._tables.users.rows.find((u) => u.id === "u-expired").is_banned === false, "expired ban cleared in DB");

    // A failed reload keeps the last good state (no fail-open).
    failUsers = true;
    ok = await moderation.loadModerationStateFromDb();
    assert(ok === false && state.bannedUserIds.size === 2350, "failed reload keeps every ban");
    failUsers = false;

    // A ban made locally while a reload is in flight survives that reload.
    const target = fake._tables.users.rows.find((u) => u.id === "u-free");
    const pending = moderation.reloadModerationState();
    await moderation.applyBan({ targetUserId: "u-free", actorUserId: null, category: "spam", presetId: "permanent" });
    await pending;
    assert(moderation.isBanned("u-free") && target.is_banned, "local ban not undone by a concurrent reload");

    // Unban + periodic sync start / stop.
    await moderation.revokeBan({ targetUserId: "u-free", actorUserId: null });
    assert(!moderation.isBanned("u-free"), "unban");
    await moderation.startModerationSync({ intervalMs: 60_000 });
    moderation.stopModerationSync();
  } finally {
    console.error = origError;
    moderation.stopModerationSync();
  }
  console.log("moderationSync.integration.test: ok");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
