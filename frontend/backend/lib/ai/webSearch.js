"use strict";

const { logInternal } = require("./sanitize");

const MAX_RESULTS = 5;

function stripTags(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeDuckUrl(raw) {
  try {
    const u = new URL(raw, "https://duckduckgo.com");
    const uddg = u.searchParams.get("uddg");
    if (uddg) return decodeURIComponent(uddg);
    return u.href;
  } catch {
    return String(raw || "");
  }
}

async function searchBrave(query, signal) {
  const key = String(process.env.BRAVE_SEARCH_API_KEY || "").trim();
  if (!key) return null;
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${MAX_RESULTS}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json", "X-Subscription-Token": key },
    signal,
  });
  if (!res.ok) {
    logInternal("web-search-brave", { message: `status ${res.status}` }, { status: res.status });
    return null;
  }
  const json = await res.json().catch(() => ({}));
  const results = (json.web?.results || []).slice(0, MAX_RESULTS).map((r) => ({
    title: String(r.title || "Source").slice(0, 160),
    url: String(r.url || ""),
    snippet: String(r.description || "").slice(0, 280),
  })).filter((r) => r.url);
  return results;
}

async function searchDuckDuckGo(query, signal) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "DescallDimaAI/1.1 (+https://descall.app)",
      Accept: "text/html",
    },
    signal,
  });
  if (!res.ok) {
    logInternal("web-search-ddg", { message: `status ${res.status}` }, { status: res.status });
    return [];
  }
  const html = await res.text();
  const results = [];
  const re = /class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|td|div)>/gi;
  let m;
  while ((m = re.exec(html)) && results.length < MAX_RESULTS) {
    const href = decodeDuckUrl(m[1]);
    const title = stripTags(m[2]).slice(0, 160);
    const snippet = stripTags(m[3]).slice(0, 280);
    if (!href || !title) continue;
    if (/duckduckgo\.com\/y\.js/i.test(href)) continue;
    results.push({ title, url: href, snippet });
  }
  if (!results.length) {
    // Fallback: simpler anchor scrape
    const loose = /class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    while ((m = loose.exec(html)) && results.length < MAX_RESULTS) {
      const href = decodeDuckUrl(m[1]);
      const title = stripTags(m[2]).slice(0, 160);
      if (!href || !title || /duckduckgo\.com/i.test(href)) continue;
      results.push({ title, url: href, snippet: "" });
    }
  }
  return results;
}

/**
 * Search the public web. Prefer Brave when BRAVE_SEARCH_API_KEY is set.
 * Returns { results: [{title,url,snippet}], providerHint: "search" }.
 */
async function webSearch(query, { signal } = {}) {
  const q = String(query || "").trim().slice(0, 240);
  if (!q) return { results: [], error: "Empty query." };
  try {
    let results = await searchBrave(q, signal);
    if (!results) results = await searchDuckDuckGo(q, signal);
    return {
      results: (results || []).slice(0, MAX_RESULTS),
      query: q,
    };
  } catch (err) {
    if (err?.name === "AbortError") throw err;
    logInternal("web-search", err);
    return { results: [], error: "Search temporarily unavailable.", query: q };
  }
}

module.exports = {
  webSearch,
  MAX_RESULTS,
};
