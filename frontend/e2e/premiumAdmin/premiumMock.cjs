'use strict';

/**
 * Dev / e2e only: an in-memory stand-in for /api/admin/premium (the shapes in
 * docs/premium/CONTRACT.md) so the Premium Yönetimi pages can be driven and
 * screenshotted before the real backend lands. Synthetic members only, no
 * real data; never imported by the app (premiumNav.selftest checks that).
 *
 *   const mock = createPremiumMock({ now });
 *   mock.handle(method, pathAfterPremium, query, body, headers) -> { status, body }
 */

const DAY = 864e5;
const COINS = { plus: 5000, ultra: 15000 };
const NAMES = ['Ayşe Yılmaz', 'Mert Kaya', 'Zeynep Demir', 'Can Öztürk', 'Elif Şahin', 'Burak Aydın', 'Deniz Arslan', 'Ece Koç',
  'Emre Çelik', 'Selin Polat', 'Kaan Erdem', 'İrem Güneş', 'Onur Aksoy', 'Defne Kurt', 'Arda Yıldız', 'Naz Tekin', 'Lena Wagner',
  'Lucas Martin', 'Sofia Rossi', 'Mateo García', 'Yusuf Bulut', 'Melis Avcı', 'Bora Şen', 'Cansu Uçar', 'Tolga Işık', 'Derya Kılıç',
  'Oğuz Tan', 'Pelin Ateş', 'Serkan Uysal', 'Gizem Er', 'Hakan Toprak', 'Aslı Duman', 'Barış Önal', 'Ceren Yalçın', 'Efe Durmaz', 'Duru Sezer'];
const fold = (s) => String(s || '').toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i');
const uid = (n) => `00000000-0000-4000-9000-${String(n).padStart(12, '0')}`;

