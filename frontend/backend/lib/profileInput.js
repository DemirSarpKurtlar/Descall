"use strict";

/**
 * Input rules for PUT /api/user/profile, /notifications, /privacy and /regional
 * (security scan 17 Nov 2026: they stored any type, any length and any URL; a 60 000
 * character display name or a third-party "avatar" URL was saved and broadcast to
 * every friend). Limits match the client inputs (UserPanel: name 32, bio 190, status 60).
 *
 * Each sanitizer returns { ok: true, value } or { ok: false, status, body }, where body is
 * an apiError() payload with a `code` and the `field`.
 */

const { apiError } = require("./apiError");
const { isReservedUsername } = require("./usernamePolicy");

const LIMITS = Object.freeze({ displayName: 32, bio: 190, customStatus: 128 });
const FONT_SIZES = new Set(["small", "medium", "large"]);
const WORD_RE = /^[a-z][a-z-]{0,23}$/;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const PROFILE_VISIBILITY = new Set(["everyone", "friends", "nobody"]);
// Line breaks are allowed in a bio only; other control characters and bidi overrides never.
const CONTROL_RE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f‪-‮⁦-⁩]/g;

function fail(field, template, vars = {}, code = "INVALID_PROFILE_VALUE") {
  return { ok: false, status: 400, body: apiError(template, vars, { code, field }) };
}

