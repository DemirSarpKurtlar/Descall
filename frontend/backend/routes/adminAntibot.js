"use strict";

/**
 * DesCoin anti-bot admin API (Faz 0, monitor only) — the data the upcoming
 * "Şüpheli davranışlar" admin tab reads. Mounted at /api/admin/antibot (and
 * /admin/antibot) before the main admin router.
 *
 * Access (3.3.0): admins the owner granted the "suspicious" section
 * (lib/adminPermissions.js); there is no moderator role any more.
 * No endpoint here bans, mutes, freezes or changes a balance. Release is a
 * stub in Faz 0 (nothing is ever withheld) and answers 409.
 *
 * Privacy: device / network data is returned as counts ("shared with N other
 * accounts"), never as addresses. The "Şüpheli Davranışlar" tab shows a
 * masked hash (first 4 + last 4 characters), never the full value, and
 * counterparts as usernames only.
 * All queries go through supabase-js (parameterized). Per-user rate limits.
 */

const express = require("express");
const supabase = require("../db/supabase");
const { requireAuth } = require("../middleware/auth");
const { recordFailure, rejectIfLimited } = require("../lib/rateLimit");
const state = require("../runtime/sharedState");
const antibot = require("../lib/descoinAntibot");
const config = require("../lib/descoinAntibot/config");
const risk = require("../lib/descoinAntibot/risk");
const store = require("../lib/descoinAntibot/store");
const watch = require("../lib/descoinAntibot/watch");
const moderation = require("../lib/moderation");

const { requireAdmin2fa, requireStepUp } = require("../middleware/adminSecondFactor");
const perms = require("../lib/adminPermissions");
const router = express.Router();

const ID_RE = /^[0-9A-Za-z-]{1,64}$/;
const MINUTE = 60_000;

// 3.3.0: no moderator role. Any admin the owner granted "suspicious" may read
// and act here (sections: lib/adminPermissions.js).
async function requireViewer(req, res, next) {
  try {
    const row = await perms.loadRow(req.user.id);
    if (!perms.canOpen(req.user, row, "suspicious")) {
      return res.status(403).json({ error: "Bu bölüm için yetkin yok.", code: "ADMIN_PERMISSION_DENIED", section: "suspicious" });
    }
    req.antibotRole = "admin";
    return next();
  } catch {
    return res.status(500).json({ error: "Internal server error" });
  }
}

function requireAdminRole(req, res, next) {
  if (req.antibotRole !== "admin") return res.status(403).json({ error: "Only admins can do this." });
  return next();
}

function limit(name, { windowMs, max }) {
  return (req, res, next) => {
    const r = recordFailure(`antibot:${name}:${req.user.id}`, { windowMs, max });
    if (rejectIfLimited(res, [r])) return;
    next();
  };
}

function validId(req, res, next) {
  if (!ID_RE.test(String(req.params.id || ""))) return res.status(400).json({ error: "Invalid user id." });
  next();
}

