"use strict";

/**
 * Market 2.0 user API, mounted at /api/shop2 (docs/shop2-api.md).
 * Personal daily storefront, sets (piece by piece or whole, owned pieces deducted, 7-day
 * partial price), purchases with a 10-minute refund, night market, gifts, action log with
 * undo, outfits and wishlist. Works before supabase/migrations/20261115_shop2.sql is applied
 * (shop2 tables fall back to process memory; wallet, ledger and inventory are always real).
 */

const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { recordFailure } = require("../lib/rateLimit");
const { edgePublicBase } = require("../lib/edgeConfig");
const events = require("../lib/shop2/events");
const views = require("../lib/shop2/views");
const sfs = require("../lib/shop2/storefrontService");
const purchases = require("../lib/shop2/purchases");
const night = require("../lib/shop2/night");
const gifts = require("../lib/shop2/gifts");
const actions = require("../lib/shop2/actions");
const history = require("../lib/shop2/history");
const outfits = require("../lib/shop2/outfits");
const catalog = require("../lib/shop2/catalog");
const { errorResponse, MESSAGES } = require("../lib/shop2/messages");
const { apiError } = require("../lib/apiError");

const router = express.Router();

const LIMITS = {
  write: { windowMs: 60_000, max: 60 },
  buy: { windowMs: 60_000, max: 20 },
  gift: { windowMs: 10 * 60_000, max: 20 },
  flip: { windowMs: 60_000, max: 30 },
  share: { windowMs: 60 * 60_000, max: 10 },
};

function base(req) {
  return edgePublicBase() || `${req.protocol}://${req.get("host")}`;
}

function io(req) {
  const instance = req.app.get("io");
  events.bind(instance);
  return instance || null;
}

function limited(req, res, kind) {
  const v = recordFailure(`shop2:${kind}:${req.user.id}`, LIMITS[kind]);
  if (v.ok) return false;
  res.set("Retry-After", String(Math.max(1, v.retryAfterSec || 30)));
  res.status(429).json({ error: MESSAGES.rate_limited, code: "rate_limited" });
  return true;
}

/** async handler with the shop error mapping. */
function handle(fn, { kind = null } = {}) {
  return async (req, res) => {
    io(req);
    if (kind && limited(req, res, kind)) return undefined;
    try {
      res.set("Cache-Control", "no-store");
      const out = await fn(req, res);
      if (out !== undefined && !res.headersSent) res.json(out);
    } catch (err) {
      const { status, body } = errorResponse(err);
      if (status >= 500) console.error(`[shop2] ${req.method} ${req.path}:`, err?.stack || err?.message || err);
      if (!res.headersSent) res.status(status).json(body);
    }
    return undefined;
  };
}

function idemKey(req) {
  return req.get("idempotency-key") || req.body?.idempotencyKey || null;
}

/* ---------------------------------------------------------------- public asset */

router.get("/assets/:id", async (req, res) => {
  try {
    const kind = req.query.kind === "preview" ? "preview" : "asset";
    const img = require("../lib/svgStill").stillImage(await catalog.assetOf(req.params.id, kind), req.query.still === "1");
    if (!img) return res.status(404).type("text/plain").send("Not found");
    const versioned = typeof req.query.v === "string" && req.query.v === img.version;
    res.set({
      "Content-Type": img.contentType,
      "Cache-Control": versioned ? "public, max-age=31536000, immutable" : "public, max-age=300",
      ETag: `"${img.version}"`,
      "X-Content-Type-Options": "nosniff",
      "Cross-Origin-Resource-Policy": "cross-origin",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox",
    });
    if (req.get("if-none-match") === `"${img.version}"`) return res.status(304).end();
    return res.send(img.body);
  } catch (err) {
    console.error("[shop2] asset error:", err?.message || err);
    return res.status(500).type("text/plain").send("Failed to load image");
  }
});

router.use(requireAuth);

/* ---------------------------------------------------------------- storefront */

router.get("/storefront", handle((req) => views.storefront(req.user.id, { base: base(req) })));

