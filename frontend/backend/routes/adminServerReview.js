"use strict";

/**
 * Sunucu inceleme (admin, section serverReview). Mounted inside routes/admin.js
 * after requireAuth, requireAdmin, the admin rate limit, requireAdmin2fa,
 * requireStepUp (every POST / DELETE needs a fresh code) and requireAdminSection.
 *
 * Same guarantees as DM inceleme (3.7.1, routes/admin.js "/dm/*"):
 *  - GET lists and the server detail are metadata only (no message text, no
 *    report snippet);
 *  - the text of one channel comes only from POST .../channels/:channelId/view
 *    with purpose report | security | legal and a reason of at least 10
 *    characters, and every call writes a "server_channel_view" audit row with the
 *    purpose, the reason, the server, the channel and the range that was read;
 *  - there is no GET route for channel messages and no bulk export;
 *  - message delete is scoped to its channel and server.
 * Every action is audited through state.appendAudit (memory + public.admin_audit).
 */

const express = require("express");
const state = require("../runtime/sharedState");
const review = require("../lib/serverReview");
const store = require("../lib/serverReviewStore");
const { apiError } = require("../lib/apiError");

const router = express.Router();

function audit(actor, action, target, meta) {
  return state.appendAudit(actor.id, actor.username, action, target, meta);
}

function fail(res, e, label, fallback) {
  const status = e.status || 500;
  if (status >= 500) console.error(`[ADMIN] server review ${label} failed:`, e?.message || e);
  return res.status(status).json({ error: status >= 500 ? fallback : e.message || fallback, code: e.code || undefined });
}

router.get("/server-review/servers", async (req, res) => {
  try {
    const payload = await store.listServers(req.query || {});
    res.set("Cache-Control", "no-store");
    res.json(payload);
  } catch (e) {
    fail(res, e, "list", "Could not load the server list.");
  }
});

router.get("/server-review/servers/:serverId", async (req, res) => {
  try {
    const payload = await store.getServerDetail(req.params.serverId);
    res.set("Cache-Control", "no-store");
    res.json(payload);
  } catch (e) {
    fail(res, e, "detail", "Could not load the server.");
  }
});

router.get("/server-review/servers/:serverId/members", async (req, res) => {
  try {
    const payload = await store.listMembers(req.params.serverId, {
      q: req.query?.q,
      offset: req.query?.offset,
      limit: req.query?.limit,
    });
    res.set("Cache-Control", "no-store");
    res.json(payload);
  } catch (e) {
    fail(res, e, "members", "Could not load the members.");
  }
});

// Channel content: the only route that returns message text. Paging (before /
// after) stays inside the opened channel; each page is its own audited view.
router.post("/server-review/servers/:serverId/channels/:channelId/view", async (req, res) => {
  const gate = review.checkViewRequest(req.body);
  if (!gate.ok) return res.status(400).json({ error: gate.error, code: gate.code });
  const { purpose, reason } = gate;
  const cursor = review.parseCursor(req.body || {});
  try {
    const payload = await store.readChannel(req.params.serverId, req.params.channelId, cursor);
    audit(req.user, "server_channel_view", `${payload.server.id}/${payload.channel.id}`, {
      purpose,
      reason,
      server: payload.server.id,
      serverName: payload.server.name,
      channel: payload.channel.id,
      channelName: payload.channel.name,
      range: review.rangeOf(cursor, payload.messages),
    });
    res.set("Cache-Control", "no-store");
    return res.json({ ...payload, direction: cursor.direction, viewedAt: new Date().toISOString() });
  } catch (e) {
    return fail(res, e, "channel view", "Could not load the channel.");
  }
});

router.delete("/server-review/servers/:serverId/channels/:channelId/messages/:msgId", async (req, res) => {
  const { serverId, channelId, msgId } = req.params;
  try {
    await store.deleteChannelMessage(serverId, channelId, msgId);
    audit(req.user, "server_msg_delete", msgId, { server: serverId, channel: channelId });
    // Open clients drop it like an author delete.
    const io = req.app.get("io");
    try {
      io?.to?.(`server-channel:${channelId}`)?.emit?.("server:channel:message:deleted", { serverId, channelId, messageId: msgId });
    } catch {
      /* best effort */
    }
    res.json({ ok: true });
  } catch (e) {
    fail(res, e, "message delete", "Could not delete the message.");
  }
});

router.post("/server-review/servers/:serverId/directory", async (req, res) => {
  const hidden = Boolean(req.body?.hidden);
  const note = req.body?.reason ? String(req.body.reason).trim().slice(0, 300) : null;
  try {
    const result = await store.setDirectoryHidden(req.params.serverId, hidden, note);
    audit(req.user, hidden ? "server_directory_hide" : "server_directory_show", req.params.serverId, { note, via: "serverReview" });
    try {
      require("./directory").__resetDirectoryCache();
    } catch {
      /* directory route not loaded */
    }
    res.json(result);
  } catch (e) {
    fail(res, e, "directory", "Could not save the directory listing.");
  }
});

router.delete("/server-review/servers/:serverId/invites/:code", async (req, res) => {
  try {
    const result = await store.deleteInvite(req.params.serverId, String(req.params.code || ""));
    audit(req.user, "server_invite_delete", req.params.serverId, { code: result.code });
    res.json(result);
  } catch (e) {
    fail(res, e, "invite delete", "Could not delete the invite.");
  }
});

router.post("/server-review/servers/:serverId/invites/revoke-all", async (req, res) => {
  try {
    const result = await store.revokeAllInvites(req.params.serverId);
    audit(req.user, "server_invites_revoke", req.params.serverId, { removed: result.removed, paused: result.paused });
    res.json(result);
  } catch (e) {
    fail(res, e, "invite revoke", "Could not close the invites.");
  }
});

// Lift the join pause that "Close invites" set (IM-4).
router.post("/server-review/servers/:serverId/invites/resume", async (req, res) => {
  try {
    const result = await store.resumeInvites(req.params.serverId);
    audit(req.user, "server_invites_resume", req.params.serverId, {});
    res.json(result);
  } catch (e) {
    fail(res, e, "invite resume", "Could not reopen the invites.");
  }
});

// Delete the whole server through the owner-delete path (lib/serverDeletion.js):
// members are told, voice ends, private media and reactions are cleaned up.
router.delete("/server-review/servers/:serverId", async (req, res) => {
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, 300) : "";
  try {
    const server = await store.loadServerForDelete(req.params.serverId);
    if (!review.deleteConfirmed(server.name, req.body?.confirmName)) {
      return res.status(400).json(apiError("Type the server name to confirm.", null, { code: "SERVER_DELETE_CONFIRM" }));
    }
    if (reason.length < review.REASON_MIN) {
      return res.status(400).json(apiError("Write the reason in at least 10 characters.", null, { code: "SERVER_DELETE_REASON" }));
    }
    const summary = await require("../lib/serverDeletion").deleteServerFully(req.app.get("io"), server, {
      actorId: req.user.id,
      via: "admin",
    });
    audit(req.user, "server_delete", server.id, {
      name: server.name,
      owner: server.owner_id,
      reason,
      members: summary.memberCount,
      channels: summary.channelCount,
    });
    store.invalidateList();
    return res.json({ ok: true, ...summary });
  } catch (e) {
    return fail(res, e, "delete", "Could not delete the server.");
  }
});

module.exports = router;
