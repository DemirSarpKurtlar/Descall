"use strict";

/**
 * Admin agent, phase 2 API (mounted from routes/adminAgent.js inside the admin router:
 * requireAuth, requireAdmin, admin 2FA, the step-up check for changes and the "agent"
 * section have already run).
 *
 *   GET    /agent/scopes                     scopes, limits, approval rules
 *   PUT    /agent/scopes                     owner only
 *   GET    /agent/plans?threadId=&view=      plans of a conversation, or history / queue
 *   GET    /agent/plans/:id                  plan + items (+ dry run verdicts) + versions
 *   PATCH  /agent/plans/:id/selection        { itemIds, selected }
 *   POST   /agent/plans/:id/edit             { itemIds, action?, params } -> new version
 *   POST   /agent/plans/:id/dry-run
 *   POST   /agent/plans/:id/discard
 *   POST   /agent/plans/:id/approve          { mode, scheduleAt? }  fresh 2FA code required
 *   POST   /agent/plans/:id/pause | resume | cancel
 *   POST   /agent/plans/:id/undo             { itemIds? }
 *   GET    /agent/prompts, POST /agent/prompts, DELETE /agent/prompts/:id, POST /agent/prompts/:id/use
 *   GET    /agent/tasks, POST /agent/tasks, PATCH /agent/tasks/:id, DELETE /agent/tasks/:id, POST /agent/tasks/:id/run
 *
 * The model cannot call any of these: execution only starts from /approve, sent by an admin.
 */

const express = require("express");
const plans = require("../lib/adminAgent/plans");
const store = require("../lib/adminAgent/planStore");
const model = require("../lib/adminAgent/planModel");
const { userIsSuperAdmin } = require("../middleware/requireAdmin");

const router = express.Router();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STATUS = {
  NO_PLAN: 404, PLAN_LOCKED: 409, BAD_EDIT: 400, BAD_PARAMS: 400, BAD_PLAN: 400, NOTHING_TO_RUN: 400,
  NOTHING_TO_UNDO: 400, BAD_SCHEDULE: 400, DRY_RUN_REQUIRED: 409, NOT_APPROVER: 403, TABLES_MISSING: 503,
  BAD_LIMIT: 400, BAD_TASK: 400, OWNER_ONLY: 403, STEP_UP_REQUIRED: 403, NO_TASK: 404, NO_PROMPT: 404, BAD_ID: 400,
};

function fail(res, err, fallback = "Request failed.") {
  const code = err?.code;
  if (code && STATUS[code]) return res.status(STATUS[code]).json({ error: err.message || fallback, code });
  console.error("[admin-agent plans]", err?.message || err);
  return res.status(500).json({ error: fallback, code: "FAILED" });
}
const err = (code, message) => Object.assign(new Error(message), { code });
const actorOf = (req) => ({ id: req.user.id, username: req.user.username });

router.use("/agent", (req, _res, next) => {
  plans.setIo(req.app.get("io"));
  next();
});

/* ---------------- scopes ---------------- */

function publicScopes(s, owner) {
  return {
    scopes: s.scopes,
    onCount: model.scopeOnCount(s.scopes),
    total: model.SCOPE_IDS.length,
    require2faEach: s.require_2fa_each,
    ownerApprovalPermanent: s.owner_approval_permanent,
    excludePremium: s.exclude_premium,
    updatedAt: s.updated_at || null,
    owner,
    tablesMissing: Boolean(s.missing),
  };
}

router.get("/agent/scopes", async (req, res) => {
  try {
    const [s, owner] = await Promise.all([store.getScopes(), userIsSuperAdmin(req)]);
    res.set("Cache-Control", "no-store");
    res.json(publicScopes(s, owner));
  } catch (e) {
    fail(res, e);
  }
});

