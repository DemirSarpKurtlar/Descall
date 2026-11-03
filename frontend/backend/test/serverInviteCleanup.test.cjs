const assert = require("node:assert/strict");
const { pruneExpiredInvites, isUsedUp, GRACE_MS } = require("../lib/serverInviteCleanup");

function fake(rows) {
  const deleted = [];
  const q = (filters = []) => ({
    select() { return q(filters); },
    lt(col, v) { return q([...filters, (r) => r[col] != null && r[col] < v]); },
    not(col) { return q([...filters, (r) => r[col] != null]); },
    limit() { return Promise.resolve({ data: rows.filter((r) => filters.every((f) => f(r))) }); },
    delete() { return { in: (_c, codes) => { deleted.push(...codes); return Promise.resolve({}); } }; },
  });
  return { from: () => q(), deleted };
}

(async () => {
  const now = new Date("2026-11-03T12:00:00Z");
  const iso = (ms) => new Date(now.getTime() + ms).toISOString();
  const sb = fake([
    { code: "old-expired", expires_at: iso(-GRACE_MS - 1000), created_at: iso(-9e9) },
    { code: "fresh-expired", expires_at: iso(-1000), created_at: iso(-9e9) },
    { code: "old-usedup", max_uses: 1, uses: 1, created_at: iso(-GRACE_MS - 1000) },
    { code: "old-open", max_uses: 5, uses: 1, created_at: iso(-GRACE_MS - 1000) },
    { code: "new-usedup", max_uses: 1, uses: 1, created_at: iso(-1000) },
  ]);
  const n = await pruneExpiredInvites(sb, now);
  assert.equal(n, 2);
  assert.deepEqual(sb.deleted.sort(), ["old-expired", "old-usedup"]);
  assert.equal(isUsedUp({ max_uses: null, uses: 9 }), false);
  console.log("serverInviteCleanup test ok");
})().catch((e) => { console.error(e); process.exit(1); });
