"use strict";

/**
 * Descall+ / Ultra admin API (docs/premium/CONTRACT.md). Mounted in routes/admin.js as /premium,
 * after requireAuth + requireAdmin + 2FA + requireStepUp + requireAdminSection("premium"), so every
 * write already needs the admin step-up token. Each write is also recorded in the admin audit log
 * (state.appendAudit -> admin_audit) as premium_*; refused attempts are logged by logDenied.
 *
 *   GET   /plans                     PATCH /plans/:id
 *   GET   /users/search?q=           GET   /users/:id          POST /users/:id/apply
 *   POST  /bulk                      GET   /bulk/:batchId
 *   GET   /events                    GET   /dashboard          GET  /analytics     GET /finance
 *   GET   /audit
 *   GET   /campaigns                 POST  /campaigns          PATCH /campaigns/:id
 *   GET   /campaigns/:id/stats
 */

const express = require("express");
const state = require("../runtime/sharedState");
const premium = require("../lib/premium/service");
const { emitPremiumUpdated } = require("../socket/premium");
const rateLimit = require("../lib/rateLimit");

const router = express.Router();

function send(res, err, label) {
  const status = err?.status || 500;
  if (status >= 500) console.error(`[admin/premium] ${label}:`, err?.code || "error", err?.cause?.code || "");
  res.status(status).json({ error: err?.code || "server_error", code: err?.code || "server_error" });
}

function audit(actor, action, target, meta) {
  try {
    return state.appendAudit(actor.id, actor.username, action, target, meta);
  } catch {
    return null;
  }
}

function noStore(res) {
  res.set("Cache-Control", "no-store");
}

/* ---------------- refused attempts ---------------- */

const DENIED_THROTTLE_MS = 10 * 1000;
const deniedSeen = new Map();

/**
 * Mounted on /premium BEFORE the admin chain: when the answer is 401/403 (not signed in, not an
 * admin, no 2FA, no step-up, no section) the attempt is logged (console + admin audit), at most
 * once per 10 s per account and path. Never logs bodies or tokens.
 */
function logDenied(req, res, next) {
  res.on("finish", () => {
    if (res.statusCode !== 401 && res.statusCode !== 403) return;
    const who = req.user?.id || null;
    const path = `/premium${String(req.path || "").slice(0, 120)}`;
    const key = `${who || req.ip || "anon"}:${req.method}:${path}`;
    const now = Date.now();
    if ((deniedSeen.get(key) || 0) > now - DENIED_THROTTLE_MS) return;
    deniedSeen.set(key, now);
    if (deniedSeen.size > 5000) deniedSeen.delete(deniedSeen.keys().next().value);
    console.warn(`[admin/premium] refused ${req.method} ${path} -> ${res.statusCode}${who ? " (signed in)" : " (anonymous)"}`);
    try {
      state.appendAudit(who, req.user?.username || null, "premium_denied", path, { method: req.method, status: res.statusCode });
    } catch {
      /* best effort */
    }
  });
  next();
}

/* ---------------- plans ---------------- */

router.get("/plans", async (_req, res) => {
  try {
    noStore(res);
    res.json({ plans: await premium.listPlans(), payments_integrated: false });
  } catch (err) {
    send(res, err, "plans");
  }
});

router.patch("/plans/:id", async (req, res) => {
  try {
    const plan = await premium.patchPlan(String(req.params.id), req.body || {});
    audit(req.user, "premium_plan_update", plan.id, { fields: Object.keys(req.body || {}).slice(0, 10) });
    res.json({ plan });
  } catch (err) {
    send(res, err, "plan update");
  }
});

/* ---------------- users ---------------- */

const SEARCH_LIMIT = { windowMs: 60 * 1000, max: 120 };

router.get("/users/search", async (req, res) => {
  try {
    noStore(res);
    const limited = rateLimit.recordFailure(`premium-user-search:${req.user.id}`, SEARCH_LIMIT);
    if (rateLimit.rejectIfLimited(res, [limited])) return;
    res.json({ users: await premium.userSearch(req.query.q, req.query.limit) });
  } catch (err) {
    send(res, err, "search");
  }
});

router.get("/users/:id", async (req, res) => {
  try {
    noStore(res);
    res.json(await premium.userDetail(String(req.params.id)));
  } catch (err) {
    send(res, err, "user");
  }
});

