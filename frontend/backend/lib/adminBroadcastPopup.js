"use strict";

const { isVisibleStatus } = require("./presenceRoster");

const SEVERITIES = new Set(["info", "success", "warning", "urgent"]);
const MAX_TITLE = 80;
const MAX_BODY = 800;
const MAX_EMOJI = 8;
const MAX_CTA_LABEL = 40;
const MAX_CTA_URL = 300;
const MAX_DURATION_MS = 120_000;
const RATE_LIMIT_MS = 8_000;
const MAX_RECENT = 40;
const ALLOWED_CTA_HOSTS = new Set(["descall.com", "www.descall.com"]);

const lastSentAtByActor = new Map();
const recentSends = [];

function randomId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `popup-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function clip(value, max) {
  return String(value || "").trim().slice(0, max);
}

function sanitizeCtaUrl(raw) {
  const s = String(raw || "").trim();
  if (!s) return { ok: true, url: "" };
  if (s.startsWith("/") && !s.startsWith("//") && !s.includes("\\")) {
    return { ok: true, url: s.slice(0, MAX_CTA_URL) };
  }
  try {
    const u = new URL(s);
    if (u.protocol !== "https:") return { ok: false };
    const host = u.hostname.toLowerCase();
    if (ALLOWED_CTA_HOSTS.has(host) || host.endsWith(".descall.com")) {
      return { ok: true, url: u.toString().slice(0, MAX_CTA_URL) };
    }
  } catch {
    /* invalid */
  }
  return { ok: false };
}

function buildPopupPayload(input = {}, { actor, now } = {}) {
  const title = clip(input.title, MAX_TITLE);
  const body = clip(input.body, MAX_BODY);
  if (!title) return { ok: false, error: "Title is required." };
  if (!body) return { ok: false, error: "Message body is required." };
  if (String(input.title || "").trim().length > MAX_TITLE) {
    return { ok: false, error: `Title must be ${MAX_TITLE} characters or fewer.` };
  }
  if (String(input.body || "").trim().length > MAX_BODY) {
    return { ok: false, error: `Message must be ${MAX_BODY} characters or fewer.` };
  }

  const severityRaw = String(input.severity || "info").toLowerCase();
  const severity = SEVERITIES.has(severityRaw) ? severityRaw : "info";
  const emoji = clip(input.emoji, MAX_EMOJI) || "📢";

  let durationMs = Number(input.durationMs);
  if (!Number.isFinite(durationMs) || durationMs < 0) durationMs = 0;
  durationMs = Math.min(MAX_DURATION_MS, Math.round(durationMs));

  const requireAck = Boolean(input.requireAck) || (severity === "urgent" && input.requireAck !== false);

  let ctaLabel = clip(input.ctaLabel, MAX_CTA_LABEL);
  const cta = sanitizeCtaUrl(input.ctaUrl);
  if (!cta.ok) return { ok: false, error: "CTA link must be a Descall URL or an in-app path." };
  if (ctaLabel && !cta.url) return { ok: false, error: "Add a valid CTA link or clear the button label." };
  if (cta.url && !ctaLabel) ctaLabel = "Open";

  const at = now instanceof Date ? now.toISOString() : new Date().toISOString();
  return {
    ok: true,
    popup: {
      id: randomId(),
      title,
      body,
      severity,
      emoji,
      durationMs,
      requireAck,
      ctaLabel: ctaLabel || "",
      ctaUrl: cta.url || "",
      at,
      from: {
        id: actor?.id || null,
        username: actor?.username || "admin",
      },
    },
  };
}

function selectRecipients(live = [], { audience = "connected", includeSelf = true, actorId } = {}) {
  const list = Array.isArray(live) ? live : [];
  const scoped = audience === "visible" ? list.filter((u) => isVisibleStatus(u?.status)) : list;
  if (includeSelf) return scoped;
  const actor = String(actorId || "");
  return scoped.filter((u) => String(u?.id) !== actor);
}

function roomSize(io, userId) {
  const room = io?.sockets?.adapter?.rooms?.get(`user:${String(userId)}`);
  return room ? room.size : 0;
}

function deliverPopup(io, recipients, popup) {
  if (!io || !popup) return 0;
  let delivered = 0;
  for (const user of recipients || []) {
    const id = user?.id;
    if (!id) continue;
    if (roomSize(io, id) <= 0) continue;
    io.to(`user:${id}`).emit("admin:popup", popup);
    delivered += 1;
  }
  return delivered;
}

function checkRateLimit(actorId, now = Date.now()) {
  const key = String(actorId || "");
  const last = lastSentAtByActor.get(key) || 0;
  const wait = RATE_LIMIT_MS - (now - last);
  if (wait > 0) {
    return { ok: false, error: "Please wait a few seconds before sending another popup.", retryAfterMs: wait };
  }
  return { ok: true };
}

function rememberSend(entry, now = Date.now()) {
  if (entry?.actorId) lastSentAtByActor.set(String(entry.actorId), now);
  recentSends.unshift({
    id: entry?.popup?.id || randomId(),
    at: entry?.at || new Date(now).toISOString(),
    actorId: entry?.actorId || null,
    actorUsername: entry?.actorUsername || null,
    audience: entry?.audience || "connected",
    delivered: Number(entry?.delivered) || 0,
    skipped: Number(entry?.skipped) || 0,
    popup: entry?.popup || null,
  });
  if (recentSends.length > MAX_RECENT) recentSends.length = MAX_RECENT;
  return recentSends[0];
}

function listRecent(limit = 20) {
  return recentSends.slice(0, Math.min(40, Math.max(1, Number(limit) || 20)));
}

/** Test helper — not used in production routes. */
function _resetForTests() {
  lastSentAtByActor.clear();
  recentSends.length = 0;
}

module.exports = {
  MAX_TITLE,
  MAX_BODY,
  RATE_LIMIT_MS,
  buildPopupPayload,
  selectRecipients,
  checkRateLimit,
  deliverPopup,
  rememberSend,
  listRecent,
  _resetForTests,
};
