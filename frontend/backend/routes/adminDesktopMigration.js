"use strict";

/**
 * Yönetici Paneli › Masaüstü geçişi (Electron -> Tauri). Mounted inside routes/admin.js:
 * requireAuth + requireAdmin + admin 2FA + step-up on every write + section "system"
 * (lib/adminPermissions: an unlisted path needs "system"; the owner always has it).
 *
 *   GET   /desktop-migration                    config, signing key status, live counters,
 *                                               funnel, failure reasons, recent reports
 *   PATCH /desktop-migration { patch, reason }  percent, allowlist, minWinBuild, artifacts...
 *   POST  /desktop-migration/kill { on, reason }            kill switch (instant stop)
 *   POST  /desktop-migration/allowlist { user, op, reason } add / remove one user (id or
 *                                               username): the owner's own account first
 *   GET   /desktop-migration/preview?user=&build=           what that user's plan would say
 *
 * Every write is audited (runtime/sharedState.appendAudit) with the reason.
 */

const express = require("express");
const supabase = require("../db/supabase");
const state = require("../runtime/sharedState");
const { apiError } = require("../lib/apiError");
const dm = require("../lib/desktopMigration");
const store = require("../runtime/desktopMigrationStore");

const router = express.Router();
const USERNAME_RE = /^[A-Za-z0-9_.-]{2,32}$/;

function cleanReason(r) {
  const s = String(r || "").trim().replace(/\s+/g, " ");
  return s.length >= 3 ? s.slice(0, 300) : null;
}

function bad(res, code, field) {
  return res.status(400).json(apiError("Invalid request body.", undefined, { code, field }));
}

function needReason(res) {
  return res.status(400).json(apiError("Write a short reason (it goes to the audit log).", undefined, { code: "reason_required" }));
}

function fail(res, err) {
  console.error("[admin/desktop-migration]", err?.message || err);
  return res.status(500).json(apiError("Internal server error", undefined, { code: "server_error" }));
}

async function usernames(ids) {
  if (!ids.length) return [];
  try {
    const { data } = await supabase.from("users").select("id, username").in("id", ids);
    const byId = new Map((data || []).map((u) => [String(u.id).toLowerCase(), u.username]));
    return ids.map((id) => ({ id, username: byId.get(id) || null }));
  } catch {
    return ids.map((id) => ({ id, username: null }));
  }
}

async function resolveUser(input) {
  const s = String(input || "").trim();
  if (dm.UUID_RE.test(s)) {
    const { data } = await supabase.from("users").select("id, username").eq("id", s.toLowerCase()).maybeSingle();
    return data ? { id: String(data.id).toLowerCase(), username: data.username } : null;
  }
  if (!USERNAME_RE.test(s)) return null;
  const { data } = await supabase.from("users").select("id, username").ilike("username", s.replace(/[\\%_]/g, (c) => `\\${c}`)).maybeSingle();
  return data ? { id: String(data.id).toLowerCase(), username: data.username } : null;
}

function signingInfo() {
  const key = dm.signingKey();
  return key ? { configured: true, keyId: key.keyId, publicKeySpki: key.publicKeySpki } : { configured: false, keyId: null, publicKeySpki: null };
}

async function overview() {
  const cfg = await store.getConfig({ fresh: true });
  const { rows, source } = await store.listReports();
  return {
    config: cfg.config,
    persisted: cfg.persisted,
    storage: { ...store.status(), reports: source },
    signing: signingInfo(),
    allowlistUsers: await usernames(cfg.config.allowlist),
    summary: dm.summarize(rows),
    recent: rows.slice(0, 50).map((r) => ({
      at: r.created_at,
      userId: r.user_id,
      installId: r.install_id,
      migrationId: r.migration_id,
      event: r.event,
      step: r.step,
      code: r.code,
      durationMs: r.duration_ms,
      strategy: r.strategy,
      perMachine: r.per_machine,
      winBuild: r.win_build,
      appVersion: r.app_version,
      electronVersion: r.electron_version,
    })),
    // What a fleet-wide stop would need, so the console can show it next to the switch.
    live: { offPlan: cfg.config.killSwitch || (!cfg.config.percent && !cfg.config.allowlist.length) },
  };
}

