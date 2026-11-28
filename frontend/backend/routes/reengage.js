"use strict";

/**
 * Re-engagement switches and the one-click unsubscribe (lib/reengage.js).
 *   GET  /api/reengage/prefs                       -> { friendVoice, email, ready }
 *   PUT  /api/reengage/prefs { friendVoice?, email? } -> { ok, friendVoice, email } | 503 not_ready
 *   GET  /api/reengage/unsubscribe?u=&s=&t=        -> HTML page (one click, no sign-in)
 *   POST /api/reengage/unsubscribe?u=&s=&t=        -> RFC 8058 List-Unsubscribe-Post
 * The caller's other devices get reengage:prefs so their switches follow.
 *
 * Growth 3B tracking (lib/reengage/tracking.js; signed tokens, no personal data in URLs):
 *   POST /api/reengage/t/d/:token        push delivered (the web service worker)
 *   GET  /api/reengage/t/c/:token?to=/x  e-mail link: marks opened, redirects into the app
 *   POST /api/reengage/t/open { kind }   the signed-in app tapped a re-engagement push
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

/* ---- growth 3B tracking ------------------------------------------------- */

const tracking = () => require("../lib/reengage/tracking");

router.post("/t/d/:token", async (req, res) => {
  res.set("Cache-Control", "no-store");
  await tracking().markByToken(String(req.params.token || ""), "delivered").catch(() => null);
  res.status(204).end();
});

router.get("/t/c/:token", async (req, res) => {
  const { publicOrigin } = require("../lib/reengagePolicy");
  const raw = String(req.query.to || "/app");
  // Only paths inside the app: no open redirect.
  const path = /^\/(?!\/)[A-Za-z0-9/_.?=&%-]{0,300}$/.test(raw) ? raw : "/app";
  await tracking().markByToken(String(req.params.token || ""), "opened").catch(() => null);
  res.set("Cache-Control", "no-store");
  res.redirect(302, `${publicOrigin()}${path}`);
});

router.post("/t/open", requireAuth, async (req, res) => {
  const kind = String(req.body?.kind || "").slice(0, 64);
  if (!kind) return res.status(400).json({ ok: false });
  const ok = await tracking().markOpened(req.user.id, kind).catch(() => false);
  res.json({ ok });
});

router.get("/unsubscribe", handleUnsubscribe);
router.post("/unsubscribe", handleUnsubscribe);

module.exports = router;