router.put("/agent/scopes", async (req, res) => {
  try {
    if (!(await userIsSuperAdmin(req))) throw err("OWNER_ONLY", "Only the owner can change the agent's scopes.");
    const current = await store.getScopes();
    const row = model.applyScopePatch(current, req.body || {});
    const saved = await store.saveScopes(row, req.user.id);
    require("../runtime/sharedState").appendAudit(req.user.id, req.user.username, "agent_scopes", "admin_agent", {
      scopes: Object.fromEntries(Object.entries(row.scopes).map(([k, v]) => [k, v.limit !== undefined ? `${v.on ? "on" : "off"}/${v.limit}` : v.on ? "on" : "off"])),
      require2faEach: row.require_2fa_each,
      ownerApprovalPermanent: row.owner_approval_permanent,
      excludePremium: row.exclude_premium,
    });
    res.json(publicScopes(saved, true));
  } catch (e) {
    fail(res, e);
  }
});

/* ---------------- plans ---------------- */

/** Plans with their item counts; `latestOnly` drops superseded versions. */
async function plansWithCounts(rows) {
  const items = await store.itemsForPlans(rows.map((r) => r.id));
  const byPlan = new Map();
  for (const i of items) {
    if (!byPlan.has(i.plan_id)) byPlan.set(i.plan_id, []);
    byPlan.get(i.plan_id).push(i);
  }
  return rows.map((r) => {
    const list = byPlan.get(r.id) || [];
    const p = plans.publicPlan(r, list);
    p.itemCount = list.length;
    p.selectedCount = list.filter((i) => i.selected && i.status !== "excluded").length;
    p.actions = [...new Set(list.map((i) => i.action))];
    p.preview = list.filter((i) => i.target_username).slice(0, 5).map((i) => i.target_username);
    return p;
  });
}

router.get("/agent/plans", async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    const view = String(req.query.view || "");
    let rows;
    if (req.query.threadId) {
      if (!UUID.test(String(req.query.threadId))) throw err("BAD_ID", "Invalid conversation.");
      rows = await store.listPlans({ threadId: String(req.query.threadId), limit: 50 });
    } else if (view === "queue") {
      rows = await store.listPlans({ statuses: ["running", "paused", "scheduled"], limit: 20 });
    } else {
      rows = (await store.listPlans({ limit: 80 })).filter((p) => p.status !== "superseded");
    }
    res.json({ plans: await plansWithCounts(rows) });
  } catch (e) {
    fail(res, e);
  }
});

function planId(req) {
  const id = String(req.params.id || "");
  if (!UUID.test(id)) throw err("BAD_ID", "Invalid plan.");
  return id;
}

router.get("/agent/plans/:id", async (req, res) => {
  try {
    const v = await plans.view(planId(req));
    if (!v) throw err("NO_PLAN", "Plan not found.");
    res.set("Cache-Control", "no-store");
    res.json(v);
  } catch (e) {
    fail(res, e);
  }
});

router.patch("/agent/plans/:id/selection", async (req, res) => {
  try {
    const id = planId(req);
    await plans.setSelection(id, actorOf(req), { itemIds: req.body?.itemIds, selected: req.body?.selected !== false });
    res.json(await plans.view(id));
  } catch (e) {
    fail(res, e);
  }
});

router.post("/agent/plans/:id/edit", async (req, res) => {
  try {
    const created = await plans.editItems(planId(req), actorOf(req), {
      itemIds: req.body?.itemIds,
      action: req.body?.action ? String(req.body.action) : null,
      params: req.body?.params,
    });
    res.json(await plans.view(created.id));
  } catch (e) {
    fail(res, e);
  }
});

router.post("/agent/plans/:id/dry-run", async (req, res) => {
  try {
    const id = planId(req);
    const plan = await store.getPlan(id);
    if (!plan) throw err("NO_PLAN", "Plan not found.");
    if (plan.status !== "proposed") throw err("PLAN_LOCKED", "Only a proposed plan has a dry run.");
    await plans.dryRun(plan, await store.getItems(id), actorOf(req));
    res.json(await plans.view(id));
  } catch (e) {
    fail(res, e);
  }
});

router.post("/agent/plans/:id/discard", async (req, res) => {
  try {
    const p = await plans.discard(planId(req), actorOf(req));
    res.json(await plans.view(p.id));
  } catch (e) {
    fail(res, e);
  }
});

