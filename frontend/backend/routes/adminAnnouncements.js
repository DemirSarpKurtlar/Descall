"use strict";

/**
 * Duyurular (admin section "announcements", remake Nov 2026, owner-approved
 * Drafts C + A: publishing board + list with the inspection panel, template
 * gallery, language versions, composer with live preview).
 *
 * Mounted inside routes/admin.js after requireAuth, requireAdmin, the admin rate
 * limit, requireAdmin2fa, requireStepUp (every write needs a fresh code, except
 * the audience estimate, the translation and template previews: paths ending in
 * /preview) and requireAdminSection (every /announcements path is section
 * "announcements"). Every write is audited through state.appendAudit.
 *
 * Urgent announcements to everyone need a second admin: they wait in "Onay
 * bekliyor" until another admin approves (the owner may approve their own with
 * a written reason, which is audited).
 */

const express = require("express");
const crypto = require("crypto");
const state = require("../runtime/sharedState");
const model = require("../lib/announcements/model");
const store = require("../lib/announcements/store");
const service = require("../lib/announcements/service");

const router = express.Router();

// Phrases the app translates through src/i18n/locales/api.tr.js (the UI shows its own text per `code`).
const ERR = {
  textFirst: "Write the title and the message first.",
  tplMissing: "Template not found.",
  textRequired: "Write a title or a message.",
  pinBool: "pinned must be a boolean",
  imageType: "Upload a PNG, JPG or WebP image.",
  imageSize: "The image must be 2 MB or smaller.",
};

/* ---------------- helpers ---------------- */

function actorOf(req) {
  return { id: req.user?.id || null, username: req.user?.username || "admin" };
}

function audit(req, action, target, meta = {}) {
  const a = actorOf(req);
  try {
    return state.appendAudit(a.id, a.username, action, target, meta);
  } catch {
    return null;
  }
}

function fail(res, e, label, fallback) {
  const status = e?.status || 500;
  if (status >= 500 && status !== 503) console.error(`[ADMIN] announcements ${label} failed:`, e?.message || e);
  return res.status(status).json({ error: status >= 500 && status !== 503 ? fallback : e?.error || e?.message || fallback, code: e?.code || undefined });
}

function bad(res, r) {
  return res.status(r.status || 400).json({ error: r.error, code: r.code });
}

function err(code, message, status = 400) {
  const e = new Error(message);
  e.code = code;
  e.status = status;
  return e;
}

async function isOwner(req) {
  if (req.user?.username === "admin") return true;
  try {
    return await require("../middleware/requireAdmin").userIsSuperAdmin(req);
  } catch {
    return false;
  }
}

router.use("/announcements", (req, _res, next) => {
  service.attachIo(req.app.get("io"));
  next();
});

async function requireSchema() {
  if (!(await store.schemaReady())) throw err("ANNOUNCEMENTS_SCHEMA_MISSING", "Run the announcements migration first.", 503);
}

async function loadRow(id) {
  const row = await store.getById(id);
  if (!row) throw err("NOT_FOUND", "Announcement not found.", 404);
  return row;
}

function reasonOf(body, allowed) {
  const code = String(body?.reason || "").trim();
  const note = String(body?.note || "").trim().slice(0, model.LIMITS.reason);
  if (!allowed.includes(code)) throw err("REASON_REQUIRED", "Pick a reason.");
  if (code === "other" && !note) throw err("NOTE_REQUIRED", "Write a short reason.");
  return { reason: code, note: note || null };
}

/** Admin view of one row (+ counts). */
function adminView(row, stats = null, ver = null, t = Date.now()) {
  const s = stats || model.emptyStats();
  return {
    id: row.id,
    status: model.statusOf(row, t),
    storedStatus: model.baseStatus(row),
    legacy: !row.status,
    title: row.title || "",
    content: row.content || "",
    icon: model.iconOf(row),
    color: model.colorOf(row.color),
    priority: model.PRIORITIES.includes(row.priority) ? row.priority : "normal",
    pinned: Boolean(row.pinned),
    pinOrder: row.pinned ? Number(row.pin_order) || null : null,
    ctaLabel: row.cta_label || "",
    ctaUrl: row.cta_url || "",
    coverUrl: row.cover_url || "",
    audience: model.normalizeAudience(row.audience),
    audienceSize: row.audience_size ?? null,
    startsAt: row.starts_at || null,
    endsAt: row.ends_at || null,
    publishedAt: row.published_at || (row.status ? null : row.created_at) || null,
    endedAt: row.ended_at || null,
    endedReason: row.ended_reason || null,
    archivedAt: row.archived_at || null,
    createdAt: row.created_at || null,
    author: row.author || null,
    createdBy: row.created_by || null,
    requestedBy: row.requested_by || null,
    approvedByName: row.approved_by_name || null,
    approvedAt: row.approved_at || null,
    updatedAt: row.updated_at || null,
    updatedByName: row.updated_by_name || null,
    sourceLang: model.normLang(row.source_lang) || "tr",
    translations: row.translations || {},
    langStates: model.translationStates(row),
    liveNotify: row.live_notify !== false,
    push: Boolean(row.push),
    templateKey: row.template_key || null,
    version: Number(row.version) || 1,
    needsApproval: model.needsApproval(row.priority, row.audience),
    stats: s,
    versions: ver || { count: 0, lastBy: null },
  };
}

function avg(list) {
  return list.length ? list.reduce((a, b) => a + b, 0) / list.length : null;
}

