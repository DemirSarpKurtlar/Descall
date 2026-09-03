"use strict";

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-key";

const {
  sanitizeSnippet,
  sanitizeNote,
  normalizeReason,
  normalizeContextType,
  shouldAutoOpenDossier,
  scoreRisk,
  riskLevel,
  groupReportsByTarget,
  pickAutoOpenTarget,
  isDuplicateOpen,
  AUTO_DOSSIER_THRESHOLD,
} = require("./userReports");

function assert(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
}

assert(sanitizeSnippet("<b>hello</b>  world") === "hello world", "strips tags and collapses space");
assert(sanitizeSnippet("x".repeat(500)).length === 400, "clips snippet at 400");
assert(sanitizeNote("  note  ") === "note", "trims notes");
assert(normalizeReason("harassment") === "harassment", "keeps known reason");
assert(normalizeReason("not-a-reason") === "other", "unknown reason falls back");
assert(normalizeContextType("DM") === "dm", "normalizes context type");
assert(normalizeContextType("voice") === "other", "unknown context is other");

assert(shouldAutoOpenDossier(2) === false, "2 reports stay in inbox");
assert(shouldAutoOpenDossier(3) === true, "3rd report auto-opens dossier");
assert(AUTO_DOSSIER_THRESHOLD === 3, "threshold is 3");

const quiet = scoreRisk({});
assert(quiet.score === 0 && quiet.level === "low", "empty dossier is low risk");

const watched = scoreRisk({ openReports: 1 });
assert(watched.level === "watch" && watched.flags.includes("open_reports"), "one open report is watch");

const hot = scoreRisk({ openReports: 3 });
assert(hot.level === "high" && hot.flags.includes("repeat_reports") && hot.score >= 45, "3 open reports are high");

const critical = scoreRisk({ openReports: 3, banned: true, suspiciousSignup: true, historyCount: 4 });
assert(critical.level === "critical" && critical.score >= 70, "stacked signals are critical");
assert(riskLevel(39) === "watch" && riskLevel(40) === "high", "level boundaries");
assert(riskLevel(69) === "high" && riskLevel(70) === "critical", "critical boundary");

const grouped = groupReportsByTarget([
  { targetId: "a", status: "open", createdAt: "2026-08-26T10:00:00Z", targetUsername: "alice" },
  { targetId: "a", status: "open", createdAt: "2026-08-26T11:00:00Z", targetUsername: "alice" },
  { targetId: "a", status: "open", createdAt: "2026-08-26T12:00:00Z", targetUsername: "alice" },
  { targetId: "b", status: "open", createdAt: "2026-08-26T13:00:00Z", targetUsername: "bob" },
  { targetId: "c", status: "dismissed", createdAt: "2026-08-26T14:00:00Z", targetUsername: "cara" },
]);
assert(grouped[0].targetId === "a" && grouped[0].openCount === 3, "hottest target first");
assert(pickAutoOpenTarget(grouped) === "a", "auto-open picks 3+ open target");
assert(pickAutoOpenTarget(grouped.filter((g) => g.targetId !== "a")) === null, "no auto-open under threshold");

const now = Date.parse("2026-08-26T12:00:00Z");
assert(
  isDuplicateOpen(
    [
      {
        reporter_id: "r1",
        target_id: "t1",
        context_type: "dm",
        context_id: "m1",
        status: "open",
        created_at: "2026-08-26T11:00:00Z",
      },
    ],
    { reporterId: "r1", targetId: "t1", contextType: "dm", contextId: "m1", nowMs: now }
  ) === true,
  "duplicate open report in window"
);
assert(
  isDuplicateOpen(
    [
      {
        reporter_id: "r1",
        target_id: "t1",
        context_type: "dm",
        context_id: "m1",
        status: "open",
        created_at: "2026-08-26T11:00:00Z",
      },
    ],
    { reporterId: "r1", targetId: "t1", contextType: "dm", contextId: "m2", nowMs: now }
  ) === false,
  "different message is a new report"
);

console.log("userReports.selftest.cjs ok");
