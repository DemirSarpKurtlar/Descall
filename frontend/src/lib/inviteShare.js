/**
 * Davet Merkezi helpers (pure, tested by inviteShare.selftest.mjs): channel-tagged links
 * (descall.com/r/<user>?k=wa), the landing route, the open token that waits for sign-up,
 * countdowns, funnel stage segments, the milestone ring and sparkline paths.
 */
import { normalizeInviteRef, persistInviteRef, PUBLIC_SITE_ORIGIN } from "./referral.js";

/** Davet Merkezi refetch signal (InviteCenterHost relays the socket events). */
export const INVITES_UPDATE_EVENT = "descall:invites-update";

/** Share channels in button order. `k` is the tag in the link. */
export const INVITE_CHANNELS = Object.freeze(["wa", "ig", "tt", "qr", "link", "other"]);
const CHANNEL_ALIASES = { whatsapp: "wa", instagram: "ig", tiktok: "tt", copy: "link", cp: "link", share: "other", mo: "other" };

export function normalizeChannel(raw) {
  const k = String(raw || "").trim().toLowerCase();
  if (INVITE_CHANNELS.includes(k)) return k;
  return CHANNEL_ALIASES[k] || null;
}

/** descall.com/r/<user>, tagged with ?k=<channel> unless it is the plain copy. */
export function inviteShortUrl(username, channel = null, origin = PUBLIC_SITE_ORIGIN) {
  const clean = normalizeInviteRef(username);
  const base = `${String(origin || PUBLIC_SITE_ORIGIN).replace(/\/$/, "")}/r/${encodeURIComponent(clean)}`;
  if (!clean) return `${String(origin || PUBLIC_SITE_ORIGIN).replace(/\/$/, "")}/register`;
  const k = normalizeChannel(channel);
  return k && k !== "link" ? `${base}?k=${k}` : base;
}

