/**
 * "Paylaş > Descall" share sheet (draft A, "Hızlı cam sayfa"): pure rules shared by the
 * React sheet (Android share target, web) and mirrored one to one by the iOS share
 * extension (ios/App/DescallShare/ShareLogic.swift) and the Android worker
 * (android/.../share/ShareJob.java). No DOM, no network.
 *
 * Targets come from GET /api/native/share/targets (backend/lib/shareTargets.js): every
 * conversation is "dm:<id>", "group:<id>" or "channel:<id>".
 */

export const MAX_TARGETS = 12;
export const MAX_ITEMS = 10;
export const MAX_TEXT = 2000;
export const MAX_FILE_BYTES = 100 * 1024 * 1024;
export const UNDO_SECONDS = 10;
export const DUPLICATE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export const HISTORY_MAX = 200;
export const QUALITIES = Object.freeze(["original", "high", "saver"]);
export const TABS = Object.freeze(["all", "friends", "groups", "servers"]);

/** Image long edge and JPEG quality per preset (same numbers on iOS and Android). */
export const QUALITY_SPEC = Object.freeze({
  original: Object.freeze({ maxEdge: 0, jpeg: 0.92, video: "original" }),
  high: Object.freeze({ maxEdge: 2560, jpeg: 0.82, video: "1080p" }),
  saver: Object.freeze({ maxEdge: 1280, jpeg: 0.7, video: "720p" }),
});

/** Case and accent folded, Turkish dotless i included ("Yılmaz" matches "yilmaz"). */
export function fold(s) {
  return String(s || "")
    .toLocaleLowerCase("tr-TR")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i");
}

export function parseConv(conv) {
  const m = /^(dm|group|channel):([0-9A-Za-z-]{1,64})$/.exec(String(conv || ""));
  return m ? { type: m[1], id: m[2] } : null;
}

// ── Formatting ────────────────────────────────────────────────────────────────

/** "14,8 MB" (tr), "14.8 MB" (en). Below 1 MB in KB, below 1 KB in bytes. */
export function formatBytes(n, intl = "tr-TR") {
  const v = Math.max(0, Number(n) || 0);
  const fmt = (x, d) => new Intl.NumberFormat(intl, { minimumFractionDigits: d, maximumFractionDigits: d }).format(x);
  if (v >= 1024 * 1024 * 1024) return `${fmt(v / (1024 * 1024 * 1024), 1)} GB`;
  if (v >= 1024 * 1024) return `${fmt(v / (1024 * 1024), v >= 100 * 1024 * 1024 ? 0 : 1)} MB`;
  if (v >= 1024) return `${fmt(v / 1024, 0)} KB`;
  return `${fmt(v, 0)} B`;
}

