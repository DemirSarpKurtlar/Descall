"use strict";

/**
 * "Mesaj önizlemesi" for server-sent pushes (messaging phase 5).
 *
 * users.push_preview (default on, supabase/migrations/20261109_push_preview.sql).
 * Off: web push, Android (FCM) and iOS alert pushes for messages carry no
 * message text, no picture thumbnail and no thread preview; the card reads
 * "Yeni mesaj" (or "seni andı" for a mention). The sender's name stays.
 * The app keeps hiding text on this device's own cards as before.
 *
 * Before the migration everyone counts as "on" and saving answers 503 not_ready.
 */

const { isMissingColumn } = require("./forwardedMessage");

const TTL_MS = 60 * 1000;
const CHUNK = 150;
const cache = new Map(); // userId -> { on, at }
let columnMissing = false;

function db() {
  return require("../db/supabase");
}

/** Set of `userIds` whose push previews are off. Never throws (unknown = on). */
async function hiddenSet(userIds, { now = Date.now(), getDb = db } = {}) {
  const ids = [...new Set((userIds || []).filter(Boolean).map(String))];
  const out = new Set();
  if (!ids.length || columnMissing) return out;
  const ask = [];
  for (const id of ids) {
    const hit = cache.get(id);
    if (hit && now - hit.at < TTL_MS) {
      if (!hit.on) out.add(id);
    } else ask.push(id);
  }
  for (let i = 0; i < ask.length; i += CHUNK) {
    const part = ask.slice(i, i + CHUNK);
    try {
      const { data, error } = await getDb().from("users").select("id, push_preview").in("id", part);
      if (error) {
        if (isMissingColumn(error, "push_preview")) columnMissing = true;
        return out;
      }
      for (const row of data || []) {
        const on = row?.push_preview !== false;
        cache.set(String(row.id), { on, at: now });
        if (!on) out.add(String(row.id));
      }
    } catch {
      return out;
    }
  }
  return out;
}

/** Whether `userId` wants message text in pushes (true when unknown). */
async function previewEnabled(userId, opts) {
  if (!userId) return true;
  return !(await hiddenSet([userId], opts)).has(String(userId));
}

/** { show, hide } split of `userIds`. */
async function splitByPreview(userIds, opts) {
  const ids = [...new Set((userIds || []).filter(Boolean).map(String))];
  const hidden = await hiddenSet(ids, opts);
  return { show: ids.filter((id) => !hidden.has(id)), hide: ids.filter((id) => hidden.has(id)) };
}

async function setPreviewEnabled(userId, on, { getDb = db } = {}) {
  const { error } = await getDb().from("users").update({ push_preview: Boolean(on) }).eq("id", userId);
  if (error) {
    if (isMissingColumn(error, "push_preview")) {
      columnMissing = true;
      return { ok: false, error: "not_ready" };
    }
    return { ok: false, error: "failed" };
  }
  cache.set(String(userId), { on: Boolean(on), at: Date.now() });
  return { ok: true, enabled: Boolean(on) };
}

/**
 * A message push payload without its text: no body / text / preview, plain
 * "text" kind (so no picture thumbnail is looked up), no inline media.
 */
function stripPreview(payload = {}) {
  const out = { ...payload, body: "", text: "", rawText: "", preview: "", previewKind: "text" };
  delete out.mediaThumbUrl;
  delete out.mediaKind;
  if (out.i18n && out.i18n.body) {
    const i18n = { ...out.i18n };
    delete i18n.body;
    out.i18n = i18n;
  }
  return out;
}

/** False once the push_preview column turned out to be missing (migration not applied). */
function isReady() {
  return !columnMissing;
}

/** The stored switch for the settings screen: { enabled, ready } (ready false when it could not be read). */
async function readSetting(userId, { getDb = db } = {}) {
  if (columnMissing) return { enabled: true, ready: false };
  try {
    const { data, error } = await getDb().from("users").select("push_preview").eq("id", userId).maybeSingle();
    if (error) {
      if (isMissingColumn(error, "push_preview")) columnMissing = true;
      return { enabled: true, ready: false };
    }
    const enabled = data?.push_preview !== false;
    cache.set(String(userId), { on: enabled, at: Date.now() });
    return { enabled, ready: Boolean(data) };
  } catch {
    return { enabled: true, ready: false };
  }
}

function __resetPushPreview() {
  cache.clear();
  columnMissing = false;
}

module.exports = { isReady, readSetting, hiddenSet, previewEnabled, splitByPreview, setPreviewEnabled, stripPreview, __resetPushPreview };
