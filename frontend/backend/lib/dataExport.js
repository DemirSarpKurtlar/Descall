"use strict";

/**
 * KVKK veri dışa aktarma (3.6.0): everything Descall keeps about one account,
 * as one JSON file (KVKK md. 11 / GDPR art. 15 + 20). Used by the account
 * owner (Ayarlar › Gizlilik › Verilerimi indir) and by admins (Kişiler ›
 * dosya › KVKK dışa aktarma).
 *
 * What is in it: the profile and settings, sessions, friends and blocks, the
 * messages the person SENT (DM, group, server), reactions, memberships,
 * DesCoin / shop / badges / promo history, activity, feedback, reports they
 * filed, reports about them (without who filed them) and moderation actions
 * taken against them.
 *
 * What is left out, and why (written into the file as `notes`):
 *  - secrets: password hash, two-factor secrets and recovery codes, reset /
 *    confirmation tokens, push tokens, device hashes;
 *  - other people's data: messages others sent, who reported the person,
 *    admin-only notes;
 *  - fraud and abuse prevention scoring (descoin_risk, device links), kept
 *    under KVKK md. 28/2 (ç) and not disclosed so it cannot be gamed.
 * Every section is capped (MAX_ROWS) and a missing table is reported, not fatal.
 */

const MAX_ROWS = 50000;
const PAGE = 1000;
const FORMAT_VERSION = 1;

let dbOverride = null;
const db = () => dbOverride || require("../db/supabase");

const PROFILE_COLS = [
  "id", "username", "display_name", "email", "email_confirmed_at", "birth_date", "bio", "custom_status",
  "avatar_url", "banner_url", "profile_background_url", "accent_color", "created_at", "signup_at", "language", "timezone",
  "auth_provider", "two_factor_enabled", "totp_enabled_at", "presence_status", "online_status", "descoin_balance",
  "descoin_streak", "descoin_last_daily_claim", "descoin_frozen", "signup_country", "signup_device", "signup_os",
  "signup_browser", "first_touch_source", "first_touch_medium", "first_touch_campaign", "first_touch_referrer",
  "first_touch_landing_page", "referred_by", "terms_accepted_at", "notifications_enabled", "sound_enabled",
  "sound_volume", "desktop_notifications", "mention_notifications", "call_notifications", "allow_friend_requests",
  "allow_group_invites", "profile_visible_to", "online_status_visible", "last_seen_visible",
  "typing_indicator_visible", "font_size", "ui_density", "bubble_style", "last_seen_at", "is_banned", "ban_category",
  "ban_reason", "ban_message", "banned_at", "ban_expires_at", "timeout_until", "timeout_category", "timeout_reason",
  "timeout_message", "deletion_requested_at", "blocked_users", "active_sessions",
];

const MISSING = new Set(["42P01", "42703", "PGRST205", "PGRST204"]);
const isMissing = (err) => MISSING.has(err?.code) || /does not exist|Could not find/i.test(String(err?.message || ""));

/** Read every row (paged, capped). Returns { rows, truncated, missing }. */
async function readAll(table, cols, filter, { order = "created_at" } = {}) {
  const rows = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    let q = db().from(table).select(cols);
    q = filter(q);
    if (order) q = q.order(order, { ascending: true });
    const res = await q.range(from, from + PAGE - 1);
    if (res.error) {
      if (isMissing(res.error)) return { rows, truncated: false, missing: true };
      throw res.error;
    }
    const page = res.data || [];
    rows.push(...page);
    if (page.length < PAGE) return { rows, truncated: false, missing: false };
  }
  return { rows, truncated: true, missing: false };
}

async function namesById(table, ids, col = "name") {
  const unique = [...new Set((ids || []).filter(Boolean).map(String))];
  if (!unique.length) return {};
  const out = {};
  for (let i = 0; i < unique.length; i += 500) {
    const res = await db().from(table).select(`id, ${col}`).in("id", unique.slice(i, i + 500));
    if (res.error) continue;
    for (const r of res.data || []) out[r.id] = r[col];
  }
  return out;
}

