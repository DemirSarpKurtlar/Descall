"use strict";

/**
 * Davet ödülleri: the payloads the screens draw.
 *   myDashboard   Davet Merkezi (inviter, desktop + phone)
 *   landing       descall.com/r/<username> (public, invitee before sign-up)
 *   welcome       the invitee's first entry into the app
 *   adminOverview Yönetici Paneli > Davet ödülleri (control board)
 *   adminInviter  the board's right panel (one inviter)
 * Link opens are counted anonymously: nobody sees who opened a link.
 */

const model = require("./model");
const store = require("./store");

const PUBLIC_ORIGIN = "https://descall.com";

function db() {
  return require("../../db/supabase");
}

function runtime() {
  const s = require("../../runtime/sharedState");
  return { presence: s.presence, voiceCalls: s.activeServerVoiceCalls };
}

/** "online" | "idle" | "dnd" | null (offline or invisible: never revealed). */
function presenceOf(userId) {
  try {
    const p = runtime().presence.get(String(userId));
    if (!p) return null;
    const s = String(p.status || "online");
    return s === "invisible" ? null : ["online", "idle", "dnd"].includes(s) ? s : "online";
  } catch {
    return null;
  }
}

/** The voice channel a user sits in: { serverId, channelId, count, people[] } or null. */
function voiceOf(userId) {
  try {
    const uid = String(userId);
    for (const [channelId, call] of runtime().voiceCalls.entries()) {
      const parts = call?.participants;
      if (!parts || !(parts.has(uid) || parts.has(userId))) continue;
      const people = [];
      for (const [pid, p] of parts.entries()) {
        if (String(pid) === uid) continue;
        if (people.length >= 3) break;
        people.push({ id: String(pid), name: p?.displayName || p?.display_name || p?.username || "", avatarUrl: p?.avatarUrl || p?.avatar_url || null });
      }
      return { serverId: call.serverId ? String(call.serverId) : null, channelId: String(channelId), channelName: call.channelName || "", count: parts.size, people };
    }
  } catch {
    /* runtime not loaded */
  }
  return null;
}

function brief(u) {
  if (!u) return null;
  return { id: String(u.id), username: u.username, displayName: u.display_name || u.username, avatarUrl: u.avatar_url || null };
}

function inviteLink(username, channel = null) {
  const name = String(username || "").replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 24);
  const base = `${PUBLIC_ORIGIN}/r/${encodeURIComponent(name)}`;
  const k = model.normalizeChannel(channel);
  return k && k !== "link" ? `${base}?k=${k}` : base;
}

async function qrSvg(url) {
  try {
    const QRCode = require("qrcode");
    const svg = await QRCode.toString(url, { type: "svg", errorCorrectionLevel: "M", margin: 1, color: { dark: "#0b0c12ff", light: "#ffffffff" } });
    return svg.replace(/<\?xml[^>]*>/, "").trim();
  } catch {
    return null;
  }
}

const ms = (iso) => (iso ? new Date(iso).getTime() : null);

/** One friend in the inviter's live list. */
function friendView(row, user, rules, now) {
  const view = model.statusView(row, rules, now);
  const stage = model.stageOf(row);
  const nudgeOk =
    row.status === "pending" &&
    !row.first_message_at &&
    (!row.nudged_at || now - ms(row.nudged_at) > 24 * model.HOUR) &&
    now - ms(row.signup_at || row.created_at) > 10 * 60 * 1000;
  return {
    id: String(row.id),
    user: brief(user) || { id: String(row.invitee_id), username: null, displayName: null, avatarUrl: null },
    online: user ? presenceOf(user.id) : null,
    channel: model.normalizeChannel(row.channel) || null,
    signupAt: row.signup_at || row.created_at,
    stage: stage.stage,
    waiting: stage.waiting,
    status: view.key,
    why: view.why,
    unlockAt: view.unlockAt,
    countdownMs: view.countdownMs,
    reward: row.inviter_skip ? 0 : row.inviter_amount || 0,
    rewardPaid: row.status === "paid" && !row.inviter_skip,
    inviterSkip: row.inviter_skip || null,
    canNudge: Boolean(nudgeOk && user),
    nudgedAt: row.nudged_at || null,
    legacy: Boolean(row.legacy),
  };
}

