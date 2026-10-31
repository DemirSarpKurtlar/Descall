"use strict";

/**
 * Tell the sender that the team answered their feedback (3.7.14), on every
 * device: the live socket event (`feedback:reply` / `feedback:update` to
 * user:<id>, the app opens the thread from it), the in-app notification list,
 * and an iOS alert push for a phone that is closed. Best effort: a failed
 * notification never fails the admin's reply.
 */

const STATUS_TEXT = {
  in_progress: "Geri bildirimin inceleniyor",
  resolved: "Geri bildirimin çözüldü olarak işaretlendi",
  closed: "Geri bildirimin kapatıldı",
};

function notifyFeedbackReply(io, userId, { feedbackId, text = "", subject = "" } = {}) {
  if (!userId || !feedbackId) return;
  const preview = String(text || "").slice(0, 200);
  try {
    io?.to?.(`user:${userId}`)?.emit?.("feedback:reply", { feedbackId, text: preview });
  } catch (err) {
    console.warn("[feedback] reply emit failed:", err?.message || err);
  }
  try {
    const { pushNotification } = require("../socket/handlers");
    if (io && typeof pushNotification === "function") {
      pushNotification(io, String(userId), {
        type: "feedback_reply",
        title: "Descall Ekibi yanıt verdi",
        body: preview || String(subject || "").slice(0, 120),
        meta: { feedbackId },
      });
    }
  } catch (err) {
    console.warn("[feedback] in-app notification failed:", err?.message || err);
  }
  try {
    const { sendIosAlertToUsers } = require("./iosAlertPush");
    void Promise.resolve(
      sendIosAlertToUsers([String(userId)], { type: "feedback-reply", feedbackId, text: preview, subject })
    ).catch((err) => console.warn("[feedback] push failed:", err?.message || err));
  } catch (err) {
    console.warn("[feedback] push failed:", err?.message || err);
  }
}

function notifyFeedbackStatus(io, userId, { feedbackId, status } = {}) {
  if (!userId || !feedbackId || !STATUS_TEXT[status]) return;
  try {
    io?.to?.(`user:${userId}`)?.emit?.("feedback:update", { feedbackId, status });
  } catch (err) {
    console.warn("[feedback] status emit failed:", err?.message || err);
  }
  if (status === "resolved") {
    try {
      const { pushNotification } = require("../socket/handlers");
      if (io && typeof pushNotification === "function") {
        pushNotification(io, String(userId), { type: "feedback_status", title: "Geri bildirim", body: STATUS_TEXT[status], meta: { feedbackId, status } });
      }
    } catch (err) {
      console.warn("[feedback] status notification failed:", err?.message || err);
    }
  }
}

module.exports = { notifyFeedbackReply, notifyFeedbackStatus, STATUS_TEXT };
