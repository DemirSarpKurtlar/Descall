"use strict";

/**
 * Yönetici Paneli › Güvenlik Merkezi (remake, owner-approved Draft A "Komuta merkezi",
 * Nov 2026). Mounted inside routes/admin.js: requireAuth + requireAdmin + admin 2FA +
 * step-up (every POST / PATCH needs a fresh code) + section "security".
 *
 *   GET   /security/overview              score + checks, KPIs, 24 h chart, sources, locks, alerts
 *   GET   /security/events?filter=&before=&limit=&sourceRef=&userId=   live feed page
 *   GET   /security/events/:id            one event + the same source's / account's recent events
 *   GET   /security/impact                lock dialog "Etki önizlemesi" (online, last-hour sign-ups / DMs)
 *   PATCH /security/settings { patch, reason }        security switches and limits (history + audit)
 *   POST  /security/locks { modes, duration, reason, banner }   start emergency locks
 *   POST  /security/locks/lift { modes, reason }      lift locks now
 *   POST  /security/locks/extend { mode, minutes }    move a lock's end
 *   GET   /security/history?category=&before=         settings history with diffs
 *   POST  /security/history/:id/revert { reason }     put a change back (history + audit)
 *   POST  /security/remind-2fa                        reminder popup to admins without 2FA
 * Banning a source uses POST /access-bans { mode: "source" } (section accessBans);
 * banning an account uses the ban dialog's own endpoint.
 */

const express = require("express");
const state = require("../runtime/sharedState");
const sec = require("../lib/securitySettings");
const events = require("../lib/securityEvents");
const locks = require("../lib/securityLocks");
const center = require("../lib/securityCenter");
const history = require("../lib/settingsHistory");
const { applySettingsChange } = require("../lib/systemSettingsChange");

const router = express.Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getIo(req) {
  return req.app?.get?.("io") || null;
}

function fail(res, err, fallback) {
  const status = err?.status || 500;
  if (status >= 500) console.error("[security]", err?.message || err);
  return res.status(status).json({ error: status >= 500 ? fallback : err.message, code: err?.code || null });
}

router.get("/security/overview", async (req, res) => {
  try {
    const data = await center.overview({ totpKnown: req.adminTotpKnown !== false });
    res.set("Cache-Control", "no-store");
    res.json(data);
  } catch (err) {
    fail(res, err, "Could not load the security overview.");
  }
});

router.get("/security/events", async (req, res) => {
  try {
    const filter = Object.prototype.hasOwnProperty.call(events.FILTERS, String(req.query.filter || "")) ? String(req.query.filter) : null;
    const before = req.query.before && Number.isFinite(Date.parse(req.query.before)) ? new Date(req.query.before).toISOString() : null;
    const sourceRef = /^[0-9a-f]{16,64}$/.test(String(req.query.sourceRef || "")) ? String(req.query.sourceRef) : null;
    const userId = UUID_RE.test(String(req.query.userId || "")) ? String(req.query.userId) : null;
    const page = await events.listFeed({ filter, before, limit: req.query.limit, sourceRef, userId });
    res.set("Cache-Control", "no-store");
    res.json(page);
  } catch (err) {
    fail(res, err, "Could not load the security feed.");
  }
});

router.get("/security/events/:id", async (req, res) => {
  try {
    const row = await events.getEvent(req.params.id);
    if (!row) return res.status(404).json({ error: "Event not found.", code: "NOT_FOUND" });
    const event = events.publicEvent(row);
    const [bySource, byUser] = await Promise.all([
      event.sourceRef ? events.listFeed({ sourceRef: event.sourceRef, limit: 25 }) : { events: [] },
      event.userId ? events.listFeed({ userId: event.userId, limit: 25 }) : { events: [] },
    ]);
    let banned = false;
    try {
      banned = Boolean(require("../lib/accessBans").match({ ip: row.ip_hash || null, network: row.net_hash || null }));
    } catch {
      banned = false;
    }
    res.set("Cache-Control", "no-store");
    res.json({ event, related: { bySource: bySource.events.filter((e) => e.id !== event.id), byUser: byUser.events.filter((e) => e.id !== event.id) }, sourceBanned: banned });
  } catch (err) {
    fail(res, err, "Could not load the event.");
  }
});

router.get("/security/impact", async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    res.json(await center.impact(getIo(req)));
  } catch (err) {
    fail(res, err, "Could not load the impact preview.");
  }
});

router.patch("/security/settings", async (req, res) => {
  const v = sec.validateSettingsPatch(req.body || {});
  if (v.error) return res.status(400).json({ error: "Invalid settings.", code: v.error === "empty" ? "EMPTY_PATCH" : "BAD_VALUE", key: v.key || null });
  const reason = sec.cleanText(req.body?.reason);
  if (sec.patchNeedsReason(v.patch) && reason.length < 3) return res.status(400).json({ error: "A reason is required.", code: "REASON_REQUIRED" });
  try {
    const io = getIo(req);
    const result = await applySettingsChange({
      patch: v.patch,
      actor: req.user,
      reason: reason || null,
      source: "security",
      action: "security_settings",
      meta: { recommended: Boolean(req.body?.recommended) },
      io,
    });
    res.json({ ok: true, changes: result.changes, entry: result.entry, settings: sec.securityView(state.systemConfig), persisted: result.persisted });
  } catch (err) {
    fail(res, err, "Could not save the settings.");
  }
});