/** Davet Merkezi payload for the signed-in inviter. */
async function myDashboard({ userId, now = Date.now() }) {
  const [me, { version, rules }, rows, opens, reached, st, notices] = await Promise.all([
    store.userById(userId),
    store.getRules(),
    store.referralsByInviter(userId),
    store.listOpens({ inviterId: userId, since: new Date(now - 365 * model.DAY).toISOString() }),
    store.listMilestones(userId),
    store.getInviterState(userId),
    store.listNotices(userId, { limit: 5 }),
  ]);
  const users = await store.usersByIds(rows.slice(0, 200).map((r) => r.invitee_id));
  const funnel = model.personalFunnel({ rows, opens }, now);
  const activeLive = rows.filter((r) => r.status === "paid" && !r.legacy).length;
  const milestones = model.milestonesView(activeLive, rules, reached);
  const earnedRows = rows.filter((r) => r.status === "paid" && !r.inviter_skip).reduce((s, r) => s + (r.inviter_amount || 0), 0);
  const earnedMilestones = (reached || []).filter((m) => !m.revoked_at).reduce((s, m) => s + (m.amount || 0), 0);
  const pendingRows = rows.filter((r) => (r.status === "pending" || r.status === "held") && !r.inviter_skip);
  const monthStart = model.monthStartIso(now);
  const paidThisMonth = rows.filter((r) => r.status === "paid" && !r.legacy && !r.inviter_skip && (r.paid_at || "") >= monthStart).length;
  const friends = rows.slice(0, 200).map((r) => friendView(r, users.get(String(r.invitee_id)), rules, now));
  const anonOpens = opens.filter((o) => !o.signup_user_id && ms(o.opened_at) >= now - 30 * model.DAY);
  const byChannel = {};
  for (const o of anonOpens) {
    const c = model.normalizeChannel(o.channel) || "link";
    byChannel[c] = (byChannel[c] || 0) + 1;
  }
  const link = inviteLink(me?.username);
  return {
    username: me?.username || null,
    displayName: me?.display_name || me?.username || null,
    link,
    qrSvg: me?.username ? await qrSvg(inviteLink(me.username, "qr")) : null,
    paused: Boolean(st.link_paused),
    totals: { earned: earnedRows + earnedMilestones, pending: pendingRows.reduce((s, r) => s + (r.inviter_amount || 0), 0) },
    funnel,
    channels: model.channelShare(rows),
    milestones,
    friends,
    anonymous: { opens: anonOpens.length, byChannel },
    wallet: pendingRows
      .map((r) => {
        const v = model.statusView(r, rules, now);
        const u = users.get(String(r.invitee_id));
        return { id: String(r.id), user: brief(u), amount: r.inviter_amount || 0, status: v.key, why: v.why, unlockAt: v.unlockAt, expiresAt: v.expiresAt, countdownMs: v.countdownMs };
      })
      .sort((a, b) => (a.countdownMs ?? Infinity) - (b.countdownMs ?? Infinity)),
    month: { paid: paidThisMonth, cap: rules.monthlyCap },
    rules: {
      version,
      inviterReward: rules.inviterReward,
      inviteeReward: rules.inviteeReward,
      returnAfterHours: rules.returnAfterHours,
      returnWindowHours: rules.returnWindowHours,
      monthlyCap: rules.monthlyCap,
      requireFirstMessage: rules.requireFirstMessage,
    },
    notices: (notices || []).filter((n) => !n.read_at).map((n) => ({ id: n.id, kind: n.kind, text: n.text, amount: n.amount, at: n.created_at })),
  };
}

