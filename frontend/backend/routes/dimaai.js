"use strict";

const express = require("express");
const multer = require("multer");
const { requireAuth } = require("../middleware/auth");
const conversations = require("../lib/ai/conversations");
const { completeWithFailover, getKeyPool } = require("../lib/ai/provider-manager");
const activeRuns = require("../lib/ai/activeRuns");
const { PUBLIC_ASSISTANT_NAME, PUBLIC_PRODUCT_NAME } = require("../lib/ai/provider");
const { toolCatalogPublic } = require("../lib/ai/tools");
const {
  assertMessage,
  allowUser,
  allowIp,
} = require("../lib/ai/rateLimit");
const {
  USER_UNAVAILABLE,
  USER_GENERIC,
  USER_RATE,
  USER_QUOTA,
  USER_TOO_LONG,
  publicErrorForStatus,
  publicErrorForCode,
  logInternal,
} = require("../lib/ai/sanitize");
const userSettings = require("../lib/ai/userSettings");
const memories = require("../lib/ai/memories");
const attachments = require("../lib/ai/attachments");
const { publicTiers, normalizeTier, preferredProviderForTier } = require("../lib/ai/modelTiers");
const { MAX_UPLOAD_BYTES } = require("../lib/ai/fileExtract");
const { isPlatformAdmin } = require("../lib/ai/adminGate");
const agentActions = require("../lib/ai/agentActions");
const { stripAgentDraftChrome } = require("../lib/ai/stripAgentDraft");
const { runPythonSandbox, MAX_CODE } = require("../lib/ai/pythonSandbox.cjs");

const router = express.Router();
router.use(requireAuth);
router.use((_req, res, next) => {
  // Private per-account payloads — never let a CDN/browser reuse account A's GET for B.
  res.set("Cache-Control", "private, no-store, no-cache, must-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Vary", "Authorization");
  next();
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
});

function assistantContentForStore(content, pendingActions) {
  return stripAgentDraftChrome(String(content || ""), {
    hasPendingCard: Array.isArray(pendingActions) && pendingActions.length > 0,
  });
}

function sseWrite(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
  // Critical: without flush, proxies/Node buffer SSE → client sees one dump.
  if (typeof res.flush === "function") res.flush();
}

/** Split large model chunks so the client can animate word-by-word. */
function sseWriteText(res, event, text, { max = 24 } = {}) {
  const s = String(text || "");
  if (!s) return;
  if (s.length <= max) {
    sseWrite(res, event, { t: s });
    return;
  }
  let i = 0;
  while (i < s.length) {
    let end = Math.min(i + max, s.length);
    if (end < s.length) {
      const slice = s.slice(i, Math.min(end + 8, s.length));
      const sp = slice.search(/\s/);
      if (sp > 0) end = i + sp + 1;
    }
    sseWrite(res, event, { t: s.slice(i, end) });
    i = end;
  }
}

const RETRY_AFTER_MS = 15000;

function publicFail(res, err, req) {
  const locale = req?.headers?.["accept-language"] || "";
  if (err?.code === "too_long") return res.status(400).json({ error: USER_TOO_LONG });
  if (err?.code === "empty") return res.status(400).json({ error: "Please enter a message." });
  if (err?.code === "quota") {
    return res.status(429).json({ error: publicErrorForCode("quota", 429, { locale }), code: "quota", retryAfterMs: RETRY_AFTER_MS });
  }
  if (err?.code === "too_large") return res.status(400).json({ error: "File is too large (max 12MB)." });
  if (err?.code === "bad_type") return res.status(400).json({ error: "Unsupported file type." });
  if (err?.code === "no_keys" || err?.code === "unavailable" || err?.code === "auth") {
    const body = { error: USER_UNAVAILABLE };
    if (err?.code === "unavailable" || err?.code === "no_keys") {
      body.code = "unavailable";
      body.retryAfterMs = RETRY_AFTER_MS;
    }
    return res.status(503).json(body);
  }
  logInternal("api", err);
  return res.status(500).json({ error: publicErrorForCode(err?.code, 500, { locale }) });
}

