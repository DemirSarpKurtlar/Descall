"use strict";

/**
 * İşlem kaydı (section "audit", owner pick Draft B "Konsol", Nov 2026).
 * Mounted inside routes/admin.js after requireAuth, requireAdmin, 2FA, step-up
 * and the section check, so every path here needs the "audit" section and
 * every POST / PUT / DELETE a fresh step-up code (saved views are exempt: they
 * change nothing on the platform).
 *
 *   GET    /audit                         merged page (filters, cursor); legacy shape { entries } kept
 *   GET    /audit/summary                 KPI tiles, hourly chart, leaderboard, open anomalies, view counts
 *   GET    /audit/entry/:id               detail: merged copies, request, related, notes, undo state
 *   POST   /audit/entry/:id/undo          { reason, notify } reverse of a reversible action
 *   POST   /audit/entry/:id/notes         { body } note on one entry
 *   POST   /audit/anomalies/review        { key, decision: reviewed|undo|suspend, reason, notify, entryIds }
 *   POST   /audit/reviews/:id/approve     owner: apply a requested permission suspension
 *   POST   /audit/reviews/:id/decline     owner: turn the request down
 *   GET    /audit/views                   saved views (own + shared)
 *   POST   /audit/views                   { name, query, shared }
 *   DELETE /audit/views/:id
 *   GET    /audit/rules                   anomaly rules (defaults over stored settings)
 *   PUT    /audit/rules                   { rules: [{ key, enabled, limit, windowSec }] }
 *   GET    /audit/export?format=csv|json  file content; the export is audited itself
 */

const express = require("express");
const model = require("../lib/auditConsoleModel");
const store = require("../lib/auditConsoleStore");
const undo = require("../lib/auditUndo");
const perms = require("../lib/adminPermissions");
const state = require("../runtime/sharedState");
const { apiError } = require("../lib/apiError");

const router = express.Router();
const DAY = 86400e3;
const WINDOW_TTL_MS = 10 * 1000;
let windowCache = null; // { at, raw, merged, durable }

function audit(user, action, target, meta) {
  return state.appendAudit(user.id, user.username, action, target, meta);
}

function notifyAdmins(req, payload) {
  try {
    require("../socket/adminHandlers").notifyAdminRoom(req.app.get("io"), payload);
  } catch {
    /* tests without rooms */
  }
}

