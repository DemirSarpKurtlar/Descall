"use strict";

/**
 * İşlem kaydı (audit console) data access. Every read degrades: a missing table
 * or column answers empty / "not ready", never throws into the route.
 *
 * Sources: public.admin_audit (durable, request columns from
 * 20261115_audit_console.sql when applied), the in-memory state.auditLog (gap
 * filler) and public.moderation_actions (folded into their audit twin by
 * auditConsoleModel.mergeEntries).
 * Console tables (same migration): admin_audit_views (saved views),
 * admin_audit_rules (anomaly rule settings), admin_audit_reviews (anomaly
 * decisions, owner approvals) and admin_audit_notes (notes on one entry).
 */

const model = require("./auditConsoleModel");
const auditStore = require("./adminAuditStore");
const { escapeLike } = require("./usernamePolicy");

let dbOverride = null;
const db = () => dbOverride || require("../db/supabase");
const state = () => require("../runtime/sharedState");

const PAGE = 1000;
const memReviews = new Map(); // key -> review, when admin_audit_reviews is missing

function isMissing(err) {
  const msg = String(err?.message || err?.details || "");
  return err?.code === "42P01" || err?.code === "PGRST205" || /relation .* does not exist|could not find the table/i.test(msg);
}

function withTimeout(p, ms, fallback) {
  let t;
  return Promise.race([
    Promise.resolve(p).catch(() => fallback),
    new Promise((r) => {
      t = setTimeout(() => r(fallback), ms);
    }),
  ]).finally(() => clearTimeout(t));
}

