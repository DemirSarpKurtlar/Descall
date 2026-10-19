"use strict";

/**
 * Scheduled maintenance windows (admin "Bakım" tab).
 *
 * Rows live in public.maintenance_windows, every admin action in
 * public.maintenance_audit (supabase/migrations/20261019_maintenance_windows.sql).
 * Status is derived from the timestamps, never stored:
 *   cancelled_at  → "cancelled"   (İptal)
 *   ended_at / now ≥ ends_at → "completed" (Tamamlandı)
 *   now ≥ starts_at → "active"   (Aktif)
 *   otherwise      → "scheduled" (Planlandı)
 * The pure helpers below are shared by the routes, the ticker and the tests.
 */

const PLATFORMS = ["web", "electron", "ios", "android"];
const KINDS = ["planned", "emergency"];
const ANNOUNCE_OPTIONS = [15, 30, 60, 120, 360, 1440];
const MAX_MESSAGE = 600;
const MAX_TITLE = 80;
const MAX_REASON = 300;
const MAX_WINDOW_MS = 7 * 24 * 3600_000;
const MAX_EXTEND_MIN = 24 * 60;

function ms(v) {
  if (v == null || v === "") return NaN;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : NaN;
}

function statusOf(row, now = Date.now()) {
  if (!row) return null;
  if (row.cancelled_at) return "cancelled";
  const end = ms(row.ended_at) || ms(row.ends_at);
  if (row.ended_at || now >= ms(row.ends_at)) return "completed";
  if (now >= ms(row.starts_at)) return "active";
  void end;
  return "scheduled";
}

/** Real downtime in ms: only for windows that started and were not cancelled before starting. */
function downtimeMs(row, now = Date.now()) {
  const st = statusOf(row, now);
  const start = ms(row.starts_at);
  if (st === "scheduled" || !Number.isFinite(start)) return 0;
  if (st === "cancelled") {
    const c = ms(row.cancelled_at);
    return Number.isFinite(c) && c > start ? Math.min(c, ms(row.ends_at)) - start : 0;
  }
  const end = st === "active" ? now : Math.min(ms(row.ended_at) || Infinity, ms(row.ends_at));
  return Math.max(0, end - start);
}

function cleanText(v, max) {
  return String(v ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim()
    .slice(0, max);
}

/**
 * Validate an admin create / update body. `existing` is the stored row on
 * update (fields not sent keep their value). Returns { ok, value } or { ok:false, code }.
 */
function validateInput(body = {}, { existing = null, now = Date.now() } = {}) {
  const pick = (k, fallback) => (body[k] !== undefined ? body[k] : fallback);
  const startsAt = ms(pick("startsAt", existing?.starts_at));
  const endsAt = ms(pick("endsAt", existing?.ends_at));
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt)) return { ok: false, code: "invalid_dates" };
  if (endsAt <= startsAt) return { ok: false, code: "end_before_start" };
  if (endsAt - startsAt > MAX_WINDOW_MS) return { ok: false, code: "too_long" };
  const startChanged = !existing || startsAt !== ms(existing.starts_at);
  // A new or moved start may be "now" (emergency) but not in the past by more than a minute.
  if (startChanged && startsAt < now - 60_000 && !(existing && statusOf(existing, now) === "active"))
    return { ok: false, code: "start_in_past" };
  if (endsAt <= now) return { ok: false, code: "end_in_past" };

  const kind = String(pick("kind", existing?.kind ?? "planned"));
  if (!KINDS.includes(kind)) return { ok: false, code: "invalid_kind" };

  const rawPlatforms = pick("platforms", existing?.platforms ?? PLATFORMS);
  if (!Array.isArray(rawPlatforms)) return { ok: false, code: "invalid_platforms" };
  const platforms = PLATFORMS.filter((p) => rawPlatforms.includes(p));
  if (!platforms.length) return { ok: false, code: "no_platforms" };

  const message = cleanText(pick("message", existing?.message), MAX_MESSAGE);
  if (!message) return { ok: false, code: "message_required" };
  const title = cleanText(pick("title", existing?.title), MAX_TITLE) || (kind === "emergency" ? "Acil bakım" : "Planlı bakım");

  let announce = pick("announceMinutes", existing ? existing.announce_minutes : 60);
  if (announce === null || announce === false || announce === 0) announce = null;
  else {
    announce = Number(announce);
    if (!ANNOUNCE_OPTIONS.includes(announce)) return { ok: false, code: "invalid_announce" };
  }

  return {
    ok: true,
    value: {
      title,
      message,
      kind,
      platforms,
      starts_at: new Date(startsAt).toISOString(),
      ends_at: new Date(endsAt).toISOString(),
      announce_minutes: announce,
      admins_bypass: Boolean(pick("adminsBypass", existing ? existing.admins_bypass : true)),
      notify_on_end: Boolean(pick("notifyOnEnd", existing ? existing.notify_on_end : false)),
    },
  };
}

