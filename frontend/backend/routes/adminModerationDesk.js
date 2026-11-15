"use strict";

/**
 * Moderasyon İşlem masası (section "moderation", Nov 2026 remake). Mounted in
 * routes/admin.js after requireAuth, requireAdmin, the admin rate limit,
 * requireAdmin2fa, requireStepUp (POST / PUT / PATCH / DELETE need a fresh code)
 * and requireAdminSection (every /moderation/* path maps to "moderation").
 * Every write is audited through state.appendAudit and announced to the admin
 * room. Bans are not here: BanDialog posts to /users/:id/ban.
 */

const { apiError } = require("../lib/apiError");
const express = require("express");
const state = require("../runtime/sharedState");
const moderation = require("../lib/moderation");
const desk = require("../lib/moderationDesk");
const model = require("../lib/moderationDeskModel");
const contentFilter = require("../lib/contentFilter");
const core = require("../lib/contentFilterCore");

const router = express.Router();

function audit(actor, action, target, meta) {
  return state.appendAudit(actor.id, actor.username, action, target, meta);
}

function io(req) {
  return req.app.get("io");
}

function notify(req, payload) {
  try {
    require("../socket/adminHandlers").notifyAdminRoom(io(req), payload);
  } catch {
    /* no socket layer */
  }
}

function fail(res, e, label, fallback) {
  const status = e?.status || 500;
  if (status >= 500 && status !== 503) console.error(`[ADMIN] moderation desk ${label} failed:`, e?.message || e);
  return res.status(status).json({ error: status >= 500 && status !== 503 ? fallback : e.message || fallback, code: e?.code || undefined });
}

