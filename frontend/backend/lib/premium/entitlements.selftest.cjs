'use strict';
// Entitlements helper + premium gaming route gating. Run: node backend/lib/premium/entitlements.selftest.cjs
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'x';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'selftest-secret-selftest-secret-0123456789';

const ent = require('./entitlements');

function fakeDb(tables) {
  return {
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
        maybeSingle() { const d = rows.find((r) => filters.every((f) => f(r))) || null; return Promise.resolve({ data: d, error: null }); },
        upsert(row) { tables[name] = [...rows.filter((r) => r.user_id !== row.user_id), { ...rows.find((r) => r.user_id === row.user_id), ...row }]; return Promise.resolve({ error: null }); },
      };
      return q;
    },
  };
}

(async () => {
  // Mirror of src/premium/features.js
  const fe = await import(pathToFileURL(path.join(__dirname, '../../../src/premium/features.js')).href);
  const clientTier = Object.fromEntries(Object.entries(fe.FEATURES).map(([k, f]) => [k, f.tier]));
  assert.deepEqual(Object.keys(ent.FEATURE_TIER).sort(), Object.keys(clientTier).sort(), 'backend mirrors the client feature list');
  for (const [k, tier] of Object.entries(clientTier)) assert.equal(ent.FEATURE_TIER[k], tier, k);
  assert.deepEqual(ent.featuresFor('plus').sort(), fe.featuresForPlan('plus').sort());
  assert.deepEqual(ent.featuresFor('ultra').sort(), fe.featuresForPlan('ultra').sort());
  assert.deepEqual(ent.featuresFor(null), []);
  assert.equal(fe.tierAllows('ultra', 'game_status'), true);
  assert.equal(fe.tierAllows('plus', 'voice_hud'), false);

  // activePlan
  const future = new Date(Date.now() + 86_400_000).toISOString();
  const past = new Date(Date.now() - 1000).toISOString();
  assert.equal(ent.activePlan({ plan_id: 'ultra', status: 'active', ends_at: future }), 'ultra');
  assert.equal(ent.activePlan({ plan_id: 'ultra', status: 'active', ends_at: past }), null);
  assert.equal(ent.activePlan({ plan_id: 'plus', status: 'active', ends_at: null, unlimited: true }), 'plus');
  assert.equal(ent.activePlan({ plan_id: 'plus', status: 'cancelled', unlimited: true }), null);

  const tables = {
    user_subscriptions: [
      { user_id: 'u-plus', plan_id: 'plus', status: 'active', ends_at: future, unlimited: false },
      { user_id: 'u-ultra', plan_id: 'ultra', status: 'active', ends_at: null, unlimited: true },
    ],
    user_activity_settings: [{ user_id: 'u-plus', privacy: 'friends', game_card: 'everyone' }],
    user_presence: [{ user_id: 'u-plus', app_name: 'Rocket League', app_type: 'game', started_at: '2026-11-02T10:00:00Z', is_manual: false }],
    user_activity_log: [
      { id: 1, user_id: 'u-plus', app_name: 'Rocket League', app_type: 'game', started_at: new Date(Date.now() - 3_600_000).toISOString(), ended_at: null, duration_sec: 1200 },
      { id: 2, user_id: 'u-plus', app_name: 'Spotify', app_type: 'music', started_at: new Date(Date.now() - 3_600_000).toISOString(), ended_at: null, duration_sec: 900 },
      { id: 3, user_id: 'u-plus', app_name: 'Rocket League', app_type: 'game', started_at: new Date(Date.now() - 7_200_000).toISOString(), ended_at: null, duration_sec: 600 },
    ],
  };
  ent._setDb(fakeDb(tables));
  ent.invalidate();
  assert.equal(await ent.hasFeature('u-plus', 'game_status'), true);
  assert.equal(await ent.hasFeature('u-plus', 'voice_hud'), false);
  assert.equal(await ent.hasFeature('u-ultra', 'voice_hud'), true);
  assert.equal(await ent.hasFeature('u-free', 'game_status'), false);
  assert.equal(await ent.hasFeature('u-ultra', 'not_a_feature'), false);

  // Middleware
  const run = (mw, uid) => new Promise((resolve) => {
    const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(b) { resolve({ status: this.statusCode, body: b }); } };
    mw({ user: { id: uid } }, res, () => resolve({ status: 'next' }));
  });
  assert.equal((await run(ent.requireFeature('game_status'), 'u-plus')).status, 'next');
  const denied = await run(ent.requireFeature('instant_clip'), 'u-plus');
  assert.equal(denied.status, 403);
  assert.equal(denied.body.error, 'PREMIUM_REQUIRED');
  assert.equal((await run(ent.requireFeature(['instant_clip', 'game_session_history']), 'u-plus')).status, 'next');

  // Route handlers (premiumGaming.js) with the same fake db.
  const router = require('../../routes/premiumGaming');
  router._setDb(fakeDb(tables));
  const handlerFor = (method, p) => router.stack.find((l) => l.route && l.route.path === p && l.route.methods[method]).route.stack.map((s) => s.handle);
  const call = async (method, p, req) => {
    const chain = handlerFor(method, p).slice(1); // skip requireAuth
    return new Promise((resolve) => {
      const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(b) { resolve({ status: this.statusCode, body: b }); } };
      let i = 0;
      const next = () => { const h = chain[i++]; if (h) Promise.resolve(h(req, res, next)).catch((e) => resolve({ status: 500, body: String(e) })); };
      next();
    });
  };
  const s = await call('get', '/sessions', { user: { id: 'u-plus' }, query: {} });
  assert.equal(s.status, 200);
  assert.deepEqual(s.body.sessions.map((x) => x.game), ['Rocket League', 'Rocket League']);
  assert.equal(s.body.stats.totalSec, 1800);
  assert.equal((await call('get', '/sessions', { user: { id: 'u-free' }, query: {} })).status, 403);
  const st = await call('get', '/status/:userId', { user: { id: 'u-free' }, params: { userId: 'u-plus' } });
  assert.equal(st.body.status.game, 'Rocket League', 'everyone visibility shows the card to a free viewer');
  const none = await call('get', '/status/:userId', { user: { id: 'u-plus' }, params: { userId: 'u-free' } });
  assert.equal(none.body.status, null, 'a non-member has no card');
  assert.equal((await call('put', '/prefs', { user: { id: 'u-plus' }, body: { game_card: 'nobody' } })).body.game_card, 'nobody');
  const hidden = await call('get', '/status/:userId', { user: { id: 'u-free' }, params: { userId: 'u-plus' } });
  assert.equal(hidden.body.status, null, 'nobody hides the card');
  assert.equal((await call('put', '/prefs', { user: { id: 'u-plus' }, body: { game_card: 'x' } })).status, 400);
  console.log('entitlements selftest: ok');
})().catch((e) => { console.error(e); process.exit(1); });
