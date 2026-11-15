"use strict";

/**
 * Yönetici Paneli › Vitrin ve Setler (Market 2.0 admin, owner pick drafts A + B).
 * Mount: app.use("/api/admin/shop2", require("./routes/adminShop2")) (and "/admin/shop2"),
 * BEFORE app.use("/api/admin", adminRoutes): the router carries the full admin chain itself
 * (requireAuth, requireAdmin, adminRateLimit, requireAdmin2fa, audit context, step-up for every
 * change, section "shop"; wallet freezes also need "casino"). Every write is audited with an
 * action starting "shop2_" (state.appendAudit -> admin_audit), so İşlem kaydı and
 * GET /audit here show it. `module.exports.routes` is the bare router (tests, or mounting
 * inside routes/admin.js after its chain).
 */

const express = require("express");
const state = require("../runtime/sharedState");
const { requireAuth } = require("../middleware/auth");
const { requireAdmin } = require("../middleware/requireAdmin");
const { adminRateLimit } = require("../middleware/adminRateLimit");
const { requireAdmin2fa, requireStepUp } = require("../middleware/adminSecondFactor");
const { requireSection } = require("../lib/adminPermissions");
const { edgePublicBase } = require("../lib/edgeConfig");
const events = require("../lib/shop2/events");
const admin = require("../lib/shop2/admin");
const ops = require("../lib/shop2/adminOps");
const sfs = require("../lib/shop2/storefrontService");
const { errorResponse, MESSAGES } = require("../lib/shop2/messages");

const routes = express.Router();

/** Admin error codes the UI localizes (adminShop2.err.<code>), English text for old clients. */
const ADMIN_MESSAGES = {
  reason_required: "Write a reason.",
  bad_set_key: "Set key must be 2-41 lowercase letters, digits or dashes.",
  set_exists: "A set with this key already exists.",
  bad_time: "Invalid time.",
  bad_window: "Invalid time window.",
  bad_option: "Invalid option.",
  bad_replace: "Choose the piece to replace and its replacement.",
  set_recalled: "This set is recalled.",
  not_draft: "Only drafts can be deleted.",
  ab_running: "This set already has a running price test.",
  ab_same_price: "The two prices must differ.",
  not_scheduled: "This version is not scheduled.",
  night_open: "A night market is already open.",
  night_started: "This night market has already started.",
  title_required: "Write a title.",
};

function base(req) {
  return edgePublicBase() || `${req.protocol}://${req.get("host")}`;
}

function audit(req, action, target, meta) {
  return state.appendAudit(req.user.id, req.user.username, `shop2_${action}`, target == null ? null : String(target), meta || {});
}

function handle(fn) {
  return async (req, res) => {
    events.bind(req.app.get("io"));
    try {
      res.set("Cache-Control", "no-store");
      const out = await fn(req, res);
      if (out !== undefined && !res.headersSent) res.json(out);
    } catch (err) {
      if (err && err.code && ADMIN_MESSAGES[err.code] && err.status && err.status < 500) {
        return res.status(err.status).json({ error: ADMIN_MESSAGES[err.code], code: err.code });
      }
      const { status, body } = errorResponse(err);
      if (status >= 500) console.error(`[admin/shop2] ${req.method} ${req.path}:`, err?.stack || err?.message || err);
      if (!res.headersSent) res.status(status).json(body);
    }
    return undefined;
  };
}

function actor(req) {
  return { actorId: req.user.id };
}

function reasonOf(req) {
  const r = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  if (r.length < 3) {
    const err = new Error("reason_required");
    err.code = "reason_required";
    err.status = 400;
    throw err;
  }
  return r.slice(0, 300);
}

/* ---------------------------------------------------------------- dashboard */

routes.get("/dashboard", handle(() => admin.dashboard()));
routes.get("/sales/live", handle((req) => admin.liveSales({ since: typeof req.query.since === "string" ? req.query.since : null })));

/* ---------------------------------------------------------------- sets */

routes.get("/sets", handle(() => admin.listSets()));

routes.get(
  "/sets/:key",
  handle(async (req, res) => {
    const d = await admin.setDetail(String(req.params.key), { base: base(req) });
    if (!d) {
      res.status(404).json({ error: MESSAGES.not_found, code: "not_found" });
      return undefined;
    }
    return d;
  })
);