router.get("/meta", (_req, res) => {
  res.json({
    product: PUBLIC_PRODUCT_NAME,
    assistant: PUBLIC_ASSISTANT_NAME,
    tagline: "Your personal Descall agent.",
    version: "1.1",
    tools: toolCatalogPublic(),
    modelTiers: publicTiers(),
    uploads: {
      maxBytes: MAX_UPLOAD_BYTES,
      types: ["pdf", "txt", "docx", "csv", "images"],
    },
  });
});


router.get("/models", async (req, res) => {
  try {
    const pool = await getKeyPool();
    const providers = new Set(
      pool.map((k) => k.provider || (String(k.apiKey || "").startsWith("gsk_") ? "groq" : "gemini")),
    );
    // Public payload: labels + availability only — never raw provider/model ids.
    const tiers = publicTiers().map((tier) => ({
      ...tier,
      available: providers.has(preferredProviderForTier(tier.id)),
    }));
    res.json({ tiers });
  } catch (err) {
    logInternal("models-list", err);
    res.status(500).json({ error: "Could not load models." });
  }
});

router.get("/settings", async (req, res) => {
  try {
    const isAdmin = await isPlatformAdmin(req.user);
    const row = await userSettings.getSettings(req.user.id);
    res.json({ settings: userSettings.publicSettings(row, { isAdmin }) });
  } catch (err) {
    logInternal("settings-get", err);
    res.status(500).json({ error: USER_GENERIC });
  }
});

router.put("/settings", async (req, res) => {
  try {
    const isAdmin = await isPlatformAdmin(req.user);
    if (req.body?.nsfwEnabled !== undefined && !isAdmin) {
      return res.status(403).json({ error: "Not authorized." });
    }
    const row = await userSettings.upsertSettings(
      req.user.id,
      {
        memoryEnabled: req.body?.memoryEnabled,
        ttsEnabled: req.body?.ttsEnabled,
        customInstructions: req.body?.customInstructions,
        modelTier: req.body?.modelTier,
        nsfwEnabled: req.body?.nsfwEnabled,
        agentEnabled: req.body?.agentEnabled,
      },
      { isAdmin },
    );
    res.json({ settings: userSettings.publicSettings(row, { isAdmin }) });
  } catch (err) {
    if (err?.code === "forbidden" || err?.status === 403) {
      return res.status(403).json({ error: "Not authorized." });
    }
    logInternal("settings-put", err);
    res.status(500).json({
      error: publicErrorForCode(err?.code, 400, { locale: req.headers["accept-language"] || "" }),
    });
  }
});

router.post("/run-python", async (req, res) => {
  try {
    if (!allowUser(req.user.id)) {
      return res.status(429).json({ error: USER_RATE, code: "rate" });
    }
    const code = String(req.body?.code || "");
    if (!code.trim()) {
      return res.status(400).json({ ok: false, stdout: "", stderr: "Empty code." });
    }
    if (code.length > MAX_CODE) {
      return res.status(413).json({ ok: false, stdout: "", stderr: "Code is too long to run." });
    }
    const result = await runPythonSandbox(code);
    return res.json(result);
  } catch (err) {
    logInternal("run-python", err);
    return res.status(500).json({
      ok: false,
      stdout: "",
      stderr: publicErrorForCode(err?.code, 500, { locale: req.headers["accept-language"] || "" }),
    });
  }
});

router.get("/memories", async (req, res) => {
  try {
    const items = await memories.listMemoriesSafe(req.user.id);
    res.json({ memories: items });
  } catch (err) {
    logInternal("memories-list", err);
    res.status(500).json({ error: USER_GENERIC });
  }
});