/**
 * Approval needs a code entered just now (not just within the 15-minute step-up window)
 * when the owner keeps "Her toplu işlemde 2FA iste" on. The client clears its token and
 * the step-up host asks for a new code on STEP_UP_REQUIRED.
 */
async function requireFreshCode(req) {
  const s = await store.getScopes();
  if (!s.require_2fa_each || !req.adminTotpKnown) return;
  const raw = req.get("x-admin-step-up");
  let decoded = null;
  try {
    decoded = raw ? require("../config/jwt").verifyToken(String(raw)) : null;
  } catch {
    decoded = null;
  }
  const own = decoded && decoded.sub === req.user.id && (decoded.sid || null) === (req.user.sid || null);
  if (!own || !model.stepUpFresh(decoded)) throw err("STEP_UP_REQUIRED", "Enter a new verification code to approve this plan.");
}

router.post("/agent/plans/:id/approve", async (req, res) => {
  try {
    const id = planId(req);
    await requireFreshCode(req);
    const mode = req.body?.mode === "dry" ? "dry" : "apply";
    await plans.approve(id, actorOf(req), { mode, scheduleAt: req.body?.scheduleAt || null });
    res.json(await plans.view(id));
  } catch (e) {
    fail(res, e);
  }
});

for (const op of ["pause", "resume", "cancel"]) {
  router.post(`/agent/plans/:id/${op}`, async (req, res) => {
    try {
      const id = planId(req);
      await plans[op](id, actorOf(req));
      res.json(await plans.view(id));
    } catch (e) {
      fail(res, e);
    }
  });
}

router.post("/agent/plans/:id/undo", async (req, res) => {
  try {
    const id = planId(req);
    const ids = Array.isArray(req.body?.itemIds) ? req.body.itemIds.map(String).filter((x) => UUID.test(x)) : null;
    const out = await plans.undo(id, actorOf(req), { itemIds: ids });
    res.json({ ...(await plans.view(id)), undo: out });
  } catch (e) {
    fail(res, e);
  }
});

/* ---------------- saved prompts ---------------- */

function publicPrompt(p, me) {
  return { id: p.id, title: p.title, prompt: p.prompt, shared: p.shared, mine: String(p.admin_id) === String(me), useCount: p.use_count || 0, lastUsedAt: p.last_used_at || null, createdAt: p.created_at };
}

router.get("/agent/prompts", async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    res.json({ prompts: (await store.listPrompts(req.user.id)).map((p) => publicPrompt(p, req.user.id)) });
  } catch (e) {
    fail(res, e);
  }
});

router.post("/agent/prompts", async (req, res) => {
  try {
    const title = model.clip(req.body?.title, 80);
    const prompt = model.clip(req.body?.prompt, 2000);
    if (!title || !prompt) throw err("BAD_TASK", "Title and prompt are required.");
    const row = await store.createPrompt(req.user.id, { title, prompt, shared: req.body?.shared === true });
    res.status(201).json({ prompt: publicPrompt(row, req.user.id) });
  } catch (e) {
    fail(res, e);
  }
});

router.post("/agent/prompts/:id/use", async (req, res) => {
  try {
    if (!UUID.test(String(req.params.id))) throw err("BAD_ID", "Invalid prompt.");
    const p = await store.getPrompt(req.params.id);
    if (!p || (!p.shared && String(p.admin_id) !== String(req.user.id))) throw err("NO_PROMPT", "Prompt not found.");
    await store.touchPrompt(p.id, p.use_count || 0);
    res.json({ ok: true });
  } catch (e) {
    fail(res, e);
  }
});

router.delete("/agent/prompts/:id", async (req, res) => {
  try {
    if (!UUID.test(String(req.params.id))) throw err("BAD_ID", "Invalid prompt.");
    const p = await store.getPrompt(req.params.id);
    if (!p) throw err("NO_PROMPT", "Prompt not found.");
    if (String(p.admin_id) !== String(req.user.id) && !(await userIsSuperAdmin(req))) throw err("OWNER_ONLY", "Only its author or the owner can delete it.");
    await store.deletePrompt(p.id);
    res.json({ ok: true });
  } catch (e) {
    fail(res, e);
  }
});

