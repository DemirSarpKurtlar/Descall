'use strict';
// "Paylaş > Descall" (4.3): share sheet rules (lib/shareTargets.js), the service behind
// /api/native/share (lib/shareService.js) and the router. No network, fake database.
// Run: node backend/routes/share.selftest.cjs
const assert = require('node:assert/strict');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'x';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'selftest-secret-selftest-secret-0123456789';

const share = require('../lib/shareTargets');
const { createShareService, ShareError, readItems } = require('../lib/shareService');
const { createShareRouter } = require('./share');
const { createFakeSupabase } = require('../test/fakeSupabase.cjs');

const ME = '99999999-9999-4999-8999-999999999999';
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const G = '33333333-3333-4333-8333-333333333333';
const C1 = '44444444-4444-4444-8444-444444444444';
const C2 = '55555555-5555-4555-8555-555555555555';
const C3 = '66666666-6666-4666-8666-666666666666';
const S1 = '77777777-7777-4777-8777-777777777777';
const NOW = Date.UTC(2026, 10, 24, 12, 0, 0);
const { BITS } = share;
const MEMBER = BITS.VIEW_CHANNEL | BITS.SEND_MESSAGES | BITS.ATTACH_FILES;

// ---- channel verdicts -------------------------------------------------------------------
{
  const v = (o) => share.channelVerdict({ now: NOW, ...o });
  assert.deepEqual(v({ bits: MEMBER }), { canSend: true, canAttach: true, reason: null, slowModeSec: 0 });
  assert.deepEqual(v({ bits: BITS.VIEW_CHANNEL }), { canSend: false, canAttach: false, reason: 'no_permission', slowModeSec: 0 });
  assert.equal(v({ bits: MEMBER, type: 'announcement' }).reason, 'announcement', 'members cannot post in announcements');
  assert.equal(v({ bits: MEMBER, type: 'announcement', sendAllowed: true }).canSend, true, 'unless an overwrite allows SEND');
  assert.equal(v({ bits: MEMBER | BITS.MANAGE_MESSAGES, type: 'announcement' }).canSend, true, 'moderators can');
  assert.equal(v({ bits: MEMBER, timeoutUntil: new Date(NOW + 60000).toISOString() }).reason, 'timed_out');
  assert.equal(v({ bits: MEMBER, timeoutUntil: new Date(NOW - 60000).toISOString() }).canSend, true, 'an old timeout is over');
  assert.equal(v({ bits: MEMBER, siteTimedOut: true }).reason, 'timed_out');
  assert.deepEqual(v({ bits: BITS.VIEW_CHANNEL | BITS.SEND_MESSAGES }), { canSend: true, canAttach: false, reason: 'no_attach', slowModeSec: 0 });
  assert.equal(v({ bits: MEMBER, slowmodeSeconds: 30 }).slowModeSec, 30);
  assert.equal(v({ bits: MEMBER | BITS.MANAGE_MESSAGES, slowmodeSeconds: 30 }).slowModeSec, 0, 'moderators skip slow mode');
  assert.equal(v({ bits: BITS.ADMINISTRATOR, type: 'announcement', siteTimedOut: true }).canSend, true, 'administrator');
  assert.equal(v({ bits: 0n, isOwner: true }).canSend, true, 'owner');
  assert.equal(v({ bits: '2048' }).reason, 'no_permission', 'string bits parse; SEND without VIEW is no access');
  assert.equal(v({ bits: 'not a number' }).canSend, false);
}

