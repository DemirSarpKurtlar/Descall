"use strict";

/**
 * Public server directory (item 8, Nov 2026).
 *
 * Owners opt in with servers.listed_in_directory. This is separate from is_public, which
 * already means "listed in in-app discovery for signed-in users" (Community & Discovery):
 * the directory is published on the open web and indexed by search engines, so it needs
 * its own consent. Columns: supabase/migrations/20261111_server_directory.sql. Until that
 * migration is applied every read answers "unavailable" with an empty list, never a 500.
 *
 * A listed server is shown only when:
 *   - it has a valid directory_category,
 *   - it has at least MIN_PUBLIC_MEMBERS members,
 *   - Descall moderation has not hidden it (directory_hidden_at),
 *   - its owner account is not banned or deleted (users.is_banned / users.deleted_at).
 * Deleted servers are gone from the table (hard delete), so they never appear.
 *
 * Only the card fields below leave this module: name, icon, directory description, tags,
 * category, language, member and online counts, and when it was listed. Never channels,
 * member lists, owner ids, rules, invites or messages.
 *
 * Keep CATEGORIES / LANGUAGES / limits identical to frontend/src/lib/serverDirectory.js
 * (lib/serverDirectory.selftest.cjs compares them).
 */

const { maskProfanity } = require("./profanity");
const { countVisibleOnline } = require("./invitePreviewExtras");
const { createSingleflight } = require("./singleflight");

const CATEGORIES = [
  "gaming-minecraft",
  "gaming-fps",
  "gaming-cs2",
  "gaming-lol",
  "gaming-other",
  "study",
  "music",
  "art",
  "tech",
  "anime",
  "sports",
  "chat-friends",
  "other",
];
const LANGUAGES = ["tr", "en", "de", "es", "fr", "pt-BR", "ru", "other"];
const SORTS = ["members", "online", "newest"];
const MIN_PUBLIC_MEMBERS = 3;
const DESCRIPTION_MAX = 300;
const TAGS_MAX = 5;
const TAG_LEN_MAX = 24;
const PAGE_DEFAULT = 24;
const PAGE_MAX = 48;
/** Listed servers considered per snapshot (newest listings first). */
const SNAPSHOT_WINDOW = 500;
const SNAPSHOT_TTL_MS = 2 * 60 * 1000;
const COUNT_CONCURRENCY = 8;
const MEMBER_SCAN = 5000;

const SERVER_COLS =
  "id, name, icon_url, description, owner_id, listed_in_directory, directory_category, directory_language, directory_description, directory_tags, directory_listed_at, directory_hidden_at, created_at";

/** PostgREST / Postgres answers for a column or table that does not exist yet. */
function isMissingSchemaError(err) {
  if (!err) return false;
  const code = String(err.code || "");
  if (["42703", "42P01", "PGRST204", "PGRST205"].includes(code)) return true;
  return /column .* does not exist|could not find the .* column|schema cache/i.test(String(err.message || ""));
}

function cleanText(raw, max) {
  const s = String(raw == null ? "" : raw)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return max ? s.slice(0, max + 1) : s;
}

/** "#Survival Games " -> "survival-games"; null when nothing usable is left. */
function normalizeTag(raw) {
  const s = String(raw == null ? "" : raw)
    .normalize("NFC")
    .replace(/^#+/, "")
    .replace(/İ/g, "i")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]+/gu, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return s || null;
}

/** Array or "a, b, c" -> unique normalized tags (order kept); { tags, tooMany, tooLong }. */
function parseTags(input) {
  const list = Array.isArray(input) ? input : String(input == null ? "" : input).split(",");
  const out = [];
  let tooLong = false;
  for (const raw of list) {
    const tag = normalizeTag(raw);
    if (!tag) continue;
    if (tag.length > TAG_LEN_MAX) tooLong = true;
    if (!out.includes(tag)) out.push(tag);
  }
  return { tags: out, tooMany: out.length > TAGS_MAX, tooLong };
}

/**
 * Validate an owner's listing form. Returns { patch } with snake_case columns, or
 * { error: { template, vars, code } }. `current` is the stored server row.
 */
