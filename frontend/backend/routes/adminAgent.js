"use strict";

/**
 * Admin agent API (phase 1). Mounted inside the admin router, so every route already
 * passed requireAuth, requireAdmin, the admin rate limit, admin 2FA and the "agent"
 * section check. Chat streams Server-Sent Events. Settings (on/off, monthly budget)
 * are owner-only and, as a change, need the 2FA step-up.
 */

const express = require("express");
const store = require("../lib/adminAgent/store");
const { runChat, MODEL } = require("../lib/adminAgent/run");
const { BY_NAME } = require("../lib/adminAgent/tools");
const { userIsSuperAdmin } = require("../middleware/requireAdmin");

const router = express.Router();

// English fallbacks; the panel shows its own translation for each code.
const ERR = {
  STATUS_FAILED: "Could not load the agent status.",
  OWNER_ONLY: "Only the owner can change the agent settings.",
  BAD_BUDGET: "Budget must be between 0 and 10000 dollars.",
  SAVE_FAILED: "Could not save the agent settings.",
  LIST_FAILED: "Could not load the conversations.",
  BAD_THREAD: "Invalid conversation.",
  NO_THREAD: "Conversation not found.",
  LOAD_FAILED: "Could not load the conversation.",
  DELETE_FAILED: "Could not delete the conversation.",
  AGENT_FAILED: "The agent could not answer. Try again.",
};
const fail = (res, status, code) => res.status(status).json({ error: ERR[code], code });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.get("/agent/status", async (req, res) => {
  try {
    const [settings, spent, owner] = await Promise.all([store.getSettings(), store.monthSpend(), userIsSuperAdmin(req)]);
    res.set("Cache-Control", "no-store");
    res.json({
      enabled: settings.enabled,
      budgetUsd: settings.monthly_budget_usd,
      spentUsd: Number(spent.toFixed(2)),
      keyConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
      model: MODEL,
      owner,
      phase: 1,
      tablesMissing: Boolean(settings.missing),
    });
  } catch (e) {
    console.error("[admin-agent] status failed:", e?.message || e);
    fail(res, 500, "STATUS_FAILED");
  }
});

router.put("/agent/settings", async (req, res) => {
  if (!(await userIsSuperAdmin(req))) return fail(res, 403, "OWNER_ONLY");
  const patch = {};
  if (typeof req.body?.enabled === "boolean") patch.enabled = req.body.enabled;
  if (req.body?.budgetUsd !== undefined) {
    const n = Number(req.body.budgetUsd);
    if (!Number.isFinite(n) || n < 0 || n > 10000) return fail(res, 400, "BAD_BUDGET");
    patch.monthly_budget_usd = Math.round(n * 100) / 100;
  }
  try {
    const s = await store.saveSettings(patch, req.user.id);
    require("../lib/adminAuditStore").persist({
      id: require("crypto").randomUUID(),
      actorId: req.user.id,
      actorUsername: req.user.username,
      action: "agent_settings",
      target: "admin_agent",
      meta: patch,
    });
    res.json({ enabled: s.enabled, budgetUsd: s.monthly_budget_usd });
  } catch (e) {
    console.error("[admin-agent] settings failed:", e?.message || e);
    fail(res, 500, "SAVE_FAILED");
  }
});

router.get("/agent/threads", async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    res.json({ threads: await store.listThreads(req.user.id) });
  } catch (e) {
    fail(res, 500, "LIST_FAILED");
  }
});

/** Stored API content -> what the panel shows: text and the tools that were used. */
function displayMessages(rows) {
  const out = [];
  for (const row of rows) {
    const blocks = Array.isArray(row.content) ? row.content : [];
    if (row.role === "user") {
      const text = blocks.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
      if (text) out.push({ role: "user", text });
      continue;
    }
    const text = blocks.filter((b) => b.type === "text").map((b) => b.text).join("");
    const tools = blocks
      .filter((b) => b.type === "tool_use")
      .filter((b) => BY_NAME.has(b.name))
      .map((b) => ({ name: b.name }));
    const prev = out[out.length - 1];
    if (prev && prev.role === "assistant") {
      prev.text += text;
      prev.tools.push(...tools);
    } else {
      out.push({ role: "assistant", text, tools });
    }
  }
  return out;
}

router.get("/agent/threads/:id", async (req, res) => {
  if (!UUID.test(req.params.id)) return fail(res, 400, "BAD_THREAD");
  try {
    const thread = await store.getThread(req.params.id, req.user.id);
    if (!thread) return fail(res, 404, "NO_THREAD");
    res.set("Cache-Control", "no-store");
    res.json({ thread, messages: displayMessages(await store.loadMessages(thread.id)) });
  } catch (e) {
    fail(res, 500, "LOAD_FAILED");
  }
});

router.delete("/agent/threads/:id", async (req, res) => {
  if (!UUID.test(req.params.id)) return fail(res, 400, "BAD_THREAD");
  try {
    const ok = await store.deleteThread(req.params.id, req.user.id);
    if (!ok) return fail(res, 404, "NO_THREAD");
    res.json({ ok: true });
  } catch (e) {
    fail(res, 500, "DELETE_FAILED");
  }
});

router.post("/agent/chat", async (req, res) => {
  const threadId = req.body?.threadId ? String(req.body.threadId) : null;
  if (threadId && !UUID.test(threadId)) return fail(res, 400, "BAD_THREAD");

  res.status(200);
  res.set({
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();
  let open = true;
  req.on("close", () => { open = false; });
  const send = (event) => {
    if (!open) return;
    res.write(`data: ${JSON.stringify(event)}\n\n`);
    res.flush?.();
  };
  const ping = setInterval(() => { if (open) { res.write(": ping\n\n"); res.flush?.(); } }, 15000);

  try {
    await runChat({
      adminUser: { id: req.user.id, username: req.user.username },
      authHeader: req.get("authorization"),
      stepUpHeader: req.get("x-admin-step-up") || undefined,
      threadId,
      text: req.body?.message,
      onEvent: send,
    });
  } catch (e) {
    const code = e?.code || (e?.status === 429 ? "RATE_LIMITED" : "AGENT_FAILED");
    if (!e?.code) console.error("[admin-agent] chat failed:", e?.message || e);
    send({ type: "error", code, message: e?.code ? e.message : ERR.AGENT_FAILED });
  } finally {
    clearInterval(ping);
    if (open) res.end();
  }
});

module.exports = router;
module.exports.displayMessages = displayMessages;
