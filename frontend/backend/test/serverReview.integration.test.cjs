"use strict";

/**
 * Sunucu inceleme (admin section serverReview) over real HTTP with the fake
 * Supabase: metadata-only list / detail / members, the section is sensitive
 * (legacy and DM-only admins get 403), channel content only through the POST
 * view with purpose + reason >= 10 + step-up code, every view audited with the
 * purpose, reason, server, channel and range, paging never leaves the channel,
 * no GET thread, scoped message delete, directory / invite / delete actions
 * audited, server delete needs the typed name.
 */

process.env.NODE_ENV = "test";
process.env.PASSWORD_HIBP = "0";
process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.JWT_EXPIRES_IN = "7d";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";

const http = require("http");
const { createFakeSupabase } = require("./fakeSupabase.cjs");

const SECRET = "SECRET-PAYLOAD-7f3a";
const OTHER_SECRET = "OTHER-CHANNEL-91bc";
const SNIPPET_SECRET = "REPORT-SNIPPET-55aa";

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const OWNER = id(1); // the Descall owner account "admin"
const SRADMIN = id(2); // admin granted serverReview
const DMADMIN = id(3); // admin granted dmReview only
const LEGACY = id(4); // admin from before 3.3.0 (admin_permissions NULL)
const KAAN = id(10); // server owner
const ELIF = id(11); // server moderator (ADMINISTRATOR role)
const ZEYNEP = id(12); // member
const REPORTER = id(13);
const S1 = id(100);
const S2 = id(101);
const C_CAT = id(200);
const C_GENEL = id(201);
const C_KURAL = id(202);
const C_VOICE = id(203);
const C_OTHER = id(204); // channel of S2
const R_EVERY = id(300);
const R_ADMIN = id(301);
const R_MEMBER = id(302);

const TOTP_ON = { totp_enabled_at: "2026-10-01T00:00:00.000Z", totp_secret_enc: "enc" };
function user(uid, username, extra = {}) {
  return {
    id: uid,
    username,
    display_name: username,
    email: `${username}@example.com`,
    email_confirmed_at: "2026-01-01T00:00:00.000Z",
    is_admin: false,
    is_banned: false,
    active_sessions: [{ id: `s-${username}` }],
    birth_date: "1990-01-01",
    ...extra,
  };
}

const now = Date.now();
const ago = (days) => new Date(now - days * 86400000).toISOString();
const msg = (n, channel, server, sender, content, days, extra = {}) => ({
  id: id(1000 + n),
  server_id: server,
  channel_id: channel,
  sender_id: sender,
  content,
  media_url: null,
  media_type: null,
  reply_to: null,
  created_at: ago(days),
  updated_at: ago(days),
  edited_at: null,
  pinned_at: null,
  pinned_by: null,
  message_type: "text",
  system_kind: null,
  edit_history: [],
  ...extra,
});