// ---- recents, targets -------------------------------------------------------------------
{
  const day = (d, h = 10) => new Date(Date.UTC(2026, 10, d, h)).toISOString();
  const r = share.pickRecents([
    { conv: `dm:${A}`, at: day(23, 9), media: true },
    { conv: `dm:${A}`, at: day(23, 10), media: true },
    { conv: `dm:${A}`, at: day(23, 11), media: true },
    { conv: `dm:${A}`, at: day(20), media: true },
    { conv: `group:${G}`, at: day(24, 8), media: false },
    { conv: `channel:${C1}`, at: day(22) , media: true },
    { conv: 'bogus', at: day(24) },
    { conv: `dm:${B}`, at: 'never' },
  ]);
  assert.deepEqual(r.order, [`group:${G}`, `dm:${A}`, `channel:${C1}`], 'newest first, junk dropped');
  assert.equal(r.byConv.get(`dm:${A}`).mediaCount, 3, 'attachments on the day of the latest one');
  assert.equal(r.byConv.get(`group:${G}`).mediaCount, 0);

  const servers = [{
    id: S1, name: 'Pixel Kulübü', memberCount: 1204, timeoutUntil: null,
    channels: [
      { id: C1, name: 'genel', type: 'text', position: 0 },
      { id: C2, name: 'fotoğraflar', type: 'text', position: 1 },
      { id: C3, name: 'duyurular', type: 'announcement', position: 2 },
      { id: 'v1', name: 'Lobi', type: 'voice', position: 3 },
    ],
  }, { id: 'empty', name: 'Sessiz', channels: [{ id: 'vv', type: 'voice' }] }];
  const verdicts = new Map([
    [C1, share.channelVerdict({ bits: MEMBER })],
    [C2, share.channelVerdict({ bits: MEMBER, slowmodeSeconds: 30 })],
    [C3, share.channelVerdict({ bits: MEMBER, type: 'announcement' })],
  ]);
  const t = share.shapeTargets({
    friends: [
      { id: B, username: 'kaan', displayName: 'Kaan Demir', status: 'idle' },
      { id: A, username: 'ece', displayName: 'Ece Yılmaz', status: 'online', avatarUrl: 'http://insecure/x.png' },
      { id: 'bad id', username: 'x' },
    ],
    groups: [{ id: G, name: 'Oyun Gecesi', memberIds: [ME, A, B], memberCount: 6 }, { id: 'old', name: 'Eski', removed: true }],
    servers,
    verdicts,
    recentRows: [
      { conv: `dm:${A}`, at: day(23), media: true },
      { conv: `channel:${C3}`, at: day(24) , media: false },
      { conv: `channel:${C2}`, at: day(22), media: true },
    ],
    onlineIds: new Set([A]),
    now: NOW,
  });
  assert.deepEqual(t.recents, [`dm:${A}`, `channel:${C2}`], 'recents skip channels I can no longer post in');
  assert.deepEqual(t.friends.map((f) => f.name), ['Ece Yılmaz', 'Kaan Demir'], 'recent friend first');
  assert.equal(t.friends[0].avatarUrl, null, 'https avatars only');
  assert.equal(t.friends[0].lastShared.mediaCount, 1);
  assert.equal(t.friends[0].initials, 'EY');
  assert.equal(t.groups.length, 1);
  assert.equal(t.groups[0].memberCount, 6);
  assert.equal(t.groups[0].onlineCount, 1);
  assert.equal(t.servers.length, 1, 'a server without text channels is not listed');
  const ch = t.servers[0].channels;
  assert.deepEqual(ch.map((c) => c.name), ['genel', 'fotoğraflar', 'duyurular'], 'text + announcement, by position');
  assert.equal(t.servers[0].sendableCount, 2);
  assert.equal(ch[1].slowModeSec, 30);
  assert.equal(ch[2].reason, 'announcement');
  assert.equal(ch[0].conv, `channel:${C1}`);
  assert.ok(t.limits.mimes.includes('image/jpeg') && !t.limits.mimes.includes('image/heic'), 'HEIC is converted on the phone');
  assert.equal(t.limits.maxItems, 10);
}