/** 0:14, 1:02:09 */
export function formatDuration(ms) {
  const s = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/** "today" | "yesterday" | "days" (with n) for "En son sen paylaştın · dün". */
export function relativeDay(at, now = Date.now()) {
  const t = Date.parse(String(at || ""));
  if (!Number.isFinite(t)) return null;
  const a = new Date(t);
  const b = new Date(now);
  const day = (d) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.round((day(b) - day(a)) / 86400000);
  if (diff <= 0) return { key: "today", n: 0 };
  if (diff === 1) return { key: "yesterday", n: 1 };
  return { key: "days", n: diff };
}

export function firstName(name) {
  const s = String(name || "").trim();
  return s.split(/\s+/)[0] || s;
}

// ── Items and quality ─────────────────────────────────────────────────────────

/** Kind of a shared item from its MIME type (link / text items come typed). */
export function kindOf(item) {
  if (item?.kind === "link" || item?.kind === "text") return item.kind;
  const m = String(item?.mime || "").toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  return "file";
}

/** Items that become an upload (link / text go into the message). */
export function isUpload(item) {
  const k = kindOf(item);
  return k === "image" || k === "video" || k === "file";
}

/**
 * Bytes per quality for one item. `estimates` comes from the platform (exact for images,
 * an estimate for videos, the file size for documents); without it every preset is the
 * original size.
 */
export function itemBytes(item, quality = "high") {
  if (!isUpload(item)) return 0;
  const est = item?.estimates || {};
  const orig = Math.max(0, Number(est.original ?? item?.size) || 0);
  const k = kindOf(item);
  if (k === "file") return orig;
  const v = Number(est[quality]);
  return Number.isFinite(v) && v > 0 ? Math.min(v, orig || v) : orig;
}

export function totals(items = [], quality = "high") {
  let original = 0;
  let chosen = 0;
  for (const it of items) {
    if (!isUpload(it)) continue;
    original += itemBytes(it, "original");
    chosen += itemBytes(it, quality);
  }
  const saved = original > 0 ? Math.max(0, Math.round((1 - chosen / original) * 100)) : 0;
  return { original, chosen, savedPercent: saved };
}

/** Why an item cannot be sent (null when it can). */
export function itemProblem(item, { allowedMimes = null, quality = "high" } = {}) {
  if (!isUpload(item)) return null;
  const bytes = itemBytes(item, quality);
  if (bytes > MAX_FILE_BYTES) return "too_large";
  const k = kindOf(item);
  // The platform could not convert it (an Android video that is not MP4 / WebM).
  if (item?.unsupported) return "type";
  // Images and videos are converted on the phone (HEIC → JPEG, MOV → MP4); files go as they are.
  if (k === "file" && Array.isArray(allowedMimes) && allowedMimes.length && !allowedMimes.includes(String(item.mime || "").toLowerCase())) return "type";
  return null;
}

export function hasMedia(items = []) {
  return items.some((it) => ["image", "video"].includes(kindOf(it)));
}

export function hasUploads(items = []) {
  return items.some(isUpload);
}

/** "4 fotoğraf, 1 video" style counts for the header / notification. */
export function countKinds(items = []) {
  const out = { image: 0, video: 0, file: 0, link: 0, text: 0 };
  for (const it of items) out[kindOf(it)] += 1;
  return out;
}

/** The message that goes with the share: typed text plus shared links / text, deduped. */
export function composeText(message, items = []) {
  const parts = [];
  const typed = String(message || "").trim();
  if (typed) parts.push(typed);
  for (const it of items) {
    const k = kindOf(it);
    const v = String((k === "link" ? it.url : k === "text" ? it.text : "") || "").trim();
    if (v && !parts.some((p) => p.includes(v))) parts.push(v);
  }
  return parts.join("\n").slice(0, MAX_TEXT);
}

// ── Targets ───────────────────────────────────────────────────────────────────

/** conv → entry for friends, groups and channels of a /targets payload. */
export function indexTargets(t) {
  const map = new Map();
  for (const f of t?.friends || []) map.set(f.conv, f);
  for (const g of t?.groups || []) map.set(g.conv, g);
  for (const s of t?.servers || []) for (const c of s.channels || []) map.set(c.conv, c);
  return map;
}

/** Can this conversation take this share? → { ok, reason } (reason is a target reason code). */
export function targetVerdict(entry, { hasFiles = false } = {}) {
  if (!entry) return { ok: false, reason: "unknown" };
  if (entry.canSend === false) return { ok: false, reason: entry.reason || "no_permission" };
  if (hasFiles && entry.canAttach === false) return { ok: false, reason: "no_attach" };
  return { ok: true, reason: null };
}

function matchEntry(e, q) {
  const needle = fold(q).trim();
  if (!needle) return true;
  return [e.name, e.username, e.serverName].some((f) => fold(f).includes(needle));
}

/**
 * The list under the tabs. → [{ key, rows: [entry], server? }]:
 *  all:      ios: friends, groups, server channels (recent / sendable ones)
 *            android: "suggested" (recents) first, then friends, groups, channels
 *  friends / groups: one section
 *  servers:  one section per server (channels in it, disabled ones locked)
 *  a query searches everything, sections by kind.
 */
export function buildSections(t, { tab = "all", query = "", variant = "ios", selected = [] } = {}) {
  if (!t) return [];
  const q = String(query || "").trim();
  const friends = (t.friends || []).filter((e) => matchEntry(e, q));
  const groups = (t.groups || []).filter((e) => matchEntry(e, q));
  const servers = (t.servers || []).map((s) => ({ ...s, channels: (s.channels || []).filter((c) => matchEntry(c, q) || (q && fold(s.name).includes(fold(q)))) })).filter((s) => s.channels.length);
  const channelPicks = () => {
    if (q) return servers.flatMap((s) => s.channels);
    const recent = new Set(t.recents || []);
    const picked = [];
    for (const s of servers) for (const c of s.channels) if (c.canSend && (recent.has(c.conv) || selected.includes(c.conv) || c.lastShared)) picked.push(c);
    return picked.slice(0, 8);
  };
  if (tab === "friends") return friends.length ? [{ key: "friends", rows: friends }] : [];
  if (tab === "groups") return groups.length ? [{ key: "groups", rows: groups }] : [];
  if (tab === "servers") return servers.map((s) => ({ key: `server:${s.id}`, server: s, rows: s.channels }));
  const out = [];
  if (variant === "android" && !q) {
    const idx = indexTargets(t);
    const suggested = [...new Set([...(selected || []), ...(t.recents || [])])].map((c) => idx.get(c)).filter(Boolean).slice(0, 4);
    const taken = new Set(suggested.map((e) => e.conv));
    if (suggested.length) out.push({ key: "suggested", rows: suggested });
    const fr = friends.filter((e) => !taken.has(e.conv));
    if (fr.length) out.push({ key: "friends", rows: fr });
    const gr = groups.filter((e) => !taken.has(e.conv));
    if (gr.length) out.push({ key: "groups", rows: gr });
    const ch = channelPicks().filter((e) => !taken.has(e.conv));
    if (ch.length) out.push({ key: "channels", rows: ch });
    return out;
  }
  if (friends.length) out.push({ key: "friends", rows: friends });
  if (groups.length) out.push({ key: "groups", rows: groups });
  const ch = channelPicks();
  if (ch.length) out.push({ key: "channels", rows: ch });
  return out;
}

/** Recent conversations for the avatar row (sendable ones, at most 8). */
export function recentEntries(t, max = 8) {
  const idx = indexTargets(t);
  return (t?.recents || []).map((c) => idx.get(c)).filter((e) => e && e.canSend !== false).slice(0, max);
}

/**
 * Second line of a row. → { key, vars } (i18n key under shareSheet.row.*).
 * presence for friends, members for groups, the verdict / slow mode / last share for channels.
 */
export function rowSubtitle(e, { hasFiles = false, now = Date.now() } = {}) {
  const shared = e?.lastShared ? relativeDay(e.lastShared.at, now) : null;
  if (e?.kind === "channel") {
    const v = targetVerdict(e, { hasFiles });
    if (!v.ok) return { key: `reason.${v.reason}` };
    if (e.slowModeSec) return { key: "row.slowMode", vars: { seconds: e.slowModeSec } };
    if (shared) return { key: `row.lastShared.${shared.key}`, vars: { count: shared.n } };
    return { key: "row.channel" };
  }
  if (e?.kind === "group") {
    if (shared && e.lastShared.mediaCount) return { key: `row.groupShared.${shared.key}`, vars: { members: e.memberCount || 0, count: e.lastShared.mediaCount, days: shared.n } };
    return { key: e.onlineCount ? "row.membersOnline" : "row.members", vars: { members: e.memberCount || 0, online: e.onlineCount || 0 } };
  }
  const presence = e?.presence || "offline";
  if (shared && e.lastShared.mediaCount) return { key: `row.dmShared.${shared.key}`, vars: { presence, count: e.lastShared.mediaCount, days: shared.n } };
  return { key: `presence.${presence}` };
}

export function toggleTarget(selected = [], conv, { max = MAX_TARGETS } = {}) {
  if (selected.includes(conv)) return { selected: selected.filter((c) => c !== conv), limited: false };
  if (selected.length >= max) return { selected, limited: true };
  return { selected: [...selected, conv], limited: false };
}

/** Deep link that opens a conversation in the app (src/lib/deepLinks.js routes). */
export function deepLinkFor(entry) {
  const enc = (s) => encodeURIComponent(String(s || ""));
  if (!entry) return "descall://open";
  if (entry.kind === "dm") return entry.username ? `descall://dm/${enc(entry.username)}` : "descall://friends";
  if (entry.kind === "group") return `descall://group/${enc(entry.id)}`;
  if (entry.kind === "channel") return `descall://server/${enc(entry.serverId)}/${enc(entry.id)}`;
  return "descall://open";
}

// ── Scheduling ────────────────────────────────────────────────────────────────

/** Quick picks for "Zamanla": in 1 hour, this evening 20:00 (before 19:00), tomorrow 09:00. */
export function schedulePresets(now = Date.now()) {
  const d = new Date(now);
  const out = [{ key: "inHour", at: now + 60 * 60 * 1000 }];
  if (d.getHours() < 19) {
    const ev = new Date(d);
    ev.setHours(20, 0, 0, 0);
    out.push({ key: "tonight", at: ev.getTime() });
  }
  const tm = new Date(d);
  tm.setDate(tm.getDate() + 1);
  tm.setHours(9, 0, 0, 0);
  out.push({ key: "tomorrow", at: tm.getTime() });
  return out;
}

/** A schedule time the backend takes: 1 minute to 366 days ahead. */
export function validScheduleTime(at, now = Date.now()) {
  const t = Number(at);
  return Number.isFinite(t) && t - now >= 60 * 1000 && t - now <= 366 * 24 * 60 * 60 * 1000;
}

// ── Duplicate warning (device history + server precheck) ─────────────────────

/** A cheap fingerprint of a shared item: kind, size and name (or the normalized URL). */
export function fingerprint(item) {
  const k = kindOf(item);
  if (k === "link") return `link:${normalizeLink(item.url) || ""}`;
  if (k === "text") return null;
  if (item?.hash) return `${k}:h:${item.hash}`;
  const size = Number(item?.estimates?.original ?? item?.size) || 0;
  return size ? `${k}:${size}:${fold(item?.name || "")}` : null;
}

export function normalizeLink(raw) {
  let u;
  try {
    u = new URL(String(raw || "").trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const params = [...u.searchParams.entries()]
    .filter(([k]) => !/^(utm_|fbclid$|gclid$|igshid$|si$|mc_eid$|ref_src$)/i.test(k))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const q = params.length ? `?${params.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&")}` : "";
  return `${host}${u.pathname.replace(/\/+$/, "")}${q}`;
}

/** history: [{ conv, fp, at }] newest first; add one entry per (conv, item). */
export function recordHistory(history = [], { convs = [], items = [], at = Date.now() } = {}) {
  const add = [];
  for (const conv of convs) for (const it of items) {
    const fp = fingerprint(it);
    if (fp) add.push({ conv, fp, at });
  }
  return [...add, ...(Array.isArray(history) ? history : [])].filter((h) => at - h.at <= DUPLICATE_WINDOW_MS).slice(0, HISTORY_MAX);
}

/**
 * First duplicate per conversation from the device history and the server precheck.
 * → [{ conv, kind: "link" | "file", at }] (newest kind wins per conv).
 */
export function duplicates({ history = [], items = [], convs = [], precheck = null, now = Date.now() } = {}) {
  const fps = new Map();
  for (const it of items) {
    const fp = fingerprint(it);
    if (fp) fps.set(fp, kindOf(it) === "link" ? "link" : "file");
  }
  const out = new Map();
  for (const h of history || []) {
    if (!convs.includes(h.conv) || now - h.at > DUPLICATE_WINDOW_MS || !fps.has(h.fp)) continue;
    const cur = out.get(h.conv);
    if (!cur || h.at > cur.at) out.set(h.conv, { conv: h.conv, kind: fps.get(h.fp), at: h.at });
  }
  for (const conv of convs) {
    const d = precheck?.[conv]?.duplicate;
    if (!d) continue;
    const at = Date.parse(d.at);
    const cur = out.get(conv);
    if (Number.isFinite(at) && (!cur || at > cur.at)) out.set(conv, { conv, kind: d.kind === "link" ? "link" : "file", at });
  }
  return convs.map((c) => out.get(c)).filter(Boolean);
}

// ── Send job (the same state machine on iOS and the Android worker) ──────────

let seq = 0;
export function newId(prefix = "sh") {
  seq = (seq + 1) % 1e6;
  const rnd = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${seq.toString(36)}-${rnd}`;
}

/**
 * A send job. items: the upload items (kind, name, bytes for the chosen quality);
 * targets: [{ conv, name, kind, ... }]. Text and links ride on the first message.
 */
export function createJob({ id = newId(), items = [], targets = [], text = "", silent = false, sendAt = null, quality = "high", stripLocation = true, now = Date.now() } = {}) {
  const uploads = items.filter(isUpload);
  return {
    id,
    createdAt: now,
    startedAt: null,
    finishedAt: null,
    text: composeText(text, items),
    silent: Boolean(silent),
    sendAt: sendAt ? Number(sendAt) : null,
    quality,
    stripLocation: Boolean(stripLocation),
    status: "queued",
    offline: false,
    items: uploads.map((it, i) => ({
      index: i,
      id: it.id || `i${i}`,
      kind: kindOf(it),
      name: it.name || "",
      thumb: it.thumb || null,
      bytes: itemBytes(it, quality),
      sentBytes: 0,
      status: "pending", // pending | uploading | uploaded | failed | dropped
      url: null,
      error: null,
    })),
    targets: targets.map((tg) => ({
      conv: tg.conv,
      kind: tg.kind,
      name: tg.name,
      username: tg.username || null,
      serverId: tg.serverId || null,
      avatarUrl: tg.avatarUrl || null,
      initials: tg.initials || null,
      presence: tg.presence || null,
      status: "queued", // queued | sending | sent | scheduled | partial | failed
      textSent: false,
      sentItems: [],
      failedItems: [],
      messageIds: [],
      scheduledIds: [],
      reason: null,
      at: null,
    })),
    undoUntil: null,
    undone: false,
  };
}

const clone = (job) => ({ ...job, items: job.items.map((i) => ({ ...i })), targets: job.targets.map((t) => ({ ...t, sentItems: [...t.sentItems], failedItems: [...t.failedItems], messageIds: [...t.messageIds], scheduledIds: [...t.scheduledIds] })) });

/**
 * Reducer for engine events:
 *  { type: "start", at }                         { type: "offline" } / { type: "online" }
 *  { type: "upload", index, sentBytes }          { type: "uploaded", index, url }
 *  { type: "uploadFailed", index, error }        { type: "targetSending", conv }
 *  { type: "targetResult", conv, results: [{ index, status, messageId?, scheduledId?, reason? }], at }
 *  { type: "targetFailed", conv, reason, at }    { type: "finish", at }
 *  { type: "cancel", at }                        { type: "undone", at }
 *  { type: "retry" } (failed items / targets back to pending, keeps what went through)
 *  { type: "dropFailed" } (give up on failed items: what arrived counts as done)
 */
export function reduceJob(job, ev) {
  if (!job || !ev) return job;
  const j = clone(job);
  const item = (i) => j.items.find((x) => x.index === i);
  const target = (c) => j.targets.find((x) => x.conv === c);
  switch (ev.type) {
    case "start":
      j.status = "running";
      j.offline = false;
      j.startedAt = j.startedAt || ev.at || Date.now();
      return j;
    case "offline":
      j.offline = true;
      if (j.status !== "cancelled") j.status = "waiting";
      return j;
    case "online":
      j.offline = false;
      if (j.status === "waiting") j.status = "running";
      return j;
    case "upload": {
      const it = item(ev.index);
      if (it && it.status !== "uploaded") {
        it.status = "uploading";
        it.sentBytes = Math.max(0, Math.min(it.bytes || Infinity, Number(ev.sentBytes) || 0));
        if (ev.bytes) it.bytes = Number(ev.bytes);
      }
      return j;
    }
    case "uploaded": {
      const it = item(ev.index);
      if (it) {
        it.status = "uploaded";
        it.url = ev.url || it.url;
        if (ev.upload) it.upload = { mediaType: ev.upload.mediaType || null, mimeType: ev.upload.mimeType || null, size: ev.upload.size || null, originalName: ev.upload.originalName || null };
        if (ev.bytes) it.bytes = Number(ev.bytes);
        it.sentBytes = it.bytes;
        it.error = null;
      }
      return j;
    }
    case "uploadFailed": {
      const it = item(ev.index);
      if (it) {
        it.status = "failed";
        it.error = ev.error || "failed";
      }
      return j;
    }
    case "targetSending": {
      const t = target(ev.conv);
      if (t && !["sent", "scheduled"].includes(t.status)) t.status = "sending";
      return j;
    }
    case "targetResult": {
      const t = target(ev.conv);
      if (!t) return j;
      if (ev.textSent) t.textSent = true;
      for (const r of ev.results || []) {
        if (r.status === "sent" || r.status === "scheduled") {
          if (r.index >= 0 && !t.sentItems.includes(r.index)) t.sentItems.push(r.index);
          t.failedItems = t.failedItems.filter((x) => x !== r.index);
          if (r.messageId) t.messageIds.push(r.messageId);
          if (r.scheduledId) t.scheduledIds.push(r.scheduledId);
        } else if (r.index >= 0 && !t.failedItems.includes(r.index)) {
          t.failedItems.push(r.index);
          t.reason = r.reason || t.reason || "failed";
        } else if (r.index < 0) {
          t.reason = r.reason || "failed";
        }
      }
      const anyScheduled = (ev.results || []).some((r) => r.status === "scheduled");
      const anyOk = (ev.results || []).some((r) => r.status === "sent" || r.status === "scheduled");
      const anyFail = (ev.results || []).some((r) => r.status === "failed");
      t.status = anyFail ? (anyOk ? "partial" : "failed") : anyScheduled && j.sendAt ? "scheduled" : "sent";
      t.at = ev.at || Date.now();
      return j;
    }
    case "targetFailed": {
      const t = target(ev.conv);
      if (t) {
        t.status = t.sentItems.length ? "partial" : "failed";
        t.reason = ev.reason || "failed";
        t.at = ev.at || Date.now();
      }
      return j;
    }
    case "finish": {
      j.finishedAt = ev.at || Date.now();
      const s = summarizeJob(j, { now: j.finishedAt });
      j.status = s.phase;
      if ((s.phase === "sent" || s.phase === "scheduled") && !j.undone) j.undoUntil = j.finishedAt + UNDO_SECONDS * 1000;
      return j;
    }
    case "cancel":
      j.status = "cancelled";
      j.finishedAt = ev.at || Date.now();
      return j;
    case "undone":
      j.undone = true;
      j.status = "undone";
      j.undoUntil = null;
      return j;
    case "retry":
      j.status = "running";
      j.finishedAt = null;
      j.undoUntil = null;
      for (const it of j.items) if (it.status === "failed") { it.status = "pending"; it.sentBytes = 0; it.error = null; }
      for (const t of j.targets) if (t.status === "failed" || t.status === "partial" || t.status === "queued" || t.status === "sending") { t.status = "queued"; t.reason = null; }
      return j;
    case "dropFailed":
      for (const it of j.items) if (it.status === "failed") it.status = "dropped";
      for (const t of j.targets) {
        if (t.status === "partial" && t.sentItems.length) {
          t.failedItems = [];
          t.status = "sent";
        }
      }
      return reduceJob(j, { type: "finish", at: ev.at });
    default:
      return j;
  }
}

/** Which items a target still needs (not sent yet, not dropped). */
export function pendingItemsFor(job, conv) {
  const t = job.targets.find((x) => x.conv === conv);
  if (!t) return [];
  return job.items.filter((it) => it.status !== "dropped" && !t.sentItems.includes(it.index)).map((it) => it.index);
}

/**
 * Headline numbers for the progress / result screen.
 * phase: sending | waiting (offline queue) | sent | scheduled | partial | failed | cancelled | undone
 */
export function summarizeJob(job, { now = Date.now() } = {}) {
  const items = job?.items || [];
  const targets = job?.targets || [];
  const totalBytes = items.reduce((a, i) => a + (i.status === "dropped" ? 0 : Number(i.bytes) || 0), 0);
  const sentBytes = items.reduce((a, i) => a + (i.status === "dropped" ? 0 : Math.min(Number(i.bytes) || 0, Number(i.sentBytes) || 0)), 0);
  const uploaded = items.filter((i) => i.status === "uploaded").length;
  const done = targets.filter((t) => t.status === "sent" || t.status === "scheduled").length;
  const failedTargets = targets.filter((t) => t.status === "failed").length;
  const partialTargets = targets.filter((t) => t.status === "partial").length;
  const settled = targets.every((t) => ["sent", "scheduled", "failed", "partial"].includes(t.status));
  // Uploads count for 80 %, the sends for the last 20 %.
  const upFrac = totalBytes > 0 ? sentBytes / totalBytes : items.length ? uploaded / items.length : 1;
  const sendFrac = targets.length ? (done + failedTargets + partialTargets) / targets.length : 1;
  let percent = Math.round((items.length ? upFrac * 0.8 + sendFrac * 0.2 : sendFrac) * 100);
  if (!settled) percent = Math.min(percent, 99);
  const elapsed = job?.startedAt ? Math.max(1, now - job.startedAt) : 0;
  const speed = elapsed && sentBytes ? (sentBytes / elapsed) * 1000 : 0;
  const eta = speed > 0 ? Math.max(1, Math.round((totalBytes - sentBytes) / speed)) : null;
  let phase;
  if (job?.status === "cancelled") phase = "cancelled";
  else if (job?.undone) phase = "undone";
  else if (!settled) phase = job?.offline || job?.status === "waiting" ? "waiting" : "sending";
  else if (failedTargets === targets.length) phase = "failed";
  else if (failedTargets || partialTargets) phase = "partial";
  else if (targets.every((t) => t.status === "scheduled")) phase = "scheduled";
  else phase = "sent";
  const itemsOk = items.filter((it) => it.status !== "dropped" && targets.length && targets.every((t) => t.sentItems.includes(it.index))).length;
  const failedItemSet = new Set(targets.flatMap((t) => t.failedItems));
  return {
    phase,
    percent: Math.max(0, Math.min(100, percent)),
    totalBytes,
    sentBytes,
    speed,
    eta,
    uploaded,
    itemCount: items.filter((i) => i.status !== "dropped").length,
    itemsOk,
    failedItems: [...failedItemSet],
    targetCount: targets.length,
    done,
    failedTargets,
    partialTargets,
    seconds: job?.startedAt && job?.finishedAt ? Math.max(1, Math.round((job.finishedAt - job.startedAt) / 1000)) : null,
    undoLeft: job?.undoUntil ? Math.max(0, Math.ceil((job.undoUntil - now) / 1000)) : 0,
  };
}

/** Per-target progress 0..100 for the "Yükleniyor · %78" rows. */
export function targetProgress(job, conv) {
  const t = job?.targets?.find((x) => x.conv === conv);
  if (!t) return 0;
  if (["sent", "scheduled"].includes(t.status)) return 100;
  const items = (job.items || []).filter((i) => i.status !== "dropped");
  if (!items.length) return t.status === "sending" ? 50 : 0;
  let acc = 0;
  for (const it of items) {
    if (t.sentItems.includes(it.index)) acc += 1;
    else if (it.status === "uploaded") acc += 0.8;
    else if (it.bytes) acc += 0.8 * Math.min(1, (it.sentBytes || 0) / it.bytes);
  }
  return Math.round((acc / items.length) * 100);
}

/** Status badge of an item tile: ok | wait | fail. */
export function itemBadge(job, index) {
  const it = job?.items?.find((x) => x.index === index);
  if (!it) return "wait";
  const targets = job.targets || [];
  if (targets.some((t) => t.failedItems.includes(index)) || it.status === "failed") return "fail";
  if (targets.length && targets.every((t) => t.sentItems.includes(index))) return "ok";
  if (it.status === "uploaded" && !job.offline && !targets.some((t) => t.status === "queued")) return "ok";
  return "wait";
}

/** Map a transport / HTTP failure to what the sheet tells the user. */
export function errorReason(err) {
  const code = String(err?.code || err?.error || "").toLowerCase();
  if (err?.offline || code === "offline" || code === "network") return "offline";
  if (code === "timeout") return "timeout";
  if (code === "unauthorized" || err?.status === 401) return "signed_out";
  if (code === "too_large" || err?.status === 413) return "too_large";
  if (code === "file_type_not_allowed" || err?.status === 415) return "type";
  if (err?.status === 429 || code === "rate_limited") return "rate_limited";
  if (code) return code;
  return "failed";
}
