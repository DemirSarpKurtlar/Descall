'use strict';

/**
 * In-memory contract mock of /api/admin/nodes/* (backend/routes/adminNodes.js) for the
 * Sunucu Ağı evidence run (capture.cjs). Never talks to a real server: Render + the PC with
 * an hour of 10 s metrics, events like the draft, node keys, config writes, drain / resume
 * / emergency / drill. Scenarios: ready (default), single, kvDown, noPc.
 */

const STEP = 10000;

function wave(i, base, amp, period, phase = 0) {
  return base + amp * Math.sin((i / period) * Math.PI * 2 + phase);
}

function createNodesMock({ now = Date.now(), scenario = 'ready' } = {}) {
  const at = (minAgo) => new Date(now - minAgo * 60000).toISOString();
  const beat = new Date(now - 2000).toISOString();
  let cfg = {
    ramMb: 3072,
    cores: 4,
    loadRule: { enabled: true, renderHighPct: 60, pcHighPct: 85 },
    gameMode: { enabled: true, shareMb: 1024, fullHandover: false },
    schedule: { enabled: true, tz: 'Europe/Istanbul', slots: [1, 2, 3, 4, 5].map((d) => ({ d, from: '18:00', to: '02:00' })).concat([6, 0].map((d) => ({ d, from: '12:00', to: '03:00' }))) },
    alerts: { pcDown: true, kvFull: true, render90: false },
  };
  const render = { id: 'render', role: 'primary', url: 'https://des-call.onrender.com', version: '4.2.0', startedAt: at(600), memRss: 312, memLimit: 512, cpu: 22, cores: 1, conns: 58, p95ms: 48, errRate: 0.2, state: 'active', gameMode: false, lastBeat: beat };
  const pc = { id: 'pc-demir', role: 'secondary', url: 'https://pc.descall.com', version: '4.2.0', startedAt: at(70), memRss: 1454, memLimit: 3072, cpu: 9, cores: 4, conns: 126, p95ms: 31, errRate: 0, state: 'active', gameMode: false, lastBeat: beat };
  let nodes = scenario === 'single' || scenario === 'kvDown' || scenario === 'noPc' ? [{ ...render, conns: 184, memRss: 402 }] : [render, pc];
  const events = scenario === 'ready'
    ? [
        { at: at(6), kind: 'node_register', nodeId: 'pc-demir', detail: { nodeId: 'pc-demir' } },
        { at: at(102), kind: 'game_mode', nodeId: 'pc-demir', detail: { nodeId: 'pc-demir', ramMb: 1024, prevRamMb: 3072, moved: 42, dropped: 0 } },
        { at: at(157), kind: 'load_rule', nodeId: 'render', detail: { pct: 62 } },
        { at: at(190), kind: 'drill', nodeId: 'pc-demir', detail: { moved: 38, dropped: 0, ms: 3100 } },
        { at: at(260), kind: 'cfg_update', nodeId: null, detail: { ramMb: 3072, prevRamMb: 2048, cores: 4 } },
        { at: at(300), kind: 'key_create', nodeId: null, detail: { name: 'Ev bilgisayarı' } },
        { at: at(420), kind: 'node_drain', nodeId: 'pc-demir', detail: { nodeId: 'pc-demir', reason: 'Windows güncellemesi', conns: 61 } },
        { at: at(431), kind: 'node_resume', nodeId: 'pc-demir', detail: { nodeId: 'pc-demir' } },
        { at: at(610), kind: 'alert_render90', nodeId: 'render', detail: { pct: 91 } },
      ]
    : [];
  const keys = scenario === 'noPc'
    ? []
    : [
        { id: '7b0c4c0e-4c55-4c2f-9f61-2c7d0d3f0a11', name: 'Ev bilgisayarı', prefix: 'Ab3x', last4: '9QeK', masked: 'dsk_node_Ab3x…9QeK', status: 'active', createdAt: at(300), lastUsedAt: at(1), lastUsedNode: 'pc-demir', revokedAt: null, revokeReason: null },
        { id: '1d7a4a7e-8b6f-4bd5-b0d4-55f2e8b1c0a2', name: 'Eski laptop', prefix: 'Zq81', last4: 'm2Pd', masked: 'dsk_node_Zq81…m2Pd', status: 'revoked', createdAt: at(9000), lastUsedAt: at(8000), lastUsedNode: 'pc-laptop', revokedAt: at(7000), revokeReason: 'Yeni anahtara geçiyorum' },
      ];

  // One hour of 10 s samples: Render settles around 300 MB, the PC grows since it joined.
  const series = { render: [], 'pc-demir': [] };
  const n = 360;
  for (let i = 0; i <= n; i += 1) {
    const t = Math.floor((now - (n - i) * STEP) / STEP) * STEP;
    const k = i / n;
    series.render.push({ t, rss: Math.round(wave(i, 300 + 12 * k, 9, 70) + (i % 17 === 0 ? 6 : 0)), cpu: Math.round(wave(i, 22, 6, 40)), conns: Math.round(wave(i, 60, 6, 55)), p95: Math.round(wave(i, 46, 6, 45, 1) + (i > 250 && i < 262 ? 30 : 0)), err: Math.max(0, wave(i, 0.18, 0.12, 33)) });
    if (scenario === 'ready' && i > 40) {
      const j = (i - 40) / (n - 40);
      series['pc-demir'].push({ t, rss: Math.round(520 + 930 * Math.sqrt(j) + wave(i, 0, 22, 30)), cpu: Math.round(wave(i, 9, 3, 36)), conns: Math.round(126 * Math.sqrt(j)), p95: Math.round(wave(i, 32, 4, 50)), err: 0 });
    }
  }
  if (scenario !== 'ready') delete series['pc-demir'];

  const kv = scenario === 'ready' ? { ok: true, usedMb: 3.2, maxMb: 25, configured: true } : scenario === 'kvDown' ? { ok: false, usedMb: 0, maxMb: 25, configured: true } : scenario === 'noPc' ? { ok: true, usedMb: 0.4, maxMb: 25, configured: true } : { ok: false, usedMb: 0, maxMb: 25, configured: false };
  let emergency = null;

  function overview() {
    const byNode = Object.fromEntries(nodes.map((x) => [x.id, x.conns]));
    const conns = nodes.reduce((a, x) => a + x.conns, 0);
    const per = 2.5;
    const use = (mb) => Math.max(0, Math.floor((mb * 0.85 - 180) / per));
    const pcNode = nodes.find((x) => x.role === 'secondary');
    const renderUsers = use(512);
    const pcUsers = pcNode ? use(cfg.ramMb) : 0;
    return {
      available: true,
      single: scenario === 'single' || scenario === 'kvDown',
      kv,
      nodes: nodes.map((x) => ({ ...x })),
      leader: 'render',
      cfg: { ...cfg, ...(emergency ? { emergency } : {}) },
      totals: { conns, byNode },
      capacity: { estimate: renderUsers + pcUsers, perUserMb: per, renderUsers, pcUsers },
      savedUsdMonth: scenario === 'ready' ? 9.25 : 0,
      saved: { month: new Date(now).toISOString().slice(0, 7), gbHours: scenario === 'ready' ? 540 : 0, pcHours: scenario === 'ready' ? 92 : 0 },
      schedule: { now: true, hoursPerWeek: 70 },
      pc: { registered: scenario === 'ready', online: Boolean(pcNode), lastSeenAt: pcNode ? beat : null },
      keys: { available: true, active: keys.filter((k) => k.status === 'active').length, max: 5 },
      storage: { ok: true },
      emergency: emergency && emergency.on ? emergency : null,
      events: events.slice(0, 50),
      at: new Date().toISOString(),
    };
  }

  function handle(method, p, query, body) {
    const ok = (b, status = 200) => ({ status, body: b });
    if (method === 'GET' && p === '') return ok(overview());
    if (method === 'GET' && p === '/metrics') return ok({ minutes: 60, series });
    if (method === 'PUT' && p === '/pc-config') {
      const before = cfg;
      cfg = { ...cfg, ...body, loadRule: { ...cfg.loadRule, ...(body.loadRule || {}) }, gameMode: { ...cfg.gameMode, ...(body.gameMode || {}) }, schedule: { ...cfg.schedule, ...(body.schedule || {}) }, alerts: { ...cfg.alerts, ...(body.alerts || {}) } };
      if (body.ramMb && body.ramMb !== before.ramMb) {
        events.unshift({ at: new Date().toISOString(), kind: 'cfg_update', nodeId: null, detail: { ramMb: cfg.ramMb, prevRamMb: before.ramMb, cores: cfg.cores } });
        const p2 = nodes.find((x) => x.role === 'secondary');
        if (p2) p2.memLimit = cfg.ramMb;
      }
      return ok({ cfg, changed: Object.keys(body) });
    }
    if (method === 'POST' && p === '/drill') {
      const p2 = nodes.find((x) => x.role === 'secondary');
      if (!p2) return ok({ code: 'NO_PC', error: 'No PC node is connected.' }, 409);
      const r = { nodeId: p2.id, before: p2.conns, moved: p2.conns, dropped: 0, remaining: 0, ms: 3140, timedOut: false };
      events.unshift({ at: new Date().toISOString(), kind: 'drill', nodeId: p2.id, detail: r });
      return ok(r);
    }
    if (method === 'POST' && p === '/all-to-render') {
      emergency = { on: true, at: new Date().toISOString(), by: 'admin', reason: body.reason };
      const p2 = nodes.find((x) => x.role === 'secondary');
      const moving = p2 ? p2.conns : 0;
      if (p2) {
        nodes[0].conns += p2.conns;
        p2.conns = 0;
        p2.state = 'draining';
      }
      events.unshift({ at: new Date().toISOString(), kind: 'all_to_render', nodeId: null, detail: { reason: body.reason, conns: moving } });
      return ok({ ok: true, nodes: p2 ? [p2.id] : [], moving, emergency });
    }
    let m = p.match(/^\/([^/]+)\/(drain|resume)$/);
    if (m && method === 'POST' && m[1] !== 'keys') {
      const node = nodes.find((x) => x.id === decodeURIComponent(m[1]));
      if (!node) return ok({ code: 'NODE_NOT_FOUND' }, 404);
      if (m[2] === 'drain') {
        const moving = node.conns;
        node.state = 'draining';
        events.unshift({ at: new Date().toISOString(), kind: 'node_drain', nodeId: node.id, detail: { nodeId: node.id, reason: body.reason, conns: moving } });
        return ok({ ok: true, nodeId: node.id, state: 'draining', moving });
      }
      node.state = 'active';
      emergency = null;
      events.unshift({ at: new Date().toISOString(), kind: 'node_resume', nodeId: node.id, detail: { nodeId: node.id } });
      return ok({ ok: true, nodeId: node.id, state: 'active' });
    }
    if (method === 'GET' && p === '/keys') return ok({ available: true, keys, max: 5 });
    if (method === 'POST' && p === '/keys') {
      const secret = 'dsk_node_' + 'Hq7mP2xVb9KcR4tN8wLs3DfG6yZa1JeU5oQi0XnBvCr';
      const key = { id: '3c1f0b8e-2a4d-4e6f-8a9b-0c1d2e3f4a5b', name: body.name, prefix: 'Hq7m', last4: 'BvCr', masked: 'dsk_node_Hq7m…BvCr', status: 'active', createdAt: new Date().toISOString(), lastUsedAt: null, lastUsedNode: null, revokedAt: null, revokeReason: null };
      keys.unshift(key);
      return ok({ key, secret }, 201);
    }
    m = p.match(/^\/keys\/([^/]+)\/revoke$/);
    if (m && method === 'POST') {
      const key = keys.find((k) => k.id === m[1]);
      if (!key) return ok({ code: 'KEY_NOT_FOUND' }, 404);
      key.status = 'revoked';
      key.revokedAt = new Date().toISOString();
      key.revokeReason = body.reason;
      return ok({ key });
    }
    if (method === 'POST' && p === '/alerts/test') return ok({ ok: true, recipients: 1 });
    return ok({ error: 'not mocked' }, 404);
  }

  return { handle, overview, setNodes: (list) => (nodes = list) };
}

module.exports = { createNodesMock };
