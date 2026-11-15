"use strict";

/**
 * Kelime filtresi at runtime (Moderasyon › İçerik filtreleri, Nov 2026): the
 * single source of truth for filter words. Rules live in public.profanity_rules
 * (built-in words, the old system_settings list copied on first read, admin
 * rules); until the migration is applied the built-in list and the legacy words
 * keep working read-only.
 *
 * Message paths call gate() before saving a message (sync, cached rules) and
 * after() once it is saved:
 *  - block*        → the message is not saved, the sender gets CONTENT_BLOCKED;
 *  - *_flag        → a row in public.flagged_messages for the İşaretli mesajlar queue;
 *  - block_timeout → the sender is also timed out (auto-escalation applies);
 *  - mask          → nothing at send time (display masking stays on the clients).
 * Every match is counted in public.profanity_rule_hits (7-day sparks, stats).
 */

const { apiText } = require("./apiError");
const supabase = require("../db/supabase");
const state = require("../runtime/sharedState");
const core = require("./contentFilterCore");
const { DEFAULT_WORDS } = require("./profanity");

const CACHE_MS = 30 * 1000;
const FLUSH_MS = 10 * 1000;
const MAX_BUFFER = 2000;

const cache = {
  rules: null, // [{ id, pattern, kind, severity, language, action, timeoutSeconds, source, hitsTotal, removedAt, createdAt }]
  compiled: null,
  ready: false, // public.profanity_rules exists
  loadedAt: 0,
  loading: null,
};
const hitBuffer = [];
let flushTimer = null;

function isMissingTable(error) {
  if (!error) return false;
  const code = String(error.code || "");
  if (code === "42P01" || code === "PGRST205") return true;
  return /(does not exist|schema cache)/i.test(String(error.message || ""));
}

function unavailable() {
  const err = new Error("Run the moderation desk migration first.");
  err.status = 503;
  err.code = "MODERATION_DESK_UNAVAILABLE";
  return err;
}

function httpError(status, message, code) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

function rowToRule(row) {
  return {
    id: row.id,
    pattern: row.pattern,
    kind: row.kind,
    severity: row.severity || "medium",
    language: row.language || "all",
    action: row.action || "mask",
    timeoutSeconds: row.timeout_seconds || null,
    source: row.source || "admin",
    hitsTotal: Number(row.hits_total) || 0,
    removedAt: row.removed_at || null,
    createdAt: row.created_at || null,
  };
}

