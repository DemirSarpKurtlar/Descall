"use strict";

/**
 * Table access for Market 2.0. `await db.ready()` probes the shop2 tables (cached 60 s); after
 * that `db.from(name)` is the real supabase table when it exists, or the in-memory fallback
 * (lib/shop2/memdb.js) while the migration is not applied. Wallet, ledger, inventory and
 * users always go to the real client (`db.real()`).
 */

const { createMemDb } = require("./memdb");

const TABLES = [
  "shop2_rule_versions",
  "shop2_settings",
  "shop2_storefronts",
  "shop2_user_state",
  "shop2_purchases",
  "shop2_set_locks",
  "shop2_sets",
  "shop2_price_points",
  "shop2_night_markets",
  "shop2_night_flips",
  "shop2_gifts",
  "shop2_gift_flags",
  "shop2_actions",
  "shop2_outfits",
  "shop2_wishlist",
  "shop2_set_completions",
  "shop2_ab_tests",
  "shop2_ab_exposures",
  "shop2_queue",
  "shop2_events",
];

const PROBE_MS = 60_000;
const mem = createMemDb();
const missing = new Map(); // name -> boolean
let probedAt = 0;
let probing = null;
let clientOverride = null;

function real() {
  return clientOverride || require("../../db/supabase");
}

function isMissing(err) {
  if (!err) return false;
  const code = String(err.code || "");
  const msg = String(err.message || err);
  return code === "PGRST205" || code === "42P01" || code === "PGRST202" || /does not exist|schema cache|Could not find the (table|function)/i.test(msg);
}

function isMissingColumn(err) {
  if (!err) return false;
  return String(err.code || "") === "42703" || /column .* does not exist|Could not find the '.*' column/i.test(String(err.message || ""));
}

async function probeAll() {
  const client = real();
  await Promise.all(
    TABLES.map(async (name) => {
      try {
        const { error } = await client.from(name).select("*").limit(1);
        missing.set(name, Boolean(error && isMissing(error)));
      } catch (err) {
        missing.set(name, isMissing(err));
      }
    })
  );
  probedAt = Date.now();
}

async function ready() {
  if (Date.now() - probedAt < PROBE_MS) return;
  if (!probing) probing = probeAll().finally(() => (probing = null));
  await probing;
}

function installed(name) {
  return missing.get(name) === false;
}

/** All shop2 tables present (the migration is applied). */
function migrated() {
  return TABLES.every((t) => missing.get(t) === false);
}

function from(name) {
  if (!TABLES.includes(name)) return real().from(name);
  return missing.get(name) === true ? mem.from(name) : real().from(name);
}

/** data of a query or throw its error. */
async function rows(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function one(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data || null;
}

function __setClientForTests(client) {
  clientOverride = client;
  probedAt = 0;
  missing.clear();
  mem.reset();
}

module.exports = { TABLES, ready, from, real, rows, one, installed, migrated, isMissing, isMissingColumn, mem, __setClientForTests };