router.get("/desktop-migration", async (_req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    res.json(await overview());
  } catch (err) {
    fail(res, err);
  }
});

async function save(req, res, nextConfig, action, meta) {
  const before = (await store.getConfig({ fresh: true })).config;
  const saved = await store.saveConfig(nextConfig, req.user.id);
  state.appendAudit(req.user.id, req.user.username, action, "desktop-migration", { ...meta, before: diffKeys(before, nextConfig), persisted: saved.persisted });
  res.json({ config: saved.config, persisted: saved.persisted });
}

/** { key: [old, new] } for changed top-level keys (artifact objects summarised). */
function diffKeys(a, b) {
  const out = {};
  for (const k of Object.keys(b)) {
    const x = JSON.stringify(a?.[k] ?? null);
    const y = JSON.stringify(b[k] ?? null);
    if (x !== y) out[k] = k === "migrator" || k === "setup" ? [a?.[k]?.sha256 || null, b[k]?.sha256 || null] : [a?.[k] ?? null, b[k]];
  }
  return out;
}

router.patch("/desktop-migration", express.json({ limit: "32kb" }), async (req, res) => {
  try {
    const reason = cleanReason(req.body?.reason);
    if (!reason) return needReason(res);
    const current = (await store.getConfig({ fresh: true })).config;
    const r = dm.applyPatch(current, req.body?.patch);
    if (r.error) return bad(res, r.error, r.field);
    return await save(req, res, r.config, "desktop_migration_update", { reason });
  } catch (err) {
    return fail(res, err);
  }
});

router.post("/desktop-migration/kill", express.json(), async (req, res) => {
  try {
    if (typeof req.body?.on !== "boolean") return bad(res, "bad_kill_switch", "on");
    const reason = cleanReason(req.body?.reason);
    if (!reason) return needReason(res);
    const current = (await store.getConfig({ fresh: true })).config;
    const r = dm.applyPatch(current, { killSwitch: req.body.on });
    return await save(req, res, r.config, req.body.on ? "desktop_migration_kill" : "desktop_migration_resume", { reason });
  } catch (err) {
    return fail(res, err);
  }
});

router.post("/desktop-migration/allowlist", express.json(), async (req, res) => {
  try {
    const op = String(req.body?.op || "");
    if (op !== "add" && op !== "remove") return bad(res, "bad_op", "op");
    const reason = cleanReason(req.body?.reason);
    if (!reason) return needReason(res);
    const current = (await store.getConfig({ fresh: true })).config;
    let id = String(req.body?.user || "").trim().toLowerCase();
    let username = null;
    if (op === "add" || !current.allowlist.includes(id)) {
      const u = await resolveUser(req.body?.user);
      if (!u) return res.status(404).json(apiError("User not found."));
      ({ id, username } = u);
    }
    const list = op === "add" ? [...new Set([...current.allowlist, id])] : current.allowlist.filter((x) => x !== id);
    const r = dm.applyPatch(current, { allowlist: list });
    if (r.error) return bad(res, r.error, r.field);
    return await save(req, res, r.config, op === "add" ? "desktop_migration_allow" : "desktop_migration_disallow", { reason, userId: id, username });
  } catch (err) {
    return fail(res, err);
  }
});

router.get("/desktop-migration/preview", async (req, res) => {
  try {
    const u = await resolveUser(req.query.user);
    if (!u) return res.status(404).json(apiError("User not found."));
    const { config } = await store.getConfig();
    const build = Number(req.query.build) || 22631;
    const ctx = { installId: "preview-install-0000", winBuild: build, arch: "x64", platform: "win32", userId: u.id, signingReady: Boolean(dm.signingKey()) };
    const decision = dm.evaluate(config, ctx);
    return res.json({ user: u, decision, bucket: dm.bucketOf(u.id, config.salt), threshold: Math.round(config.percent * 100) });
  } catch (err) {
    return fail(res, err);
  }
});

module.exports = router;