/** Built-in + legacy words as rules (ids "default:…" / "legacy:…"), used before the migration. */
function fallbackRules() {
  const out = [];
  const seen = new Set();
  for (const { word, language } of core.defaultWordLanguages(DEFAULT_WORDS)) {
    const r = core.wordToRule(word);
    const key = `${r.kind}:${r.pattern}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: `default:${key}`, ...r, severity: "medium", language, action: "mask", timeoutSeconds: null, source: "default", hitsTotal: 0, removedAt: null });
  }
  for (const word of state.profanityWords || []) {
    const r = core.wordToRule(word);
    const key = `${r.kind}:${r.pattern}`;
    if (!r.pattern || seen.has(key)) continue;
    seen.add(key);
    out.push({ id: `legacy:${key}`, ...r, severity: "medium", language: "all", action: "mask", timeoutSeconds: null, source: "legacy", hitsTotal: 0, removedAt: null });
  }
  return out;
}

/** Rows to add so every built-in and legacy word has a rule (migrate on read). */
function missingSeedRows(existing) {
  const have = new Set((existing || []).map((r) => `${r.kind}:${r.pattern}`));
  const rows = [];
  for (const r of fallbackRules()) {
    const key = `${r.kind}:${r.pattern}`;
    if (have.has(key)) continue;
    have.add(key);
    rows.push({ pattern: r.pattern, kind: r.kind, severity: r.severity, language: r.language, action: r.action, source: r.source });
  }
  return rows;
}

/**
 * Keep the masking lists in step with the rules: state.profanityWords (admin
 * words for the iOS / push masking, persisted by systemSettings) and
 * state.profanityDisabledDefaults (built-in words an admin removed).
 */
function mirrorToMaskingState(rules) {
  const active = rules.filter((r) => !r.removedAt && r.kind !== "regex");
  const adminWords = active.filter((r) => r.source !== "default").map((r) => core.displayPattern(r));
  const removedDefaults = rules.filter((r) => r.removedAt && r.source === "default").map((r) => core.displayPattern(r));
  state.profanityDisabledDefaults = new Set(removedDefaults);
  return adminWords;
}

function setRules(rules, ready) {
  cache.rules = rules;
  cache.ready = ready;
  cache.compiled = core.compileRules(rules.filter((r) => !r.removedAt));
  cache.loadedAt = Date.now();
}

async function loadFromDb() {
  const read = () => supabase.from("profanity_rules").select("*").order("created_at", { ascending: true }).limit(5000);
  let { data, error } = await read();
  if (error) {
    if (isMissingTable(error)) {
      setRules(fallbackRules(), false);
      return cache.rules;
    }
    throw new Error(error.message || "profanity_rules read failed");
  }
  const seed = missingSeedRows((data || []).map(rowToRule));
  if (seed.length) {
    const ins = await supabase.from("profanity_rules").upsert(seed, { onConflict: "pattern,kind", ignoreDuplicates: true });
    if (!ins.error) ({ data, error } = await read());
  }
  const rules = (data || []).map(rowToRule);
  setRules(rules, true);
  const adminWords = mirrorToMaskingState(rules);
  // The legacy system_settings list follows the rules (System page, iOS masking).
  const current = [...(state.profanityWords || [])].sort().join("\u0000");
  if (adminWords.slice().sort().join("\u0000") !== current && state.profanityWords?.clear) {
    state.profanityWords.clear();
    for (const w of adminWords) state.profanityWords.add(w);
    persistLegacyWords().catch(() => {});
  }
  return rules;
}

async function persistLegacyWords() {
  const { persistSystemConfig } = require("./systemSettings");
  await persistSystemConfig(supabase, { profanityWords: [...(state.profanityWords || [])] });
}

/** Rules, read through a 30 s cache. */
async function loadRules({ force = false } = {}) {
  if (!force && cache.rules && Date.now() - cache.loadedAt < CACHE_MS) return cache.rules;
  if (cache.loading) return cache.loading;
  cache.loading = loadFromDb()
    .catch((e) => {
      console.warn("[contentFilter] load rules:", e?.message || e);
      if (!cache.rules) setRules(fallbackRules(), false);
      return cache.rules;
    })
    .finally(() => {
      cache.loading = null;
    });
  return cache.loading;
}

function compiledNow() {
  if (!cache.rules || Date.now() - cache.loadedAt > CACHE_MS) loadRules().catch(() => {});
  if (!cache.compiled) setRules(fallbackRules(), false);
  return cache.compiled;
}

function isReady() {
  return cache.ready;
}

/** Matches + verdict for one text with the current rules (sync). */
function check(text) {
  if (typeof text !== "string" || !text.trim() || text.startsWith("__voice__:")) return null;
  const matches = core.matchText(text, compiledNow());
  return core.verdictOf(matches);
}

/* ---------------- hits ---------------- */

function queueHits(verdict, { whereLabel, blocked }) {
  if (!verdict || !cache.ready) return;
  for (const m of verdict.matches) {
    if (!m.ruleId || String(m.ruleId).includes(":")) continue;
    if (hitBuffer.length >= MAX_BUFFER) break;
    hitBuffer.push({ rule_id: m.ruleId, where_label: whereLabel ? String(whereLabel).slice(0, 120) : null, blocked: Boolean(blocked), created_at: new Date().toISOString() });
  }
  if (!flushTimer && hitBuffer.length) {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flushHits().catch(() => {});
    }, FLUSH_MS);
    flushTimer.unref?.();
  }
}

async function flushHits() {
  if (!hitBuffer.length) return 0;
  const batch = hitBuffer.splice(0, hitBuffer.length);
  const { error } = await supabase.from("profanity_rule_hits").insert(batch);
  if (error) {
    if (!isMissingTable(error)) console.warn("[contentFilter] hits:", error.message);
    return 0;
  }
  const perRule = new Map();
  for (const h of batch) perRule.set(h.rule_id, (perRule.get(h.rule_id) || 0) + 1);
  for (const [ruleId, n] of perRule) {
    const rule = (cache.rules || []).find((r) => r.id === ruleId);
    const next = (rule?.hitsTotal || 0) + n;
    if (rule) rule.hitsTotal = next;
    await supabase.from("profanity_rules").update({ hits_total: next }).eq("id", ruleId);
  }
  return batch.length;
}

/* ---------------- where / flag ---------------- */

async function whereLabelFor(ctx) {
  try {
    if (ctx.convType === "server" && ctx.channelId) {
      const [ch, sv] = await Promise.all([
        supabase.from("server_channels").select("name").eq("id", ctx.channelId).maybeSingle(),
        ctx.serverId ? supabase.from("servers").select("name").eq("id", ctx.serverId).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      const channel = ch?.data?.name ? `#${ch.data.name}` : "#";
      return { full: sv?.data?.name ? `${sv.data.name} · ${channel}` : channel, short: channel };
    }
    if (ctx.convType === "dm" && ctx.peerId) {
      const name = state.usernameById?.get?.(String(ctx.peerId));
      return { full: name ? `DM · @${name}` : "DM", short: "DM" };
    }
    if (ctx.convType === "group" && ctx.groupId) {
      const { data } = await supabase.from("groups").select("name").eq("id", ctx.groupId).maybeSingle();
      return { full: data?.name ? `${data.name}` : "Group", short: data?.name || "Group" };
    }
  } catch {
    /* label is cosmetic */
  }
  return { full: null, short: null };
}