function intParam(v, def, min, max) {
  const n = Number.parseInt(String(v ?? ""), 10);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

function topReasons(reasons) {
  return (Array.isArray(reasons) ? reasons : [])
    .filter((r) => typeof r === "string")
    .sort((a, b) => (risk.WEIGHTS[b] || 0) - (risk.WEIGHTS[a] || 0))
    .slice(0, 3);
}

function shadowSummary(shadow) {
  const out = { wouldWithhold: 0, blocked: {} };
  for (const day of Object.values(shadow && typeof shadow === "object" ? shadow : {})) {
    out.wouldWithhold += Number(day?.would_withhold) || 0;
    for (const [k, v] of Object.entries(day?.blocked || {})) out.blocked[k] = (out.blocked[k] || 0) + (Number(v) || 0);
  }
  return out;
}

function tablesMissing(r, res) {
  if (r.skipped || store.isMissingTableError(r.error)) {
    res.status(503).json({ error: "Anti-bot tables are not migrated yet.", code: "antibot_not_migrated" });
    return true;
  }
  return false;
}

async function usersById(ids) {
  if (!ids.length) return new Map();
  const { data } = await supabase.from("users").select("id, username, display_name, avatar_url").in("id", ids.slice(0, 500));
  return new Map((data || []).map((u) => [u.id, u]));
}

function publicUser(id, byId) {
  const u = byId.get(id) || {};
  return { id, username: u.username || null, displayName: u.display_name || null, avatarUrl: u.avatar_url || null };
}

async function writeAudit(req, targetUserId, action, note, meta = {}) {
  const row = {
    admin_id: req.user.id,
    target_user: targetUserId,
    action,
    note: note ? String(note).slice(0, 1000) : null,
    meta,
  };
  const res = await store.run("descoin_admin_audit", "insert", (s) => s.from("descoin_admin_audit").insert(row));
  try {
    state.appendAudit(req.user.id, req.user.username, `antibot_${action}`, targetUserId, { ...meta, hasNote: Boolean(note) });
  } catch {
    /* in-memory log is best effort */
  }
  return !res.error && !res.skipped;
}

router.use(requireAuth, requireViewer, requireAdmin2fa, requireStepUp, limit("read", { windowMs: MINUTE, max: 120 }));

router.get("/status", (req, res) => {
  res.json({ ...antibot.status(), role: req.antibotRole, thresholds: config.RISK, retentionDays: config.RETENTION_DAYS });
});

router.get("/flagged", async (req, res) => {
  try {
    const min = intParam(req.query.min, config.RISK.half, 0, 100);
    const lim = intParam(req.query.limit, 50, 1, 100);
    const offset = intParam(req.query.offset, 0, 0, 10_000);
    const trustedFilter = req.query.trusted === "1" ? true : req.query.trusted === "0" ? false : null;
    const r = await store.run("descoin_risk", "select", (s) => {
      let q = s
        .from("descoin_risk")
        .select("user_id, score, reasons, trusted, signals, updated_at", { count: "exact" })
        .gte("score", min);
      if (trustedFilter !== null) q = q.eq("trusted", trustedFilter);
      return q.order("score", { ascending: false }).range(offset, offset + lim - 1);
    });
    if (tablesMissing(r, res)) return;
    if (r.error) return res.status(500).json({ error: "Could not load flagged accounts." });
    const rows = r.data || [];
    const byId = await usersById(rows.map((x) => x.user_id));
    res.json({
      total: r.count ?? rows.length,
      offset,
      limit: lim,
      items: rows.map((x) => ({
        user: publicUser(x.user_id, byId),
        score: x.score,
        topReasons: topReasons(x.reasons),
        trusted: Boolean(x.trusted),
        linkedCount: Array.isArray(x.signals?.linked_with) ? x.signals.linked_with.length : 0,
        shadow7d: shadowSummary(x.signals?.shadow),
        wouldEarnMultiplier: risk.multiplierFor(x.score || 0, Boolean(x.trusted), config.RISK),
        updatedAt: x.updated_at,
      })),
    });
  } catch {
    res.status(500).json({ error: "Could not load flagged accounts." });
  }
});

router.get("/users/:id", validId, async (req, res) => {
  try {
    const id = req.params.id;
    const isAdmin = req.antibotRole === "admin";
    const riskRes = await store.run("descoin_risk", "select", (s) =>
      s.from("descoin_risk").select("user_id, score, reasons, trusted, trusted_by, trusted_at, signals, updated_at").eq("user_id", id).maybeSingle()
    );
    if (tablesMissing(riskRes, res)) return;
    const row = riskRes.data;
    const since = new Date(Date.now() - config.RETENTION_DAYS * 24 * 3600_000).toISOString();

    // Device / network overlap as counts only.
    const devRes = await store.run("descoin_device_seen", "select", (s) =>
      s.from("descoin_device_seen").select("kind, hash, first_seen, last_seen").eq("user_id", id).gte("last_seen", since).limit(200)
    );
    const mine = devRes.data || [];
    const hashes = [...new Set(mine.map((d) => d.hash))];
    let sharedRows = [];
    if (hashes.length) {
      const sh = await store.run("descoin_device_seen", "select", (s) =>
        s.from("descoin_device_seen").select("user_id, kind, hash").in("hash", hashes).gte("last_seen", since).limit(2000)
      );
      sharedRows = (sh.data || []).filter((r) => r.user_id !== id);
    }
    const device = {};
    for (const kind of ["fp", "subnet"]) {
      const mineK = mine.filter((d) => d.kind === kind);
      const others = new Set(sharedRows.filter((r) => r.kind === kind).map((r) => r.user_id));
      device[kind] = {
        distinct: mineK.length,
        sharedWithAccounts: others.size,
        lastSeen: mineK.map((d) => d.last_seen).sort().pop() || null,
      };
    }

    const [linksA, linksB, alertsRes, auditRes] = await Promise.all([
      store.run("descoin_account_links", "select", (s) =>
        s.from("descoin_account_links").select("user_a, user_b, kinds, strength, last_seen").eq("user_a", id).limit(50)
      ),
      store.run("descoin_account_links", "select", (s) =>
        s.from("descoin_account_links").select("user_a, user_b, kinds, strength, last_seen").eq("user_b", id).limit(50)
      ),
      store.run("descoin_risk_alerts", "select", (s) =>
        s.from("descoin_risk_alerts").select("score, reasons, created_at").eq("user_id", id).order("created_at", { ascending: false }).limit(20)
      ),
      store.run("descoin_admin_audit", "select", (s) =>
        s.from("descoin_admin_audit").select("admin_id, action, note, created_at").eq("target_user", id).order("created_at", { ascending: false }).limit(20)
      ),
    ]);
    const links = [...(linksA.data || []), ...(linksB.data || [])].map((l) => ({
      other: l.user_a === id ? l.user_b : l.user_a,
      kinds: Array.isArray(l.kinds) ? l.kinds : [],
      strength: l.strength || 0,
      lastSeen: l.last_seen,
    }));
    const cps = row?.signals?.counterparts && typeof row.signals.counterparts === "object" ? row.signals.counterparts : {};
    const cpTop = Object.entries(cps).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const audit = auditRes.data || [];
    const byId = await usersById([id, ...links.map((l) => l.other), ...(isAdmin ? cpTop.map(([k]) => k) : []), ...audit.map((a) => a.admin_id)]);
    const total = Object.values(cps).reduce((s, v) => s + (Number(v) || 0), 0);
    const sig = row?.signals || {};

    res.json({
      user: publicUser(id, byId),
      role: req.antibotRole,
      risk: row
        ? {
            score: row.score,
            reasons: Array.isArray(row.reasons) ? row.reasons : [],
            trusted: Boolean(row.trusted),
            trustedAt: row.trusted_at || null,
            updatedAt: row.updated_at,
            wouldEarnMultiplier: risk.multiplierFor(row.score || 0, Boolean(row.trusted), config.RISK),
          }
        : null,
      signals: {
        automationClient: Boolean(sig.ua_automation || sig.webdriver),
        headless: Boolean(sig.headless),
        clientSignalsSeen: Boolean(sig.client_signals_seen),
        messageTimingCv: typeof sig.message_cv === "number" ? Math.round(sig.message_cv * 1000) / 1000 : null,
        activeHours24: sig.active_hours_24 || 0,
        dayCapsHit: sig.day_caps_hit || 0,
        activeDays: Array.isArray(sig.active_days) ? sig.active_days : [],
        conversationPartners7d: {
          distinct: Object.keys(cps).length,
          total,
          top: isAdmin ? cpTop.map(([k, n]) => ({ user: publicUser(k, byId), count: n })) : undefined,
          topShare: cpTop.length && total ? Math.round((cpTop[0][1] / total) * 100) / 100 : 0,
        },
        shadow7d: shadowSummary(sig.shadow),
      },
      device,
      links: links.map((l) => ({ user: publicUser(l.other, byId), kinds: l.kinds, strength: l.strength, lastSeen: l.lastSeen })),
      alerts: (alertsRes.data || []).map((a) => ({ score: a.score, reasons: a.reasons || [], at: a.created_at })),
      audit: audit.map((a) => ({
        by: publicUser(a.admin_id, byId),
        action: a.action,
        note: a.note || null,
        at: a.created_at,
      })),
    });
  } catch {
    res.status(500).json({ error: "Could not load the account." });
  }
});

const writeLimit = limit("write", { windowMs: 10 * MINUTE, max: 30 });

router.post("/users/:id/trust", validId, requireAdminRole, writeLimit, async (req, res) => {
  try {
    const id = req.params.id;
    const trusted = req.body?.trusted;
    if (typeof trusted !== "boolean") return res.status(400).json({ error: "`trusted` must be true or false." });
    const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 1000) : "";
    const { data: target } = await supabase.from("users").select("id").eq("id", id).maybeSingle();
    if (!target) return res.status(404).json({ error: "User not found." });
    const nowIso = new Date().toISOString();
    const existing = await store.run("descoin_risk", "select", (s) => s.from("descoin_risk").select("user_id").eq("user_id", id).maybeSingle());
    if (tablesMissing(existing, res)) return;
    const patch = { trusted, trusted_by: trusted ? req.user.id : null, trusted_at: trusted ? nowIso : null };
    const r = existing.data
      ? await store.run("descoin_risk", "update", (s) => s.from("descoin_risk").update(patch).eq("user_id", id))
      : await store.run("descoin_risk", "insert", (s) =>
          s.from("descoin_risk").insert({ user_id: id, score: 0, reasons: [], signals: {}, ...patch, updated_at: nowIso })
        );
    if (r.error || r.skipped) return res.status(500).json({ error: "Could not save." });
    antibot.setTrustedLocal(id, trusted);
    await writeAudit(req, id, trusted ? "trust" : "untrust", note);
    res.json({ ok: true, trusted });
  } catch {
    res.status(500).json({ error: "Could not save." });
  }
});

