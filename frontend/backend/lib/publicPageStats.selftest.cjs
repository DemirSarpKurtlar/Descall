"use strict";

/**
 * lib/publicPageStats.js: buffered page counters flushed through the atomic RPC, view
 * de-duplication per visitor, unknown sources folded into "other", and a missing
 * migration (RPC error) that drops counters instead of throwing.
 * Run: node frontend/backend/lib/publicPageStats.selftest.cjs
 */

const assert = require("node:assert/strict");
const { createPublicPageStats, VIEW_DEDUPE_MS } = require("./publicPageStats");

(async () => {
  const calls = [];
  let fail = false;
  const supabase = {
    rpc: async (name, args) => {
      calls.push({ name, args });
      return fail ? { error: { message: "function server_public_page_bump does not exist" } } : { error: null };
    },
  };
  let t = Date.parse("2026-11-24T10:00:00Z");
  const stats = createPublicPageStats({ supabase, now: () => t, autoFlush: false });

  assert.equal(stats.view("srv", "google", { ip: "1.1.1.1", ua: "A" }), true);
  assert.equal(stats.view("srv", "google", { ip: "1.1.1.1", ua: "A" }), false, "same visitor within 30 min");
  assert.equal(stats.view("srv", "google", { ip: "2.2.2.2", ua: "A" }), true);
  t += VIEW_DEDUPE_MS + 1;
  assert.equal(stats.view("srv", "google", { ip: "1.1.1.1", ua: "A" }), true, "counted again later");
  stats.add("srv", "whatsapp", "join_clicks");
  stats.add("srv", "whatsapp", "joins");
  stats.add("srv", "nonsense", "joins");
  assert.equal(stats.add("srv", "google", "bogus"), false);
  assert.equal(stats.pendingSize(), 3);

  await stats.flush();
  assert.equal(stats.pendingSize(), 0);
  assert.equal(calls.length, 3);
  assert.ok(calls.every((c) => c.name === "server_public_page_bump"));
  const g = calls.find((c) => c.args.p_source === "google");
  assert.deepEqual(g.args, { p_server: "srv", p_day: "2026-11-24", p_source: "google", p_views: 3, p_join_clicks: 0, p_joins: 0 });
  const w = calls.find((c) => c.args.p_source === "whatsapp");
  assert.equal(w.args.p_join_clicks, 1);
  assert.equal(w.args.p_joins, 1);
  assert.ok(calls.some((c) => c.args.p_source === "other"), "unknown source folded into other");

  fail = true;
  stats.add("srv", "google", "joins");
  await stats.flush();
  assert.equal(stats.pendingSize(), 0, "a failing RPC drops the batch instead of growing forever");

  console.log("publicPageStats selftest ok");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
