import { istanbulDayKey } from "./datetime.js";

const ONLINE_WINDOW_MS = 5 * 60 * 1000;

/** Same 5-minute window as backend last_seen online. Never use "active today". */
export function isOnlineNow(user, now = Date.now()) {
  if (!user) return false;
  if (user.isOnline === true) return true;
  const raw = user.lastSeen || user.last_seen;
  const t = Date.parse(raw);
  if (!Number.isFinite(t)) return false;
  const nowMs = now instanceof Date ? now.getTime() : Number(now) || Date.now();
  const delta = nowMs - t;
  return delta <= ONLINE_WINDOW_MS && delta >= -60_000;
}

function markOnline(user, now) {
  if (!user) return user;
  const online = isOnlineNow(user, now);
  const status = online
    ? (user.status && user.status !== "offline" ? user.status : "online")
    : "offline";
  return { ...user, isOnline: online, status };
}

function rosterPerson(row) {
  if (!row?.id) return null;
  const lastSeen = row.lastSeen || row.last_seen || null;
  const base = {
    id: row.id,
    username: row.username,
    displayName: row.displayName || row.display_name || row.username,
    avatarUrl: row.avatarUrl || row.avatar_url || null,
    lastSeen,
    createdAt: row.createdAt || row.signup_at || row.created_at || null,
    source: row.source || row.first_touch_source || null,
    isOnline: Boolean(row.isOnline),
    status: row.status || (row.isOnline ? "online" : "offline"),
  };
  return markOnline(base);
}

function formatUptimeLabel(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function rssMbFromMemory(memory) {
  const rss = Number(memory?.rss) || 0;
  return Math.round(rss / (1024 * 1024));
}

/**
 * Build an Overview payload from older admin endpoints.
 * Used when GET /overview fails. RAM /stats is empty on Vercel.
 */
export function composeOverviewFromLegacy({
  pulse = null,
  stats = null,
  inbox = null,
  system = null,
  audit = null,
  feedback = null,
  sanctions = null,
} = {}) {
  const newlyJoined = (pulse?.newlyJoined || []).map(rosterPerson).filter(Boolean).slice(0, 20);
  const recentlyActive = (pulse?.recentlyActive || []).map(rosterPerson).filter(Boolean).slice(0, 20);
  const today = istanbulDayKey();
  const signupsToday = newlyJoined.filter((u) => u.createdAt && istanbulDayKey(u.createdAt) === today).length;
  const connected = Number(stats?.connectedCount ?? pulse?.connectedCount ?? stats?.onlineUsers) || 0;
  const visible = Number(stats?.visibleCount ?? pulse?.visibleCount) || 0;
  const invisible = Number(stats?.invisibleCount ?? pulse?.invisibleCount) || 0;
  const openReports = Number(inbox?.openCount) || 0;
  const hotTargets = inbox?.hotTargets || [];
  const maintenance = Boolean(system?.config?.maintenanceMode);
  const chatFrozen = Boolean(system?.config?.chatFrozen);
  const mem = rssMbFromMemory(stats?.memory);
  const uptimeSeconds = Number(stats?.uptime) || 0;

  let level = "ok";
  const alerts = [];
  if (maintenance) {
    alerts.push({ id: "maintenance", level: "critical", tab: "maintenance" });
    level = "critical";
  }
  if (chatFrozen) {
    alerts.push({ id: "chat_frozen", level: "high", tab: "maintenance" });
    if (level === "ok" || level === "watch") level = "high";
  }
  if (hotTargets.length > 0) {
    alerts.push({ id: "hot_reports", level: "high", tab: "reports" });
    if (level === "ok" || level === "watch") level = "high";
  } else if (openReports > 0) {
    alerts.push({ id: "open_reports", level: "watch", tab: "reports" });
    if (level === "ok") level = "watch";
  }

  const auditRows = Array.isArray(audit?.entries) ? audit.entries : Array.isArray(audit) ? audit : [];

  return {
    generatedAt: new Date().toISOString(),
    health: { level, alerts },
    live: {
      connected,
      visible,
      invisible,
      statusCounts: stats?.statusCounts || pulse?.statusCounts || {},
      people: recentlyActive.filter((u) => u.isOnline).slice(0, 12),
    },
    product: {
      signupsToday,
      sparkline: [],
      newFeedback: Number(feedback?.new) || 0,
    },
    safety: {
      openReports,
      uniqueTargets: Number(inbox?.uniqueTargets) || 0,
      hotTargets,
      autoOpenUserId: inbox?.autoOpenUserId || null,
      bans: Array.isArray(sanctions?.bans) ? sanctions.bans.length : Number(stats?.bannedUsers) || 0,
      timeouts: Array.isArray(sanctions?.timeouts) ? sanctions.timeouts.length : 0,
    },
    system: {
      uptime: { seconds: uptimeSeconds, label: formatUptimeLabel(uptimeSeconds) },
      maintenance,
      chatFrozen,
      rssMb: mem,
      errorsLastHour: 0,
      flaggedMessages: Number(system?.flaggedCount) || 0,
    },
    newlyJoined,
    recentlyActive,
    recentAudit: auditRows.slice(0, 8).map((e) => ({
      id: e.id,
      at: e.at,
      actor: e.actorUsername || e.actor || null,
      action: e.action,
      target: e.target,
    })),
  };
}

export function overviewHasPeople(payload) {
  if (!payload) return false;
  return (payload.newlyJoined || []).length > 0 || (payload.recentlyActive || []).length > 0;
}

/** Fill empty RAM/socket fields with Supabase analytics + member-pulse. */
export function mergeOverviewWithDb(overview, analytics, pulse) {
  const fromPulse = {
    newlyJoined: (pulse?.newlyJoined || []).map(rosterPerson).filter(Boolean).slice(0, 20),
    recentlyActive: (pulse?.recentlyActive || []).map(rosterPerson).filter(Boolean).slice(0, 20),
  };
  const base = overview || composeOverviewFromLegacy({ pulse });
  const newlyJoined = (base.newlyJoined || []).length ? base.newlyJoined : fromPulse.newlyJoined;
  let recentlyActive = ((base.recentlyActive || []).length ? base.recentlyActive : fromPulse.recentlyActive).map((u) => markOnline(u));
  const livePeople = (base.live?.people || []).map(rosterPerson).filter(Boolean);
  if (livePeople.length) {
    const byId = new Map(recentlyActive.map((u) => [String(u.id), u]));
    for (const person of livePeople) {
      byId.set(String(person.id), markOnline({ ...person, isOnline: true }));
    }
    recentlyActive = [...byId.values()];
  }
  const signupsToday =
    Number(base.product?.signupsToday) || Number(analytics?.signupsToday) || 0;
  const ramOnline = Number(base.live?.connected) || 0;
  const listOnline = recentlyActive.filter((u) => u.isOnline).length;
  // Never fall back to analytics.activeToday (24h). That made count=1 while the list said Offline.
  const connected = Math.max(ramOnline, listOnline);
  const visible = ramOnline > 0 ? (Number(base.live?.visible) || connected) : connected;
  return {
    ...base,
    live: {
      ...(base.live || {}),
      connected,
      visible,
      people: (base.live?.people || []).length
        ? base.live.people
        : recentlyActive.filter((u) => u.isOnline).slice(0, 12),
    },
    product: {
      ...(base.product || {}),
      signupsToday,
    },
    newlyJoined,
    recentlyActive,
  };
}

export { rosterPerson, formatUptimeLabel, markOnline, ONLINE_WINDOW_MS };