router.post("/users/:id/note", validId, writeLimit, async (req, res) => {
  const note = typeof req.body?.note === "string" ? req.body.note.trim() : "";
  if (!note) return res.status(400).json({ error: "Note is empty." });
  if (note.length > 1000) return res.status(400).json({ error: "Note is too long (max 1000)." });
  const { data: target } = await supabase.from("users").select("id").eq("id", req.params.id).maybeSingle();
  if (!target) return res.status(404).json({ error: "User not found." });
  const ok = await writeAudit(req, req.params.id, "note", note);
  if (!ok) return res.status(503).json({ error: "Could not save the note.", code: "antibot_not_migrated" });
  res.json({ ok: true });
});

// Faz 0: nothing is ever withheld, so there is nothing to release. The route
// exists (admin-only) so the tab can be built against it; it changes nothing.
router.post("/users/:id/release", validId, requireAdminRole, writeLimit, (req, res) => {
  res.status(409).json({ error: "Monitor mode: no DesCoin is withheld, nothing to release.", code: "monitor_mode" });
});

router.post("/run", requireAdminRole, limit("run", { windowMs: 10 * MINUTE, max: 3 }), async (req, res) => {
  try {
    await antibot.flush();
    const result = await antibot.runRiskJob();
    await writeAudit(req, null, "run_job", null, { users: result.users || 0 });
    res.json({ ok: true, users: result.users || 0, skipped: Boolean(result.skipped) });
  } catch {
    res.status(500).json({ error: "Risk job failed." });
  }
});

