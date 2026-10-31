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
  "suspicious",
  "accessBans",
  "shop",
  "promo",
  "specialBadges",
  "announcements",
  "livepopup",
  "casino",
  "system",
  "security",
  "errors",
  "audit",
]);

const ALWAYS = Object.freeze(["overview"]);
// Reading private messages (3.7.1): never part of the legacy NULL = "every
// section" default; the owner grants it to an admin explicitly.
const SENSITIVE_SECTIONS = Object.freeze(["dmReview"]);
const LEGACY_SECTIONS = Object.freeze(GRANTABLE_SECTIONS.filter((s) => !SENSITIVE_SECTIONS.includes(s)));
const OWNER_ONLY = Object.freeze(["staff"]);

/**
 * Path (relative to /admin or /api/admin) → section. First match wins, so
 * the more specific rules come first. Anything not listed needs "system".
 */
const RULES = [
  [/^\/step-up$/, null],
  [/^\/(overview|stats|health|me\/permissions)(\/|$)/, "overview"],
  [/^\/staff(\/|$)/, "staff"],
  [/^\/(make-admin|remove-admin)(\/|$)/, "staff"],
  [/^\/signup-stats(\/|$)/, "signupStats"],
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
  [/^\/(audit)(\/|$)/, "audit"],
  [/^\/(errors|security-logs)(\/|$)/, "security"],
  [/^\/(credits|descoin)(\/|$)/, "casino"],
  [/^\/shop\/gift$/, "casino"],
  [/^\/shop(\/|$)/, "shop"],
  [/^\/users\/[^/]+\/(ban|unban|timeout|untimeout|kick|status)$/, "moderation"],
  [/^\/users\/bulk$/, "moderation"],
  [/^\/moderation(\/|$)/, "moderation"],
  [/^\/dm(\/|$)/, "dmReview"],
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
  if (isOwner(user, row)) return [...ALWAYS, ...GRANTABLE_SECTIONS, ...OWNER_ONLY];
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

function invalidate(userId) {
  if (userId) cache.delete(userId);
  else cache.clear();
}

/** Express middleware for the admin router (after requireAdmin). */
async function requireAdminSection(req, res, next) {
  const section = sectionForPath(req.path);
  if (section == null) return next();
  try {
    const row = await loadRow(req.user.id);
    req.adminSections = sectionsFor(req.user, row);
    if (req.adminSections.includes(section)) return next();
    return res.status(403).json({
      error: "Bu bölüm için yetkin yok. Sahip hesabından yetki iste.",
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
      return res.status(403).json({ error: "Bu bölüm için yetkin yok.", code: "ADMIN_PERMISSION_DENIED", section });
    } catch {
      return res.status(500).json({ error: "Internal server error" });
    }
  };
}

module.exports.requireSection = requireSection;
