"use strict";

/**
 * Admin agent tools (phase 1: read only). Each tool is one Yönetici Paneli endpoint,
 * called over loopback with the asking admin's own session (see run.js), so the agent
 * can never see more than that admin: the admin router re-checks admin rights, 2FA,
 * the section permission and the rate limit on every call.
 *
 * DM / group reading goes through the panel's own review endpoints, which require a
 * purpose (report | security | legal), a reason of at least 10 characters and a fresh
 * 2FA step-up, and write a dm_view / group_view audit row.
 */

const ID_RE = /^[A-Za-z0-9_\-:.@%]{1,200}$/;

function cleanId(value, field) {
  const s = String(value ?? "").trim();
  if (!s || s === "." || s === ".." || !ID_RE.test(s)) {
    throw Object.assign(new Error(`Invalid ${field}.`), { code: "BAD_INPUT" });
  }
  return encodeURIComponent(s);
}

const str = (description) => ({ type: "string", description });
const int = (description) => ({ type: "integer", description });

/** Tool table. `query` lists the input fields passed through as query parameters. */
const TOOLS = [
  // General
  { name: "overview", section: "overview",
    about: "Live dashboard: online users, signups today, messages, calls, alerts. Start here for 'what is happening right now'.",
    path: () => "/overview" },
  { name: "platform_stats", section: "overview",
    about: "Totals: users, servers, groups, messages and other platform-wide counts.",
    path: () => "/stats" },
  { name: "system_health", section: "overview",
    about: "Server health: uptime, memory, database and realtime status.",
    path: () => "/health" },
  { name: "analytics", section: "analytics",
    about: "Usage analytics: daily / weekly active users, messages and calls over time.",
    path: () => "/analytics" },
  { name: "signup_attribution", section: "analytics",
    about: "Where new users come from (referrers, campaigns, search).",
    path: () => "/attribution" },
  { name: "signup_stats", section: "signupStats",
    about: "Signup statistics by day, platform and source.",
    path: () => "/signup-stats" },
  { name: "retention", section: "retention",
    about: "Cohort retention: how many signups come back after 1, 7 and 30 days.",
    path: () => "/growth/retention" },
  { name: "economy", section: "economy",
    about: "DesCoin economy: supply, minted, spent, top earners and sinks.",
    path: () => "/growth/economy" },
  { name: "descoin_reconciliation", section: "casino",
    about: "DesCoin ledger reconciliation: balances that do not match their transaction history.",
    path: () => "/descoin/reconciliation" },
  { name: "descoin_history", section: "casino",
    about: "Recent DesCoin credit transactions.",
    query: ["limit"], params: { limit: int("Max rows, default 100.") },
    path: () => "/credits/history" },
  { name: "top_users", section: "topUsers",
    about: "Most active users. sort: messages | voice | score; window: day | week | month | all.",
    query: ["limit", "sort", "window"],
    params: { limit: int("Max rows."), sort: str("messages | voice | score"), window: str("day | week | month | all") },
    path: () => "/activity/leaderboard" },
  { name: "member_pulse", section: "directory",
    about: "Recently active, new and returning members.",
    query: ["limit"], params: { limit: int("Max rows.") },
    path: () => "/member-pulse" },

  // People
  { name: "search_users", section: "people",
    about: "Find users by username, display name, email or id. Returns ids to use with the other user tools.",
    query: ["q"], params: { q: str("Search text.") }, required: ["q"],
    path: () => "/people/search" },
  { name: "user_dossier", section: "people",
    about: "Everything about one user: account, devices, IPs, moderation history, reports, DesCoin, premium.",
    params: { userId: str("User id from search_users.") }, required: ["userId"],
    path: (i) => `/people/${cleanId(i.userId, "userId")}/dossier` },
  { name: "user_activity", section: "directory",
    about: "One user's recent activity (apps and games, sessions).",
    params: { userId: str("User id.") }, required: ["userId"],
    path: (i) => `/users/${cleanId(i.userId, "userId")}/activity` },
  { name: "user_analytics", section: "analytics",
    about: "One user's usage over time (messages, voice minutes, logins).",
    params: { userId: str("User id.") }, required: ["userId"],
    path: (i) => `/users/${cleanId(i.userId, "userId")}/analytics` },

  // Reports and moderation
  { name: "reports_summary", section: "reports",
    about: "Counts of open, in-progress and closed reports by category.",
    path: () => "/reports/summary" },
  { name: "reports", section: "reports",
    about: "User reports. status: open | in_progress | resolved | dismissed. targetId filters to one reported user.",
    query: ["status", "targetId", "limit"],
    params: { status: str("Report status."), targetId: str("Reported user id."), limit: int("Max rows.") },
    path: () => "/reports" },
  { name: "moderation_active", section: "moderation",
    about: "Bans and timeouts in effect now.",
    path: () => "/moderation/active" },
  { name: "moderation_history", section: "moderation",
    about: "Past moderation actions, optionally for one user.",
    query: ["userId", "limit"], params: { userId: str("User id."), limit: int("Max rows.") },
    path: () => "/moderation/history" },
  { name: "access_bans", section: "accessBans",
    about: "IP and device bans.",
    path: () => "/access-bans" },
  { name: "access_ban_hits", section: "accessBans",
    about: "Recent attempts to sign in or sign up from a banned IP or device (ban evasion).",
    path: () => "/access-bans/hits" },

  // Suspicious accounts (anti-bot)
  { name: "suspicious_overview", section: "suspicious",
    about: "Anti-bot overview: flagged account counts, risk levels, recent detections.",
    path: () => "/antibot/overview" },
  { name: "suspicious_accounts", section: "suspicious",
    about: "Accounts with risk signals. status filters the review state.",
    query: ["q", "status"], params: { q: str("Search text."), status: str("Review status.") },
    path: () => "/antibot/accounts" },
  { name: "suspicious_clusters", section: "suspicious",
    about: "Groups of accounts that share IPs, devices or behaviour (multi-accounting, bot farms).",
    path: () => "/antibot/clusters" },
  { name: "suspicious_feed", section: "suspicious",
    about: "Latest anti-bot events, newest first.",
    path: () => "/antibot/feed" },
  { name: "suspicious_user", section: "suspicious",
    about: "Anti-bot detail for one user: signals, scores, linked accounts.",
    params: { userId: str("User id.") }, required: ["userId"],
    path: (i) => `/antibot/users/${cleanId(i.userId, "userId")}` },

  // Errors and feedback
  { name: "error_groups", section: "errors",
    about: "Grouped app errors. range: 24h | 7d | 30d; status: open | resolved; sort: count | recent.",
    query: ["range", "status", "sort", "q", "platform"],
    params: { range: str("24h | 7d | 30d"), status: str("open | resolved"), sort: str("count | recent"), q: str("Search text."), platform: str("web | desktop | ios") },
    path: () => "/error-groups" },
  { name: "error_group", section: "errors",
    about: "One error group with samples and affected users.",
    params: { fingerprint: str("Group fingerprint from error_groups.") }, required: ["fingerprint"],
    path: (i) => `/error-groups/${cleanId(i.fingerprint, "fingerprint")}` },
  { name: "feedback", section: "feedback",
    about: "User feedback (suggestions, bugs, praise).",
    query: ["q", "status", "category", "limit"],
    params: { q: str("Search text."), status: str("Status."), category: str("Category."), limit: int("Max rows.") },
    path: () => "/feedback" },
  { name: "admin_audit", section: "audit",
    about: "The admin audit log: which admin did what and when.",
    query: ["limit"], params: { limit: int("Max rows.") },
    path: () => "/audit" },

  // Premium, promo, badges
  { name: "premium_dashboard", section: "premium",
    about: "Descall+ / Ultra memberships: active, new, churned.",
    path: () => "/premium/dashboard" },
  { name: "premium_finance", section: "premium",
    about: "Descall+ / Ultra revenue figures.",
    path: () => "/premium/finance" },
  { name: "promo_codes", section: "promo",
    about: "Promo codes and how often they were redeemed.",
    path: () => "/promo-codes" },
  { name: "special_badges", section: "specialBadges",
    about: "Special badges and their holders.",
    path: () => "/special-badges" },

  // Private messages: list (metadata) and read (purpose + reason + 2FA, audited)
  { name: "dm_conversations", section: "dmReview",
    about: "Private conversations (participants, message counts, last activity). No message text. Optional userId narrows to one user's conversations.",
    query: ["userId"], params: { userId: str("User id.") },
    path: () => "/dm/conversations" },
  { name: "group_conversations", section: "dmReview",
    about: "Group chats (name, members, message counts). No message text.",
    path: () => "/dm/groups" },
  { name: "read_dm", section: "dmReview", method: "POST",
    about: "Read the messages of one private conversation. Only with a real purpose (report | security | legal) and the admin's reason of at least 10 characters; never invent a reason. Logged in the audit log. Needs the admin's 2FA code (step-up).",
    params: {
      conversationKey: str("Conversation key from dm_conversations."),
      purpose: str("report | security | legal"),
      reason: str("Why this conversation is read, in the admin's words, at least 10 characters."),
    },
    required: ["conversationKey", "purpose", "reason"],
    path: (i) => `/dm/${cleanId(i.conversationKey, "conversationKey")}/view`,
    body: (i) => ({ purpose: i.purpose, reason: `[Ajan] ${String(i.reason || "").trim()}` }) },
  { name: "read_group", section: "dmReview", method: "POST",
    about: "Read the messages of one group chat. Same rules as read_dm: purpose, the admin's reason, 2FA, audit log.",
    params: {
      groupId: str("Group id from group_conversations."),
      purpose: str("report | security | legal"),
      reason: str("Why this group is read, in the admin's words, at least 10 characters."),
    },
    required: ["groupId", "purpose", "reason"],
    path: (i) => `/dm/groups/${cleanId(i.groupId, "groupId")}/view`,
    body: (i) => ({ purpose: i.purpose, reason: `[Ajan] ${String(i.reason || "").trim()}` }) },
];

const BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

/** API tool definitions (stable order, so the prompt cache prefix stays the same). */
function toolDefinitions() {
  return TOOLS.map((t) => ({
    name: t.name,
    about: t.description,
    input_schema: {
      type: "object",
      properties: t.params || {},
      required: t.required || [],
      additionalProperties: false,
    },
  }));
}

/** Validate a model-produced input against the tool's schema (strings / integers only). */
function validateInput(tool, input) {
  const params = tool.params || {};
  const out = {};
  const given = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  for (const key of Object.keys(given)) {
    if (!params[key]) throw Object.assign(new Error(`Unknown field "${key}".`), { code: "BAD_INPUT" });
  }
  for (const [key, spec] of Object.entries(params)) {
    const v = given[key];
    if (v === undefined || v === null || v === "") {
      if ((tool.required || []).includes(key)) throw Object.assign(new Error(`Missing "${key}".`), { code: "BAD_INPUT" });
      continue;
    }
    if (spec.type === "integer") {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 0 || n > 5000) throw Object.assign(new Error(`"${key}" must be a whole number.`), { code: "BAD_INPUT" });
      out[key] = n;
    } else {
      out[key] = String(v).slice(0, 300);
    }
  }
  return out;
}

/** { method, path (with query string), body } for one call. */
function buildRequest(tool, input) {
  const method = tool.method || "GET";
  let path = tool.path(input);
  const qs = new URLSearchParams();
  for (const key of tool.query || []) if (input[key] !== undefined) qs.set(key, String(input[key]));
  const s = qs.toString();
  if (s) path += `?${s}`;
  return { method, path, body: tool.body ? tool.body(input) : undefined };
}

module.exports = { TOOLS, BY_NAME, toolDefinitions, validateInput, buildRequest, cleanId };
