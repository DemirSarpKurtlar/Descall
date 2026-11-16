"use strict";

/** Undo of a logged shop action (POST /api/shop2/history/:id/undo). */

const actions = require("./actions");
const people = require("./people");
const db = require("./db");
const time = require("./time");
const { shopError } = require("./storefrontService");

async function undo(userId, actionId, { io = null, now = Date.now() } = {}) {
  const row = await actions.get(userId, actionId);
  if (!row) throw shopError("not_found", 404);
  const a = actions.publicAction(row, now);
  if (!a.undoable) throw shopError("undo_expired", 409);
  const u = row.undo || {};
  let result = {};
  switch (u.type) {
    case "refund":
      result = await require("./purchases").refund(userId, u.purchaseId, { now, io });
      break;
    case "restore_look": {
      const before = await people.equippedSnapshot(userId);
      await require("./outfits").saveSnapshot(userId, before, { kind: "previous" });
      result = { applied: await people.applyLook(userId, u.look || {}) };
      if (io) await people.broadcastProfile(io, userId);
      break;
    }
    case "lock": {
      const day = u.day || time.dayKey(now);
      if (day !== time.dayKey(now)) throw shopError("undo_expired", 409);
      await db.ready();
      const sf = await db.one(db.from("shop2_storefronts").select("slots").eq("user_id", userId).eq("day", day).maybeSingle());
      const slot = u.itemId ? (sf?.slots || []).find((s) => String(s.itemId) === String(u.itemId))?.slot || null : null;
      await db.rows(db.from("shop2_storefronts").update({ lock_item_id: slot ? u.itemId : null, lock_slot: slot }).eq("user_id", userId).eq("day", day).select("user_id"));
      result = { lock: slot ? { itemId: u.itemId, slot } : null };
      break;
    }
    case "wishlist_add":
    case "wishlist_remove": {
      await db.ready();
      if (u.type === "wishlist_remove") await db.rows(db.from("shop2_wishlist").delete().eq("user_id", userId).eq("item_id", String(u.itemId)).select("item_id"));
      else await db.one(db.from("shop2_wishlist").upsert({ user_id: userId, item_id: String(u.itemId), created_at: new Date(now).toISOString() }, { onConflict: "user_id,item_id", ignoreDuplicates: true }).select("*").maybeSingle());
      result = { itemId: u.itemId, wished: u.type === "wishlist_add" };
      break;
    }
    case "outfit_delete":
      result = await require("./outfits").remove(userId, u.outfitId);
      break;
    case "gift_recall":
      result = await require("./gifts").recall(userId, u.giftId, { now });
      break;
    default:
      throw shopError("undo_unsupported", 409);
  }
  await actions.markUndone(actionId, now);
  return { actionId, type: u.type, result };
}

module.exports = { undo };