// ---------------------------------------------------------------------------
// "Şüpheli Davranışlar" tab (decisions 25 Oct 2026): KPIs, account list with
// earnings, rich detail, watch list + rules, alert feed.
// Admins with the "suspicious" section read and act. Nothing here bans, mutes, freezes or changes a balance: those
// shortcuts open the existing admin tools in the client.
// ---------------------------------------------------------------------------

const DAY = 24 * 3600_000;
const EARN_REASONS = ["voice_activity", "screenshare_activity", "message_activity", "referral_invite", "referral_welcome", "daily_claim", "streak_bonus"];

function heldOf(signals) {
  return shadowSummary(signals?.shadow).wouldWithhold;
}

function dayKey(ts) {
  return new Date(ts).toISOString().slice(0, 10);
}

async function usersMeta(ids) {
  if (!ids.length) return new Map();
  const { data } = await supabase
    .from("users")
    .select("id, username, display_name, avatar_url, created_at, email_confirmed_at, auth_provider")
    .in("id", ids.slice(0, 500));
  return new Map((data || []).map((u) => [u.id, u]));
}

function tabUser(id, byId) {
  const u = byId.get(id) || {};
  return {
    id,
    username: u.username || null,
    displayName: u.display_name || null,
    avatarUrl: u.avatar_url || null,
    createdAt: u.created_at || null,
    emailVerified: Boolean(u.email_confirmed_at) || ["google", "apple"].includes(u.auth_provider),
    banned: moderation.isBanned(id),
  };
}

/** DesCoin earned (activity, referral, daily) per user over the last 7 days. */
async function earnedFor(ids, now = Date.now()) {
  const out = new Map(ids.map((id) => [id, { total: 0, byDay: {} }]));
  if (!ids.length) return out;
  const since = new Date(now - 7 * DAY).toISOString();
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await supabase
      .from("descoin_ledger")
      .select("user_id, amount, created_at")
      .in("user_id", ids.slice(i, i + 100))
      .in("reason", EARN_REASONS)
      .gt("amount", 0)
      .gte("created_at", since)
      .limit(20000);
    if (error) continue;
    for (const r of data || []) {
      const e = out.get(r.user_id);
      if (!e) continue;
      const n = Number(r.amount) || 0;
      e.total += n;
      const d = dayKey(r.created_at);
      e.byDay[d] = (e.byDay[d] || 0) + n;
    }
  }
  return out;
}

let avgCache = { at: 0, value: null };
/** Average DesCoin a (non-flagged) earning user gets per day, cached for an hour. */
async function averagePerDay(now = Date.now()) {
  if (avgCache.value != null && now - avgCache.at < 3600_000) return avgCache.value;
  const since = new Date(now - 7 * DAY).toISOString();
  const { data, error } = await supabase
    .from("descoin_ledger")
    .select("user_id, amount")
    .in("reason", EARN_REASONS)
    .gt("amount", 0)
    .gte("created_at", since)
    .limit(20000);
  if (error) return avgCache.value;
  const usersSet = new Set();
  let sum = 0;
  for (const r of data || []) {
    usersSet.add(r.user_id);
    sum += Number(r.amount) || 0;
  }
  const value = usersSet.size ? Math.round(sum / usersSet.size / 7) : 0;
  avgCache = { at: now, value };
  return value;
}

async function watchMap(ids = null) {
  const r = await store.run("descoin_watchlist", "select", (s) => {
    let q = s.from("descoin_watchlist").select("user_id, added_by, note, created_at, updated_at");
    if (ids) q = q.in("user_id", ids.slice(0, 500));
    return q.order("created_at", { ascending: false }).limit(200);
  });
  return { ok: !r.error && !r.skipped, rows: r.data || [] };
}

function statusOf(score, trusted) {
  const m = risk.multiplierFor(score || 0, Boolean(trusted), config.RISK);
  if (trusted) return "trusted";
  if (m === 0) return "stopped";
  if (m === 0.5) return "half";
  return "normal";
}