/* ---------------- scheduled tasks ---------------- */

function publicTask(t, me) {
  return {
    id: t.id, title: t.title, prompt: t.prompt, every: t.every, atMinute: t.at_minute, weekday: t.weekday,
    enabled: t.enabled, nextRunAt: t.next_run_at, lastRunAt: t.last_run_at, lastStatus: t.last_status,
    lastError: t.last_error, lastPlanId: t.last_plan_id, lastThreadId: t.last_thread_id, runCount: t.run_count || 0,
    adminId: t.admin_id, adminUsername: t.admin_username, mine: String(t.admin_id) === String(me), createdAt: t.created_at,
  };
}

async function ownTask(req) {
  if (!UUID.test(String(req.params.id))) throw err("BAD_ID", "Invalid task.");
  const t = await store.getTask(req.params.id);
  if (!t) throw err("NO_TASK", "Task not found.");
  if (String(t.admin_id) !== String(req.user.id) && !(await userIsSuperAdmin(req))) throw err("OWNER_ONLY", "Only its author or the owner can change it.");
  return t;
}

router.get("/agent/tasks", async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    res.json({ tasks: (await store.listTasks()).map((t) => publicTask(t, req.user.id)) });
  } catch (e) {
    fail(res, e);
  }
});

router.post("/agent/tasks", async (req, res) => {
  try {
    const t = model.normalizeTask(req.body || {});
    const row = await store.createTask({
      ...t,
      admin_id: req.user.id,
      admin_username: req.user.username,
      session_id: req.user.sid || null,
      enabled: true,
      next_run_at: model.nextRunAt({ every: t.every, atMinute: t.at_minute, weekday: t.weekday }),
    });
    require("../runtime/sharedState").appendAudit(req.user.id, req.user.username, "agent_task_create", row.id, { title: row.title, every: row.every });
    res.status(201).json({ task: publicTask(row, req.user.id) });
  } catch (e) {
    fail(res, e);
  }
});

router.patch("/agent/tasks/:id", async (req, res) => {
  try {
    const t = await ownTask(req);
    const patch = {};
    if (typeof req.body?.enabled === "boolean") {
      patch.enabled = req.body.enabled;
      if (req.body.enabled) {
        // Turning a task back on binds it to this admin's current session.
        patch.session_id = req.user.sid || null;
        patch.next_run_at = model.nextRunAt({ every: t.every, atMinute: t.at_minute, weekday: t.weekday });
        if (t.last_status === "session_ended") patch.last_status = null;
      }
    }
    if (req.body?.title !== undefined || req.body?.prompt !== undefined || req.body?.every !== undefined || req.body?.atMinute !== undefined) {
      const n = model.normalizeTask({
        title: req.body.title ?? t.title, prompt: req.body.prompt ?? t.prompt, every: req.body.every ?? t.every,
        atMinute: req.body.atMinute ?? t.at_minute, weekday: req.body.weekday ?? t.weekday,
      });
      Object.assign(patch, n, { next_run_at: model.nextRunAt({ every: n.every, atMinute: n.at_minute, weekday: n.weekday }) });
    }
    const row = await store.updateTask(t.id, patch);
    res.json({ task: publicTask(row, req.user.id) });
  } catch (e) {
    fail(res, e);
  }
});

router.delete("/agent/tasks/:id", async (req, res) => {
  try {
    const t = await ownTask(req);
    await store.deleteTask(t.id);
    require("../runtime/sharedState").appendAudit(req.user.id, req.user.username, "agent_task_delete", t.id, { title: t.title });
    res.json({ ok: true });
  } catch (e) {
    fail(res, e);
  }
});

router.post("/agent/tasks/:id/run", async (req, res) => {
  try {
    const t = await ownTask(req);
    // Run now with this admin's current session.
    const row = await store.updateTask(t.id, { session_id: req.user.sid || t.session_id, next_run_at: new Date().toISOString(), enabled: true });
    require("../lib/adminAgent/scheduler").kick();
    res.json({ task: publicTask(row, req.user.id) });
  } catch (e) {
    fail(res, e);
  }
});

module.exports = router;
module.exports.publicTask = publicTask;
