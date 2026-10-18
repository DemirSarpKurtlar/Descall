// Private chat media (2.11.2). DM / group / server attachments arrive as short-lived signed
// backend URLs (`/api/media/f/<path>?e=<expiry>&s=<sig>`). This module keeps them fresh:
// URLs close to expiry, URLs that fail to load, and legacy public Supabase URLs (whose public
// copy has been retired) are exchanged through POST /api/media/refresh, which only answers
// for members of the conversation. Results are cached in memory, keyed by storage path.
import { useCallback, useEffect, useState } from "react";
import { API_BASE_URL } from "../config/api.js";
import { getToken } from "./storage.js";

const SIGNED_RE = /\/api\/media\/f\/((?:images|files)\/[A-Za-z0-9._-]+)(?:\?|$)/;
const LEGACY_RE = /\/storage\/v1\/object\/public\/media\/((?:images|files)\/[A-Za-z0-9._-]+)(?:\?|$)/;
const EARLY_S = 120;

const cache = new Map(); // path -> { url, exp }
let pending = new Map(); // given url -> [resolve]
let timer = null;

export function mediaPathOf(url) {
  if (typeof url !== "string" || !url) return null;
  const m = url.match(SIGNED_RE) || url.match(LEGACY_RE);
  return m ? m[1] : null;
}

export function isPrivateMediaUrl(url) {
  return typeof url === "string" && SIGNED_RE.test(url);
}

export function signedExpiry(url) {
  if (!isPrivateMediaUrl(url)) return null;
  try {
    const e = Number(new URL(url, "https://x.invalid").searchParams.get("e"));
    return Number.isFinite(e) && e > 0 ? e : null;
  } catch {
    return null;
  }
}

export function needsRefresh(url, nowMs = Date.now()) {
  const e = signedExpiry(url);
  return e != null && e - EARLY_S <= nowMs / 1000;
}

/** Best URL we currently know for `url` (cached fresher copy, or the url itself). */
export function bestKnownUrl(url, nowMs = Date.now()) {
  const path = mediaPathOf(url);
  if (!path) return url;
  const hit = cache.get(path);
  if (hit && hit.exp - EARLY_S > nowMs / 1000) return hit.url;
  return url;
}

function remember(url) {
  const path = mediaPathOf(url);
  const exp = signedExpiry(url);
  if (!path || !exp) return;
  const prev = cache.get(path);
  if (!prev || prev.exp < exp) cache.set(path, { url, exp });
}

async function flush(fetchImpl) {
  timer = null;
  const batch = pending;
  pending = new Map();
  const urls = [...batch.keys()];
  let fresh = {};
  try {
    const token = getToken();
    if (token) {
      const res = await fetchImpl(`${API_BASE_URL}/api/media/refresh`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ urls }),
      });
      if (res.ok) fresh = (await res.json())?.urls || {};
    }
  } catch {
    fresh = {};
  }
  for (const [given, waiters] of batch) {
    const next = typeof fresh[given] === "string" ? fresh[given] : null;
    if (next) remember(next);
    for (const resolve of waiters) resolve(next);
  }
}

/** Exchange a (stale / broken / legacy) media URL for a fresh signed one; null if not allowed. */
export function refreshMediaUrl(url, { fetchImpl = globalThis.fetch } = {}) {
  if (!mediaPathOf(url)) return Promise.resolve(null);
  return new Promise((resolve) => {
    const list = pending.get(url) || [];
    list.push(resolve);
    pending.set(url, list);
    if (!timer) timer = setTimeout(() => flush(fetchImpl), 40);
  });
}

/**
 * React hook: returns the URL to render plus an onError handler for <img>/<video>/<audio>.
 * Non-private URLs (GIF providers, avatars) pass straight through.
 */
export function usePrivateMediaUrl(rawUrl) {
  const [state, setState] = useState(() => ({ raw: rawUrl, url: bestKnownUrl(rawUrl), tried: false }));
  const current = state.raw === rawUrl ? state : { raw: rawUrl, url: bestKnownUrl(rawUrl), tried: false };

  useEffect(() => {
    if (isPrivateMediaUrl(rawUrl)) remember(rawUrl);
    let cancelled = false;
    let timerId = null;
    const schedule = (url) => {
      const exp = signedExpiry(url);
      if (!exp) return;
      const waitMs = Math.max(0, (exp - EARLY_S) * 1000 - Date.now());
      if (waitMs > 2 ** 31 - 1) return;
      timerId = setTimeout(run, waitMs);
    };
    const run = () => {
      refreshMediaUrl(rawUrl).then((next) => {
        if (cancelled || !next) return;
        setState({ raw: rawUrl, url: next, tried: false });
        schedule(next);
      });
    };
    const url = bestKnownUrl(rawUrl);
    if (needsRefresh(url)) run();
    else schedule(url);
    return () => {
      cancelled = true;
      if (timerId) clearTimeout(timerId);
    };
  }, [rawUrl]);

  const onMediaError = useCallback(() => {
    if (current.tried || !mediaPathOf(rawUrl)) return;
    setState({ raw: rawUrl, url: current.url, tried: true });
    refreshMediaUrl(rawUrl).then((next) => {
      if (next && next !== current.url) setState({ raw: rawUrl, url: next, tried: true });
    });
  }, [rawUrl, current.tried, current.url]);

  return { url: current.url, onMediaError };
}

export function _resetPrivateMediaCache() {
  cache.clear();
  pending = new Map();
  if (timer) clearTimeout(timer);
  timer = null;
}
