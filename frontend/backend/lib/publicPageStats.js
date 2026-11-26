"use strict";

/**
 * Counters of the public server page (views, join clicks, joins per day and source).
 *
 * Every node buffers increments in memory and flushes them every FLUSH_MS through
 * public.server_public_page_bump (an atomic insert-or-add), so two nodes never overwrite
 * each other and a burst of views is one round trip. A view is counted once per visitor
 * per server per VIEW_DEDUPE_MS (hashed IP + user agent, kept in memory only).
 *
 * Until migration 20261124u is applied the RPC fails: counters are dropped with one
 * warning instead of piling up. Tests: publicPageStats.selftest.cjs.
 */

const crypto = require("crypto");
const { SOURCES, dayKey } = require("./serverPublicPage");

const FLUSH_MS = 30 * 1000;
const VIEW_DEDUPE_MS = 30 * 60 * 1000;
const DEDUPE_MAX = 50_000;
const KINDS = ["views", "join_clicks", "joins"];

function createPublicPageStats({ supabase, now = () => Date.now(), flushMs = FLUSH_MS, autoFlush = true } = {}) {
  const pending = new Map(); // `${serverId}|${day}|${source}` -> { views, join_clicks, joins }
  const seen = new Map(); // dedupe key -> time
  let timer = null;
  let warned = false;
  let flushing = null;

  function schedule() {
    if (!autoFlush || timer) return;
    timer = setTimeout(() => {
      timer = null;
      flush().catch(() => {});
    }, flushMs);
    if (typeof timer.unref === "function") timer.unref();
  }

  function add(serverId, source, kind, n = 1) {
    if (!serverId || !KINDS.includes(kind)) return false;
    const src = SOURCES.includes(source) ? source : "other";
    const key = `${serverId}|${dayKey(now())}|${src}`;
    const row = pending.get(key) || { views: 0, join_clicks: 0, joins: 0 };
    row[kind] += Math.max(0, Math.floor(Number(n) || 0));
    pending.set(key, row);
    schedule();
    return true;
  }

  function visitorKey(serverId, ip, ua) {
    return crypto.createHash("sha256").update(`${serverId}|${ip || ""}|${ua || ""}`).digest("base64url").slice(0, 22);
  }

  /** Count a page view unless this visitor was counted for this server recently. */
  function view(serverId, source, { ip, ua } = {}) {
    const t = now();
    const key = visitorKey(serverId, ip, ua);
    const last = seen.get(key);
    if (last && t - last < VIEW_DEDUPE_MS) return false;
    seen.set(key, t);
    if (seen.size > DEDUPE_MAX) {
      for (const [k, at] of seen) {
        if (t - at >= VIEW_DEDUPE_MS || seen.size > DEDUPE_MAX) seen.delete(k);
        if (seen.size <= DEDUPE_MAX * 0.9) break;
      }
    }
    return add(serverId, source, "views", 1);
  }

  async function flushOnce() {
    if (!pending.size) return 0;
    const rows = [...pending.entries()];
    pending.clear();
    let written = 0;
    for (const [key, v] of rows) {
      const [serverId, day, source] = key.split("|");
      const { error } = await supabase.rpc("server_public_page_bump", {
        p_server: serverId,
        p_day: day,
        p_source: source,
        p_views: v.views,
        p_join_clicks: v.join_clicks,
        p_joins: v.joins,
      });
      if (error) {
        if (!warned) {
          warned = true;
          console.warn("[public-page] counters not saved:", error.message || error);
        }
        continue;
      }
      written += 1;
    }
    return written;
  }

  function flush() {
    if (flushing) return flushing;
    flushing = flushOnce().finally(() => {
      flushing = null;
    });
    return flushing;
  }

  return { add, view, flush, pendingSize: () => pending.size, _seen: seen };
}

module.exports = { createPublicPageStats, FLUSH_MS, VIEW_DEDUPE_MS };