async function userByUsername(username) {
  const name = String(username || "").trim().replace(/^@/, "");
  if (!/^[A-Za-z0-9_.-]{2,24}$/.test(name)) return null;
  const like = name.replace(/[\\%_]/g, (c) => `\\${c}`);
  const { data, error } = await db()
    .from("users")
    .select("id, username, display_name, avatar_url, is_banned, deleted_at, created_at")
    .ilike("username", like)
    .maybeSingle();
  if (error || !data || data.is_banned || data.deleted_at) return null;
  return data;
}

async function publicServer(serverId) {
  if (!serverId) return null;
  const { data, error } = await db().from("servers").select("id, name, icon_url, is_public").eq("id", serverId).maybeSingle();
  if (error || !data) return null;
  return data;
}

/** Visible members online now in a server (members list is read once, capped). */
async function onlineInServer(serverId) {
  try {
    const { data } = await db().from("server_members").select("user_id").eq("server_id", serverId).limit(5000);
    let n = 0;
    for (const m of data || []) if (presenceOf(m.user_id)) n += 1;
    return n;
  } catch {
    return 0;
  }
}

/** Public landing data for descall.com/r/<username>. */
async function landing({ username }) {
  const u = await userByUsername(username);
  if (!u) return null;
  const [{ rules }, st] = await Promise.all([store.getRules(), store.getInviterState(u.id)]);
  const online = presenceOf(u.id);
  let activity = null;
  if (online) {
    const v = voiceOf(u.id);
    if (v) {
      const srv = await publicServer(v.serverId);
      const isPublic = Boolean(srv?.is_public);
      activity = {
        kind: "voice",
        count: v.count,
        serverName: isPublic ? srv.name : null,
        people: isPublic ? v.people.map((p) => ({ name: p.name, avatarUrl: p.avatarUrl })) : [],
      };
    }
  }
  return {
    inviter: { username: u.username, displayName: u.display_name || u.username, avatarUrl: u.avatar_url || null, online, activity },
    paused: Boolean(st.link_paused),
    gifts: {
      inviteeReward: st.link_paused ? 0 : rules.inviteeReward,
      inviterReward: rules.inviterReward,
      badge: true,
      friendship: true,
    },
    rules: { returnAfterHours: rules.returnAfterHours, requireFirstMessage: rules.requireFirstMessage },
  };
}

async function friendshipState(userId, otherIds) {
  const out = new Map();
  if (!otherIds.length) return out;
  const { data } = await db().from("friendships").select("user_id, friend_id, status").or(`user_id.eq.${userId},friend_id.eq.${userId}`);
  for (const r of data || []) {
    const other = String(r.user_id) === String(userId) ? String(r.friend_id) : String(r.user_id);
    if (!otherIds.includes(other)) continue;
    const s = r.status === "accepted" ? "friend" : String(r.user_id) === String(userId) ? "requested" : "incoming";
    if (out.get(other) !== "friend") out.set(other, s);
  }
  return out;
}

async function friendIdsOf(userId, limit = 60) {
  const { data } = await db()
    .from("friendships")
    .select("user_id, friend_id, status")
    .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
    .limit(500);
  const ids = [];
  for (const r of data || []) {
    if (r.status !== "accepted") continue;
    ids.push(String(r.user_id) === String(userId) ? String(r.friend_id) : String(r.user_id));
  }
  return [...new Set(ids)].slice(0, limit);
}

async function serverIdsOf(userId) {
  const { data } = await db().from("server_members").select("server_id").eq("user_id", userId).limit(300);
  return (data || []).map((m) => String(m.server_id));
}