function idList(raw) {
  return String(raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(desk.isUuid)
    .slice(0, 50);
}

/* ---------- summary, candidates ---------- */

router.get("/moderation/desk", async (_req, res) => {
  try {
    res.json(await desk.deskSummary());
  } catch (e) {
    fail(res, e, "summary", "Could not load the moderation summary.");
  }
});

router.get("/moderation/candidates", async (req, res) => {
  try {
    res.json(await desk.candidates({ filter: req.query.filter, q: req.query.q, ids: idList(req.query.ids) }));
  } catch (e) {
    fail(res, e, "candidates", "Could not load users.");
  }
});

/* ---------- templates ---------- */

router.get("/moderation/templates", async (_req, res) => {
  try {
    res.json(await desk.listTemplates());
  } catch (e) {
    fail(res, e, "templates", "Could not load templates.");
  }
});

router.post("/moderation/templates", async (req, res) => {
  try {
    const tpl = await desk.createTemplate(req.body || {}, req.user.id);
    audit(req.user, "mod_template_create", tpl.id, { name: tpl.name, action: tpl.action, category: tpl.category, durationSeconds: tpl.durationSeconds });
    notify(req, { type: "mod_templates" });
    res.status(201).json({ template: tpl });
  } catch (e) {
    fail(res, e, "template create", "Could not save the template.");
  }
});

router.delete("/moderation/templates/:id", async (req, res) => {
  try {
    const tpl = await desk.archiveTemplate(req.params.id);
    audit(req.user, "mod_template_delete", tpl.id, { name: tpl.name, category: tpl.category });
    notify(req, { type: "mod_templates" });
    res.json({ ok: true });
  } catch (e) {
    fail(res, e, "template delete", "Could not delete the template.");
  }
});

/* ---------- escalation rules ---------- */

router.get("/moderation/rules", async (_req, res) => {
  try {
    res.json(await desk.listRules());
  } catch (e) {
    fail(res, e, "rules", "Could not load the rules.");
  }
});

router.post("/moderation/rules", async (req, res) => {
  try {
    const rule = await desk.saveRule(null, req.body || {}, req.user.id);
    audit(req.user, "mod_rule_create", rule.id, { name: rule.name, categories: rule.categories, windowDays: rule.windowDays, steps: rule.steps });
    notify(req, { type: "mod_rules" });
    res.status(201).json({ rule });
  } catch (e) {
    fail(res, e, "rule create", "Could not save the rule.");
  }
});

router.put("/moderation/rules/:id", async (req, res) => {
  try {
    const rule = await desk.saveRule(req.params.id, req.body || {}, req.user.id);
    audit(req.user, "mod_rule_update", rule.id, { name: rule.name, enabled: rule.enabled, categories: rule.categories, windowDays: rule.windowDays, steps: rule.steps });
    notify(req, { type: "mod_rules" });
    res.json({ rule });
  } catch (e) {
    fail(res, e, "rule update", "Could not save the rule.");
  }
});

router.delete("/moderation/rules/:id", async (req, res) => {
  try {
    const rule = await desk.archiveRule(req.params.id);
    audit(req.user, "mod_rule_delete", rule.id, { name: rule.name });
    notify(req, { type: "mod_rules" });
    res.json({ ok: true });
  } catch (e) {
    fail(res, e, "rule delete", "Could not delete the rule.");
  }
});

router.get("/moderation/escalation", async (req, res) => {
  try {
    const action = ["timeout", "kick", "ban"].includes(req.query.action) ? req.query.action : "timeout";
    const seconds = req.query.seconds == null || req.query.seconds === "" ? null : Number(req.query.seconds) || null;
    const items = await desk.escalationPreview(idList(req.query.userIds), { category: String(req.query.category || ""), action, seconds });
    res.json({ items });
  } catch (e) {
    fail(res, e, "escalation", "Could not check the rules.");
  }
});

/* ---------- bulk timeout / kick (bans go through BanDialog, one by one) ---------- */

router.post("/moderation/bulk", async (req, res) => {
  const body = req.body || {};
  const action = body.action === "kick" ? "kick" : body.action === "timeout" ? "timeout" : null;
  if (!action) return res.status(400).json(apiError("Unknown action.", null, { code: "ACTION_INVALID" }));
  const items = (Array.isArray(body.items) ? body.items : []).filter((it) => desk.isUuid(it?.userId)).slice(0, 50);
  if (!items.length) return res.status(400).json(apiError("Select at least one user.", null, { code: "NO_USERS" }));
  const { category, reason } = moderation.normalizeCategory(body.category, body.otherText);
  if (category === "other" && !String(body.otherText || "").trim()) return res.status(400).json(apiError("Describe the reason for Other.", null, { code: "OTHER_TEXT" }));
  const socketIo = io(req);
  const results = [];
  let targets = {};
  try {
    const supabase = require("../db/supabase");
    const { data } = await supabase.from("users").select("id, username, is_admin").in("id", items.map((i) => i.userId));
    for (const u of data || []) targets[u.id] = u;
  } catch {
    targets = {};
  }
  for (const it of items) {
    const id = it.userId;
    const target = targets[id];
    if (id === req.user.id) {
      results.push({ userId: id, ok: false, code: "SELF" });
      continue;
    }
    if (!target) {
      results.push({ userId: id, ok: false, code: "USER_NOT_FOUND" });
      continue;
    }
    if (target.is_admin || target.username === "admin") {
      results.push({ userId: id, ok: false, code: "ADMIN_PROTECTED" });
      continue;
    }
    const message = String(it.message || "").trim().slice(0, 500) || undefined;
    try {
      if (action === "timeout") {
        const result = await moderation.applyTimeout({
          targetUserId: id,
          actorUserId: req.user.id,
          category: body.category,
          otherText: body.otherText,
          message,
          presetId: body.presetId,
          durationSeconds: body.durationSeconds,
        });
        socketIo?.to?.(`user:${id}`)?.emit?.("system:timeout", result);
        if (body.notify === true) {
          try {
            const { pushNotification } = require("../socket/handlers");
            pushNotification(socketIo, id, {
              type: "moderation_timeout",
              titleKey: "bot.notify.timeoutTitle",
              ...(result.message ? { body: result.message } : { bodyKey: "bot.notify.timeoutBody" }),
              meta: { until: result.until, category: result.category },
            });
          } catch {
            /* best effort */
          }
        }
        audit(req.user, "timeout", id, { category: result.category, reason: result.reason, message: result.message, until: result.until, bulk: items.length > 1, templateId: body.templateId || null, notified: body.notify === true });
        notify(req, { type: "timeout", userId: id, ...result });
        const escalation = await desk.afterSanction({ io: socketIo, userId: id, category: result.category, actionType: "timeout", appliedSeconds: result.durationSeconds }).catch(() => null);
        results.push({ userId: id, ok: true, until: result.until, escalation });
      } else {
        await require("../socket/adminHandlers").kickUser(socketIo, {
          actorId: req.user.id,
          actorUsername: req.user.username,
          targetUserId: id,
          reason: reason || "Kicked",
          action: "kick",
          category,
          message: message || null,
        });
        await moderation.recordAction({ actionType: "kick", targetUserId: id, actorUserId: req.user.id, category, reason, message: message || null, meta: { bulk: items.length > 1 } });
        audit(req.user, "kick", id, { category, reason, message: message || null, bulk: items.length > 1, templateId: body.templateId || null });
        notify(req, { type: "kick", userId: id });
        const escalation = await desk.afterSanction({ io: socketIo, userId: id, category, actionType: "kick" }).catch(() => null);
        results.push({ userId: id, ok: true, escalation });
      }
    } catch (e) {
      results.push({ userId: id, ok: false, code: "FAILED", error: e?.message || "Failed." });
    }
  }
  if (body.templateId && results.some((r) => r.ok)) desk.bumpTemplate(body.templateId).catch(() => {});
  if (body.flaggedId && results.some((r) => r.ok)) {
    await desk.decideFlagged({ io: socketIo, id: String(body.flaggedId), decision: "sanctioned", note: action, actor: req.user }).catch(() => null);
  }
  res.json({ ok: results.some((r) => r.ok), results });
});

/* ---------- active sanctions ---------- */

router.get("/moderation/sanctions", async (_req, res) => {
  try {
    res.json({ items: await desk.listActive() });
  } catch (e) {
    fail(res, e, "sanctions", "Could not load active sanctions.");
  }
});

router.post("/moderation/sanctions/:userId/extend", async (req, res) => {
  try {
    const body = req.body || {};
    const out = await desk.extendSanction({ io: io(req), userId: req.params.userId, type: body.type, seconds: body.seconds, actor: req.user });
    audit(req.user, out.type === "ban" ? "ban_extend" : "timeout_extend", req.params.userId, { from: out.from, until: out.until, seconds: Number(body.seconds) });
    notify(req, { type: "sanction_extend", userId: req.params.userId, sanction: out.type, until: out.until });
    res.json({ ok: true, ...out });
  } catch (e) {
    fail(res, e, "extend", "Could not extend.");
  }
});

router.post("/moderation/sanctions/:userId/lift", async (req, res) => {
  try {
    const body = req.body || {};
    const out = await desk.liftSanction({
      io: io(req),
      userId: req.params.userId,
      type: body.type,
      reasonCode: body.reasonCode,
      note: body.note,
      notify: body.notify === true,
      discount: body.discount === true,
      actor: req.user,
    });
    audit(req.user, out.type === "ban" ? "unban" : "untimeout", req.params.userId, { early: true, reasonCode: out.reasonCode, note: String(body.note || "").trim().slice(0, 500) || null, discount: out.discount, notified: out.notified });
    notify(req, { type: out.type === "ban" ? "unban" : "untimeout", userId: req.params.userId, early: true });
    res.json({ ok: true, ...out });
  } catch (e) {
    fail(res, e, "lift", "Could not lift the sanction.");
  }
});

router.patch("/moderation/sanctions/:userId/message", async (req, res) => {
  try {
    const body = req.body || {};
    const out = await desk.editSanctionMessage({ io: io(req), userId: req.params.userId, type: body.type, message: body.message, actor: req.user });
    audit(req.user, "sanction_message_edit", req.params.userId, { sanction: out.type, message: out.message });
    notify(req, { type: "sanction_message", userId: req.params.userId });
    res.json({ ok: true, type: out.type, message: out.message });
  } catch (e) {
    fail(res, e, "message edit", "Could not save the note.");
  }
});

/* ---------- history ---------- */

router.get("/moderation/history/search", async (req, res) => {
  try {
    res.json(await desk.queryHistory({ ...req.query, all: undefined }));
  } catch (e) {
    fail(res, e, "history", "Could not load history.");
  }
});

router.get("/moderation/history/export", async (req, res) => {
  try {
    const out = await desk.queryHistory({ ...req.query, all: "1" });
    const format = req.query.format === "json" ? "json" : "csv";
    audit(req.user, "moderation_history_export", "history", { format, rows: out.total, days: out.days, type: req.query.type || null, category: req.query.category || null });
    res.set("Cache-Control", "no-store");
    if (format === "json") return res.json({ rows: out.rows, total: out.total, days: out.days });
    res.set("Content-Type", "text/csv; charset=utf-8");
    res.send(model.historyCsv(out.rows));
  } catch (e) {
    fail(res, e, "history export", "Could not export history.");
  }
});

/* ---------- flagged messages ---------- */

router.get("/moderation/flagged", async (req, res) => {
  try {
    const compiled = core.compileRules((await contentFilter.loadRules()).filter((r) => !r.removedAt));
    res.json(await desk.listFlagged({ status: req.query.status, source: req.query.source }, { compiled }));
  } catch (e) {
    fail(res, e, "flagged", "Could not load flagged messages.");
  }
});

router.post("/moderation/flagged/:id/decide", async (req, res) => {
  try {
    const body = req.body || {};
    const out = await desk.decideFlagged({ io: io(req), id: req.params.id, decision: body.decision, note: body.note, actor: req.user });
    audit(req.user, `flagged_${body.decision}`, req.params.id, { author: out.authorId || null, convType: out.convType || null, messageId: out.messageId || null, reportId: out.reportId || null });
    notify(req, { type: "flagged_decided", id: req.params.id, status: out.status });
    res.json({ ok: true, ...out });
  } catch (e) {
    fail(res, e, "flagged decide", "Could not save the decision.");
  }
});

router.get("/moderation/flagged/:id/context", async (req, res) => {
  try {
    const out = await desk.flaggedContext(req.params.id);
    // Reading the messages around a flagged one is a report-purpose read: audited like DM inceleme.
    audit(req.user, "flagged_context_view", req.params.id, { purpose: "report", convType: out.row.conv_type, author: out.row.author_id, count: out.messages.length });
    res.set("Cache-Control", "no-store");
    res.json({ messages: out.messages });
  } catch (e) {
    fail(res, e, "flagged context", "Could not load the context.");
  }
});

/* ---------- word filter ---------- */

function ruleRow(rule, spark) {
  return {
    id: rule.id,
    pattern: rule.pattern,
    display: core.displayPattern(rule),
    kind: rule.kind,
    severity: rule.severity,
    language: rule.language,
    action: rule.action,
    timeoutSeconds: rule.timeoutSeconds,
    source: rule.source,
    hitsTotal: rule.hitsTotal,
    spark: spark || [0, 0, 0, 0, 0, 0, 0],
    hits7d: (spark || []).reduce((a, b) => a + b, 0),
  };
}

router.get("/moderation/filter", async (_req, res) => {
  try {
    await contentFilter.flushHits().catch(() => 0);
    const rules = (await contentFilter.loadRules({ force: true })).filter((r) => !r.removedAt);
    const stats = await contentFilter.hitStats();
    const flagged = await desk.listFlagged({ status: "decided", source: "filter" }, { compiled: null }).catch(() => ({ items: [] }));
    const decided = flagged.items.filter((i) => i.source === "filter");
    const approved = decided.filter((i) => i.status === "approved").length;
    const byLanguage = {};
    for (const r of rules) byLanguage[r.language] = (byLanguage[r.language] || 0) + 1;
    res.json({
      ready: contentFilter.isReady(),
      rules: rules.map((r) => ruleRow(r, stats.byRule.get(r.id))),
      counts: { defaults: rules.filter((r) => r.source === "default").length, admin: rules.filter((r) => r.source !== "default").length, byLanguage },
      stats: {
        matches7d: stats.matches7d,
        blocked7d: stats.blocked7d,
        falsePositiveRate: decided.length ? approved / decided.length : null,
        topWhere: stats.topWhere,
      },
    });
  } catch (e) {
    fail(res, e, "filter", "Could not load the word filter.");
  }
});

router.get("/moderation/filter/test", async (req, res) => {
  try {
    await contentFilter.loadRules();
    const text = String(req.query.text || "").slice(0, core.MAX_TEXT);
    const verdict = contentFilter.check(text);
    res.set("Cache-Control", "no-store");
    res.json({
      matches: (verdict?.matches || []).map(({ start, end, text: t, pattern, kind, severity, action, timeoutSeconds, ruleId }) => ({ start, end, text: t, pattern, kind, severity, action, timeoutSeconds, ruleId })),
      verdict: verdict ? { block: verdict.block, flag: verdict.flag, timeoutSeconds: verdict.timeoutSeconds, severity: verdict.severity, action: verdict.action, count: verdict.count } : null,
    });
  } catch (e) {
    fail(res, e, "filter test", "Could not test the text.");
  }
});

router.post("/moderation/filter/rules", async (req, res) => {
  try {
    const body = req.body || {};
    const rule = await contentFilter.addRule({ input: body.pattern, kind: body.kind, severity: body.severity, language: body.language, action: body.action, timeoutSeconds: body.timeoutSeconds, actorId: req.user.id });
    audit(req.user, "profanity_add", core.displayPattern(rule), { id: rule.id, kind: rule.kind, severity: rule.severity, language: rule.language, action: rule.action });
    notify(req, { type: "word_filter" });
    res.status(201).json({ rule: ruleRow(rule) });
  } catch (e) {
    fail(res, e, "filter add", "Could not add the rule.");
  }
});

router.patch("/moderation/filter/rules/:id", async (req, res) => {
  try {
    const body = req.body || {};
    const out = await contentFilter.updateRule(req.params.id, { severity: body.severity, action: body.action, language: body.language, timeoutSeconds: body.timeoutSeconds });
    audit(req.user, "profanity_update", core.displayPattern(out.after), {
      id: out.after.id,
      from: { severity: out.before.severity, action: out.before.action, language: out.before.language },
      to: { severity: out.after.severity, action: out.after.action, language: out.after.language },
    });
    notify(req, { type: "word_filter" });
    res.json({ rule: ruleRow(out.after) });
  } catch (e) {
    fail(res, e, "filter update", "Could not save the rule.");
  }
});

router.delete("/moderation/filter/rules/:id", async (req, res) => {
  try {
    const rule = await contentFilter.removeRule(req.params.id);
    audit(req.user, "profanity_remove", core.displayPattern(rule), { id: rule.id, source: rule.source });
    notify(req, { type: "word_filter" });
    res.json({ ok: true });
  } catch (e) {
    fail(res, e, "filter remove", "Could not remove the rule.");
  }
});

/* ---------- appeals by user (İtirazlar link) ---------- */

router.get("/moderation/appeals", async (req, res) => {
  try {
    res.json({ appeals: await desk.appealsForUsers(idList(req.query.userIds)) });
  } catch (e) {
    fail(res, e, "appeals", "Could not load appeals.");
  }
});

module.exports = router;