function kpis(items, t = Date.now()) {
  const by = (s) => items.filter((i) => i.status === s);
  const live = by("live");
  const week = live.filter((i) => i.publishedAt && t - Date.parse(i.publishedAt) < 7 * 86400000).length;
  const seenRate = (i) => {
    const d = i.audienceSize || i.stats.delivered;
    return d > 0 ? (i.stats.seen / d) * 100 : null;
  };
  const liveRates = live.map(seenRate).filter((x) => x != null);
  const recentEnded = by("ended").filter((i) => i.endedAt && t - Date.parse(i.endedAt) < 30 * 86400000).map(seenRate).filter((x) => x != null);
  const avgSeen = avg(liveRates);
  const prevSeen = avg(recentEnded);
  const withCta = live.filter((i) => i.ctaUrl);
  const seen = withCta.reduce((a, i) => a + i.stats.seen, 0);
  const clicks = withCta.reduce((a, i) => a + i.stats.clicked, 0);
  return {
    live: live.length,
    liveWeek: week,
    scheduled: by("scheduled").length,
    drafts: by("draft").length,
    pending: by("pending").length,
    ended: by("ended").length,
    archived: by("archived").length,
    avgSeen: avgSeen == null ? null : Math.round(avgSeen * 10) / 10,
    seenDelta: avgSeen != null && prevSeen != null ? Math.round((avgSeen - prevSeen) * 10) / 10 : null,
    clickRate: seen > 0 ? Math.round((clicks / seen) * 1000) / 10 : null,
  };
}

async function viewsFor(rows, t = Date.now()) {
  const published = rows.filter((r) => ["live", "ended", "archived"].includes(model.statusOf(r, t))).map((r) => r.id);
  const reads = await store.readsFor(published).catch(() => []);
  const stats = model.aggregateReads(reads);
  const vers = await store.versionCounts(rows.map((r) => r.id)).catch(() => new Map());
  return rows.map((r) => adminView(r, stats.get(String(r.id)), vers.get(String(r.id)), t));
}

async function nextPinOrder() {
  const rows = await store.listActive().catch(() => []);
  const max = rows.filter((r) => r.pinned).reduce((m, r) => Math.max(m, Number(r.pin_order) || 0), 0);
  return max + 1;
}

/** Publish now, schedule, or send to approval. */
async function publishFlow(req, row, { startsAt } = {}) {
  const t = Date.now();
  const actor = actorOf(req);
  const start = startsAt !== undefined ? startsAt : row.starts_at;
  if (model.needsApproval(row.priority, row.audience) && !row.approved_by) {
    const out = await store.update(row.id, { status: "pending", is_active: false, requested_by: actor.id, starts_at: start || null, updated_at: new Date().toISOString(), updated_by: actor.id, updated_by_name: actor.username });
    audit(req, "announcement_submit", row.id, { title: row.title, priority: row.priority });
    service.notifyAdmins("pending", row.id);
    return { row: out, result: "pending" };
  }
  if (start && Date.parse(start) > t + 30_000) {
    const out = await store.update(row.id, { status: "scheduled", is_active: false, starts_at: start, updated_at: new Date().toISOString(), updated_by: actor.id, updated_by_name: actor.username });
    audit(req, "announcement_schedule", row.id, { title: row.title, startsAt: start });
    service.notifyAdmins("scheduled", row.id);
    return { row: out, result: "scheduled" };
  }
  const { row: live, reached, pushed } = await service.goLive({ ...row, starts_at: start || row.starts_at }, { actor });
  audit(req, "announcement_publish", row.id, { title: row.title, priority: row.priority, audience: model.normalizeAudience(row.audience), audienceSize: live.audience_size ?? null, reached, pushed });
  return { row: live, result: "live", reached, pushed };
}

/* ---------------- reads ---------------- */

router.get("/announcements/overview", async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    const ready = await store.schemaReady();
    const rows = await store.listAll();
    const t = Date.now();
    const items = await viewsFor(rows, t);
    res.json({
      schemaReady: ready,
      translateAvailable: Boolean(process.env.ANTHROPIC_API_KEY),
      me: { id: req.user?.id || null, username: req.user?.username || null, owner: await isOwner(req) },
      items,
      kpis: kpis(items, t),
      locales: model.LOCALES,
      now: new Date(t).toISOString(),
    });
  } catch (e) {
    fail(res, e, "overview", "Could not load announcements.");
  }
});

router.get("/announcements/templates", async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    const rows = await store.listAll().catch(() => []);
    const uses = new Map();
    const recent = [];
    for (const r of rows) {
      const k = r.template_key;
      if (!k) continue;
      uses.set(k, (uses.get(k) || 0) + 1);
      if (!recent.includes(k) && recent.length < 5) recent.push(k);
    }
    const custom = (await store.listTemplates()).map((tpl) => ({
      key: `c:${tpl.id}`,
      id: tpl.id,
      name: tpl.name,
      category: tpl.category || "custom",
      icon: model.ICONS.includes(tpl.icon) ? tpl.icon : "megaphone",
      color: model.colorOf(tpl.color),
      priority: tpl.priority || "normal",
      sourceLang: tpl.source_lang || "tr",
      title: tpl.title,
      content: tpl.content,
      ctaLabel: tpl.cta_label || "",
      ctaUrl: tpl.cta_url || "",
      translations: tpl.translations || {},
      langs: 1 + Object.keys(tpl.translations || {}).length,
      vars: [...new Set(`${tpl.title} ${tpl.content}`.match(/\{([a-zA-Z_]+)\}/g) || [])].map((m) => ({ id: m.slice(1, -1), type: "text" })),
      uses: Math.max(Number(tpl.use_count) || 0, uses.get(`c:${tpl.id}`) || 0),
      createdByName: tpl.created_by_name || null,
      mine: String(tpl.created_by || "") === String(req.user?.id || ""),
      createdAt: tpl.created_at,
    }));
    const builtin = model.BUILTIN_TEMPLATES.map((tpl) => ({
      key: tpl.key,
      category: tpl.category,
      icon: tpl.icon,
      color: tpl.color,
      priority: tpl.priority,
      ctaUrl: tpl.ctaUrl,
      vars: tpl.vars.map((v) => ({ id: v.id, type: v.type, default: v.default ?? null, optional: Boolean(v.optional), options: v.options ? Object.fromEntries(Object.entries(v.options).map(([k, labels]) => [k, labels])) : null, from: v.from || null })),
      text: tpl.text,
      langs: Object.keys(tpl.text).length,
      uses: uses.get(tpl.key) || 0,
    }));
    res.json({ builtin, custom, recent, categories: model.TEMPLATE_CATEGORIES });
  } catch (e) {
    fail(res, e, "templates", "Could not load templates.");
  }
});

