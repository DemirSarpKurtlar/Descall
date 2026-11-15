"use strict";

/**
 * Canlı popup (admin section "livepopup", remake of Nov 2026, Draft B "Kontrol
 * merkezi"). Mounted inside routes/admin.js after requireAuth, requireAdmin,
 * the admin rate limit, requireAdmin2fa, requireStepUp (every POST / PUT /
 * DELETE needs a fresh code, except the audience estimate) and
 * requireAdminSection (every /popup/* path is section "livepopup").
 *
 * Sending, scheduling, recalling, resending, "Düzeldi", ending, templates and
 * exemptions are audited through state.appendAudit with the campaign id and
 * counts; sending and recalling need a written note (it goes to the audit log).
 */

const express = require("express");
const state = require("../runtime/sharedState");
const engine = require("../lib/livePopup/engine");
const model = require("../lib/livePopup/model");
const store = require("../lib/livePopup/store");
const popupBroadcast = require("../lib/adminBroadcastPopup");
const { notifyAdminRoom } = require("../socket/adminHandlers");

const router = express.Router();

function audit(actor, action, target, meta) {
  return state.appendAudit(actor.id, actor.username, action, target, meta);
}

function io(req) {
  return req.app.get("io");
}

function fail(res, e, label, fallback) {
  const status = e?.status || 500;
  if (status >= 500) console.error(`[ADMIN] live popup ${label} failed:`, e?.message || e);
  return res.status(status).json({ error: status >= 500 ? fallback : e.message || fallback, code: e?.code || undefined });
}

function bad(res, r) {
  return res.status(400).json({ error: r.error, code: r.code });
}

// Every handler makes sure the engine (scheduler, memory) is running with this io.
router.use("/popup", (req, _res, next) => {
  try {
    engine.attachIo(io(req));
  } catch {
    /* engine optional */
  }
  next();
});

function parseSchedule(raw) {
  if (raw == null || raw === "") return { ok: true, at: null };
  const t = Date.parse(String(raw));
  if (!Number.isFinite(t)) return model.fail("BAD_SCHEDULE");
  if (t < Date.now() + 60_000) return model.fail("SCHEDULE_PAST");
  if (t > Date.now() + 60 * 86400000) return model.fail("SCHEDULE_FAR");
  return { ok: true, at: new Date(t).toISOString() };
}

/* ---------------- reads ---------------- */

router.get("/popup/overview", async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    res.json(await engine.overview());
  } catch (e) {
    fail(res, e, "overview", "Could not load live popups.");
  }
});

router.get("/popup/campaigns", async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    res.json({ campaigns: await engine.listHistory({ limit: Math.min(200, Number(req.query?.limit) || 100) }), persistent: store.available() });
  } catch (e) {
    fail(res, e, "history", "Could not load the popup history.");
  }
});

router.get("/popup/campaigns/:id", async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    res.json(await engine.detail(req.params.id));
  } catch (e) {
    fail(res, e, "detail", "Could not load this popup.");
  }
});

router.get("/popup/campaigns/:id/receipts", async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    res.json(
      await engine.receiptsPage(req.params.id, {
        filter: req.query?.filter,
        q: req.query?.q,
        platform: req.query?.platform,
        offset: req.query?.offset,
        limit: req.query?.limit,
      })
    );
  } catch (e) {
    fail(res, e, "receipts", "Could not load the recipients.");
  }
});

router.get("/popup/campaigns/:id/export", async (req, res) => {
  try {
    const out = await engine.exportCsv(req.params.id);
    audit(req.user, "live_popup_export", req.params.id, { rows: out.count, title: out.title });
    res.set("Cache-Control", "no-store");
    res.json({ csv: out.csv, rows: out.count, filename: `popup-${req.params.id.slice(0, 8)}.csv` });
  } catch (e) {
    fail(res, e, "export", "Could not export the recipients.");
  }
});

router.get("/popup/audience/users", async (req, res) => {
  try {
    const rows = await store.searchUsers(req.query?.q, 8);
    res.json({ users: rows.map((u) => ({ id: u.id, username: u.username, displayName: u.display_name || null, avatarUrl: u.avatar_url || null })) });
  } catch (e) {
    fail(res, e, "user search", "Search failed.");
  }
});