routes.get("/sets/:key/suggestions", handle(async (req) => {
  const set = await require("../lib/shop2/catalog").getSet(String(req.params.key));
  if (!set) return { suggestions: [] };
  return { suggestions: admin.paletteSuggestions(set, await require("../lib/shop2/catalog").getCatalog(), { category: typeof req.query.category === "string" ? req.query.category : null, limit: 24 }) };
}));

routes.post("/sets", handle(async (req) => {
  const row = await admin.createSet(req.body || {}, actor(req));
  audit(req, "set_create", row.set_key, { name: row.name?.en || row.name?.tr, discountPct: row.discount_pct, startsAt: row.starts_at, endsAt: row.ends_at, stockLimit: row.stock_limit });
  return { ok: true, set: row };
}));

routes.patch("/sets/:key", handle(async (req) => {
  const key = String(req.params.key);
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, 300) : null;
  const row = await admin.updateSet(key, req.body || {}, { ...actor(req), reason });
  audit(req, "set_update", key, { fields: Object.keys(req.body || {}).filter((k) => k !== "reason"), reason, version: row.version });
  return { ok: true, set: row };
}));

routes.post("/sets/:key/shift", handle(async (req) => {
  const key = String(req.params.key);
  const row = await admin.shiftSet(key, req.body?.days, actor(req));
  audit(req, "set_shift", key, { days: Number(req.body?.days) || 0 });
  return { ok: true, set: row };
}));

routes.post("/sets/:key/publish", handle(async (req) => {
  const key = String(req.params.key);
  const out = await admin.publish(key, { at: req.body?.at || null, ...actor(req) });
  audit(req, "set_publish", key, { at: req.body?.at || "now", undoUntil: out.undoUntil });
  return { ok: true, ...out };
}));

routes.post("/sets/:key/publish/undo", handle(async (req) => {
  const key = String(req.params.key);
  const out = await admin.undoPublish(key, actor(req));
  audit(req, "set_publish_undo", key, {});
  return { ok: true, ...out };
}));

routes.get("/sets/:key/recall-preview", handle((req) => admin.recallPreview(String(req.params.key), { option: typeof req.query.option === "string" ? req.query.option : "keep" })));

routes.post("/sets/:key/recall", handle(async (req) => {
  const key = String(req.params.key);
  const reason = reasonOf(req);
  const out = await admin.recall(key, { reason, option: req.body?.option || "keep", replace: req.body?.replace || null, ...actor(req) });
  audit(req, "set_recall", key, { option: req.body?.option || "keep", reason, preview: out.preview, undoUntil: out.undoUntil });
  return { ok: true, ...out };
}));

routes.post("/sets/:key/recall/undo", handle(async (req) => {
  const key = String(req.params.key);
  const out = await admin.undoRecall(key, actor(req));
  audit(req, "set_recall_undo", key, {});
  return { ok: true, ...out };
}));

routes.post("/sets/:key/restore", handle(async (req) => {
  const key = String(req.params.key);
  const row = await admin.restoreVersion(key, req.body?.version, actor(req));
  audit(req, "set_restore", key, { version: Number(req.body?.version) });
  return { ok: true, set: row };
}));

routes.delete("/sets/:key", handle(async (req) => {
  const key = String(req.params.key);
  const out = await admin.deleteDraft(key);
  audit(req, "set_delete", key, {});
  return out;
}));

/* ---------------------------------------------------------------- rules */

routes.get("/rules", handle(() => ops.rulesOverview()));
routes.get("/rules/:version", handle((req) => ops.getRuleVersion(req.params.version)));

routes.post("/rules", handle(async (req) => {
  const v = await ops.createRuleVersion(req.body || {}, actor(req));
  audit(req, "rules_create", v.version, { basedOn: v.basedOn, note: v.note });
  return { ok: true, version: v };
}));

/** Simulate a saved version ({ version }) or unsaved rules ({ rules }) on N sample users. */
routes.post("/rules/simulate", handle((req) => ops.simulateRules(req.body || {})));

