"use strict";

/**
 * DesCoin anti-bot admin API (Faz 0, monitor only) — the data the upcoming
 * "Şüpheli davranışlar" admin tab reads. Mounted at /api/admin/antibot (and
 * /admin/antibot) *before* the main admin router so moderators can read.
 *
 * Roles (decisions 25 Oct 2026):
 *   - view (status, flagged list, account detail, notes): admins + moderators
 *   - "güvenilir işaretle" (trust) and "serbest bırak" (release): admins only
 * No endpoint here bans, mutes, freezes or changes a balance. Release is a
 * stub in Faz 0 (nothing is ever withheld) and answers 409.
 *
 * Privacy: device / network data is only ever returned as counts ("shared
 * with N other accounts"), never as hashes or addresses. Moderators do not
 * see who an account talks to (counterpart ids); admins see usernames only.
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

const router = express.Router();

const ID_RE = /^[0-9A-Za-z-]{1,64}$/;
const MINUTE = 60_000;

async function roleOf(user) {
  if (!user?.id) return null;
  if (user.username === "admin") return "admin";
  try {
    const { data } = await supabase.from("users").select("is_admin").eq("id", user.id).maybeSingle();
    if (data?.is_admin) return "admin";
  } catch {
    /* fall through */
  }
  return state.userRoles.get(user.id) === "mod" ? "moderator" : null;
}

async function requireViewer(req, res, next) {
  try {
    const role = await roleOf(req.user);
    if (!role) return res.status(403).json({ error: "Admin or moderator access required." });
    req.antibotRole = role;
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

router.use(requireAuth, requireViewer, limit("read", { windowMs: MINUTE, max: 120 }));

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

module.exports = router;
module.exports._roleOf = roleOf;