router.get("/popup/audience/servers", async (req, res) => {
  try {
    const rows = await store.searchServers(req.query?.q, 8);
    const servers = await Promise.all(
      rows.map(async (s) => ({ id: s.id, name: s.name, iconUrl: s.icon_url || null, members: await store.serverMemberCount(s.id).catch(() => null) }))
    );
    res.json({ servers });
  } catch (e) {
    fail(res, e, "server search", "Search failed.");
  }
});

// Read-only estimate (path ends in /preview: no step-up code).
router.post("/popup/audience/preview", async (req, res) => {
  try {
    const severity = model.SEVERITIES.includes(req.body?.severity) ? req.body.severity : "info";
    res.json(await engine.audiencePreview({ audience: req.body?.audience, actorId: req.user.id, includeSelf: Boolean(req.body?.includeSelf), severity }));
  } catch (e) {
    fail(res, e, "audience", "Could not estimate the audience.");
  }
});

router.get("/popup/users/:userId/history", async (req, res) => {
  if (!model.isUuid(req.params.userId)) return res.status(400).json(model.fail("BAD_USER"));
  try {
    res.set("Cache-Control", "no-store");
    res.json(await engine.userHistory(req.params.userId));
  } catch (e) {
    return fail(res, e, "user history", "Could not load this person's popups.");
  }
});

/* ---------------- send / schedule ---------------- */

router.post("/popup/campaigns", async (req, res) => {
  const body = req.body || {};
  const content = model.normalizeContent(body.content || body);
  if (!content.ok) return bad(res, content);
  const note = model.cleanNote(body.note);
  if (!note.ok) return bad(res, note);
  const when = parseSchedule(body.scheduleAt);
  if (!when.ok) return bad(res, when);
  const audience = model.normalizeAudience(body.audience);
  if (!when.at) {
    const rate = popupBroadcast.checkRateLimit(req.user.id);
    if (!rate.ok) return res.status(429).json({ error: rate.error, code: "RATE_LIMITED", retryAfterMs: rate.retryAfterMs });
  }
  try {
    const entry = await engine.createCampaign({
      content: content.content,
      audience,
      includeSelf: Boolean(body.includeSelf),
      scheduleAt: when.at,
      note: note.note,
      templateId: typeof body.templateId === "string" && model.isUuid(body.templateId) ? body.templateId : null,
      actor: req.user,
    });
    const c = entry.c;
    if (!when.at) popupBroadcast.rememberSend({ actorId: req.user.id, actorUsername: req.user.username, popup: model.toWirePopup(c), delivered: entry.receipts.size, audience: "rules" });
    const stats = model.statsSnapshot(model.computeStats([...entry.receipts.values()], { sentAt: c.sent_at }));
    audit(req.user, when.at ? "live_popup_schedule" : "live_popup", c.id, {
      id: c.id,
      title: c.title,
      severity: c.severity,
      note: note.note,
      rules: audience.rules.map((r) => r.type),
      ...(when.at ? { scheduledAt: when.at } : { targeted: stats.targeted, missed: stats.missed }),
    });
    if (!when.at) notifyAdminRoom(io(req), { type: "live_popup", delivered: stats.targeted - stats.missed, title: c.title });
    res.json({ ok: true, id: c.id, status: c.status, stats });
  } catch (e) {
    fail(res, e, "send", "Could not send the popup.");
  }
});

router.put("/popup/campaigns/:id", async (req, res) => {
  const body = req.body || {};
  const content = model.normalizeContent(body.content || body);
  if (!content.ok) return bad(res, content);
  const when = parseSchedule(body.scheduleAt);
  if (!when.ok) return bad(res, when);
  if (!when.at) return res.status(400).json(model.fail("BAD_SCHEDULE"));
  try {
    const entry = await engine.updateScheduled(req.params.id, {
      content: content.content,
      audience: model.normalizeAudience(body.audience),
      includeSelf: Boolean(body.includeSelf),
      scheduleAt: when.at,
    });
    audit(req.user, "live_popup_schedule_edit", req.params.id, { title: entry.c.title, scheduledAt: when.at });
    res.json({ ok: true, id: entry.c.id });
  } catch (e) {
    fail(res, e, "schedule edit", "Could not update the scheduled popup.");
  }
});

