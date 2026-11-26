'use strict';
// /api/native for the widgets (draft B "Yuzler"): activity line, message bubbles, POST /wave.
// Run: node backend/routes/nativeWidgets.selftest.cjs
const assert = require('node:assert/strict');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'x';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'selftest-secret-selftest-secret-0123456789';

const glance = require('../lib/nativeGlance');
const { createNativeRouter } = require('./native');
const friendWave = require('../lib/friendWave');

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const D = '44444444-4444-4444-8444-444444444444';
const ME = '99999999-9999-4999-8999-999999999999';

// ---- pure shaping --------------------------------------------------------------------------
{
  assert.deepEqual(glance.shapeActivity({ presence: 'online', voice: { channelName: 'Oyun Gecesi', screen: true, since: null } }),
    { kind: 'screen', label: 'Oyun Gecesi', since: null }, 'sharing the screen wins');
  assert.equal(glance.shapeActivity({ presence: 'online', voice: { channelName: 'Lobi' }, app: { app_name: 'Minecraft', app_type: 'game' } }).kind, 'voice', 'voice before a game');
  assert.deepEqual(glance.shapeActivity({ presence: 'online', app: { app_name: 'javaw', display_name: 'Minecraft', app_type: 'game', started_at: '2026-11-24T19:00:00Z' } }),
    { kind: 'game', label: 'Minecraft', since: '2026-11-24T19:00:00.000Z' });
  assert.equal(glance.shapeActivity({ presence: 'online', app: { app_name: 'Spotify', app_type: 'app' } }).kind, 'music');
  assert.equal(glance.shapeActivity({ presence: 'online', app: { app_name: 'Figma', app_type: 'app' } }).kind, 'app');
  assert.deepEqual(glance.shapeActivity({ presence: 'idle' }), { kind: 'idle', label: null, since: null });
  assert.equal(glance.shapeActivity({ presence: 'dnd' }).kind, 'dnd');
  assert.equal(glance.shapeActivity({ presence: 'online', customStatus: 'Ders calisiyorum' }).label, 'Ders calisiyorum');
  assert.equal(glance.shapeActivity({ presence: 'online' }), null);
  assert.deepEqual(glance.shapeActivity({ presence: 'offline', voice: { channelName: 'x' }, lastSeen: '2026-11-24T18:00:00Z' }),
    { kind: 'offline', label: null, since: '2026-11-24T18:00:00.000Z' }, 'offline never shows a channel');
  assert.equal(glance.shapeActivity({ presence: 'offline' }), null);

  const servers = [{ id: 's1', name: 'Gece Kusu', channels: [{ id: 'v1', type: 'voice', name: 'Oyun Gecesi' }, { id: 't1', type: 'text', name: 'genel' }] }];
  const calls = new Map([
    ['v1', { startTime: Date.UTC(2026, 10, 24, 19), participants: new Map([[A, { id: A, isScreenSharing: true }], [B, { id: B }]]) }],
    ['hidden', { participants: new Map([[C, { id: C }]]) }],
  ]);
  const where = glance.voiceWhereabouts(servers, calls);
  assert.equal(where.get(A).screen, true);
  assert.equal(where.get(B).channelName, 'Oyun Gecesi');
  assert.equal(where.has(C), false, 'a channel the viewer cannot see stays private');
  const rooms = glance.shapeVoiceRooms(servers, calls);
  assert.equal(rooms[0].since, '2026-11-24T19:00:00.000Z');
  assert.deepEqual(rooms[0].occupants.map((o) => o.screen), [true, false]);

  assert.equal(glance.mentionsViewer('@demir cuma turnuvasi', 'demir'), true);
  assert.equal(glance.mentionsViewer('selam @demirci', 'demir'), false);
  assert.equal(glance.mentionsViewer('@everyone toplanti', 'x'), true);
  assert.equal(glance.mentionsViewer('mail@demir.com', 'demir'), false);

  const split = glance.splitGroupPreview('kaan: Notlari attim', [{ id: B, username: 'kaan', display_name: 'Kaan', avatar_url: 'https://cdn.x/k.png' }]);
  assert.equal(split.by, 'Kaan');
  assert.equal(split.text, 'Notlari attim');
  assert.equal(glance.splitGroupPreview('Saat: 21:00', []).by, null, 'a colon in the text is not a sender');
}