const CATEGORY_BY_SEVERITY = Object.freeze({ low: "language", medium: "language", high: "language" });

async function insertFlag({ source, verdict, authorId, content, messageId, ctx, where, blocked, reason, category }) {
  const row = {
    source,
    status: "pending",
    conv_type: ctx?.convType || "server",
    message_id: messageId ? String(messageId) : null,
    server_id: ctx?.serverId || null,
    channel_id: ctx?.channelId || null,
    group_id: ctx?.groupId || null,
    peer_id: ctx?.peerId || null,
    where_label: where || null,
    author_id: authorId || null,
    content: String(content || "").slice(0, 4000),
    severity: verdict?.severity || null,
    rule_kind: verdict ? core.ruleKindOf(verdict.matches) : null,
    category: category || (verdict ? CATEGORY_BY_SEVERITY[verdict.severity] : null),
    reason: reason || null,
    blocked: Boolean(blocked),
  };
  const { data, error } = await supabase.from("flagged_messages").insert(row).select("id").single();
  if (error) {
    if (!isMissingTable(error)) console.warn("[contentFilter] flag:", error.message);
    return null;
  }
  return data?.id || null;
}

function notifyAdmins(io, payload) {
  try {
    require("../socket/adminHandlers").notifyAdminRoom(io, payload);
  } catch {
    /* no socket layer in tests */
  }
}

async function autoTimeout({ io, userId, verdict }) {
  const moderation = require("./moderation");
  if (moderation.isBanned(userId) || moderation.isTimedOut(userId)) return null;
  const result = await moderation.applyTimeout({
    targetUserId: userId,
    actorUserId: null,
    category: "language",
    presetId: undefined,
    durationSeconds: verdict.timeoutSeconds || core.DEFAULT_TIMEOUT_SECONDS,
  });
  try {
    io?.to?.(`user:${userId}`)?.emit?.("system:timeout", result);
  } catch {
    /* best effort */
  }
  state.appendAudit?.(null, "content_filter", "content_filter_timeout", userId, { seconds: result.durationSeconds, severity: verdict.severity });
  try {
    await require("./moderationDesk").afterSanction({ io, userId, category: "language", actionType: "timeout", auto: true, appliedSeconds: result.durationSeconds });
  } catch (e) {
    console.warn("[contentFilter] escalation:", e?.message || e);
  }
  return result;
}

/**
 * Before a message is saved. Returns { blocked, verdict }. A blocked message is
 * recorded (hits, flag, timeout) here; the caller only answers the sender.
 * @param {{ io?: any, userId: string, text: string, ctx: { convType: string, serverId?: string, channelId?: string, groupId?: string, peerId?: string } }} p
 */