function isOwnMediaUrl(url, env = process.env) {
  if (typeof url !== "string" || url.length > 600) return false;
  // Quotes, brackets, whitespace and control characters never appear in our upload URLs;
  // they let a value break out of CSS url() (same rule as server images, DF-3).
  if (/["'()\\\s<>`]|[\u0000-\u001f\u007f]/.test(url)) return false;
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || u.username || u.password) return false;
  let supabaseHost = null;
  try {
    if (env.SUPABASE_URL) supabaseHost = new URL(env.SUPABASE_URL).host;
  } catch {
    /* ignore */
  }
  const mediaHosts = String(env.MEDIA_HOSTS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (mediaHosts.includes(u.host)) return true;
  if (supabaseHost && u.host === supabaseHost && u.pathname.startsWith("/storage/v1/object/")) return true;
  return /\.supabase\.co$/.test(u.host) && u.pathname.startsWith("/storage/v1/object/");
}

function cleanText(raw, { multiline = false } = {}) {
  let s = String(raw).replace(CONTROL_RE, "");
  s = multiline ? s.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n") : s.replace(/[\r\n\t]+/g, " ");
  return s.trim();
}

/**
 * Text field: null / "" clears it (displayName → null, bio / status → ""), a string is
 * cleaned and length-checked, anything else is refused.
 */
function textField(field, raw, { multiline = false, nullWhenEmpty = false } = {}) {
  if (raw === null || raw === "") return { ok: true, value: nullWhenEmpty ? null : "" };
  if (typeof raw !== "string") return fail(field, "Invalid profile value.");
  const value = cleanText(raw, { multiline });
  const max = LIMITS[field];
  if (value.length > max) {
    const template = field === "displayName"
      ? "Display name must be {max} characters or fewer."
      : field === "bio"
        ? "Bio must be {max} characters or fewer."
        : "Status must be {max} characters or fewer.";
    return fail(field, template, { max }, "TOO_LONG");
  }
  if (!value) return { ok: true, value: nullWhenEmpty ? null : "" };
  return { ok: true, value };
}

function displayNameField(raw, { isAdmin = false, filterCheck = null } = {}) {
  const r = textField("displayName", raw, { nullWhenEmpty: true });
  if (!r.ok || r.value == null) return r;
  // Look-alike staff names ("admin", "descall", "support" ...) stay reserved for display names too.
  if (!isAdmin && isReservedUsername(r.value.replace(/\s+/g, ""))) {
    return fail("displayName", "That display name is not allowed.", {}, "DISPLAY_NAME_RESERVED");
  }
  if (filterCheck) {
    const verdict = filterCheck(r.value);
    if (verdict && verdict.block) return fail("displayName", "That display name is not allowed.", {}, "DISPLAY_NAME_BLOCKED");
  }
  return r;
}

/** avatarUrl / bannerUrl: "" or null clears, otherwise only a Descall upload URL. */
function imageField(field, raw, env = process.env) {
  if (raw === null || raw === "") return { ok: true, value: null };
  if (typeof raw !== "string" || !isOwnMediaUrl(raw.trim(), env)) {
    return fail(field, "{field} must be an image uploaded to Descall.", { field }, "INVALID_IMAGE_URL");
  }
  return { ok: true, value: raw.trim() };
}

function enumField(field, raw, allowed) {
  if (typeof raw === "string" && allowed.has(raw)) return { ok: true, value: raw };
  return fail(field, "Invalid profile value.");
}

function wordField(field, raw) {
  if (typeof raw === "string" && WORD_RE.test(raw)) return { ok: true, value: raw };
  return fail(field, "Invalid profile value.");
}

function colorField(field, raw) {
  if (raw === null || raw === "") return { ok: true, value: null };
  if (typeof raw === "string" && HEX_RE.test(raw)) return { ok: true, value: raw.toUpperCase() };
  return fail(field, "Invalid profile value.");
}

function boolField(field, raw) {
  if (typeof raw === "boolean") return { ok: true, value: raw };
  return fail(field, "Invalid profile value.");
}

function volumeField(field, raw) {
  const n = typeof raw === "number" ? raw : NaN;
  if (Number.isFinite(n) && n >= 0 && n <= 100) return { ok: true, value: n };
  return fail(field, "Invalid profile value.");
}

function timezoneField(field, raw) {
  if (typeof raw !== "string" || !raw || raw.length > 64) return fail(field, "Invalid profile value.");
  try {
    new Intl.DateTimeFormat("en", { timeZone: raw });
    return { ok: true, value: raw };
  } catch {
    return fail(field, "Invalid profile value.");
  }
}

/**
 * PUT /api/user/profile body → users patch. A value equal to the stored one is kept as is
 * (forms resend the whole profile, and older rows may predate these rules).
 * @returns {{ ok: true, patch: object } | { ok: false, status: number, body: object }}
 */
function buildProfilePatch(body, current = {}, { isAdmin = false, filterCheck = null, env = process.env } = {}) {
  const b = body && typeof body === "object" ? body : {};
  const patch = {};
  const same = (raw, stored) => (raw ?? "") === (stored ?? "");
  const steps = [
    ["displayName", "display_name", (raw) => displayNameField(raw, { isAdmin, filterCheck })],
    ["bio", "bio", (raw) => textField("bio", raw, { multiline: true })],
    ["customStatus", "custom_status", (raw) => textField("customStatus", raw)],
    ["avatarUrl", "avatar_url", (raw) => imageField("avatarUrl", raw, env)],
    ["bannerUrl", "banner_url", (raw) => imageField("bannerUrl", raw, env)],
    ["accentColor", "accent_color", (raw) => colorField("accentColor", raw)],
    ["fontSize", "font_size", (raw) => enumField("fontSize", raw, FONT_SIZES)],
    ["uiDensity", "ui_density", (raw) => wordField("uiDensity", raw)],
    ["bubbleStyle", "bubble_style", (raw) => wordField("bubbleStyle", raw)],
  ];
  for (const [key, column, check] of steps) {
    if (b[key] === undefined) continue;
    if (typeof b[key] === "string" && same(b[key], current[column])) continue;
    const r = check(b[key]);
    if (!r.ok) return r;
    patch[column] = r.value;
  }
  if (["display_name", "bio", "custom_status", "avatar_url"].some((c) => c in patch)) {
    patch.updated_at = new Date().toISOString();
  }
  return { ok: true, patch };
}

/** Body → patch for the boolean / enum settings endpoints (notifications, privacy). */
function buildSettingsPatch(body, spec) {
  const b = body && typeof body === "object" ? body : {};
  const patch = {};
  for (const [key, [column, check]] of Object.entries(spec)) {
    if (b[key] === undefined) continue;
    const r = check(key, b[key]);
    if (!r.ok) return r;
    patch[column] = r.value;
  }
  return { ok: true, patch };
}

const NOTIFICATION_SETTINGS = Object.freeze({
  soundEnabled: ["sound_enabled", boolField],
  soundVolume: ["sound_volume", volumeField],
  desktopNotifications: ["desktop_notifications", boolField],
  callNotifications: ["call_notifications", boolField],
  mentionNotifications: ["mention_notifications", boolField],
});

const PRIVACY_SETTINGS = Object.freeze({
  onlineStatusVisible: ["online_status_visible", boolField],
  lastSeenVisible: ["last_seen_visible", boolField],
  typingIndicatorVisible: ["typing_indicator_visible", boolField],
  profileVisibleTo: ["profile_visible_to", (field, raw) => enumField(field, raw, PROFILE_VISIBILITY)],
  allowFriendRequests: ["allow_friend_requests", boolField],
  allowGroupInvites: ["allow_group_invites", boolField],
});

module.exports = {
  LIMITS,
  FONT_SIZES,
  PROFILE_VISIBILITY,
  isOwnMediaUrl,
  textField,
  displayNameField,
  imageField,
  enumField,
  wordField,
  colorField,
  boolField,
  volumeField,
  timezoneField,
  buildProfilePatch,
  buildSettingsPatch,
  NOTIFICATION_SETTINGS,
  PRIVACY_SETTINGS,
};
