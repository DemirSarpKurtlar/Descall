"use strict";

/**
 * Hata Kayıtları (3.7.0): group client / server errors into issues the way
 * Sentry does, so 40 copies of one crash read as one line with a count.
 *
 * fingerprint = sha1 of the normalized message + the first app stack frame:
 *  - ErrorBoundary support codes ("[693A8ADF] …"), numbers, uuids, hex ids,
 *    urls and quoted values are replaced, so the same bug always matches;
 *  - bundle hashes in file names ("App-BfP4awCc.js") and line:column are
 *    dropped, so a new release does not split an issue.
 * Pure helpers; routes/adminErrors.js and routes/errors.js use them.
 */

const crypto = require("crypto");

const PLATFORMS = Object.freeze(["windows-app", "iphone-app", "ipad-app", "android-app", "iphone-web", "android-web", "desktop-web", "server", "other"]);

function normalizeMessage(message) {
  return String(message || "")
    .replace(/^\s*\[[0-9A-Fa-f]{4,16}\]\s*/, "") // ErrorBoundary support code
    .replace(/https?:\/\/[^\s'")]+/g, "<url>")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "<id>")
    .replace(/\b[0-9a-f]{12,}\b/gi, "<hex>")
    .replace(/\b\d+(\.\d+)?\b/g, "<n>")
    .replace(/(["'`])(?:(?!\1).){1,80}\1/g, "$1…$1")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

/** First stack frame that is our code, without bundle hash / position: "App.js:fn". */
function topFrame(stack) {
  const lines = String(stack || "").split("\n").map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    // Chrome: "at fn (https://x/assets/App-Hash.js:1:2)"  Safari/Firefox: "fn@https://x/assets/App-Hash.js:1:2"
    const m = line.match(/^(?:at\s+)?(?:([^\s@(]+)\s*\(|([^\s@(]*)@)?\(?([^()\s]+?):\d+(?::\d+)?\)?$/);
    if (!m) continue;
    const fn = (m[1] || m[2] || "").replace(/^Object\./, "");
    const file = String(m[3] || "").split(/[?#]/)[0].split("/").pop() || "";
    if (/^vendor-|node_modules|^react-dom|^chunk-/i.test(file)) continue;
    const base = file.replace(/-[A-Za-z0-9_]{6,12}(\.m?js)$/, "$1");
    return `${base}${fn ? `:${fn}` : ""}`;
  }
  return "";
}

function fingerprint(message, stack) {
  const key = `${normalizeMessage(message)}|${topFrame(stack)}`;
  return crypto.createHash("sha1").update(key).digest("hex").slice(0, 20);
}

/** Readable title: the message without the support code, one line. */
function titleOf(message) {
  return String(message || "Bilinmeyen hata")
    .replace(/^\s*\[[0-9A-Fa-f]{4,16}\]\s*/, "")
    .split("\n")[0]
    .slice(0, 200);
}

function platformOf(userAgent, source) {
  const ua = String(userAgent || "");
  if (String(source || "") === "server" || /^node/i.test(ua)) return "server";
  if (/Electron|Descall-Electron/i.test(ua)) return "windows-app";
  if (/iPad/i.test(ua)) return /Safari\//.test(ua) && !/Descall/i.test(ua) ? "desktop-web" : "ipad-app";
  if (/iPhone|iPod/i.test(ua)) return /Safari\//.test(ua) && !/Descall/i.test(ua) ? "iphone-web" : "iphone-app";
  if (/Android/i.test(ua)) return /; wv\)|Descall/i.test(ua) ? "android-app" : "android-web";
  if (/Windows|Macintosh|Linux|CrOS/i.test(ua)) return "desktop-web";
  return "other";
}

const RANGES = Object.freeze({ "24h": 24, "7d": 7 * 24, "30d": 30 * 24 });

/**
 * Group rows (newest first) into issues.
 * @param {object[]} rows error_logs rows
 * @param {Map<string, object>} states fingerprint → error_group_state row
 * @param {{ now?: number, range?: string }} opts
 */
function groupRows(rows, states = new Map(), { now = Date.now(), range = "7d" } = {}) {
  const hours = RANGES[range] || RANGES["7d"];
  const bucketMs = hours <= 24 ? 3600e3 : 24 * 3600e3;
  const bucketCount = hours <= 24 ? 24 : Math.round(hours / 24);
  const start = now - bucketCount * bucketMs;
  const groups = new Map();
  for (const r of rows || []) {
    const fp = r.fingerprint || fingerprint(r.message, r.stack);
    const at = Date.parse(r.timestamp || r.created_at || 0) || 0;
    let g = groups.get(fp);
    if (!g) {
      g = {
        fingerprint: fp,
        title: titleOf(r.message),
        frame: topFrame(r.stack),
        severity: r.severity || "error",
        source: r.source || "frontend",
        count: 0,
        users: new Set(),
        platforms: {},
        firstSeen: at,
        lastSeen: at,
        trend: new Array(bucketCount).fill(0),
        sampleId: r.id,
      };
      groups.set(fp, g);
    }
    g.count += 1;
    if (r.user_id && r.user_id !== "anonymous") g.users.add(r.user_id);
    const p = r.platform || platformOf(r.user_agent, r.source);
    g.platforms[p] = (g.platforms[p] || 0) + 1;
    if (at && at < g.firstSeen) g.firstSeen = at;
    if (at > g.lastSeen) {
      g.lastSeen = at;
      g.sampleId = r.id;
    }
    if (at >= start) {
      const i = Math.min(bucketCount - 1, Math.floor((at - start) / bucketMs));
      if (i >= 0) g.trend[i] += 1;
    }
  }
  return [...groups.values()].map((g) => {
    const st = states.get(g.fingerprint) || null;
    let status = st?.status || "open";
    // A resolved issue that happens again after it was resolved is a regression.
    const regressed = status === "resolved" && st?.resolved_at && g.lastSeen > Date.parse(st.resolved_at);
    if (regressed) status = "open";
    return {
      fingerprint: g.fingerprint,
      title: g.title,
      frame: g.frame || null,
      severity: g.severity,
      source: g.source,
      count: g.count,
      users: g.users.size,
      platforms: g.platforms,
      firstSeen: g.firstSeen ? new Date(g.firstSeen).toISOString() : null,
      lastSeen: g.lastSeen ? new Date(g.lastSeen).toISOString() : null,
      trend: g.trend,
      sampleId: g.sampleId,
      status,
      regressed: Boolean(regressed),
      note: st?.note || null,
      updatedBy: st?.updated_by_username || null,
      isNew: g.firstSeen >= now - 24 * 3600e3,
    };
  });
}

function sortGroups(groups, sort = "recent") {
  const list = [...groups];
  if (sort === "count") list.sort((a, b) => b.count - a.count || String(b.lastSeen).localeCompare(String(a.lastSeen)));
  else if (sort === "users") list.sort((a, b) => b.users - a.users || b.count - a.count);
  else list.sort((a, b) => String(b.lastSeen).localeCompare(String(a.lastSeen)));
  return list;
}

module.exports = { PLATFORMS, RANGES, normalizeMessage, topFrame, fingerprint, titleOf, platformOf, groupRows, sortGroups };