router.get("/announcements/:id", async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    const row = await loadRow(req.params.id);
    const [item] = await viewsFor([row]);
    const versions = await store.listVersions(row.id);
    const open = service.connectedSockets().length;
    res.json({ item, versions, checks: model.prePublishChecks(row), openSessions: item.status === "live" ? open : 0 });
  } catch (e) {
    fail(res, e, "detail", "Could not load the announcement.");
  }
});

router.get("/announcements/:id/versions", async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    res.json({ versions: await store.listVersions(req.params.id) });
  } catch (e) {
    fail(res, e, "versions", "Could not load the history.");
  }
});

router.get("/announcements/:id/export", async (req, res) => {
  try {
    const row = await loadRow(req.params.id);
    const stats = model.aggregateReads(await store.readsFor([row.id])).get(String(row.id));
    const csv = model.statsCsv(row, stats, row.audience_size ?? null);
    audit(req, "announcement_export", row.id, { title: row.title });
    res.set("Cache-Control", "no-store");
    res.json({ filename: `duyuru-${String(row.id).slice(0, 8)}-istatistik.csv`, csv });
  } catch (e) {
    fail(res, e, "export", "Could not export the statistics.");
  }
});

/* ---------------- previews (no step-up) ---------------- */

router.post("/announcements/audience/preview", async (req, res) => {
  try {
    const audience = model.normalizeAudience(req.body?.audience);
    const est = await service.estimateAudience(audience);
    res.json({ audience, count: est.count, byLang: est.byLang, everyone: model.isEveryone(audience), needsApproval: model.needsApproval(req.body?.priority, audience) });
  } catch (e) {
    fail(res, e, "audience", "Could not estimate the audience.");
  }
});

router.post("/announcements/translate/preview", async (req, res) => {
  try {
    const b = req.body || {};
    const from = model.normLang(b.from) || "tr";
    const title = String(b.title || "").trim().slice(0, model.LIMITS.title);
    const content = String(b.content || "").trim().slice(0, model.LIMITS.content);
    if (!title || !content) return res.status(400).json({ error: ERR.textFirst, code: "TEXT_REQUIRED" });
    const to = (Array.isArray(b.to) ? b.to : []).map(model.normLang).filter((l) => l && l !== from);
    const out = await service.translate({ title, content, ctaLabel: String(b.ctaLabel || "").slice(0, model.LIMITS.ctaLabel), from, to });
    const at = new Date().toISOString();
    const translations = Object.fromEntries(Object.entries(out).map(([l, t]) => [l, { ...t, state: "auto", by: "auto", at }]));
    audit(req, "announcement_translate", b.id || "draft", { from, to: Object.keys(translations) });
    res.json({ translations });
  } catch (e) {
    fail(res, e, "translate", "Could not translate.");
  }
});

router.post("/announcements/templates/fill/preview", async (req, res) => {
  try {
    const tpl = model.templateByKey(String(req.body?.key || ""));
    if (!tpl) return res.status(404).json({ error: ERR.tplMissing, code: "NOT_FOUND" });
    const sourceLang = model.normLang(req.body?.sourceLang) || "tr";
    const today = new Date().toISOString().slice(0, 10);
    const values = { ...model.templateDefaults(tpl, today), ...(req.body?.values || {}) };
    const filled = model.fillTemplate(tpl, values, { sourceLang, by: "template", at: new Date().toISOString() });
    res.json({ filled });
  } catch (e) {
    fail(res, e, "template fill", "Could not fill the template.");
  }
});

/* ---------------- create / edit ---------------- */

router.post("/announcements", async (req, res) => {
  try {
    const ready = await store.schemaReady();
    const body = req.body || {};
    const action = ["draft", "publish", "submit"].includes(body.action) ? body.action : "publish";
    const actor = actorOf(req);
    if (!ready) {
      // Before the migration: the old behaviour (publish now, pin, no draft / schedule / translations).
      if (action === "draft") throw err("ANNOUNCEMENTS_SCHEMA_MISSING", "Run the announcements migration first.", 503);
      const v = model.validateDraft({ ...body, audience: {} }, {});
      if (!v.ok) return bad(res, v);
      const row = await store.insert({ title: v.value.title, content: v.value.content, created_by: actor.id, author: actor.username, priority: v.value.priority, color: v.value.color, emoji: "", pinned: v.value.pinned, target: "all" });
      service.invalidate();
      const reached = await service.deliver(row, "announcement:new", { toast: row.priority !== "normal" });
      audit(req, "announcement_create", row.id, { title: row.title, priority: row.priority, legacy: true, reached });
      return res.json({ ok: true, result: "live", item: adminView(row) });
    }
    const v = model.validateDraft(body, { requireText: action !== "draft" });
    if (!v.ok) return bad(res, v);
    if (action === "draft" && !v.value.title && !v.value.content) return res.status(400).json({ error: ERR.textRequired, code: "TITLE_REQUIRED" });
    const t = new Date().toISOString();
    const insert = {
      ...v.value,
      emoji: "",
      target: "all",
      status: "draft",
      is_active: false,
      created_by: actor.id,
      author: actor.username,
      version: 1,
      updated_at: t,
      updated_by: actor.id,
      updated_by_name: actor.username,
      pin_order: v.value.pinned ? await nextPinOrder() : null,
    };
    let row = await store.insert(insert);
    await store.addVersion(row, { change: "created", actor });
    audit(req, "announcement_create", row.id, { title: row.title, action, priority: row.priority, template: row.template_key || null });
    let result = "draft";
    let extra = {};
    if (action === "publish" || action === "submit") {
      const out = await publishFlow(req, row);
      row = out.row;
      result = out.result;
      extra = { reached: out.reached ?? null, pushed: out.pushed ?? null };
    } else {
      service.notifyAdmins("draft", row.id);
    }
    if (row.template_key && row.template_key.startsWith("c:")) {
      const id = row.template_key.slice(2);
      const tpl = await store.getTemplate(id).catch(() => null);
      if (tpl) await store.updateTemplate(id, { use_count: (Number(tpl.use_count) || 0) + 1, last_used_at: t }).catch(() => {});
    }
    res.json({ ok: true, result, item: adminView(row), ...extra });
  } catch (e) {
    fail(res, e, "create", "Could not save the announcement.");
  }
});

