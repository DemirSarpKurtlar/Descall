"use strict";

/**
 * Yetkili yöneticiler (3.3.0, owner rule): there is no moderator role. The
 * Yönetici Paneli is for admins only (users.is_admin, plus the account named
 * "admin"). The owner account ("admin" / is_super_admin) sees everything and is
 * the only one who can grant sections to the other admins. Each section is a
 * menu entry of the panel; the server checks it on every /admin request.
 *
 * users.admin_permissions (text[]): the sections that admin may open.
 * NULL = every grantable section (admins from before 3.3.0 keep their access
 * until the owner narrows it). "overview" is always allowed; "staff" (this
 * screen) is owner-only and can never be granted.
 */

const GRANTABLE_SECTIONS = Object.freeze([
  "maintenance",
  "directory",
  "analytics",
  "signupStats",
  "retention",
  "economy",
  "topUsers",
  "people",
  "reports",
  "feedback",
  "moderation",
  "dmReview",
  // Sunucu inceleme: server metadata + channel content behind the same gate as DMs.
  "serverReview",
  "suspicious",
  "accessBans",
  // Premium Yönetimi (Descall+ / Ultra): every /admin/premium/* page and route.
  "premium",
  "shop",
  "promo",
  "specialBadges",
  "announcements",
  "livepopup",
  "casino",
  "system",
  "security",
  "errors",
  // Performans: real-user metrics, release regressions, Lighthouse CI.
  "perf",
  "audit",
  // Admin agent (phase 1): the Claude assistant. It only sees what the asking admin's
  // own sections allow (its tools call the same routes with the admin's session).
  "agent",
]);

const ALWAYS = Object.freeze(["overview"]);
// Reading private messages (3.7.1): never part of the legacy NULL = "every
// section" default; the owner grants it to an admin explicitly.
// Descall+ / Ultra (memberships mint DesCoin gifts): also granted explicitly, never by the legacy default.
// Sunucu inceleme reads server channel content: same rule as DM inceleme.
const SENSITIVE_SECTIONS = Object.freeze(["dmReview", "serverReview", "premium"]);
const LEGACY_SECTIONS = Object.freeze(GRANTABLE_SECTIONS.filter((s) => !SENSITIVE_SECTIONS.includes(s)));
const OWNER_ONLY = Object.freeze(["staff"]);
// Apple Watch games (owner request, Nov 2026): the owner account only, never granted. The
// watch draws its "Mola" group only when home.adminSections carries it; the score API
// (/watch-games) refuses everyone else.
const OWNER_WATCH = Object.freeze(["games"]);

/**
 * Path (relative to /admin or /api/admin) → section. First match wins, so
 * the more specific rules come first. Anything not listed needs "system".
 */