/** Characters that would break a PostgREST or() expression. */
function orSafe(s) {
  return String(s || "").replace(/[,()*%\\"':]/g, " ").trim().slice(0, 60);
}

/* ------------------------------------------------------------------ */
/* name resolution                                                     */
/* ------------------------------------------------------------------ */

/** Usernames / ids in the filter -> user ids (actors, target, free text). */
async function resolveFilterNames(f) {
  const out = { actorIds: [], targetIds: [], qIds: [] };
  const names = new Set();
  for (const a of f.actors) if (!model.UUID_RE.test(a) && !["agent", "ajan"].includes(a.toLowerCase())) names.add(a);
  if (f.target && !model.UUID_RE.test(f.target)) names.add(f.target);
  if (f.target && model.UUID_RE.test(f.target)) out.targetIds.push(f.target);
  for (const a of f.actors) if (model.UUID_RE.test(a)) out.actorIds.push(a);
  const qWord = f.q ? orSafe(f.q.split(/\s+/)[0].replace(/^@/, "")) : "";
  try {
    if (names.size) {
      const res = await withTimeout(db().from("users").select("id, username").in("username", [...names]), 4000, { data: [] });
      for (const u of res?.data || []) {
        const lower = String(u.username).toLowerCase();
        if (f.actors.some((a) => a.toLowerCase() === lower)) out.actorIds.push(u.id);
        if (f.target && f.target.toLowerCase() === lower) out.targetIds.push(u.id);
      }
    }
    if (qWord.length >= 3) {
      const res = await withTimeout(db().from("users").select("id, username").ilike("username", `${escapeLike(qWord)}%`).limit(20), 4000, { data: [] });
      out.qIds = (res?.data || []).map((u) => u.id);
    }
  } catch {
    /* names stay unresolved; the JS filter still matches usernames */
  }
  return out;
}

/** Users and servers named in entries: { users: {id: user}, servers: {id: server} }. */
async function resolveRefs(entries) {
  const ids = new Set();
  const names = new Set();
  const serverIds = new Set();
  for (const e of entries) {
    if (e.actorId && model.UUID_RE.test(String(e.actorId))) ids.add(String(e.actorId));
    const t = e.target == null ? "" : String(e.target);
    if (/^server_/.test(e.action || "") && model.UUID_RE.test(t.split("/")[0])) serverIds.add(t.split("/")[0]);
    else if (model.UUID_RE.test(t)) ids.add(t);
    else if (t && /^[A-Za-z0-9._-]{2,32}$/.test(t) && USERNAME_TARGET.test(e.action || "")) names.add(t);
    if (e.meta?.author && model.UUID_RE.test(String(e.meta.author))) ids.add(String(e.meta.author));
  }
  const users = {};
  const servers = {};
  const cols = "id, username, display_name, avatar_url, is_admin, is_banned";
  const chunks = (arr) => {
    const out = [];
    for (let i = 0; i < arr.length; i += 400) out.push(arr.slice(i, i + 400));
    return out;
  };
  const tasks = [];
  for (const part of chunks([...ids])) tasks.push(withTimeout(db().from("users").select(cols).in("id", part), 5000, { data: [] }));
  for (const part of chunks([...names])) tasks.push(withTimeout(db().from("users").select(cols).in("username", part), 5000, { data: [] }));
  const serverTask = serverIds.size ? withTimeout(db().from("servers").select("id, name, icon_url").in("id", [...serverIds]), 5000, { data: [] }) : null;
  const results = await Promise.all(tasks);
  for (const res of results) for (const u of res?.data || []) users[u.id] = publicUser(u);
  if (serverTask) {
    const res = await serverTask;
    for (const s of res?.data || []) servers[s.id] = { id: s.id, name: s.name || null, iconUrl: s.icon_url || null };
  }
  const byName = new Map(Object.values(users).map((u) => [String(u.username).toLowerCase(), u]));
  for (const e of entries) {
    const t = e.target == null ? "" : String(e.target);
    if (users[t]) e.targetUserId = t;
    else if (byName.has(t.toLowerCase()) && USERNAME_TARGET.test(e.action || "")) e.targetUserId = byName.get(t.toLowerCase()).id;
    if (!e.actorUsername && e.actorId && users[e.actorId]) e.actorUsername = users[e.actorId].username;
    if (e.targetUserId && users[e.targetUserId]) e.targetUsername = users[e.targetUserId].username;
  }
  return { users, servers };
}

// Actions whose target is a username (or a label that starts with one), not an id.
const USERNAME_TARGET = /^(admin_permissions|2fa_|access_ban|access_unban|make_admin|remove_admin|antibot_)/;

function publicUser(u) {
  return {
    id: u.id,
    username: u.username || null,
    displayName: u.display_name || null,
    avatarUrl: u.avatar_url || null,
    isAdmin: Boolean(u.is_admin),
    isBanned: Boolean(u.is_banned),
  };
}

/* ------------------------------------------------------------------ */
/* sources                                                             */
/* ------------------------------------------------------------------ */

function actionNarrowing(f) {
  let codes = null;
  let prefixes = null;
  if (f.actions.length) return { codes: f.actions, prefixes: [] };
  if (f.categories.length) {
    const r = model.codesForCategories(f.categories);
    codes = r.codes;
    prefixes = r.prefixes;
  }
  if (f.severities.length && !f.categories.length) {
    const want = new Set(f.severities);
    codes = Object.keys(model.CATALOG).filter((c) => want.has(model.CATALOG[c][1]));
    // Codes whose severity depends on meta, and every prefix (cheap, filtered again in JS).
    codes.push("descoin_grant", "timeout");
    prefixes = model.PREFIXES.filter(([, , sev]) => want.has(sev) || want.has("medium")).map(([p]) => p);
  }
  return codes ? { codes: [...new Set(codes)], prefixes: prefixes || [] } : null;
}

/**
 * admin_audit rows for one page (newest first).
 * @returns {Promise<{rows: object[], full: boolean, ok: boolean}>}
 */
async function auditRows(f, resolved, { before = null, limit = 200 } = {}) {
  const build = (cols) => {
    let q = db().from("admin_audit").select(cols);
    if (f.from) q = q.gte("at", f.from);
    if (f.to) q = q.lte("at", f.to);
    if (f.after) q = q.gt("at", f.after);
    if (before) q = q.lt("at", before);
    const narrow = actionNarrowing(f);
    if (narrow) {
      const parts = [];
      if (narrow.codes.length) parts.push(`action.in.(${narrow.codes.map(orSafe).join(",")})`);
      for (const p of narrow.prefixes) parts.push(`action.like.${orSafe(p)}*`);
      if (parts.length) q = q.or(parts.join(","));
    }
    const hasAgent = f.actors.some((a) => ["agent", "ajan"].includes(a.toLowerCase()));
    if (f.actors.length && !hasAgent) {
      const names = f.actors.filter((a) => !model.UUID_RE.test(a)).map(orSafe).filter(Boolean);
      const ids = [...new Set(resolved.actorIds)];
      const parts = [];
      if (ids.length) parts.push(`actor_id.in.(${ids.join(",")})`);
      if (names.length) parts.push(`actor_username.in.(${names.join(",")})`);
      if (parts.length) q = q.or(parts.join(","));
    }
    if (f.target) {
      const ids = [...new Set(resolved.targetIds)];
      const parts = [`target.eq.${orSafe(f.target)}`];
      if (ids.length) parts.push(`target.in.(${ids.join(",")})`);
      q = q.or(parts.join(","));
    }
    if (f.source === "agent") q = q.or("action.eq.agent_tool,meta->>via.eq.agent");
    if (f.undone) q = q.not("meta->>undoOf", "is", null);
    const word = f.q ? orSafe(f.q.split(/\s+/)[0].replace(/^@/, "")) : "";
    if (word) {
      const parts = ["actor_username", "target", "action", "meta->>reason", "meta->>note", "meta->>title", "meta->>username", "meta->>category", "meta->>message"].map((c) => `${c}.ilike.*${word}*`);
      if (resolved.qIds?.length) parts.push(`target.in.(${resolved.qIds.join(",")})`);
      q = q.or(parts.join(","));
    }
    return q.order("at", { ascending: false }).limit(limit);
  };
  try {
    const useExt = auditStore.requestColumns() !== false;
    let res = await withTimeout(build(useExt ? auditStore.EXT_COLS : auditStore.BASE_COLS), 6000, { data: null, error: { message: "timeout" } });
    if (res?.error && useExt && auditStore.isMissingColumn(res.error)) {
      auditStore.setRequestColumns(false);
      res = await withTimeout(build(auditStore.BASE_COLS), 6000, { data: null, error: { message: "timeout" } });
    }
    if (res?.error) return { rows: [], full: false, ok: false };
    const data = res.data || [];
    return { rows: data.map((r) => model.normalize({ ...auditStore.fromRow(r) }, "audit")), full: data.length >= limit, ok: true };
  } catch {
    return { rows: [], full: false, ok: false };
  }
}

async function modRows(f, resolved, { before = null, limit = 200 } = {}) {
  if (f.source === "agent" || f.undone) return { rows: [], full: false };
  if (f.categories.length && !f.categories.includes("sanctions")) return { rows: [], full: false };
  const modCodes = ["ban", "unban", "timeout", "untimeout", "kick", "ban_extend", "timeout_extend"];
  const wanted = f.actions.length ? f.actions.filter((a) => modCodes.includes(a)) : modCodes;
  if (!wanted.length) return { rows: [], full: false };
  const hasAgent = f.actors.some((a) => ["agent", "ajan"].includes(a.toLowerCase()));
  if (hasAgent) return { rows: [], full: false };
  if (f.actors.length && !resolved.actorIds.length) return { rows: [], full: false };
  try {
    let q = db()
      .from("moderation_actions")
      .select("id, action_type, target_user_id, actor_user_id, created_at, category, reason, message, duration_seconds, expires_at, meta");
    if (f.from) q = q.gte("created_at", f.from);
    if (f.to) q = q.lte("created_at", f.to);
    if (f.after) q = q.gt("created_at", f.after);
    if (before) q = q.lt("created_at", before);
    if (wanted.length < modCodes.length) q = q.in("action_type", wanted);
    if (f.actors.length) q = q.in("actor_user_id", [...new Set(resolved.actorIds)]);
    if (f.target) {
      const ids = [...new Set(resolved.targetIds)];
      if (!ids.length) return { rows: [], full: false };
      q = q.in("target_user_id", ids);
    }
    const res = await withTimeout(q.order("created_at", { ascending: false }).limit(limit), 6000, { data: [], error: { message: "timeout" } });
    if (res?.error) return { rows: [], full: false };
    const data = res.data || [];
    return { rows: data.map((r) => model.normalize(r, "mod")).filter(Boolean), full: data.length >= limit };
  } catch {
    return { rows: [], full: false };
  }
}

function memoryRows(f, resolved, { before = null } = {}) {
  const b = before ? Date.parse(before) : Infinity;
  return (state().auditLog || [])
    .filter((e) => Date.parse(e.at || "") < b)
    .map((e) => model.normalize(e, "memory"))
    .filter((e) => model.matchesFilter(e, f, resolved));
}

/**
 * One page of merged entries.
 * @returns {Promise<{entries: object[], nextCursor: string|null, durable: boolean, users: object, servers: object}>}
 */
async function queryPage(f, { cursor = null, limit = 60 } = {}) {
  const resolved = await resolveFilterNames(f);
  const rawLimit = Math.min(1000, Math.max(50, Math.ceil(limit * 2.5)));
  const [audit, mod] = await Promise.all([
    auditRows(f, resolved, { before: cursor, limit: rawLimit }),
    modRows(f, resolved, { before: cursor, limit: rawLimit }),
  ]);
  const mem = memoryRows(f, resolved, { before: cursor });
  const cut = model.pageCutoff([{ rows: audit.rows, full: audit.full }, { rows: mod.rows, full: mod.full }]);
  const cutMs = cut ? Date.parse(cut) : -Infinity;
  const all = audit.rows.concat(mem, mod.rows).filter((e) => Date.parse(e.at || "") >= cutMs);
  const refs = await resolveRefs(all);
  // Free text also matches the target's username (resolveRefs filled targetUsername).
  const filtered = all.filter((e) => model.matchesFilter(e, f, resolved));
  const merged = model.mergeEntries(filtered, { merge: f.merge });
  let entries = merged;
  let nextCursor = cut;
  if (merged.length > limit) {
    entries = merged.slice(0, limit);
    // Next page starts below the oldest raw row of the last kept entry.
    const last = entries[entries.length - 1];
    const times = [last.at, last.from, ...(last.merged || []).map((m) => m.at), ...(last.twins || []).map((m) => m.at)].filter(Boolean);
    nextCursor = new Date(times.reduce((m, x) => Math.min(m, Date.parse(x)), Infinity)).toISOString();
  }
  for (const e of entries) {
    if (e.targetUserId && refs.users[e.targetUserId]) e.targetUsername = refs.users[e.targetUserId].username;
  }
  return { entries, nextCursor, durable: audit.ok, users: refs.users, servers: refs.servers };
}

/**
 * Every row since `fromIso` (summary, anomalies, export). Pages admin_audit by
 * 1000 up to `max` rows.
 */
async function loadWindow(fromIso, { max = 6000, f = null } = {}) {
  const filter = f || model.parseFilter({});
  const resolved = f ? await resolveFilterNames(filter) : { actorIds: [], targetIds: [], qIds: [] };
  const rows = [];
  let before = null;
  let ok = true;
  while (rows.length < max) {
    const page = await auditRows({ ...filter, from: fromIso && (!filter.from || filter.from < fromIso) ? fromIso : filter.from }, resolved, { before, limit: Math.min(PAGE, max - rows.length) });
    if (!page.ok) {
      ok = rows.length > 0;
      break;
    }
    rows.push(...page.rows);
    if (!page.full || !page.rows.length) break;
    before = page.rows[page.rows.length - 1].at;
  }
  const mod = await modRows({ ...filter, from: fromIso }, resolved, { limit: 2000 });
  const mem = memoryRows({ ...filter, from: fromIso }, resolved);
  const all = rows.concat(mem, mod.rows).filter((e) => model.matchesFilter(e, { ...filter, from: fromIso }, resolved));
  return { raw: all, durable: ok };
}

/** One entry by id (admin_audit, memory, moderation_actions), plus its neighbours for merging. */
async function findEntry(id) {
  const sid = String(id || "").replace(/^agentrun:/, "");
  let row = null;
  try {
    const res = await withTimeout(db().from("admin_audit").select(auditStore.requestColumns() === false ? auditStore.BASE_COLS : auditStore.EXT_COLS).eq("id", sid).maybeSingle(), 5000, { data: null, error: { message: "timeout" } });
    if (res?.error && auditStore.isMissingColumn(res.error)) {
      auditStore.setRequestColumns(false);
      const again = await withTimeout(db().from("admin_audit").select(auditStore.BASE_COLS).eq("id", sid).maybeSingle(), 5000, { data: null });
      if (again?.data) row = model.normalize(auditStore.fromRow(again.data), "audit");
    } else if (res?.data) {
      row = model.normalize(auditStore.fromRow(res.data), "audit");
    }
  } catch {
    /* fall through */
  }
  if (!row) {
    const mem = (state().auditLog || []).find((e) => String(e.id) === sid);
    if (mem) row = model.normalize(mem, "memory");
  }
  if (!row && model.UUID_RE.test(sid)) {
    try {
      const res = await withTimeout(db().from("moderation_actions").select("*").eq("id", sid).maybeSingle(), 5000, { data: null });
      if (res?.data) row = model.normalize(res.data, "mod");
    } catch {
      /* not found */
    }
  }
  if (!row) return null;
  // Neighbours (same actor, ±2 min) so the detail shows what the list merged.
  const at = Date.parse(row.at || "");
  const f = model.parseFilter({ from: new Date(at - 120e3).toISOString(), to: new Date(at + 120e3).toISOString() });
  const near = await queryPage(f, { limit: 400 });
  const hit =
    near.entries.find((e) => e.id === String(id) || e.id === sid || e.id === `agentrun:${sid}`) ||
    near.entries.find((e) => (e.merged || []).some((m) => m.id === sid) || (e.twins || []).some((m) => m.id === sid) || (e.tools || []).some((m) => m.id === sid));
  return { entry: hit || model.mergeEntries([row])[0], users: near.users, servers: near.servers, raw: row };
}

/** Later entries about the same target (undo state, related list). */
async function sameTarget(target, { limit = 200 } = {}) {
  if (!target) return [];
  const f = model.parseFilter({ target: String(target) });
  const page = await queryPage(f, { limit });
  return page.entries;
}

/* ------------------------------------------------------------------ */
/* console tables                                                      */
/* ------------------------------------------------------------------ */

async function listViews(userId) {
  try {
    const res = await db()
      .from("admin_audit_views")
      .select("id, owner_id, owner_username, name, query, shared, created_at")
      .or(`owner_id.eq.${userId},shared.eq.true`)
      .order("created_at", { ascending: true })
      .limit(100);
    if (res?.error) return { ready: !isMissing(res.error), views: [] };
    return { ready: true, views: (res.data || []).map(publicView) };
  } catch {
    return { ready: false, views: [] };
  }
}

function publicView(r) {
  return {
    id: r.id,
    ownerId: r.owner_id,
    ownerUsername: r.owner_username || null,
    name: r.name,
    query: r.query && typeof r.query === "object" ? r.query : {},
    shared: Boolean(r.shared),
    createdAt: r.created_at || null,
  };
}

async function createView(user, { name, query, shared }) {
  const count = await db().from("admin_audit_views").select("id", { count: "exact", head: true }).eq("owner_id", user.id);
  if (count?.error) return { error: isMissing(count.error) ? "missing" : "failed" };
  if ((count.count || 0) >= 20) return { error: "limit" };
  const res = await db()
    .from("admin_audit_views")
    .insert({ owner_id: user.id, owner_username: user.username || null, name, query, shared: Boolean(shared) })
    .select("id, owner_id, owner_username, name, query, shared, created_at")
    .single();
  if (res?.error) return { error: isMissing(res.error) ? "missing" : "failed" };
  return { view: publicView(res.data) };
}

async function deleteView(user, id, { owner = false } = {}) {
  const found = await db().from("admin_audit_views").select("id, owner_id, name").eq("id", id).maybeSingle();
  if (found?.error) return { error: isMissing(found.error) ? "missing" : "failed" };
  if (!found?.data) return { error: "not_found" };
  if (found.data.owner_id !== user.id && !owner) return { error: "forbidden" };
  const del = await db().from("admin_audit_views").delete().eq("id", id);
  if (del?.error) return { error: "failed" };
  return { ok: true, name: found.data.name };
}

async function loadRules() {
  try {
    const res = await db().from("admin_audit_rules").select("key, enabled, threshold, window_sec, updated_by_username, updated_at");
    if (res?.error) return { ready: !isMissing(res.error), stored: [] };
    return { ready: true, stored: res.data || [] };
  } catch {
    return { ready: false, stored: [] };
  }
}

async function saveRules(user, rules) {
  const now = new Date().toISOString();
  const rows = rules.map((r) => ({
    key: r.key,
    enabled: r.enabled !== false,
    threshold: r.limit,
    window_sec: r.windowSec,
    updated_by: user.id,
    updated_by_username: user.username || null,
    updated_at: now,
  }));
  const res = await db().from("admin_audit_rules").upsert(rows, { onConflict: "key" });
  if (res?.error) return { error: isMissing(res.error) ? "missing" : "failed" };
  return { ok: true };
}

async function listReviews({ sinceIso } = {}) {
  try {
    let q = db().from("admin_audit_reviews").select("id, anomaly_key, rule, actor_id, actor_username, decision, status, reason, section, entry_ids, reviewed_by, reviewed_by_username, created_at, decided_at, decided_by_username");
    if (sinceIso) q = q.gte("created_at", sinceIso);
    const res = await q.order("created_at", { ascending: false }).limit(500);
    if (res?.error) return { ready: !isMissing(res.error), reviews: [...memReviews.values()] };
    return { ready: true, reviews: res.data || [] };
  } catch {
    return { ready: false, reviews: [...memReviews.values()] };
  }
}

async function saveReview(row) {
  const full = { created_at: new Date().toISOString(), ...row };
  try {
    const res = await db().from("admin_audit_reviews").insert(full).select("*").single();
    if (!res?.error) return { review: res.data, durable: true };
    if (!isMissing(res.error)) return { error: "failed" };
  } catch {
    /* fall back to memory */
  }
  const mem = { id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, ...full };
  memReviews.set(mem.anomaly_key, mem);
  return { review: mem, durable: false };
}

async function updateReview(id, patch) {
  for (const [k, v] of memReviews) {
    if (v.id === id) {
      memReviews.set(k, { ...v, ...patch });
      return { review: memReviews.get(k) };
    }
  }
  try {
    const res = await db().from("admin_audit_reviews").update(patch).eq("id", id).select("*").single();
    if (res?.error) return { error: isMissing(res.error) ? "missing" : "failed" };
    return { review: res.data };
  } catch {
    return { error: "failed" };
  }
}

async function getReview(id) {
  for (const v of memReviews.values()) if (v.id === id) return v;
  try {
    const res = await db().from("admin_audit_reviews").select("*").eq("id", id).maybeSingle();
    return res?.data || null;
  } catch {
    return null;
  }
}

async function listNotes(entryId) {
  try {
    const res = await db().from("admin_audit_notes").select("id, entry_id, author_id, author_username, body, created_at").eq("entry_id", String(entryId)).order("created_at", { ascending: true }).limit(100);
    if (res?.error) return { ready: !isMissing(res.error), notes: [] };
    return { ready: true, notes: res.data || [] };
  } catch {
    return { ready: false, notes: [] };
  }
}

async function addNote(user, entryId, body) {
  const res = await db()
    .from("admin_audit_notes")
    .insert({ entry_id: String(entryId), author_id: user.id, author_username: user.username || null, body })
    .select("id, entry_id, author_id, author_username, body, created_at")
    .single();
  if (res?.error) return { error: isMissing(res.error) ? "missing" : "failed" };
  return { note: res.data };
}

/** Admin accounts (actor suggestions in the query bar). */
async function listAdmins() {
  try {
    const res = await withTimeout(db().from("users").select("id, username, display_name, avatar_url, is_super_admin").eq("is_admin", true).limit(200), 5000, { data: [] });
    if (res?.error) {
      const again = await withTimeout(db().from("users").select("id, username, display_name, avatar_url").eq("is_admin", true).limit(200), 5000, { data: [] });
      return (again?.data || []).map(publicUser);
    }
    return (res?.data || []).map((u) => ({ ...publicUser(u), owner: u.username === "admin" || Boolean(u.is_super_admin) }));
  } catch {
    return [];
  }
}

/** "Ortak nokta" of an anomaly: a server most targets joined on the same day. */
async function commonServer(userIds) {
  const ids = [...new Set((userIds || []).filter((x) => model.UUID_RE.test(String(x))))];
  if (ids.length < 3) return null;
  try {
    const res = await withTimeout(db().from("server_members").select("server_id, user_id, joined_at").in("user_id", ids).limit(5000), 5000, { data: [] });
    const by = new Map();
    for (const r of res?.data || []) {
      const day = String(r.joined_at || "").slice(0, 10);
      const k = `${r.server_id}|${day}`;
      if (!by.has(k)) by.set(k, new Set());
      by.get(k).add(r.user_id);
    }
    let best = null;
    for (const [k, set] of by) if (!best || set.size > best[1].size) best = [k, set];
    if (!best || best[1].size < Math.ceil(ids.length * 0.6)) return null;
    const [serverId, day] = best[0].split("|");
    const s = await withTimeout(db().from("servers").select("id, name").eq("id", serverId).maybeSingle(), 4000, { data: null });
    return { serverId, name: s?.data?.name || null, day, members: best[1].size, of: ids.length };
  } catch {
    return null;
  }
}

function __setDbForTests(client) {
  dbOverride = client;
  memReviews.clear();
}

module.exports = {
  isMissing,
  resolveFilterNames,
  resolveRefs,
  queryPage,
  loadWindow,
  findEntry,
  sameTarget,
  listViews,
  createView,
  deleteView,
  loadRules,
  saveRules,
  listReviews,
  saveReview,
  updateReview,
  getReview,
  listNotes,
  addNote,
  listAdmins,
  commonServer,
  publicUser,
  __setDbForTests,
};
