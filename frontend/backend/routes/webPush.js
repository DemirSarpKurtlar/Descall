"use strict";

const express = require("express");
const { requireAuth } = require("../middleware/auth");
const supabase = require("../db/supabase");
const fcm = require("../lib/fcm");

const router = express.Router();

function validSubscription(subscription) {
  return Boolean(
    subscription &&
    typeof subscription.endpoint === "string" &&
    subscription.endpoint.startsWith("https://") &&
    typeof subscription.keys?.p256dh === "string" &&
    typeof subscription.keys?.auth === "string"
  );
}

router.post("/subscription", requireAuth, async (req, res) => {
  const subscription = req.body;
  if (!validSubscription(subscription)) {
    return res.status(400).json({ error: "Invalid push subscription." });
  }

  const { error } = await supabase
    .from("web_push_subscriptions")
    .upsert(
      {
        user_id: req.user.id,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        last_seen: new Date().toISOString(),
      },
      { onConflict: "endpoint" }
    );
  if (error) {
    console.error("[WebPush] Subscription save failed:", error.message);
    return res.status(500).json({ error: "Could not save push subscription." });
  }

  return res.status(204).end();
});

router.delete("/subscription", requireAuth, async (req, res) => {
  const endpoint = req.body?.endpoint;
  if (typeof endpoint !== "string" || !endpoint) {
    return res.status(400).json({ error: "Missing push endpoint." });
  }

  const { error } = await supabase
    .from("web_push_subscriptions")
    .delete()
    .eq("user_id", req.user.id)
    .eq("endpoint", endpoint);
  if (error) {
    console.error("[WebPush] Subscription removal failed:", error.message);
    return res.status(500).json({ error: "Could not remove push subscription." });
  }

  return res.status(204).end();
});

/** Capacitor / FCM device token registration. */
router.post("/fcm-token", requireAuth, async (req, res) => {
  const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
  const platform = typeof req.body?.platform === "string" ? req.body.platform : "android";
  if (!token || token.length < 20) {
    return res.status(400).json({ error: "Invalid FCM token." });
  }
  if (platform === fcm.VOIP_PLATFORM && !fcm.isApnsDeviceToken(token)) {
    return res.status(400).json({ error: "Invalid VoIP token." });
  }
  // iOS alert tokens are raw 64-hex APNs device tokens (lib/iosAlertPush.js).
  if (platform === fcm.IOS_ALERT_PLATFORM && !fcm.isApnsDeviceToken(token)) {
    return res.status(400).json({ error: "Invalid iOS push token." });
  }
  const rawLocale = typeof req.body?.locale === "string" ? req.body.locale.trim().toLowerCase() : "";
  const locale = platform === fcm.IOS_ALERT_PLATFORM && (rawLocale === "tr" || rawLocale === "en") ? rawLocale : null;
  try {
    await fcm.upsertDeviceToken(req.user.id, token, platform, locale);
    return res.status(204).end();
  } catch (err) {
    console.error("[FCM] token save failed:", err.message);
    return res.status(500).json({ error: "Could not save device token." });
  }
});

router.delete("/fcm-token", requireAuth, async (req, res) => {
  const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
  if (!token) return res.status(400).json({ error: "Missing token." });
  try {
    await fcm.removeDeviceToken(req.user.id, token);
    return res.status(204).end();
  } catch (err) {
    console.error("[FCM] token remove failed:", err.message);
    return res.status(500).json({ error: "Could not remove device token." });
  }
});

module.exports = router;