/** The invitee's first entry: inviter, gift progress, a server and the inviter's friends. */
async function welcome({ userId, now = Date.now() }) {
  const row = await store.referralByInvitee(userId);
  if (!row || row.legacy) return { invited: false };
  const { rules } = await store.getRules();
  const users = await store.usersByIds([row.inviter_id, userId]);
  const inviter = users.get(String(row.inviter_id));
  if (!inviter || inviter.is_banned || inviter.deleted_at) return { invited: false };
  const me = users.get(String(userId));
  const view = model.statusView(row, rules, now);
  const states = await friendshipState(userId, [String(inviter.id)]);
  const online = presenceOf(inviter.id);
  const voice = online ? voiceOf(inviter.id) : null;

  // Server suggestion: the public server the inviter is talking in, else one of theirs.
  let server = null;
  const myServers = new Set(await serverIdsOf(userId).catch(() => []));
  const candidates = [];
  if (voice?.serverId) candidates.push(voice.serverId);
  for (const id of (await serverIdsOf(inviter.id).catch(() => [])).slice(0, 20)) if (!candidates.includes(id)) candidates.push(id);
  for (const id of candidates) {
    const srv = await publicServer(id);
    if (!srv?.is_public) continue;
    const inVoice = voice && voice.serverId === String(srv.id) ? voice.count : 0;
    server = {
      id: String(srv.id),
      name: srv.name,
      iconUrl: srv.icon_url || null,
      online: await onlineInServer(srv.id),
      inviterInVoice: Boolean(inVoice),
      voiceCount: inVoice,
      joined: myServers.has(String(srv.id)),
    };
    break;
  }

  // The inviter's friends (online first), what they are doing, and my state with them.
  const friendIds = (await friendIdsOf(inviter.id).catch(() => [])).filter((id) => id !== String(userId));
  const fUsers = await store.usersByIds(friendIds.slice(0, 40));
  const myStates = await friendshipState(userId, friendIds.slice(0, 40)).catch(() => new Map());
  const friends = [];
  for (const id of friendIds.slice(0, 40)) {
    const f = fUsers.get(id);
    if (!f || f.is_banned || f.deleted_at) continue;
    const fOnline = presenceOf(id);
    const fVoice = fOnline ? voiceOf(id) : null;
    let place = null;
    if (fVoice && server && fVoice.serverId === server.id) place = { kind: "voice", serverName: server.name };
    friends.push({ ...brief(f), online: fOnline, place, friend: myStates.get(id) || null });
  }
  friends.sort((a, b) => Number(Boolean(b.place)) - Number(Boolean(a.place)) || Number(Boolean(b.online)) - Number(Boolean(a.online)));
  const mutual = new Map();
  if (friends.length) {
    const mine = myServers;
    for (const f of friends.slice(0, 6)) {
      const theirs = await serverIdsOf(f.id).catch(() => []);
      mutual.set(f.id, theirs.filter((s) => mine.has(s)).length);
    }
  }
  return {
    invited: true,
    me: { username: me?.username || null, displayName: me?.display_name || me?.username || null },
    inviter: { ...brief(inviter), online, inVoice: Boolean(voice), friend: states.get(String(inviter.id)) || null },
    gift: {
      amount: row.invitee_amount || 0,
      status: view.key,
      why: view.why,
      unlockAt: view.unlockAt,
      expiresAt: view.expiresAt,
      steps: [
        { key: "account", done: true, at: row.signup_at || row.created_at },
        { key: "first_message", done: Boolean(row.first_message_at), at: row.first_message_at || null },
        { key: "return", done: row.status === "paid", at: row.status === "paid" ? row.paid_at : view.unlockAt },
      ],
    },
    server,
    friends: friends.slice(0, 4).map((f) => ({ ...f, mutualServers: mutual.get(f.id) || 0 })),
    friendsTotal: friends.length,
  };
}

// ---------------------------------------------------------------- admin
const RANGES = { "24h": 1, "7d": 7, "30d": 30 };

function rangeDays(range) {
  return RANGES[range] || 30;
}