routes.post("/rules/:version/schedule", handle(async (req) => {
  const v = await ops.scheduleRuleVersion(req.params.version, { at: req.body?.at || null, ...actor(req) });
  audit(req, "rules_schedule", req.params.version, { applyAt: v?.applyAt });
  return { ok: true, version: v };
}));

routes.post("/rules/:version/activate", handle(async (req) => {
  const reason = reasonOf(req);
  const v = await ops.activateRuleVersion(req.params.version);
  audit(req, "rules_activate", req.params.version, { reason });
  return { ok: true, version: v };
}));

routes.post("/rules/:version/cancel", handle(async (req) => {
  const v = await ops.cancelRuleSchedule(req.params.version);
  audit(req, "rules_cancel", req.params.version, {});
  return { ok: true, version: v };
}));

/* ---------------------------------------------------------------- user storefront drawer */

routes.get("/users", handle(async (req) => ({ users: await admin.searchUsers(req.query.q) })));

routes.get("/users/:id/storefront", handle(async (req, res) => {
  const d = await admin.userStorefront(String(req.params.id), req.query.day === "tomorrow" ? "tomorrow" : "today", { base: base(req) });
  if (!d) {
    res.status(404).json({ error: MESSAGES.not_found, code: "not_found" });
    return undefined;
  }
  return d;
}));

routes.post("/users/:id/storefront/free-refresh", handle(async (req) => {
  const reason = reasonOf(req);
  const st = await sfs.grantFreeRefresh(String(req.params.id), 1);
  audit(req, "free_refresh", req.params.id, { reason, freeRefreshes: st.free_refreshes });
  return { ok: true, freeRefreshes: st.free_refreshes };
}));

routes.post("/users/:id/storefront/regenerate", handle(async (req) => {
  const reason = reasonOf(req);
  const row = await sfs.regenerate(String(req.params.id));
  audit(req, "storefront_regenerate", req.params.id, { reason, seed: row.seed, regen: row.regen });
  return { ok: true, seed: row.seed, regen: row.regen };
}));

/* ---------------------------------------------------------------- night markets */

routes.get("/night-markets", handle((req) => ops.nightsOverview({ from: typeof req.query.from === "string" ? req.query.from : null, days: Number(req.query.days) || 21 })));
routes.post("/night-markets/preview", handle((req) => ops.previewNight(req.body || {}, { base: base(req) })));
routes.get("/night-markets/:id/report", handle((req) => require("../lib/shop2/night").report(String(req.params.id))));

routes.post("/night-markets", handle(async (req) => {
  const n = await ops.createNight(req.body || {}, actor(req));
  audit(req, "night_create", n.id, { startsAt: n.startsAt, endsAt: n.endsAt, mode: n.mode });
  return { ok: true, night: n };
}));

routes.patch("/night-markets/:id", handle(async (req) => {
  const n = await ops.updateNight(String(req.params.id), req.body || {}, actor(req));
  audit(req, "night_update", req.params.id, { fields: Object.keys(req.body || {}) });
  return { ok: true, night: n };
}));

routes.post("/night-markets/open-now", handle(async (req) => {
  const out = await ops.openNow(req.body || {}, actor(req));
  audit(req, "night_open_now", out.night.id, { reason: req.body?.reason, endsAt: out.night.endsAt, undoUntil: out.undoUntil });
  return { ok: true, ...out };
}));

routes.post("/night-markets/:id/undo", handle(async (req) => {
  const n = await ops.undoOpen(String(req.params.id));
  audit(req, "night_open_undo", req.params.id, {});
  return { ok: true, night: n };
}));

routes.post("/night-markets/:id/skip", handle(async (req) => {
  const reason = reasonOf(req);
  const n = await ops.setNightStatus(String(req.params.id), "skipped", actor(req));
  audit(req, "night_skip", req.params.id, { reason });
  return { ok: true, night: n };
}));

routes.delete("/night-markets/:id", handle(async (req) => {
  const out = await ops.deleteNight(String(req.params.id));
  audit(req, "night_delete", req.params.id, {});
  return out;
}));

/* ---------------------------------------------------------------- limits + gift safety */

routes.get("/limits", handle(() => ops.limitsOverview()));
routes.post("/limits/impact", handle((req) => ops.limitsImpact(req.body || {})));

