"use strict";

/**
 * Admin agent, phase 2: what an approved plan item does. Each handler calls the same
 * internal functions the panel's own admin routes call (banExperience.performBan,
 * moderation.applyTimeout / revokeBan / revokeTimeout, kickUser, descoin.setWalletFrozen /
 * credit / debit, specialBadges.grant / revoke, shop.grantItem, the live popup and the
 * announcements table), emits the same sockets and writes the same audit action codes,
 * with { via: "agent", planId, planCode, version, itemId } added to the audit meta.
 *
 * The model never reaches this file: only executor.js does, after an admin approved the
 * plan with a fresh 2FA code and every item was re-checked against scopes, limits and the
 * approving admin's sections.
 *
 * execute(item, ctx) -> { status: "done" | "skipped", result, undo }
 * undo(item, ctx)    -> { result }
 */

const state = require("../../runtime/sharedState");

// Same kick reason as POST /admin/people/:id/revoke-sessions.
const SESSIONS_REVOKED = "Sessions revoked by admin";

let depsOverride = null;
function deps() {
  if (depsOverride) return depsOverride;
  return {
    db: require("../../db/supabase"),
    moderation: require("../moderation"),
    banExperience: require("../banExperience"),
    descoin: require("../descoin"),
    adminSockets: require("../../socket/adminHandlers"),
    specialBadges: require("../specialBadges"),
    badgeNotify: require("../specialBadgeNotify"),
    shop: require("../shop"),
    popup: require("../adminBroadcastPopup"),
    presence: require("../presenceRoster"),
    premium: require("../premium/badges"),
    audit: (actor, action, target, meta) => state.appendAudit(actor.id, actor.username, action, target, meta),
  };
}

function skipped(code, extra = {}) {
  return { status: "skipped", result: { code, ...extra }, undo: null };
}

function notify(io, payload) {
  try {
    if (io) deps().adminSockets.notifyAdminRoom(io, payload);
  } catch {
    /* admin room notify is best effort */
  }
}

/**
 * Fresh facts about the targets for the dry run and the per-item re-check:
 * id -> { exists, id, username, displayName, avatarUrl, createdAt, emailVerified, isAdmin,
 *         isOwner, premium, banned, timedOut, frozen }.
 */
async function loadTargets(ids) {
  const d = deps();
  const list = [...new Set((ids || []).filter(Boolean).map(String))];
  const out = new Map();
  if (!list.length) return out;
  let rows = [];
  for (let i = 0; i < list.length; i += 200) {
    const chunk = list.slice(i, i + 200);
    let res = await d.db
      .from("users")
      .select("id, username, display_name, avatar_url, created_at, email_confirmed_at, is_admin, is_super_admin, descoin_frozen")
      .in("id", chunk);
    if (res.error) {
      res = await d.db.from("users").select("id, username, display_name, avatar_url, created_at, is_admin").in("id", chunk);
    }
    if (res.error) throw res.error;
    rows = rows.concat(res.data || []);
  }
  let plans = new Map();
  try {
    plans = await d.premium.plansFor(list);
  } catch {
    plans = new Map();
  }
  const byId = new Map(rows.map((r) => [String(r.id), r]));
  for (const id of list) {
    const r = byId.get(id);
    if (!r) {
      out.set(id, { exists: false, id });
      continue;
    }
    out.set(id, {
      exists: true,
      id,
      username: r.username || null,
      displayName: r.display_name || null,
      avatarUrl: r.avatar_url || null,
      createdAt: r.created_at || null,
      emailVerified: r.email_confirmed_at === undefined ? null : Boolean(r.email_confirmed_at),
      isAdmin: Boolean(r.is_admin),
      isOwner: r.username === "admin" || Boolean(r.is_super_admin),
      premium: plans.get(id) || null,
      banned: Boolean(d.moderation.isBanned(id)),
      timedOut: Boolean(d.moderation.isTimedOut(id)),
      frozen: Boolean(r.descoin_frozen),
    });
  }
  return out;
}

/** Audit meta every agent-executed action carries. */
function agentMeta(ctx, item, extra = {}) {
  return {
    ...extra,
    via: "agent",
    planId: ctx.plan.id,
    planCode: ctx.plan.code,
    version: ctx.plan.version,
    itemId: item.id,
  };
}

