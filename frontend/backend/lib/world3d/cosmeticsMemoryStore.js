"use strict";

/**
 * In-memory stand-in for cosmeticsStore.js with the same contract as the SQL function
 * world_cosmetics_purchase (supabase/migrations/20261106_world_cosmetics.sql): one
 * purchase at a time per user, owned items not charged, the same request id replays the
 * first result, failures are not stored. Used by the selftests and the evidence mock
 * server (e2e/world3d/worldMockServer.cjs). The real function is tested against Postgres
 * in test/worldCosmetics.db.test.cjs.
 */

function createMemoryStore({ balances = {}, owned = {}, looks = {}, delayMs = 0 } = {}) {
  const bal = new Map(Object.entries(balances));
  const inv = new Map(Object.entries(owned).map(([u, ids]) => [u, new Set(ids)]));
  const saved = new Map(Object.entries(looks));
  const receipts = new Map(); // `${user}:${requestId}` -> result
  const ledger = [];
  const queues = new Map();
  const wait = () => (delayMs ? new Promise((r) => setTimeout(r, delayMs)) : Promise.resolve());

  function serial(userId, fn) {
    const prev = queues.get(userId) || Promise.resolve();
    const next = prev.then(fn, fn);
    queues.set(userId, next.catch(() => {}));
    return next;
  }

  return {
    ledger,
    receipts,
    frozen: new Set(),
    async loadOwned(userId) {
      await wait();
      return new Set(inv.get(String(userId)) || []);
    },
    async loadLook(userId) {
      await wait();
      return saved.get(String(userId)) || null;
    },
    async saveLook(userId, look) {
      await wait();
      saved.set(String(userId), JSON.parse(JSON.stringify(look)));
      return { ok: true, look };
    },
    async balance(userId) {
      return bal.get(String(userId)) || 0;
    },
    purchase(userId, requestId, items) {
      const uid = String(userId);
      return serial(uid, async () => {
        await wait();
        if (!/^[A-Za-z0-9_-]{8,64}$/.test(String(requestId || "")) || !Array.isArray(items) || !items.length) return { ok: false, error: "invalid" };
        const key = `${uid}:${requestId}`;
        const balance = bal.get(uid) || 0;
        if (receipts.has(key)) return { ...receipts.get(key), replayed: true, balance };
        const have = inv.get(uid) || new Set();
        const charged = [];
        const alreadyOwned = [];
        const seen = new Set();
        for (const it of items) {
          if (!it || typeof it.id !== "string" || seen.has(it.id) || !Number.isInteger(it.price) || it.price <= 0) return { ok: false, error: "invalid" };
          seen.add(it.id);
          if (have.has(it.id)) alreadyOwned.push(it.id);
          else charged.push({ id: it.id, price: it.price });
        }
        const total = charged.reduce((s, x) => s + x.price, 0);
        if (total > 0 && this.frozen.has(uid)) return { ok: false, error: "wallet_frozen", balance };
        if (total > balance) return { ok: false, error: "insufficient", balance, total };
        const after = balance - total;
        bal.set(uid, after);
        if (total > 0) ledger.push({ user_id: uid, amount: -total, reason: "shop_purchase", meta: { kind: "world_cosmetic", request_id: requestId, items: charged }, balance_after: after });
        for (const c of charged) have.add(c.id);
        inv.set(uid, have);
        const result = { ok: true, replayed: false, purchaseId: `p_${receipts.size + 1}`, charged, alreadyOwned, total, balance: after };
        receipts.set(key, result);
        return result;
      });
    },
  };
}

module.exports = { createMemoryStore };
