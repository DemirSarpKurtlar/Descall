"use strict";

/**
 * Growth 3B admin console "Yeniden kazanma". Mounted inside routes/admin.js (requireAdmin
 * + 2FA + step-up + section "retention", like Elde tutma). Every change is written to the
 * admin audit log (state.appendAudit) and to the campaign's own log.
 *
 *   GET   /growth/reengage                          list + mode + today's numbers
 *   PUT   /growth/reengage/settings                 { modeOverride?, paused?, callReward?, gift14Amount?, reason }
 *   GET   /growth/reengage/campaigns/:id            workspace (stats, languages, audience, hours, results, waves, log)
 *   GET   /growth/reengage/campaigns/:id/preview    ?lang=&userId=  what the person sees
 *   PATCH /growth/reengage/campaigns/:id            { status?, holdoutPct?, channels?, lang?, template?, reason? }
 *   POST  /growth/reengage/campaigns/:id/send       next wave now (30 s undo)
 *   POST  /growth/reengage/campaigns/:id/test       "Bana test"
 *   GET   /growth/reengage/waves/:id                live tracking window
 *   POST  /growth/reengage/waves/:id/undo           within 30 s
 *   POST  /growth/reengage/waves/:id/recall         { reason, note } unopened messages only
 *   GET   /growth/reengage/friend-call              friend-call panel (funnel, DesCoin, log)
 *   GET   /growth/reengage/outcomes                 headline numbers for Elde tutma
 *
 * Mode changes and reward amounts are owner only and need a written reason. Sending never
 * starts by itself: the default mode is the environment's (off in production).
 */

const express = require("express");
const state = require("../runtime/sharedState");
const { userIsSuperAdmin } = require("../middleware/requireAdmin");
const R = require("../lib/reengage/rules");

const router = express.Router();

const lib = {
  campaigns: () => require("../lib/reengage/campaigns"),
  store: () => require("../lib/reengage/store"),
  mode: () => require("../lib/reengage/mode"),
  winback: () => require("../lib/reengage/winback"),
  tracking: () => require("../lib/reengage/tracking"),
};

function audit(actor, action, target, meta) {
  try {
    return state.appendAudit(actor.id, actor.username, action, target, meta);
  } catch {
    return null;
  }
}

function fail(res, e, label) {
  const status = e?.status || (e?.code === "NOT_READY" ? 503 : 500);
  if (status >= 500 && e?.code !== "NOT_READY") console.error(`[admin-reengage] ${label} failed:`, e?.message || e);
  return res
    .status(status)
    .json({ error: e?.code === "NOT_READY" ? "not_ready" : status >= 500 ? "Could not load re-engagement." : e.message, code: e?.code === "NOT_READY" ? "not_ready" : e?.code || undefined, placeholders: e?.placeholders, excluded: e?.excluded });
}

function reasonOf(req) {
  return String(req.body?.reason || "").replace(/\s+/g, " ").trim().slice(0, 300);
}

router.use("/growth/reengage", (req, _res, next) => {
  try {
    require("../lib/reengage/io").setIo(req.app.get("io"));
  } catch {
    /* live view optional */
  }
  next();
});

router.get("/growth/reengage", async (_req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    res.json(await lib.campaigns().overview());
  } catch (e) {
    fail(res, e, "overview");
  }
});

router.put("/growth/reengage/settings", async (req, res) => {
  try {
    const body = req.body || {};
    const reason = reasonOf(req);
    const patch = {};
    const owner = await userIsSuperAdmin(req);
    if (body.modeOverride !== undefined) {
      if (!owner) return res.status(403).json({ error: "Only the owner can change the mode.", code: "owner_only" });
      if (body.modeOverride !== null && !lib.mode().MODES.includes(body.modeOverride)) return res.status(400).json({ error: "bad_mode", code: "bad_mode" });
      if (!reason) return res.status(400).json({ error: "reason_required", code: "reason_required" });
      patch.modeOverride = body.modeOverride;
    }
    if (body.paused !== undefined) {
      if (typeof body.paused !== "boolean") return res.status(400).json({ error: "bad_paused", code: "bad_paused" });
      if (body.paused && !reason) return res.status(400).json({ error: "reason_required", code: "reason_required" });
      patch.paused = body.paused;
    }
    for (const [k, max] of [["callReward", 200], ["gift14Amount", 500]]) {
      if (body[k] === undefined) continue;
      if (!owner) return res.status(403).json({ error: "Only the owner can change rewards.", code: "owner_only" });
      const n = Number(body[k]);
      if (!Number.isInteger(n) || n < 0 || n > max) return res.status(400).json({ error: `bad_${k}`, code: `bad_${k}` });
      if (!reason) return res.status(400).json({ error: "reason_required", code: "reason_required" });
      patch[k] = n;
    }
    if (!Object.keys(patch).length) return res.status(400).json({ error: "nothing_to_save", code: "nothing_to_save" });
    const before = await lib.store().getConsole({ fresh: true });
    const after = await lib.store().saveConsole(patch, req.user.id);
    lib.mode().apply(after);
    audit(req.user, "reengage_settings", "reengage", { before: { modeOverride: before.modeOverride, paused: before.paused, callReward: before.callReward, gift14Amount: before.gift14Amount }, after: patch, reason });
    if (patch.callReward !== undefined || patch.gift14Amount !== undefined) {
      await lib
        .campaigns()
        .appendLog("friend_call", { byId: req.user.id, by: req.user.username, action: "reward", detail: JSON.stringify({ callReward: patch.callReward, gift14Amount: patch.gift14Amount }), reason })
        .catch(() => null);
    }
    try {
      req.app.get("io")?.to("admin").emit("rg:settings", { mode: lib.mode().snapshot(), console: after });
    } catch {
      /* optional */
    }
    res.json({ ok: true, console: after, mode: lib.mode().snapshot() });
  } catch (e) {
    fail(res, e, "settings");
  }
});