function normalizeListingInput(body = {}, current = {}, now = new Date()) {
  const patch = {};
  const listed = body.listed === undefined ? Boolean(current.listed_in_directory) : Boolean(body.listed);
  const category = body.category === undefined ? current.directory_category || null : body.category || null;
  const language = body.language === undefined ? current.directory_language || null : body.language || null;

  if (category != null && !CATEGORIES.includes(String(category))) {
    return { error: { template: "Pick a category for the directory.", code: "DIRECTORY_CATEGORY" } };
  }
  if (language != null && !LANGUAGES.includes(String(language))) {
    return { error: { template: "Pick the main language of the server.", code: "DIRECTORY_LANGUAGE" } };
  }
  if (listed && !category) {
    return { error: { template: "Pick a category for the directory.", code: "DIRECTORY_CATEGORY" } };
  }
  if (listed && !language) {
    return { error: { template: "Pick the main language of the server.", code: "DIRECTORY_LANGUAGE" } };
  }
  if (body.description !== undefined) {
    const text = cleanText(body.description, DESCRIPTION_MAX);
    if (text.length > DESCRIPTION_MAX) {
      return {
        error: {
          template: "The directory description can be at most {max} characters.",
          vars: { max: DESCRIPTION_MAX },
          code: "DIRECTORY_DESCRIPTION",
        },
      };
    }
    patch.directory_description = text || null;
  }
  if (body.tags !== undefined) {
    const { tags, tooMany, tooLong } = parseTags(body.tags);
    if (tooMany || tooLong) {
      return {
        error: {
          template: "Use at most {max} tags, each up to {len} characters.",
          vars: { max: TAGS_MAX, len: TAG_LEN_MAX },
          code: "DIRECTORY_TAGS",
        },
      };
    }
    patch.directory_tags = tags;
  }
  patch.listed_in_directory = listed;
  patch.directory_category = category;
  patch.directory_language = language;
  if (listed && !current.listed_in_directory) patch.directory_listed_at = now.toISOString();
  if (!listed) patch.directory_listed_at = null;
  return { patch };
}

/**
 * Why a server is not shown, or null when it is shown.
 * owner: { is_banned, deleted_at } | null (null = the owner row is gone).
 */
function hiddenReason(row, { memberCount = 0, owner } = {}) {
  if (!row || !row.listed_in_directory) return "not_listed";
  if (row.directory_hidden_at) return "moderation";
  if (!CATEGORIES.includes(String(row.directory_category || ""))) return "no_category";
  if (!owner || owner.is_banned || owner.deleted_at) return "owner_unavailable";
  if (!(Number(memberCount) >= MIN_PUBLIC_MEMBERS)) return "too_few_members";
  return null;
}

/** The only shape that leaves the directory (allow-list, profanity masked). */
function publicCard(row, { memberCount = 0, onlineCount = 0 } = {}) {
  const description = row.directory_description || row.description || null;
  const tags = Array.isArray(row.directory_tags) ? row.directory_tags.slice(0, TAGS_MAX) : [];
  return {
    id: row.id,
    name: maskProfanity(String(row.name || "")),
    iconUrl: row.icon_url || null,
    description: description ? maskProfanity(String(description).slice(0, DESCRIPTION_MAX)) : null,
    category: row.directory_category,
    language: LANGUAGES.includes(row.directory_language) ? row.directory_language : "other",
    tags: tags.map((t) => maskProfanity(String(t))),
    memberCount: Number(memberCount) || 0,
    onlineCount: Number(onlineCount) || 0,
    listedAt: row.directory_listed_at || row.created_at || null,
  };
}

function foldForSearch(s) {
  return String(s || "")
    .replace(/İ/g, "i")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i");
}

/**
 * Filter, sort and page the visible cards. category / language must be known values
 * (anything else returns an empty page), q matches name, description and tags.
 */
function queryCards(cards, { category, language, q, sort, offset, limit } = {}) {
  const pageLimit = Math.min(PAGE_MAX, Math.max(1, Math.floor(Number(limit) || PAGE_DEFAULT)));
  const pageOffset = Math.min(5000, Math.max(0, Math.floor(Number(offset) || 0)));
  const order = SORTS.includes(String(sort)) ? String(sort) : "members";
  let list = Array.isArray(cards) ? cards : [];
  if (category) list = CATEGORIES.includes(String(category)) ? list.filter((c) => c.category === category) : [];
  if (language) list = LANGUAGES.includes(String(language)) ? list.filter((c) => c.language === language) : [];
  const needle = foldForSearch(String(q || "").trim().slice(0, 80));
  if (needle) {
    list = list.filter((c) => foldForSearch([c.name, c.description, ...(c.tags || [])].join(" ")).includes(needle));
  }
  const byMembers = (a, b) => b.memberCount - a.memberCount || String(a.name).localeCompare(String(b.name));
  const byNewest = (a, b) => String(b.listedAt || "").localeCompare(String(a.listedAt || "")) || byMembers(a, b);
  const byOnline = (a, b) => b.onlineCount - a.onlineCount || byMembers(a, b);
  list = [...list].sort(order === "newest" ? byNewest : order === "online" ? byOnline : byMembers);
  const total = list.length;
  const page = list.slice(pageOffset, pageOffset + pageLimit);
  return {
    servers: page,
    total,
    offset: pageOffset,
    limit: pageLimit,
    nextOffset: pageOffset + pageLimit < total ? pageOffset + pageLimit : null,
    sort: order,
  };
}

