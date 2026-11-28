"use strict";

/**
 * Bug Avcısı over real HTTP with the fake Supabase (special badge RPCs emulated here):
 *  - section: an admin without "feedback" is refused; nobody confirms their own feedback
 *  - confirm: first credit, the EXISTING badge #11 granted with the admin grant path and its
 *    special_badge_grant audit entry (note bughunt:<id>), DesCoin bonus by severity
 *    (reason bug_bounty, idempotency key), thread card, live card + bell + balance, audit entry
 *  - idempotency: a second confirm of the same item pays nothing and writes no audit entry
 *  - duplicates: also-found credit (smaller bonus, counted apart, no badge), same reporter refused,
 *    the root cannot be undone while a duplicate is linked
 *  - tier upgrade: the 5th first credit levels the badge to II in place; profiles read the level
 *  - visual / UI bug: #32 glitch too; a critical bug is a severity, not a badge
 *  - starting history: today's holders (legacy_count) level up from it and are not re-announced
 *  - resolved: "Düzeltildi" once for the root and its duplicates (dup resolved too), no generic ping
 *  - undo: reason required, DesCoin back while unspent ("kept" when spent), void thread lines,
 *    badges this feature gave go back at 0 (glitch too), a promo-granted badge stays; re-confirm carries a kept bonus
 *  - İşlem kaydı: the confirm entry can be undone from the console (meta.undoOf)
 *  - sender side: GET /api/me/feedback/:id shows the card, hides undone rounds and admin names
 */

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";

const http = require("http");
const { createFakeSupabase } = require("./fakeSupabase.cjs");

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const OWNER = id(1);
const MODONLY = id(2);
const AYSE = id(10);
const MERT = id(11);
const DENIZ = id(12);
const PROMO = id(13);
const F = (n) => id(500 + n);

const TOTP_ON = { totp_enabled_at: "2026-10-01T00:00:00.000Z", totp_secret_enc: "enc" };
const user = (uid, username, extra = {}) => ({ id: uid, username, display_name: username, is_admin: false, is_banned: false, descoin_balance: 0, active_sessions: [{ id: `s-${username}` }], created_at: "2026-01-01T00:00:00.000Z", language: "tr", ...extra });
const feedback = (n, uid, username, extra = {}) => ({
  id: F(n), user_id: uid, username, category: "bug", kind: "bug", priority: "medium", status: "new", viewed: false,
  subject: `Hata ${n}`, message: `Hata ${n}: ses kesiliyor`, attachments: [], platform: "web", app_version: "3.8.0",
  admin_replies: [], created_at: `2026-11-${String(10 + (n % 15)).padStart(2, "0")}T10:00:00.000Z`, updated_at: "2026-11-20T10:00:00.000Z", ...extra,
});

const fake = createFakeSupabase({
  users: [
    user(OWNER, "admin", { is_admin: true, ...TOTP_ON }),
    user(MODONLY, "moddy", { is_admin: true, admin_permissions: ["moderation"], ...TOTP_ON }),
    user(AYSE, "ayse"),
    user(MERT, "mert"),
    user(DENIZ, "deniz"),
    user(PROMO, "promolu"),
  ],
  user_feedback: [
    feedback(1, AYSE, "ayse"),
    feedback(2, MERT, "mert"),
    feedback(3, AYSE, "ayse"),
    ...[4, 5, 6, 7].map((n) => feedback(n, AYSE, "ayse")),
    feedback(8, AYSE, "ayse"),
    feedback(9, DENIZ, "deniz"),
    feedback(10, PROMO, "promolu"),
    feedback(11, OWNER, "admin"),
    feedback(12, AYSE, "ayse", { status: "resolved" }),
  ],
  descoin_ledger: [],
  feedback_bug_reports: [],
  // Seeded by the migration for today's #11 holders: one earlier confirmed bug, no DesCoin.
  bug_hunter_levels: [{ user_id: id(13), level: 1, first_count: 0, also_count: 0, legacy_count: 1, legacy_since: "2026-11-01T00:00:00.000Z", since: "2026-11-01T00:00:00.000Z" }],
}, { uniqueKeys: { feedback_bug_reports: ["feedback_id"] }, missingTables: ["admin_audit_views", "admin_audit_rules", "admin_audit_reviews", "admin_audit_notes"] });