router.post("/users/:id/apply", async (req, res) => {
  const userId = String(req.params.id);
  try {
    const result = await premium.apply(req.user.id, userId, req.body || {});
    if (!result.replay) {
      audit(req.user, `premium_${result.event?.kind || "apply"}`, userId, {
        op: result.event?.kind,
        plan: result.subscription?.plan_id || null,
        days: req.body?.days ?? null,
        unlimited: result.subscription?.unlimited ?? null,
        request_id: result.event?.request_id || null,
        event_id: result.event?.id || null,
        reason: result.event?.reason || null,
      });
      emitPremiumUpdated(req.app.get("io"), userId, { kind: result.event?.kind });
    }
    res.json({ subscription: result.subscription, event: result.event, replay: Boolean(result.replay) });
  } catch (err) {
    send(res, err, "apply");
  }
});

/* ---------------- bulk ---------------- */

router.post("/bulk", async (req, res) => {
  try {
    const out = await premium.bulk(req.user.id, req.body || {});
    if (!out.replay && out.batch?.id) {
      audit(req.user, "premium_bulk", out.batch.id, {
        op: String(req.body?.op || ""),
        plan: req.body?.plan || null,
        total: out.batch.total,
        ok: out.batch.ok,
        failed: out.batch.failed,
        request_id: req.body?.request_id || null,
        reason: typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, 500) : null,
      });
      const io = req.app.get("io");
      for (const r of out.results) if (r.ok) emitPremiumUpdated(io, r.user_id, { kind: String(req.body?.op || "") });
    }
    res.json({ batch: out.batch, results: out.results, replay: out.replay });
  } catch (err) {
    send(res, err, "bulk");
  }
});

router.get("/bulk/:batchId", async (req, res) => {
  try {
    noStore(res);
    const out = await premium.bulkGet(String(req.params.batchId));
    res.json({ batch: out.batch, results: out.results });
  } catch (err) {
    send(res, err, "bulk get");
  }
});

/* ---------------- history, dashboards ---------------- */

router.get("/events", async (req, res) => {
  try {
    noStore(res);
    res.json(await premium.listEvents(req.query || {}));
  } catch (err) {
    send(res, err, "events");
  }
});

router.get("/dashboard", async (_req, res) => {
  try {
    noStore(res);
    res.json(await premium.dashboard());
  } catch (err) {
    send(res, err, "dashboard");
  }
});

router.get("/analytics", async (req, res) => {
  try {
    noStore(res);
    res.json(await premium.analytics(req.query || {}));
  } catch (err) {
    send(res, err, "analytics");
  }
});

router.get("/finance", async (_req, res) => {
  try {
    noStore(res);
    res.json(await premium.finance());
  } catch (err) {
    send(res, err, "finance");
  }
});

router.get("/audit", async (req, res) => {
  try {
    noStore(res);
    res.json(await premium.listAudit(req.query || {}, state.auditLog || []));
  } catch (err) {
    send(res, err, "audit");
  }
});

/* ---------------- campaigns ---------------- */

router.get("/campaigns", async (_req, res) => {
  try {
    noStore(res);
    res.json({ campaigns: await premium.listCampaigns() });
  } catch (err) {
    send(res, err, "campaigns");
  }
});

router.post("/campaigns", async (req, res) => {
  try {
    const campaign = await premium.createCampaign(req.user.id, req.body || {});
    audit(req.user, "premium_campaign_create", campaign.id, { campaign: campaign.code, kind: campaign.kind, plan: campaign.plan_id });
    res.status(201).json({ campaign });
  } catch (err) {
    send(res, err, "campaign create");
  }
});

router.patch("/campaigns/:id", async (req, res) => {
  try {
    const campaign = await premium.updateCampaign(String(req.params.id), req.body || {});
    audit(req.user, "premium_campaign_update", campaign.id, { campaign: campaign.code, active: campaign.active, fields: Object.keys(req.body || {}).slice(0, 15) });
    res.json({ campaign });
  } catch (err) {
    send(res, err, "campaign update");
  }
});

router.get("/campaigns/:id/stats", async (req, res) => {
  try {
    noStore(res);
    res.json(await premium.campaignStats(String(req.params.id)));
  } catch (err) {
    send(res, err, "campaign stats");
  }
});

module.exports = router;
module.exports.logDenied = logDenied;
