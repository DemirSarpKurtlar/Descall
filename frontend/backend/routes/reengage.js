"use strict";

/**
 * Re-engagement switches and the one-click unsubscribe (lib/reengage.js).
 *   GET  /api/reengage/prefs                       -> { friendVoice, email, ready }
 *   PUT  /api/reengage/prefs { friendVoice?, email? } -> { ok, friendVoice, email } | 503 not_ready
 *   GET  /api/reengage/unsubscribe?u=&s=&t=        -> HTML page (one click, no sign-in)
 *   POST /api/reengage/unsubscribe?u=&s=&t=        -> RFC 8058 List-Unsubscribe-Post
 * The caller's other devices get reengage:prefs so their switches follow.
 */

const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { reengage } = require("../lib/reengage");
const { bt, pickLang, requestLang } = require("../lib/i18n");

const router = express.Router();

router.get("/prefs", requireAuth, async (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json(await reengage().readPrefs(req.user.id));
});

router.put("/prefs", requireAuth, async (req, res) => {
  const { friendVoice, email } = req.body || {};
  if (typeof friendVoice !== "boolean" && typeof email !== "boolean") {
    return res.status(400).json({ ok: false, error: "nothing_to_save" });
  }
  const out = await reengage().savePrefs(req.user.id, { friendVoice, email });
  if (!out.ok) return res.status(out.error === "not_ready" ? 503 : 500).json(out);
  try {
    req.app.get("io")?.to(`user:${req.user.id}`).emit("reengage:prefs", { friendVoice: out.friendVoice, email: out.email });
  } catch {
    /* other devices read it on their next settings open */
  }
  return res.json(out);
});

async function handleUnsubscribe(req, res) {
  const q = req.query || {};
  const result = await reengage()
    .unsubscribe({ userId: String(q.u || ""), scope: String(q.s || ""), token: String(q.t || "") })
    .catch(() => ({ ok: false, lang: null }));
  const lang = pickLang([result.lang], requestLang(req, "tr"));
  if (req.method === "POST") return res.status(result.ok ? 200 : 404).json({ ok: result.ok });
  const { pageHtml } = require("../lib/marketingOptIn");
  const title = result.ok ? bt(lang, "reengage.unsubscribe.pageTitle") : "Descall";
  const body = result.ok ? bt(lang, "reengage.unsubscribe.pageBody") : bt(lang, "reengage.unsubscribe.pageBad");
  res.set("Cache-Control", "no-store");
  return res.status(result.ok ? 200 : 404).type("html").send(pageHtml(title, body, lang));
}

router.get("/unsubscribe", handleUnsubscribe);
router.post("/unsubscribe", handleUnsubscribe);

module.exports = router;