router.post("/popup/campaigns/:id/send-now", async (req, res) => {
  try {
    const entry = await engine.sendScheduledNow(req.params.id);
    const stats = model.statsSnapshot(model.computeStats([...entry.receipts.values()], { sentAt: entry.c.sent_at }));
    audit(req.user, "live_popup", entry.c.id, { id: entry.c.id, title: entry.c.title, fromSchedule: true, targeted: stats.targeted, missed: stats.missed });
    res.json({ ok: true, id: entry.c.id, stats });
  } catch (e) {
    fail(res, e, "send now", "Could not send the popup.");
  }
});

router.post("/popup/campaigns/:id/cancel", async (req, res) => {
  const reason = String(req.body?.reason || "").replace(/\s+/g, " ").trim().slice(0, 300);
  try {
    const entry = await engine.cancelScheduled(req.params.id, reason);
    audit(req.user, "live_popup_cancel", entry.c.id, { title: entry.c.title, reason: reason || null });
    res.json({ ok: true });
  } catch (e) {
    fail(res, e, "cancel", "Could not cancel the popup.");
  }
});

/* ---------------- live actions ---------------- */

router.post("/popup/campaigns/:id/recall", async (req, res) => {
  const input = model.normalizeRecall(req.body || {});
  if (!input.ok) return bad(res, input);
  try {
    const out = await engine.recall(req.params.id, input, req.user);
    audit(req.user, "live_popup_recall", req.params.id, {
      mode: input.mode,
      reason: input.reason,
      closed: out.closed,
      pendingCanceled: out.pendingCanceled,
      alreadySeen: out.alreadySeen,
      ...(out.followUp ? { followUp: out.followUp } : {}),
    });
    res.json({ ok: true, ...out });
  } catch (e) {
    fail(res, e, "recall", "Could not recall the popup.");
  }
});

router.post("/popup/campaigns/:id/resend", async (req, res) => {
  const ids = Array.isArray(req.body?.userIds) ? req.body.userIds.map(String).filter(model.isUuid).slice(0, 2000) : null;
  try {
    const out = await engine.resend(req.params.id, ids, req.user);
    audit(req.user, "live_popup_resend", req.params.id, { sent: out.sent, queued: out.queued, selected: ids ? ids.length : null });
    res.json({ ok: true, sent: out.sent, queued: out.queued });
  } catch (e) {
    fail(res, e, "resend", "Could not resend the popup.");
  }
});

router.post("/popup/campaigns/:id/resolve", async (req, res) => {
  const content = model.normalizeContent({ ...(req.body?.content || {}), severity: "success", icon: "check", requireAck: false });
  if (!content.ok) return bad(res, content);
  const note = model.cleanNote(req.body?.note);
  if (!note.ok) return bad(res, note);
  try {
    const out = await engine.resolveIncident(req.params.id, content.content, req.user, note.note);
    audit(req.user, "live_popup_resolve", req.params.id, { note: note.note, followUp: out.followUp, recipients: out.recipients });
    res.json({ ok: true, ...out });
  } catch (e) {
    fail(res, e, "resolve", "Could not send the resolved popup.");
  }
});

router.post("/popup/campaigns/:id/end", async (req, res) => {
  try {
    const entry = await engine.endCampaign(req.params.id);
    audit(req.user, "live_popup_end", entry.c.id, { title: entry.c.title });
    res.json({ ok: true });
  } catch (e) {
    fail(res, e, "end", "Could not end the popup.");
  }
});

router.post("/popup/test", (req, res) => {
  const content = model.normalizeContent(req.body?.content || req.body || {});
  if (!content.ok) return bad(res, content);
  try {
    const out = engine.testSend(req.user, content.content);
    audit(req.user, "live_popup_test", req.user.id, { devices: out.devices, title: content.content.title });
    if (!out.devices) return res.status(409).json(model.fail("NO_DEVICE"));
    return res.json({ ok: true, ...out });
  } catch (e) {
    return fail(res, e, "test", "Could not send the test.");
  }
});

/* ---------------- templates ---------------- */

