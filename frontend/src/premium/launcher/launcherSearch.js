/**
 * quick_launcher search (renderer side). Pure: builds an index from the
 * app's in-memory lists (friends, DMs, groups, servers + channels) plus
 * actions, and ranks it with a small fuzzy matcher.
 *
 * Item: { id, kind: friend|dm|group|server|channel|action, title, subtitle,
 *         avatar, focus, keywords, run: { type, ... } }
 * `run` is the routing payload the bridge executes (never sent to main).
 */

/** Lowercase, strip accents and Turkish dotless i so "Ayse" finds "Ayşe". */
export function fold(text) {
  return String(text || "")
    .toLocaleLowerCase("tr")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i");
}

/**
 * Score how well `query` matches `text` (higher is better, 0 = no match).
 * Prefix > word start > substring > in-order subsequence with small gaps.
 */
export function fuzzyScore(query, text) {
  const q = fold(query).trim();
  const t = fold(text);
  if (!q) return 1;
  if (!t) return 0;
  if (t === q) return 1000;
  if (t.startsWith(q)) return 900 - Math.min(100, t.length - q.length);
  const words = t.split(/[\s_\-#.]+/);
  if (words.some((w) => w.startsWith(q))) return 700 - Math.min(100, t.length - q.length);
  const idx = t.indexOf(q);
  if (idx >= 0) return 500 - Math.min(100, idx);
  // Subsequence: every query char in order; penalise gaps.
  let ti = 0;
  let gaps = 0;
  let last = -1;
  for (const ch of q) {
    if (ch === " ") continue;
    const found = t.indexOf(ch, ti);
    if (found < 0) return 0;
    if (last >= 0) gaps += found - last - 1;
    last = found;
    ti = found + 1;
  }
  const score = 300 - gaps * 8 - (t.length - q.length);
  return score > 0 ? score : 1;
}

function str(v, max = 120) {
  return String(v == null ? "" : v).slice(0, max);
}

function avatarOf(u) {
  const url = u?.avatar_url || u?.avatarUrl || u?.avatar || "";
  return /^(https:\/\/|data:image\/)/i.test(String(url)) ? String(url) : "";
}

function nameOf(u) {
  return str(u?.display_name || u?.displayName || u?.username || u?.name || "");
}

/**
 * Build the searchable list.
 * src = { friends, dms, groups, servers, actions, t }
 *   t(key) translates subtitles (passed in so this stays pure).
 */
export function buildIndex({ friends = [], dms = [], groups = [], servers = [], actions = [], t = (k) => k } = {}) {
  const out = [];
  const seenUsers = new Set();
  for (const f of friends || []) {
    if (!f?.id) continue;
    seenUsers.add(String(f.id));
    out.push({
      id: `friend:${f.id}`,
      kind: "friend",
      title: nameOf(f),
      subtitle: f.username && nameOf(f) !== f.username ? `@${str(f.username, 40)}` : t("premiumAudio.launcher.friend"),
      avatar: avatarOf(f),
      focus: true,
      keywords: [f.username, f.display_name].filter(Boolean).join(" "),
      run: { type: "dm", userId: String(f.id), username: str(f.username || nameOf(f), 60) },
    });
  }
  for (const d of dms || []) {
    const u = d?.user || d?.peer || d;
    if (!u?.id || seenUsers.has(String(u.id))) continue;
    seenUsers.add(String(u.id));
    out.push({
      id: `dm:${u.id}`,
      kind: "dm",
      title: nameOf(u),
      subtitle: t("premiumAudio.launcher.dm"),
      avatar: avatarOf(u),
      focus: true,
      keywords: str(u.username),
      run: { type: "dm", userId: String(u.id), username: str(u.username || nameOf(u), 60) },
    });
  }
  for (const g of groups || []) {
    if (!g?.id) continue;
    out.push({
      id: `group:${g.id}`,
      kind: "group",
      title: str(g.name || t("premiumAudio.launcher.group")),
      subtitle: t("premiumAudio.launcher.group"),
      avatar: avatarOf(g),
      focus: true,
      keywords: "",
      run: { type: "group", groupId: String(g.id), groupName: str(g.name, 80) },
    });
  }
  for (const s of servers || []) {
    if (!s?.id) continue;
    out.push({
      id: `server:${s.id}`,
      kind: "server",
      title: str(s.name),
      subtitle: t("premiumAudio.launcher.server"),
      avatar: avatarOf({ avatar_url: s.icon_url || s.iconUrl || s.icon }),
      focus: true,
      keywords: "",
      run: { type: "server", serverId: String(s.id), serverName: str(s.name, 80) },
    });
    for (const c of s.channels || []) {
      if (!c?.id || c.type === "category") continue;
      out.push({
        id: `channel:${s.id}:${c.id}`,
        kind: "channel",
        title: str(c.name),
        subtitle: str(s.name),
        avatar: "",
        focus: true,
        keywords: str(s.name),
        run: { type: "channel", serverId: String(s.id), serverName: str(s.name, 80), channelId: String(c.id), channelName: str(c.name, 80), channelType: str(c.type, 16) },
      });
    }
  }
  for (const a of actions || []) out.push({ kind: "action", focus: false, avatar: "", keywords: "", ...a });
  return out;
}

const KIND_BOOST = { action: 30, friend: 20, dm: 18, group: 15, channel: 10, server: 12 };

/** Ranked results (without `run`), at most `limit`. Empty query: actions first, then recent people. */
export function search(index, query, { limit = 12 } = {}) {
  const q = String(query || "").trim();
  const scored = [];
  for (const item of index || []) {
    let s;
    if (!q) {
      s = item.kind === "action" ? 100 : item.kind === "friend" || item.kind === "dm" ? 50 : 0;
      if (!s) continue;
    } else {
      s = Math.max(fuzzyScore(q, item.title), fuzzyScore(q, item.keywords) * 0.8, fuzzyScore(q, item.subtitle) * 0.4);
      if (s <= 0 || (s < 2 && q.length > 0)) continue;
      s += KIND_BOOST[item.kind] || 0;
    }
    scored.push({ item, s });
  }
  scored.sort((a, b) => b.s - a.s || a.item.title.localeCompare(b.item.title));
  return scored.slice(0, limit).map(({ item }) => ({
    id: item.id,
    kind: item.kind,
    title: item.title,
    subtitle: item.subtitle || "",
    avatar: item.avatar || "",
    focus: Boolean(item.focus),
  }));
}