router.post(
  "/storefront/refresh",
  handle(async (req) => {
    const body = req.body || {};
    const keep = Object.prototype.hasOwnProperty.call(body, "keepLockedItemId") ? body.keepLockedItemId || null : undefined;
    const r = await sfs.refresh(req.user.id, { keepLockedItemId: keep, idempotencyKey: purchases.cleanKey(idemKey(req)), expectedPrice: body.expectedPrice ?? null });
    const view = await views.storefront(req.user.id, { base: base(req) });
    return { ok: true, paid: r.paid || 0, free: r.free || null, duplicate: Boolean(r.duplicate), storefront: view };
  }, { kind: "write" })
);

router.post(
  "/storefront/lock",
  handle(async (req) => {
    const r = await sfs.setLock(req.user.id, req.body?.itemId || null);
    return { ok: true, lock: r.lock };
  }, { kind: "write" })
);

router.get("/catalog", handle((req) => views.catalogView(req.user.id, { base: base(req), category: typeof req.query.category === "string" ? req.query.category : null })));

/* ---------------------------------------------------------------- sets */

router.get("/sets", handle((req) => views.setsList(req.user.id, { base: base(req) })));

router.get(
  "/sets/:key",
  handle(async (req, res) => {
    const d = await views.setDetail(req.user.id, String(req.params.key), { base: base(req) });
    if (!d) {
      res.status(404).json({ error: MESSAGES.not_found, code: "not_found" });
      return undefined;
    }
    return d;
  })
);

router.post(
  "/sets/:key/buy",
  handle(async (req) => {
    const b = req.body || {};
    const r = await purchases.buySet(req.user.id, String(req.params.key), {
      pieceIds: Array.isArray(b.pieceIds) ? b.pieceIds : null,
      all: b.all === true || b.pieceIds === "all",
      holdToken: b.holdToken || idemKey(req),
      expectedPrice: b.expectedPrice ?? null,
      equip: b.equip ?? null,
      io: io(req),
    });
    return {
      ok: true,
      duplicate: r.duplicate,
      purchaseId: r.purchase?.id,
      paid: Number(r.purchase?.amount) || 0,
      itemIds: r.purchase?.item_ids || [],
      mode: r.priced?.mode || r.purchase?.meta?.mode || null,
      balance: r.balance,
      refundableUntil: r.purchase?.refundable_until || null,
      partialPriceUntil: r.lockUntil || null,
      equipped: r.equipped || null,
      completed: r.completed || [],
    };
  }, { kind: "buy" })
);

/* ---------------------------------------------------------------- items + purchases */

router.post(
  "/items/:id/buy",
  handle(async (req) => {
    const b = req.body || {};
    const r = await purchases.buyItem(req.user.id, String(req.params.id), { expectedPrice: b.expectedPrice ?? null, idempotencyKey: idemKey(req), source: typeof b.source === "string" ? b.source.slice(0, 20) : null, equip: b.equip === true, io: io(req) });
    return { ok: true, duplicate: r.duplicate, purchaseId: r.purchase?.id, paid: Number(r.purchase?.amount) || 0, itemId: r.item.id, balance: r.balance, refundableUntil: r.purchase?.refundable_until || null, partialPriceUntil: r.lockUntil || null, equipped: r.equipped || null, completed: r.completed || [] };
  }, { kind: "buy" })
);

/** "Hepsini kuşan": wear owned Market 2.0 items in one request (one profile broadcast, the
 * previous look kept as an outfit, undoable through the action log). */
router.post(
  "/equip",
  handle(async (req) => {
    const ids = Array.isArray(req.body?.itemIds) ? [...new Set(req.body.itemIds.map(String))].slice(0, 30) : [];
    if (!ids.length) return Promise.reject(Object.assign(new Error("item_required"), { code: "item_required", status: 400 }));
    const r = await purchases.equipBought(req.user.id, ids, { io: io(req) });
    return { ok: true, applied: r?.applied || {}, previousOutfitId: r?.previousOutfitId || null, actionId: r?.actionId || null };
  }, { kind: "write" })
);

router.get(
  "/purchases",
  handle(async (req) => ({
    purchases: (await purchases.listPurchases(req.user.id)).map((p) => ({ id: p.id, kind: p.kind, setKey: p.set_key, itemIds: p.item_ids || [], amount: Number(p.amount) || 0, listAmount: Number(p.list_amount) || 0, status: p.status, source: p.source, createdAt: p.created_at, refundableUntil: p.status === "paid" ? p.refundable_until : null })),
  }))
);