// ---- links, duplicates, slow mode plan, reasons ------------------------------------------
{
  assert.equal(share.normalizeLink('https://www.RotaRehberi.com.tr/balon/?utm_source=x&b=2&a=1#top'), 'rotarehberi.com.tr/balon?a=1&b=2');
  assert.equal(share.normalizeLink('http://rotarehberi.com.tr/balon'), 'rotarehberi.com.tr/balon');
  assert.equal(share.normalizeLink('javascript:alert(1)'), null);
  assert.equal(share.normalizeLink('not a url'), null);
  assert.deepEqual(share.linksIn('bak: https://a.com/x), ve https://www.a.com/x?fbclid=1 bir de https://b.com'), ['a.com/x', 'b.com']);

  const link = share.normalizeLink('https://rotarehberi.com.tr/balon');
  const rows = [
    { content: 'eski https://rotarehberi.com.tr/balon', at: new Date(NOW - 8 * 86400000).toISOString() },
    { content: 'dün https://www.rotarehberi.com.tr/balon/', at: new Date(NOW - 86400000).toISOString() },
    { content: '', originalName: 'Proje.pdf', size: 2400, at: new Date(NOW - 3600000).toISOString() },
  ];
  const d1 = share.findDuplicate({ links: [link], rows: rows.slice(0, 2), now: NOW });
  assert.equal(d1.kind, 'link');
  assert.equal(d1.at, new Date(NOW - 86400000).toISOString(), 'within the 7-day window only');
  const d2 = share.findDuplicate({ links: [link], files: [{ name: 'proje.PDF', size: 2400 }], rows, now: NOW });
  assert.equal(d2.kind, 'file', 'the newest match wins');
  assert.equal(share.findDuplicate({ files: [{ name: 'Proje.pdf', size: 99 }], rows, now: NOW }), null, 'same name, other size: not a duplicate');
  assert.equal(share.findDuplicate({ links: [], files: [], rows, now: NOW }), null);

  const plan = share.slowmodePlan({ count: 3, slowModeSec: 30, retryAfterSec: 12, now: NOW });
  assert.equal(plan.length, 3);
  assert.ok(plan[0] - NOW >= 35000, 'never sooner than the scheduler lead');
  assert.equal(plan[1] - plan[0], 32000, 'one slow-mode period apart, plus margin');
  assert.equal(share.slowmodePlan({ count: 1, slowModeSec: 120, retryAfterSec: 100, now: NOW })[0] - NOW, 102000);

  assert.equal(share.reasonOf('MISSING_PERMISSION'), 'no_permission');
  assert.equal(share.reasonOf('ANNOUNCEMENT_READ_ONLY'), 'announcement');
  assert.equal(share.reasonOf('SLOWMODE'), 'slowmode');
  assert.equal(share.reasonOf('not_friends'), 'not_friends');
  assert.equal(share.reasonOf('weird'), 'failed');
  assert.deepEqual(share.parseConv(`channel:${C1}`), { type: 'channel', id: C1, conv: `channel:${C1}` });
  assert.equal(share.parseConv('dm:../x'), null);

  assert.throws(() => readItems([{ url: '' }]), ShareError);
  assert.throws(() => readItems(new Array(11).fill({ url: 'x' })), /too_many_items/);
  assert.throws(() => readItems([{ url: 'x', size: 200 * 1024 * 1024 }]), /too_large/);
  assert.equal(readItems([{ url: 'u', mediaType: 'audio' }])[0].mediaType, 'document', 'audio files go as documents');
}