/** The link as people read it ("descall.com/r/ece"). */
export function displayInviteUrl(username) {
  return inviteShortUrl(username).replace(/^https?:\/\//, "");
}

/** WhatsApp web/app intent with the message and the tagged link. */
export function whatsappShareUrl(text, url) {
  return `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`.trim())}`;
}

/** Where to send people after the link is copied for apps without a share intent. */
export const APP_OPEN_URL = Object.freeze({
  ig: "https://www.instagram.com/direct/inbox/",
  tt: "https://www.tiktok.com/messages",
});

/** /r/<username> -> username ("" when the path is not an invite landing). */
export function landingUsernameFromPath(pathname) {
  const m = /^\/r\/([^/?#]+)\/?$/.exec(String(pathname || ""));
  if (!m) return "";
  let raw = m[1];
  try {
    raw = decodeURIComponent(raw);
  } catch {
    return "";
  }
  return normalizeInviteRef(raw);
}

export function channelFromSearch(search) {
  try {
    const p = new URLSearchParams(String(search || "").replace(/^\?/, ""));
    return normalizeChannel(p.get("k")) || "link";
  } catch {
    return "link";
  }
}

const OPEN_KEY = "descall:inviteOpen";
const OPEN_TTL_MS = 7 * 24 * 3600 * 1000;

function stores() {
  const out = [];
  try {
    if (typeof localStorage !== "undefined") out.push(localStorage);
  } catch {
    /* blocked */
  }
  try {
    if (typeof sessionStorage !== "undefined") out.push(sessionStorage);
  } catch {
    /* blocked */
  }
  return out;
}

/**
 * Keep the invite (username, channel, open id) until sign-up finishes: the existing
 * register / Google / Apple flows read the ref (lib/referral.js); the channel and the open
 * are attached after sign-up (POST /api/invites/attach). Survives the OAuth redirects.
 */
export function rememberInviteOpen({ username, channel, openId = null, now = Date.now() }) {
  const clean = persistInviteRef(username);
  if (!clean) return null;
  const value = { username: clean, channel: normalizeChannel(channel) || "link", openId: openId || null, at: now };
  for (const s of stores()) {
    try {
      s.setItem(OPEN_KEY, JSON.stringify(value));
    } catch {
      /* quota */
    }
  }
  return value;
}

export function peekInviteOpen(now = Date.now()) {
  for (const s of stores()) {
    try {
      const v = JSON.parse(s.getItem(OPEN_KEY) || "null");
      if (v && v.username && now - (Number(v.at) || 0) < OPEN_TTL_MS) return v;
    } catch {
      /* broken value */
    }
  }
  return null;
}

export function clearInviteOpen() {
  for (const s of stores()) {
    try {
      s.removeItem(OPEN_KEY);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Compact countdown: { n, unit } with unit "d" | "h" | "m" (rounded up so "14 sa" never
 * reads as done early). null for no time left.
 */
export function countdownParts(ms) {
  const v = Number(ms);
  if (!Number.isFinite(v) || v <= 0) return null;
  const min = Math.ceil(v / 60000);
  if (min < 60) return { n: min, unit: "m" };
  const h = Math.ceil(v / 3600000);
  if (h < 48) return { n: h, unit: "h" };
  return { n: Math.ceil(v / 86400000), unit: "d" };
}

/**
 * The four funnel segments of one friend (opened, signed up, first message, active):
 * "d" done, "k" all done (paid, green), "w" waiting (amber stripes), "x" stopped, "" empty.
 */
export function stageSegments({ stage = 1, waiting = false, status = "" } = {}) {
  if (status === "paid") return ["k", "k", "k", "k"];
  const out = [];
  for (let i = 1; i <= 4; i += 1) {
    if (i <= stage) out.push("d");
    else if (i === stage + 1 && (waiting || status === "waiting_return")) out.push("w");
    else out.push("");
  }
  if (status === "revoked" || status === "expired" || status === "denied") return out.map((s) => (s ? "x" : ""));
  return out;
}

/**
 * The phone ring: progress from the previous milestone to the next one.
 * { count, target, pct, done } (done when every milestone is reached).
 */
export function milestoneRing(milestones) {
  const list = Array.isArray(milestones?.list) ? milestones.list : [];
  const count = Number(milestones?.count) || 0;
  const next = list.find((m) => count < m.at);
  if (!next) {
    const last = list[list.length - 1];
    return { count, target: last ? last.at : count, pct: 1, done: true, next: null };
  }
  return { count, target: next.at, pct: Math.max(0, Math.min(1, count / next.at)), done: false, next };
}

/** SVG path for a sparkline in a w x h box (smooth enough, no library). */
export function sparkPath(values, w = 100, h = 28, pad = 2) {
  const v = (Array.isArray(values) ? values : []).map((x) => Number(x) || 0);
  if (v.length < 2) return "";
  const max = Math.max(1, ...v);
  const step = (w - pad * 2) / (v.length - 1);
  return v
    .map((x, i) => {
      const px = pad + i * step;
      const py = h - pad - (x / max) * (h - pad * 2);
      return `${i ? "L" : "M"}${px.toFixed(1)} ${py.toFixed(1)}`;
    })
    .join(" ");
}

/** Shares of sign-ups per channel for the stacked bar (sums to 100). */
export function channelBar(channels) {
  const list = (Array.isArray(channels) ? channels : []).filter((c) => c && c.signups > 0);
  const total = list.reduce((s, c) => s + c.signups, 0);
  if (!total) return [];
  let used = 0;
  return list.map((c, i) => {
    const pct = i === list.length - 1 ? 100 - used : Math.round((c.signups / total) * 100);
    used += pct;
    return { channel: c.channel, pct };
  });
}

/** Friends filtered by the live table's segment. */
export function filterFriends(friends, seg) {
  const list = Array.isArray(friends) ? friends : [];
  if (seg === "pending") return list.filter((f) => f.status === "waiting_message" || f.status === "waiting_return");
  if (seg === "active") return list.filter((f) => f.status === "paid");
  if (seg === "review") return list.filter((f) => f.status === "reviewing");
  return list;
}

export function friendCounts(friends) {
  return {
    all: (friends || []).length,
    pending: filterFriends(friends, "pending").length,
    active: filterFriends(friends, "active").length,
    review: filterFriends(friends, "review").length,
  };
}