function cleanSessions(list) {
  return (Array.isArray(list) ? list : []).map((s) => ({
    device: s?.device || null,
    ip: s?.ip || null,
    createdAt: s?.createdAt || null,
    lastActiveAt: s?.lastActiveAt || null,
  }));
}

/** Drop secret-looking keys anywhere in a value (belt and braces for json columns). */
function scrub(value, depth = 0) {
  if (depth > 6 || value == null) return value;
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));
  if (typeof value !== "object") return value;
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (/password|secret|token|hash|recovery|otp|totp|stripe_session|p256dh|^auth$/i.test(k)) continue;
    out[k] = scrub(v, depth + 1);
  }
  return out;
}

/**
 * Build the export for one account.
 * @returns {Promise<{ filename: string, data: object }>}
 */
async function buildExport(userId, { requestedBy = "self", now = new Date() } = {}) {
  let prof = await db().from("users").select(PROFILE_COLS.join(", ")).eq("id", userId).maybeSingle();
  if (prof.error && isMissing(prof.error)) prof = await db().from("users").select("*").eq("id", userId).maybeSingle();
  if (prof.error) throw prof.error;
  const user = prof.data;
  if (!user) {
    const err = new Error("Kullanıcı bulunamadı.");
    err.status = 404;
    throw err;
  }

  const sections = {};
  const meta = {};
  const put = (key, res, map = (r) => r) => {
    sections[key] = res.rows.map(map).map((r) => scrub(r));
    meta[key] = { count: res.rows.length, truncated: res.truncated, available: !res.missing };
  };
  const eq = (col) => (q) => q.eq(col, userId);

  const { active_sessions: sessions, blocked_users: blocked, totp_enabled_at: totpOn, ...profile } = user;
  sections.profile = scrub({ ...profile, two_factor_app: Boolean(totpOn) });
  sections.sessions = cleanSessions(sessions);

  const blockedNames = await namesById("users", blocked, "username");
  sections.blockedUsers = (Array.isArray(blocked) ? blocked : []).map((id) => ({ userId: id, username: blockedNames[id] || null }));

  // Friends and requests (usernames resolved).
  const friends = await readAll("friendships", "friend_id, status, created_at", eq("user_id"));
  const reqOut = await readAll("friend_requests", "to_user_id, status, created_at", eq("from_user_id"));
  const reqIn = await readAll("friend_requests", "from_user_id, status, created_at", eq("to_user_id"));
  const people = await namesById("users", [...friends.rows.map((r) => r.friend_id), ...reqOut.rows.map((r) => r.to_user_id), ...reqIn.rows.map((r) => r.from_user_id)], "username");
  put("friends", friends, (r) => ({ username: people[r.friend_id] || null, status: r.status, since: r.created_at }));
  put("friendRequestsSent", reqOut, (r) => ({ to: people[r.to_user_id] || null, status: r.status, at: r.created_at }));
  put("friendRequestsReceived", reqIn, (r) => ({ from: people[r.from_user_id] || null, status: r.status, at: r.created_at }));

  // Messages the person sent.
  const dms = await readAll("dm_messages", "id, to_user_id, content, media_url, media_type, original_name, created_at, edited_at, reply_to", eq("from_user_id"));
  const dmPeers = await namesById("users", dms.rows.map((r) => r.to_user_id), "username");
  put("directMessagesSent", dms, (r) => ({ id: r.id, to: dmPeers[r.to_user_id] || r.to_user_id, content: r.content, media: r.media_url || null, mediaType: r.media_type || null, fileName: r.original_name || null, at: r.created_at, editedAt: r.edited_at || null }));

  const gms = await readAll("group_messages", "id, group_id, content, media_url, media_type, original_name, created_at, edited_at", eq("sender_id"));
  const memberships = await readAll("group_members", "group_id, role, joined_at", eq("user_id"), { order: "joined_at" });
  const groupNames = await namesById("groups", [...gms.rows.map((r) => r.group_id), ...memberships.rows.map((r) => r.group_id)]);
  put("groupMessagesSent", gms, (r) => ({ id: r.id, group: groupNames[r.group_id] || r.group_id, content: r.content, media: r.media_url || null, mediaType: r.media_type || null, fileName: r.original_name || null, at: r.created_at, editedAt: r.edited_at || null }));
  put("groups", memberships, (r) => ({ group: groupNames[r.group_id] || r.group_id, role: r.role, joinedAt: r.joined_at }));

  const sms = await readAll("server_messages", "id, server_id, channel_id, content, media_url, media_type, created_at, edited_at, message_type", (q) => q.eq("sender_id", userId));
  const serverMembers = await readAll("server_members", "server_id, nickname, joined_at, notification_level", eq("user_id"), { order: "joined_at" });
  const serverNames = await namesById("servers", [...sms.rows.map((r) => r.server_id), ...serverMembers.rows.map((r) => r.server_id)]);
  const channelNames = await namesById("server_channels", sms.rows.map((r) => r.channel_id));
  put("serverMessagesSent", sms, (r) => ({ id: r.id, server: serverNames[r.server_id] || r.server_id, channel: channelNames[r.channel_id] || r.channel_id, content: r.content, media: r.media_url || null, mediaType: r.media_type || null, at: r.created_at, editedAt: r.edited_at || null }));
  put("servers", serverMembers, (r) => ({ server: serverNames[r.server_id] || r.server_id, nickname: r.nickname || null, joinedAt: r.joined_at, notifications: r.notification_level || null }));
  put("serversOwned", await readAll("servers", "id, name, description, is_public, created_at", eq("owner_id")));

  put("reactions", await readAll("reactions", "emoji, conversation_type, message_id, created_at", eq("user_id")));
  put("pollVotes", await readAll("poll_votes", "poll_id, option_id, created_at", eq("user_id")));

  // Calls and voice.
  put("groupCalls", await readAll("group_call_participants", "call_id, joined_at, left_at", eq("user_id"), { order: "joined_at" }));
  put("serverVoice", await readAll("server_voice_sessions", "server_id, channel_id, joined_at, left_at, duration_seconds", eq("user_id"), { order: "joined_at" }));

  // DesCoin, shop, badges, promo, games.
  put("descoinLedger", await readAll("descoin_ledger", "amount, reason, message, balance_after, created_at", eq("user_id")));
  const inv = await readAll("user_inventory", "item_id, acquired_via, gift_message, acquired_at", eq("user_id"), { order: "acquired_at" });
  const purchases = await readAll("shop_purchases", "item_id, amount_descoin, amount_cents, currency, status, created_at", eq("user_id"));
  const itemNames = await namesById("shop_items", [...inv.rows.map((r) => r.item_id), ...purchases.rows.map((r) => r.item_id)]);
  put("inventory", inv, (r) => ({ item: itemNames[r.item_id] || r.item_id, via: r.acquired_via, giftMessage: r.gift_message || null, at: r.acquired_at }));
  put("purchases", purchases, (r) => ({ item: itemNames[r.item_id] || r.item_id, descoin: r.amount_descoin, cents: r.amount_cents, currency: r.currency, status: r.status, at: r.created_at }));
  put("specialBadges", await readAll("user_special_badges", "badge_id, serial, source, granted_at, equipped, revoked_at, revoke_reason", eq("user_id"), { order: "granted_at" }));
  put("promoRedemptions", await readAll("promo_redemptions", "code_id, reward, descoin_credited, created_at", eq("user_id")));
  put("games", await readAll("game_history", "game_type, bet_amount, result, win_amount, played_at", eq("user_id"), { order: "played_at" }));

  // Activity and settings.
  put("activity", await readAll("user_activity_log", "app_name, app_type, display_name, started_at, ended_at, duration_sec", eq("user_id"), { order: "started_at" }));
  put("activeDays", await readAll("user_active_days", "day", eq("user_id"), { order: "day" }));
  put("analyticsEvents", await readAll("analytics_events", "event, occurred_at, props", eq("user_id"), { order: "occurred_at" }));
  put("activitySettings", await readAll("user_activity_settings", "privacy, show_game_activity, show_app_activity, show_browser, show_descall_time, updated_at", eq("user_id"), { order: null }));
  put("appearanceSettings", await readAll("user_appearance_settings", "settings, updated_at", eq("user_id"), { order: null }));
  put("notificationPreferences", await readAll("notification_preferences", "dm, groups, calls, mentions, friend_requests", eq("user_id"), { order: null }));
  put("conversationPreferences", await readAll("dm_conversation_prefs", "peer_id, pinned, muted, hidden, updated_at", eq("user_id"), { order: null }));
  put("devices", await readAll("push_devices", "platform, created_at, last_seen", eq("user_id")));

  // Feedback, reports, moderation.
  put("feedback", await readAll("user_feedback", "category, subject, message, status, platform, app_version, admin_replies, created_at", eq("user_id")));
  const filed = await readAll("user_reports", "target_id, reason, note, context_type, snippet, status, resolution, created_at", eq("reporter_id"));
  const filedNames = await namesById("users", filed.rows.map((r) => r.target_id), "username");
  put("reportsFiled", filed, (r) => ({ about: filedNames[r.target_id] || null, reason: r.reason, note: r.note || null, context: r.context_type, snippet: r.snippet || null, status: r.status, outcome: r.resolution || null, at: r.created_at }));
  // Third-party fields (who reported, which admin acted) are dropped here too,
  // not only by the column list.
  put("reportsAboutYou", await readAll("user_reports", "reason, context_type, status, resolution, created_at", eq("target_id")), (r) => ({
    reason: r.reason, context: r.context_type, status: r.status, outcome: r.resolution || null, at: r.created_at,
  }));
  put("moderationActions", await readAll("moderation_actions", "action_type, category, reason, message, duration_seconds, expires_at, created_at, revoked_at", (q) => q.eq("target_user_id", userId)), (r) => ({
    action: r.action_type, category: r.category || null, reason: r.reason || null, message: r.message || null,
    durationSeconds: r.duration_seconds ?? null, expiresAt: r.expires_at || null, at: r.created_at, revokedAt: r.revoked_at || null,
  }));
  put("serverBans", await readAll("server_bans", "server_id, reason, created_at", eq("user_id")));

  const data = {
    format: "descall-data-export",
    version: FORMAT_VERSION,
    generatedAt: now.toISOString(),
    requestedBy,
    account: { id: user.id, username: user.username },
    notes: {
      tr: "Bu dosya Descall'ın hesabın hakkında tuttuğu kişisel verilerin kopyasıdır (KVKK md. 11). Gönderdiğin mesajlar burada; başkalarının sana gönderdiği mesajlar onların verisi olduğu için yok. Şifre, iki adımlı doğrulama sırları, oturum ve bildirim anahtarları güvenlik nedeniyle eklenmedi. Dolandırıcılık ve kötüye kullanım önleme kayıtları, kötüye kullanılmasın diye paylaşılmaz (KVKK md. 28/2-ç). Seni kimin şikayet ettiği gösterilmez. Sorular için: destek@descall.com",
      en: "A copy of the personal data Descall keeps about this account (GDPR art. 15). Messages you sent are included; messages others sent you are their data and are not. Passwords, two-factor secrets, session and push keys are left out for security. Fraud and abuse prevention records are not disclosed so they cannot be gamed. Who reported you is not shown.",
    },
    sections,
    sectionInfo: meta,
  };
  const day = now.toISOString().slice(0, 10);
  const safeName = String(user.username || "hesap").replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 40);
  return { filename: `descall-verilerim-${safeName}-${day}.json`, data };
}

function __setDbForTests(client) {
  dbOverride = client;
}

module.exports = { buildExport, scrub, cleanSessions, MAX_ROWS, FORMAT_VERSION, __setDbForTests };