const TEXT_FIELDS = ["title", "content", "cta_label"];
// Fields a second admin approves on an urgent announcement to everyone.
const APPROVAL_FIELDS = ["title", "content", "priority", "audience", "translations", "cta_url", "cta_label"];
const NO_APPROVAL = Object.freeze({ approved_by: null, approved_by_name: null, approved_at: null });
const WATCHED = ["title", "content", "icon", "color", "priority", "cta_label", "cta_url", "cover_url", "audience", "starts_at", "ends_at", "pinned", "push", "live_notify", "source_lang", "translations"];

function changedFields(prev, next) {
  return WATCHED.filter((k) => next[k] !== undefined && JSON.stringify(next[k] ?? null) !== JSON.stringify(prev[k] ?? null));
}

router.put("/announcements/:id", async (req, res) => {
  try {
    await requireSchema();
    const prev = await loadRow(req.params.id);
    const body = req.body || {};
    const status = model.statusOf(prev);
    if (status === "archived") throw err("ARCHIVED", "Unarchive it first.", 409);
    const v = model.validateDraft(body, { partial: true, requireText: status !== "draft" });
    if (!v.ok) return bad(res, v);
    const patch = { ...v.value };
    const changed = changedFields(prev, patch);
    if (!changed.length && !body.action) return res.json({ ok: true, result: "unchanged", item: adminView(prev) });
    if (changed.some((k) => TEXT_FIELDS.includes(k)) && !changed.includes("translations")) {
      patch.translations = model.markStale(prev.translations || {}, changed.filter((k) => TEXT_FIELDS.includes(k)));
    }
    const next = { ...prev, ...patch };
    const approvalNow = model.needsApproval(next.priority, next.audience);
    const approvalBefore = model.needsApproval(prev.priority, prev.audience);
    if (status === "live" && approvalNow && !approvalBefore && !prev.approved_by) {
      throw err("NEEDS_APPROVAL", "An urgent announcement to everyone needs a second admin. Save it as a new draft and send it for approval.", 409);
    }
    // Two-person rule (polish admin-b-02): what users see of an urgent-to-everyone
    // announcement is exactly what the second admin approved. A live one cannot be
    // rewritten in place; any other state loses its approval and needs a fresh one.
    const approvalChange = approvalNow && changed.some((k) => APPROVAL_FIELDS.includes(k));
    if (approvalChange && status === "live") {
      throw err("NEEDS_REAPPROVAL", "An approved urgent announcement to everyone cannot be changed while it is live. End it, edit it and send it for approval again.", 409);
    }
    if (approvalChange) {
      Object.assign(patch, NO_APPROVAL);
      if (status === "scheduled") patch.status = "pending";
    }
    if (changed.includes("pinned")) patch.pin_order = patch.pinned ? prev.pin_order || (await nextPinOrder()) : null;
    const actor = actorOf(req);
    patch.version = (Number(prev.version) || 1) + 1;
    patch.updated_at = new Date().toISOString();
    patch.updated_by = actor.id;
    patch.updated_by_name = actor.username;
    await store.addVersion(prev, { change: changed.includes("translations") && changed.length === 1 ? "translated" : "edited", actor });
    let row = await store.update(prev.id, patch);
    service.invalidate();
    audit(req, "announcement_update", row.id, { title: row.title, changed, version: row.version });
    let result = "saved";
    if (status === "live") {
      await service.deliver(row, "announcement:updated", { toast: false });
      result = "live";
    }
    // A scheduled one whose publish time was cleared or moved to the past goes live now.
    if (model.baseStatus(row) === "scheduled" && (!row.starts_at || Date.parse(row.starts_at) <= Date.now() + 30_000)) {
      const out = await publishFlow(req, { ...row, starts_at: null }, { startsAt: null });
      row = out.row;
      result = out.result;
    } else if (body.action === "publish" && ["draft", "ended"].includes(model.statusOf(row))) {
      const out = await publishFlow(req, row);
      row = out.row;
      result = out.result;
    }
    service.notifyAdmins("updated", row.id);
    res.json({ ok: true, result, item: adminView(row) });
  } catch (e) {
    fail(res, e, "update", "Could not save the announcement.");
  }
});

/* ---------------- lifecycle ---------------- */