router.post("/security/locks", async (req, res) => {
  const b = req.body || {};
  try {
    const out = await locks.startLocks({ modes: b.modes, duration: String(b.duration || ""), reason: b.reason, banner: b.banner !== false, actor: req.user, io: getIo(req) });
    res.status(201).json({ ok: true, ...out, settings: sec.securityView(state.systemConfig) });
  } catch (err) {
    fail(res, err, "Could not start the lock.");
  }
});

router.post("/security/locks/lift", async (req, res) => {
  const b = req.body || {};
  try {
    const out = await locks.liftLocks({ modes: b.modes, reason: b.reason, actor: req.user, io: getIo(req) });
    res.json({ ok: true, ...out, settings: sec.securityView(state.systemConfig) });
  } catch (err) {
    fail(res, err, "Could not lift the lock.");
  }
});

router.post("/security/locks/extend", async (req, res) => {
  const b = req.body || {};
  try {
    const out = await locks.extendLock({ mode: b.mode, minutes: b.minutes === null ? null : b.minutes, actor: req.user, io: getIo(req) });
    res.json({ ok: true, ...out, settings: sec.securityView(state.systemConfig) });
  } catch (err) {
    fail(res, err, "Could not change the lock.");
  }
});

router.get("/security/history", async (req, res) => {
  try {
    const category = sec.HISTORY_CATEGORIES.includes(String(req.query.category || "")) ? String(req.query.category) : null;
    const before = req.query.before && Number.isFinite(Date.parse(req.query.before)) ? new Date(req.query.before).toISOString() : null;
    const { entries, persistent } = await history.list({ category, before, limit: req.query.limit });
    const now = Date.now();
    const live = sec.activeLocks(state.systemConfig, now);
    const rows = entries.map((e) => {
      const lockKeys = e.changes.filter((c) => String(c.key).startsWith("lock."));
      const isLockStart = lockKeys.length > 0 && lockKeys.every((c) => c.from == null && c.to);
      // A lock entry can be undone while that same lock is still on (undo = lift it now).
      const lockLive = isLockStart && lockKeys.some((c) => {
        const mode = c.key.slice(5);
        return live[mode] && e.meta && Array.isArray(e.meta.modes) && e.meta.modes.includes(mode) && Math.abs(Date.parse(live[mode].startedAt) - Date.parse(e.at)) < 60000;
      });
      const settingKeys = e.changes.filter((c) => !String(c.key).startsWith("lock."));
      // A revert is the final word: it is never offered as a revert of a revert.
      const revertible = !e.revertedAt && !e.revertOf && (lockLive || (settingKeys.length > 0 && Object.keys(sec.revertPatch(settingKeys)).length > 0 && !lockKeys.length));
      return {
        ...e,
        isLock: lockKeys.length > 0,
        lockLive,
        revertible,
        stale: revertible && !lockKeys.length ? sec.staleKeys(settingKeys, state.systemConfig, now) : [],
      };
    });
    res.set("Cache-Control", "no-store");
    res.json({ entries: rows, persistent, nextBefore: entries.length ? entries[entries.length - 1].at : null });
  } catch (err) {
    fail(res, err, "Could not load the settings history.");
  }
});

router.post("/security/history/:id/revert", async (req, res) => {
  const reason = sec.cleanText(req.body?.reason);
  if (reason.length < 3) return res.status(400).json({ error: "A reason is required.", code: "REASON_REQUIRED" });
  try {
    const entry = await history.get(req.params.id);
    if (!entry) return res.status(404).json({ error: "Change not found.", code: "NOT_FOUND" });
    if (entry.revertOf) return res.status(409).json({ error: "This change can't be reverted.", code: "NOT_REVERTIBLE" });
    if (entry.revertedAt) return res.status(409).json({ error: "This change was already reverted.", code: "ALREADY_REVERTED" });
    const io = getIo(req);
    const lockKeys = entry.changes.filter((c) => String(c.key).startsWith("lock.") && c.from == null && c.to);
    let result;
    if (lockKeys.length) {
      const live = sec.activeLocks(state.systemConfig);
      const modes = lockKeys.map((c) => c.key.slice(5)).filter((m) => live[m] && Math.abs(Date.parse(live[m].startedAt) - Date.parse(entry.at)) < 60000);
      if (!modes.length) return res.status(409).json({ error: "This lock already ended.", code: "LOCK_ENDED" });
      const out = await locks.liftLocks({ modes, reason, actor: req.user, io });
      result = { changes: out.entry?.changes || [], entry: out.entry };
    } else {
      const patch = sec.revertPatch(entry.changes);
      if (!Object.keys(patch).length) return res.status(409).json({ error: "This change can't be reverted.", code: "NOT_REVERTIBLE" });
      result = await applySettingsChange({
        patch,
        actor: req.user,
        reason,
        source: "revert",
        action: "security_settings_revert",
        title: entry.title,
        meta: { revertOf: entry.id },
        revertOf: entry.id,
        io,
      });
    }
    await history.markReverted(entry.id, req.user);
    res.json({ ok: true, changes: result.changes, entry: result.entry, settings: sec.securityView(state.systemConfig) });
  } catch (err) {
    fail(res, err, "Could not revert the change.");
  }
});

router.post("/security/remind-2fa", async (req, res) => {
  try {
    const out = await center.remindTwoFactor({ io: getIo(req), actor: req.user });
    state.appendAudit(req.user.id, req.user.username, "security_remind_2fa", `${out.missing}`, { people: out.people, reached: out.reached });
    res.json({ ok: true, ...out });
  } catch (err) {
    fail(res, err, "Could not send the reminder.");
  }
});

module.exports = router;
