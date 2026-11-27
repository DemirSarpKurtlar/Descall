'use strict';
// /api/native glance routes (4.2: Siri / Shortcuts / widgets / Android shortcuts) and their shaping.
// Run: node backend/routes/native.selftest.cjs
const assert = require('node:assert/strict');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'x';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'selftest-secret-selftest-secret-0123456789';

const glance = require('../lib/nativeGlance');
const { createNativeRouter } = require('./native');

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const ME = '99999999-9999-4999-8999-999999999999';

// ---- pure shaping -----------------------------------------------------------------------
{
  const entries = [
    { id: A, username: 'ayse', displayName: 'Ayşe Yılmaz', status: 'online', avatarUrl: 'https://cdn.x/a.png' },
    { id: B, username: 'bora', displayName: null, status: 'invisible', avatarUrl: 'data:image/png;base64,xx' },
    { id: C, username: 'cem', displayName: 'Cem', status: 'dnd', customStatus: 'x'.repeat(100) },
    { id: 'bad id;', username: 'evil', status: 'online' },
    null,
  ];
  const all = glance.shapeFriendList(entries).friends;
  assert.deepEqual(all.map((f) => f.username), ['ayse', 'cem', 'bora'], 'online, dnd, then offline; bad ids dropped');
  assert.equal(all[2].presence, 'offline', 'invisible reads as offline');
  assert.equal(all[2].avatarUrl, null, 'only https avatars');
  assert.equal(all[0].conv, `dm:${A}`);
  assert.equal(all[0].initials, 'AY');
  assert.ok(all[1].customStatus.length <= 60);
  assert.deepEqual(glance.shapeFriendList(entries, { q: 'AYSE' }).friends.map((f) => f.id), [A], 'accent and case folded search');
  assert.deepEqual(glance.shapeFriendList(entries, { q: 'yılmaz' }).friends.map((f) => f.id), [A]);
  assert.deepEqual(glance.shapeFriendList(entries, { ids: [C] }).friends.map((f) => f.id), [C]);
  assert.equal(glance.shapeFriendList(entries, { q: 'nobody' }).friends.length, 0);
}

{
  const friendsById = new Map([[A, { id: A, displayName: 'Ayşe' }], [B, { id: B, username: 'bora' }]]);
  const u = glance.shapeUnread({
    dmUnreadByPeer: new Map([[A, 3], [B, 250], [C, 4]]),
    groupUnread: { g1: 2, g2: 0, gone: 5 },
    channelUnread: { c1: 7 },
    friendsById,
    groupsById: new Map([['g1', { name: 'Ekip' }]]),
    channelsById: new Map([['c1', { name: 'genel', serverName: 'Oyun', serverId: 's1' }]]),
    mutedPeers: new Set(),
  });
  assert.equal(u.dms, 3 + 99, 'per-conversation cap 99, non-friends (C) left out');
  assert.equal(u.groups, 2, 'unknown group ids are left out');
  assert.equal(u.channels, 7);
  assert.equal(u.total, 111);
  assert.deepEqual(u.top.map((r) => r.conv), [`dm:${B}`, 'channel:c1', `dm:${A}`, 'group:g1']);
  assert.equal(u.top[1].title, 'Oyun #genel');
  const muted = glance.shapeUnread({ dmUnreadByPeer: { [A]: 3 }, friendsById, mutedPeers: new Set([A]) });
  assert.equal(muted.total, 0, 'muted DMs do not count');
  assert.deepEqual(glance.shapeUnread(), { total: 0, dms: 0, groups: 0, channels: 0, top: [] });
}

const servers = [
  {
    id: 's1', name: 'Oyun Gecesi', notificationLevel: 'all', channels: [
      { id: 'cat', type: 'category', name: 'Ses' },
      { id: 'v1', type: 'voice', name: 'Lobi', position: 1 },
      { id: 'v2', type: 'stage', name: 'Sahne', position: 2 },
      { id: 'c1', type: 'text', name: 'genel', position: 0 },
      { id: 'n1', type: 'text', name: 'gizli', nsfw: true },
    ],
  },
  { id: 's2', name: 'Okul', notificationLevel: 'muted', channels: [{ id: 'c2', type: 'text', name: 'duyuru' }, { id: 'v3', type: 'voice', name: 'Ders' }] },
];
const calls = new Map([
  ['v1', { serverId: 's1', participants: new Map([[A, { id: A, displayName: 'Ayşe', avatarUrl: 'https://cdn.x/a.png' }], [B, { username: 'bora' }]]) }],
  ['zz', { serverId: 'sX', participants: new Map([[C, { id: C }]]) }],
]);