router.post("/announcements/:id/publish", async (req, res) => {
  try {
    await requireSchema();
    const row = await loadRow(req.params.id);
    const status = model.statusOf(row);
    if (!["draft", "ended", "scheduled"].includes(status)) throw err("BAD_STATE", "This announcement cannot be published from here.", 409);
    const v = model.validateDraft(
      { title: row.title, content: row.content, ctaLabel: row.cta_label, ctaUrl: row.cta_url },
      { partial: true }
    );
    if (!v.ok) return bad(res, v);
    let startsAt;
    if (req.body && Object.prototype.hasOwnProperty.call(req.body, "startsAt")) {
      const s = req.body.startsAt ? Date.parse(req.body.startsAt) : NaN;
      startsAt = Number.isFinite(s) ? new Date(s).toISOString() : null;
    }
    const base = status === "ended" ? await store.update(row.id, { ended_at: null, ended_reason: null, ends_at: row.ends_at && Date.parse(row.ends_at) <= Date.now() ? null : row.ends_at }) : row;
    const out = await publishFlow(req, base, { startsAt });
    res.json({ ok: true, result: out.result, item: adminView(out.row), reached: out.reached ?? null, pushed: out.pushed ?? null });
  } catch (e) {
    fail(res, e, "publish", "Could not publish.");
  }
});

router.post("/announcements/:id/submit", async (req, res) => {
  try {
    await requireSchema();
    const row = await loadRow(req.params.id);
    if (model.statusOf(row) !== "draft") throw err("BAD_STATE", "Only drafts can be sent for approval.", 409);
    const actor = actorOf(req);
    const out = await store.update(row.id, { status: "pending", requested_by: actor.id, updated_at: new Date().toISOString(), updated_by: actor.id, updated_by_name: actor.username });
    audit(req, "announcement_submit", row.id, { title: row.title });
    service.notifyAdmins("pending", row.id);
    res.json({ ok: true, result: "pending", item: adminView(out) });
  } catch (e) {
    fail(res, e, "submit", "Could not send it for approval.");
  }
});

/** Board: a scheduled card dragged back to Taslak (the publish time is kept for later). */
router.post("/announcements/:id/unschedule", async (req, res) => {
  try {
    await requireSchema();
    const row = await loadRow(req.params.id);
    if (!["scheduled", "pending"].includes(model.statusOf(row))) throw err("BAD_STATE", "Only scheduled or waiting announcements go back to drafts.", 409);
    const actor = actorOf(req);
    const out = await store.update(row.id, { status: "draft", is_active: false, approved_by: null, approved_by_name: null, approved_at: null, updated_at: new Date().toISOString(), updated_by: actor.id, updated_by_name: actor.username });
    audit(req, "announcement_unschedule", row.id, { title: row.title, startsAt: row.starts_at || null });
    service.notifyAdmins("draft", row.id);
    res.json({ ok: true, result: "draft", item: adminView(out) });
  } catch (e) {
    fail(res, e, "unschedule", "Could not move it back to drafts.");
  }
});

router.post("/announcements/:id/approve", async (req, res) => {
  try {
    await requireSchema();
    const row = await loadRow(req.params.id);
    if (model.statusOf(row) !== "pending") throw err("BAD_STATE", "Nothing to approve.", 409);
    const actor = actorOf(req);
    const requester = String(row.requested_by || row.created_by || "");
    const self = requester && requester === String(actor.id);
    const note = String(req.body?.note || "").trim().slice(0, model.LIMITS.reason);
    let override = false;
    if (self) {
      if (!(await isOwner(req))) throw err("SECOND_ADMIN_REQUIRED", "Another admin has to approve this announcement.", 403);
      if (!note) throw err("NOTE_REQUIRED", "Write why you approve your own urgent announcement.");
      override = true;
    }
    const approved = await store.update(row.id, { approved_by: actor.id, approved_by_name: actor.username, approved_at: new Date().toISOString() });
    audit(req, "announcement_approve", row.id, { title: row.title, note: note || null, ownerOverride: override });
    const out = await publishFlow(req, approved);
    res.json({ ok: true, result: out.result, item: adminView(out.row), reached: out.reached ?? null });
  } catch (e) {
    fail(res, e, "approve", "Could not approve.");
  }
});

router.post("/announcements/:id/reject", async (req, res) => {
  try {
    await requireSchema();
    const row = await loadRow(req.params.id);
    if (model.statusOf(row) !== "pending") throw err("BAD_STATE", "Nothing to send back.", 409);
    const note = String(req.body?.note || "").trim().slice(0, model.LIMITS.reason);
    if (!note) throw err("NOTE_REQUIRED", "Write what should change.");
    const actor = actorOf(req);
    const out = await store.update(row.id, { status: "draft", requested_by: null, updated_at: new Date().toISOString(), updated_by: actor.id, updated_by_name: actor.username });
    audit(req, "announcement_reject", row.id, { title: row.title, note });
    service.notifyAdmins("draft", row.id, { note });
    res.json({ ok: true, result: "draft", item: adminView(out) });
  } catch (e) {
    fail(res, e, "reject", "Could not send it back.");
  }
});

router.post("/announcements/:id/end", async (req, res) => {
  try {
    const row = await loadRow(req.params.id);
    const status = model.statusOf(row);
    if (!["live", "scheduled", "pending"].includes(status)) throw err("BAD_STATE", "This announcement is not live.", 409);
    const why = reasonOf(req.body, model.END_REASONS);
    const ready = await store.schemaReady();
    let out;
    if (!ready) {
      out = await store.update(row.id, { is_active: false });
      service.invalidate();
      service.broadcastRemoved(row.id);
    } else {
      out = await service.endRow(row, { reason: why.reason, actor: actorOf(req) });
    }
    audit(req, "announcement_end", row.id, { title: row.title, reason: why.reason, note: why.note, from: status });
    res.json({ ok: true, result: "ended", item: adminView(out) });
  } catch (e) {
    fail(res, e, "end", "Could not take it down.");
  }
});

