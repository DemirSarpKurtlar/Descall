"use strict";

/**
 * User-to-user Trust & Safety reports.
 * Pure helpers are exported for selftests; DB writes go through create/list/resolve.
 */

const supabase = require("../db/supabase");

const AUTO_DOSSIER_THRESHOLD = 3;
const MAX_NOTE = 500;
const MAX_SNIPPET = 400;
const RATE_PER_HOUR = 8;
const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;

const USER_REASONS = [
  { id: "harassment", label: "Harassment / Bullying" },
  { id: "hate_speech", label: "Hate speech" },
  { id: "threats", label: "Threats / Violence" },
  { id: "spam", label: "Spam" },
  { id: "scam", label: "Scam / Phishing" },
  { id: "impersonation", label: "Impersonation" },
  { id: "nsfw", label: "NSFW / Sexual content" },
  { id: "doxxing", label: "Doxxing / Privacy" },
  { id: "other", label: "Other" },
];

const REASON_IDS = new Set(USER_REASONS.map((r) => r.id));
const CONTEXT_TYPES = new Set(["profile", "dm", "group", "server", "lfg", "other"]);
const STATUSES = new Set(["open", "dismissed", "actioned"]);

function stripTags(value) {
  return String(value == null ? "" : value).replace(/<[^>]*>/g, "");
}

function clampText(value, max) {
  const text = stripTags(value).replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.slice(0, max);
}

function sanitizeSnippet(value) {
  return clampText(value, MAX_SNIPPET);
}

function sanitizeNote(value) {
  return clampText(value, MAX_NOTE);
}

function normalizeReason(value) {
  const id = String(value || "other").trim();
  return REASON_IDS.has(id) ? id : "other";
}

function normalizeContextType(value) {
  const id = String(value || "profile").trim().toLowerCase();
  return CONTEXT_TYPES.has(id) ? id : "other";
}

function reasonLabel(id) {
  return USER_REASONS.find((r) => r.id === id)?.label || id || "Other";
}

function shouldAutoOpenDossier(openCount) {
  return Number(openCount) >= AUTO_DOSSIER_THRESHOLD;
}

/**
 * Explainable 0–100 risk score for a dossier header.
 * Weights are intentional and documented — not a black box.
 */
function scoreRisk({
  openReports = 0,
  totalReports = 0,
  banned = false,
  timedOut = false,
  suspiciousSignup = false,
  historyCount = 0,
} = {}) {
  let score = 0;
  const flags = [];

  const open = Math.max(0, Number(openReports) || 0);
  const total = Math.max(open, Number(totalReports) || 0);
  const history = Math.max(0, Number(historyCount) || 0);

  if (open >= AUTO_DOSSIER_THRESHOLD) {
    score += 45;
    flags.push("repeat_reports");
  } else if (open > 0) {
    score += 15 * open;
    flags.push("open_reports");
  }

  if (total >= 6) {
    score += 10;
    flags.push("report_history");
  }

  if (banned) {
    score += 30;
    flags.push("banned");
  } else if (timedOut) {
    score += 15;
    flags.push("timeout");
  }

  if (suspiciousSignup) {
    score += 10;
    flags.push("suspicious_signup");
  }

  if (history >= 3) {
    score += 10;
    flags.push("prior_sanctions");
  } else if (history >= 1) {
    score += 4;
  }

  const clamped = Math.max(0, Math.min(100, score));
  return { score: clamped, level: riskLevel(clamped), flags };
}

function riskLevel(score) {
  const n = Number(score) || 0;
  if (n >= 70) return "critical";
  if (n >= 40) return "high";
  if (n >= 15) return "watch";
  return "low";
}

function groupReportsByTarget(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const key = String(row.targetId || row.target_id || "");
    if (!key) continue;
    if (!map.has(key)) {
      map.set(key, {
        targetId: key,
        targetUsername: row.targetUsername || null,
        targetDisplayName: row.targetDisplayName || null,
        targetAvatarUrl: row.targetAvatarUrl || null,
        openCount: 0,
        totalCount: 0,
        latestAt: null,
        reports: [],
      });
    }
    const bucket = map.get(key);
    bucket.reports.push(row);
    bucket.totalCount += 1;
    if (row.status === "open") bucket.openCount += 1;
    const ts = row.createdAt || row.created_at;
    if (ts && (!bucket.latestAt || String(ts) > String(bucket.latestAt))) {
      bucket.latestAt = ts;
    }
  }
  return [...map.values()].sort((a, b) => {
    if (a.openCount !== b.openCount) return b.openCount - a.openCount;
    return String(b.latestAt || "").localeCompare(String(a.latestAt || ""));
  });
}