function createPremiumMock({ now = Date.now(), seed = 7 } = {}) {
  let rnd = seed;
  const rand = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);
  const iso = (ms) => new Date(ms).toISOString();
  let idSeq = 1000;
  const nextId = (p) => `${p}-${(++idSeq).toString(16)}-${Math.floor(rand() * 1e8).toString(16)}`;

  const users = NAMES.map((name, i) => {
    const username = fold(name).replace(/[^a-z]+/g, '.').replace(/\.$/, '');
    return { id: uid(200 + i), username, display_name: name, avatar_url: null, email_masked: `${username.slice(0, 2)}***@${i % 3 ? 'gmail.com' : 'outlook.com'}`, created_at: iso(now - (300 - i * 5) * DAY) };
  });
  const admin = { id: uid(1), username: 'demir' };
  const admin2 = { id: uid(2), username: 'admin' };
  const subs = new Map();
  const events = [];
  const audit = [];
  const batches = new Map();
  const seen = new Map();

  const plans = [
    { id: 'plus', name: 'Descall+', description: 'Masaüstü kontrolleri, odak modu ve ses araçları.', features: ['mini_mode', 'always_on_top', 'pip_call', 'focus_mode', 'mic_presets', 'noise_gate', 'notification_history', 'quick_actions'], status: 'active', visible: true, monthly_descoin: 5000, price_minor: null, currency: null, sort: 1 },
    { id: 'ultra', name: 'Descall Ultra', description: 'Descall+ ve masaüstü kenar çubuğu, HUD, düzenler ve otomasyonlar.', features: ['desktop_sidebar', 'window_layouts', 'voice_hud', 'gaming_hud', 'workspace_profiles', 'activity_timeline', 'command_center', 'widgets'], status: 'active', visible: true, monthly_descoin: 15000, price_minor: null, currency: null, sort: 2 },
  ];

  const campaigns = [
    { id: 'camp-1', code: 'LANSMAN2026', kind: 'free_membership', plan_id: 'plus', duration_days: 30, value: null, starts_at: iso(now - 40 * DAY), ends_at: iso(now + 20 * DAY), total_limit: 200, per_user_limit: 1, allowed_user_ids: [], active: true, redeemed_count: 0, created_at: iso(now - 41 * DAY) },
    { id: 'camp-2', code: 'ULTRATEST', kind: 'free_membership', plan_id: 'ultra', duration_days: 7, value: null, starts_at: iso(now - 15 * DAY), ends_at: null, total_limit: 20, per_user_limit: 1, allowed_user_ids: [users[3].id, users[7].id], allowed_users: [users[3], users[7]], active: true, redeemed_count: 0, created_at: iso(now - 15 * DAY) },
    { id: 'camp-3', code: 'YUZDE20', kind: 'percent', plan_id: null, duration_days: null, value: 20, starts_at: null, ends_at: iso(now + 60 * DAY), total_limit: null, per_user_limit: 1, allowed_user_ids: [], active: false, redeemed_count: 0, created_at: iso(now - 5 * DAY) },
  ];

  function pushEvent(ev) {
    const row = {
      id: nextId('ev'), user_id: ev.user_id, kind: ev.kind, prev_plan: ev.prev_plan ?? null, new_plan: ev.new_plan ?? null,
      prev_ends_at: ev.prev_ends_at ?? null, new_ends_at: ev.new_ends_at ?? null, prev_unlimited: Boolean(ev.prev_unlimited), new_unlimited: Boolean(ev.new_unlimited),
      actor_id: ev.actor_id ?? null, actor_kind: ev.actor_kind || 'admin', actor_username: ev.actor_username ?? null, reason: ev.reason || '', note: ev.note || '',
      is_free: ev.is_free !== false, batch_id: ev.batch_id ?? null, request_id: ev.request_id ?? null, created_at: ev.created_at,
    };
    events.push(row);
    return row;
  }

  /** Apply one op to one member, like premium_admin_apply (one event per member). */
  function apply(userId, b, at, actor = admin, extra = {}) {
    const u = users.find((x) => x.id === userId);
    if (!u) return { ok: false, error: 'not_found' };
    if (b.request_id) {
      const key = `${b.request_id}|${userId}`;
      if (seen.has(key)) return { ok: true, sub: subs.get(userId), event: seen.get(key), replay: true };
    }
    const cur = subs.get(userId) || null;
    const active = cur && cur.status === 'active' && (cur.unlimited || Date.parse(cur.ends_at) > at);
    const prev = { prev_plan: cur?.plan_id ?? null, prev_ends_at: cur?.ends_at ?? null, prev_unlimited: cur?.unlimited ?? false };
    let next = cur ? { ...cur } : null;
    switch (b.op) {
      case 'grant': {
        if (active) return { ok: false, error: 'already_active' };
        const start = b.starts_at ? Date.parse(b.starts_at) : at;
        const ends = b.unlimited ? null : b.ends_at || iso(start + b.days * DAY);
        next = { user_id: userId, plan_id: b.plan, status: 'active', started_at: iso(start), ends_at: ends, unlimited: Boolean(b.unlimited), is_free: b.is_free !== false, source: extra.source || 'admin', next_coin_at: iso(start + 30 * DAY), updated_at: iso(at) };
        break;
      }
      case 'extend':
        if (!cur) return { ok: false, error: 'no_subscription' };
        if (cur.unlimited) return { ok: false, error: 'unlimited' };
        next.ends_at = b.ends_at || iso(Math.max(at, Date.parse(cur.ends_at)) + b.days * DAY);
        next.status = 'active';
        break;
      case 'change_plan':
        if (!active) return { ok: false, error: 'no_subscription' };
        next.plan_id = b.plan;
        break;
      case 'cancel':
        if (!active) return { ok: false, error: 'no_subscription' };
        next.status = 'cancelled';
        next.ends_at = iso(at);
        next.unlimited = false;
        break;
      case 'set_end':
        if (!cur) return { ok: false, error: 'no_subscription' };
        next.ends_at = b.ends_at;
        next.unlimited = false;
        next.status = 'active';
        break;
      case 'set_unlimited':
        if (!cur) return { ok: false, error: 'no_subscription' };
        next.unlimited = true;
        next.ends_at = null;
        next.status = 'active';
        break;
      default:
        return { ok: false, error: 'op' };
    }
    next.updated_at = iso(at);
    subs.set(userId, next);
    const ev = pushEvent({
      user_id: userId, kind: extra.kind || b.op, ...prev, new_plan: next.plan_id, new_ends_at: next.ends_at, new_unlimited: next.unlimited,
      actor_id: actor?.id ?? null, actor_username: actor?.username ?? null, actor_kind: extra.actor_kind || 'admin', reason: b.reason, note: b.note,
      is_free: b.is_free !== false, batch_id: b.batch_id ?? null, request_id: b.request_id ?? null, created_at: iso(at),
    });
    if (b.request_id) seen.set(`${b.request_id}|${userId}`, ev);
    if (actor && extra.actor_kind !== 'campaign') {
      audit.push({ id: nextId('au'), at: iso(at), actor_id: actor.id, actor_username: actor.username, action: `premium.apply.${b.op}`, target: userId, target_username: u.username, meta: { plan: next.plan_id, reason: b.reason, request_id: b.request_id || null, batch_id: b.batch_id || null } });
    }
    if (b.op === 'grant') {
      pushEvent({ user_id: userId, kind: 'coin_grant', prev_plan: next.plan_id, new_plan: next.plan_id, new_ends_at: next.ends_at, new_unlimited: next.unlimited, actor_kind: 'system', reason: `${COINS[next.plan_id]} DesCoin`, is_free: next.is_free, created_at: iso(at + 1000) });
    }
    return { ok: true, sub: next, event: ev };
  }

  // ---- history: synthetic grants over the last ~5 months
  const reasons = ['Beta testi', 'Topluluk etkinliği ödülü', 'Hata bildirimi teşekkürü', 'İçerik üreticisi', 'Ekip testi', 'Destek talebi telafisi'];
  for (let i = 0; i < 30; i++) {
    const u = users[i];
    const at = now - Math.floor(150 * rand() * rand() * DAY) - 3600e3;
    const plan = rand() < 0.62 ? 'plus' : 'ultra';
    const unlimited = i === 4 || i === 11;
    const days = [7, 30, 30, 90, 180, 365][Math.floor(rand() * 6)];
    const actor = rand() < 0.7 ? admin : admin2;
    const viaCampaign = i % 9 === 5;
    if (viaCampaign) {
      const c = campaigns[plan === 'plus' ? 0 : 1];
      apply(u.id, { op: 'grant', plan: c.plan_id, days: c.duration_days, is_free: true, reason: `Kupon ${c.code}` }, Math.max(at, Date.parse(c.starts_at) + DAY), null, { kind: 'campaign_redeem', actor_kind: 'campaign', source: 'campaign' });
      c.redeemed_count += 1;
      continue;
    }
    apply(u.id, { op: 'grant', plan, days: unlimited ? undefined : days, unlimited, is_free: true, reason: reasons[i % reasons.length], note: i % 4 === 0 ? 'Ekip içi deneme hesabı' : '' }, at, actor);
    const r = rand();
    const later = at + Math.floor((now - at) * 0.6);
    if (r < 0.18) apply(u.id, { op: 'extend', days: 30, is_free: true, reason: 'Süre uzatma talebi' }, later, actor);
    else if (r < 0.3 && !unlimited) apply(u.id, { op: 'change_plan', plan: plan === 'plus' ? 'ultra' : 'plus', is_free: true, reason: 'Plan yükseltme testi' }, later, actor);
    else if (r < 0.38) apply(u.id, { op: 'cancel', is_free: true, reason: 'Kullanıcı isteği' }, later, actor);
  }
  // expire the ones past their end (like premium_expire_due)
  for (const [id, s] of subs) {
    if (s.status === 'active' && !s.unlimited && Date.parse(s.ends_at) <= now) {
      subs.set(id, { ...s, status: 'expired' });
      pushEvent({ user_id: id, kind: 'expire', prev_plan: s.plan_id, new_plan: s.plan_id, prev_ends_at: s.ends_at, new_ends_at: s.ends_at, actor_kind: 'system', reason: '', is_free: s.is_free, created_at: s.ends_at });
    }
  }
  audit.push({ id: nextId('au'), at: iso(now - 2 * DAY), actor_id: uid(9), actor_username: 'misafir.yonetici', action: 'premium.denied', target: '/premium/users/x/apply', meta: { reason: 'ADMIN_PERMISSION_DENIED' } });
  audit.push({ id: nextId('au'), at: iso(now - 3 * DAY), actor_id: admin.id, actor_username: admin.username, action: 'premium.campaign_create', target: 'camp-3', meta: { code: 'YUZDE20', reason: 'Gelecek kampanya taslağı' } });

  const userOut = (u) => ({ ...u, subscription: subs.get(u.id) || null });
  const actorName = (ev) => ev.actor_username;
  const sortDesc = (list, key) => [...list].sort((a, b) => String(b[key]).localeCompare(String(a[key])));

  function page(list, cursor, size = 25) {
    const start = Number(cursor) || 0;
    const items = list.slice(start, start + size);
    return { items, next_cursor: start + size < list.length ? String(start + size) : null };
  }

  function stateAt(s, at) {
    return s && s.status !== 'cancelled' && Date.parse(s.started_at) <= at && (s.unlimited || Date.parse(s.ends_at) > at);
  }

  function dashboard() {
    const all = [...subs.values()];
    const act = all.filter((s) => stateAt(s, now) && s.status === 'active');
    const grants = events.filter((e) => e.kind === 'grant' || e.kind === 'campaign_redeem');
    return {
      active_total: act.length,
      active_plus: act.filter((s) => s.plan_id === 'plus').length,
      active_ultra: act.filter((s) => s.plan_id === 'ultra').length,
      expired: all.filter((s) => s.status === 'expired').length,
      expiring_7d: act.filter((s) => !s.unlimited && Date.parse(s.ends_at) - now <= 7 * DAY).length,
      new_7d: grants.filter((e) => now - Date.parse(e.created_at) <= 7 * DAY).length,
      new_30d: grants.filter((e) => now - Date.parse(e.created_at) <= 30 * DAY).length,
      free_count: act.filter((s) => s.is_free).length,
      paid_count: null,
      payments_integrated: false,
    };
  }

  function bucketKey(ms, bucket) {
    const d = new Date(ms);
    if (bucket === 'month') return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
    if (bucket === 'week') {
      const wd = (d.getUTCDay() + 6) % 7;
      return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - wd)).toISOString().slice(0, 10);
    }
    return d.toISOString().slice(0, 10);
  }

  function analytics(q) {
    const from = Date.parse(q.from) || now - 30 * DAY;
    const to = Date.parse(q.to) || now;
    const bucket = ['day', 'week', 'month'].includes(q.bucket) ? q.bucket : 'day';
    const keys = [];
    for (let t = from; t <= to; t += DAY) { const k = bucketKey(t, bucket); if (!keys.includes(k)) keys.push(k); }
    const inRange = events.filter((e) => { const t = Date.parse(e.created_at); return t >= from && t <= to; });
    const acq = keys.map((k) => ({ bucket: k, plus: 0, ultra: 0 }));
    const cr = keys.map((k) => ({ bucket: k, cancellations: 0, renewals: 0 }));
    let up = 0;
    let down = 0;
    const camp = new Map();
    for (const e of inRange) {
      const k = bucketKey(Date.parse(e.created_at), bucket);
      const i = keys.indexOf(k);
      if (i < 0) continue;
      if (e.kind === 'grant' || e.kind === 'campaign_redeem') acq[i][e.new_plan] += 1;
      if (e.kind === 'cancel') cr[i].cancellations += 1;
      if (e.kind === 'extend') cr[i].renewals += 1;
      if (e.kind === 'change_plan') { if (e.new_plan === 'ultra') up += 1; else down += 1; }
      if (e.kind === 'campaign_redeem') {
        const code = /Kupon (\S+)/.exec(e.reason)?.[1] || 'kupon';
        const c = camp.get(code) || { code, redemptions: 0, users: new Set() };
        c.redemptions += 1;
        c.users.add(e.user_id);
        camp.set(code, c);
      }
    }
    const active = keys.map((k) => {
      const end = Math.min(to, Date.parse(k) + (bucket === 'month' ? 30 : bucket === 'week' ? 7 : 1) * DAY - 1);
      const row = { bucket: k, plus: 0, ultra: 0 };
      for (const e of events) {
        if (e.kind !== 'grant' && e.kind !== 'campaign_redeem') continue;
        const s = subs.get(e.user_id);
        if (s && stateAt({ ...s, status: 'active', ends_at: s.status === 'cancelled' ? s.ends_at : s.ends_at }, end)) row[s.plan_id] += 1;
      }
      return row;
    });
    const ended = [...subs.values()].filter((s) => !s.unlimited && Date.parse(s.ends_at) >= from && Date.parse(s.ends_at) <= Math.min(to, now));
    const avg = (list) => (list.length ? list.reduce((n, s) => n + (Date.parse(s.ends_at) - Date.parse(s.started_at)) / DAY, 0) / list.length : null);
    const act = [...subs.values()].filter((s) => s.status === 'active' && stateAt(s, Math.min(to, now)));
    const started = inRange.filter((e) => e.kind === 'grant' || e.kind === 'campaign_redeem');
    return {
      from: new Date(from).toISOString(), to: new Date(to).toISOString(), bucket,
      acquisitions: started.length ? acq : [],
      active,
      plan_split: act.length ? { plus: act.filter((s) => s.plan_id === 'plus').length, ultra: act.filter((s) => s.plan_id === 'ultra').length } : null,
      cancellations_renewals: cr.some((r) => r.cancellations || r.renewals) ? cr : null,
      free_paid: started.length ? { free: started.filter((e) => e.is_free).length, paid: null } : null,
      upgrades_downgrades: up || down ? { upgrades: up, downgrades: down } : null,
      avg_duration_days: ended.length ? { all: avg(ended), plus: avg(ended.filter((s) => s.plan_id === 'plus')), ultra: avg(ended.filter((s) => s.plan_id === 'ultra')) } : null,
      conversion: null,
      campaigns: camp.size ? [...camp.values()].map((c) => ({ id: c.code, code: c.code, redemptions: c.redemptions, unique_users: c.users.size, still_active: [...c.users].filter((id) => subs.get(id)?.status === 'active').length })) : null,
    };
  }

  function handle(method, path, query = {}, body = {}, headers = {}) {
    const isWrite = method !== 'GET';
    const ok = (b) => ({ status: 200, body: b });
    if (isWrite && !headers['x-admin-step-up']) {
      audit.push({ id: nextId('au'), at: iso(Date.now()), actor_id: admin.id, actor_username: admin.username, action: 'premium.step_up_required', target: path, meta: {} });
      return { status: 403, body: { error: 'Step-up required', code: 'STEP_UP_REQUIRED' } };
    }
    let m;
    if (path === '/dashboard' && method === 'GET') return ok(dashboard());
    if (path === '/plans' && method === 'GET') return ok({ plans });
    if ((m = path.match(/^\/plans\/([^/]+)$/)) && method === 'PATCH') {
      const p = plans.find((x) => x.id === m[1]);
      if (!p) return { status: 404, body: { error: 'not_found' } };
      for (const k of ['name', 'description', 'features', 'visible', 'status']) if (body[k] !== undefined) p[k] = body[k];
      audit.push({ id: nextId('au'), at: iso(Date.now()), actor_id: admin.id, actor_username: admin.username, action: 'premium.plan_update', target: p.id, meta: { fields: Object.keys(body).join(',') } });
      return ok({ plan: p });
    }
    if (path === '/users/search' && method === 'GET') {
      const q = fold(query.q).trim();
      const hits = q ? users.filter((u) => [u.username, u.display_name, u.id, u.email_masked].some((x) => fold(x).includes(q))) : [];
      return ok({ users: hits.slice(0, 20).map(userOut) });
    }
    if ((m = path.match(/^\/users\/([^/]+)$/)) && method === 'GET') {
      const u = users.find((x) => x.id === m[1]);
      if (!u) return { status: 404, body: { error: 'not_found' } };
      return ok({ user: u, subscription: subs.get(u.id) || null, events: sortDesc(events.filter((e) => e.user_id === u.id), 'created_at') });
    }
    if ((m = path.match(/^\/users\/([^/]+)\/apply$/)) && method === 'POST') {
      if (!body.reason || String(body.reason).trim().length < 3) return { status: 400, body: { error: 'reason' } };
      const r = apply(m[1], body, Date.now());
      if (!r.ok) return { status: 409, body: { error: r.error } };
      return ok({ subscription: r.sub, event: r.event });
    }
    if (path === '/bulk' && method === 'POST') {
      const batchId = nextId('batch').replace(/^batch-/, '7d1f0c2e-');
      const at = Date.now();
      const results = (body.user_ids || []).map((id) => {
        const r = apply(id, { ...body, batch_id: batchId }, at);
        return { user_id: id, ok: r.ok, error: r.ok ? null : r.error };
      });
      const batch = { id: batchId, total: results.length, ok: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, created_at: iso(at) };
      batches.set(batchId, { batch, results });
      audit.push({ id: nextId('au'), at: iso(at), actor_id: admin.id, actor_username: admin.username, action: 'premium.bulk', target: batchId, meta: { op: body.op, plan: body.plan, total: batch.total, failed: batch.failed, reason: body.reason } });
      return ok({ batch, results });
    }
    if ((m = path.match(/^\/bulk\/([^/]+)$/)) && method === 'GET') return batches.has(m[1]) ? ok(batches.get(m[1])) : { status: 404, body: { error: 'not_found' } };
    if (path === '/events' && method === 'GET') {
      let list = sortDesc(events, 'created_at');
      const uq = fold(query.user);
      if (uq) list = list.filter((e) => { const u = users.find((x) => x.id === e.user_id); return e.user_id === query.user || fold(u?.username).includes(uq) || fold(u?.display_name).includes(uq); });
      if (query.kind) list = list.filter((e) => e.kind === query.kind);
      if (query.plan) list = list.filter((e) => e.new_plan === query.plan || e.prev_plan === query.plan);
      if (query.actor) list = list.filter((e) => fold(actorName(e)).includes(fold(query.actor)) || e.actor_id === query.actor);
      if (query.from) list = list.filter((e) => e.created_at >= query.from);
      if (query.to) list = list.filter((e) => e.created_at <= query.to);
      const p = page(list, query.cursor);
      return ok({ events: p.items.map((e) => ({ ...e, user: users.find((x) => x.id === e.user_id) || null })), next_cursor: p.next_cursor });
    }
    if (path === '/analytics' && method === 'GET') return ok(analytics(query));
    if (path === '/finance' && method === 'GET') {
      const all = [...subs.values()];
      return ok({
        payments_integrated: false, revenue: null, currency: null,
        free_count: all.filter((s) => s.status === 'active' && s.is_free).length,
        manual_grants: events.filter((e) => e.kind === 'grant' && e.actor_kind === 'admin').length,
        campaign_grants: events.filter((e) => e.kind === 'campaign_redeem').length,
      });
    }
    if (path === '/audit' && method === 'GET') {
      let list = sortDesc(audit, 'at');
      if (query.q) list = list.filter((a) => fold(JSON.stringify(a)).includes(fold(query.q)));
      if (query.actor) list = list.filter((a) => fold(a.actor_username).includes(fold(query.actor)));
      if (query.from) list = list.filter((a) => a.at >= query.from);
      if (query.to) list = list.filter((a) => a.at <= query.to);
      const p = page(list, query.cursor);
      return ok({ items: p.items, next_cursor: p.next_cursor });
    }
    if (path === '/campaigns' && method === 'GET') return ok({ campaigns: sortDesc(campaigns, 'created_at') });
    if (path === '/campaigns' && method === 'POST') {
      if (campaigns.some((c) => c.code === body.code)) return { status: 409, body: { error: 'code_taken' } };
      const c = { ...body, id: nextId('camp'), redeemed_count: 0, created_at: iso(Date.now()) };
      campaigns.push(c);
      audit.push({ id: nextId('au'), at: iso(Date.now()), actor_id: admin.id, actor_username: admin.username, action: 'premium.campaign_create', target: c.id, meta: { code: c.code } });
      return ok({ campaign: c });
    }
    if ((m = path.match(/^\/campaigns\/([^/]+)$/)) && method === 'PATCH') {
      const c = campaigns.find((x) => x.id === m[1]);
      if (!c) return { status: 404, body: { error: 'not_found' } };
      Object.assign(c, body);
      audit.push({ id: nextId('au'), at: iso(Date.now()), actor_id: admin.id, actor_username: admin.username, action: 'premium.campaign_update', target: c.id, meta: { code: c.code, active: c.active } });
      return ok({ campaign: c });
    }
    if ((m = path.match(/^\/campaigns\/([^/]+)\/stats$/)) && method === 'GET') {
      const c = campaigns.find((x) => x.id === m[1]);
      if (!c) return { status: 404, body: { error: 'not_found' } };
      const red = events.filter((e) => e.kind === 'campaign_redeem' && e.reason.includes(c.code));
      return ok({
        redemptions: red.length, unique_users: new Set(red.map((e) => e.user_id)).size,
        still_active: red.filter((e) => subs.get(e.user_id)?.status === 'active').length,
        recent: sortDesc(red, 'created_at').map((e) => ({ id: e.id, user: users.find((x) => x.id === e.user_id), at: e.created_at })),
      });
    }
    return { status: 404, body: { error: 'Not found' } };
  }

  return { handle, users, subs, events, campaigns, plans, audit };
}

module.exports = { createPremiumMock };
