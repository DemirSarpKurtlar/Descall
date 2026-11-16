"use strict";

/**
 * GET /api/shop2/history entries for the "Son işlemlerin" list: the stored payloads hold ids
 * only (itemId / itemIds / setKey / giftId / to), so each entry gets what the row says in
 * words: `item` (public item, the first one), `itemCount`, `setKey`, `setName` (7 locales) and
 * `to` (public user) for gifts and shares. Unknown ids stay null; the payload is unchanged.
 */

const catalog = require("./catalog");
const people = require("./people");
const db = require("./db");

const SET_PREFIX = "set:";

async function decorate(entries, { base = "" } = {}) {
  const list = Array.isArray(entries) ? entries : [];
  if (!list.length) return list;
  const giftIds = [...new Set(list.filter((e) => /^gift_/.test(e.kind) && e.payload?.giftId).map((e) => String(e.payload.giftId)))];
  const [cat, sets, gifts] = await Promise.all([
    catalog.getCatalog(),
    catalog.getSets().catch(() => []),
    giftIds.length ? db.rows(db.from("shop2_gifts").select("id, to_user, item_ids, set_key, kind").in("id", giftIds)).catch(() => []) : [],
  ]);
  const setByKey = new Map(sets.map((s) => [s.key, s]));
  const giftById = new Map(gifts.map((g) => [String(g.id), g]));
  const userIds = new Set();
  for (const e of list) {
    const p = e.payload || {};
    if (typeof p.to === "string") userIds.add(p.to);
    else if (Array.isArray(p.to) && p.to.length) userIds.add(String(p.to[0]));
    const g = p.giftId ? giftById.get(String(p.giftId)) : null;
    if (g?.to_user) userIds.add(String(g.to_user));
  }
  const users = userIds.size ? await people.getUsers([...userIds]).catch(() => new Map()) : new Map();
  return list.map((e) => {
    const p = e.payload || {};
    const g = p.giftId ? giftById.get(String(p.giftId)) : null;
    let setKey = p.setKey || g?.set_key || (e.kind === "share" && p.kind === "set" ? p.ref : null) || null;
    let ids = [];
    if (typeof p.itemId === "string" && p.itemId.startsWith(SET_PREFIX)) setKey = p.itemId.slice(SET_PREFIX.length);
    else if (p.itemId) ids = [p.itemId];
    else if (Array.isArray(p.itemIds)) ids = p.itemIds;
    else if (Array.isArray(g?.item_ids)) ids = g.item_ids;
    else if (e.kind === "share" && p.kind === "item" && p.ref) ids = [p.ref];
    else if (p.applied && typeof p.applied === "object") ids = Object.values(p.applied).filter(Boolean);
    const first = ids.length ? cat.byId.get(String(ids[0])) : null;
    // Several items of one set (a set worn at once) read as that set.
    if (!setKey && ids.length > 1) {
      const keys = new Set(ids.map((id) => cat.byId.get(String(id))?.setKey || null));
      if (keys.size === 1 && [...keys][0]) setKey = [...keys][0];
    }
    const set = setKey ? setByKey.get(setKey) : null;
    // A set (whole or a gift of the missing pieces) reads as the set, not its first piece.
    const asSet = Boolean(set) && (ids.length !== 1 || e.kind === "share" || (typeof p.itemId === "string" && p.itemId.startsWith(SET_PREFIX)));
    const toId = typeof p.to === "string" ? p.to : Array.isArray(p.to) && p.to.length ? String(p.to[0]) : g?.to_user ? String(g.to_user) : null;
    return {
      ...e,
      item: !asSet && first ? catalog.publicItem(first, base) : null,
      itemCount: ids.length,
      setKey,
      setName: asSet ? set.name || null : null,
      to: toId ? people.publicUser(users.get(toId)) : null,
      toCount: Array.isArray(p.to) ? p.to.length : toId ? 1 : 0,
    };
  });
}

module.exports = { decorate };