router.get("/overview", async (req, res) => {
  try {
    const r = await store.run("descoin_risk", "select", (s) =>
      s.from("descoin_risk").select("user_id, score, trusted, signals").or(`score.gte.${config.RISK.half},trusted.eq.true`).limit(2000)
    );
    if (tablesMissing(r, res)) return;
    if (r.error) return res.status(500).json({ error: "Could not load." });
    const rows = r.data || [];
    const counts = { stopped: 0, half: 0, trusted: 0 };
    let review = 0;
    let held = 0;
    for (const x of rows) {
      const st = statusOf(x.score, x.trusted);
      if (counts[st] != null) counts[st] += 1;
      if (!x.trusted && x.score >= config.RISK.half) review += 1;
      held += heldOf(x.signals);
    }
    const links = await store.run("descoin_account_links", "select", (s) => s.from("descoin_account_links").select("user_a, user_b").limit(5000));
    const clusters = watch.clustersOf((links.data || []).map((l) => ({ a: l.user_a, b: l.user_b })));
    const w = await watchMap();
    res.json({
      role: req.antibotRole,
      kpis: {
        review,
        held7d: held,
        clusters: { count: clusters.length, accounts: clusters.reduce((n, c) => n + c.length, 0) },
        watch: w.rows.length,
      },
      counts,
      watchAvailable: w.ok,
    });
  } catch {
    res.status(500).json({ error: "Could not load." });
  }
});

router.get("/accounts", async (req, res) => {
  try {
    const isAdmin = req.antibotRole === "admin";
    const status = ["stopped", "half", "trusted"].includes(req.query.status) ? req.query.status : null;
    const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 64) : "";
    const w = await watchMap();
    const watched = new Set(w.rows.map((x) => x.user_id));
    const r = await store.run("descoin_risk", "select", (s) =>
      s
        .from("descoin_risk")
        .select("user_id, score, reasons, trusted, signals, updated_at")
        .or(`score.gte.${config.RISK.half},trusted.eq.true`)
        .order("score", { ascending: false })
        .limit(200)
    );
    if (tablesMissing(r, res)) return;
    if (r.error) return res.status(500).json({ error: "Could not load." });
    let rows = r.data || [];
    const missingWatched = [...watched].filter((id) => !rows.some((x) => x.user_id === id));
    if (missingWatched.length) {
      const extra = await store.run("descoin_risk", "select", (s) =>
        s.from("descoin_risk").select("user_id, score, reasons, trusted, signals, updated_at").in("user_id", missingWatched)
      );
      const have = new Set((extra.data || []).map((x) => x.user_id));
      rows = rows.concat(extra.data || [], missingWatched.filter((id) => !have.has(id)).map((id) => ({ user_id: id, score: 0, reasons: [], trusted: false, signals: {} })));
    }
    let byId = await usersMeta(rows.map((x) => x.user_id));
    if (q) {
      const needle = q.toLowerCase().replace(/^@/, "");
      let hashUsers = new Set();
      if (isAdmin && /^[0-9a-f]{4,64}$/i.test(q)) {
        const h = await store.run("descoin_device_seen", "select", (s) =>
          s.from("descoin_device_seen").select("user_id").like("hash", `${q.toLowerCase()}%`).limit(50)
        );
        hashUsers = new Set((h.data || []).map((x) => x.user_id));
      }
      rows = rows.filter((x) => {
        const u = byId.get(x.user_id) || {};
        return (
          hashUsers.has(x.user_id) ||
          String(u.username || "").toLowerCase().includes(needle) ||
          String(u.display_name || "").toLowerCase().includes(needle)
        );
      });
    }
    if (status) rows = rows.filter((x) => statusOf(x.score, x.trusted) === status);
    rows.sort((a, b) => (b.score || 0) - (a.score || 0));
    const earned = await earnedFor(rows.map((x) => x.user_id));
    byId = byId.size ? byId : await usersMeta(rows.map((x) => x.user_id));
    const items = rows.map((x) => {
      const reasons = (Array.isArray(x.reasons) ? x.reasons : [])
        .filter((k) => typeof k === "string")
        .sort((a, b) => (risk.WEIGHTS[b] || 0) - (risk.WEIGHTS[a] || 0));
      return {
        user: tabUser(x.user_id, byId),
        score: x.score || 0,
        reasons,
        trusted: Boolean(x.trusted),
        status: statusOf(x.score, x.trusted),
        linkedCount: Array.isArray(x.signals?.linked_with) ? x.signals.linked_with.length : 0,
        earned7d: earned.get(x.user_id)?.total || 0,
        held7d: heldOf(x.signals),
        watched: watched.has(x.user_id),
        updatedAt: x.updated_at || null,
      };
    });
    res.json({
      items,
      totals: { earned7d: items.reduce((n, i) => n + i.earned7d, 0), held7d: items.reduce((n, i) => n + i.held7d, 0) },
    });
  } catch {
    res.status(500).json({ error: "Could not load accounts." });
  }
});