async function signupsSince(sinceIso) {
  const out = [];
  for (let from = 0; from < 50000; from += 1000) {
    let { data, error } = await db()
      .from("users")
      .select("id, created_at, referred_by, joined_via_invite_code, first_message_at")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: true })
      .range(from, from + 999);
    if (error && store.isMissing(error)) {
      ({ data, error } = await db().from("users").select("id, created_at, referred_by, first_message_at").gte("created_at", sinceIso).order("created_at", { ascending: true }).range(from, from + 999));
    }
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** The two "Ölçüm" numbers over the period, against their start and target values. */
function measurement(signups, friendRows) {
  const friendIds = new Set(friendRows.map((r) => String(r.invitee_id)));
  const invited = signups.filter((u) => friendIds.has(String(u.id)) || u.referred_by || u.joined_via_invite_code);
  const notInvited = signups.filter((u) => !(friendIds.has(String(u.id)) || u.referred_by || u.joined_via_invite_code));
  const share = model.pct(invited.length, signups.length);
  const invitedFirst = model.pct(invited.filter((u) => u.first_message_at).length, invited.length);
  const baseline = model.pct(notInvited.filter((u) => u.first_message_at).length, notInvited.length);
  return {
    signups: signups.length,
    invitedSignups: invited.length,
    inviteShare: { value: share, start: 15, target: 25 },
    invitedFirstMessage: { value: invitedFirst, start: 42, target: 65 },
    notInvitedFirstMessage: baseline,
  };
}

function delta(cur, prev) {
  if (!prev) return cur ? null : 0;
  return Math.round(((cur - prev) / prev) * 100);
}

async function logLines({ limit = 8, since }) {
  const [actions, paid] = await Promise.all([
    store.listActions({ limit }),
    store.listReferrals({ since, statuses: ["paid"] }).then((rows) => rows.filter((r) => !r.legacy && r.paid_at).sort((a, b) => (a.paid_at < b.paid_at ? 1 : -1)).slice(0, limit)),
  ]);
  const ids = new Set();
  actions.forEach((a) => a.inviter_id && ids.add(a.inviter_id));
  paid.forEach((r) => {
    ids.add(r.inviter_id);
    ids.add(r.invitee_id);
  });
  const users = await store.usersByIds([...ids]);
  const name = (id) => users.get(String(id))?.username || null;
  const lines = [
    ...actions.map((a) => ({
      id: `a:${a.id}`,
      at: a.created_at,
      kind: a.action,
      actor: a.actor_username || "system",
      system: !a.actor_id,
      inviter: name(a.inviter_id),
      inviterId: a.inviter_id || null,
      count: Array.isArray(a.referral_ids) ? a.referral_ids.length : 0,
      amount: a.amount || 0,
      reason: a.reason_code || null,
      diff: a.action === "rules" ? (a.payload?.diff || []).slice(0, 3) : null,
      version: a.action === "rules" ? a.payload?.to || null : null,
      actionId: a.id,
      undoable: !a.undone_at && a.undo_until && new Date(a.undo_until).getTime() > Date.now() && a.action !== "auto_hold" ? true : a.action === "auto_hold" && !a.undone_at && new Date(a.undo_until || 0).getTime() > Date.now(),
      undoUntil: a.undo_until || null,
      undone: Boolean(a.undone_at),
    })),
    ...paid.map((r) => ({
      id: `p:${r.id}`,
      at: r.paid_at,
      kind: "paid",
      actor: null,
      system: true,
      inviter: name(r.inviter_id),
      invitee: name(r.invitee_id),
      inviterId: String(r.inviter_id),
      amount: (r.inviter_skip ? 0 : r.inviter_amount || 0) + (r.invitee_amount || 0),
    })),
  ];
  lines.sort((a, b) => (a.at < b.at ? 1 : -1));
  return lines.slice(0, limit);
}

