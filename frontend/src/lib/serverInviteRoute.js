/**
 * 3.7.31: server invite links (descall.com/servers/join/:code, /invite/s/:code,
 * ?si=:code and descall://invite/:code on iOS).
 *
 * Before this, App.jsx only knew group invites (/invite/:code) and vanity
 * links (/s/:slug). A server invite URL was treated as an app path, so a
 * logged-out visitor was redirected to "/" (marketing home) and a logged-in
 * user landed on the servers home with "join" taken as a server id. The code
 * was lost on the way through login/sign-up as well.
 *
 * Pure helpers (no React), tested by serverInviteRoute.selftest.mjs.
 */

export const SERVER_INVITE_CODE_RE = /^[A-Za-z0-9_-]{4,32}$/;
export const PENDING_SERVER_INVITE_KEY = "descall:pendingServerInvite";
/** A pending invite older than this is dropped (stale tab, abandoned sign-up). */
export const PENDING_TTL_MS = 2 * 60 * 60 * 1000;

function cleanCode(raw) {
  let value = String(raw ?? "").trim();
  try {
    value = decodeURIComponent(value);
  } catch {
    return null;
  }
  return SERVER_INVITE_CODE_RE.test(value) ? value : null;
}

/** In-app path for a server invite code (also the canonical share path). */
export function serverInvitePath(code) {
  const c = cleanCode(code);
  return c ? `/servers/join/${encodeURIComponent(c)}` : null;
}

/**
 * Server invite code from a location ({ pathname, search }), or null.
 * Group invites (/invite/:code, ?invite=) are NOT server invites.
 */
export function parseServerInviteFromLocation(loc) {
  const pathname = String(loc?.pathname || "");
  const search = String(loc?.search || "");
  let m = pathname.match(/^\/servers\/join\/([^/?#]+)\/?$/i);
  if (m) return cleanCode(m[1]);
  m = pathname.match(/^\/invite\/s\/([^/?#]+)\/?$/i);
  if (m) return cleanCode(m[1]);
  try {
    const params = new URLSearchParams(search);
    const q = params.get("si") || params.get("serverInvite");
    if (q) return cleanCode(q);
  } catch {
    /* ignore */
  }
  return null;
}

/** True when the location is any server-invite URL (even with a malformed code). */
export function isServerInviteLocation(loc) {
  const pathname = String(loc?.pathname || "");
  if (/^\/servers\/join(\/|$)/i.test(pathname) || /^\/invite\/s(\/|$)/i.test(pathname)) return true;
  try {
    const params = new URLSearchParams(String(loc?.search || ""));
    return params.has("si") || params.has("serverInvite");
  } catch {
    return false;
  }
}

function stores(storage) {
  if (storage) return [storage];
  const out = [];
  try {
    if (typeof sessionStorage !== "undefined") out.push(sessionStorage);
  } catch {
    /* ignore */
  }
  try {
    // localStorage too: Google/Apple sign-in and e-mail verification can come
    // back in a new tab / after an app relaunch, where sessionStorage is empty.
    if (typeof localStorage !== "undefined") out.push(localStorage);
  } catch {
    /* ignore */
  }
  return out;
}

export function savePendingServerInvite(code, { now = Date.now(), storage } = {}) {
  const c = cleanCode(code);
  if (!c) return false;
  const value = JSON.stringify({ code: c, at: now });
  let ok = false;
  for (const s of stores(storage)) {
    try {
      s.setItem(PENDING_SERVER_INVITE_KEY, value);
      ok = true;
    } catch {
      /* ignore */
    }
  }
  return ok;
}

export function clearPendingServerInvite({ storage } = {}) {
  for (const s of stores(storage)) {
    try {
      s.removeItem(PENDING_SERVER_INVITE_KEY);
    } catch {
      /* ignore */
    }
  }
}

/** Pending invite code (not removed), or null when missing / stale / malformed. */
export function peekPendingServerInvite({ now = Date.now(), storage } = {}) {
  for (const s of stores(storage)) {
    let raw = null;
    try {
      raw = s.getItem(PENDING_SERVER_INVITE_KEY);
    } catch {
      raw = null;
    }
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      const c = cleanCode(parsed?.code);
      if (c && Number.isFinite(parsed?.at) && now - parsed.at <= PENDING_TTL_MS && parsed.at <= now + 60_000) {
        return c;
      }
    } catch {
      /* fall through */
    }
  }
  return null;
}

export function takePendingServerInvite(opts = {}) {
  const code = peekPendingServerInvite(opts);
  clearPendingServerInvite(opts);
  return code;
}

/**
 * Turkish/English-key error copy for an invite preview or join failure.
 * Returns an i18n key (English source string, Turkish in trInAppGaps).
 */
export function serverInviteErrorKey(err) {
  const code = String(err?.code || "");
  const status = Number(err?.status || 0);
  if (code === "INVITE_INVALID" || code === "INVITE_EXPIRED" || status === 404 || status === 410) {
    return "This invite is invalid or has expired.";
  }
  if (code === "BANNED") return "You are banned from this server.";
  if (code === "MAX_JOINED_SERVERS") return "You have reached the server limit. Leave a server to join this one.";
  if (code === "ACCOUNT_BANNED") return "Your account is suspended.";
  if (code && /VERIFICATION|EMAIL|ACCOUNT_AGE|PHONE/i.test(code)) {
    return "This server requires extra verification before you can join.";
  }
  if (status === 429) return "Too many attempts. Wait a little and try again.";
  if (status === 401) return "Your session has ended. Log in again to join.";
  if (status === 0 || status >= 500) return "Could not reach Descall. Check your connection and try again.";
  return "Could not join server";
}

/** Whether the error is final for this invite (no retry button). */
export function isFinalInviteError(err) {
  const code = String(err?.code || "");
  const status = Number(err?.status || 0);
  return code === "INVITE_INVALID" || code === "INVITE_EXPIRED" || code === "BANNED" || status === 404 || status === 410;
}