function cleanText(v, max) {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

async function isOwner(req) {
  const row = await perms.loadRow(req.user.id).catch(() => null);
  return perms.isOwner(req.user, row);
}

/** Seven days of merged entries, cached briefly (summary, anomalies, review). */
async function loadWeek({ fresh = false } = {}) {
  const now = Date.now();
  if (!fresh && windowCache && now - windowCache.at < WINDOW_TTL_MS) return windowCache;
  const { raw, durable } = await store.loadWindow(new Date(now - 7 * DAY).toISOString(), { max: 8000 });
  const refs = await store.resolveRefs(raw);
  const merged = model.mergeEntries(raw);
  windowCache = { at: now, raw, merged, durable, users: refs.users, servers: refs.servers };
  return windowCache;
}

function invalidateWeek() {
  windowCache = null;
}

async function openAnomalies(week) {
  const [{ stored }, { reviews }] = await Promise.all([store.loadRules(), store.listReviews({ sinceIso: new Date(Date.now() - 8 * DAY).toISOString() })]);
  const rules = model.effectiveRules(stored);
  const closedKeys = reviews.filter((r) => r.status !== "declined").map((r) => r.anomaly_key);
  const recent = week.merged.filter((e) => Date.parse(e.at || "") > Date.now() - 2 * DAY);
  const anomalies = model.detectAnomalies(recent, rules, { reviewedKeys: closedKeys, history: week.merged });
  return { anomalies, rules, reviews };
}

async function enrichAnomaly(a, week) {
  const users = week.users || {};
  const targets = a.targets.map((t) => {
    const u = users[t.target] || null;
    const later = week.merged.filter((e) => Date.parse(e.at || "") > Date.parse(t.at || "") && String(e.target ?? "") === String(t.target ?? ""));
    const entry = week.merged.find((e) => e.id === t.entryId) || { id: t.entryId, action: a.action, target: t.target, at: t.at, meta: t.meta };
    const st = undo.undoState(entry, later);
    return {
      entryId: t.entryId,
      at: t.at,
      target: t.target,
      user: u,
      category: t.meta?.category || null,
      expiresAt: t.meta?.expiresAt || t.meta?.until || null,
      permanent: a.action === "ban" ? !t.meta?.expiresAt : false,
      undo: st.available ? "open" : st.code || "closed",
    };
  });
  let actorSections = null;
  let owner = false;
  if (a.actorId) {
    const row = await perms.loadRow(a.actorId).catch(() => null);
    if (row) {
      owner = perms.isOwner({ username: row.username }, row);
      actorSections = perms.sectionsFor({ username: row.username }, row).filter((s) => s !== "overview");
    }
  }
  const actorWeek = week.merged.filter((e) => (a.actorId ? e.actorId === a.actorId : e.actorUsername === a.actorUsername)).length;
  const common = a.rule === "ban_burst" || a.rule === "timeout_burst" ? await store.commonServer(a.targets.map((t) => t.target)) : null;
  return {
    ...a,
    targets,
    actor: { id: a.actorId, username: a.actorUsername, sections: actorSections, owner, week: actorWeek, user: users[a.actorId] || null },
    section: model.ACTION_SECTION[a.action] || null,
    common,
  };
}

function viewQueryFrom(raw) {
  const q = raw && typeof raw === "object" ? raw : {};
  const out = {};
  for (const k of ["actor", "cat", "sev", "target", "range", "from", "to", "q", "source", "merge", "action"]) {
    const v = q[k];
    if (v == null || v === "") continue;
    out[k] = Array.isArray(v) ? v.map((x) => String(x).slice(0, 80)).slice(0, 20).join(",") : String(v).slice(0, 200);
  }
  return out;
}

const BUILTIN_VIEWS = [
  { id: "all", query: {} },
  { id: "critical", query: { sev: "critical" } },
  { id: "agent", query: { source: "agent" } },
  { id: "economy", query: { cat: "economy" } },
  { id: "mine", query: { actor: "@me" } },
];

function countView(merged24, query, me) {
  const q = { ...query, range: undefined, from: undefined, to: undefined };
  if (q.actor) q.actor = String(q.actor).replace(/@me\b/g, me.username || me.id);
  const f = model.parseFilter(q);
  return merged24.filter((e) => model.matchesFilter(e, f, { actorIds: String(q.actor || "").includes(me.username) ? [me.id] : [] })).length;
}

/* ------------------------------------------------------------------ */
/* list                                                                */
/* ------------------------------------------------------------------ */

router.get("/audit", async (req, res) => {
  try {
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit || "60", 10) || 60));
    const f = model.parseFilter(req.query);
    if (f.actors.includes("@me") || f.actors.includes("me")) f.actors = f.actors.map((a) => (a === "@me" || a === "me" ? req.user.username : a));
    const cursor = req.query.cursor ? new Date(Date.parse(String(req.query.cursor)) || Date.now()).toISOString() : null;
    const page = await store.queryPage(f, { cursor, limit });
    res.set("Cache-Control", "no-store");
    res.json({
      entries: page.entries,
      nextCursor: page.nextCursor,
      durable: page.durable,
      users: page.users,
      servers: page.servers,
    });
  } catch (err) {
    console.error("[audit-console] list", err?.message || err);
    const limit = Math.min(500, parseInt(req.query.limit || "200", 10) || 200);
    res.json({ entries: (state.auditLog || []).slice(0, limit), nextCursor: null, durable: false, users: {}, servers: {} });
  }
});