const HANDLERS = {
  async ban(item, ctx) {
    const d = deps();
    const id = item.target_user_id;
    const target = await d.banExperience.banTarget(id);
    if (!target.found) return skipped("not_found");
    if (target.protected) return skipped("protected");
    if (d.moderation.isBanned(id)) return skipped("already_banned");
    const p = item.params || {};
    const result = await d.banExperience.performBan({
      io: ctx.io,
      actor: ctx.actor,
      targetUserId: id,
      username: target.row?.username || item.target_username || null,
      category: p.category,
      otherText: p.otherText,
      message: p.message,
      presetId: p.presetId || (p.durationSeconds ? undefined : "7d"),
      durationSeconds: p.durationSeconds,
      ...d.banExperience.banOptionsFrom(p),
    });
    d.audit(ctx.actor, "ban", id, agentMeta(ctx, item, {
      category: result.category,
      reason: result.reason,
      message: result.message,
      expiresAt: result.expiresAt,
      sessionsRevoked: result.sessionsRevoked,
      emailed: result.emailed,
      accessBan: result.accessBan ? result.accessBan.added : 0,
    }));
    notify(ctx.io, { type: "ban", userId: id, ...result });
    return {
      status: "done",
      result: { expiresAt: result.expiresAt || null, sessionsRevoked: result.sessionsRevoked || 0, emailed: Boolean(result.emailed), accessBan: result.accessBan?.added || 0 },
      undo: { kind: "unban", accessBanAdded: result.accessBan?.added || 0 },
    };
  },

  async timeout(item, ctx) {
    const d = deps();
    const id = item.target_user_id;
    const p = item.params || {};
    const result = await d.moderation.applyTimeout({
      targetUserId: id,
      actorUserId: ctx.actor.id,
      category: p.category,
      otherText: p.otherText,
      message: p.message,
      presetId: p.presetId,
      durationSeconds: p.durationSeconds,
    });
    ctx.io?.to(`user:${id}`).emit("system:timeout", result);
    if (p.notify) {
      try {
        const { pushNotification } = require("../../socket/handlers");
        pushNotification(ctx.io, id, {
          type: "moderation_timeout",
          titleKey: "bot.notify.timeoutTitle",
          ...(result.message ? { body: result.message } : { bodyKey: "bot.notify.timeoutBody" }),
          meta: { until: result.until, category: result.category },
        });
      } catch {
        /* the notification is best effort */
      }
    }
    d.audit(ctx.actor, "timeout", id, agentMeta(ctx, item, {
      category: result.category,
      reason: result.reason,
      message: result.message,
      until: result.until,
      notified: Boolean(p.notify),
    }));
    notify(ctx.io, { type: "timeout", userId: id, ...result });
    return { status: "done", result: { until: result.until }, undo: { kind: "untimeout" } };
  },

  async kick(item, ctx) {
    const d = deps();
    const id = item.target_user_id;
    const p = item.params || {};
    const { category, reason } = d.moderation.normalizeCategory(p.category, p.otherText);
    await d.adminSockets.kickUser(ctx.io, {
      actorId: ctx.actor.id,
      actorUsername: ctx.actor.username,
      targetUserId: id,
      reason: reason || "Kicked",
      action: "kick",
      category,
      message: p.message || null,
    });
    await d.moderation.recordAction({ actionType: "kick", targetUserId: id, actorUserId: ctx.actor.id, category, reason, message: p.message || null }).catch(() => {});
    return { status: "done", result: {}, undo: null };
  },

  async revoke_sessions(item, ctx) {
    const d = deps();
    const id = item.target_user_id;
    const { listSessions } = require("../sessions");
    const sessions = await listSessions(id);
    for (const s of sessions) if (s?.id) state.revokedSessionIds.add(s.id);
    const { error } = await d.db.from("users").update({ active_sessions: [] }).eq("id", id);
    if (error) throw error;
    await d.adminSockets.kickUser(ctx.io, {
      actorId: ctx.actor.id,
      actorUsername: ctx.actor.username,
      targetUserId: id,
      reason: SESSIONS_REVOKED,
      action: "kick",
    });
    d.audit(ctx.actor, "revoke_sessions", id, agentMeta(ctx, item, { count: sessions.length }));
    return { status: "done", result: { revoked: sessions.length }, undo: null };
  },

  async unban(item, ctx) {
    const d = deps();
    const id = item.target_user_id;
    if (!d.moderation.isBanned(id)) return skipped("not_banned");
    await d.moderation.revokeBan({ targetUserId: id, actorUserId: ctx.actor.id, note: item.params?.note || `Agent plan #${ctx.plan.code}` });
    d.audit(ctx.actor, "unban", id, agentMeta(ctx, item));
    notify(ctx.io, { type: "unban", userId: id });
    return { status: "done", result: {}, undo: null };
  },

  async untimeout(item, ctx) {
    const d = deps();
    const id = item.target_user_id;
    if (!d.moderation.isTimedOut(id)) return skipped("not_timed_out");
    await d.moderation.revokeTimeout({ targetUserId: id, actorUserId: ctx.actor.id, note: item.params?.note || `Agent plan #${ctx.plan.code}` });
    ctx.io?.to(`user:${id}`).emit("system:timeout:cleared", { ok: true });
    d.audit(ctx.actor, "untimeout", id, agentMeta(ctx, item));
    notify(ctx.io, { type: "untimeout", userId: id });
    return { status: "done", result: {}, undo: null };
  },

  async wallet_freeze(item, ctx) {
    return walletFreeze(item, ctx, true);
  },
  async wallet_unfreeze(item, ctx) {
    return walletFreeze(item, ctx, false);
  },

  async descoin_grant(item, ctx) {
    const d = deps();
    const id = item.target_user_id;
    const p = item.params || {};
    const amount = Math.round(Number(p.amount));
    const meta = { by: ctx.actor.id, reason: p.reason || null, via: "agent", planId: ctx.plan.id };
    let result;
    try {
      result = amount > 0
        ? await d.descoin.credit(id, amount, "admin_grant", meta, p.message || null)
        : await d.descoin.debit(id, Math.abs(amount), "admin_revoke", meta);
    } catch (err) {
      if (err?.message === "INSUFFICIENT_BALANCE") return skipped("insufficient_balance");
      throw err;
    }
    d.audit(ctx.actor, "descoin_grant", id, agentMeta(ctx, item, { amount, reason: p.reason || null, message: p.message || null }));
    ctx.io?.to(`user:${id}`)?.emit("descoin:balance", { balance: result.balance, delta: amount, reason: amount > 0 ? "admin_grant" : "admin_revoke" });
    if (p.message && result.ledgerId && amount > 0) {
      const online = Boolean(ctx.io?.sockets?.adapter?.rooms?.get(`user:${id}`)?.size);
      if (online) {
        ctx.io.to(`user:${id}`).emit("descoin:gift", { amount, message: p.message, from: { id: ctx.actor.id, username: ctx.actor.username } });
        await d.descoin.markGrantsNotified([result.ledgerId]).catch(() => {});
      }
    }
    return { status: "done", result: { balance: result.balance, amount }, undo: { kind: "descoin_reverse", amount } };
  },

  async badge_grant(item, ctx) {
    const d = deps();
    const id = item.target_user_id;
    const p = item.params || {};
    let result;
    try {
      result = await d.specialBadges.grant({ userId: id, badgeId: p.badgeId, actorId: ctx.actor.id, note: p.note });
    } catch (err) {
      if (err instanceof d.specialBadges.SpecialBadgeError && err.status < 500) return skipped(err.code || "badge_refused");
      throw err;
    }
    d.audit(ctx.actor, "special_badge_grant", id, agentMeta(ctx, item, { badgeId: p.badgeId, serial: result.serial }));
    if (ctx.io) await d.badgeNotify.deliverPending(ctx.io, id).catch(() => {});
    return { status: "done", result: { serial: result.serial }, undo: { kind: "badge_revoke", badgeId: p.badgeId } };
  },

  async badge_revoke(item, ctx) {
    const d = deps();
    const id = item.target_user_id;
    const p = item.params || {};
    let result;
    try {
      result = await d.specialBadges.revoke({ userId: id, badgeId: p.badgeId, actorId: ctx.actor.id, reason: p.reason });
    } catch (err) {
      if (err instanceof d.specialBadges.SpecialBadgeError && err.status < 500) return skipped(err.code || "badge_refused");
      throw err;
    }
    d.audit(ctx.actor, "special_badge_revoke", id, agentMeta(ctx, item, { badgeId: p.badgeId, serial: result.serial }));
    if (ctx.io) {
      await d.badgeNotify.deliverPending(ctx.io, id).catch(() => {});
      if (result.wasEquipped) await d.badgeNotify.broadcastProfile(ctx.io, id).catch(() => {});
    }
    return { status: "done", result: { serial: result.serial }, undo: null };
  },

  async shop_gift(item, ctx) {
    const d = deps();
    const id = item.target_user_id;
    const p = item.params || {};
    const shopItem = await d.shop.getItemById(p.itemId);
    if (!shopItem) return skipped("item_not_found");
    if (d.shop.REMOVED_COSMETIC_CATEGORIES.has(shopItem.category)) return skipped("item_removed");
    const row = await d.shop.grantItem(id, p.itemId, { acquiredVia: "gift", giftedBy: ctx.actor.id, giftMessage: p.message || null });
    d.audit(ctx.actor, "shop_gift", id, agentMeta(ctx, item, { itemId: p.itemId, sku: shopItem.sku, message: p.message || null }));
    const online = Boolean(ctx.io?.sockets?.adapter?.rooms?.get(`user:${id}`)?.size);
    if (ctx.io && online) {
      ctx.io.to(`user:${id}`).emit("shop:gift:received", { item: shopItem, message: p.message || null, from: { id: ctx.actor.id, username: ctx.actor.username } });
      if (row?.id) await d.shop.markGiftsNotified([row.id]).catch(() => {});
    }
    return { status: "done", result: { sku: shopItem.sku || null }, undo: null };
  },

  async announcement(item, ctx) {
    const d = deps();
    const p = item.params || {};
    const { data, error } = await d.db
      .from("announcements")
      .insert({
        title: p.title,
        content: p.content,
        created_by: ctx.actor.id,
        author: ctx.actor.username,
        priority: p.priority || "normal",
        color: "#587af5",
        emoji: "",
        pinned: Boolean(p.pinned),
        target: "all",
      })
      .select()
      .single();
    if (error) throw error;
    ctx.io?.emit("announcement:new", data);
    d.audit(ctx.actor, "announcement_create", data?.id || "all", agentMeta(ctx, item, { title: p.title }));
    return { status: "done", result: { announcementId: data?.id || null }, undo: data?.id ? { kind: "announcement_hide", id: data.id } : null };
  },

  async live_popup(item, ctx) {
    const d = deps();
    const p = item.params || {};
    const built = d.popup.buildPopupPayload({ title: p.title, body: p.body, severity: p.severity }, { actor: ctx.actor });
    if (!built.ok) return skipped("popup_invalid", { error: built.error || null });
    d.presence.pruneDeadPresence(state.presence, ctx.io);
    const roster = d.presence.summarizePresence(state.presence, { io: ctx.io });
    const targetId = item.target_user_id ? String(item.target_user_id) : null;
    const audience = targetId ? "user" : p.audience === "visible" ? "visible" : "connected";
    const recipients = targetId
      ? (roster.live || []).filter((row) => String(row?.id) === targetId)
      : d.popup.selectRecipients(roster.live, { audience, includeSelf: false, actorId: ctx.actor.id });
    if (!recipients.length) return skipped(targetId ? "user_offline" : "no_recipients");
    const rate = d.popup.checkRateLimit(ctx.actor.id);
    if (!rate.ok) throw Object.assign(new Error(rate.error || "Popup rate limit."), { code: "POPUP_RATE" });
    const delivered = d.popup.deliverPopup(ctx.io, recipients, built.popup);
    d.popup.rememberSend({ actorId: ctx.actor.id, actorUsername: ctx.actor.username, popup: built.popup, delivered, skipped: Math.max(0, recipients.length - delivered), audience });
    d.audit(ctx.actor, "live_popup", targetId || audience, agentMeta(ctx, item, { id: built.popup.id, title: built.popup.title, severity: built.popup.severity, delivered }));
    notify(ctx.io, { type: "live_popup", delivered, title: built.popup.title });
    return { status: "done", result: { delivered }, undo: null };
  },
};