function gate({ io, userId, text, ctx }) {
  let verdict = null;
  try {
    verdict = check(text);
  } catch (e) {
    console.warn("[contentFilter] check:", e?.message || e);
    return { blocked: false, verdict: null };
  }
  if (!verdict) return { blocked: false, verdict: null };
  if (!verdict.block) return { blocked: false, verdict };
  (async () => {
    const where = await whereLabelFor(ctx || {});
    queueHits(verdict, { whereLabel: where.short, blocked: true });
    if (verdict.flag) {
      const id = await insertFlag({ source: "filter", verdict, authorId: userId, content: text, messageId: null, ctx, where: where.full, blocked: true });
      if (id) notifyAdmins(io, { type: "flagged_message", id, blocked: true });
    }
    if (verdict.action === "block_timeout") await autoTimeout({ io, userId, verdict });
  })().catch((e) => console.warn("[contentFilter] blocked side effects:", e?.message || e));
  return { blocked: true, verdict };
}

/** After the message is saved: count hits, flag it when a rule says so. */
function after(verdict, { io, userId, text, messageId, ctx }) {
  if (!verdict) return;
  (async () => {
    const where = await whereLabelFor(ctx || {});
    queueHits(verdict, { whereLabel: where.short, blocked: false });
    if (verdict.flag) {
      const id = await insertFlag({ source: "filter", verdict, authorId: userId, content: text, messageId, ctx, where: where.full, blocked: false });
      if (id) notifyAdmins(io, { type: "flagged_message", id, blocked: false });
    }
  })().catch((e) => console.warn("[contentFilter] after send:", e?.message || e));
}

/** Socket error payload for a blocked message (English phrase; the client translates it). */
function blockedPayload() {
  return apiText("message", "This message was blocked by the content filter.", null, { code: "CONTENT_BLOCKED" });
}

/* ---------------- admin CRUD ---------------- */

async function requireReady() {
  await loadRules();
  if (!cache.ready) throw unavailable();
}

async function addRule({ input, kind, severity, language, action, timeoutSeconds, actorId }) {
  await requireReady();
  const parsed = core.parseInput(input, kind);
  if (parsed.error) throw httpError(400, `Invalid filter rule (${parsed.error}).`, `RULE_${parsed.error.toUpperCase()}`);
  const sev = core.SEVERITIES.includes(severity) ? severity : "medium";
  const act = core.ACTIONS.includes(action) ? action : core.DEFAULT_ACTION_BY_SEVERITY[sev];
  const lang = core.LANGUAGES.includes(language) ? language : "all";
  const secs = act === "block_timeout" ? Math.max(60, Math.min(30 * 86400, Number(timeoutSeconds) || core.DEFAULT_TIMEOUT_SECONDS)) : null;
  const existing = (cache.rules || []).find((r) => r.pattern === parsed.pattern && r.kind === parsed.kind);
  const now = new Date().toISOString();
  let res;
  if (existing) {
    if (!existing.removedAt) throw httpError(409, "This rule already exists.", "RULE_EXISTS");
    res = await supabase
      .from("profanity_rules")
      .update({ removed_at: null, severity: sev, action: act, language: lang, timeout_seconds: secs, updated_at: now })
      .eq("id", existing.id)
      .select("*")
      .single();
  } else {
    res = await supabase
      .from("profanity_rules")
      .insert({ pattern: parsed.pattern, kind: parsed.kind, severity: sev, action: act, language: lang, timeout_seconds: secs, source: "admin", created_by: actorId || null })
      .select("*")
      .single();
  }
  if (res.error) {
    if (isMissingTable(res.error)) throw unavailable();
    if (String(res.error.code) === "23505") throw httpError(409, "This rule already exists.", "RULE_EXISTS");
    throw new Error(res.error.message);
  }
  await loadRules({ force: true });
  return rowToRule(res.data);
}