router.get("/users/:id/extra", validId, async (req, res) => {
  try {
    const id = req.params.id;
    const isAdmin = req.antibotRole === "admin";
    const now = Date.now();
    const riskRes = await store.run("descoin_risk", "select", (s) =>
      s.from("descoin_risk").select("score, reasons, trusted, signals").eq("user_id", id).maybeSingle()
    );
    if (tablesMissing(riskRes, res)) return;
    const row = riskRes.data || {};
    const [earned, avg, linksA, linksB, alertsRes, watchAlerts, auditRes, devRes, wl] = await Promise.all([
      earnedFor([id], now),
      averagePerDay(now),
      store.run("descoin_account_links", "select", (s) => s.from("descoin_account_links").select("user_a, user_b, kinds, created_at").eq("user_a", id).limit(50)),
      store.run("descoin_account_links", "select", (s) => s.from("descoin_account_links").select("user_a, user_b, kinds, created_at").eq("user_b", id).limit(50)),
      store.run("descoin_risk_alerts", "select", (s) => s.from("descoin_risk_alerts").select("score, created_at").eq("user_id", id).order("created_at", { ascending: false }).limit(10)),
      store.run("descoin_admin_alerts", "select", (s) => s.from("descoin_admin_alerts").select("kind, body, created_at").eq("user_id", id).order("created_at", { ascending: false }).limit(10)),
      store.run("descoin_admin_audit", "select", (s) => s.from("descoin_admin_audit").select("admin_id, action, created_at").eq("target_user", id).order("created_at", { ascending: false }).limit(10)),
      isAdmin
        ? store.run("descoin_device_seen", "select", (s) => s.from("descoin_device_seen").select("kind, hash, last_seen").eq("user_id", id).order("last_seen", { ascending: false }).limit(20))
        : Promise.resolve({ data: [] }),
      watchMap([id]),
    ]);
    const links = [...(linksA.data || []), ...(linksB.data || [])].map((l) => ({ other: l.user_a === id ? l.user_b : l.user_a, kinds: l.kinds || [], at: l.created_at }));
    // Links among the linked accounts themselves, for the graph.
    const others = [...new Set(links.map((l) => l.other))].slice(0, 12);
    let among = [];
    if (others.length > 1) {
      const a = await store.run("descoin_account_links", "select", (s) => s.from("descoin_account_links").select("user_a, user_b, kinds").in("user_a", others).in("user_b", others).limit(100));
      among = (a.data || []).map((l) => ({ a: l.user_a, b: l.user_b, kinds: l.kinds || [] }));
    }
    const auditRows = auditRes.data || [];
    const byId = await usersMeta([id, ...others, ...auditRows.map((a) => a.admin_id).filter(Boolean)]);
    const me = tabUser(id, byId);
    const days = [];
    const e = earned.get(id) || { total: 0, byDay: {} };
    for (let i = 6; i >= 0; i -= 1) {
      const d = dayKey(now - i * DAY);
      days.push({ day: d, amount: e.byDay[d] || 0 });
    }
    const timeline = [];
    if (me.createdAt) timeline.push({ at: me.createdAt, kind: "signup" });
    links
      .slice()
      .sort((a, b) => String(a.at).localeCompare(String(b.at)))
      .forEach((l, i) => timeline.push({ at: l.at, kind: "link", user: byId.get(l.other)?.username || null, linkKind: l.kinds[0] || null, weight: i === 0 ? risk.WEIGHTS.linked_account : null }));
    for (const a of alertsRes.data || []) timeline.push({ at: a.created_at, kind: "alert", score: a.score });
    for (const a of watchAlerts.data || []) timeline.push({ at: a.created_at, kind: `watch_${a.kind}`, body: a.body || {} });
    for (const a of auditRows) {
      if (["trust", "untrust", "watch_add", "watch_remove"].includes(a.action)) timeline.push({ at: a.created_at, kind: `audit_${a.action}`, by: byId.get(a.admin_id)?.username || null });
    }
    timeline.sort((a, b) => String(a.at).localeCompare(String(b.at)));
    const hashes = {};
    for (const d of devRes.data || []) if (!hashes[d.kind]) hashes[d.kind] = watch.maskHash(d.hash);
    const shadow = shadowSummary(row.signals?.shadow);
    const entry = wl.rows[0] || null;
    const rulesRes = entry
      ? await store.run("descoin_watch_rules", "select", (s) => s.from("descoin_watch_rules").select("id, kind, threshold").eq("user_id", id))
      : { data: [] };
    res.json({
      user: me,
      held7d: shadow.wouldWithhold,
      rawScore: (Array.isArray(row.reasons) ? row.reasons : []).reduce((n, r) => n + (risk.WEIGHTS[r] || 0), 0),
      weights: risk.WEIGHTS,
      earnings: { days, total: e.total, averagePerDay: avg },
      graph: {
        nodes: [me, ...others.map((o) => tabUser(o, byId))].map((u) => ({ id: u.id, username: u.username, banned: u.banned })),
        edges: [...links.map((l) => ({ a: id, b: l.other, kinds: l.kinds })), ...among],
      },
      timeline: timeline.slice(-8),
      uncounted: shadow.blocked,
      hashes: isAdmin ? hashes : null,
      watch: entry ? { note: entry.note || "", createdAt: entry.created_at, rules: rulesRes.data || [] } : null,
    });
  } catch {
    res.status(500).json({ error: "Could not load the account." });
  }
});

