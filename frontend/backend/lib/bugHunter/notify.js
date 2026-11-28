"use strict";

/**
 * Tells the sender about their confirmed bug (or the fix): the live `feedback:bughunt` card
 * (the app shows the badge art and opens the thread from it), the bell list entry, the
 * wallet balance, and an iOS alert push for a phone that is closed. Best effort: a failed
 * notification never fails the admin's action. Text: bot.notify.* (bell) and push.bugHunt*
 * (backend catalogs, the device / account language).
 */

const model = require("./model");

const PUSH_KEY = {
  confirmed: "push.bugHuntConfirmed",
  up: "push.bugHuntLevelUp",
  also: "push.bugHuntAlso",
  fixed: "push.bugHuntFixed",
};

function emit(io, userId, event, payload) {
  try {
    io?.to?.(`user:${userId}`)?.emit?.(event, payload);
  } catch (err) {
    console.warn(`[bug-hunter] ${event} emit failed:`, err?.message || err);
  }
}

async function pushText(userId, entry) {
  const { bt, availableLangs } = require("../i18n");
  const { resolveLang } = require("../locales");
  let lang = "tr";
  try {
    const { data } = await require("../../db/supabase").from("users").select("language").eq("id", userId).maybeSingle();
    lang = resolveLang([data?.language], { available: availableLangs() }) || "tr";
  } catch {
    /* Turkish, like the other pushes */
  }
  const k = entry.event === "fixed" ? "fixed" : entry.event === "also" ? "also" : entry.badge === "up" ? "up" : "confirmed";
  return bt(lang, PUSH_KEY[k], { level: model.ROMAN[entry.level] || "I", amount: entry.reward || 0 });
}

function bugHunt(io, userId, { feedbackId, entry, badge = null, reward = 0, balance = null } = {}) {
  if (!userId || !feedbackId || !entry) return;
  emit(io, userId, "feedback:bughunt", { feedbackId, entry, badge, reward, balance });
  if (reward > 0 && balance != null) emit(io, userId, "descoin:balance", { balance, delta: reward, reason: "bug_bounty" });
  try {
    const { pushNotification } = require("../../socket/handlers");
    if (io && typeof pushNotification === "function") {
      const copy = model.notifyCopy(entry);
      pushNotification(io, String(userId), {
        type: "feedback_bughunt",
        titleKey: copy.titleKey,
        bodyKey: copy.bodyKey,
        vars: copy.vars,
        meta: { feedbackId, event: entry.event, level: entry.level, badgeId: entry.badgeId || null },
      });
    }
  } catch (err) {
    console.warn("[bug-hunter] in-app notification failed:", err?.message || err);
  }
  void (async () => {
    try {
      const text = await pushText(userId, entry);
      const { sendIosAlertToUsers } = require("../iosAlertPush");
      await sendIosAlertToUsers([String(userId)], { type: "feedback-reply", feedbackId, text });
    } catch (err) {
      console.warn("[bug-hunter] push failed:", err?.message || err);
    }
  })();
}

function bugHuntUndone(io, userId, { feedbackId, balance = null, delta = 0 } = {}) {
  if (!userId || !feedbackId) return;
  emit(io, userId, "feedback:update", { feedbackId });
  if (delta && balance != null) emit(io, userId, "descoin:balance", { balance, delta, reason: "bug_bounty_revoke" });
}

module.exports = { bugHunt, bugHuntUndone, pushText, PUSH_KEY };
