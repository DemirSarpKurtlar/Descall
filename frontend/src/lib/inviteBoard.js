/**
 * Friends sidebar invite card, draft B "Kazanç panosu" (owner's pick, 28 Nov 2026).
 * Pure view model over GET /api/invites/me (tested by inviteBoard.selftest.mjs).
 */

/** Card numbers from the Davet Merkezi dashboard; safe defaults while it loads. */
export function inviteBoardView(data, fallback = { inviterReward: 100, inviteeReward: 50 }) {
  const rules = data?.rules || {};
  const a = Number.isFinite(Number(rules.inviterReward)) ? Number(rules.inviterReward) : fallback.inviterReward;
  const b = Number.isFinite(Number(rules.inviteeReward)) ? Number(rules.inviteeReward) : fallback.inviteeReward;
  const active = Math.max(0, Number(data?.milestones?.count) || 0);
  const earned = Math.max(0, Number(data?.totals?.earned) || 0);
  const wallet = Array.isArray(data?.wallet) ? data.wallet : [];
  const pendingCount = wallet.length;
  const pendingCoins = Math.max(0, Number(data?.totals?.pending) || 0);
  const list = Array.isArray(data?.milestones?.list) ? data.milestones.list : [];
  const nextAt = Number(data?.milestones?.next) || null;
  const prevAt = list.filter((m) => m.reached).reduce((mx, m) => Math.max(mx, Number(m.at) || 0), 0);
  let progress = null;
  if (nextAt) {
    const span = Math.max(1, nextAt - prevAt);
    progress = Math.min(1, Math.max(0, (active - prevAt) / span));
  }
  return {
    loaded: Boolean(data),
    a,
    b,
    active,
    earned,
    pendingCount,
    pendingCoins,
    nextLeft: nextAt ? Math.max(0, nextAt - active) : null,
    progress,
    allDone: Boolean(data) && list.length > 0 && !nextAt,
    paused: Boolean(data?.paused),
    unread: Array.isArray(data?.notices) ? data.notices.length : 0,
  };
}

/** Compact number for the chips: 950, 1.2K, 12K (locale digits from Intl). */
export function compactCount(n, locale = "tr") {
  const v = Math.max(0, Number(n) || 0);
  if (v < 1000) return String(Math.round(v));
  try {
    return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(v);
  } catch {
    return `${Math.round(v / 100) / 10}K`;
  }
}