router.delete("/memories/:id", async (req, res) => {
  try {
    await memories.deleteMemory(req.user.id, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    logInternal("memories-del", err);
    res.status(500).json({ error: USER_GENERIC });
  }
});

router.post("/actions/:id/confirm", async (req, res) => {
  try {
    const editedText = req.body?.text !== undefined ? String(req.body.text) : undefined;
    const out = await agentActions.confirmPending(req.user.id, req.params.id, {
      editedText,
      io: req.app.get("io"),
    });
    if (out.error) {
      return res.status(out.status || 400).json({ error: out.error, action: out.action || null });
    }
    res.json({ ok: true, action: out.action, result: out.result });
  } catch (err) {
    logInternal("agent-confirm", err);
    res.status(500).json({ error: USER_GENERIC });
  }
});

router.post("/actions/:id/reject", async (req, res) => {
  try {
    const out = await agentActions.rejectPending(req.user.id, req.params.id);
    if (out.error) {
      return res.status(out.status || 400).json({ error: out.error, action: out.action || null });
    }
    res.json({ ok: true, action: out.action });
  } catch (err) {
    logInternal("agent-reject", err);
    res.status(500).json({ error: USER_GENERIC });
  }
});

router.post("/upload", (req, res) => {
  upload.single("file")(req, res, async (multerErr) => {
    if (multerErr) {
      if (multerErr.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ error: "File is too large (max 12MB)." });
      }
      return res.status(400).json({ error: "Upload failed." });
    }
    try {
      const out = await attachments.createAttachment({
        userId: req.user.id,
        file: req.file,
        conversationId: req.body?.conversationId || null,
      });
      res.json({
        attachment: attachments.publicAttachment(out.attachment),
        previewText: out.previewText,
      });
    } catch (err) {
      return publicFail(res, err, req);
    }
  });
});

router.get("/conversations", async (req, res) => {
  try {
    const items = await conversations.listConversations(req.user.id, {
      q: req.query.q || req.query.search || "",
    });
    res.json({ conversations: items });
  } catch (err) {
    logInternal("list", err);
    res.status(500).json({ error: USER_GENERIC });
  }
});

router.post("/conversations", async (req, res) => {
  try {
    const created = await conversations.createConversation(
      req.user.id,
      req.body?.title || "New chat",
      { modelTier: req.body?.modelTier },
    );
    res.json({ conversation: created });
  } catch (err) {
    logInternal("create", err);
    res.status(500).json({
      error: publicErrorForCode(err?.code, 400, { locale: req.headers["accept-language"] || "" }),
    });
  }
});

router.get("/conversations/:id", async (req, res) => {
  try {
    const [pack, pending] = await Promise.all([
      conversations.listMessages(req.user.id, req.params.id),
      agentActions.listPendingForConversation(req.user.id, req.params.id),
    ]);
    if (!pack) return res.status(404).json({ error: "Conversation not found." });
    const listedIds = [];
    for (const m of pack.messages || []) {
      for (const a of m.meta?.pendingActions || []) {
        if (a?.id) listedIds.push(a.id);
      }
    }
    const hydrated = await agentActions.getActionsByIds(req.user.id, listedIds);
    const byId = new Map([
      ...pending.map((a) => [a.id, a]),
      ...hydrated.map((a) => [a.id, a]),
    ]);
    pack.messages = pack.messages.map((m) => {
      const listed = Array.isArray(m.meta?.pendingActions) ? m.meta.pendingActions : [];
      if (!listed.length) return m;
      const next = listed.map((a) => byId.get(a.id) || a);
      return { ...m, meta: { ...m.meta, pendingActions: next } };
    });
    res.json({ ...pack, pendingActions: pending });
  } catch (err) {
    logInternal("get", err);
    res.status(500).json({ error: USER_GENERIC });
  }
});