{
  const rooms = glance.shapeVoiceRooms(servers, calls);
  assert.deepEqual(rooms.map((r) => r.channelId), ['v1', 'v2', 'v3'], 'occupied first, only visible voice/stage channels');
  assert.equal(rooms[0].occupantCount, 2);
  assert.deepEqual(rooms[0].occupants.map((o) => o.id), [A, B], 'occupant id falls back to the map key');
  assert.equal(rooms[1].type, 'stage');
  assert.deepEqual(glance.shapeVoiceRooms(servers, calls, { occupiedOnly: true }).map((r) => r.channelId), ['v1']);
  assert.deepEqual(glance.shapeVoiceRooms(servers, calls, { q: 'ders' }).map((r) => r.channelId), ['v3']);
  assert.equal(rooms.some((r) => r.channelId === 'zz'), false, 'calls outside my servers never show');

  const d = glance.shapeDestinations({ servers, groups: [{ id: 'g1', name: 'Ekip' }, { id: 'g2', name: 'Eski', removed: true }] }).destinations;
  assert.deepEqual(d.map((x) => x.id), ['server:s1', 'channel:c1', 'server:s2', 'channel:c2', 'group:g1'], 'text channels only, no nsfw, no removed groups');
  assert.equal(d[1].title, '#genel');
  assert.equal(d[1].subtitle, 'Oyun Gecesi');
  assert.deepEqual(glance.shapeDestinations({ servers, q: 'okul' }).destinations.map((x) => x.id), ['server:s2', 'channel:c2']);

  const sum = glance.shapeSummary({
    me: { id: ME, username: 'me', displayName: 'Ben' },
    myStatus: 'weird',
    friends: [{ id: A, username: 'ayse', status: 'online' }, { id: B, username: 'bora', status: 'offline' }],
    voice: rooms,
    now: Date.UTC(2026, 10, 24),
  });
  assert.equal(sum.me.status, 'online', 'unknown status falls back');
  assert.equal(sum.friends.onlineCount, 1);
  assert.equal(sum.friends.offlineCount, 1);
  assert.deepEqual(sum.voice.map((r) => r.channelId), ['v1'], 'summary lists occupied rooms only');
  assert.equal(sum.unread.total, 0);
  assert.equal(sum.generatedAt, '2026-11-24T00:00:00.000Z');
}

// ---- routes (fake deps, requireAuth skipped) ---------------------------------------------
function fakeDb(tables) {
  return {
    from(name) {
      let rows = tables[name] || [];
      const q = {
        select() { return q; },
        eq(col, val) { rows = rows.filter((r) => r[col] === val); return q; },
        in(col, vals) { rows = rows.filter((r) => vals.includes(r[col])); return Promise.resolve({ data: rows, error: null }); },
      };
      return q;
    },
  };
}

(async () => {
  const dmUnreadByUser = new Map();
  const state = {
    bannedUserIds: new Set(['banned-user']),
    presence: new Map([[ME, { status: 'dnd' }]]),
    dmUnreadByUser,
    activeServerVoiceCalls: calls,
  };
  const deps = {
    state,
    userProfile: {
      loadUserProfile: async () => ({ username: 'me', display_name: 'Ben' }),
      enrichFriendEntry: (id) => ({ [A]: { id: A, username: 'ayse', status: 'online' }, [B]: { id: B, username: '?', status: 'idle' } })[id],
    },
    dmMessages: { listAcceptedFriendIds: async () => [A, B] },
    groupList: { getUserGroups: async () => [{ id: 'g1', name: 'Ekip' }] },
    readReceipts: { groupUnreadCounts: async () => ({ g1: 4 }) },
    dmPrefs: { listPrefs: async () => [{ peerId: B, muted: true }] },
    dmUnread: { hydrateDmUnread: async ({ unreadMap }) => { unreadMap.set(A, 2); unreadMap.set(B, 9); return true; } },
    serverList: async () => ({ servers }),
    getDb: () => fakeDb({
      users: [{ id: B, username: 'bora', display_name: 'Bora' }],
      server_channel_reads: [{ user_id: ME, channel_id: 'c1', unread_count: 5 }, { user_id: ME, channel_id: 'c2', unread_count: 8 }],
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
    const chain = [...middlewares, route(method, p)];
    let i = 0;
    const next = () => { const h = chain[i++]; if (h) Promise.resolve(h(req, res, next)).catch((e) => resolve({ status: 500, body: String(e) })); };
    next();
  });

  const s = await call('get', '/summary', { user: { id: ME, username: 'me' }, query: {} });
  assert.equal(s.status, 200);
  assert.equal(s.headers['Cache-Control'], 'no-store');
  assert.equal(s.body.me.status, 'dnd', 'live presence wins');
  assert.equal(s.body.unread.dms, 2, 'muted DM (B) left out');
  assert.equal(s.body.unread.groups, 4);
  assert.equal(s.body.unread.channels, 5, 'muted server channels left out');
  assert.equal(s.body.unread.total, 11);
  assert.equal(s.body.friends.onlineCount, 2);
  assert.equal(s.body.voice.length, 1);
  assert.ok(dmUnreadByUser.has(ME), 'live DM map created for the user');

  const f = await call('get', '/friends', { user: { id: ME }, query: { q: 'bor' } });
  assert.deepEqual(f.body.friends.map((x) => x.name), ['Bora'], 'missing names come from the users table');
  const byIds = await call('get', '/friends', { user: { id: ME }, query: { ids: `${A},x` } });
  assert.deepEqual(byIds.body.friends.map((x) => x.id), [A]);

  const v = await call('get', '/voice', { user: { id: ME }, query: { occupied: '1' } });
  assert.deepEqual(v.body.rooms.map((r) => r.channelId), ['v1']);
  const d = await call('get', '/destinations', { user: { id: ME }, query: { q: 'gen' } });
  assert.deepEqual(d.body.destinations.map((x) => x.id), ['channel:c1']);

  const banned = await call('get', '/summary', { user: { id: 'banned-user' }, query: {} });
  assert.equal(banned.status, 403);

  const broken = createNativeRouter({ ...deps, dmMessages: { listAcceptedFriendIds: async () => { throw new Error('db down'); } } });
  const brokenRoute = broken.stack.find((l) => l.route && l.route.path === '/friends').route.stack[0].handle;
  const origError = console.error;
  console.error = () => {};
  const failed = await new Promise((resolve) => {
    const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(b) { resolve({ status: this.statusCode, body: b }); } };
    brokenRoute({ user: { id: ME }, query: {} }, res);
  });
  console.error = origError;
  assert.equal(failed.status, 500);
  assert.deepEqual(failed.body, { error: 'failed' }, 'no internal message leaks');

  console.log('native glance route selftest: ok');
})().catch((e) => { console.error(e); process.exit(1); });
