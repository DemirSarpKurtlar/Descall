const STATUS_RANK = {
  confirmed: 4,
  rejected: 3,
  expired: 3,
  failed: 2,
  pending: 1,
};

export function actionFingerprint(action) {
  const type = String(action?.type || "");
  const preview = action?.preview || {};
  const recipient = preview.recipient || {};
  const to =
    action?.payload?.toUserId ||
    action?.payload?.userId ||
    recipient.id ||
    recipient.username ||
    preview.title ||
    "";
  const channel = action?.payload?.channelId || preview.channelId || "";
  const body = String(preview.body || action?.payload?.text || "").trim().toLowerCase();
  return `${type}::${String(to).toLowerCase()}::${String(channel)}::${body}`;
}

export function mergePendingActionLists(serverList = [], localList = []) {
  const localById = new Map((localList || []).filter((a) => a?.id).map((a) => [a.id, a]));
  const seen = new Set();
  const out = [];
  for (const action of serverList || []) {
    if (!action?.id) continue;
    const local = localById.get(action.id);
    const serverRank = STATUS_RANK[action.status] || 0;
    const localRank = STATUS_RANK[local?.status] || 0;
    out.push(local && localRank >= serverRank ? { ...action, ...local } : action);
    seen.add(action.id);
  }
  for (const action of localList || []) {
    if (!action?.id || seen.has(action.id)) continue;
    out.push(action);
  }
  return out;
}

export function collapsePendingActions(list = []) {
  const byFp = new Map();
  for (const action of list || []) {
    if (!action?.id) continue;
    const fp = actionFingerprint(action);
    const prev = byFp.get(fp);
    if (!prev) {
      byFp.set(fp, action);
      continue;
    }
    const prevRank = STATUS_RANK[prev.status] || 0;
    const nextRank = STATUS_RANK[action.status] || 0;
    if (nextRank > prevRank) byFp.set(fp, action);
    else if (nextRank === prevRank && String(action.createdAt || "") > String(prev.createdAt || "")) {
      byFp.set(fp, action);
    }
  }
  return [...byFp.values()];
}