const fake = createFakeSupabase({
  users: [
    user(OWNER, "admin", { is_admin: true, ...TOTP_ON }),
    user(SRADMIN, "sradmin", { is_admin: true, admin_permissions: ["serverReview", "moderation"], ...TOTP_ON }),
    user(DMADMIN, "dmadmin", { is_admin: true, admin_permissions: ["dmReview"], ...TOTP_ON }),
    user(LEGACY, "legacy", { is_admin: true, admin_permissions: null, ...TOTP_ON }),
    user(KAAN, "kaan"),
    user(ELIF, "elif"),
    user(ZEYNEP, "zeynep"),
    user(REPORTER, "reporter"),
  ],
  servers: [
    {
      id: S1,
      name: "Gece Pazari",
      icon_url: null,
      banner_url: null,
      description: "Herkese acik pazar",
      owner_id: KAAN,
      vanity_slug: null,
      is_public: true,
      community_enabled: false,
      created_at: ago(3),
      updated_at: ago(1),
      listed_in_directory: true,
      directory_category: "other",
      directory_language: "tr",
      directory_description: "Pazar",
      directory_tags: ["pazar"],
      directory_listed_at: ago(2),
      directory_invite_code: "pazar01",
      directory_hidden_at: null,
      directory_hidden_reason: null,
    },
    { id: S2, name: "Kitap Kulubu", owner_id: ELIF, is_public: false, community_enabled: false, created_at: ago(400), listed_in_directory: false, directory_hidden_at: null },
  ],
  server_members: [
    { server_id: S1, user_id: KAAN, nickname: null, joined_at: ago(3) },
    { server_id: S1, user_id: ELIF, nickname: "Elo", joined_at: ago(2) },
    { server_id: S1, user_id: ZEYNEP, nickname: null, joined_at: ago(1) },
    { server_id: S2, user_id: ELIF, nickname: null, joined_at: ago(400) },
  ],
  server_roles: [
    { id: R_EVERY, server_id: S1, name: "@everyone", color: 0, position: 0, permissions: "3072", is_everyone: true },
    { id: R_ADMIN, server_id: S1, name: "Yonetim", color: 16711680, position: 2, permissions: "8", is_everyone: false },
    { id: R_MEMBER, server_id: S1, name: "Uye", color: 255, position: 1, permissions: "2048", is_everyone: false },
  ],
  server_member_roles: [
    { server_id: S1, user_id: ELIF, role_id: R_ADMIN },
    { server_id: S1, user_id: ZEYNEP, role_id: R_MEMBER },
  ],
  server_channels: [
    { id: C_CAT, server_id: S1, name: "Sohbet", type: "category", position: 0, parent_id: null, nsfw: false, created_at: ago(3) },
    { id: C_GENEL, server_id: S1, name: "genel", type: "text", position: 1, parent_id: C_CAT, nsfw: false, created_at: ago(3) },
    { id: C_KURAL, server_id: S1, name: "kurallar", type: "text", position: 0, parent_id: C_CAT, nsfw: false, created_at: ago(3) },
    { id: C_VOICE, server_id: S1, name: "Ses", type: "voice", position: 2, parent_id: null, nsfw: false, created_at: ago(3) },
    { id: C_OTHER, server_id: S2, name: "kitaplar", type: "text", position: 0, parent_id: null, nsfw: false, created_at: ago(400) },
  ],
  server_messages: [
    msg(1, C_GENEL, S1, KAAN, `${SECRET} first`, 2.5),
    msg(2, C_GENEL, S1, ZEYNEP, `${SECRET} second`, 2.0, { edited_at: ago(1.9), edit_history: [{ text: "secnd draft", editedAt: ago(1.9) }] }),
    msg(3, C_GENEL, S1, KAAN, `${SECRET} third`, 1.5, { pinned_at: ago(1), pinned_by: ELIF }),
    msg(4, C_GENEL, S1, ZEYNEP, "", 1.0, { media_url: "sb://media-private/images/abc.png", media_type: "image" }),
    msg(5, C_GENEL, S1, KAAN, `${SECRET} fifth`, 0.5),
    msg(6, C_KURAL, S1, KAAN, `${SECRET} rules`, 2.9),
    msg(7, C_OTHER, S2, ELIF, `${OTHER_SECRET} books`, 0.2),
  ],
  server_invites: [
    { code: "pazar01", server_id: S1, creator_id: KAAN, channel_id: C_GENEL, uses: 40, max_uses: null, max_age_seconds: null, temporary: false, created_at: ago(3), expires_at: null },
    { code: "elif02", server_id: S1, creator_id: ELIF, channel_id: null, uses: 3, max_uses: 3, max_age_seconds: null, temporary: false, created_at: ago(2), expires_at: null },
    { code: "kitap", server_id: S2, creator_id: ELIF, channel_id: null, uses: 0, max_uses: null, max_age_seconds: null, temporary: false, created_at: ago(300), expires_at: null },
  ],
  server_audit_logs: [
    { id: id(500), server_id: S1, actor_id: ELIF, action: "MEMBER_BAN", target_type: "user", target_id: REPORTER, changes: null, reason: "spam", created_at: ago(1) },
    { id: id(501), server_id: S1, actor_id: KAAN, action: "ROLE_CREATE", target_type: "role", target_id: R_ADMIN, changes: { name: "Yonetim" }, reason: null, created_at: ago(3) },
  ],
  server_bans: [{ server_id: S1, user_id: REPORTER, moderator_id: ELIF, reason: "spam", created_at: ago(1) }],
  user_reports: [
    // About a message of S1 (context id = message id) and about a member of S1.
    { id: id(600), reporter_id: REPORTER, target_id: ZEYNEP, reason: "illegal", note: "selling things", context_type: "server", context_id: id(1002), snippet: SNIPPET_SECRET, status: "open", created_at: ago(1) },
    { id: id(601), reporter_id: REPORTER, target_id: KAAN, reason: "spam", note: null, context_type: "profile", context_id: null, snippet: null, status: "open", created_at: ago(0.5) },
  ],
  server_deletion_log: [],
});
const supabasePath = require.resolve("../db/supabase");
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };

const express = require("express");
const { signToken, signStepUpToken } = require("../config/jwt");
const adminRouter = require("../routes/admin");
const state = require("../runtime/sharedState");

function assert(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
}

const emitted = [];
const io = {
  to(room) {
    return { emit: (event, payload) => emitted.push({ room, event, payload }) };
  },
  in() {
    return { fetchSockets: async () => [] };
  },
  sockets: { sockets: new Map() },
};

async function startServer() {
  const app = express();
  app.use(express.json());
  app.set("io", io);
  app.use("/api/admin", adminRouter);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

async function call(base, method, path, { body, token, stepUp } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(stepUp ? { "X-Admin-Step-Up": stepUp } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const raw = await res.text();
  let json = {};
  try {
    json = JSON.parse(raw);
  } catch {
    json = {};
  }
  return { status: res.status, body: json, raw };
}

const session = (uid, username) => signToken({ id: uid, username, sid: `s-${username}` });
const stepUpFor = (uid, username) => signStepUpToken({ id: uid, sid: `s-${username}` });
const lastAudit = (action) => state.auditLog.find((e) => e.action === action);

async function run() {
  const { server, base } = await startServer();
  const owner = session(OWNER, "admin");
  const ownerStep = stepUpFor(OWNER, "admin");
  const sr = session(SRADMIN, "sradmin");
  const srStep = stepUpFor(SRADMIN, "sradmin");
  const P = "/api/admin/server-review/servers";
  try {
    /* ---- 1. section: sensitive, never by the legacy default, not implied by DM review ---- */
    let r = await call(base, "GET", P, { token: session(DMADMIN, "dmadmin") });
    assert(r.status === 403 && r.body.code === "ADMIN_PERMISSION_DENIED" && r.body.section === "serverReview", "DM-only admin refused " + r.raw);
    r = await call(base, "GET", P, { token: session(LEGACY, "legacy") });
    assert(r.status === 403 && r.body.section === "serverReview", "legacy admin refused");
    r = await call(base, "GET", P, { token: session(KAAN, "kaan") });
    assert(r.status === 403, "non-admin refused");

    /* ---- 2. list: metadata only, reports attributed, risk ---- */
    r = await call(base, "GET", P, { token: sr });
    assert(r.status === 200, "list " + r.raw);
    assert(!r.raw.includes(SECRET) && !r.raw.includes(OTHER_SECRET) && !r.raw.includes(SNIPPET_SECRET), "list carries no message text");
    assert(!/"content"|"snippet"|"description"/.test(r.raw), "list has no content fields");
    assert(r.body.total === 2 && r.body.summary.total === 2, "both servers listed");
    const s1 = r.body.servers.find((s) => s.id === S1);
    assert(r.body.servers[0].id === S1, "risk sort puts the reported server first");
    assert(s1.reports.server === 1 && s1.reports.members === 1, "message report -> server, profile report about the owner -> member " + JSON.stringify(s1.reports));
    assert(s1.members === 3 && s1.channels === 3 && s1.messages.d7 === 6 && s1.joins7d === 3, "counts " + JSON.stringify(s1));
    assert(s1.owner.username === "kaan" && s1.directory.listed && !s1.directory.hidden, "owner + directory");
    assert(s1.risk.factors.includes("serverReports") && s1.risk.factors.includes("directoryListed"), "risk factors " + JSON.stringify(s1.risk));
    assert(s1.modEvents7d === 1, "moderation events");
    assert(r.body.approximate === false, "fallback scans were complete");
    r = await call(base, "GET", `${P}?q=kitap`, { token: sr });
    assert(r.body.servers.length === 1 && r.body.servers[0].id === S2, "search by name");
    r = await call(base, "GET", `${P}?q=@kaan`, { token: sr });
    assert(r.body.servers.length === 1 && r.body.servers[0].id === S1, "search by owner username");
    r = await call(base, "GET", `${P}?filter=reported`, { token: sr });
    assert(r.body.servers.map((s) => s.id).join() === S1, "reported filter");

    /* ---- 3. detail + members: metadata only ---- */
    r = await call(base, "GET", `${P}/${S1}`, { token: sr });
    assert(r.status === 200, "detail " + r.raw);
    assert(!r.raw.includes(SECRET) && !r.raw.includes(SNIPPET_SECRET), "detail carries no message text or report snippet");
    assert(r.body.owner.username === "kaan", "owner");
    assert(r.body.staff.length === 1 && r.body.staff[0].username === "elif" && r.body.staff[0].permissions.join() === "ADMINISTRATOR", "staff = dangerous roles " + JSON.stringify(r.body.staff));
    const cat = r.body.channels.categories[0];
    assert(cat.children.map((c) => c.name).join() === "kurallar,genel", "channels tree in position order");
    assert(cat.children[1].messages === 5 && cat.children[1].lastAt, "per-channel count + last activity");
    assert(r.body.channels.loose[0].type === "voice", "loose voice channel");
    assert(r.body.invites.length === 2 && r.body.invites.find((i) => i.code === "elif02").state === "used", "invites with state");
    assert(r.body.invites.find((i) => i.code === "pazar01").isDirectoryInvite, "directory invite flagged");
    assert(r.body.audit.length === 2 && r.body.audit[0].action === "MEMBER_BAN", "server audit log");
    assert(r.body.reports.length === 2 && r.body.reports.every((x) => !("snippet" in x)), "reports without snippet");
    assert(r.body.directory.listed && r.body.directory.inviteCode === "pazar01", "directory info");
    assert(r.body.stats.members === 3 && r.body.stats.bans === 1, "stats");
    r = await call(base, "GET", `${P}/${S1}/members`, { token: sr });
    assert(r.status === 200 && r.body.total === 3 && r.body.members[0].username === "zeynep" && r.body.members[0].joinedAt, "members newest first with join date");
    assert(r.body.members.find((m) => m.username === "kaan").isOwner, "owner flagged");
    assert(r.body.members.find((m) => m.username === "elif").staff.join() === "ADMINISTRATOR", "staff flagged");
    r = await call(base, "GET", `${P}/${S1}/members?q=zey`, { token: sr });
    assert(r.body.members.length === 1 && r.body.members[0].username === "zeynep", "member search");
    r = await call(base, "GET", `${P}/not-a-uuid`, { token: sr });
    assert(r.status === 400, "invalid id");

    /* ---- 4. content: POST view only, step-up, purpose, reason ---- */
    const VIEW = `${P}/${S1}/channels/${C_GENEL}/view`;
    r = await call(base, "GET", VIEW, { token: sr });
    assert(r.status === 404, "no GET thread route");
    r = await call(base, "GET", `${P}/${S1}/channels/${C_GENEL}/messages`, { token: sr });
    assert(r.status === 404, "no GET messages route");
    r = await call(base, "GET", `${P}/${S1}/export`, { token: sr });
    assert(r.status === 404 && !r.raw.includes(SECRET), "no export");
    r = await call(base, "POST", VIEW, { token: sr, body: { purpose: "report", reason: "Report about illegal sales" } });
    assert(r.status === 403 && r.body.code === "STEP_UP_REQUIRED", "step-up required " + r.raw);
    const auditsBefore = state.auditLog.filter((e) => e.action === "server_channel_view").length;
    r = await call(base, "POST", VIEW, { token: sr, stepUp: srStep, body: { purpose: "curious", reason: "Report about illegal sales" } });
    assert(r.status === 400 && r.body.code === "SERVER_VIEW_PURPOSE", "purpose required");
    r = await call(base, "POST", VIEW, { token: sr, stepUp: srStep, body: { purpose: "report", reason: "too short" } });
    assert(r.status === 400 && r.body.code === "SERVER_VIEW_REASON", "reason >= 10");
    assert(state.auditLog.filter((e) => e.action === "server_channel_view").length === auditsBefore, "refused views are not content and not audited as views");

    r = await call(base, "POST", VIEW, { token: sr, stepUp: srStep, body: { purpose: "report", reason: "Report 600 about illegal sales", limit: 3 } });
    assert(r.status === 200, "view " + r.raw);
    assert(r.raw.includes(SECRET) && !r.raw.includes(OTHER_SECRET) && !r.raw.includes(`${SECRET} rules`), "only the opened channel");
    assert(r.body.messages.length === 3 && r.body.hasMore === true && r.body.direction === "latest", "latest page");
    assert(r.body.messages.map((m) => m.id).join() === [id(1003), id(1004), id(1005)].join(), "oldest -> newest");
    const img = r.body.messages.find((m) => m.kind === "image");
    assert(img && /\/api\/media\/f\/images\/abc\.png\?e=/.test(img.mediaUrl) || img?.mediaUrl === "sb://media-private/images/abc.png", "image attachment ref " + img?.mediaUrl);
    assert(r.body.messages[0].pinnedAt && r.body.messages[0].pinnedBy === "elif", "pinned state");
    let a = lastAudit("server_channel_view");
    assert(a && a.actorId === SRADMIN && a.meta.purpose === "report" && a.meta.reason === "Report 600 about illegal sales", "audit purpose + reason");
    assert(a.meta.server === S1 && a.meta.channel === C_GENEL && a.meta.serverName === "Gece Pazari" && a.meta.channelName === "genel", "audit server + channel");
    assert(a.meta.range.direction === "latest" && a.meta.range.count === 3 && a.meta.range.from && a.meta.range.to, "audit range " + JSON.stringify(a.meta.range));

    // Older page inside the same channel only.
    r = await call(base, "POST", VIEW, { token: sr, stepUp: srStep, body: { purpose: "report", reason: "Report 600 about illegal sales", before: r.body.messages[0].timestamp, limit: 3 } });
    assert(r.status === 200 && r.body.direction === "older" && r.body.messages.map((m) => m.id).join() === [id(1001), id(1002)].join() && r.body.hasMore === false, "older page " + r.raw);
    const edited = r.body.messages.find((m) => m.id === id(1002));
    assert(edited.editedAt && edited.edits.length === 1 && edited.edits[0].text === "secnd draft", "edit history shown");
    a = lastAudit("server_channel_view");
    assert(a.meta.range.direction === "older" && a.meta.range.count === 2, "each page audited with its range");
    r = await call(base, "POST", VIEW, { token: sr, stepUp: srStep, body: { purpose: "security", reason: "Checking for newer messages", after: edited.timestamp, limit: 2 } });
    assert(r.status === 200 && r.body.direction === "newer" && r.body.messages.map((m) => m.id).join() === [id(1003), id(1004)].join() && r.body.hasMore, "newer page");

    // A channel of another server is never reachable through this server.
    r = await call(base, "POST", `${P}/${S1}/channels/${C_OTHER}/view`, { token: sr, stepUp: srStep, body: { purpose: "report", reason: "Trying another server" } });
    assert(r.status === 404 && !r.raw.includes(OTHER_SECRET), "channel must belong to the server");
    r = await call(base, "POST", `${P}/${S1}/channels/${C_CAT}/view`, { token: sr, stepUp: srStep, body: { purpose: "report", reason: "A category has no text" } });
    assert(r.status === 400, "category refused");

    /* ---- 5. message delete scoped to its channel ---- */
    r = await call(base, "DELETE", `${P}/${S1}/channels/${C_KURAL}/messages/${id(1001)}`, { token: sr, stepUp: srStep });
    assert(r.status === 404, "message of another channel not deleted");
    r = await call(base, "DELETE", `${P}/${S2}/channels/${C_GENEL}/messages/${id(1001)}`, { token: sr, stepUp: srStep });
    assert(r.status === 404, "message of another server not deleted");
    assert(fake._tables.server_messages.rows.some((m) => m.id === id(1001)), "still there");
    r = await call(base, "DELETE", `${P}/${S1}/channels/${C_GENEL}/messages/${id(1001)}`, { token: sr });
    assert(r.status === 403 && r.body.code === "STEP_UP_REQUIRED", "delete needs step-up");
    r = await call(base, "DELETE", `${P}/${S1}/channels/${C_GENEL}/messages/${id(1001)}`, { token: sr, stepUp: srStep });
    assert(r.status === 200 && !fake._tables.server_messages.rows.some((m) => m.id === id(1001)), "scoped delete");
    a = lastAudit("server_msg_delete");
    assert(a.target === id(1001) && a.meta.server === S1 && a.meta.channel === C_GENEL, "delete audited");
    assert(emitted.some((e) => e.room === `server-channel:${C_GENEL}` && e.event === "server:channel:message:deleted"), "open clients told");

    /* ---- 6. directory hide / show ---- */
    r = await call(base, "POST", `${P}/${S1}/directory`, { token: sr, stepUp: srStep, body: { hidden: true, reason: "Illegal sales listing" } });
    assert(r.status === 200 && r.body.hidden === true, "hide " + r.raw);
    const row = fake._tables.servers.rows.find((s) => s.id === S1);
    assert(row.directory_hidden_at && row.directory_hidden_reason === "Illegal sales listing", "hidden fields set");
    assert(lastAudit("server_directory_hide").meta.note === "Illegal sales listing", "hide audited");
    r = await call(base, "GET", `${P}?filter=hidden&refresh=1`, { token: sr });
    assert(r.body.servers.map((s) => s.id).join() === S1, "list refreshed after hide");
    r = await call(base, "POST", `${P}/${S1}/directory`, { token: sr, stepUp: srStep, body: { hidden: false } });
    assert(r.status === 200 && !fake._tables.servers.rows.find((s) => s.id === S1).directory_hidden_at && lastAudit("server_directory_show"), "show again");

    // Hiding the server took its permanent directory invite with it (server audit IM-13).
    assert(!fake._tables.server_invites.rows.some((i) => i.code === "pazar01"), "directory invite removed on hide");
    assert(!fake._tables.servers.rows.find((s) => s.id === S1).directory_invite_code, "directory invite column cleared");
    fake._tables.server_invites.rows.push({ code: "pazar01", server_id: S1, creator_id: KAAN, channel_id: C_GENEL, uses: 40, max_uses: null, max_age_seconds: null, temporary: false, created_at: ago(3), expires_at: null });

    /* ---- 7. invites ---- */
    r = await call(base, "DELETE", `${P}/${S2}/invites/pazar01`, { token: sr, stepUp: srStep });
    assert(r.status === 404, "invite of another server");
    r = await call(base, "DELETE", `${P}/${S1}/invites/pazar01`, { token: sr, stepUp: srStep });
    assert(r.status === 200 && !fake._tables.server_invites.rows.some((i) => i.code === "pazar01"), "invite deleted");
    assert(lastAudit("server_invite_delete").meta.code === "pazar01", "invite delete audited");
    r = await call(base, "POST", `${P}/${S1}/invites/revoke-all`, { token: sr, stepUp: srStep });
    assert(r.status === 200 && r.body.removed === 1, "revoke all");
    assert(fake._tables.server_invites.rows.map((i) => i.code).join() === "kitap", "only this server's invites");
    assert(lastAudit("server_invites_revoke").meta.removed === 1, "revoke audited");

    /* ---- 8. delete the server: typed name + reason ---- */
    r = await call(base, "DELETE", `${P}/${S1}`, { token: owner, stepUp: ownerStep, body: { confirmName: "gece pazari", reason: "Illegal marketplace confirmed" } });
    assert(r.status === 400 && r.body.code === "SERVER_DELETE_CONFIRM", "exact name");
    r = await call(base, "DELETE", `${P}/${S1}`, { token: owner, stepUp: ownerStep, body: { confirmName: "Gece Pazari", reason: "short" } });
    assert(r.status === 400 && r.body.code === "SERVER_DELETE_REASON", "reason required");
    assert(fake._tables.servers.rows.some((s) => s.id === S1), "not deleted yet");
    r = await call(base, "DELETE", `${P}/${S1}`, { token: owner, stepUp: ownerStep, body: { confirmName: "Gece Pazari", reason: "Illegal marketplace confirmed" } });
    assert(r.status === 200 && r.body.ok, "deleted " + r.raw);
    assert(!fake._tables.servers.rows.some((s) => s.id === S1), "server row gone");
    const log = fake._tables.server_deletion_log.rows[0];
    assert(log && log.via === "admin" && log.actor_id === OWNER, "deletion log through lib/serverDeletion");
    a = lastAudit("server_delete");
    assert(a.target === S1 && a.meta.reason === "Illegal marketplace confirmed" && a.meta.name === "Gece Pazari", "delete audited");
    assert(emitted.some((e) => e.event === "server:deleted"), "members told");

    console.log("serverReview.integration: ok");
  } finally {
    server.close();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