router.patch("/conversations/:id", async (req, res) => {
  try {
    const updated = await conversations.patchConversation(req.user.id, req.params.id, {
      title: req.body?.title,
      isFavorite: req.body?.isFavorite,
      isPinned: req.body?.isPinned,
      modelTier: req.body?.modelTier,
    });
    if (!updated) return res.status(404).json({ error: "Conversation not found." });
    res.json({ conversation: updated });
  } catch (err) {
    logInternal("patch", err);
    res.status(500).json({ error: USER_GENERIC });
  }
});

router.get("/conversations/:id/export", async (req, res) => {
  try {
    const pack = await conversations.exportConversation(req.user.id, req.params.id);
    if (!pack) return res.status(404).json({ error: "Conversation not found." });
    res.json({
      title: pack.conversation.title,
      markdown: pack.markdown,
      conversation: pack.conversation,
    });
  } catch (err) {
    logInternal("export", err);
    res.status(500).json({ error: USER_GENERIC });
  }
});

router.delete("/conversations/:id", async (req, res) => {
  try {
    const owned = await conversations.getOwnedConversation(req.user.id, req.params.id);
    if (!owned) return res.status(404).json({ error: "Conversation not found." });
    await conversations.deleteConversation(req.user.id, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    logInternal("delete", err);
    res.status(500).json({ error: USER_GENERIC });
  }
});

router.post("/conversations/:id/stop", async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "Missing conversation." });
    const aborted = activeRuns.abortRun(req.user.id, id);
    res.json({ ok: true, aborted });
  } catch (err) {
    res.status(500).json({ error: "Could not stop generation." });
  }
});