// Special badge RPCs (the rules of 20261026_special_badges.sql that this feature relies on).
const CATALOG = [{ id: "bughunter", no: 11, name: "Bug Hunter", tier: "epik", grantMode: "promo" }, { id: "glitch", no: 32, name: "Glitch", tier: "nadir", grantMode: "promo" }];
const badges = [];
let rowSeq = 0;
const live = (u, b) => badges.find((r) => r.user_id === u && r.badge_id === b && !r.revoked_at);
fake.rpc = async (name, a) => {
  switch (name) {
    case "special_badge_catalog":
      return { data: CATALOG.map((c) => ({ ...c, active: true, holders: badges.filter((r) => r.badge_id === c.id && !r.revoked_at).length })), error: null };
    case "special_badge_grant": {
      if (!CATALOG.some((c) => c.id === a.p_badge_id)) return { data: { ok: false, error: "badge_not_found" }, error: null };
      if (live(a.p_user_id, a.p_badge_id)) return { data: { ok: true, granted: false, error: "owned" }, error: null };
      const serial = badges.filter((r) => r.badge_id === a.p_badge_id).length + 1;
      const row = { id: id(9000 + ++rowSeq), user_id: a.p_user_id, badge_id: a.p_badge_id, serial, source: a.p_source, note: a.p_note, granted_by: a.p_actor_id, equipped: false, notified_at: null, revoked_at: null };
      badges.push(row);
      return { data: { ok: true, granted: true, serial, id: row.id }, error: null };
    }
    case "special_badge_revoke": {
      const row = live(a.p_user_id, a.p_badge_id);
      if (!row) return { data: { ok: false, error: "not_owned" }, error: null };
      Object.assign(row, { revoked_at: new Date().toISOString(), revoke_reason: a.p_reason, equipped: false, revoke_notified_at: null });
      return { data: { ok: true, serial: row.serial, wasEquipped: false }, error: null };
    }
    case "special_badge_pending":
      return { data: {
        granted: badges.filter((r) => r.user_id === a.p_user_id && !r.notified_at && !r.revoked_at).map((r) => ({ rowId: r.id, id: r.badge_id, serial: r.serial, via: r.source })),
        revoked: badges.filter((r) => r.user_id === a.p_user_id && r.revoked_at && !r.revoke_notified_at).map((r) => ({ rowId: r.id, id: r.badge_id, serial: r.serial, reason: r.revoke_reason })),
      }, error: null };
    case "special_badge_mark_notified": {
      let n = 0;
      for (const r of badges) {
        if (r.user_id !== a.p_user_id || !a.p_row_ids.includes(r.id)) continue;
        if (!r.revoked_at && !r.notified_at) { r.notified_at = new Date().toISOString(); n += 1; }
        if (r.revoked_at && !r.revoke_notified_at) { r.revoke_notified_at = new Date().toISOString(); n += 1; }
      }
      return { data: n, error: null };
    }
    case "special_badge_equipped_for":
      return { data: badges.filter((r) => a.p_user_ids.includes(r.user_id) && r.equipped && !r.revoked_at).map((r) => ({ userId: r.user_id, id: r.badge_id, serial: r.serial })), error: null };
    case "special_badge_user_badges":
      return { data: badges.filter((r) => r.user_id === a.p_user_id && !r.revoked_at).map((r) => ({ id: r.badge_id, serial: r.serial, grantedAt: "2026-11-27T10:00:00Z", via: r.source, equipped: r.equipped, grantedBy: null })), error: null };
    default:
      return { data: null, error: { message: `rpc ${name} not emulated` } };
  }
};
// "promolu" already holds #11 from a promo code (not from this feature).
badges.push({ id: id(8999), user_id: PROMO, badge_id: "bughunter", serial: 1, source: "promo", note: null, equipped: true, notified_at: "2026-11-01T00:00:00Z", revoked_at: null });