router.post("/announcements/:id/reopen", async (req, res) => {
  try {
    await requireSchema();
    const row = await loadRow(req.params.id);
    if (model.statusOf(row) !== "ended") throw err("BAD_STATE", "Only ended announcements can come back.", 409);
    if (row.ends_at && Date.parse(row.ends_at) <= Date.now()) throw err("EXPIRED", "Extend the end time first.", 409);
    if (model.needsApproval(row.priority, row.audience) && !row.approved_by) {
      throw err("NEEDS_APPROVAL", "An urgent announcement to everyone needs a second admin. Publish it to send it for approval.", 409);
    }
    const actor = actorOf(req);
    const out = await store.update(row.id, { status: "live", is_active: true, ended_at: null, ended_reason: null, updated_at: new Date().toISOString(), updated_by: actor.id, updated_by_name: actor.username });
    service.invalidate();
    const reached = await service.deliver(out, "announcement:updated", { toast: false });
    audit(req, "announcement_reopen", row.id, { title: row.title, reached });
    service.notifyAdmins("live", row.id);
    res.json({ ok: true, result: "live", item: adminView(out) });
  } catch (e) {
    fail(res, e, "reopen", "Could not bring it back.");
  }
});

router.post("/announcements/:id/extend", async (req, res) => {
  try {
    await requireSchema();
    const row = await loadRow(req.params.id);
    const raw = req.body?.endsAt;
    const at = raw ? Date.parse(raw) : NaN;
    const actor = actorOf(req);
    if (raw !== null && (!Number.isFinite(at) || at <= Date.now() + 60_000)) throw err("BAD_EXPIRY", "Pick a time in the future.");
    const start = row.starts_at ? Date.parse(row.starts_at) : 0;
    if (Number.isFinite(at) && at <= start) throw err("EXPIRY_BEFORE_START", "End time must be after the publish time.");
    const endsAt = raw === null ? null : new Date(at).toISOString();
    await store.addVersion(row, { change: "extended", actor });
    const patch = { ends_at: endsAt, version: (Number(row.version) || 1) + 1, updated_at: new Date().toISOString(), updated_by: actor.id, updated_by_name: actor.username };
    const revive = model.statusOf(row) === "ended" && row.ended_reason === "expired";
    if (revive) Object.assign(patch, { status: "live", is_active: true, ended_at: null, ended_reason: null });
    const out = await store.update(row.id, patch);
    service.invalidate();
    if (revive || model.statusOf(out) === "live") await service.deliver(out, "announcement:updated", { toast: false });
    audit(req, "announcement_extend", row.id, { title: row.title, from: row.ends_at || null, to: endsAt, revived: revive });
    service.notifyAdmins("updated", row.id);
    res.json({ ok: true, result: model.statusOf(out), item: adminView(out) });
  } catch (e) {
    fail(res, e, "extend", "Could not change the end time.");
  }
});

router.post("/announcements/:id/archive", async (req, res) => {
  try {
    await requireSchema();
    const row = await loadRow(req.params.id);
    if (model.statusOf(row) === "archived") return res.json({ ok: true, result: "archived", item: adminView(row) });
    const why = req.body?.reason ? reasonOf(req.body, model.DELETE_REASONS) : { reason: "archived", note: null };
    const out = await service.endRow(row, { reason: why.reason, actor: actorOf(req), status: "archived" });
    audit(req, "announcement_archive", row.id, { title: row.title, reason: why.reason, note: why.note });
    res.json({ ok: true, result: "archived", item: adminView(out) });
  } catch (e) {
    fail(res, e, "archive", "Could not archive.");
  }
});

router.post("/announcements/:id/unarchive", async (req, res) => {
  try {
    await requireSchema();
    const row = await loadRow(req.params.id);
    if (model.statusOf(row) !== "archived") throw err("BAD_STATE", "Not archived.", 409);
    const actor = actorOf(req);
    const out = await store.update(row.id, { status: "ended", archived_at: null, updated_at: new Date().toISOString(), updated_by: actor.id, updated_by_name: actor.username });
    audit(req, "announcement_unarchive", row.id, { title: row.title });
    service.notifyAdmins("ended", row.id);
    res.json({ ok: true, result: "ended", item: adminView(out) });
  } catch (e) {
    fail(res, e, "unarchive", "Could not restore it.");
  }
});

router.delete("/announcements/:id", async (req, res) => {
  try {
    const row = await loadRow(req.params.id);
    const ready = await store.schemaReady();
    const body = req.body || {};
    // Clients from before the remake send no reason: they only ever hid the row.
    if (!body.reason) {
      const out = ready ? await service.endRow(row, { reason: "removed", actor: actorOf(req), status: "archived" }) : await store.update(row.id, { is_active: false });
      if (!ready) {
        service.invalidate();
        service.broadcastRemoved(row.id);
      }
      audit(req, "announcement_delete", row.id, { title: row.title, archived: true, legacyClient: true });
      return res.json({ ok: true, result: "archived", item: adminView(out) });
    }
    const why = reasonOf(body, model.DELETE_REASONS);
    if (body.archiveInstead !== false) {
      if (!ready) throw err("ANNOUNCEMENTS_SCHEMA_MISSING", "Run the announcements migration first.", 503);
      const out = await service.endRow(row, { reason: why.reason, actor: actorOf(req), status: "archived" });
      audit(req, "announcement_archive", row.id, { title: row.title, reason: why.reason, note: why.note, via: "delete_dialog" });
      return res.json({ ok: true, result: "archived", item: adminView(out) });
    }
    const wasLive = model.statusOf(row) === "live";
    let templatesDeleted = 0;
    if (body.deleteTemplate && ready) {
      const tpls = (await store.listTemplates()).filter((tp) => String(tp.from_announcement_id || "") === String(row.id));
      for (const tp of tpls) {
        await store.updateTemplate(tp.id, { deleted_at: new Date().toISOString() });
        templatesDeleted += 1;
      }
    }
    await store.remove(row.id);
    service.invalidate();
    if (wasLive || model.baseStatus(row) === "live") service.broadcastRemoved(row.id);
    audit(req, "announcement_delete", row.id, { title: row.title, reason: why.reason, note: why.note, wasLive, templatesDeleted });
    service.notifyAdmins("deleted", row.id);
    res.json({ ok: true, result: "deleted", id: row.id });
  } catch (e) {
    fail(res, e, "delete", "Could not delete.");
  }
});