// ---- service: send / slow mode / idempotency / undo / precheck --------------------------
(async () => {
  const sent = [];
  const scheduled = [];
  let slowAfter = Infinity;
  let rateLimitedOnce = true;
  const actions = {
    async reply(_io, userId, { conv, text, media, silent, markRead }) {
      assert.equal(userId, ME);
      assert.equal(markRead, false, 'a share does not mark the chat read');
      if (conv === `dm:${B}`) { const e = new Error('nf'); e.code = 'not_friends'; throw e; }
      if (conv === `dm:${A}` && rateLimitedOnce) { rateLimitedOnce = false; const e = new Error('rl'); e.code = 'rate_limited'; throw e; }
      if (conv === `channel:${C2}` && sent.filter((s) => s.conv === conv).length >= slowAfter) { const e = new Error('slow'); e.code = 'slowmode'; throw e; }
      const id = `m${sent.length + 1}`;
      sent.push({ conv, text, media, silent, id });
      return { messageId: id };
    },
  };
  const db = createFakeSupabase({
    server_channels: [{ id: C2, server_id: S1, type: 'text', slowmode_seconds: 30, parent_id: null }],
    server_members: [{ server_id: S1, user_id: ME, timeout_until: null }],
    group_members: [{ group_id: G, user_id: ME }],
    dm_messages: [
      { id: 'd1', from_user_id: ME, to_user_id: A, content: 'dün https://rotarehberi.com.tr/balon', media_url: null, created_at: new Date(NOW - 86400000).toISOString() },
      { id: 'old', from_user_id: ME, to_user_id: A, content: 'x', media_url: null, created_at: new Date(NOW - 3600000).toISOString() },
    ],
    media_uploads: [],
  });
  const waits = [];
  const svc = createShareService({
    getDb: () => db,
    now: () => NOW,
    sleep: async (ms) => { waits.push(ms); },
    actions,
    scheduled: {
      async create(userId, body) {
        scheduled.push(body);
        return { id: `s${scheduled.length}` };
      },
      async cancel(_u, id) { if (id === 'gone') { const e = new Error('nf'); e.code = 'not_found'; throw e; } return { id, status: 'cancelled' }; },
    },
    state: { systemConfig: { dmRateLimitMs: 200 }, dmBlockPairs: new Set(), presence: new Map(), dmUnreadByUser: new Map([[A, new Map([[ME, 3]])]]), dmHistory: new Map() },
    dmMessages: { convKey: (a, b) => [a, b].sort().join(':'), isAcceptedFriend: async (_m, p) => p === A, listAcceptedFriendIds: async () => [A] },
    blocking: { isBlockedEitherWay: async () => false },
    moderation: { getActiveTimeout: () => null },
    resolveUserChannelsBits: async (_s, _u, chans) => ({ isMember: true, isOwner: false, bits: new Map(chans.map((c) => [c.id, MEMBER])), sendAllowed: new Map() }),
    cluster: { invalidate() {} },
    log: { warn() {}, error() {} },
  });
  const items = [
    { url: 'https://api/f/1', mediaType: 'image', mimeType: 'image/jpeg', size: 1000, originalName: 'a.jpg' },
    { url: 'https://api/f/2', mediaType: 'image', mimeType: 'image/jpeg', size: 2000, originalName: 'b.jpg' },
    { url: 'https://api/f/3', mediaType: 'video', mimeType: 'video/mp4', size: 3000, originalName: 'c.mp4' },
  ];

  // DM: caption on the first item, a rate limit is waited out, silent passes through.
  const r1 = await svc.send(null, ME, { clientId: 'client-0001', conv: `dm:${A}`, text: '  Kapadokya  ', items, silent: true });
  assert.equal(r1.ok, true);
  assert.equal(r1.sent, 3);
  assert.deepEqual(sent.map((s) => s.text), ['Kapadokya', '', '']);
  assert.ok(sent.every((s) => s.silent === true));
  assert.equal(waits.length, 1, 'one rate-limit wait');
  // Same clientId again (offline queue retry): the first answer, nothing sent twice.
  const again = await svc.send(null, ME, { clientId: 'client-0001', conv: `dm:${A}`, text: 'Kapadokya', items });
  assert.equal(again.replay, true);
  assert.equal(sent.length, 3);

  // Refused conversation: every unit fails with the same reason, nothing remembered.
  const r2 = await svc.send(null, ME, { clientId: 'client-0002', conv: `dm:${B}`, items });
  assert.equal(r2.ok, false);
  assert.deepEqual(r2.results.map((x) => x.reason), ['not_friends', 'not_friends', 'not_friends']);

  // Slow mode: first goes now, the rest are scheduled on the slow-mode clock.
  slowAfter = 1;
  const r3 = await svc.send(null, ME, { clientId: 'client-0003', conv: `channel:${C2}`, text: 'bak', items });
  assert.deepEqual(r3.results.map((x) => x.status), ['sent', 'scheduled', 'scheduled']);
  assert.equal(r3.ok, true);
  assert.equal(scheduled.length, 2);
  assert.ok(Date.parse(scheduled[1].sendAt) - Date.parse(scheduled[0].sendAt) === 32000);
  assert.equal(scheduled[0].convType, 'channel');
  assert.equal(scheduled[0].attachment, 'https://api/f/2');

  // Scheduled share (Zamanla): one row per item, caption on the first, silent kept.
  const at = new Date(NOW + 3600000).toISOString();
  const r4 = await svc.send(null, ME, { clientId: 'client-0004', conv: `group:${G}`, text: 'akşam', items: items.slice(0, 2), sendAt: at, silent: true });
  assert.deepEqual(r4.results.map((x) => x.status), ['scheduled', 'scheduled']);
  assert.equal(scheduled[2].content, 'akşam');
  assert.equal(scheduled[3].content, '');
  assert.equal(scheduled[2].silent, true);
  // Text only.
  const r5 = await svc.send(null, ME, { clientId: 'client-0005', conv: `group:${G}`, text: 'https://rotarehberi.com.tr/balon' });
  assert.deepEqual(r5.results.map((x) => x.index), [-1]);

  await assert.rejects(svc.send(null, ME, { clientId: 'short', conv: `group:${G}`, text: 'x' }), /bad_client_id/);
  await assert.rejects(svc.send(null, ME, { clientId: 'client-0006', conv: 'nope', text: 'x' }), /bad_conversation/);
  await assert.rejects(svc.send(null, ME, { clientId: 'client-0007', conv: `group:${G}` }), /empty/);
  await assert.rejects(svc.send(null, ME, { clientId: 'client-0008', conv: `group:${G}`, text: 'x'.repeat(2001) }), /too_long/);
  await assert.rejects(svc.send(null, ME, { clientId: 'client-0009', conv: `group:${G}`, text: 'x', sendAt: 'yarın' }), /bad_time/);

  // Precheck: permission per conversation and the duplicate-link warning.
  const pre = await svc.precheck(ME, { convs: [`dm:${A}`, `dm:${B}`, `group:${G}`, `group:${A}`, `channel:${C2}`, 'junk'], links: ['https://www.rotarehberi.com.tr/balon?utm_source=ig'] });
  assert.equal(pre.results[`dm:${A}`].canSend, true);
  assert.equal(pre.results[`dm:${A}`].duplicate.kind, 'link', 'sent to Ece yesterday');
  assert.equal(pre.results[`dm:${B}`].reason, 'not_friends');
  assert.equal(pre.results[`group:${G}`].canSend, true);
  assert.equal(pre.results[`group:${G}`].duplicate, null);
  assert.equal(pre.results[`group:${A}`].reason, 'no_permission', 'not a member');
  assert.equal(pre.results[`channel:${C2}`].slowModeSec, 30);
  assert.equal(pre.results.junk, undefined);
  await assert.rejects(svc.precheck(ME, { convs: [] }), /bad_conversation/);

  // Undo: only my own messages, only inside the window; scheduled rows are cancelled.
  db._tables.dm_messages.rows.push({ id: 'n1', from_user_id: ME, to_user_id: A, content: 'yeni', created_at: new Date(NOW - 5000).toISOString() });
  db._tables.dm_messages.rows.push({ id: 'n2', from_user_id: A, to_user_id: ME, content: 'onun', created_at: new Date(NOW - 5000).toISOString() });
  const emitted = [];
  const io = { to: (room) => ({ emit: (ev, p) => emitted.push({ room, ev, p }) }) };
  const u = await svc.undo(io, ME, { conv: `dm:${A}`, messageIds: ['n1', 'n2', 'old'], scheduledIds: ['s1', 'gone'] });
  assert.equal(u.removed, 2, 'n1 + one scheduled row');
  assert.equal(u.failed, 3, "someone else's message, a too-old one and a missing schedule");
  assert.ok(db._tables.dm_messages.rows.some((r) => r.id === 'n2') && db._tables.dm_messages.rows.some((r) => r.id === 'old'));
  assert.ok(emitted.some((e) => e.room === `user:${A}` && e.ev === 'dm:message:deleted'));
  assert.ok(emitted.some((e) => e.room === `user:${A}` && e.ev === 'dm:unread:sync' && e.p.count === 2), "the peer's unread badge goes down");

  // ---- router ----------------------------------------------------------------------------
  const calls = [];
  const fake = {
    targets: async (uid) => ({ recents: [], friends: [], uid }),
    precheck: async (uid, body) => ({ results: {}, uid, body }),
    send: async (_io, uid, body) => { calls.push(body); if (body.conv === 'x') throw new ShareError(400, 'bad_conversation'); if (body.conv === 'boom') throw new Error('secret detail'); return { ok: true }; },
    undo: async () => ({ ok: true, removed: 1, failed: 0 }),
  };
  const router = createShareRouter({ service: fake, bannedUserIds: new Set(['banned']), io: {} });
  const middlewares = router.stack.filter((l) => !l.route).map((l) => l.handle);
  // [0] express.json, [1] requireAuth, [2] ban gate
  const gate = middlewares.slice(2);
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
    const chain = [...gate, route(method, p)];
    let i = 0;
    const next = () => { const h = chain[i++]; if (h) Promise.resolve(h(req, res, next)).catch((e) => resolve({ status: 500, body: String(e) })); };
    next();
  });
  const tg = await call('get', '/targets', { user: { id: ME }, query: {} });
  assert.equal(tg.status, 200);
  assert.equal(tg.headers['Cache-Control'], 'no-store');
  assert.equal(tg.body.uid, ME);
  const bad = await call('post', '/send', { user: { id: ME }, body: { conv: 'x' } });
  assert.deepEqual([bad.status, bad.body], [400, { ok: false, error: 'bad_conversation' }]);
  const origError = console.error;
  console.error = () => {};
  const boom = await call('post', '/send', { user: { id: ME }, body: { conv: 'boom' } });
  console.error = origError;
  assert.deepEqual([boom.status, boom.body], [500, { ok: false, error: 'failed' }], 'no internal message leaks');
  const ub = await call('post', '/undo', { user: { id: ME }, body: {} });
  assert.equal(ub.body.removed, 1);
  const banned = await call('get', '/targets', { user: { id: 'banned' }, query: {} });
  assert.equal(banned.status, 403);

  console.log('share selftest: ok');
})().catch((e) => { console.error(e); process.exit(1); });