const supabasePath = require.resolve("../db/supabase");
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };

const express = require("express");
const { signToken, signStepUpToken } = require("../config/jwt");
const adminRouter = require("../routes/admin");
const myFeedback = require("../routes/myFeedback");
const state = require("../runtime/sharedState");
const specialBadges = require("../lib/specialBadges");
const model = require("../lib/bugHunter/model");

function assert(c, msg) {
  if (!c) throw new Error("FAIL: " + msg);
}

const emitted = [];
const rooms = new Map([[`user:${AYSE}`, new Set(["sock-ayse"])]]);
const io = {
  to(room) {
    return { emit: (event, payload) => emitted.push({ room, event, payload }), to: () => ({ emit: () => {} }) };
  },
  in() {
    return { fetchSockets: async () => [] };
  },
  emit() {},
  sockets: { sockets: new Map(), adapter: { rooms } },
};

async function call(base, method, path, { body, token, stepUp } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(stepUp ? { "X-Admin-Step-Up": stepUp } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const raw = await res.text();
  let json = {};
  try { json = JSON.parse(raw); } catch { json = {}; }
  return { status: res.status, body: json, raw };
}

const T = fake._tables;
const ledger = (uid) => T.descoin_ledger.rows.filter((r) => r.user_id === uid);
const balance = (uid) => T.users.rows.find((u) => u.id === uid).descoin_balance;
const conf = (n) => T.feedback_bug_reports.rows.find((r) => r.feedback_id === F(n));
const fb = (n) => T.user_feedback.rows.find((r) => r.id === F(n));
const audits = (action) => state.auditLog.filter((e) => e.action === action);
const tick = () => new Promise((r) => setTimeout(r, 30));

async function run() {
  const app = express();
  app.use(express.json());
  app.set("io", io);
  app.use("/api/admin", adminRouter);
  app.use("/api/me/feedback", myFeedback);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const tok = signToken({ id: OWNER, username: "admin", sid: "s-admin" });
  const step = signStepUpToken({ id: OWNER, sid: "s-admin" });
  const A = { token: tok, stepUp: step };
  const confirm = (n, body) => call(base, "POST", `/api/admin/feedback/${F(n)}/bug-confirm`, { ...A, body });
  const undo = (n, reason) => call(base, "POST", `/api/admin/feedback/${F(n)}/bug-undo`, { ...A, body: { reason } });
  try {
    /* ---- section and guards ---- */
    let r = await call(base, "GET", "/api/admin/feedback/bug-hunter", { token: signToken({ id: MODONLY, username: "moddy", sid: "s-moddy" }) });
    assert(r.status === 403 && r.body.section === "feedback", "admin without the feedback section refused " + r.raw);
    r = await call(base, "POST", `/api/admin/feedback/${F(1)}/bug-confirm`, { token: tok, body: { severity: "high" } });
    assert(r.status === 403 && r.body.code === "STEP_UP_REQUIRED", "confirm needs the step-up code");
    r = await call(base, "GET", "/api/admin/feedback/bug-hunter", { token: tok });
    assert(r.status === 200 && r.body.installed === true && r.body.confirmations.length === 0, "empty workspace " + r.raw);
    assert(r.body.rules.rewards.first.critical === 250 && r.body.rules.tiers[1].min === 5, "rules for the panel");
    r = await confirm(11, { severity: "low" });
    assert(r.status === 409 && r.body.code === "SELF_CONFIRM", "own feedback refused");
    r = await confirm(1, {});
    assert(r.status === 400 && r.body.code === "BAD_SEVERITY", "severity required");
    r = await confirm(99, { severity: "low" });
    assert(r.status === 404, "unknown feedback 404");

    /* ---- confirm: first credit ---- */
    r = await confirm(1, { severity: "high", note: "Mikrofon izni iOS 18'de" });
    assert(r.status === 201 && r.body.credit === "first" && r.body.level === 1 && r.body.badge === "new", "first confirm " + r.raw);
    assert(r.body.reward.amount === 100 && r.body.reward.state === "paid", "high pays 100");
    assert(conf(1) && conf(1).severity === "high" && conf(1).reward_state === "paid" && conf(1).level_after === 1 && conf(1).note === "Mikrofon izni iOS 18'de", "row stored");
    let led = ledger(AYSE);
    assert(led.length === 1 && led[0].amount === 100 && led[0].reason === "bug_bounty" && led[0].meta.idempotency_key === `bug_bounty:${F(1)}:1`, "ledger row with idempotency key");
    assert(balance(AYSE) === 100, "wallet 100");
    const b11 = live(AYSE, "bughunter");
    assert(b11 && b11.note === `bughunt:${F(1)}` && b11.source === "admin", "badge #11 granted with the feature note");
    assert(b11.notified_at, "online sender: the live card replaces the generic popup");
    const sbAudit = audits("special_badge_grant");
    assert(sbAudit.length === 1 && sbAudit[0].target === AYSE && sbAudit[0].meta.badgeId === "bughunter" && sbAudit[0].meta.via === "bug_hunter" && sbAudit[0].meta.feedbackId === F(1), "badge grant audited like the badge tools");
    const lvl = T.bug_hunter_levels.rows.find((x) => x.user_id === AYSE);
    assert(lvl.level === 1 && lvl.first_count === 1 && lvl.badge_granted_at, "levels row");
    assert(fb(1).status === "in_progress", "new item moves to in progress");
    const card = fb(1).admin_replies.find((x) => x.type === "bughunt");
    assert(card && card.event === "confirmed" && card.i18n.text.key === "bot.bughunt.confirmed" && card.i18n.badgeLine.key === "bot.bughunt.badgeNew" && card.reward === 100, "thread card");
    assert(r.body.feedback.replies.some((x) => x.type === "bughunt" && x.badge === "new"), "admin view shows the card");
    const live1 = emitted.find((e) => e.room === `user:${AYSE}` && e.event === "feedback:bughunt");
    assert(live1 && live1.payload.badge.id === "bughunter" && live1.payload.badge.level === 1 && live1.payload.reward === 100 && !("adminUsername" in live1.payload.entry), "live card without admin name");
    assert(emitted.some((e) => e.room === `user:${AYSE}` && e.event === "descoin:balance" && e.payload.delta === 100 && e.payload.reason === "bug_bounty"), "balance event");
    assert(emitted.some((e) => e.room === `user:${AYSE}` && e.event === "notification:new" && e.payload.notification.type === "feedback_bughunt" && e.payload.notification.i18n.body.key === "bot.notify.bugNewBadgeBody"), "bell entry");
    let a = audits("feedback_bug_confirm");
    assert(a.length === 1 && a[0].target === AYSE && a[0].meta.feedbackId === F(1) && a[0].meta.severity === "high" && a[0].meta.reward === 100 && a[0].meta.badge === "new", "audit entry");

    /* ---- idempotency ---- */
    r = await confirm(1, { severity: "critical" });
    assert(r.status === 200 && r.body.already === true && r.body.confirmation.severity === "high", "second confirm answers already");
    assert(ledger(AYSE).length === 1 && balance(AYSE) === 100 && audits("feedback_bug_confirm").length === 1, "no second payment or audit");

    /* ---- duplicates ---- */
    r = await confirm(2, { duplicateOf: F(1) });
    assert(r.status === 201 && r.body.credit === "also" && r.body.severity === "high" && r.body.reward.amount === 40, "also-found credit inherits severity, smaller bonus " + r.raw);
    assert(conf(2).duplicate_of === F(1) && !live(MERT, "bughunter"), "linked, no badge for also-found");
    assert(T.bug_hunter_levels.rows.find((x) => x.user_id === MERT).also_count === 1 && balance(MERT) === 40, "also counted apart");
    assert(fb(2).admin_replies.some((x) => x.type === "bughunt" && x.event === "also"), "also card");
    r = await confirm(3, { duplicateOf: F(1) });
    assert(r.status === 409 && r.body.code === "SAME_REPORTER", "same reporter cannot be credited twice");
    r = await confirm(3, { duplicateOf: F(9) });
    assert(r.status === 409 && r.body.code === "ROOT_NOT_CONFIRMED", "link needs a confirmed root");
    r = await undo(1, "yanlış");
    assert(r.status === 409 && r.body.code === "HAS_DUPLICATES" && r.body.count === 1, "root locked while a duplicate is linked");
    r = await undo(1, "x");
    assert(r.status === 400 && r.body.code === "REASON_REQUIRED", "undo needs a reason");

    /* ---- tier upgrade in place ---- */
    for (const n of [4, 5, 6]) {
      r = await confirm(n, { severity: "low" });
      assert(r.status === 201 && r.body.level === 1 && r.body.badge === "more", `confirm ${n} keeps level I`);
    }
    r = await confirm(7, { severity: "medium" });
    assert(r.status === 201 && r.body.level === 2 && r.body.badge === "up", "5th first credit: level II " + r.raw);
    assert(badges.filter((x) => x.user_id === AYSE && x.badge_id === "bughunter").length === 1, "one badge that levels up");
    const up = fb(7).admin_replies.find((x) => x.type === "bughunt");
    assert(up.i18n.badgeLine.key === "bot.bughunt.badgeUp" && up.i18n.badgeLine.vars.level === "II" && up.badgeLine === "Your badge leveled up to Bug Hunter II.", "level-up line");
    assert(balance(AYSE) === 100 + 25 * 3 + 50, "bonuses add up");
    live(AYSE, "bughunter").equipped = true;
    const eq = await specialBadges.equippedForUsers([AYSE]);
    assert(eq.get(AYSE).level === 2 && eq.get(AYSE).bugs === 5 && eq.get(AYSE).since, "profile payload carries the level " + JSON.stringify(eq.get(AYSE)));
    const mine = await call(base, "GET", `/api/admin/feedback/bug-hunter`, { token: tok });
    assert(mine.body.leaderboard[0].username === "ayse" && mine.body.leaderboard[0].first === 5 && mine.body.leaderboard[0].level === 2, "leaderboard");
    assert(mine.body.totals.first === 5 && mine.body.totals.also === 1, "totals");

    /* ---- critical + visual / UI: glitch, no extra bug badge ---- */
    r = await confirm(8, { severity: "critical", visual: true });
    assert(r.status === 201 && r.body.glitch === true && live(AYSE, "glitch") && r.body.reward.amount === 250, "visual bug: glitch granted, critical pays 250 " + r.raw);
    assert(!badges.some((x) => !["bughunter", "glitch"].includes(x.badge_id)), "no new badge kind");
    const c8 = fb(8).admin_replies.find((x) => x.type === "bughunt");
    assert(c8.badgeId === "bughunter" && c8.severity === "critical" && c8.i18n.glitchLine.key === "bot.bughunt.badgeGlitch", "card: severity + glitch line");
    assert(conf(8).visual === true, "visual stored");
    const lv8 = T.bug_hunter_levels.rows.find((x) => x.user_id === AYSE);
    assert(lv8.critical_count === 1 && lv8.high_count === 1 && lv8.low_count === 3 && lv8.medium_count === 1 && lv8.visual_count === 1, "severity mix stored " + JSON.stringify(lv8));
    const eq8 = await specialBadges.equippedForUsers([AYSE]);
    assert(eq8.get(AYSE).severity.critical === 1 && eq8.get(AYSE).severity.low === 3, "tooltip gets the severity mix");

    /* ---- resolved: Düzeltildi once, duplicates too ---- */
    emitted.length = 0;
    r = await call(base, "PATCH", `/api/admin/feedback/${F(1)}`, { ...A, body: { status: "resolved" } });
    assert(r.status === 200, "resolve " + r.raw);
    await tick();
    assert(conf(1).fixed_at && conf(2).fixed_at, "root and duplicate fixed");
    assert(fb(1).admin_replies.filter((x) => x.type === "bughunt" && x.event === "fixed").length === 1, "fixed line on the root");
    assert(fb(2).status === "resolved" && fb(2).admin_replies.some((x) => x.type === "bughunt" && x.event === "fixed"), "duplicate resolved and told");
    assert(!emitted.some((e) => e.room === `user:${AYSE}` && e.event === "feedback:update"), "no generic status ping for a confirmed bug");
    assert(emitted.filter((e) => e.event === "feedback:bughunt" && e.payload.entry.event === "fixed").length === 2, "both senders hear Düzeltildi");
    await call(base, "PATCH", `/api/admin/feedback/${F(1)}`, { ...A, body: { status: "in_progress" } });
    await call(base, "PATCH", `/api/admin/feedback/${F(1)}`, { ...A, body: { status: "resolved" } });
    assert(fb(1).admin_replies.filter((x) => x.type === "bughunt" && x.event === "fixed").length === 1, "Düzeltildi only once");
    r = await confirm(12, { severity: "low" });
    assert(fb(12).admin_replies.find((x) => x.type === "bughunt").i18n.text.key === "bot.bughunt.confirmedFixed" && conf(12).fixed_at, "already fixed: 'düzelttik' text, no later follow-up");

    /* ---- undo: duplicate, coins back while unspent ---- */
    r = await undo(2, "Aynı hata değilmiş");
    assert(r.status === 200 && r.body.reward.state === "reversed" && balance(MERT) === 0, "also bonus reversed " + r.raw);
    const back = ledger(MERT).find((x) => x.reason === "bug_bounty_revoke");
    assert(back && back.amount === -40 && back.meta.idempotency_key === `bug_bounty:${F(2)}:1:revoke`, "revoke ledger row");
    assert(conf(2).undone_at && conf(2).undo_reason === "Aynı hata değilmiş" && conf(2).reward_state === "reversed", "row undone");
    assert(fb(2).admin_replies.some((x) => x.type === "bughunt" && x.event === "also" && x.void), "card hidden from the sender");
    assert(fb(2).admin_replies.some((x) => x.type === "system" && x.internal && x.bughunt === "undo"), "admin-only undo line");
    a = audits("feedback_bug_undo");
    assert(a.length === 1 && a[0].meta.reason === "Aynı hata değilmiş" && a[0].meta.rewardState === "reversed", "undo audited");
    r = await undo(2, "tekrar deneme");
    assert(r.status === 409 && r.body.code === "ALREADY_UNDONE", "second undo refused");

    /* ---- undo: spent coins stay, critical badge goes back; re-confirm carries the bonus ---- */
    T.users.rows.find((u) => u.id === AYSE).descoin_balance = 10;
    r = await undo(8, "Kritik değil, yüksek");
    assert(r.status === 200 && r.body.reward.state === "kept" && r.body.reward.why === "spent" && balance(AYSE) === 10, "spent bonus kept " + r.raw);
    assert(r.body.glitchRevoked === true && !live(AYSE, "glitch") && live(AYSE, "bughunter"), "glitch back (no visual bug left), #11 stays");
    assert(audits("special_badge_revoke").some((e) => e.meta.badgeId === "glitch" && e.meta.via === "bug_hunter"), "take-back audited like the badge tools");
    assert(conf(8).reward_state === "kept", "row says kept");
    const ledBefore = ledger(AYSE).length;
    r = await confirm(8, { severity: "high" });
    assert(r.status === 201 && r.body.round === 2 && r.body.reward.carried === true && ledger(AYSE).length === ledBefore, "re-confirm: round 2, kept bonus carried, no second payment " + r.raw);
    assert(conf(8).round === 2 && conf(8).reward_state === "paid", "round 2 stored");

    /* ---- undo to zero: only a badge this feature gave goes back ---- */
    r = await confirm(9, { severity: "low" });
    assert(r.status === 201 && live(DENIZ, "bughunter"), "deniz gets the badge");
    r = await undo(9, "Yanlış kişi");
    assert(r.status === 200 && r.body.badgeRevoked === true && !live(DENIZ, "bughunter"), "deniz's badge goes back");
    const grantsBefore = audits("special_badge_grant").length;
    r = await confirm(10, { severity: "medium" });
    assert(r.status === 201 && r.body.badge === "more" && r.body.level === 1, "existing holder: no second badge, not announced as new " + r.raw);
    assert(audits("special_badge_grant").length === grantsBefore, "no grant entry for a badge already held");
    assert(fb(10).admin_replies.find((x) => x.type === "bughunt").i18n.badgeLine.key === "bot.bughunt.badgeMore", "card says one more bug");
    assert(T.bug_hunter_levels.rows.find((x) => x.user_id === PROMO).legacy_count === 1, "history kept");
    const promoStats = (await specialBadges.equippedForUsers([PROMO])).get(PROMO);
    assert(promoStats.bugs === 2 && promoStats.since === "2026-11-01T00:00:00.000Z", "tooltip counts the history " + JSON.stringify(promoStats));
    r = await undo(10, "Yanlış kayıt");
    assert(r.status === 200 && r.body.badgeRevoked === false && live(PROMO, "bughunter"), "a promo-granted badge stays");

    /* ---- İşlem kaydı console undo ---- */
    const entry = audits("feedback_bug_confirm").find((e) => e.meta.feedbackId === F(6));
    r = await call(base, "GET", `/api/admin/audit/entry/${encodeURIComponent(entry.id)}`, { token: tok });
    assert(r.status === 200 && r.body.undo.available === true && r.body.undo.reverse === "feedback_bug_undo", "console offers undo " + r.raw.slice(0, 300));
    r = await call(base, "POST", `/api/admin/audit/entry/${encodeURIComponent(entry.id)}/undo`, { ...A, body: { reason: "Konsoldan geri alındı" } });
    assert(r.status === 200 && r.body.reverse === "feedback_bug_undo", "console undo " + r.raw);
    assert(conf(6).undone_at && conf(6).undo_reason === "Konsoldan geri alındı", "row undone via console " + JSON.stringify(conf(6)) + r.raw);
    const viaConsole = audits("feedback_bug_undo").find((e) => e.meta.undoOf === entry.id);
    assert(viaConsole && viaConsole.meta.feedbackId === F(6), "console entry points at the confirm");
    assert(audits("feedback_bug_undo").filter((e) => e.meta.feedbackId === F(6)).length === 1, "one undo entry, not two");
    r = await call(base, "POST", `/api/admin/audit/entry/${encodeURIComponent(entry.id)}/undo`, { ...A, body: { reason: "Konsoldan geri alındı" } });
    assert(r.status === 409, "console undo twice refused");

    /* ---- the sender's view ---- */
    const sender = signToken({ id: AYSE, username: "ayse", sid: "s-ayse" });
    r = await call(base, "GET", `/api/me/feedback/${F(7)}`, { token: sender });
    const mc = r.body.item.thread.find((x) => x.type === "bughunt");
    assert(r.status === 200 && mc && mc.level === 2 && mc.badge === "up" && mc.i18n.badgeLine.key === "bot.bughunt.badgeUp" && !JSON.stringify(r.body).includes("adminUsername"), "sender sees the card without admin names");
    r = await call(base, "GET", `/api/me/feedback/${F(6)}`, { token: sender });
    assert(!r.body.item.thread.some((x) => x.type === "bughunt"), "undone round hidden from the sender");
    assert(!r.body.item.thread.some((x) => /geri aldı|undid/.test(x.text || "")), "undo line never reaches the sender");
    r = await call(base, "GET", `/api/me/feedback`, { token: sender });
    assert(r.status === 200 && r.body.items.find((x) => x.id === F(8)).unread >= 1, "card counts as unread");

    // Final totals after undos: 6 first credits live for ayse (1,4,5,7,8,12), level II.
    const lv = T.bug_hunter_levels.rows.find((x) => x.user_id === AYSE);
    assert(lv.first_count === 6 && lv.level === 2 && lv.critical_count === 0 && lv.visual_count === 0, "recount after undos " + JSON.stringify(lv));
    assert(model.levelFor(model.levelCount(lv)) === lv.level, "stored level matches the rules");
    console.log("bugHunter.integration.test: ok");
  } finally {
    server.close();
  }
}

run().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
