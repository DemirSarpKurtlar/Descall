"use strict";

/**
 * Risk alerts (approved 25 Oct 2026: email to Demir + admin-only iOS push).
 *
 * Faz 0: an account crossing the alert score is always *recorded* in
 * descoin_risk_alerts (the suspicious-behavior tab reads it). Sending is behind
 * DESCOIN_ANTIBOT_ALERT_EMAIL / DESCOIN_ANTIBOT_ALERT_PUSH, both default OFF.
 *
 * Privacy: the email / push carry only counts and the top score plus a link to
 * the admin panel; no usernames, ids, hashes or message text.
 * Flood control: at most one email and one push per DIGEST_MS window; accounts
 * crossing in between are summed into the next one.
 */

const config = require("./config");
const store = require("./store");

const DIGEST_MS = 30 * 60_000;
const REALERT_MS = 24 * 3600_000;
const DEFAULT_RECIPIENT = "demirkurtlar@icloud.com";

let lastEmailAt = 0;
let lastPushAt = 0;
let pending = { count: 0, topScore: 0 };

function recipient(env = process.env) {
  return env.DESCOIN_ANTIBOT_ALERT_EMAIL_TO || env.REPORT_ALERT_EMAIL || DEFAULT_RECIPIENT;
}

function adminUrl(env = process.env) {
  const base = String(env.REPORT_ALERT_ADMIN_URL || env.PUBLIC_APP_URL || "https://descall.com").replace(/\/+$/, "");
  return `${base}/admin`;
}

function buildEmail({ count, topScore }, env = process.env) {
  const subject = `Descall anti-bot: ${count} hesap risk eşiğini geçti (en yüksek ${topScore})`;
  const text = [
    `${count} hesap DesCoin risk skoru eşiğini (${config.getAlertFlags(env).minScore}) geçti.`,
    `En yüksek skor: ${topScore}.`,
    "İzleme modu (Faz 0): hiçbir kazanç veya bakiye değişmedi.",
    `Detaylar admin panelinde: ${adminUrl(env)}`,
  ].join("\n");
  return { to: recipient(env), subject, text };
}

/**
 * @param {Array<{user_id:string, score:number, prevScore:number|null, trusted:boolean, reasons:string[]}>} rows
 * @param {object} [deps] { sendEmail, sendPush, listAdminIds, now }
 */
async function processCrossings(rows, deps = {}) {
  const flags = config.getAlertFlags();
  const now = deps.now ? deps.now() : Date.now();
  const crossed = (rows || []).filter(
    (r) => !r.trusted && r.score >= flags.minScore && (r.prevScore == null || r.prevScore < flags.minScore)
  );
  if (!crossed.length) return { recorded: 0, emailed: false, pushed: false };

  // Skip users alerted in the last 24h (score bouncing around the threshold).
  const ids = crossed.map((r) => r.user_id);
  const since = new Date(now - REALERT_MS).toISOString();
  const recent = await store.run("descoin_risk_alerts", "select", (s) =>
    s.from("descoin_risk_alerts").select("user_id").in("user_id", ids).gte("created_at", since)
  );
  const recentSet = new Set((recent.data || []).map((r) => r.user_id));
  const fresh = crossed.filter((r) => !recentSet.has(r.user_id));
  if (!fresh.length) return { recorded: 0, emailed: false, pushed: false };

  const inserted = await store.run("descoin_risk_alerts", "insert", (s) =>
    s.from("descoin_risk_alerts").insert(
      fresh.map((r) => ({
        user_id: r.user_id,
        score: r.score,
        reasons: (r.reasons || []).slice(0, 10),
        email_enabled: flags.email,
        push_enabled: flags.push,
      }))
    )
  );

  pending.count += fresh.length;
  pending.topScore = Math.max(pending.topScore, ...fresh.map((r) => r.score));

  let emailed = false;
  let pushed = false;
  if (flags.email && now - lastEmailAt >= DIGEST_MS) {
    const sendEmail = deps.sendEmail || require("../mailer").sendEmail;
    try {
      const res = await sendEmail(buildEmail(pending));
      emailed = Boolean(res?.sent);
      lastEmailAt = now;
    } catch (err) {
      console.warn("[antibot] alert email failed:", String(err?.message || err).slice(0, 200));
    }
  }
  if (flags.push && now - lastPushAt >= DIGEST_MS) {
    try {
      const listAdminIds = deps.listAdminIds || defaultAdminIds;
      const adminIds = await listAdminIds();
      if (adminIds.length) {
        const sendPush = deps.sendPush || require("../iosAlertPush").sendIosAlertToUsers;
        await sendPush(adminIds, { type: "admin-antibot", count: pending.count, topScore: pending.topScore });
        pushed = true;
      }
      lastPushAt = now;
    } catch (err) {
      console.warn("[antibot] alert push failed:", String(err?.message || err).slice(0, 200));
    }
  }
  if (emailed || pushed || (!flags.email && !flags.push)) pending = { count: 0, topScore: 0 };
  return { recorded: inserted.skipped ? 0 : fresh.length, emailed, pushed };
}

/** Admin accounts only (is_admin), never moderators or regular users. */
async function defaultAdminIds() {
  const { data, error } = await require("../../db/supabase").from("users").select("id").eq("is_admin", true).limit(20);
  if (error) return [];
  return (data || []).map((r) => r.id).filter(Boolean);
}

function _reset() {
  lastEmailAt = 0;
  lastPushAt = 0;
  pending = { count: 0, topScore: 0 };
}

module.exports = { processCrossings, buildEmail, recipient, DIGEST_MS, _reset };