router.get("/audit/summary", async (req, res) => {
  try {
    const week = await loadWeek({ fresh: req.query.fresh === "1" });
    const { anomalies } = await openAnomalies(week);
    const summary = model.summarize(week.merged, { raw: week.raw, anomalies });
    const owner = await isOwner(req);
    const enriched = [];
    for (const a of anomalies.slice(0, 5)) enriched.push(await enrichAnomaly(a, week));
    const { reviews } = await store.listReviews({ sinceIso: new Date(Date.now() - 30 * DAY).toISOString() });
    const pending = reviews.filter((r) => r.status === "pending_owner");
    const merged24 = week.merged.filter((e) => Date.parse(e.at || "") > Date.now() - DAY);
    const { views, ready: viewsReady } = await store.listViews(req.user.id);
    const me = { id: req.user.id, username: req.user.username };
    const counts = {};
    for (const v of BUILTIN_VIEWS) counts[v.id] = countView(merged24, v.query, me);
    for (const v of views) counts[v.id] = countView(merged24, v.query, me);
    const admins = await store.listAdmins();
    // Leaderboard / chart names -> users for avatars.
    const users = { ...week.users };
    for (const a of admins) users[a.id] = users[a.id] || a;
    res.set("Cache-Control", "no-store");
    res.json({
      ...summary,
      anomalies: enriched,
      pending: owner ? pending : pending.filter((p) => p.reviewed_by === req.user.id),
      views,
      viewsReady,
      counts,
      admins,
      users,
      owner,
      me,
      ownerName: (admins.find((x) => x.owner) || {}).username || "admin",
      durable: week.durable,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[audit-console] summary", err?.message || err);
    res.status(500).json(apiError("Could not load the audit summary."));
  }
});

/* ------------------------------------------------------------------ */
/* one entry                                                           */
/* ------------------------------------------------------------------ */

async function loadEntry(id) {
  const found = await store.findEntry(id);
  if (!found) return null;
  const e = found.entry;
  const later = e.target != null && e.action !== "agent_run" ? await store.sameTarget(e.target, { limit: 150 }) : [];
  return { ...found, later };
}

router.get("/audit/entry/:id", async (req, res) => {
  try {
    const id = String(req.params.id || "").slice(0, 120);
    const found = await loadEntry(id);
    if (!found) return res.status(404).json(apiError("Entry not found.", null, { code: "NOT_FOUND" }));
    const { entry, later } = found;
    const st = undo.undoState(entry, later, { sections: req.adminSections || null });
    const notes = await store.listNotes(entry.id);
    const ids = new Set([entry.id, ...(entry.merged || []).map((m) => m.id)]);
    const linked = later.filter((e) => ids.has(String(e.meta?.undoOf || "")) || ids.has(String(e.meta?.linkedTo || "")));
    const related = later.filter((e) => e.id !== entry.id).slice(0, 40);
    const refs = await store.resolveRefs([entry, ...related, ...linked]);
    res.set("Cache-Control", "no-store");
    res.json({
      entry,
      request: entry.request || found.raw?.request || null,
      undo: st,
      linked,
      related,
      relatedCount: Math.max(0, later.length - 1),
      notes: notes.notes,
      notesReady: notes.ready,
      users: { ...found.users, ...refs.users },
      servers: { ...found.servers, ...refs.servers },
    });
  } catch (err) {
    console.error("[audit-console] entry", err?.message || err);
    res.status(500).json(apiError("Could not load the entry."));
  }
});

router.post("/audit/entry/:id/undo", async (req, res) => {
  const reason = cleanText(req.body?.reason, 500);
  if (reason.length < 5) return res.status(400).json(apiError("Write a reason (at least 5 characters).", null, { code: "REASON_REQUIRED" }));
  try {
    const found = await loadEntry(String(req.params.id || "").slice(0, 120));
    if (!found) return res.status(404).json(apiError("Entry not found.", null, { code: "NOT_FOUND" }));
    const out = await undo.undoEntry({
      entry: found.entry,
      later: found.later,
      actor: req.user,
      reason,
      notify: req.body?.notify === true,
      io: req.app.get("io"),
      sections: req.adminSections || null,
    });
    invalidateWeek();
    return res.json(out);
  } catch (err) {
    if (err instanceof undo.UndoError) return res.status(err.status).json(apiError("This action can't be undone now.", null, { code: err.code }));
    console.error("[audit-console] undo", err?.message || err);
    return res.status(500).json(apiError("Undo failed."));
  }
});

router.post("/audit/entry/:id/notes", async (req, res) => {
  const body = cleanText(req.body?.body, 1000);
  if (!body) return res.status(400).json(apiError("Write a note.", null, { code: "NOTE_REQUIRED" }));
  try {
    const found = await store.findEntry(String(req.params.id || "").slice(0, 120));
    if (!found) return res.status(404).json(apiError("Entry not found.", null, { code: "NOT_FOUND" }));
    const out = await store.addNote(req.user, found.entry.id, body);
    if (out.error === "missing") return res.status(503).json(apiError("Notes are not available yet.", null, { code: "NOTES_UNAVAILABLE" }));
    if (out.error) return res.status(500).json(apiError("Could not save the note."));
    audit(req.user, "audit_note_add", found.entry.id, { length: body.length, action: found.entry.action });
    return res.status(201).json({ note: out.note });
  } catch (err) {
    console.error("[audit-console] note", err?.message || err);
    return res.status(500).json(apiError("Could not save the note."));
  }
});

/* ------------------------------------------------------------------ */
/* anomalies                                                           */
/* ------------------------------------------------------------------ */

/** Take one section away from an admin (owner only). */
async function suspendSection(req, { adminId, section, reason, reviewKey }) {
  const supabase = require("../db/supabase");
  const before = await supabase.from("users").select("id, username, is_admin, is_super_admin, admin_permissions").eq("id", adminId).maybeSingle();
  if (before.error) return { error: "PERMISSIONS_UNAVAILABLE", status: 503 };
  const target = before.data;
  if (!target?.is_admin) return { error: "NOT_ADMIN", status: 404 };
  if (perms.isOwner(target, target)) return { error: "OWNER_PROTECTED", status: 400 };
  const current = target.admin_permissions == null ? [...perms.LEGACY_SECTIONS] : perms.normalizeSections(target.admin_permissions);
  const next = current.filter((s) => s !== section);
  const upd = await supabase.from("users").update({ admin_permissions: next }).eq("id", adminId).select("id").single();
  if (upd.error) return { error: "FAILED", status: 500 };
  perms.invalidate(adminId);
  audit(req.user, "admin_permissions", target.username, { before: target.admin_permissions ?? "all", after: next, removed: section, reason, via: "audit", anomaly: reviewKey });
  try {
    req.app.get("io")?.to(`user:${adminId}`)?.emit("admin:permissions", { sections: perms.sectionsFor(target, { ...target, admin_permissions: next }) });
  } catch {
    /* offline */
  }
  return { ok: true, username: target.username, section, sections: next };
}

router.post("/audit/anomalies/review", async (req, res) => {
  const key = cleanText(req.body?.key, 300);
  const decision = String(req.body?.decision || "");
  const reason = cleanText(req.body?.reason, 500);
  if (!["reviewed", "undo", "suspend"].includes(decision)) return res.status(400).json(apiError("Unknown decision.", null, { code: "BAD_DECISION" }));
  if (reason.length < 5) return res.status(400).json(apiError("Write a reason (at least 5 characters).", null, { code: "REASON_REQUIRED" }));
  try {
    const week = await loadWeek({ fresh: true });
    const { anomalies } = await openAnomalies(week);
    const a = anomalies.find((x) => x.key === key);
    if (!a) return res.status(404).json(apiError("This alert is already closed.", null, { code: "ANOMALY_CLOSED" }));
    const base = {
      anomaly_key: a.key,
      rule: a.rule,
      actor_id: a.actorId,
      actor_username: a.actorUsername,
      decision,
      reason,
      entry_ids: a.entryIds,
      reviewed_by: req.user.id,
      reviewed_by_username: req.user.username,
    };
    const owner = await isOwner(req);

    if (decision === "reviewed") {
      const saved = await store.saveReview({ ...base, status: "closed", decided_at: new Date().toISOString() });
      if (saved.error) return res.status(500).json(apiError("Could not save the review."));
      audit(req.user, "audit_review", a.actorUsername || a.actorId, { anomaly: a.key, rule: a.rule, decision, count: a.count, reason });
      invalidateWeek();
      return res.json({ ok: true, decision, durable: saved.durable });
    }

    if (decision === "undo") {
      const want = Array.isArray(req.body?.entryIds) && req.body.entryIds.length ? new Set(req.body.entryIds.map(String)) : new Set(a.entryIds);
      const results = [];
      for (const id of a.entryIds) {
        if (!want.has(id)) continue;
        const entry = week.merged.find((e) => e.id === id);
        if (!entry) {
          results.push({ id, ok: false, code: "NOT_FOUND" });
          continue;
        }
        const later = week.merged.filter((e) => String(e.target ?? "") === String(entry.target ?? ""));
        try {
          const out = await undo.undoEntry({ entry, later, actor: req.user, reason, notify: req.body?.notify === true, io: req.app.get("io"), sections: req.adminSections || null, batch: a.key });
          results.push({ id, ok: true, emailed: out.emailed ?? null });
        } catch (err) {
          results.push({ id, ok: false, code: err?.code || "FAILED" });
        }
      }
      const done = results.filter((r) => r.ok).length;
      await store.saveReview({ ...base, status: "closed", decided_at: new Date().toISOString(), entry_ids: [...want] });
      audit(req.user, "audit_review", a.actorUsername || a.actorId, { anomaly: a.key, rule: a.rule, decision, count: a.count, undone: done, reason });
      invalidateWeek();
      notifyAdmins(req, { type: "audit_review", key: a.key, decision, undone: done });
      return res.json({ ok: true, decision, results, undone: done });
    }

    // suspend
    const section = model.ACTION_SECTION[a.action];
    if (!section || !a.actorId) return res.status(400).json(apiError("This alert has no section to suspend.", null, { code: "NO_SECTION" }));
    if (a.actorId === req.user.id) return res.status(400).json(apiError("You can't suspend your own permission.", null, { code: "SELF" }));
    if (owner) {
      const out = await suspendSection(req, { adminId: a.actorId, section, reason, reviewKey: a.key });
      if (out.error) return res.status(out.status).json(apiError("The permission change was refused.", null, { code: out.error }));
      await store.saveReview({ ...base, section, status: "closed", decided_at: new Date().toISOString(), decided_by_username: req.user.username });
      audit(req.user, "audit_review", a.actorUsername || a.actorId, { anomaly: a.key, rule: a.rule, decision, section, reason });
      invalidateWeek();
      return res.json({ ok: true, decision, applied: true, section });
    }
    const saved = await store.saveReview({ ...base, section, status: "pending_owner" });
    if (saved.error) return res.status(500).json(apiError("Could not save the request."));
    audit(req.user, "audit_suspend_request", a.actorUsername || a.actorId, { anomaly: a.key, rule: a.rule, section, reason });
    notifyAdmins(req, { type: "audit_suspend_request", key: a.key, section, actor: a.actorUsername });
    invalidateWeek();
    return res.json({ ok: true, decision, applied: false, pendingOwner: true, section });
  } catch (err) {
    console.error("[audit-console] review", err?.message || err);
    return res.status(500).json(apiError("Could not save the review."));
  }
});

async function decide(req, res, approve) {
  if (!(await isOwner(req))) return res.status(403).json(apiError("Only the owner account can decide this.", null, { code: "OWNER_ONLY" }));
  try {
    const review = await store.getReview(String(req.params.id));
    if (!review || review.status !== "pending_owner") return res.status(404).json(apiError("Request not found.", null, { code: "NOT_FOUND" }));
    if (approve) {
      const out = await suspendSection(req, { adminId: review.actor_id, section: review.section, reason: review.reason, reviewKey: review.anomaly_key });
      if (out.error) return res.status(out.status).json(apiError("The permission change was refused.", null, { code: out.error }));
    }
    const upd = await store.updateReview(review.id, { status: approve ? "closed" : "declined", decided_at: new Date().toISOString(), decided_by_username: req.user.username });
    if (upd.error) return res.status(500).json(apiError("Could not save the decision."));
    audit(req.user, "audit_review", review.actor_username || review.actor_id, { anomaly: review.anomaly_key, decision: approve ? "suspend_approved" : "suspend_declined", section: review.section });
    invalidateWeek();
    notifyAdmins(req, { type: "audit_review", key: review.anomaly_key, decision: approve ? "suspend_approved" : "suspend_declined" });
    return res.json({ ok: true });
  } catch (err) {
    console.error("[audit-console] decide", err?.message || err);
    return res.status(500).json(apiError("Could not save the decision."));
  }
}

router.post("/audit/reviews/:id/approve", (req, res) => decide(req, res, true));
router.post("/audit/reviews/:id/decline", (req, res) => decide(req, res, false));

/* ------------------------------------------------------------------ */
/* saved views, rules                                                  */
/* ------------------------------------------------------------------ */

router.get("/audit/views", async (req, res) => {
  const out = await store.listViews(req.user.id);
  res.set("Cache-Control", "no-store");
  res.json(out);
});

router.post("/audit/views", async (req, res) => {
  const name = cleanText(req.body?.name, 60);
  if (!name) return res.status(400).json(apiError("Name the view.", null, { code: "NAME_REQUIRED" }));
  try {
    const out = await store.createView(req.user, { name, query: viewQueryFrom(req.body?.query), shared: req.body?.shared === true });
    if (out.error === "missing") return res.status(503).json(apiError("Saved views are not available yet.", null, { code: "VIEWS_UNAVAILABLE" }));
    if (out.error === "limit") return res.status(409).json(apiError("You can save up to 20 views.", null, { code: "VIEWS_LIMIT" }));
    if (out.error) return res.status(500).json(apiError("Could not save the view."));
    audit(req.user, "audit_view_create", out.view.id, { name, shared: out.view.shared });
    return res.status(201).json({ view: out.view });
  } catch (err) {
    console.error("[audit-console] view", err?.message || err);
    return res.status(500).json(apiError("Could not save the view."));
  }
});

router.delete("/audit/views/:id", async (req, res) => {
  if (!model.UUID_RE.test(String(req.params.id))) return res.status(400).json(apiError("Invalid view."));
  try {
    const out = await store.deleteView(req.user, req.params.id, { owner: await isOwner(req) });
    if (out.error === "missing") return res.status(503).json(apiError("Saved views are not available yet.", null, { code: "VIEWS_UNAVAILABLE" }));
    if (out.error === "not_found") return res.status(404).json(apiError("View not found."));
    if (out.error === "forbidden") return res.status(403).json(apiError("Only the person who saved it can delete it.", null, { code: "NOT_YOURS" }));
    if (out.error) return res.status(500).json(apiError("Could not delete the view."));
    audit(req.user, "audit_view_delete", req.params.id, { name: out.name });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json(apiError("Could not delete the view."));
  }
});

router.get("/audit/rules", async (_req, res) => {
  const { ready, stored } = await store.loadRules();
  const last = stored.reduce((m, r) => (!m || String(r.updated_at) > String(m.updated_at) ? r : m), null);
  res.set("Cache-Control", "no-store");
  res.json({ ready, rules: model.effectiveRules(stored), updatedBy: last?.updated_by_username || null, updatedAt: last?.updated_at || null });
});

router.put("/audit/rules", async (req, res) => {
  const input = Array.isArray(req.body?.rules) ? req.body.rules : null;
  if (!input) return res.status(400).json(apiError("rules must be a list.", null, { code: "BAD_RULES" }));
  const known = new Set(model.DEFAULT_RULES.map((r) => r.key));
  const clean = [];
  for (const r of input.slice(0, 20)) {
    if (!known.has(String(r?.key))) continue;
    clean.push({ key: String(r.key), enabled: r.enabled !== false, limit: Number(r.limit), windowSec: Number(r.windowSec) });
  }
  const rules = model.effectiveRules(clean.map((r) => ({ key: r.key, enabled: r.enabled, limit: r.limit, windowSec: r.windowSec })));
  try {
    const before = model.effectiveRules((await store.loadRules()).stored);
    const out = await store.saveRules(req.user, rules.filter((r) => clean.some((c) => c.key === r.key)));
    if (out.error === "missing") return res.status(503).json(apiError("Alert rules are not available yet.", null, { code: "RULES_UNAVAILABLE" }));
    if (out.error) return res.status(500).json(apiError("Could not save the rules."));
    const changes = rules
      .map((r) => {
        const b = before.find((x) => x.key === r.key);
        return b && (b.limit !== r.limit || b.windowSec !== r.windowSec || b.enabled !== r.enabled) ? { key: r.key, from: { limit: b.limit, windowSec: b.windowSec, enabled: b.enabled }, to: { limit: r.limit, windowSec: r.windowSec, enabled: r.enabled } } : null;
      })
      .filter(Boolean);
    audit(req.user, "audit_rules_update", "rules", { changes });
    invalidateWeek();
    return res.json({ ok: true, rules });
  } catch (err) {
    console.error("[audit-console] rules", err?.message || err);
    return res.status(500).json(apiError("Could not save the rules."));
  }
});

/* ------------------------------------------------------------------ */
/* export                                                              */
/* ------------------------------------------------------------------ */

router.get("/audit/export", async (req, res) => {
  const format = req.query.format === "json" ? "json" : "csv";
  try {
    const f = model.parseFilter(req.query);
    if (f.actors.includes("@me")) f.actors = f.actors.map((a) => (a === "@me" ? req.user.username : a));
    const fromIso = f.from || new Date(Date.now() - 90 * DAY).toISOString();
    const { raw } = await store.loadWindow(fromIso, { max: 10000, f });
    const refs = await store.resolveRefs(raw);
    const merged = model.mergeEntries(raw, { merge: f.merge });
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
    let content;
    if (format === "json") {
      content = JSON.stringify(
        {
          kind: "descall-admin-audit",
          version: 1,
          exportedAt: new Date().toISOString(),
          exportedBy: req.user.username,
          filter: { ...f, from: fromIso },
          entries: merged.map((e) => ({ ...e, meta: model.stripPrivate(e.meta), targetUser: refs.users[e.targetUserId] ? { id: e.targetUserId, username: refs.users[e.targetUserId].username } : null })),
        },
        null,
        2
      );
    } else {
      content = model.toCsv(merged, refs.users);
    }
    const written = audit(req.user, "audit_export", "audit", {
      format,
      rows: merged.length,
      from: fromIso,
      to: f.to || null,
      filters: { actor: f.actors, cat: f.categories, sev: f.severities, target: f.target, q: f.q || null, source: f.source },
    });
    res.set("Cache-Control", "no-store");
    return res.json({
      filename: `descall-islem-kaydi-${stamp}.${format}`,
      mime: format === "json" ? "application/json" : "text/csv;charset=utf-8",
      content,
      rows: merged.length,
      auditId: written?.id || null,
    });
  } catch (err) {
    console.error("[audit-console] export", err?.message || err);
    return res.status(500).json(apiError("Export failed."));
  }
});

router.__invalidate = invalidateWeek;
module.exports = router;