router.post("/announcements/:id/duplicate", async (req, res) => {
  try {
    await requireSchema();
    const row = await loadRow(req.params.id);
    const actor = actorOf(req);
    const t = new Date().toISOString();
    const copy = await store.insert({
      title: row.title,
      content: row.content,
      icon: model.iconOf(row),
      color: model.colorOf(row.color),
      priority: row.priority || "normal",
      cta_label: row.cta_label || null,
      cta_url: row.cta_url || null,
      cover_url: row.cover_url || null,
      audience: model.normalizeAudience(row.audience),
      source_lang: row.source_lang || "tr",
      translations: row.translations || {},
      pinned: false,
      push: Boolean(row.push),
      live_notify: row.live_notify !== false,
      template_key: row.template_key || null,
      emoji: "",
      target: "all",
      status: "draft",
      is_active: false,
      created_by: actor.id,
      author: actor.username,
      version: 1,
      updated_at: t,
      updated_by: actor.id,
      updated_by_name: actor.username,
    });
    await store.addVersion(copy, { change: "created", actor });
    audit(req, "announcement_duplicate", copy.id, { from: row.id, title: row.title });
    service.notifyAdmins("draft", copy.id);
    res.json({ ok: true, result: "draft", item: adminView(copy) });
  } catch (e) {
    fail(res, e, "duplicate", "Could not copy.");
  }
});

router.post("/announcements/:id/restore", async (req, res) => {
  try {
    await requireSchema();
    const row = await loadRow(req.params.id);
    const want = Number(req.body?.version);
    const versions = await store.listVersions(row.id);
    const hit = versions.find((v) => Number(v.version) === want);
    if (!hit) throw err("NOT_FOUND", "That version is not in the history.", 404);
    const snap = { ...(hit.snapshot || {}) };
    delete snap.status;
    delete snap.version;
    delete snap.pinned;
    // Approval belongs to the reviewed content, never to an old snapshot (polish admin-b-02).
    for (const k of ["approved_by", "approved_by_name", "approved_at", "requested_by"]) delete snap[k];
    const restoredStatus = model.statusOf(row);
    if (model.needsApproval(snap.priority ?? row.priority, snap.audience ?? row.audience) && changedFields(row, snap).some((k) => APPROVAL_FIELDS.includes(k))) {
      if (restoredStatus === "live") {
        throw err("NEEDS_REAPPROVAL", "An approved urgent announcement to everyone cannot be changed while it is live. End it, edit it and send it for approval again.", 409);
      }
      Object.assign(snap, NO_APPROVAL);
      if (restoredStatus === "scheduled") snap.status = "pending";
    }
    const actor = actorOf(req);
    await store.addVersion(row, { change: "restored", actor });
    const out = await store.update(row.id, { ...snap, version: (Number(row.version) || 1) + 1, updated_at: new Date().toISOString(), updated_by: actor.id, updated_by_name: actor.username });
    service.invalidate();
    if (model.statusOf(out) === "live") await service.deliver(out, "announcement:updated", { toast: false });
    audit(req, "announcement_restore", row.id, { title: out.title, restoredVersion: want });
    service.notifyAdmins("updated", row.id);
    res.json({ ok: true, result: model.statusOf(out), item: adminView(out) });
  } catch (e) {
    fail(res, e, "restore", "Could not restore that version.");
  }
});

/** Pin toggle (also what the panel before the remake sends). */
router.patch("/announcements/:id", async (req, res) => {
  try {
    const row = await loadRow(req.params.id);
    if (typeof req.body?.pinned !== "boolean") return res.status(400).json({ error: ERR.pinBool, code: "BAD_PIN" });
    const ready = await store.schemaReady();
    const pinned = req.body.pinned;
    const patch = { pinned };
    if (ready) {
      patch.pin_order = pinned ? row.pin_order || (await nextPinOrder()) : null;
      patch.updated_at = new Date().toISOString();
    }
    const out = await store.update(row.id, patch);
    service.invalidate();
    if (model.statusOf(out) === "live") S_changed(req);
    audit(req, "announcement_pin", row.id, { title: row.title, pinned });
    res.json({ ok: true, success: true, item: adminView(out), announcement: out });
  } catch (e) {
    fail(res, e, "pin", "Could not change the pin.");
  }
});

function S_changed(req) {
  try {
    req.app.get("io")?.emit("announcement:changed", { at: Date.now() });
  } catch {
    /* io optional */
  }
}

/** Pinned strip order: listed ids become pinned 1..n, other pinned rows are unpinned. */
router.post("/announcements/pins", async (req, res) => {
  try {
    await requireSchema();
    const ids = [...new Set((Array.isArray(req.body?.ids) ? req.body.ids : []).map(String))].slice(0, 20);
    const active = await store.listActive();
    const scheduled = await store.listScheduled();
    const pool = [...active, ...scheduled];
    for (const id of ids) if (!pool.some((r) => String(r.id) === id)) throw err("NOT_FOUND", "Only live or scheduled announcements can be pinned.", 404);
    let i = 0;
    for (const id of ids) {
      i += 1;
      await store.update(id, { pinned: true, pin_order: i });
    }
    for (const r of pool) if (r.pinned && !ids.includes(String(r.id))) await store.update(r.id, { pinned: false, pin_order: null });
    service.invalidate();
    S_changed(req);
    audit(req, "announcement_reorder", ids[0] || "pins", { order: ids });
    service.notifyAdmins("pins", null);
    res.json({ ok: true, ids });
  } catch (e) {
    fail(res, e, "pins", "Could not save the order.");
  }
});