router.post(
  "/purchases/:id/refund",
  handle(async (req) => {
    const r = await purchases.refund(req.user.id, String(req.params.id), { io: io(req) });
    return { ok: true, ...r };
  }, { kind: "write" })
);

/* ---------------------------------------------------------------- night market */

router.get("/night-market", handle((req) => night.view(req.user.id, { base: base(req) })));

router.post(
  "/night-market/flip",
  handle(async (req) => {
    await night.flip(req.user.id, req.body?.cardIndex);
    return { ok: true, nightMarket: await night.view(req.user.id, { base: base(req) }) };
  }, { kind: "flip" })
);

router.post(
  "/night-market/keep",
  handle(async (req) => {
    const r = await night.keep(req.user.id, req.body?.cardIndex, req.body?.keep !== false);
    return { ok: true, ...r };
  }, { kind: "write" })
);

router.post(
  "/night-market/buy",
  handle(async (req) => {
    const r = await night.buy(req.user.id, req.body?.cardIndex, { idempotencyKey: idemKey(req), expectedPrice: req.body?.expectedPrice ?? null });
    return { ok: true, duplicate: r.duplicate, purchaseId: r.purchase?.id, paid: Number(r.purchase?.amount) || 0, itemId: r.item.id, balance: r.balance, refundableUntil: r.purchase?.refundable_until || null };
  }, { kind: "buy" })
);

// Reminder 10 minutes before a night market opens (stored server side, sent by the scheduler).
router.post("/night-market/notify", handle(async (req) => ({ ...(await night.setNotify(req.user.id, req.body?.on !== false)), minutesBefore: night.REMIND_MINUTES }), { kind: "write" }));

/* ---------------------------------------------------------------- gifts */

router.get("/gifts", handle((req) => gifts.list(req.user.id, { base: base(req) })));

/** Friend presence for the gift sheet ("Çevrimiçi" filter): invisible reads as offline. */
function presenceStatus(userId) {
  try {
    const { presence } = require("../runtime/sharedState");
    const p = presence.get(String(userId)) || presence.get(userId);
    if (!p) return "offline";
    const s = String(p.status || "online").toLowerCase();
    if (s === "invisible") return "offline";
    return ["online", "idle", "dnd"].includes(s) ? s : "online";
  } catch {
    return "offline";
  }
}

router.get("/gifts/recipients", handle(async (req) => {
  const out = await gifts.recipients(req.user.id, { itemId: typeof req.query.itemId === "string" ? req.query.itemId : null, setKey: typeof req.query.setKey === "string" ? req.query.setKey : null });
  return { ...out, recipients: (out.recipients || []).map((r) => (r.user ? { ...r, user: { ...r.user, status: presenceStatus(r.user.id) } } : r)) };
}));

/** "Arkadaşlarına göster": DM my new look (owned item or complete set) to up to 10 friends. */
router.post(
  "/share",
  handle(async (req) => {
    const b = req.body || {};
    return { ok: true, ...(await require("../lib/shop2/share").share(req.user.id, { itemId: b.itemId || null, setKey: b.setKey || null, toUserIds: b.toUserIds, message: b.message }, { io: io(req) })) };
  }, { kind: "share" })
);

router.get("/feed", handle((req) => views.friendFeed(req.user.id)));

/** A blocked quote carries the reason as an API message too ({ error, errorKey?, errorVars? }). */
router.post("/gifts/quote", handle(async (req) => {
  const q = await gifts.quote(req.user.id, req.body || {});
  if (q && q.ok === false && MESSAGES[q.code]) return { ...q, ...apiError(MESSAGES[q.code], q.vars || undefined) };
  return q;
}, { kind: "write" }));

router.post(
  "/gifts",
  handle(async (req) => {
    const r = await gifts.send(req.user.id, { ...(req.body || {}), idempotencyKey: idemKey(req) }, { base: base(req) });
    const g = r.gift;
    return { ok: true, duplicate: r.duplicate, giftId: g.id, status: gifts.liveStatus(g), sendAt: g.send_at, paid: Number(g.amount) || 0, itemIds: g.item_ids || [], balance: r.balance ?? null, flagged: Boolean(r.ring?.flagged) };
  }, { kind: "gift" })
);

