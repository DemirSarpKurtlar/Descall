#!/usr/bin/env node
"use strict";

/**
 * "Bug Avcısı" retroactive list, READ ONLY: prints the feedback items from before the feature
 * that already look like confirmed real bugs (resolved bug / security items, team replies that
 * say it was fixed or link to the fix) with the reporters' usernames, so the owner can decide
 * who gets the badge first. It grants nothing, pays nothing and writes nothing; confirm the
 * chosen items in Admin > Geri Bildirim > "Gerçek bug olarak doğrula".
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node backend/scripts/bugHunterCandidates.js
 *     [--json] [--csv] [--limit=2000] [--min=high|medium]
 *
 * Needs admin database access (service role), read from the environment; never pass the key
 * on the command line. The same list is in the panel: GET /api/admin/feedback/bug-hunter/candidates.
 */

const { findCandidates, load } = require("../lib/bugHunter/candidates");

function parseArgs(argv) {
  return Object.fromEntries(argv.map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }));
}

const SIGNAL_TR = { fix_link: "düzeltme bağlantısı", resolved: "çözüldü", fix_reply: "ekip 'düzelttik' dedi" };
const CONF_TR = { high: "yüksek", medium: "orta", low: "düşük" };

function day(iso) {
  return iso ? String(iso).slice(0, 10) : "-";
}

function csvCell(v) {
  const s = String(v ?? "");
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Text report (Turkish, for the owner). */
function formatReport(result, { min = "medium" } = {}) {
  const keep = min === "high" ? new Set(["high"]) : new Set(["high", "medium", "low"]);
  const items = result.items.filter((i) => keep.has(i.confidence));
  const lines = [];
  lines.push(`Bug Avcısı geçmiş adayları (yalnızca okuma, hiçbir şey verilmedi)`);
  lines.push(`Taranan: ${result.scanned ?? "?"} · Aday: ${items.length} · Kişi: ${new Set(items.map((i) => i.userId)).size} · Güveni yüksek: ${items.filter((i) => i.confidence === "high").length} · Rozeti zaten olan: ${result.people.filter((p) => p.holdsBadge).length}`);
  lines.push("");
  lines.push("Kişiler (önce güveni yüksek olanlar):");
  for (const p of result.people) {
    const mine = items.filter((i) => i.userId === p.userId);
    if (!mine.length) continue;
    lines.push(`  @${p.username || p.userId}  ${mine.length} bildirim (${mine.filter((i) => i.confidence === "high").length} yüksek), ilki ${day(p.first)}${p.holdsBadge ? "  [Bug Hunter rozeti zaten var]" : ""}`);
  }
  lines.push("");
  lines.push("Bildirimler:");
  for (const i of items) {
    lines.push(`  [${CONF_TR[i.confidence]}] ${day(i.createdAt)} @${i.username || i.userId}  ${i.subject || "(konu yok)"}`);
    lines.push(`      ${i.feedbackId} · ${i.signals.map((s) => SIGNAL_TR[s] || s).join(", ")}`);
  }
  return lines.join("\n");
}

function formatCsv(result) {
  const head = ["feedback_id", "user_id", "username", "holds_bughunter", "created_at", "status", "confidence", "signals", "subject"];
  const rows = result.items.map((i) => [i.feedbackId, i.userId, i.username, i.holdsBadge ? "yes" : "no", i.createdAt, i.status, i.confidence, i.signals.join("|"), i.subject].map(csvCell).join(","));
  return [head.join(","), ...rows].join("\n");
}

async function main(argv = process.argv.slice(2), { supabase = null, write = (s) => process.stdout.write(`${s}\n`) } = {}) {
  const args = parseArgs(argv);
  const client = supabase || require("../db/supabase");
  const result = await load({ supabase: client, limit: Math.max(1, Math.min(20000, Number(args.limit) || 2000)) });
  if (args.json) write(JSON.stringify(result, null, 2));
  else if (args.csv) write(formatCsv(result));
  else write(formatReport(result, { min: args.min === "high" ? "high" : "medium" }));
  return result;
}

if (require.main === module) {
  main().catch((err) => {
    console.error("bugHunterCandidates failed:", err?.message || err);
    process.exit(1);
  });
}

module.exports = { main, formatReport, formatCsv, findCandidates };