async function walletFreeze(item, ctx, frozen) {
  const d = deps();
  const id = item.target_user_id;
  const result = await d.descoin.setWalletFrozen(id, frozen);
  const reason = item.params?.reason || null;
  d.audit(ctx.actor, frozen ? "wallet_freeze" : "wallet_unfreeze", id, agentMeta(ctx, item, { reason }));
  ctx.io?.to(`user:${id}`).emit("descoin:frozen", { frozen: result.frozen });
  notify(ctx.io, { type: frozen ? "wallet_freeze" : "wallet_unfreeze", userId: id });
  return { status: "done", result: { frozen: result.frozen }, undo: { kind: frozen ? "wallet_unfreeze" : "wallet_freeze" } };
}

async function execute(item, ctx) {
  const handler = HANDLERS[item.action];
  if (!handler) throw Object.assign(new Error(`Unknown action ${item.action}`), { code: "UNKNOWN_ACTION" });
  return handler(item, ctx);
}

/** Reverse one executed item using its stored undo data. */
async function undo(item, ctx) {
  const d = deps();
  const u = item.undo || {};
  const id = item.target_user_id;
  const meta = agentMeta(ctx, item, { undo: true });
  switch (u.kind) {
    case "unban":
      await d.moderation.revokeBan({ targetUserId: id, actorUserId: ctx.actor.id, note: `Agent plan #${ctx.plan.code} undo` });
      d.audit(ctx.actor, "unban", id, meta);
      notify(ctx.io, { type: "unban", userId: id });
      return { result: { accessBanKept: u.accessBanAdded || 0 } };
    case "untimeout":
      await d.moderation.revokeTimeout({ targetUserId: id, actorUserId: ctx.actor.id, note: `Agent plan #${ctx.plan.code} undo` });
      ctx.io?.to(`user:${id}`).emit("system:timeout:cleared", { ok: true });
      d.audit(ctx.actor, "untimeout", id, meta);
      notify(ctx.io, { type: "untimeout", userId: id });
      return { result: {} };
    case "wallet_unfreeze":
    case "wallet_freeze": {
      const frozen = u.kind === "wallet_freeze";
      const r = await d.descoin.setWalletFrozen(id, frozen);
      d.audit(ctx.actor, frozen ? "wallet_freeze" : "wallet_unfreeze", id, meta);
      ctx.io?.to(`user:${id}`).emit("descoin:frozen", { frozen: r.frozen });
      return { result: { frozen: r.frozen } };
    }
    case "descoin_reverse": {
      const amount = Math.round(Number(u.amount) || 0);
      const m = { by: ctx.actor.id, reason: `Agent plan #${ctx.plan.code} undo`, via: "agent", planId: ctx.plan.id };
      const r = amount > 0 ? await d.descoin.debit(id, amount, "admin_revoke", m) : await d.descoin.credit(id, Math.abs(amount), "admin_grant", m, null);
      d.audit(ctx.actor, "descoin_grant", id, { ...meta, amount: -amount });
      ctx.io?.to(`user:${id}`)?.emit("descoin:balance", { balance: r.balance, delta: -amount, reason: amount > 0 ? "admin_revoke" : "admin_grant" });
      return { result: { balance: r.balance } };
    }
    case "badge_revoke": {
      const r = await d.specialBadges.revoke({ userId: id, badgeId: u.badgeId, actorId: ctx.actor.id, reason: `Agent plan #${ctx.plan.code} undo` });
      d.audit(ctx.actor, "special_badge_revoke", id, { ...meta, badgeId: u.badgeId, serial: r.serial });
      if (ctx.io) await d.badgeNotify.deliverPending(ctx.io, id).catch(() => {});
      return { result: {} };
    }
    case "announcement_hide": {
      const { error } = await d.db.from("announcements").update({ is_active: false }).eq("id", u.id);
      if (error) throw error;
      ctx.io?.emit("announcement:deleted", { id: u.id });
      d.audit(ctx.actor, "announcement_delete", u.id, meta);
      return { result: {} };
    }
    default:
      throw Object.assign(new Error(`This action cannot be undone.`), { code: "NOT_UNDOABLE" });
  }
}

function __setDepsForTests(value) {
  depsOverride = value;
}

module.exports = { HANDLERS, loadTargets, execute, undo, agentMeta, __setDepsForTests };