router.post("/gifts/:id/recall", handle(async (req) => ({ ok: true, ...(await gifts.recall(req.user.id, String(req.params.id))) }), { kind: "write" }));
router.post("/gifts/:id/open", handle(async (req) => ({ ok: true, ...(await gifts.open(req.user.id, String(req.params.id), { equip: req.body?.equip === true, io: io(req), base: base(req) })) }), { kind: "write" }));
router.post("/gifts/:id/thank", handle(async (req) => ({ ok: true, ...(await gifts.mark(req.user.id, String(req.params.id), "thanked")) }), { kind: "write" }));
router.post("/gifts/:id/equipped", handle(async (req) => ({ ok: true, ...(await gifts.mark(req.user.id, String(req.params.id), "equipped")) }), { kind: "write" }));
router.put("/gifts/privacy", handle((req) => gifts.setPrivacy(req.user.id, req.body?.giftPrivacy), { kind: "write" }));

/* ---------------------------------------------------------------- history */

router.get(
  "/history",
  handle(async (req) => {
    const list = await actions.list(req.user.id, { limit: Number(req.query.limit) || 50, before: typeof req.query.before === "string" ? req.query.before : null });
    return { entries: await require("../lib/shop2/historyView").decorate(list.map((r) => actions.publicAction(r)), { base: base(req) }) };
  })
);

router.post("/history/:id/undo", handle(async (req) => ({ ok: true, ...(await history.undo(req.user.id, String(req.params.id), { io: io(req) })) }), { kind: "write" }));

/* ---------------------------------------------------------------- outfits */

router.get("/outfits", handle(async (req) => ({ outfits: (await outfits.list(req.user.id)).map(outfits.publicOutfit) })));
router.post("/outfits", handle(async (req) => ({ ok: true, outfit: outfits.publicOutfit(await outfits.save(req.user.id, { name: req.body?.name, look: req.body?.look || null, kind: req.body?.kind === "previous" ? "previous" : "saved" })) }), { kind: "write" }));
router.post("/outfits/:id/apply", handle(async (req) => ({ ok: true, ...(await outfits.apply(req.user.id, String(req.params.id), { io: io(req) })) }), { kind: "write" }));
router.delete("/outfits/:id", handle(async (req) => outfits.remove(req.user.id, String(req.params.id)), { kind: "write" }));

/* ---------------------------------------------------------------- wishlist */

router.get(
  "/wishlist",
  handle(async (req) => {
    const [rows, cat, owned] = await Promise.all([outfits.wishlist(req.user.id), catalog.getCatalog(), require("../lib/shop2/people").ownedIds(req.user.id)]);
    const today = await sfs.readRow(req.user.id, require("../lib/shop2/time").dayKey()).catch(() => null);
    const inFront = new Set((today?.slots || []).map((s) => String(s.itemId)));
    const b = base(req);
    return {
      items: rows
        .filter((r) => !String(r.item_id).startsWith("set:"))
        .map((r) => {
          const it = cat.byId.get(String(r.item_id));
          return it ? { item: catalog.publicItem(it, b), addedAt: r.created_at, owned: owned.has(String(it.id)), available: catalog.sellable(it), inStorefrontToday: inFront.has(String(it.id)) } : null;
        })
        .filter(Boolean),
      sets: rows.filter((r) => String(r.item_id).startsWith("set:")).map((r) => ({ setKey: String(r.item_id).slice(4), addedAt: r.created_at })),
    };
  })
);

router.post(
  "/wishlist",
  handle(async (req) => {
    const b = req.body || {};
    if (!b.itemId && !b.setKey) return Promise.reject(Object.assign(new Error("item_required"), { code: "item_required", status: 400 }));
    return { ok: true, ...(await outfits.toggleWish(req.user.id, { itemId: b.itemId || null, setKey: b.setKey || null, remove: b.remove === true })) };
  }, { kind: "write" })
);

router.delete("/wishlist/:itemId", handle(async (req) => ({ ok: true, ...(await outfits.toggleWish(req.user.id, { itemId: String(req.params.itemId).startsWith("set:") ? null : String(req.params.itemId), setKey: String(req.params.itemId).startsWith("set:") ? String(req.params.itemId).slice(4) : null, remove: true })) }), { kind: "write" }));

router.use((req, res) => res.status(404).json(apiError("Not found.", null, { code: "not_found" })));

module.exports = router;