router.post("/conversations/:id/messages", async (req, res) => {
  if (!allowIp(req) || !allowUser(req.user.id)) {
    return res.status(429).json({ error: USER_RATE });
  }

  const regenerate = Boolean(req.body?.regenerate);
  const editMessageId = req.body?.editMessageId ? String(req.body.editMessageId) : null;
  const attachmentIds = Array.isArray(req.body?.attachmentIds)
    ? req.body.attachmentIds.map(String).slice(0, 6)
    : [];
  const requestTier = req.body?.modelTier ? normalizeTier(req.body.modelTier) : null;

  let content;
  try {
    content = regenerate && !editMessageId && !String(req.body?.content || "").trim()
      ? " "
      : assertMessage(req.body?.content || (attachmentIds.length ? "(attachment)" : ""));
  } catch (err) {
    return publicFail(res, err, req);
  }

  try {
    let conversation = await conversations.getOwnedConversation(req.user.id, req.params.id);
    if (!conversation) return res.status(404).json({ error: "Conversation not found." });

    const settingsRow = await userSettings.getSettings(req.user.id);
    const isAdmin = await isPlatformAdmin(req.user);
    const settings = userSettings.publicSettings(settingsRow, { isAdmin });
    const nsfwMode = Boolean(isAdmin && settingsRow?.nsfw_enabled);
    const modelTier = requestTier || normalizeTier(conversation.model_tier || settings.modelTier);
    const memoryEnabled = settings.memoryEnabled;
    const agentEnabled = Boolean(settings.agentEnabled);
    const memoryBlock = await memories.memoryBlockForPrompt(req.user.id, memoryEnabled);

    const ownedAtts = attachmentIds.length
      ? await attachments.getOwnedAttachments(req.user.id, attachmentIds)
      : [];
    const imageParts = ownedAtts.length ? await attachments.loadImageParts(ownedAtts) : [];
    const enrichedContent = ownedAtts.length
      ? attachments.buildUserContentWithAttachments(
          content === "(attachment)" ? "" : content,
          ownedAtts,
        )
      : content;

    const userMeta = ownedAtts.length
      ? {
          attachments: ownedAtts.map((a) => attachments.publicAttachment(a)),
        }
      : undefined;

    const ctx = await conversations.contextForComplete(req.user.id, conversation.id);
    let history = ctx.messages;

    if (editMessageId) {
      const removed = await conversations.deleteMessagesFrom(
        req.user.id,
        conversation.id,
        editMessageId,
      );
      if (!removed || removed.role !== "user") {
        return res.status(400).json({ error: USER_GENERIC });
      }
      const userMsg = await conversations.insertMessage({
        userId: req.user.id,
        conversationId: conversation.id,
        role: "user",
        content: enrichedContent,
        meta: userMeta,
      });
      const fresh = await conversations.contextForComplete(req.user.id, conversation.id);
      history = fresh.messages;
      await conversations.touchConversation(req.user.id, conversation.id, enrichedContent);
      void userMsg;
    } else if (regenerate) {
      const lastAssistant = [...(ctx.stored || [])].reverse().find((m) => m.role === "assistant");
      if (lastAssistant) {
        await conversations.deleteMessage(req.user.id, lastAssistant.id);
        history = history.filter((_, idx) => !(idx === history.length - 1 && history[idx].role === "assistant"));
        if (history[history.length - 1]?.role !== "user") {
          return res.status(400).json({ error: USER_GENERIC });
        }
      }
    } else {
      const userMsg = await conversations.insertMessage({
        userId: req.user.id,
        conversationId: conversation.id,
        role: "user",
        content: enrichedContent,
        meta: userMeta,
      });
      history = [...history, { role: "user", content: userMsg.content }];
      if (ctx.stored.length === 0) {
        await conversations.touchConversation(req.user.id, conversation.id, enrichedContent);
      } else {
        await conversations.touchConversation(req.user.id, conversation.id);
      }
    }

    if (ownedAtts.length) {
      await attachments.markConsumed(req.user.id, ownedAtts.map((a) => a.id), conversation.id);
      // Attach image parts to the latest user turn for multimodal.
      if (imageParts.length) {
        for (let i = history.length - 1; i >= 0; i -= 1) {
          if (history[i].role === "user") {
            history[i] = { ...history[i], imageParts };
            break;
          }
        }
      }
    }

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "private, no-store, no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    if (typeof res.flushHeaders === "function") res.flushHeaders();

    const abort = new AbortController();
    activeRuns.registerRun(req.user.id, conversation.id, abort);
    const tripAbort = () => {
      try { abort.abort(); } catch { /* ignore */ }
    };
    req.on("aborted", tripAbort);
    req.on("close", tripAbort);
    res.on("close", tripAbort);

    sseWrite(res, "meta", {
      assistant: PUBLIC_ASSISTANT_NAME,
      conversationId: conversation.id,
      modelTier,
    });

    let full = "";
    let thought = "";
    let citations;
    const pendingActions = [];
    try {
      const result = await completeWithFailover({
        messages: history,
        signal: abort.signal,
        userId: req.user.id,
        locale: req.headers["accept-language"] || "",
        modelTier,
        customInstructions: settings.customInstructions,
        memoryBlock,
        memoryEnabled,
        nsfwMode,
        agentEnabled,
        conversationId: conversation.id,
        io: req.app.get("io"),
        onPendingAction: (action) => {
          if (!action?.id) return;
          pendingActions.push(action);
          sseWrite(res, "pending_action", { action });
        },
        onToken: (chunk) => {
          full += chunk;
          sseWriteText(res, "token", chunk);
        },
        onThought: (chunk) => {
          thought += chunk;
          sseWriteText(res, "thought", chunk, { max: 28 });
        },
      });
      full = result.text || full;
      if (result.thought) thought = result.thought;
      if (result.citations?.length) citations = result.citations;
    } catch (err) {
      if (err?.code === "aborted") {
        const stoppedContent = assistantContentForStore(full, pendingActions);
        const stoppedThought = String(thought || "").trim();
        // Persist thought-only Stop during Thinking — otherwise client reload wipes the panel.
        if (stoppedContent || stoppedThought || pendingActions.length) {
          const stopMeta = { stopped: true };
          if (citations?.length) stopMeta.citations = citations;
          if (stoppedThought) stopMeta.thought = stoppedThought;
          if (pendingActions.length) stopMeta.pendingActions = pendingActions;
          await conversations.insertMessage({
            userId: req.user.id,
            conversationId: conversation.id,
            role: "assistant",
            content: stoppedContent || "",
            meta: stopMeta,
          });
          await conversations.touchConversation(req.user.id, conversation.id);
        }
        sseWrite(res, "stopped", {
          ok: true,
          thought: stoppedThought || undefined,
          citations,
          content: stoppedContent || undefined,
          pendingActions: pendingActions.length ? pendingActions : undefined,
        });
        activeRuns.clearRun(req.user.id, conversation.id, abort);
        return res.end();
      }
      activeRuns.clearRun(req.user.id, conversation.id, abort);
      const status = err?.causeStatus || 503;
      const errCode = err?.code;
      const payload = {
        error: publicErrorForCode(errCode, status, {
          locale: req.headers["accept-language"] || "",
        }),
      };
      if (errCode === "quota" || errCode === "missing_provider") {
        payload.code = errCode;
      } else if (errCode === "unavailable" || errCode === "no_keys") {
        payload.code = "unavailable";
      }
      if (errCode === "quota" || errCode === "unavailable" || errCode === "no_keys") {
        payload.retryAfterMs = RETRY_AFTER_MS;
      }
      sseWrite(res, "error", payload);
      return res.end();
    }

    // Proxy may keep the upstream alive after client Stop — honor abort before persist.
    if (abort.signal.aborted) {
      const stoppedContent = assistantContentForStore(full, pendingActions);
      const stoppedThought = String(thought || "").trim();
      if (stoppedContent || stoppedThought || pendingActions.length) {
        const stopMeta = { stopped: true };
        if (citations?.length) stopMeta.citations = citations;
        if (stoppedThought) stopMeta.thought = stoppedThought;
        if (pendingActions.length) stopMeta.pendingActions = pendingActions;
        await conversations.insertMessage({
          userId: req.user.id,
          conversationId: conversation.id,
          role: "assistant",
          content: stoppedContent || "",
          meta: stopMeta,
        });
        await conversations.touchConversation(req.user.id, conversation.id);
      }
      try { sseWrite(res, "stopped", { ok: true, thought: stoppedThought || undefined, content: stoppedContent || undefined, pendingActions: pendingActions.length ? pendingActions : undefined }); } catch { /* ignore */ }
      activeRuns.clearRun(req.user.id, conversation.id, abort);
      return res.end();
    }

    full = assistantContentForStore(full, pendingActions);
    if (!full && !pendingActions.length) {
      sseWrite(res, "error", { error: USER_UNAVAILABLE });
      activeRuns.clearRun(req.user.id, conversation.id, abort);
      return res.end();
    }

    const assistantMeta = {};
    if (citations?.length) assistantMeta.citations = citations;
    if (thought) assistantMeta.thought = String(thought).trim();
    if (pendingActions.length) assistantMeta.pendingActions = pendingActions;
    const assistant = await conversations.insertMessage({
      userId: req.user.id,
      conversationId: conversation.id,
      role: "assistant",
      content: full,
      meta: Object.keys(assistantMeta).length ? assistantMeta : undefined,
    });
    await conversations.touchConversation(req.user.id, conversation.id);
    sseWrite(res, "done", {
      message: { ...assistant, citations, pendingActions: pendingActions.length ? pendingActions : undefined },
      thought: thought ? String(thought).trim() : undefined,
      citations,
      pendingActions: pendingActions.length ? pendingActions : undefined,
    });
    activeRuns.clearRun(req.user.id, conversation.id, abort);
    res.end();
  } catch (err) {
    if (res.headersSent) {
      sseWrite(res, "error", {
        error: publicErrorForCode("error", 500, { locale: req.headers["accept-language"] || "" }),
      });
      return res.end();
    }
    return publicFail(res, err, req);
  }
});

module.exports = router;