routes.put("/limits", handle(async (req) => {
  const out = await ops.putLimits(req.body || {}, actor(req));
  audit(req, "limits_update", "limits", { version: out.version, reason: req.body?.reason, changes: out.changes });
  return { ok: true, ...out };
}));

routes.post("/limits/undo", handle(async (req) => {
  const out = await ops.undoLimits(actor(req));
  audit(req, "limits_undo", "limits", { version: out.version });
  return { ok: true, ...out };
}));

routes.post("/gifts/freeze", handle(async (req) => {
  const out = await ops.freezeGifts(req.body?.frozen !== false, { reason: req.body?.reason, ...actor(req) });
  audit(req, req.body?.frozen !== false ? "gifts_freeze" : "gifts_unfreeze", "gifts", { reason: req.body?.reason, version: out.version });
  return { ok: true, ...out };
}));

routes.get("/gifts/flags", handle(() => ops.flagsView()));

routes.post("/gifts/flags/:id/resolve", requireSection("casino"), handle(async (req) => {
  const out = await ops.resolveFlag(String(req.params.id), req.body?.action, { reason: req.body?.reason, ...actor(req) });
  audit(req, "gift_flag_resolve", req.params.id, { action: req.body?.action, reason: req.body?.reason, users: out?.users || [] });
  return { ok: true, flag: out };
}));

/* ---------------------------------------------------------------- timeline + queue */

routes.get("/timeline", handle((req) => ops.timeline({ from: typeof req.query.from === "string" ? req.query.from : null, days: Number(req.query.days) || 14 })));
routes.get("/queue", handle(async () => ({ queue: await ops.listQueue() })));

routes.post("/queue/:id/cancel", handle(async (req) => {
  const row = await ops.cancelQueueItem(String(req.params.id), actor(req));
  audit(req, "queue_cancel", req.params.id, { kind: row.kind, ref: row.ref });
  return { ok: true };
}));

routes.post("/timeline/events", handle(async (req) => {
  const ev = await ops.createEvent(req.body || {}, actor(req));
  audit(req, "event_create", ev?.id, { title: ev?.title, startsAt: ev?.starts_at });
  return { ok: true, event: ev };
}));

routes.delete("/timeline/events/:id", handle(async (req) => {
  const out = await ops.deleteEvent(String(req.params.id));
  audit(req, "event_delete", req.params.id, {});
  return out;
}));

/* ---------------------------------------------------------------- A/B price tests */

routes.get("/ab-tests", handle(() => admin.listAbTests()));

routes.post("/ab-tests", handle(async (req) => {
  const t = await admin.createAbTest(req.body || {}, actor(req));
  audit(req, "ab_create", t.id, { setKey: t.setKey, discountA: t.discountA, discountB: t.discountB, split: t.split });
  return { ok: true, test: t };
}));

routes.post("/ab-tests/:id/stop", handle(async (req) => {
  const t = await admin.stopAbTest(String(req.params.id), { winner: req.body?.winner || null, ...actor(req) });
  audit(req, "ab_stop", req.params.id, { winner: t.winner });
  return { ok: true, test: t };
}));

/* ---------------------------------------------------------------- audit */

routes.get("/audit", handle((req) => ops.audit({ limit: Number(req.query.limit) || 100, before: typeof req.query.before === "string" ? req.query.before : null })));

routes.use((req, res) => res.status(404).json({ error: MESSAGES.not_found, code: "not_found" }));

/* ---------------------------------------------------------------- mounted router */

// Reads sent as POST: they change nothing, so no step-up code.
const STEP_UP_FREE = [/^\/rules\/simulate\/?$/, /^\/limits\/impact\/?$/, /^\/night-markets\/preview\/?$/];

function stepUp(req, res, next) {
  if (STEP_UP_FREE.some((re) => re.test(req.path || ""))) return next();
  return requireStepUp(req, res, next);
}

const router = express.Router();
router.use(requireAuth, requireAdmin, adminRateLimit, requireAdmin2fa);
router.use(require("../lib/auditRuntime").contextMiddleware);
router.use(stepUp);
router.use(requireSection("shop"));
router.use(routes);

module.exports = router;
module.exports.routes = routes;
module.exports.ADMIN_MESSAGES = ADMIN_MESSAGES;