// ---- routes (fake deps, requireAuth skipped) ---------------------------------------------
function fakeDb(tables) {
  return {
    from(name) {
      let rows = (tables[name] || []).slice();
      const q = {
        select() { return q; },
        eq(col, val) { rows = rows.filter((r) => r[col] === val); return q; },
        gte() { return q; },
        order() { return q; },
        limit() { return q; },
        maybeSingle() { return Promise.resolve({ data: rows[0] || null, error: null }); },
        in(col, vals) { rows = rows.filter((r) => vals.includes(r[col])); return Promise.resolve({ data: rows, error: null }); },
        then(ok, bad) { return Promise.resolve({ data: rows, error: null }).then(ok, bad); },
      };
      return q;
    },
  };
}

(async () => {
  const servers = [{ id: 's1', name: 'Gece Kusu', notificationLevel: 'all', channels: [{ id: 'v1', type: 'voice', name: 'Oyun Gecesi' }, { id: 'c1', type: 'text', name: 'duyurular' }] }];
  const calls = new Map([['v1', { startTime: Date.UTC(2026, 10, 24, 19), participants: new Map([[B, { id: B }]]) }]]);
  const state = { bannedUserIds: new Set(), presence: new Map([[ME, { status: 'online' }]]), dmUnreadByUser: new Map(), activeServerVoiceCalls: calls };
  const emitted = [];
  const pushed = [];
  let previewOn = true;
  const deps = {
    state,
    userProfile: {
      loadUserProfile: async (id) => (id === ME ? { username: 'demir', display_name: 'Demir', avatar_url: 'https://cdn.x/d.png' } : null),
      enrichFriendEntry: (id) => ({
        [A]: { id: A, username: 'ece', displayName: 'Ece', status: 'online', avatarUrl: 'https://cdn.x/e.png' },
        [B]: { id: B, username: 'kaan', displayName: 'Kaan', status: 'online' },
        [C]: { id: C, username: 'zeynep', displayName: 'Zeynep', status: 'idle' },
        [D]: { id: D, username: 'baris', displayName: 'Baris', status: 'offline', lastSeen: '2026-11-24T18:00:00Z' },
      })[id],
    },
    dmMessages: {
      listAcceptedFriendIds: async () => [A, B, C, D],
      isAcceptedFriend: async (_a, b) => [A, B, C, D].includes(b),
      getLastDmMessage: (_me, peer) => (peer === A ? { from: { id: A }, text: "Aksam 9'da sese gelir misin?", timestamp: '2026-11-24T19:58:00Z' } : null),
      formatDmPreview: (m) => m.text || (m.mediaType === 'image' ? '\u{1F4F7} Photo' : null),
    },
    groupList: { getUserGroups: async () => [{ id: 'g1', name: 'Kampus Ekibi', lastMessage: 'kaan: Notlari attim', lastActivity: '2026-11-24T19:55:00Z', members: [{ id: B, username: 'kaan', display_name: 'Kaan' }] }] },
    readReceipts: { groupUnreadCounts: async () => ({ g1: 4 }) },
    dmPrefs: { listPrefs: async () => [] },
    dmUnread: { hydrateDmUnread: async ({ unreadMap }) => { unreadMap.set(A, 3); unreadMap.set(C, 1); return true; } },
    serverList: async () => ({ servers }),
    visibleActivityRows: async (ids) => {
      assert.ok(!ids.includes(D), 'offline friends are not looked up');
      return { [A]: { app_name: 'Minecraft', app_type: 'game', started_at: '2026-11-24T19:00:00Z' }, [C]: { privacy: 'only-me' } };
    },
    pushPreview: { previewEnabled: async () => previewOn },
    blocking: { isBlockedEitherWay: async () => false },
    webPush: { sendFriendWavePush: async (to, p) => pushed.push({ to, p }) },
    getDb: () => fakeDb({
      server_channel_reads: [{ user_id: ME, channel_id: 'c1', unread_count: 4 }],
      server_messages: [{ channel_id: 'c1', content: '@demir cuma turnuvasi kesinlesti', created_at: '2026-11-24T19:42:00Z', sender: { id: 'u-arda', username: 'arda', display_name: 'Arda' } }],
      dm_messages: [{ from_user_id: C, to_user_id: ME, content: '', media_type: 'image', media_url: 'https://x', created_at: '2026-11-24T19:34:00Z' }],
      friend_waves: [],
    }),
  };
  const router = createNativeRouter(deps);
  const middlewares = router.stack.filter((l) => !l.route).map((l) => l.handle).filter((h) => !h.descallBurstLimit).slice(1); // skip the burst limit and requireAuth
  const route = (method, p) => router.stack.find((l) => l.route && l.route.path === p && l.route.methods[method]).route.stack[0].handle;
  const call = (method, p, req) => new Promise((resolve) => {
    const res = {
      statusCode: 200,
      headers: {},
      set(k, v) { this.headers[k] = v; return this; },
      setHeader(k, v) { this.headers[k] = v; },
      status(c) { this.statusCode = c; return this; },
      json(b) { resolve({ status: this.statusCode, body: b, headers: this.headers }); },
    };
    const full = { get: () => 'tr', app: { get: (k) => (k === 'io' ? { to: (room) => ({ emit: (ev, payload) => emitted.push({ room, ev, payload }) }) } : null) }, ...req };
    const chain = [...middlewares, route(method, p)];
    let i = 0;
    const next = () => { const h = chain[i++]; if (h) Promise.resolve(h(full, res, next)).catch((e) => resolve({ status: 500, body: String(e) })); };
    next();
  });

  // Plain summary keeps the old, small shape.
  const plain = await call('get', '/summary', { user: { id: ME, username: 'demir' }, query: {} });
  assert.equal(plain.status, 200);
  assert.equal(plain.body.friends.online[0].activity, undefined, 'no activity unless asked');
  assert.equal(plain.body.unread.top[0].preview, undefined, 'no bubbles unless asked');

  const s = await call('get', '/summary', { user: { id: ME, username: 'demir' }, query: { activity: '1', previews: '1' } });
  assert.equal(s.status, 200);
  const byName = Object.fromEntries(s.body.friends.online.map((f) => [f.name, f]));
  assert.deepEqual(byName.Ece.activity, { kind: 'game', label: 'Minecraft', since: '2026-11-24T19:00:00.000Z' });
  assert.deepEqual(byName.Kaan.activity.kind, 'voice');
  assert.equal(byName.Kaan.activity.label, 'Oyun Gecesi');
  assert.equal(byName.Zeynep.activity.kind, 'idle', 'only-me activity is not shown');
  const top = Object.fromEntries(s.body.unread.top.map((r) => [r.conv, r]));
  assert.equal(top[`dm:${A}`].preview, "Aksam 9'da sese gelir misin?");
  assert.equal(top[`dm:${A}`].avatarUrl, 'https://cdn.x/e.png');
  assert.equal(top[`dm:${A}`].peerId, A);
  assert.equal(top['group:g1'].by, 'Kaan');
  assert.equal(top['group:g1'].preview, 'Notlari attim');
  assert.equal(top['channel:c1'].mention, true);
  assert.equal(top['channel:c1'].by, 'Arda');
  assert.equal(top[`dm:${C}`].preview, 'Fotoğraf', 'media previews are worded in the account language, no emoji');

  previewOn = false;
  const hidden = await call('get', '/summary', { user: { id: ME, username: 'demir' }, query: { previews: '1' } });
  assert.equal(hidden.body.unread.top[0].preview, undefined, '"Mesaj onizlemesi" off: counts only');

  const f = await call('get', '/friends', { user: { id: ME }, query: { activity: '1', ids: `${D},${A}` } });
  assert.deepEqual(f.body.friends.map((x) => x.id), [A, D]);
  assert.equal(f.body.friends[1].activity.kind, 'offline');

  // POST /wave
  friendWave.resetWaveMemory();
  const w = await call('post', '/wave', { user: { id: ME, username: 'demir' }, query: {}, body: { to: A, source: 'widget' } });
  assert.equal(w.status, 200, JSON.stringify(w.body));
  assert.equal(w.body.ok, true);
  assert.equal(w.body.remainingForFriend, 4);
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].room, `user:${A}`);
  assert.equal(emitted[0].ev, 'friend:wave');
  assert.equal(emitted[0].payload.from.name, 'Demir');
  await new Promise((r) => setImmediate(r));
  assert.equal(pushed.length, 1);
  const again = await call('post', '/wave', { user: { id: ME }, query: {}, body: { to: A } });
  assert.equal(again.status, 429);
  assert.equal(again.body.error, 'wave_cooldown');
  assert.ok(Number(again.headers['Retry-After']) > 0);
  const bad = await call('post', '/wave', { user: { id: ME }, query: {}, body: { to: '../x' } });
  assert.equal(bad.status, 400);
  const stranger = await call('post', '/wave', { user: { id: ME }, query: {}, body: { to: '55555555-5555-4555-8555-555555555555' } });
  assert.equal(stranger.status, 403);
  assert.equal(stranger.body.error, 'not_friend');

  console.log('native widgets route selftest: ok');
})().catch((e) => { console.error(e); process.exit(1); });
