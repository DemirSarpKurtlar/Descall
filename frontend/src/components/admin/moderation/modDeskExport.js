/**
 * Geçmiş export: CSV (formula-safe cells, like the server's historyCsv) and a
 * tab-separated copy for pasting into a sheet. Pure; tested by modDesk.selftest.mjs.
 */

const HEAD = ["created_at", "action", "target", "category", "duration_seconds", "actor", "status", "message"];

function rowValues(r) {
  return [r.createdAt, r.action, r.target?.username, r.category, r.durationSeconds, r.actor?.username || (r.auto ? "auto" : ""), r.status, r.message];
}

/** One CSV cell: quoted when needed; a leading = + - @ is neutralised. */
export function csvCell(v) {
  const s = v == null ? "" : String(v);
  if (/^[=+\-@]/.test(s)) return `"'${s.replace(/"/g, '""')}"`;
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function historyCsv(rows) {
  return [HEAD.join(","), ...(rows || []).map((r) => rowValues(r).map(csvCell).join(","))].join("\n");
}

export function historyTsv(rows) {
  const clean = (v) => (v == null ? "" : String(v).replace(/[\t\r\n]+/g, " ").replace(/^([=+\-@])/, "'$1"));
  return [HEAD.join("\t"), ...(rows || []).map((r) => rowValues(r).map(clean).join("\t"))].join("\n");
}