function pickAutoOpenTarget(groups) {
  const hit = (groups || []).find((g) => shouldAutoOpenDossier(g.openCount));
  return hit ? hit.targetId : null;
}

function isDuplicateOpen(existing, { reporterId, targetId, contextType, contextId, nowMs }) {
  const windowStart = nowMs - DUPLICATE_WINDOW_MS;
  return (existing || []).some((row) => {
    if (row.status && row.status !== "open") return false;
    if (String(row.reporter_id || row.reporterId) !== String(reporterId)) return false;
    if (String(row.target_id || row.targetId) !== String(targetId)) return false;
    if (String(row.context_type || row.contextType || "profile") !== String(contextType || "profile")) {
      return false;
    }
    const cid = String(row.context_id || row.contextId || "");
    const want = String(contextId || "");
    if (cid !== want) return false;
    const created = Date.parse(row.created_at || row.createdAt || 0);
    return Number.isFinite(created) && created >= windowStart;
  });
}

function publicReport(row, usersById = {}) {
  if (!row) return null;
  const reporter = usersById[row.reporter_id] || {};
  const target = usersById[row.target_id] || {};
  return {
    id: row.id,
    reporterId: row.reporter_id,
    reporterUsername: reporter.username || null,
    reporterDisplayName: reporter.display_name || null,
    reporterAvatarUrl: reporter.avatar_url || null,
    targetId: row.target_id,
    targetUsername: target.username || null,
    targetDisplayName: target.display_name || null,
    targetAvatarUrl: target.avatar_url || null,
    reason: row.reason || "other",
    reasonLabel: reasonLabel(row.reason),
    note: row.note || null,
    contextType: row.context_type || "profile",
    contextId: row.context_id || null,
    snippet: row.snippet || null,
    occurredAt: row.occurred_at || null,
    status: row.status || "open",
    resolution: row.resolution || null,
    resolvedBy: row.resolved_by || null,
    resolvedAt: row.resolved_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function loadUsersById(ids) {
  const unique = [...new Set((ids || []).filter(Boolean).map(String))];
  if (!unique.length) return {};
  const { data, error } = await supabase
    .from("users")
    .select("id, username, display_name, avatar_url")
    .in("id", unique);
  if (error) throw new Error(error.message);
  const map = {};
  for (const u of data || []) map[u.id] = u;
  return map;
}

async function createReport({
  reporterId,
  targetId,
  reason,
  note,
  contextType,
  contextId,
  snippet,
  occurredAt,
}) {
  if (!reporterId || !targetId) {
    const err = new Error("Missing reporter or target.");
    err.code = "BAD_REQUEST";
    throw err;
  }
  if (String(reporterId) === String(targetId)) {
    const err = new Error("You cannot report yourself.");
    err.code = "SELF_REPORT";
    throw err;
  }

  const { data: target, error: targetErr } = await supabase
    .from("users")
    .select("id")
    .eq("id", targetId)
    .maybeSingle();
  if (targetErr) throw new Error(targetErr.message);
  if (!target) {
    const err = new Error("User not found.");
    err.code = "NOT_FOUND";
    throw err;
  }

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: recent, error: recentErr } = await supabase
    .from("user_reports")
    .select("id")
    .eq("reporter_id", reporterId)
    .gte("created_at", since);
  if (recentErr) throw new Error(recentErr.message);
  if ((recent || []).length >= RATE_PER_HOUR) {
    const err = new Error("Too many reports. Try again later.");
    err.code = "RATE_LIMIT";
    throw err;
  }

  const ctx = normalizeContextType(contextType);
  const cid = contextId ? String(contextId).slice(0, 80) : null;
  const { data: openDupes, error: dupeErr } = await supabase
    .from("user_reports")
    .select("id, reporter_id, target_id, context_type, context_id, status, created_at")
    .eq("reporter_id", reporterId)
    .eq("target_id", targetId)
    .eq("status", "open")
    .eq("context_type", ctx);
  if (dupeErr) throw new Error(dupeErr.message);
  if (
    isDuplicateOpen(openDupes, {
      reporterId,
      targetId,
      contextType: ctx,
      contextId: cid,
      nowMs: Date.now(),
    })
  ) {
    const err = new Error("You already reported this.");
    err.code = "DUPLICATE";
    throw err;
  }

  const occurred = occurredAt ? new Date(occurredAt) : null;
  const occurredIso =
    occurred && Number.isFinite(occurred.getTime()) ? occurred.toISOString() : null;

  const insert = {
    reporter_id: reporterId,
    target_id: targetId,
    reason: normalizeReason(reason),
    note: sanitizeNote(note) || null,
    context_type: ctx,
    context_id: cid,
    snippet: sanitizeSnippet(snippet) || null,
    occurred_at: occurredIso,
    status: "open",
  };

  const { data, error } = await supabase.from("user_reports").insert(insert).select("*").single();
  if (error) throw new Error(error.message);

  const { count, error: countErr } = await supabase
    .from("user_reports")
    .select("id", { count: "exact", head: true })
    .eq("target_id", targetId)
    .eq("status", "open");
  if (countErr) throw new Error(countErr.message);

  const openCount = count || 0;
  const usersById = await loadUsersById([reporterId, targetId]);
  return {
    report: publicReport(data, usersById),
    openCount,
    autoOpen: shouldAutoOpenDossier(openCount),
  };
}

async function listReports({ status = "open", targetId = null, limit = 80 } = {}) {
  const capped = Math.min(200, Math.max(1, Number(limit) || 80));
  let q = supabase.from("user_reports").select("*").order("created_at", { ascending: false }).limit(capped);
  if (status && status !== "all" && STATUSES.has(status)) q = q.eq("status", status);
  if (targetId) q = q.eq("target_id", targetId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const rows = data || [];
  const usersById = await loadUsersById(
    rows.flatMap((r) => [r.reporter_id, r.target_id, r.resolved_by])
  );
  return rows.map((row) => publicReport(row, usersById));
}

async function reportsForUser(userId, { limit = 40 } = {}) {
  const capped = Math.min(100, Math.max(1, Number(limit) || 40));
  const [againstRes, byRes] = await Promise.all([
    supabase
      .from("user_reports")
      .select("*")
      .eq("target_id", userId)
      .order("created_at", { ascending: false })
      .limit(capped),
    supabase
      .from("user_reports")
      .select("*")
      .eq("reporter_id", userId)
      .order("created_at", { ascending: false })
      .limit(capped),
  ]);
  if (againstRes.error) throw new Error(againstRes.error.message);
  if (byRes.error) throw new Error(byRes.error.message);
  const rows = [...(againstRes.data || []), ...(byRes.data || [])];
  const usersById = await loadUsersById(
    rows.flatMap((r) => [r.reporter_id, r.target_id, r.resolved_by])
  );
  const against = (againstRes.data || []).map((row) => publicReport(row, usersById));
  const filed = (byRes.data || []).map((row) => publicReport(row, usersById));
  return {
    against,
    filed,
    openCount: against.filter((r) => r.status === "open").length,
    totalAgainst: against.length,
  };
}

async function summarizeInbox() {
  const { data, error } = await supabase
    .from("user_reports")
    .select("id, target_id, status, created_at")
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(400);
  if (error) throw new Error(error.message);
  const rows = data || [];
  const byTarget = new Map();
  for (const row of rows) {
    const key = String(row.target_id);
    byTarget.set(key, (byTarget.get(key) || 0) + 1);
  }
  const hot = [...byTarget.entries()]
    .filter(([, n]) => shouldAutoOpenDossier(n))
    .sort((a, b) => b[1] - a[1]);
  return {
    openCount: rows.length,
    uniqueTargets: byTarget.size,
    autoOpenUserId: hot[0]?.[0] || null,
    hotTargets: hot.map(([id, openCount]) => ({ userId: id, openCount })),
  };
}

async function resolveReport(reportId, { actorId, status, resolution, markAllOpenForTarget = false }) {
  if (!STATUSES.has(status) || status === "open") {
    const err = new Error("Invalid resolution.");
    err.code = "BAD_REQUEST";
    throw err;
  }
  const { data: row, error } = await supabase
    .from("user_reports")
    .select("*")
    .eq("id", reportId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) {
    const err = new Error("Report not found.");
    err.code = "NOT_FOUND";
    throw err;
  }

  const now = new Date().toISOString();
  const patch = {
    status,
    resolution: String(resolution || status).slice(0, 40),
    resolved_by: actorId || null,
    resolved_at: now,
    updated_at: now,
  };

  let query = supabase.from("user_reports").update(patch);
  if (markAllOpenForTarget) {
    query = query.eq("target_id", row.target_id).eq("status", "open");
  } else {
    query = query.eq("id", reportId);
  }
  const { error: updErr } = await query;
  if (updErr) throw new Error(updErr.message);

  return { reportId, targetId: row.target_id, reason: row.reason, status, resolution: patch.resolution };
}

module.exports = {
  AUTO_DOSSIER_THRESHOLD,
  USER_REASONS,
  sanitizeSnippet,
  sanitizeNote,
  normalizeReason,
  normalizeContextType,
  reasonLabel,
  shouldAutoOpenDossier,
  scoreRisk,
  riskLevel,
  groupReportsByTarget,
  pickAutoOpenTarget,
  isDuplicateOpen,
  publicReport,
  createReport,
  listReports,
  reportsForUser,
  summarizeInbox,
  resolveReport,
};
