"use strict";

/**
 * Localized server content (draft C): reads of the opt-in flag and the translation rows
 * (supabase/migrations/20261128a_server_content_l10n.sql), cached per server for a
 * minute and cleared on every admin save and channel / message edit (all nodes).
 *
 * Fails open: before the migration, or when a read fails, nothing is localized and
 * every endpoint answers exactly as before.
 */

const { selectAllIn } = require("../serverPermissions");

const TTL_MS = 60 * 1000;
const NEG_TTL_MS = 5 * 60 * 1000;
const cache = new Map(); // serverId -> { at, bundle|null }
let enabledIds = null; // { at, set }
let dbOverride = null;
const db = () => dbOverride || require("../../db/supabase");

function isMissingTable(error) {
  const code = String(error?.code || "");
  const msg = String(error?.message || "");
  return code === "PGRST205" || code === "42P01" || /server_content_(l10n|translations)/.test(msg) && /does not exist|schema cache|not find/i.test(msg);
}

/** Ids of the opted-in servers (cached; one tiny table). */
async function enabledServerIds() {
  if (enabledIds && Date.now() - enabledIds.at < TTL_MS) return enabledIds.set;
  try {
    const { data, error } = await db().from("server_content_l10n").select("server_id, enabled").eq("enabled", true);
    if (error) throw error;
    enabledIds = { at: Date.now(), set: new Set((data || []).map((r) => String(r.server_id))) };
  } catch (err) {
    if (!isMissingTable(err)) console.warn("[serverL10n] opt-in read failed:", err?.message || err);
    enabledIds = { at: Date.now() - TTL_MS + (isMissingTable(err) ? NEG_TTL_MS : 10_000), set: new Set() };
  }
  return enabledIds.set;
}

/**
 * Everything needed to localize one opted-in server: settings, translation rows, the
 * channel list (for mentions) and the originals of the translated messages.
 * Returns null for a server that did not opt in.
 */
async function loadBundle(serverId) {
  const id = String(serverId || "");
  if (!id) return null;
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.bundle;
  const ids = await enabledServerIds();
  if (!ids.has(id)) {
    cache.set(id, { at: Date.now(), bundle: null });
    return null;
  }
  try {
    const [settingsRes, rows, channelsRes] = await Promise.all([
      db().from("server_content_l10n").select("server_id, enabled, source_locale, updated_at").eq("server_id", id).maybeSingle(),
      selectAllIn(db(), "server_content_translations", "id, server_id, kind, ref_id, locale, text, source_text, updated_at, updated_by_username", (q) => q.order("id", { ascending: true }), "server_id", [id]),
      db().from("server_channels").select("id, server_id, name, type, topic, parent_id, position").eq("server_id", id),
    ]);
    if (settingsRes.error) throw settingsRes.error;
    if (channelsRes.error) throw channelsRes.error;
    const settings = settingsRes.data;
    if (!settings?.enabled) {
      cache.set(id, { at: Date.now(), bundle: null });
      return null;
    }
    const messageIds = [...new Set(rows.filter((r) => r.kind === "message").map((r) => String(r.ref_id)))];
    let messages = [];
    if (messageIds.length) {
      messages = await selectAllIn(
        db(),
        "server_messages",
        "id, server_id, channel_id, content, edited_at, pinned_at, created_at",
        (q) => q.eq("server_id", id).order("id", { ascending: true }),
        "id",
        messageIds
      );
    }
    const bundle = { settings, rows, channels: channelsRes.data || [], messages };
    cache.set(id, { at: Date.now(), bundle });
    return bundle;
  } catch (err) {
    if (!isMissingTable(err)) console.warn("[serverL10n] load failed:", err?.message || err);
    cache.set(id, { at: Date.now() - TTL_MS + 10_000, bundle: null });
    return null;
  }
}

/** Bundles of the opted-in servers among `serverIds` (Map id -> bundle). */
async function loadBundles(serverIds) {
  const out = new Map();
  const ids = await enabledServerIds();
  const want = [...new Set((serverIds || []).map(String))].filter((id) => ids.has(id));
  await Promise.all(want.map(async (id) => {
    const b = await loadBundle(id);
    if (b) out.set(id, b);
  }));
  return out;
}

function fold(text) {
  return String(text || "").toLocaleLowerCase("tr").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ı/g, "i");
}

/** Opted-in servers whose name in some language contains `q` (server search). */
async function serversNamed(q) {
  const needle = fold(q).trim();
  if (needle.length < 2) return [];
  const ids = [...(await enabledServerIds())];
  const out = [];
  for (const id of ids) {
    const b = await loadBundle(id);
    if (b && b.rows.some((r) => r.kind === "server_name" && fold(r.text).includes(needle))) out.push(id);
  }
  return out;
}

function invalidateLocal(serverId) {
  if (serverId) cache.delete(String(serverId));
  else cache.clear();
  enabledIds = null;
}

const invalidate = require("../cluster").linkInvalidate("serverL10n", invalidateLocal);

/**
 * Hot paths (message edits, channel updates): clear only when the server is localized,
 * so ordinary servers never send a cluster-wide invalidation.
 */
function invalidateIfLocalized(serverId) {
  const id = String(serverId || "");
  if (!id) return;
  if (enabledIds && Date.now() - enabledIds.at < TTL_MS && !enabledIds.set.has(id)) return;
  invalidate(id);
}

function __setDbForTests(client) {
  dbOverride = client;
  invalidateLocal();
}

module.exports = { enabledServerIds, loadBundle, loadBundles, serversNamed, invalidate, invalidateIfLocalized, isMissingTable, __setDbForTests };