function overlaps(a, b) {
  return ms(a.starts_at) < ms(b.ends_at) && ms(b.starts_at) < ms(a.ends_at);
}

/** Another open (scheduled/active) window overlapping `candidate`? */
function findOverlap(rows, candidate, { ignoreId = null, now = Date.now() } = {}) {
  return (rows || []).find(
    (r) => r.id !== ignoreId && ["scheduled", "active"].includes(statusOf(r, now)) && overlaps(r, candidate)
  ) || null;
}

/** The window users care about: the active one, else the next scheduled one. */
function currentWindow(rows, now = Date.now()) {
  const open = (rows || []).filter((r) => ["scheduled", "active"].includes(statusOf(r, now)));
  const active = open.find((r) => statusOf(r, now) === "active");
  if (active) return active;
  return open.sort((a, b) => ms(a.starts_at) - ms(b.starts_at))[0] || null;
}

/** What every client (signed in or not) may see. No admin names, no reasons. */
function publicView(row, now = Date.now()) {
  if (!row) return null;
  const status = statusOf(row, now);
  if (status !== "active" && status !== "scheduled") return null;
  const announceAt = row.announce_minutes ? ms(row.starts_at) - row.announce_minutes * 60_000 : null;
  if (status === "scheduled" && (announceAt == null || now < announceAt)) {
    // Not announced yet: the client only needs to know when to look again.
    return { id: row.id, status, announced: false, announceAt: announceAt ? new Date(announceAt).toISOString() : null, startsAt: row.starts_at };
  }
  return {
    id: row.id,
    status,
    announced: true,
    kind: row.kind,
    title: row.title,
    message: row.message,
    platforms: row.platforms || PLATFORMS,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    announceAt: announceAt ? new Date(announceAt).toISOString() : null,
    adminsBypass: Boolean(row.admins_bypass),
  };
}

function adminView(row, now = Date.now()) {
  if (!row) return null;
  return {
    id: row.id,
    seq: row.seq ?? null,
    title: row.title,
    message: row.message,
    kind: row.kind,
    platforms: row.platforms || [],
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    originalEndsAt: row.original_ends_at || null,
    announceMinutes: row.announce_minutes ?? null,
    adminsBypass: Boolean(row.admins_bypass),
    notifyOnEnd: Boolean(row.notify_on_end),
    status: statusOf(row, now),
    endedAt: row.ended_at || null,
    cancelledAt: row.cancelled_at || null,
    cancelReason: row.cancel_reason || null,
    cancelledByUsername: row.cancelled_by_username || null,
    createdByUsername: row.created_by_username || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    downtimeMs: downtimeMs(row, now),
  };
}

/** Istanbul (UTC+3, no DST since 2016) month bounds for "this month". */
function trtMonthStart(now = Date.now()) {
  const d = new Date(now + 3 * 3600_000);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - 3 * 3600_000;
}

/**
 * Summary cards. A card is left out (undefined) when there is no data for it,
 * never filled with a guess.
 */
function buildSummary(rows, { now = Date.now(), recentlyActiveUsers = null } = {}) {
  const cur = currentWindow(rows, now);
  const out = { systemStatus: cur && statusOf(cur, now) === "active" ? "maintenance" : "operational" };
  const next = (rows || [])
    .filter((r) => statusOf(r, now) === "scheduled")
    .sort((a, b) => ms(a.starts_at) - ms(b.starts_at))[0];
  if (next) out.nextStartsAt = next.starts_at;
  const monthStart = trtMonthStart(now);
  const thisMonth = (rows || []).filter((r) => ms(r.starts_at) >= monthStart && ms(r.starts_at) <= now && downtimeMs(r, now) > 0);
  if (thisMonth.length) out.monthDowntimeMs = thisMonth.reduce((s, r) => s + downtimeMs(r, now), 0);
  if (Number.isFinite(recentlyActiveUsers) && recentlyActiveUsers > 0) out.recentlyActiveUsers = recentlyActiveUsers;
  return out;
}

module.exports = {
  PLATFORMS,
  KINDS,
  ANNOUNCE_OPTIONS,
  MAX_EXTEND_MIN,
  MAX_REASON,
  statusOf,
  downtimeMs,
  validateInput,
  findOverlap,
  currentWindow,
  publicView,
  adminView,
  buildSummary,
  cleanText,
  trtMonthStart,
};
