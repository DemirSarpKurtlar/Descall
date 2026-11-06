'use strict';
// /api/premium/gaming routes: entitlement gating on the server and the game card visibility.
// Run: node backend/routes/premiumGaming.selftest.cjs
const assert = require('node:assert/strict');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'x';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'selftest-secret-selftest-secret-0123456789';

const ent = require('../lib/premium/entitlements');
const router = require('./premiumGaming');

const PLANS = { 'u-plus': 'plus', 'u-ultra': 'ultra' };

function fakeDb(tables) {
  return {
    rpc(name, args) {
      if (name !== 'premium_me') return Promise.resolve({ data: null, error: { message: 'no rpc' } });
      const plan = PLANS[args.p_user] || null;
      return Promise.resolve({ data: { plan, status: plan ? 'active' : 'none', unlimited: true }, error: null });
    },
    from(name) {
      const rows = tables[name] || [];
      const filters = [];
      const q = {
        select() { return q; },
        eq(col, val) { filters.push((r) => r[col] === val); return q; },
        gte(col, val) { filters.push((r) => r[col] >= val); return q; },
        lte(col, val) { filters.push((r) => r[col] <= val); return q; },
        or() { return q; },
        order() { return q; },
        limit() { return Promise.resolve({ data: rows.filter((r) => filters.every((f) => f(r))), error: null }); },
        maybeSingle() { return Promise.resolve({ data: rows.find((r) => filters.every((f) => f(r))) || null, error: null }); },
        upsert(row) { tables[name] = [...rows.filter((r) => r.user_id !== row.user_id), { ...rows.find((r) => r.user_id === row.user_id), ...row }]; return Promise.resolve({ error: null }); },
      };
      return q;
    },
  };
}

(async () => {
  const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const twoAgo = new Date(Date.now() - 7_200_000).toISOString();
  const tables = {
    user_activity_settings: [{ user_id: 'u-plus', privacy: 'friends', game_card: 'everyone' }],
    user_presence: [{ user_id: 'u-plus', app_name: 'Rocket League', app_type: 'game', started_at: '2026-11-02T10:00:00Z', is_manual: false }],
    friendships: [],
    user_activity_log: [
      { id: 1, user_id: 'u-plus', app_name: 'Rocket League', app_type: 'game', started_at: hourAgo, ended_at: null, duration_sec: 1200 },
      { id: 2, user_id: 'u-plus', app_name: 'Spotify', app_type: 'music', started_at: hourAgo, ended_at: null, duration_sec: 900 },
      { id: 3, user_id: 'u-plus', app_name: 'Rocket League', app_type: 'game', started_at: twoAgo, ended_at: null, duration_sec: 600 },
    ],
  };
  const db = fakeDb(tables);
  ent.__setDbForTests(db);
  router._setDb(db);

  assert.equal(await ent.hasFeature('u-plus', 'game_status'), true);
  assert.equal(await ent.hasFeature('u-plus', 'activity_timeline'), false);
  assert.equal(await ent.hasFeature('u-ultra', 'activity_timeline'), true);
  assert.equal(await ent.hasFeature('u-free', 'game_status'), false);

  const handlers = (method, p) => router.stack.find((l) => l.route && l.route.path === p && l.route.methods[method]).route.stack.map((s) => s.handle);
  const call = (method, p, req) => {
    const chain = handlers(method, p).slice(1); // skip requireAuth
    return new Promise((resolve) => {
      const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(b) { resolve({ status: this.statusCode, body: b }); } };
      let i = 0;
      const next = () => { const h = chain[i++]; if (h) Promise.resolve(h(req, res, next)).catch((e) => resolve({ status: 500, body: String(e) })); };
      next();
    });
  };

  const s = await call('get', '/sessions', { user: { id: 'u-plus' }, query: {} });
  assert.equal(s.status, 200);
  assert.deepEqual(s.body.sessions.map((x) => x.game), ['Rocket League', 'Rocket League'], 'only game rows');
  assert.equal(s.body.stats.totalSec, 1800);
  const denied = await call('get', '/sessions', { user: { id: 'u-free' }, query: {} });
  assert.equal(denied.status, 403);
  assert.equal(denied.body.error, 'PREMIUM_REQUIRED');
  assert.equal((await call('get', '/sessions', { user: { id: 'u-ultra' }, query: {} })).status, 200, 'activity_timeline also unlocks it');

  const st = await call('get', '/status/:userId', { user: { id: 'u-free' }, params: { userId: 'u-plus' } });
  assert.equal(st.body.status.game, 'Rocket League', 'everyone visibility shows the card to a free viewer');
  const none = await call('get', '/status/:userId', { user: { id: 'u-plus' }, params: { userId: 'u-free' } });
  assert.equal(none.body.status, null, 'a non-member has no card');
  assert.equal((await call('put', '/prefs', { user: { id: 'u-plus' }, body: { game_card: 'friends' } })).body.game_card, 'friends');
  const notFriend = await call('get', '/status/:userId', { user: { id: 'u-free' }, params: { userId: 'u-plus' } });
  assert.equal(notFriend.body.status, null, 'friends visibility hides the card from a stranger');
  assert.equal((await call('put', '/prefs', { user: { id: 'u-plus' }, body: { game_card: 'x' } })).status, 400);
  assert.equal((await call('put', '/prefs', { user: { id: 'u-free' }, body: { game_card: 'everyone' } })).status, 403, 'prefs need game_status');
  assert.equal((await call('get', '/status/:userId', { user: { id: 'u-free' }, params: { userId: 'bad id;drop' } })).status, 400);
  console.log('premiumGaming route selftest: ok');
})().catch((e) => { console.error(e); process.exit(1); });