async function adminOverview({ range = "30d", sort = "active", now = Date.now() }) {
  const days = rangeDays(range);
  const since = new Date(now - days * model.DAY).toISOString();
  const prevSince = new Date(now - 2 * days * model.DAY).toISOString();
  const [{ version, rules, createdAt: rulesAt }, rowsAll, opensAll, alerts, signups, paused] = await Promise.all([
    store.getRules(),
    store.listReferrals({ since: prevSince }),
    store.listOpens({ since: prevSince }),
    store.listAlerts({ status: "open", limit: 3 }),
    signupsSince(since).catch(() => []),
    store.listPausedInviters(),
  ]);
  const inRange = (iso) => iso && iso >= since;
  const rows = rowsAll.filter((r) => inRange(r.signup_at || r.created_at));
  const prevRows = rowsAll.filter((r) => !inRange(r.signup_at || r.created_at));
  const opens = opensAll.filter((o) => inRange(o.opened_at));
  const prevOpens = opensAll.filter((o) => !inRange(o.opened_at));
  const funnel = model.adminFunnel({ rows, opens });
  const paidRows = rows.filter((r) => r.status === "paid" && !r.legacy);
  const heldRows = rows.filter((r) => r.status === "held");
  const heldInviters = new Set(heldRows.map((r) => String(r.inviter_id)));
  const measure = measurement(signups, rows);
  const opensByInviter = new Map();
  for (const o of opens) opensByInviter.set(String(o.inviter_id), (opensByInviter.get(String(o.inviter_id)) || 0) + 1);
  const top = model.topInviters(rows, opensByInviter, sort === "signups" ? "signups" : "active", 8);
  const alertUsers = await store.usersByIds([...top.map((t) => t.inviterId), ...alerts.map((a) => a.inviter_id)]);
  const kpis = {
    opens: { value: opens.length, delta: delta(opens.length, prevOpens.length) },
    signups: { value: rows.length, rate: model.pct(rows.length, opens.length), delta: delta(rows.length, prevRows.length) },
    firstMessage: { value: funnel.firstMessage, rate: funnel.rates.firstMessage, baseline: measure.notInvitedFirstMessage },
    active: { value: funnel.paid, rate: model.pct(funnel.paid, funnel.firstMessage) },
    paid: {
      value: paidRows.reduce((s, r) => s + (r.inviter_skip ? 0 : r.inviter_amount || 0) + (r.invitee_amount || 0), 0),
      count: paidRows.length,
      inviterReward: rules.inviterReward,
      inviteeReward: rules.inviteeReward,
    },
    held: {
      value: heldRows.length,
      inviters: heldInviters.size,
      protected: heldRows.reduce((s, r) => s + (r.inviter_skip ? 0 : r.inviter_amount || 0) + (r.invitee_amount || 0), 0),
    },
  };
  const alert = alerts[0]
    ? {
        id: alerts[0].id,
        at: alerts[0].created_at,
        inviter: brief(alertUsers.get(String(alerts[0].inviter_id))),
        signups: alerts[0].detail?.signups || 0,
        factor: alerts[0].detail?.factor || null,
        sameDevice: alerts[0].detail?.sameDevice || 0,
        windowMinutes: alerts[0].detail?.windowMinutes || 60,
        held: alerts[0].detail?.held || 0,
      }
    : null;
  return {
    range: days === 1 ? "24h" : `${days}d`,
    generatedAt: new Date(now).toISOString(),
    kpis,
    alert,
    openAlerts: alerts.length,
    funnel,
    top: top.map((t) => ({ ...t, user: brief(alertUsers.get(t.inviterId)) })),
    channels: model.channelScorecard({ rows, opens }),
    shield: model.shieldCounts(rows, rules),
    rules: { version, createdAt: rulesAt, ...rules },
    log: await logLines({ limit: 8, since }),
    measurement: measure,
    paused: paused.length,
  };
}