async function updateRule(id, { severity, action, language, timeoutSeconds }) {
  await requireReady();
  const rule = (cache.rules || []).find((r) => r.id === id && !r.removedAt);
  if (!rule) throw httpError(404, "Rule not found.", "RULE_NOT_FOUND");
  const patch = { updated_at: new Date().toISOString() };
  if (severity !== undefined) {
    if (!core.SEVERITIES.includes(severity)) throw httpError(400, "Invalid severity.", "RULE_SEVERITY");
    patch.severity = severity;
  }
  if (action !== undefined) {
    if (!core.ACTIONS.includes(action)) throw httpError(400, "Invalid action.", "RULE_ACTION");
    patch.action = action;
    patch.timeout_seconds = action === "block_timeout" ? Math.max(60, Math.min(30 * 86400, Number(timeoutSeconds) || rule.timeoutSeconds || core.DEFAULT_TIMEOUT_SECONDS)) : null;
  }
  if (language !== undefined) {
    if (!core.LANGUAGES.includes(language)) throw httpError(400, "Invalid language.", "RULE_LANGUAGE");
    patch.language = language;
  }
  const { data, error } = await supabase.from("profanity_rules").update(patch).eq("id", id).select("*").single();
  if (error) throw new Error(error.message);
  await loadRules({ force: true });
  return { before: rule, after: rowToRule(data) };
}

async function removeRule(id) {
  await requireReady();
  const rule = (cache.rules || []).find((r) => r.id === id && !r.removedAt);
  if (!rule) throw httpError(404, "Rule not found.", "RULE_NOT_FOUND");
  const { error } = await supabase.from("profanity_rules").update({ removed_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
  await loadRules({ force: true });
  return rule;
}

/** Old System page routes (POST/DELETE /admin/profanity) land here too. */
async function addLegacyWord(word, actorId) {
  await loadRules();
  if (!cache.ready) {
    state.profanityWords.add(String(word).trim());
    await persistLegacyWords();
    return null;
  }
  const r = core.wordToRule(word);
  return addRule({ input: r.kind === "prefix" ? `${r.pattern}*` : r.pattern, kind: r.kind, severity: "medium", language: "all", action: "mask", actorId }).catch((e) => {
    if (e.code === "RULE_EXISTS") return null;
    throw e;
  });
}

async function removeLegacyWord(word) {
  await loadRules();
  if (!cache.ready) {
    state.profanityWords.delete(word);
    await persistLegacyWords();
    return;
  }
  const r = core.wordToRule(word);
  const rule = (cache.rules || []).find((x) => x.pattern === r.pattern && x.kind === r.kind && !x.removedAt);
  if (rule) await removeRule(rule.id);
}

/**
 * Per-rule 7-day sparks and the stats row: matches, blocked, top channel.
 * @returns {Promise<{ byRule: Map<string, number[]>, matches7d: number, blocked7d: number, topWhere: string|null }>}
 */
async function hitStats({ now = Date.now() } = {}) {
  const since = new Date(now - 7 * 86400000).toISOString();
  const byRule = new Map();
  const out = { byRule, matches7d: 0, blocked7d: 0, topWhere: null };
  const { data, error } = await supabase
    .from("profanity_rule_hits")
    .select("rule_id, where_label, blocked, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(20000);
  if (error) return out;
  const whereCount = new Map();
  const dayStart = (ms) => Math.floor(ms / 86400000);
  const today = dayStart(now);
  for (const h of data || []) {
    out.matches7d += 1;
    if (h.blocked) out.blocked7d += 1;
    if (h.where_label) whereCount.set(h.where_label, (whereCount.get(h.where_label) || 0) + 1);
    const idx = 6 - (today - dayStart(Date.parse(h.created_at)));
    if (idx < 0 || idx > 6) continue;
    if (!byRule.has(h.rule_id)) byRule.set(h.rule_id, [0, 0, 0, 0, 0, 0, 0]);
    byRule.get(h.rule_id)[idx] += 1;
  }
  let best = 0;
  for (const [w, c] of whereCount) if (c > best) {
    best = c;
    out.topWhere = w;
  }
  return out;
}

function __resetForTests() {
  cache.rules = null;
  cache.compiled = null;
  cache.ready = false;
  cache.loadedAt = 0;
  cache.loading = null;
  hitBuffer.length = 0;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
}

module.exports = {
  isMissingTable,
  unavailable,
  loadRules,
  isReady,
  check,
  gate,
  after,
  blockedPayload,
  addRule,
  updateRule,
  removeRule,
  addLegacyWord,
  removeLegacyWord,
  hitStats,
  flushHits,
  insertFlag,
  whereLabelFor,
  fallbackRules,
  missingSeedRows,
  __resetForTests,
};