function templateRow(body, actor) {
  const content = model.normalizeContent(body.content || body);
  if (!content.ok) return content;
  const name = String(body.name || "").replace(/\s+/g, " ").trim().slice(0, model.MAX_TEMPLATE_NAME);
  if (!name) return model.fail("NAME_REQUIRED");
  const c = content.content;
  return {
    ok: true,
    row: {
      name,
      title: c.title,
      body: c.body,
      severity: c.severity,
      icon: c.icon,
      duration_ms: c.durationMs,
      require_ack: c.requireAck,
      auto_resolve: c.autoResolve,
      cta_label: c.ctaLabel || null,
      cta_url: c.ctaUrl || null,
      audience: model.normalizeAudience(body.audience),
      ...(actor ? { created_by: actor.id, created_by_username: actor.username } : {}),
    },
  };
}

function templateView(t) {
  return {
    id: t.id,
    name: t.name,
    title: t.title,
    body: t.body,
    severity: t.severity,
    icon: t.icon,
    durationMs: Number(t.duration_ms) || 0,
    requireAck: Boolean(t.require_ack),
    autoResolve: Boolean(t.auto_resolve),
    ctaLabel: t.cta_label || "",
    ctaUrl: t.cta_url || "",
    audience: t.audience || { rules: [] },
    useCount: Number(t.use_count) || 0,
    createdBy: t.created_by_username || null,
    updatedAt: t.updated_at || t.created_at || null,
  };
}

const UNAVAILABLE = model.fail("TEMPLATES_UNAVAILABLE");

router.get("/popup/templates", async (_req, res) => {
  try {
    const rows = await store.listTemplates();
    res.set("Cache-Control", "no-store");
    res.json({ templates: (rows || []).map(templateView), persistent: rows != null });
  } catch (e) {
    fail(res, e, "templates", "Could not load the templates.");
  }
});

router.post("/popup/templates", async (req, res) => {
  const t = templateRow(req.body || {}, req.user);
  if (!t.ok) return bad(res, t);
  try {
    const row = await store.insertTemplate(t.row);
    if (!row) return res.status(503).json(UNAVAILABLE);
    audit(req.user, "live_popup_template_create", row.id, { name: row.name });
    res.json({ ok: true, template: templateView(row) });
  } catch (e) {
    fail(res, e, "template create", "Could not save the template.");
  }
});

router.put("/popup/templates/:id", async (req, res) => {
  if (!model.isUuid(req.params.id)) return res.status(404).json(model.fail("TEMPLATE_NOT_FOUND"));
  const t = templateRow(req.body || {}, null);
  if (!t.ok) return bad(res, t);
  try {
    const row = await store.updateTemplate(req.params.id, t.row);
    if (row === null && !store.available("popup_templates")) return res.status(503).json(UNAVAILABLE);
    if (!row) return res.status(404).json(model.fail("TEMPLATE_NOT_FOUND"));
    audit(req.user, "live_popup_template_update", row.id, { name: row.name });
    res.json({ ok: true, template: templateView(row) });
  } catch (e) {
    fail(res, e, "template update", "Could not save the template.");
  }
});

router.delete("/popup/templates/:id", async (req, res) => {
  if (!model.isUuid(req.params.id)) return res.status(404).json(model.fail("TEMPLATE_NOT_FOUND"));
  try {
    const gone = await store.deleteTemplate(req.params.id);
    if (gone === null) return res.status(503).json(UNAVAILABLE);
    if (!gone) return res.status(404).json(model.fail("TEMPLATE_NOT_FOUND"));
    audit(req.user, "live_popup_template_delete", req.params.id, {});
    res.json({ ok: true });
  } catch (e) {
    fail(res, e, "template delete", "Could not delete the template.");
  }
});

/* ---------------- exemptions ---------------- */

router.post("/popup/users/:userId/exempt", async (req, res) => {
  if (!model.isUuid(req.params.userId)) return res.status(400).json(model.fail("BAD_USER"));
  const exempt = req.body?.exempt !== false;
  try {
    const ok = await store.setExempt(req.params.userId, exempt, req.user);
    if (!ok) return res.status(503).json(model.fail("EXEMPTIONS_UNAVAILABLE"));
    audit(req.user, exempt ? "live_popup_exempt" : "live_popup_unexempt", req.params.userId, {});
    return res.json({ ok: true, exempt });
  } catch (e) {
    return fail(res, e, "exempt", "Could not change the exemption.");
  }
});

module.exports = router;