router.get("/clusters", async (req, res) => {
  try {
    const links = await store.run("descoin_account_links", "select", (s) => s.from("descoin_account_links").select("user_a, user_b, kinds").limit(5000));
    if (tablesMissing(links, res)) return;
    if (links.error) return res.status(500).json({ error: "Could not load." });
    const groups = watch.clustersOf((links.data || []).map((l) => ({ a: l.user_a, b: l.user_b }))).slice(0, 50);
    const ids = groups.flat();
    const [byId, risks] = await Promise.all([
      usersMeta(ids),
      ids.length ? store.run("descoin_risk", "select", (s) => s.from("descoin_risk").select("user_id, score, trusted, signals").in("user_id", ids.slice(0, 500))) : { data: [] },
    ]);
    const riskBy = new Map((risks.data || []).map((r) => [r.user_id, r]));
    const kindsOf = (g) => {
      const set = new Set(g);
      const k = {};
      for (const l of links.data || []) if (set.has(l.user_a) && set.has(l.user_b)) for (const x of l.kinds || []) k[x] = (k[x] || 0) + 1;
      return k;
    };
    const items = groups.map((g) => {
      const members = g.map((id) => {
        const r = riskBy.get(id) || {};
        return { user: tabUser(id, byId), score: r.score || 0, status: statusOf(r.score, r.trusted), held7d: heldOf(r.signals) };
      }).sort((a, b) => b.score - a.score);
      return { members, kinds: kindsOf(g), held7d: members.reduce((n, m) => n + m.held7d, 0), topScore: members[0]?.score || 0 };
    }).sort((a, b) => b.topScore - a.topScore);
    res.json({ items });
  } catch {
    res.status(500).json({ error: "Could not load." });
  }
});

router.get("/watchlist", async (req, res) => {
  try {
    const w = await watchMap();
    if (!w.ok) return res.status(503).json({ error: "Watch list is not migrated yet.", code: "watchlist_not_migrated" });
    const ids = w.rows.map((x) => x.user_id);
    const [rules, risks] = await Promise.all([
      ids.length ? store.run("descoin_watch_rules", "select", (s) => s.from("descoin_watch_rules").select("id, user_id, kind, threshold, last_fired_at").in("user_id", ids)) : { data: [] },
      ids.length ? store.run("descoin_risk", "select", (s) => s.from("descoin_risk").select("user_id, score, trusted, signals").in("user_id", ids)) : { data: [] },
    ]);
    const byId = await usersMeta([...ids, ...w.rows.map((x) => x.added_by).filter(Boolean)]);
    const riskBy = new Map((risks.data || []).map((r) => [r.user_id, r]));
    res.json({
      items: w.rows.map((x) => {
        const r = riskBy.get(x.user_id) || {};
        return {
          user: tabUser(x.user_id, byId),
          addedBy: x.added_by ? byId.get(x.added_by)?.username || null : null,
          createdAt: x.created_at,
          note: x.note || "",
          rules: (rules.data || []).filter((y) => y.user_id === x.user_id).map((y) => ({ id: y.id, kind: y.kind, threshold: y.threshold, lastFiredAt: y.last_fired_at })),
          score: r.score || 0,
          trusted: Boolean(r.trusted),
          status: statusOf(r.score, r.trusted),
          held7d: heldOf(r.signals),
        };
      }),
    });
  } catch {
    res.status(500).json({ error: "Could not load the watch list." });
  }
});