/** { [category]: { total, byLanguage: { tr: n, ... } } } for every category. */
function summarize(cards) {
  const out = {};
  for (const id of CATEGORIES) out[id] = { total: 0, byLanguage: {} };
  for (const c of cards || []) {
    const row = out[c.category];
    if (!row) continue;
    row.total += 1;
    row.byLanguage[c.language] = (row.byLanguage[c.language] || 0) + 1;
  }
  return out;
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

async function loadOwners(supabase, ownerIds) {
  const ids = [...new Set(ownerIds.filter(Boolean))];
  if (!ids.length) return new Map();
  for (const cols of ["id, is_banned, deleted_at", "id, is_banned", "id"]) {
    const { data, error } = await supabase.from("users").select(cols).in("id", ids);
    if (!error) return new Map((data || []).map((u) => [u.id, u]));
    if (!isMissingSchemaError(error)) throw error;
  }
  return new Map();
}

async function memberStats(supabase, serverId, presence, io) {
  const { count, error } = await supabase
    .from("server_members")
    .select("user_id", { count: "exact", head: true })
    .eq("server_id", serverId);
  if (error) throw error;
  let onlineCount = 0;
  if (presence) {
    const { data: rows } = await supabase.from("server_members").select("user_id").eq("server_id", serverId).limit(MEMBER_SCAN);
    if (Array.isArray(rows)) onlineCount = countVisibleOnline(rows.map((r) => r.user_id), presence, io);
  }
  return { memberCount: count || 0, onlineCount };
}

/**
 * Directory service: one cached snapshot of every visible card, rebuilt at most every
 * ttlMs (one rebuild in flight at a time; a failed rebuild keeps serving the old one).
 */
function createDirectoryService({ supabase, presence = null, getIo = () => null, ttlMs = SNAPSHOT_TTL_MS, now = () => Date.now() } = {}) {
  const flight = createSingleflight();
  let cached = null;

  async function build() {
    const { data, error } = await supabase
      .from("servers")
      .select(SERVER_COLS)
      .eq("listed_in_directory", true)
      .order("directory_listed_at", { ascending: false })
      .limit(SNAPSHOT_WINDOW);
    if (error) {
      if (isMissingSchemaError(error)) return { available: false, builtAt: now(), cards: [] };
      throw error;
    }
    const rows = (data || []).filter((r) => r && r.listed_in_directory && !r.directory_hidden_at && CATEGORIES.includes(String(r.directory_category || "")));
    const owners = await loadOwners(supabase, rows.map((r) => r.owner_id));
    const io = getIo ? getIo() : null;
    const cards = await mapLimit(rows, COUNT_CONCURRENCY, async (row) => {
      const owner = owners.get(row.owner_id) || null;
      if (hiddenReason(row, { memberCount: MIN_PUBLIC_MEMBERS, owner })) return null;
      const stats = await memberStats(supabase, row.id, presence, io);
      if (hiddenReason(row, { memberCount: stats.memberCount, owner })) return null;
      return publicCard(row, stats);
    });
    return { available: true, builtAt: now(), cards: cards.filter(Boolean) };
  }

  async function snapshot() {
    if (cached && now() - cached.builtAt < ttlMs) return cached;
    try {
      cached = await flight.run("snapshot", build);
    } catch (err) {
      if (!cached) throw err;
      console.warn("[directory] rebuild failed, serving the previous snapshot:", err?.message || err);
    }
    return cached;
  }

  function invalidate() {
    cached = null;
  }

  return { snapshot, invalidate };
}

module.exports = {
  CATEGORIES,
  LANGUAGES,
  SORTS,
  MIN_PUBLIC_MEMBERS,
  DESCRIPTION_MAX,
  TAGS_MAX,
  TAG_LEN_MAX,
  PAGE_DEFAULT,
  PAGE_MAX,
  SERVER_COLS,
  isMissingSchemaError,
  normalizeTag,
  parseTags,
  normalizeListingInput,
  hiddenReason,
  publicCard,
  queryCards,
  summarize,
  createDirectoryService,
};
