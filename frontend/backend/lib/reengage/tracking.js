"use strict";

/**
 * Growth 3B "Ölçüm": what happened after a re-engagement message.
 *
 *  - delivered: the web service worker posts a signed token when the push arrives
 *    (iOS / e-mail: the provider accepted it).
 *  - opened: the app reports the tapped push (signed in, by kind) or the e-mail link
 *    redirects through a signed token.
 *  - returned: the person was active within 48 h of the message (D7-absent returning
 *    within 48 h is the headline number); return_kind upgrades from "opened_app" to
 *    "voice" / "message" when they joined voice or wrote.
 *  - first message: the share of returners whose first action was writing to someone,
 *    so the activation number (first message rate) is visible next to it.
 *
 * Control group rows (holdout = true) are measured the same way, so the console shows
 * the net effect. The live window gets each returner as it happens (admin socket room).
 */

const R = require("./rules");
const store = require("./store");

const WINDOW_MS = R.WINBACK.measureWindowMs; // 48 h
const COLS = "id, user_id, kind, campaign, wave_id, sent_at, opened_at, returned_at, return_kind, holdout, recalled_at";
const seen = new Map(); // userId -> last note (requests)

function isMissing(error) {
  return store.isMissing(error);
}

async function openRows(userId, now) {
  const { data, error } = await store
    .db()
    .from("lifecycle_messages")
    .select(COLS)
    .eq("user_id", userId)
    .gte("sent_at", new Date(now - WINDOW_MS).toISOString())
    .limit(20);
  if (error) return isMissing(error) ? null : [];
  return (data || []).filter((r) => r.campaign);
}

function emitAdmin(event, payload) {
  try {
    require("./io").getIo()?.to?.("admin")?.emit?.(event, payload);
  } catch {
    /* live view only */
  }
}

const RANK = { opened_app: 1, voice: 2, message: 2 };

/**
 * Activity of `userId`: kind "request" (any signed-in call), "voice" (joined voice /
 * heartbeat), "message" (wrote to someone). Returns how many rows changed.
 */
async function noteActive(userId, { kind = "request", detail = null, now = Date.now() } = {}) {
  if (!userId) return 0;
  if (kind === "request") {
    const prev = seen.get(userId) || 0;
    if (now - prev < 60_000) return 0;
    seen.set(userId, now);
    if (seen.size > 50000) seen.clear();
  }
  const rows = await openRows(userId, now);
  if (!rows || !rows.length) return 0;
  const want = kind === "request" ? "opened_app" : kind;
  let changed = 0;
  for (const r of rows) {
    if (r.recalled_at && !r.opened_at) continue;
    if (r.returned_at && (RANK[r.return_kind] || 0) >= (RANK[want] || 0)) continue;
    const patch = { return_kind: want };
    if (!r.returned_at) patch.returned_at = new Date(now).toISOString();
    let q = store.db().from("lifecycle_messages").update(patch).eq("id", r.id);
    q = r.returned_at ? q.eq("return_kind", r.return_kind) : q.is("returned_at", null);
    const { error } = await q;
    if (error) continue;
    changed += 1;
    if (!r.holdout && r.wave_id) {
      let who = null;
      try {
        const { data } = await store.db().from("users").select("username, display_name, avatar_url").eq("id", userId).maybeSingle();
        who = data ? { name: data.display_name || data.username, avatarUrl: data.avatar_url || null } : null;
      } catch {
        who = null;
      }
      emitAdmin("rg:returner", { waveId: r.wave_id, campaign: r.campaign, userId, user: who, kind: want, detail, at: new Date(now).toISOString() });
    }
  }
  return changed;
}

/** The app reports a tapped push (by its kind) for the signed-in account. */
async function markOpened(userId, kind, { now = Date.now() } = {}) {
  if (!userId || !kind || String(kind).length > 64) return false;
  const { data, error } = await store
    .db()
    .from("lifecycle_messages")
    .update({ opened_at: new Date(now).toISOString() })
    .eq("user_id", userId)
    .eq("kind", String(kind))
    .is("opened_at", null)
    .select("id, wave_id");
  if (error) return false;
  const row = Array.isArray(data) ? data[0] : data;
  if (row?.wave_id) emitAdmin("rg:opened", { waveId: row.wave_id });
  return Boolean(row);
}

/** Signed token from a push (delivered) or an e-mail link (opened). */
async function markByToken(token, what, { now = Date.now(), env = process.env } = {}) {
  const t = R.verifyTrack(token, env);
  if (!t) return null;
  const col = what === "delivered" ? "delivered_at" : "opened_at";
  const { data, error } = await store
    .db()
    .from("lifecycle_messages")
    .update({ [col]: new Date(now).toISOString() })
    .eq("user_id", t.userId)
    .eq("kind", t.kind)
    .is(col, null)
    .select("id, wave_id");
  if (error) return t;
  const row = Array.isArray(data) ? data[0] : data;
  if (row?.wave_id) emitAdmin(what === "delivered" ? "rg:delivered" : "rg:opened", { waveId: row.wave_id });
  return t;
}

/**
 * Headline numbers for the console's Sonuçlar tab and Elde tutma:
 *  - d7Return48h: share of day-7 absentees messaged (inactive7 + friend_call) who came
 *    back within 48 h, by source (friend call vs system message), and the control group
 *  - firstMessageRate: share of returners whose return included writing to someone.
 */
function outcomes(rows = []) {
  const real = rows.filter((r) => !r.holdout);
  const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);
  const by = (pred) => {
    const list = real.filter(pred);
    return { n: list.length, returned: list.filter((r) => r.returned_at).length, rate: pct(list.filter((r) => r.returned_at).length, list.length) };
  };
  const d7 = (r) => r.campaign === "inactive7" || r.campaign === "friend_call";
  const ctrl = rows.filter((r) => r.holdout && r.campaign === "inactive7");
  const returners = real.filter((r) => r.returned_at);
  return {
    d7Return48h: {
      all: by(d7),
      friendCall: by((r) => r.campaign === "friend_call"),
      system: by((r) => r.campaign === "inactive7"),
      control: { n: ctrl.length, returned: ctrl.filter((r) => r.returned_at).length, rate: pct(ctrl.filter((r) => r.returned_at).length, ctrl.length) },
      target: 18,
    },
    firstMessageRate: { returners: returners.length, wrote: returners.filter((r) => r.return_kind === "message").length, rate: pct(returners.filter((r) => r.return_kind === "message").length, returners.length) },
  };
}

function __reset() {
  seen.clear();
}

module.exports = { WINDOW_MS, noteActive, markOpened, markByToken, outcomes, __reset };