/** Right panel: one inviter. */
async function adminInviter({ inviterId, now = Date.now() }) {
  const [u, rows, opens, st, actions, reached] = await Promise.all([
    store.userById(inviterId),
    store.referralsByInviter(inviterId),
    store.listOpens({ inviterId, since: new Date(now - 365 * model.DAY).toISOString() }),
    store.getInviterState(inviterId),
    store.listActions({ limit: 10, inviterId }),
    store.listMilestones(inviterId),
  ]);
  if (!u) return null;
  const { rules } = await store.getRules();
  const recent = rows.filter((r) => ms(r.signup_at || r.created_at) >= now - 30 * model.DAY);
  const risk = model.inviterRisk(recent.length ? recent : rows);
  const users = await store.usersByIds(rows.slice(0, 200).map((r) => r.invitee_id));
  const clusters = new Map();
  for (const r of rows) {
    if (!r.device_hash) continue;
    clusters.set(r.device_hash, (clusters.get(r.device_hash) || 0) + 1);
  }
  const top = [...clusters.entries()].sort((a, b) => b[1] - a[1])[0] || null;
  const fastest = rows
    .map((r) => (r.risk_signals || []).find((s) => s.code === "fast_first_message")?.detail?.seconds)
    .filter((x) => Number.isFinite(x));
  const invitees = rows.slice(0, 200).map((r) => {
    const f = users.get(String(r.invitee_id));
    const chips = [];
    if (r.device_hash && (clusters.get(r.device_hash) || 0) > 1) chips.push({ kind: "device", label: model.clusterLabel(r.device_hash) });
    else if (model.hasSignal(r, "inviter_device")) chips.push({ kind: "device", label: model.clusterLabel(r.device_hash) });
    const fast = (r.risk_signals || []).find((s) => s.code === "fast_first_message");
    if (fast) chips.push({ kind: "fast", seconds: fast.detail?.seconds ?? null });
    if (model.hasSignal(r, "disposable_email")) chips.push({ kind: "tempmail" });
    if (model.hasSignal(r, "same_subnet")) chips.push({ kind: "subnet" });
    if (model.hasSignal(r, "inviter_only")) chips.push({ kind: "inviter_only" });
    return {
      id: String(r.id),
      user: brief(f) || { id: String(r.invitee_id), username: null },
      status: r.status,
      signupAt: r.signup_at || r.created_at,
      chips,
      clean: !chips.length && r.status === "paid",
      risk: r.risk_score || 0,
      amount: r.inviter_skip ? 0 : r.inviter_amount || 0,
      paidAmount: r.status === "paid" && !r.inviter_skip ? r.inviter_amount || 0 : 0,
      legacy: Boolean(r.legacy),
      holdReason: r.hold_reason || null,
    };
  });
  invitees.sort((a, b) => b.chips.length - a.chips.length || b.risk - a.risk);
  const suspicious = invitees.filter((i) => i.chips.some((c) => c.kind === "device" || c.kind === "tempmail" || c.kind === "fast") && ["paid", "pending", "held"].includes(i.status));
  return {
    user: { ...brief(u), createdAt: u.created_at, country: u.signup_country || u.country || null, online: presenceOf(u.id) },
    risk: {
      score: risk.score,
      band: risk.band,
      cluster: top && top[1] > 1 ? { label: model.clusterLabel(top[0]), size: top[1] } : null,
      disposable: risk.counts.disposable,
      fast: fastest.length,
      fastestSeconds: fastest.length ? Math.min(...fastest) : null,
    },
    counts: {
      opens: opens.length,
      signups: rows.length,
      firstMessage: rows.filter((r) => r.first_message_at || r.legacy).length,
      active: rows.filter((r) => r.status === "paid").length,
      held: rows.filter((r) => r.status === "held").length,
      pending: rows.filter((r) => r.status === "pending").length,
    },
    invitees,
    suggested: { ids: suspicious.map((i) => i.id), amount: suspicious.reduce((s, i) => s + i.paidAmount, 0) },
    paused: Boolean(st.link_paused),
    milestones: (reached || []).filter((m) => !m.revoked_at).map((m) => ({ at: m.milestone, amount: m.amount })),
    actions: actions.map((a) => ({
      id: a.id,
      at: a.created_at,
      kind: a.action,
      actor: a.actor_username || "system",
      count: Array.isArray(a.referral_ids) ? a.referral_ids.length : 0,
      amount: a.amount || 0,
      undoable: !a.undone_at && a.undo_until && new Date(a.undo_until).getTime() > now,
      undoUntil: a.undo_until,
      undone: Boolean(a.undone_at),
    })),
    language: u.language || "tr",
    rulesVersion: (await store.getRules()).version,
    monthlyCap: rules.monthlyCap,
  };
}

module.exports = { presenceOf, voiceOf, inviteLink, qrSvg, myDashboard, landing, welcome, adminOverview, adminInviter, userByUsername, rangeDays };
