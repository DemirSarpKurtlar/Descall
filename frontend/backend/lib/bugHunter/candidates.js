"use strict";

/**
 * Retroactive "Bug Avcısı" list (read-only, grants nothing): feedback items from before the
 * feature that already look like confirmed real bugs, so the owner can decide who gets the
 * badge first. Used by GET /api/admin/feedback/bug-hunter/candidates and by
 * backend/scripts/bugHunterCandidates.js. Signals, strongest first:
 *   fix_link      a team reply or internal note links to a fix (GitHub pull / commit, "PR #12",
 *                 "commit abc1234") or names the release that fixed it ("3.8.1'de düzeldi")
 *   resolved      the item is resolved (or was resolved before it was closed)
 *   fix_reply     a team reply / note says it was fixed ("düzelttik", "giderildi", "fixed")
 * Only bug or security items that are not confirmed yet, from accounts that still exist.
 */

// Unicode letter edges (JS \b does not see Turkish letters as word characters).
const FIX_WORDS = /(?<!\p{L})(d[üu]zelt(tik|ildi|ti|me)|d[üu]zeldi|giderildi|[çc][öo]z[üu]ld[üu]|onar(d[ıi]k|[ıi]ld[ıi])|fix(ed|lendi)?|hotfix|patch(ed)?|yamal?)(?!\p{L})/iu;
const FIX_LINK = /(github\.com\/[^\s/]+\/[^\s/]+\/(pull|commit)\/[0-9a-f]+|\bPR\s?#\d+|\bcommit\s+[0-9a-f]{7,40}\b|\b(v|s[üu]r[üu]m\s?)?\d+\.\d+\.\d+\b.{0,24}(d[üu]zel|fix|gideril))/i;
const TYPES = new Set(["bug", "security"]);

function clip(s, n) {
  return String(s == null ? "" : s).slice(0, n);
}

function isBugItem(f) {
  return TYPES.has(f?.category) || f?.kind === "bug";
}

function teamTexts(f) {
  return (Array.isArray(f?.admin_replies) ? f.admin_replies : [])
    .filter((r) => r && r.type !== "system" && r.isAdmin !== false && typeof r.text === "string")
    .map((r) => r.text);
}

function wasResolved(f) {
  if (f?.status === "resolved") return true;
  return (Array.isArray(f?.admin_replies) ? f.admin_replies : []).some(
    (r) => r && r.type === "system" && (r.status === "resolved" || /durumu Çözüldü yaptı|status to Resolved/.test(String(r.text || "")))
  );
}

/** Signals for one feedback row, strongest first. */
function signalsOf(f) {
  const texts = teamTexts(f);
  const out = [];
  if (texts.some((t) => FIX_LINK.test(t))) out.push("fix_link");
  if (wasResolved(f)) out.push("resolved");
  if (texts.some((t) => FIX_WORDS.test(t))) out.push("fix_reply");
  return out;
}

function confidenceOf(signals) {
  const s = new Set(signals);
  if (s.has("fix_link") || (s.has("resolved") && s.has("fix_reply"))) return "high";
  if (s.has("resolved")) return "medium";
  return "low";
}

/**
 * @param {object[]} rows user_feedback rows
 * @param {Map<string, object>} users id -> { username, display_name, deleted_at }
 * @param {Set<string>} confirmed feedback ids with a live confirmation
 * @returns {{ items: object[], people: object[], counts: object }}
 */
function findCandidates(rows, users = new Map(), confirmed = new Set()) {
  const items = [];
  for (const f of rows || []) {
    if (!f?.id || !f.user_id || !isBugItem(f) || confirmed.has(String(f.id))) continue;
    const u = users.get(String(f.user_id));
    if (!u || u.deleted_at) continue;
    const signals = signalsOf(f);
    if (!signals.includes("resolved") && !signals.includes("fix_link")) continue;
    items.push({
      feedbackId: f.id,
      userId: String(f.user_id),
      username: u.username || f.username || null,
      displayName: u.display_name || null,
      subject: clip(f.subject || String(f.message || "").split(/\r?\n/, 1)[0], 120),
      status: f.status || null,
      createdAt: f.created_at || null,
      signals,
      confidence: confidenceOf(signals),
    });
  }
  const rank = { high: 0, medium: 1, low: 2 };
  items.sort((a, b) => rank[a.confidence] - rank[b.confidence] || String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
  const byUser = new Map();
  for (const it of items) {
    const cur = byUser.get(it.userId) || { userId: it.userId, username: it.username, displayName: it.displayName, items: 0, high: 0, first: it.createdAt };
    cur.items += 1;
    if (it.confidence === "high") cur.high += 1;
    if (it.createdAt && (!cur.first || it.createdAt < cur.first)) cur.first = it.createdAt;
    byUser.set(it.userId, cur);
  }
  const people = [...byUser.values()].sort((a, b) => b.high - a.high || b.items - a.items || String(a.first || "").localeCompare(String(b.first || "")));
  const counts = { items: items.length, people: people.length, high: items.filter((i) => i.confidence === "high").length };
  return { items, people, counts };
}

const COLS = "id, user_id, username, category, kind, status, subject, message, admin_replies, created_at";

/** Read the database (service role) and build the list. Never writes. */
async function load({ supabase, limit = 2000, pageSize = 500 } = {}) {
  const rows = [];
  for (let from = 0; from < limit; from += pageSize) {
    const to = Math.min(limit, from + pageSize) - 1;
    const { data, error } = await supabase.from("user_feedback").select(COLS)
      .or("category.eq.bug,category.eq.security,kind.eq.bug")
      .order("created_at", { ascending: true })
      .range(from, to);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < to - from + 1) break;
  }
  const ids = [...new Set(rows.map((r) => String(r.user_id || "")).filter(Boolean))];
  const users = new Map();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase.from("users").select("id, username, display_name, deleted_at").in("id", ids.slice(i, i + 200));
    for (const u of data || []) users.set(String(u.id), u);
  }
  const confirmed = new Set();
  try {
    const { data, error } = await supabase.from("feedback_bug_reports").select("feedback_id, undone_at");
    if (!error) for (const r of data || []) if (!r.undone_at) confirmed.add(String(r.feedback_id));
  } catch {
    /* before the migration nothing is confirmed */
  }
  return { ...findCandidates(rows, users, confirmed), scanned: rows.length };
}

module.exports = { findCandidates, signalsOf, confidenceOf, isBugItem, load, FIX_WORDS, FIX_LINK };
