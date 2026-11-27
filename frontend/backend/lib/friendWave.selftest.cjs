'use strict';
// "El salla" (widgets draft B): limits and delivery. Run: node backend/lib/friendWave.selftest.cjs
const assert = require('node:assert/strict');
const wave = require('./friendWave');

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const T0 = Date.UTC(2026, 10, 24, 20, 0, 0);
const MIN = 60 * 1000;

// ---- decideWave (pure) ---------------------------------------------------------------------
{
  const ok = wave.decideWave({ recent: [], to: B, now: T0 });
  assert.equal(ok.ok, true);
  assert.equal(ok.remainingForFriend, wave.WAVES_PER_FRIEND - 1);
  assert.equal(ok.remainingToday, wave.WAVES_PER_DAY - 1);

  const cool = wave.decideWave({ recent: [{ to: B, at: T0 - 20 * 1000 }], to: B, now: T0 });
  assert.equal(cool.ok, false);
  assert.equal(cool.error, 'wave_cooldown');
  assert.equal(cool.retryAfter, 40, 'the rest of the 60 s pair cooldown');
  assert.equal(wave.decideWave({ recent: [{ to: B, at: T0 - 20 * 1000 }], to: C, now: T0 }).ok, true, 'cooldown is per friend');

  const five = Array.from({ length: 5 }, (_, i) => ({ to: B, at: T0 - (i + 2) * 60 * MIN }));
  const lim = wave.decideWave({ recent: five, to: B, now: T0 });
  assert.equal(lim.error, 'wave_limit', '5 per friend per day');
  assert.equal(lim.resetAt, T0 - 6 * 60 * MIN + wave.DAY_MS, 'frees up when the oldest of the five turns 24 h old');
  assert.equal(wave.decideWave({ recent: five, to: C, now: T0 }).ok, true);

  const old = five.map((w) => ({ ...w, at: w.at - wave.DAY_MS }));
  assert.equal(wave.decideWave({ recent: old, to: B, now: T0 }).ok, true, 'waves older than 24 h do not count');

  const twenty = Array.from({ length: 20 }, (_, i) => ({ to: `f${i}`, at: T0 - (i + 2) * MIN }));
  const day = wave.decideWave({ recent: twenty, to: B, now: T0 });
  assert.equal(day.error, 'wave_limit', '20 per sender per day');
  assert.ok(day.retryAfter > 0);
  assert.equal(wave.decideWave({ recent: [{ to: B, at: NaN }, null, { to: B, at: T0 + 3600e3 }], to: B, now: T0 }).ok, true, 'junk and future stamps ignored');
}

// ---- sendWave (fake deps) ------------------------------------------------------------------
function fakeDb({ fail = false } = {}) {
  const rows = [];
  const db = {
    rows,
    from(name) {
      assert.equal(name, 'friend_waves');
      let list = rows.slice();
      const q = {
        select() { return q; },
        eq(col, val) { list = list.filter((r) => r[col] === val); return q; },
        gte(col, val) { list = list.filter((r) => r[col] >= val); return q; },
        lt() { return Promise.resolve({ error: null }); },
        order() { return q; },
        limit() { return Promise.resolve(fail ? { data: null, error: { code: '42P01' } } : { data: list, error: null }); },
        insert(row) {
          const r = { id: `id-${rows.length + 1}`, created_at: new Date(db.now).toISOString(), ...row };
          rows.push(r);
          return { select: () => ({ maybeSingle: () => Promise.resolve({ data: { id: r.id }, error: null }) }) };
        },
        delete() { return q; },
      };
      return q;
    },
    now: T0,
  };
  return db;
}

(async () => {
  wave.resetWaveMemory();
  let now = T0;
  const db = fakeDb();
  const emitted = [];
  const pushed = [];
  const deps = {
    db,
    now: () => now,
    isAcceptedFriend: async (a, b) => [B, C].includes(b) && a === A,
    isBlockedEitherWay: async (_a, b) => b === C,
    emit: (to, event, payload) => emitted.push({ to, event, payload }),
    push: async (to, payload) => pushed.push({ to, payload }),
    sender: async () => ({ username: 'demir', name: 'Demir', avatarUrl: 'http://not-https/x.png' }),
  };

  const first = await wave.sendWave(deps, { fromId: A, to: B, source: 'widget' });
  assert.equal(first.ok, true);
  assert.equal(first.remainingForFriend, 4);
  assert.equal(db.rows.length, 1, 'durable row written');
  assert.equal(db.rows[0].source, 'widget');
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].event, 'friend:wave');
  assert.equal(emitted[0].to, B);
  assert.equal(emitted[0].payload.from.name, 'Demir');
  assert.equal(emitted[0].payload.from.avatarUrl, null, 'only https avatars travel');
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(pushed, [{ to: B, payload: { fromId: A, from: 'Demir' } }]);

  await assert.rejects(wave.sendWave(deps, { fromId: A, to: B }), (e) => e.code === 'wave_cooldown' && e.status === 429);
  await assert.rejects(wave.sendWave(deps, { fromId: A, to: C }), (e) => e.code === 'not_friend' && e.status === 403, 'blocked reads as not a friend');
  await assert.rejects(wave.sendWave(deps, { fromId: A, to: A }), (e) => e.code === 'bad_target');
  await assert.rejects(wave.sendWave(deps, { fromId: A, to: 'x;drop' }), (e) => e.code === 'bad_target');
  await assert.rejects(wave.sendWave(deps, { fromId: A, to: '44444444-4444-4444-8444-444444444444' }), (e) => e.code === 'not_friend');

  for (let i = 1; i < 5; i += 1) {
    now += 2 * MIN;
    db.now = now;
    await wave.sendWave(deps, { fromId: A, to: B, source: 'bogus' });
  }
  assert.equal(db.rows[1].source, 'widget', 'unknown source falls back to widget');
  now += 2 * MIN;
  await assert.rejects(wave.sendWave(deps, { fromId: A, to: B }), (e) => e.code === 'wave_limit' && e.retryAfter > 0);

  // A restart forgets the memory stamps; the table still holds the limit.
  wave.resetWaveMemory();
  await assert.rejects(wave.sendWave(deps, { fromId: A, to: B }), (e) => e.code === 'wave_limit', 'durable count survives a restart');

  // Table not migrated yet: memory alone, the wave is still delivered.
  wave.resetWaveMemory();
  const noTable = fakeDb({ fail: true });
  const out = await wave.sendWave({ ...deps, db: noTable }, { fromId: A, to: B });
  assert.equal(out.ok, true);
  assert.equal(noTable.rows.length, 0, 'no insert into a table that is not there');
  await assert.rejects(wave.sendWave({ ...deps, db: noTable }, { fromId: A, to: B }), (e) => e.code === 'wave_cooldown');

  console.log('friend wave selftest: ok');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