/** "Önce bana gönder": the announcement as people will see it, to my own sessions (and phone with push on). */
router.post("/announcements/test", async (req, res) => {
  try {
    const v = model.validateDraft(req.body || {}, {});
    if (!v.ok) return bad(res, v);
    const row = { ...v.value, id: req.body?.id || null, author: req.user?.username || "admin", created_at: new Date().toISOString() };
    const out = await service.sendTest(row, actorOf(req), { lang: req.body?.lang });
    audit(req, "announcement_test", req.body?.id || "draft", { title: row.title, push: Boolean(row.push), pushed: out.pushed });
    res.json({ ok: true, pushed: out.pushed });
  } catch (e) {
    fail(res, e, "test", "Could not send the test.");
  }
});

const COVER_TYPES = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
router.post("/announcements/cover", express.raw({ type: Object.keys(COVER_TYPES), limit: "2mb" }), async (req, res) => {
  try {
    const type = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
    const ext = COVER_TYPES[type];
    if (!ext || !Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: ERR.imageType, code: "BAD_IMAGE" });
    if (req.body.length > 2 * 1024 * 1024) return res.status(413).json({ error: ERR.imageSize, code: "IMAGE_TOO_BIG" });
    const supabase = store.__db || require("../db/supabase");
    const path = `announcements/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("media").upload(path, req.body, { contentType: type, upsert: false });
    if (error) throw error;
    const url = supabase.storage.from("media").getPublicUrl(path)?.data?.publicUrl || "";
    audit(req, "announcement_cover_upload", path, { bytes: req.body.length, type });
    res.json({ ok: true, url });
  } catch (e) {
    if (e?.type === "entity.too.large") return res.status(413).json({ error: ERR.imageSize, code: "IMAGE_TOO_BIG" });
    fail(res, e, "cover", "Could not upload the image.");
  }
});

/* ---------------- templates ---------------- */

function templateRow(body, actor) {
  const name = String(body?.name || "").trim().slice(0, model.LIMITS.templateName);
  if (!name) throw err("NAME_REQUIRED", "Give the template a name.");
  const v = model.validateDraft({ ...body, audience: {} }, { requireText: false });
  if (!v.ok) throw err(v.code, v.error);
  const category = model.TEMPLATE_CATEGORIES.includes(body?.category) ? body.category : "custom";
  return {
    name,
    category,
    icon: v.value.icon,
    color: v.value.color,
    priority: v.value.priority,
    source_lang: v.value.source_lang,
    title: v.value.title,
    content: v.value.content,
    cta_label: v.value.cta_label,
    cta_url: v.value.cta_url,
    translations: v.value.translations,
    created_by: actor.id,
    created_by_name: actor.username,
  };
}

router.post("/announcements/templates", async (req, res) => {
  try {
    await requireSchema();
    const actor = actorOf(req);
    const row = await store.insertTemplate(templateRow(req.body, actor));
    audit(req, "announcement_template_save", row.id, { name: row.name, category: row.category });
    res.json({ ok: true, template: row });
  } catch (e) {
    fail(res, e, "template save", "Could not save the template.");
  }
});

router.put("/announcements/templates/:id", async (req, res) => {
  try {
    await requireSchema();
    const tpl = await store.getTemplate(req.params.id);
    if (!tpl || tpl.deleted_at) throw err("NOT_FOUND", "Template not found.", 404);
    const actor = actorOf(req);
    const next = templateRow({ ...req.body, name: req.body?.name ?? tpl.name }, actor);
    delete next.created_by;
    delete next.created_by_name;
    const row = await store.updateTemplate(tpl.id, next);
    audit(req, "announcement_template_update", tpl.id, { name: row.name });
    res.json({ ok: true, template: row });
  } catch (e) {
    fail(res, e, "template update", "Could not save the template.");
  }
});

router.delete("/announcements/templates/:id", async (req, res) => {
  try {
    await requireSchema();
    const tpl = await store.getTemplate(req.params.id);
    if (!tpl || tpl.deleted_at) throw err("NOT_FOUND", "Template not found.", 404);
    await store.updateTemplate(tpl.id, { deleted_at: new Date().toISOString() });
    audit(req, "announcement_template_delete", tpl.id, { name: tpl.name });
    res.json({ ok: true });
  } catch (e) {
    fail(res, e, "template delete", "Could not delete the template.");
  }
});

router.post("/announcements/:id/save-template", async (req, res) => {
  try {
    await requireSchema();
    const row = await loadRow(req.params.id);
    const actor = actorOf(req);
    const tpl = await store.insertTemplate({
      ...templateRow(
        {
          name: req.body?.name || row.title,
          category: req.body?.category || "custom",
          title: row.title,
          content: row.content,
          icon: model.iconOf(row),
          color: row.color,
          priority: row.priority,
          ctaLabel: row.cta_label,
          ctaUrl: row.cta_url,
          sourceLang: row.source_lang,
          translations: row.translations,
        },
        actor
      ),
      from_announcement_id: row.id,
    });
    audit(req, "announcement_template_save", tpl.id, { name: tpl.name, from: row.id });
    res.json({ ok: true, template: tpl });
  } catch (e) {
    fail(res, e, "save as template", "Could not save the template.");
  }
});

module.exports = router;
module.exports.__test = { adminView, kpis };
