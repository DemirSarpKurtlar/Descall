"use strict";

/**
 * Database side of the 3D world cosmetics (supabase/migrations/20261106_world_cosmetics.sql).
 * Service role only. Every function maps "migration not applied yet" to a typed error
 * (code WORLD_COSMETICS_UNAVAILABLE) so callers can fall back to the default look.
 */

function db() {
  return require("../../db/supabase");
}

function missingSchema(error) {
  const msg = String(error?.message || "");
  return error?.code === "42P01" || error?.code === "42883" || error?.code === "PGRST202" || error?.code === "PGRST205" ||
    /does not exist|schema cache|could not find the function/i.test(msg);
}

function fail(error) {
  if (missingSchema(error)) {
    const err = new Error("WORLD_COSMETICS_UNAVAILABLE");
    err.code = "WORLD_COSMETICS_UNAVAILABLE";
    throw err;
  }
  throw error;
}

async function loadOwned(userId) {
  const { data, error } = await db().from("world_cosmetic_inventory").select("item_id").eq("user_id", userId);
  if (error) fail(error);
  return new Set((data || []).map((r) => r.item_id));
}

async function loadLook(userId) {
  const { data, error } = await db().from("world_avatar_looks").select("look").eq("user_id", userId).maybeSingle();
  if (error) fail(error);
  return data?.look || null;
}

async function saveLook(userId, look) {
  const { data, error } = await db().rpc("world_look_save", { p_user_id: userId, p_look: look });
  if (error) fail(error);
  return data;
}

/** items: [{ id, price }] priced by the server catalog. */
async function purchase(userId, requestId, items) {
  const { data, error } = await db().rpc("world_cosmetics_purchase", { p_user_id: userId, p_request_id: requestId, p_items: items });
  if (error) fail(error);
  return data;
}

async function balance(userId) {
  return require("../descoin").getBalance(userId);
}

module.exports = { loadOwned, loadLook, saveLook, purchase, balance, missingSchema };