const RULES = [
  [/^\/step-up$/, null],
  // Admin Token tab and the OpenAPI document: owner only, checked by routes/adminTokens.js.
  [/^\/(tokens|openapi\.json)(\/|$)/, null],
  // Sunucu Ağı (hybrid server): owner only, checked by routes/adminNodes.js.
  [/^\/nodes(\/|$)/, null],
  [/^\/(overview|stats|health|me\/permissions)(\/|$)/, "overview"],
  // Apple Watch games: owner only (section "games", never grantable).
  [/^\/watch-games(\/|$)/, "games"],
  [/^\/staff(\/|$)/, "staff"],
  [/^\/agent(\/|$)/, "agent"],
  [/^\/(make-admin|remove-admin)(\/|$)/, "staff"],
  [/^\/signup-stats(\/|$)/, "signupStats"],
  // Growth 3B "Yeniden kazanma" console: the Elde tutma permission.
  [/^\/growth\/reengage(\/|$)/, "retention"],
  [/^\/premium(\/|$)/, "premium"],
  [/^\/maintenance\/windows(\/|$)/, "maintenance"],
  [/^\/people\//, "people"],
  [/^\/reports(\/|$)/, "reports"],
  [/^\/promo-codes(\/|$)/, "promo"],
  [/^\/special-badges(\/|$)/, "specialBadges"],
  [/^\/announcements(\/|$)/, "announcements"],
  [/^\/(popup|broadcast)(\/|$)/, "livepopup"],
  [/^\/antibot(\/|$)/, "suspicious"],
  [/^\/access-bans(\/|$)/, "accessBans"],
  [/^\/error-groups(\/|$)/, "errors"],
  [/^\/growth\/retention$/, "retention"],
  [/^\/growth\/economy$/, "economy"],
  [/^\/feedback(\/|$)/, "feedback"],
  [/^\/perf(\/|$)/, "perf"],
  [/^\/(audit)(\/|$)/, "audit"],
  [/^\/(errors|security-logs)(\/|$)/, "security"],
  [/^\/security(\/|$)/, "security"],
  [/^\/(credits|descoin)(\/|$)/, "casino"],
  [/^\/shop\/gifts?(\/|$)/, "casino"],
  [/^\/shop(\/|$)/, "shop"],
  [/^\/users\/[^/]+\/(ban|unban|timeout|untimeout|kick|status)$/, "moderation"],
  [/^\/users\/bulk$/, "moderation"],
  [/^\/moderation(\/|$)/, "moderation"],
  [/^\/appeals(\/|$)/, "moderation"],
  [/^\/dm(\/|$)/, "dmReview"],
  [/^\/server-review(\/|$)/, "serverReview"],
  [/^\/(messages|export\/messages)(\/|$)/, "moderation"],
  [/^\/activity\/leaderboard$/, "topUsers"],
  [/^\/users\/[^/]+\/analytics$/, "analytics"],
  [/^\/(analytics|attribution)(\/|$)/, "analytics"],
  [/^\/(directory|users|member-pulse|activity|friends)(\/|$)/, "directory"],
];

function sectionForPath(path) {
  const p = String(path || "/").split("?")[0].replace(/\/+$/, "") || "/";
  for (const [re, section] of RULES) if (re.test(p)) return section;
  return "system";
}

function isOwner(user, row) {
  return user?.username === "admin" || Boolean(row?.is_super_admin);
}

/** Clean a requested list: known grantable sections only, deduped, menu order. */
function normalizeSections(list) {
  if (!Array.isArray(list)) return [];
  const want = new Set(list.map((x) => String(x)));
  return GRANTABLE_SECTIONS.filter((s) => want.has(s));
}

/**
 * Sections this account may open, or [] for a non-admin.
 * @param {{username?: string}} user
 * @param {{is_admin?: boolean, is_super_admin?: boolean, admin_permissions?: string[]|null}} row
 */
function sectionsFor(user, row) {
  if (isOwner(user, row)) return [...ALWAYS, ...GRANTABLE_SECTIONS, ...OWNER_ONLY, ...OWNER_WATCH];
  if (!row?.is_admin) return [];
  const granted = row.admin_permissions == null ? LEGACY_SECTIONS : normalizeSections(row.admin_permissions);
  return [...ALWAYS, ...granted];
}

function canOpen(user, row, section) {
  if (section == null) return true;
  return sectionsFor(user, row).includes(section);
}

/* ---------- DB-backed lookup with a short cache ---------- */

const CACHE_MS = 15 * 1000;
const cache = new Map();
let dbOverride = null;
const db = () => dbOverride || require("../db/supabase");

async function loadRow(userId) {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.row;
  let res = await db().from("users").select("id, username, is_admin, is_super_admin, admin_permissions").eq("id", userId).maybeSingle();
  if (res?.error) {
    // Columns from later migrations missing: fall back to is_admin only (NULL = all sections).
    res = await db().from("users").select("id, username, is_admin").eq("id", userId).maybeSingle();
  }
  const row = res?.data || null;
  cache.set(userId, { at: Date.now(), row });
  return row;
}

function invalidateLocal(userId) {
  if (userId) cache.delete(userId);
  else cache.clear();
}
// Hybrid server: clearing this cache also clears it on the other nodes (no-op on a single node).
const invalidate = require("./cluster").linkInvalidate("adminPerms", invalidateLocal);

/** Express middleware for the admin router (after requireAdmin). */
async function requireAdminSection(req, res, next) {
  const section = sectionForPath(req.path);
  if (section == null) return next();
  try {
    const row = await loadRow(req.user.id);
    req.adminSections = sectionsFor(req.user, row);
    if (req.adminSections.includes(section)) return next();
    // İşlem kaydı "Reddedilen erişim": one access_denied entry per admin + section per 10 minutes.
    try {
      require("./auditRuntime").noteDenied(req.user, section, req);
    } catch {
      /* the refusal stands either way */
    }
    return res.status(403).json({
      error: "You don't have access to this section. Ask the owner account for access.",
      code: "ADMIN_PERMISSION_DENIED",
      section,
    });
  } catch (err) {
    console.error("[adminPermissions]", err?.message || err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

function __setDbForTests(client) {
  dbOverride = client;
  cache.clear();
}

module.exports = {
  GRANTABLE_SECTIONS,
  SENSITIVE_SECTIONS,
  LEGACY_SECTIONS,
  ALWAYS,
  OWNER_ONLY,
  OWNER_WATCH,
  sectionForPath,
  sectionsFor,
  canOpen,
  isOwner,
  normalizeSections,
  loadRow,
  invalidate,
  requireAdminSection,
  __setDbForTests,
};

/** Middleware for routers mounted outside the admin router (errors, feedback). */
function requireSection(section) {
  return async (req, res, next) => {
    try {
      const row = await loadRow(req.user.id);
      if (canOpen(req.user, row, section)) return next();
      return res.status(403).json({ error: "You don't have access to this section.", code: "ADMIN_PERMISSION_DENIED", section });
    } catch {
      return res.status(500).json({ error: "Internal server error" });
    }
  };
}

module.exports.requireSection = requireSection;