router.get("/growth/reengage/campaigns/:id", async (req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    res.json(await lib.campaigns().workspace(String(req.params.id)));
  } catch (e) {
    fail(res, e, "workspace");
  }
});

router.get("/growth/reengage/campaigns/:id/preview", async (req, res) => {
  res.set("Cache-Control", "no-store");
  const userId = /^[0-9a-f-]{36}$/i.test(String(req.query.userId || "")) ? String(req.query.userId) : null;
  try {
    res.json(await lib.campaigns().preview(String(req.params.id), { lang: req.query.lang ? String(req.query.lang) : null, userId }));
  } catch (e) {
    fail(res, e, "preview");
  }
});

router.patch("/growth/reengage/campaigns/:id", async (req, res) => {
  try {
    const body = req.body || {};
    const reason = reasonOf(req);
    if (body.status !== undefined && !reason) return res.status(400).json({ error: "reason_required", code: "reason_required" });
    const out = await lib.campaigns().saveCampaign(String(req.params.id), { ...body, reason }, req.user);
    audit(req.user, "reengage_campaign", String(req.params.id), {
      status: body.status,
      holdoutPct: body.holdoutPct,
      channels: body.channels,
      lang: body.lang,
      fields: body.template ? Object.keys(body.template) : undefined,
      reason: reason || null,
    });
    res.json({ ok: true, campaign: out });
  } catch (e) {
    fail(res, e, "save");
  }
});

router.post("/growth/reengage/campaigns/:id/send", async (req, res) => {
  try {
    const wave = await lib.campaigns().startWave(String(req.params.id), { force: true, actor: req.user });
    audit(req.user, "reengage_send", String(req.params.id), { waveId: wave?.id || null, audience: wave?.audience || 0, dryRun: Boolean(wave?.dry_run), reason: reasonOf(req) || null });
    res.json({ ok: true, wave, undoMs: R.UNDO_MS });
  } catch (e) {
    fail(res, e, "send");
  }
});

router.post("/growth/reengage/campaigns/:id/test", async (req, res) => {
  try {
    const out = await lib.campaigns().testSend(String(req.params.id), req.user);
    audit(req.user, "reengage_test", String(req.params.id), { push: out.push, email: out.email });
    res.json(out);
  } catch (e) {
    fail(res, e, "test");
  }
});

router.get("/growth/reengage/waves/:id", async (req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    res.json(await lib.campaigns().waveLive(String(req.params.id)));
  } catch (e) {
    fail(res, e, "wave");
  }
});

router.post("/growth/reengage/waves/:id/undo", async (req, res) => {
  try {
    const out = await lib.campaigns().undoWave(String(req.params.id), req.user);
    audit(req.user, "reengage_undo", String(req.params.id), {});
    res.json(out);
  } catch (e) {
    fail(res, e, "undo");
  }
});

router.post("/growth/reengage/waves/:id/recall", async (req, res) => {
  try {
    const reason = String(req.body?.reason || "");
    const note = String(req.body?.note || "").replace(/\s+/g, " ").trim().slice(0, 300);
    if (!R.RECALL_REASONS.includes(reason)) return res.status(400).json({ error: "reason_required", code: "reason_required" });
    if (reason === "other" && !note) return res.status(400).json({ error: "note_required", code: "note_required" });
    const out = await lib.campaigns().recallWave(String(req.params.id), { reason, note, actor: req.user });
    audit(req.user, "reengage_recall", String(req.params.id), { reason, note: note || null, recalled: out.recalled, opened: out.opened });
    res.json(out);
  } catch (e) {
    fail(res, e, "recall");
  }
});

router.get("/growth/reengage/friend-call", async (_req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    const [summary, c, cfg] = await Promise.all([lib.winback().adminSummary(), lib.campaigns().campaign("friend_call"), lib.store().getConsole()]);
    const { rows } = await lib.store().messageRows({ campaign: "inactive7", since: new Date(Date.now() - 7 * R.DAY_MS).toISOString() });
    const sys = rows.filter((r) => !r.holdout);
    res.json({
      ...summary,
      systemRate: sys.length ? Math.round((sys.filter((r) => r.returned_at).length / sys.length) * 1000) / 10 : null,
      reward: cfg.callReward,
      rules: { callerPerWeek: R.WINBACK.callerPerWeek, targetPerMonth: R.WINBACK.targetPerMonth, callerMinAccountDays: R.WINBACK.callerMinAccountDays, minActiveMinutes: R.WINBACK.minActiveSeconds / 60 },
      decisions: c.log.filter((l) => l.action === "reward"),
    });
  } catch (e) {
    fail(res, e, "friend-call");
  }
});

router.get("/growth/reengage/outcomes", async (_req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    const { ready, rows } = await lib.store().messageRows({ since: new Date(Date.now() - 30 * R.DAY_MS).toISOString(), limit: 50000 });
    res.json({ ready, mode: lib.mode().snapshot(), ...lib.tracking().outcomes(rows) });
  } catch (e) {
    fail(res, e, "outcomes");
  }
});

module.exports = router;