router.put("/watch/:id", validId, requireAdminRole, writeLimit, async (req, res) => {
  try {
    const id = req.params.id;
    const note = typeof req.body?.note === "string" ? req.body.note.trim() : "";
    if (note.length > 500) return res.status(400).json({ error: "Note is too long (max 500)." });
    const norm = watch.normalizeRules(req.body?.rules ?? []);
    if (norm.error) return res.status(400).json({ error: norm.error });
    const { data: target } = await supabase.from("users").select("id").eq("id", id).maybeSingle();
    if (!target) return res.status(404).json({ error: "User not found." });
    const existing = await store.run("descoin_watchlist", "select", (s) => s.from("descoin_watchlist").select("user_id").eq("user_id", id).maybeSingle());
    if (existing.skipped || store.isMissingTableError(existing.error)) {
      return res.status(503).json({ error: "Watch list is not migrated yet.", code: "watchlist_not_migrated" });
    }
    const nowIso = new Date().toISOString();
    const up = existing.data
      ? await store.run("descoin_watchlist", "update", (s) => s.from("descoin_watchlist").update({ note: note || null, updated_at: nowIso }).eq("user_id", id))
      : await store.run("descoin_watchlist", "insert", (s) => s.from("descoin_watchlist").insert({ user_id: id, added_by: req.user.id, note: note || null }));
    if (up.error || up.skipped) return res.status(500).json({ error: "Could not save." });
    // Replace rules: keep the ones that did not change (their "already fired" memory stays).
    const cur = await store.run("descoin_watch_rules", "select", (s) => s.from("descoin_watch_rules").select("id, kind, threshold").eq("user_id", id));
    const key = (r) => `${r.kind}:${r.threshold ?? ""}`;
    const want = new Set(norm.rules.map(key));
    const have = cur.data || [];
    const drop = have.filter((r) => !want.has(key(r))).map((r) => r.id);
    const haveKeys = new Set(have.map(key));
    const add = norm.rules.filter((r) => !haveKeys.has(key(r)));
    if (drop.length) await store.run("descoin_watch_rules", "delete", (s) => s.from("descoin_watch_rules").delete().in("id", drop));
    if (add.length) await store.run("descoin_watch_rules", "insert", (s) => s.from("descoin_watch_rules").insert(add.map((r) => ({ user_id: id, ...r }))));
    await writeAudit(req, id, existing.data ? "watch_update" : "watch_add", note, { rules: norm.rules.length });
    res.json({ ok: true, watched: true, rules: norm.rules });
  } catch {
    res.status(500).json({ error: "Could not save." });
  }
});

router.delete("/watch/:id", validId, requireAdminRole, writeLimit, async (req, res) => {
  try {
    const r = await store.run("descoin_watchlist", "delete", (s) => s.from("descoin_watchlist").delete().eq("user_id", req.params.id));
    if (r.skipped || store.isMissingTableError(r.error)) return res.status(503).json({ error: "Watch list is not migrated yet.", code: "watchlist_not_migrated" });
    if (r.error) return res.status(500).json({ error: "Could not save." });
    await writeAudit(req, req.params.id, "watch_remove", null);
    res.json({ ok: true, watched: false });
  } catch {
    res.status(500).json({ error: "Could not save." });
  }
});

router.get("/feed", async (req, res) => {
  try {
    const [wa, ra, au] = await Promise.all([
      store.run("descoin_admin_alerts", "select", (s) => s.from("descoin_admin_alerts").select("user_id, kind, severity, body, created_at").order("created_at", { ascending: false }).limit(20)),
      store.run("descoin_risk_alerts", "select", (s) => s.from("descoin_risk_alerts").select("user_id, score, created_at").order("created_at", { ascending: false }).limit(20)),
      store.run("descoin_admin_audit", "select", (s) => s.from("descoin_admin_audit").select("admin_id, target_user, action, note, created_at").order("created_at", { ascending: false }).limit(20)),
    ]);
    const audit = (au.data || []).filter((a) => a.action !== "run_job");
    const ids = [
      ...(wa.data || []).flatMap((a) => [a.user_id, ...(a.body?.added || []), ...(a.body?.joined || [])]),
      ...(ra.data || []).map((a) => a.user_id),
      ...audit.flatMap((a) => [a.admin_id, a.target_user]),
    ].filter((x) => typeof x === "string" && ID_RE.test(x));
    const byId = await usersMeta([...new Set(ids)]);
    const name = (x) => (x ? byId.get(x)?.username || null : null);
    const alerts = [
      ...(wa.data || []).map((a) => {
        const body = { ...(a.body || {}) };
        if (Array.isArray(body.added) && a.kind !== "new_signal") body.added = body.added.map(name);
        if (Array.isArray(body.joined)) body.joined = body.joined.map(name);
        return { at: a.created_at, kind: a.kind, severity: a.severity, user: name(a.user_id), body };
      }),
      ...(ra.data || []).map((a) => ({ at: a.created_at, kind: "risk_alert", severity: a.score >= 70 ? "hi" : "mid", user: name(a.user_id), body: { score: a.score } })),
      ...audit.filter((a) => a.action === "trust").map((a) => ({ at: a.created_at, kind: "trusted", severity: "lo", user: name(a.target_user), body: { by: name(a.admin_id) } })),
    ]
      .sort((a, b) => String(b.at).localeCompare(String(a.at)))
      .slice(0, 12);
    res.json({
      alerts,
      audit: audit.slice(0, 8).map((a) => ({
        at: a.created_at,
        action: a.action,
        by: name(a.admin_id),
        target: name(a.target_user),
        // Moderators see that a note exists, not the note text on trust decisions.
        note: req.antibotRole === "admin" || a.action === "note" ? a.note || null : null,
      })),
    });
  } catch {
    res.status(500).json({ error: "Could not load alerts." });
  }
});

module.exports = router;
