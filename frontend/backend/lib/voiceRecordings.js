"use strict";

const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { randomUUID } = require("crypto");
const supabase = require("../db/supabase");

const KINDS = new Set(["dm", "group", "server"]);
const MIN_DURATION_MS = 3000;
const DEDUPE_WINDOW_MS = 30_000;
const LIST_LIMIT = 100;
const CONCAT_LAST_N = 50;
const CONCAT_SIZE_CAP = 180 * 1024 * 1024;
const STORAGE_BUCKET = "media";
const STORAGE_PREFIX = "voice-recordings";
const MP3_BITRATE = "192k";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

function uniqueUuids(list) {
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(list) ? list : []) {
    const id = String(raw || "").trim();
    if (!isUuid(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function uniqueNames(list) {
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(list) ? list : []) {
    const name = String(raw || "").trim().slice(0, 64);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push(name);
  }
  return out.slice(0, 40);
}

function parseKind(value) {
  const k = String(value || "").trim().toLowerCase();
  return KINDS.has(k) ? k : null;
}

function parseDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatTrWhen(iso) {
  const d = parseDate(iso) || new Date();
  try {
    return new Intl.DateTimeFormat("tr-TR", {
      timeZone: "Europe/Istanbul",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

function formatDurationTr(ms) {
  const totalSec = Math.max(0, Math.round(Number(ms) || 0) / 1000);
  const rounded = Math.round(totalSec);
  const h = Math.floor(rounded / 3600);
  const m = Math.floor((rounded % 3600) / 60);
  const s = rounded % 60;
  const parts = [];
  if (h) parts.push(`${h} saat`);
  if (m) parts.push(`${m} dakika`);
  if (s || !parts.length) parts.push(`${s} saniye`);
  return parts.join(" ");
}

function joinNamesTr(names) {
  const n = uniqueNames(names);
  if (!n.length) return "bilinmeyen katılımcılar";
  if (n.length === 1) return n[0];
  if (n.length === 2) return `${n[0]} ve ${n[1]}`;
  return `${n.slice(0, -1).join(", ")} ve ${n[n.length - 1]}`;
}

/**
 * Quality Turkish sentence for the admin archive: which room, who, when, duration.
 */
function buildDescription(input = {}) {
  const kind = parseKind(input.kind) || "dm";
  const when = formatTrWhen(input.startedAt || input.started_at);
  const dur = formatDurationTr(input.durationMs ?? input.duration_ms ?? 0);
  const people = joinNamesTr(input.participantUsernames || input.participant_usernames);
  if (kind === "dm") {
    return `Özel (DM) sesli görüşme: ${people} arasında, ${when} tarihinde başladı; süre ${dur}.`;
  }
  if (kind === "group") {
    const g = String(input.groupName || input.group_name || "").trim() || "Adsız grup";
    return `Grup sesli görüşmesi: “${g}” odasında ${people}; ${when} tarihinde başladı, süre ${dur}.`;
  }
  const server = String(input.serverName || input.server_name || "").trim() || "Sunucu";
  const channel = String(input.channelName || input.channel_name || "").trim() || "ses kanalı";
  return `Sunucu sesli sohbeti: ${server} sunucusunda “${channel}” kanalında ${people}; ${when} tarihinde başladı, süre ${dur}.`;
}

function buildTitle(input = {}) {
  const kind = parseKind(input.kind) || "dm";
  const people = uniqueNames(input.participantUsernames || input.participant_usernames);
  if (kind === "dm") {
    const label = people.length ? people.join(" · ") : "DM";
    return `DM · ${label}`;
  }
  if (kind === "group") {
    const g = String(input.groupName || input.group_name || "").trim() || "Grup";
    return `Grup · ${g}`;
  }
  const server = String(input.serverName || input.server_name || "").trim() || "Sunucu";
  const channel = String(input.channelName || input.channel_name || "").trim();
  return channel ? `Sunucu · ${server} / ${channel}` : `Sunucu · ${server}`;
}

function publicRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    title: row.title,
    description: row.description,
    dmPeerIds: row.dm_peer_ids || [],
    groupId: row.group_id || null,
    groupName: row.group_name || null,
    serverId: row.server_id || null,
    serverName: row.server_name || null,
    channelId: row.channel_id || null,
    channelName: row.channel_name || null,
    participantIds: row.participant_ids || [],
    participantUsernames: row.participant_usernames || [],
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationMs: row.duration_ms,
    byteSize: row.byte_size,
    sourceMime: row.source_mime,
    livekitEgressId: row.livekit_egress_id || null,
    createdBy: row.created_by,
    error: row.error || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    hasAudio: Boolean(row.storage_path) && row.status === "ready",
  };
}

function extFromMime(mime) {
  const m = String(mime || "").toLowerCase();
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  if (m.includes("wav")) return "wav";
  if (m.includes("ogg")) return "ogg";
  if (m.includes("mp4") || m.includes("m4a") || m.includes("aac")) return "m4a";
  if (m.includes("webm")) return "webm";
  return "webm";
}

function sameUuidSet(a, b) {
  const aa = uniqueUuids(a);
  const bb = uniqueUuids(b);
  if (aa.length !== bb.length || !aa.length) return false;
  const set = new Set(aa);
  return bb.every((id) => set.has(id));
}

function runFfmpeg(args, { cwd } = {}) {
  return new Promise((resolve, reject) => {
    let proc;
    try {
      proc = spawn("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...args], {
        cwd: cwd || undefined,
      });
    } catch (e) {
      reject(e);
      return;
    }
    let err = "";
    if (proc.stderr) {
      proc.stderr.on("data", (d) => {
        err += d.toString();
      });
    }
    proc.on("error", (e) => reject(e));
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error((err || "ffmpeg failed").trim().slice(0, 400)));
    });
  });
}

async function transcodeBufferToMp3(buffer, sourceMime) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "descall-vr-"));
  const inPath = path.join(dir, `in.${extFromMime(sourceMime)}`);
  const outPath = path.join(dir, "out.mp3");
  try {
    fs.writeFileSync(inPath, buffer);
    await runFfmpeg([
      "-i",
      inPath,
      "-vn",
      "-acodec",
      "libmp3lame",
      "-b:a",
      MP3_BITRATE,
      "-ar",
      "44100",
      "-ac",
      "2",
      outPath,
    ]);
    return fs.readFileSync(outPath);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function fetchUsernames(ids) {
  const list = uniqueUuids(ids);
  if (!list.length) return [];
  const { data, error } = await supabase
    .from("users")
    .select("id, username, display_name")
    .in("id", list);
  if (error) {
    console.warn("[voiceRecordings] usernames:", error.message);
    return [];
  }
  const byId = new Map((data || []).map((u) => [u.id, u]));
  return list.map((id) => {
    const u = byId.get(id);
    return u?.username || u?.display_name || null;
  }).filter(Boolean);
}

async function enrichMeta(meta) {
  const kind = parseKind(meta.kind);
  const participantIds = uniqueUuids(meta.participantIds || meta.participant_ids);
  let participantUsernames = uniqueNames(meta.participantUsernames || meta.participant_usernames);
  if (participantIds.length && participantUsernames.length < participantIds.length) {
    const fromDb = await fetchUsernames(participantIds);
    if (fromDb.length) participantUsernames = uniqueNames([...participantUsernames, ...fromDb]);
  }

  let groupName = String(meta.groupName || meta.group_name || "").trim() || null;
  let serverName = String(meta.serverName || meta.server_name || "").trim() || null;
  let channelName = String(meta.channelName || meta.channel_name || "").trim() || null;
  const groupId = isUuid(meta.groupId || meta.group_id) ? (meta.groupId || meta.group_id) : null;
  const serverId = isUuid(meta.serverId || meta.server_id) ? (meta.serverId || meta.server_id) : null;
  const channelId = isUuid(meta.channelId || meta.channel_id) ? (meta.channelId || meta.channel_id) : null;
  const dmPeerIds = uniqueUuids(meta.dmPeerIds || meta.dm_peer_ids || (kind === "dm" ? participantIds : []));

  if (kind === "group" && groupId && !groupName) {
    const { data } = await supabase.from("groups").select("name").eq("id", groupId).maybeSingle();
    groupName = data?.name || groupName;
  }
  if (kind === "server") {
    if (serverId && !serverName) {
      const { data } = await supabase.from("servers").select("name").eq("id", serverId).maybeSingle();
      serverName = data?.name || serverName;
    }
    if (channelId && !channelName) {
      const { data } = await supabase
        .from("server_channels")
        .select("name, server_id")
        .eq("id", channelId)
        .maybeSingle();
      channelName = data?.name || channelName;
    }
  }

  const startedAt = parseDate(meta.startedAt || meta.started_at) || new Date();
  const endedAt = parseDate(meta.endedAt || meta.ended_at) || new Date();
  let durationMs = Number(meta.durationMs ?? meta.duration_ms);
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    durationMs = Math.max(0, endedAt.getTime() - startedAt.getTime());
  }

  const packed = {
    kind,
    dmPeerIds,
    groupId,
    groupName,
    serverId,
    serverName,
    channelId,
    channelName,
    participantIds,
    participantUsernames,
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    durationMs: Math.round(durationMs),
  };
  packed.title = buildTitle(packed);
  packed.description = buildDescription(packed);
  return packed;
}


/** Auth'd uploader may send a 1-peer snapshot if the other id was cleared on hangup. */
function dmUploaderAllowed(userId, dmPeerIds) {
  if (!userId) return false;
  const peers = uniqueUuids(dmPeerIds);
  if (!peers.length) return true;
  return peers.includes(userId);
}

async function verifyMembership(userId, meta) {
  const kind = meta.kind;
  if (!userId || !kind) {
    const err = new Error("Not a participant of this voice session.");
    err.code = "FORBIDDEN";
    err.status = 403;
    throw err;
  }
  if (kind === "dm") {
    if (!dmUploaderAllowed(userId, meta.dmPeerIds)) {
      const err = new Error("You are not a participant of this DM call.");
      err.code = "FORBIDDEN";
      err.status = 403;
      throw err;
    }
    return;
  }
  if (kind === "group") {
    if (!meta.groupId) {
      const err = new Error("groupId is required.");
      err.code = "BAD_REQUEST";
      err.status = 400;
      throw err;
    }
    const { data, error } = await supabase
      .from("group_members")
      .select("user_id")
      .eq("group_id", meta.groupId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      const err = new Error("You are not a member of this group.");
      err.code = "FORBIDDEN";
      err.status = 403;
      throw err;
    }
    return;
  }
  if (!meta.serverId && !meta.channelId) {
    const err = new Error("serverId or channelId is required.");
    err.code = "BAD_REQUEST";
    err.status = 400;
    throw err;
  }
  let serverId = meta.serverId;
  if (!serverId && meta.channelId) {
    const { data: ch } = await supabase
      .from("server_channels")
      .select("server_id")
      .eq("id", meta.channelId)
      .maybeSingle();
    serverId = ch?.server_id || null;
    meta.serverId = serverId;
  }
  if (!serverId) {
    const err = new Error("Voice channel not found.");
    err.code = "NOT_FOUND";
    err.status = 404;
    throw err;
  }
  const { data, error } = await supabase
    .from("server_members")
    .select("user_id")
    .eq("server_id", serverId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    const err = new Error("You are not a member of this server.");
    err.code = "FORBIDDEN";
    err.status = 403;
    throw err;
  }
}

async function findDuplicate(meta) {
  const started = parseDate(meta.startedAt);
  if (!started) return null;
  const from = new Date(started.getTime() - DEDUPE_WINDOW_MS).toISOString();
  const to = new Date(started.getTime() + DEDUPE_WINDOW_MS).toISOString();
  let q = supabase
    .from("voice_recordings")
    .select("*")
    .eq("kind", meta.kind)
    .in("status", ["ready", "processing"])
    .gte("started_at", from)
    .lte("started_at", to)
    .order("started_at", { ascending: false })
    .limit(20);
  if (meta.kind === "group" && meta.groupId) q = q.eq("group_id", meta.groupId);
  if (meta.kind === "server" && meta.channelId) q = q.eq("channel_id", meta.channelId);
  const { data, error } = await q;
  if (error) {
    console.warn("[voiceRecordings] dedupe:", error.message);
    return null;
  }
  const rows = data || [];
  if (meta.kind === "dm") {
    return rows.find((r) => sameUuidSet(r.dm_peer_ids, meta.dmPeerIds)) || null;
  }
  if (meta.kind === "group") {
    return rows.find((r) => r.group_id === meta.groupId) || null;
  }
  return rows.find((r) => r.channel_id === meta.channelId || r.server_id === meta.serverId) || null;
}

async function uploadMp3(kind, id, buffer) {
  const storagePath = `${STORAGE_PREFIX}/${kind}/${id}.mp3`;
  const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(storagePath, buffer, {
    contentType: "audio/mpeg",
    upsert: true,
  });
  if (error) throw error;
  return storagePath;
}

async function downloadStored(storagePath) {
  const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(storagePath);
  if (error || !data) {
    const err = new Error(error?.message || "Recording file missing.");
    err.code = "NOT_FOUND";
    err.status = 404;
    throw err;
  }
  return Buffer.from(await data.arrayBuffer());
}

/**
 * Transcode uploaded audio to 192k MP3, store under voice-recordings/, insert row.
 * Dedupes sessions within ±30s for the same room.
 */
async function saveRecording({ userId, buffer, sourceMime, meta: rawMeta }) {
  if (!buffer || !buffer.length) {
    const err = new Error("No audio uploaded.");
    err.code = "BAD_REQUEST";
    err.status = 400;
    throw err;
  }
  const kind = parseKind(rawMeta?.kind);
  if (!kind) {
    const err = new Error("kind must be dm, group, or server.");
    err.code = "BAD_REQUEST";
    err.status = 400;
    throw err;
  }
  const meta = await enrichMeta({ ...rawMeta, kind });
  await verifyMembership(userId, meta);
  if (meta.durationMs < MIN_DURATION_MS) {
    const err = new Error("Recording is shorter than 3 seconds.");
    err.code = "TOO_SHORT";
    err.status = 400;
    throw err;
  }

  const dup = await findDuplicate(meta);
  if (dup) return { row: dup, duplicate: true };

  const id = randomUUID();
  const now = new Date().toISOString();
  const insertRow = {
    id,
    kind: meta.kind,
    status: "processing",
    title: meta.title,
    description: meta.description,
    dm_peer_ids: meta.kind === "dm" ? meta.dmPeerIds : null,
    group_id: meta.groupId,
    group_name: meta.groupName,
    server_id: meta.serverId,
    server_name: meta.serverName,
    channel_id: meta.channelId,
    channel_name: meta.channelName,
    participant_ids: meta.participantIds,
    participant_usernames: meta.participantUsernames,
    started_at: meta.startedAt,
    ended_at: meta.endedAt,
    duration_ms: meta.durationMs,
    source_mime: sourceMime || "application/octet-stream",
    created_by: userId || null,
    created_at: now,
    updated_at: now,
  };
  const { error: insertErr } = await supabase.from("voice_recordings").insert(insertRow);
  if (insertErr) throw insertErr;

  try {
    const mp3 = await transcodeBufferToMp3(buffer, sourceMime);
    const storagePath = await uploadMp3(kind, id, mp3);
    const patch = {
      status: "ready",
      storage_path: storagePath,
      byte_size: mp3.length,
      source_mime: "audio/mpeg",
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from("voice_recordings")
      .update(patch)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    return { row: data, duplicate: false };
  } catch (err) {
    await supabase
      .from("voice_recordings")
      .update({
        status: "failed",
        error: String(err.message || err).slice(0, 500),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    throw err;
  }
}

async function listRecordings({ kind, limit } = {}) {
  const capped = Math.min(Math.max(Number(limit) || LIST_LIMIT, 1), 200);
  let q = supabase
    .from("voice_recordings")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(capped);
  const parsed = parseKind(kind);
  if (parsed) q = q.eq("kind", parsed);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(publicRow);
}

async function getRecording(id) {
  if (!isUuid(id)) return null;
  const { data, error } = await supabase.from("voice_recordings").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data || null;
}

async function concatKindToMp3(kind) {
  const parsed = parseKind(kind);
  if (!parsed) {
    const err = new Error("kind must be dm, group, or server.");
    err.code = "BAD_REQUEST";
    err.status = 400;
    throw err;
  }
  const { data, error } = await supabase
    .from("voice_recordings")
    .select("id, storage_path, byte_size, started_at, status")
    .eq("kind", parsed)
    .eq("status", "ready")
    .not("storage_path", "is", null)
    .order("started_at", { ascending: false })
    .limit(CONCAT_LAST_N);
  if (error) throw error;
  const newestFirst = data || [];
  if (!newestFirst.length) {
    const err = new Error("No recordings for this kind.");
    err.code = "NOT_FOUND";
    err.status = 404;
    throw err;
  }

  const chronological = [];
  let bytes = 0;
  for (const row of newestFirst) {
    const sz = Number(row.byte_size) || 0;
    if (chronological.length && bytes + sz > CONCAT_SIZE_CAP) continue;
    chronological.push(row);
    bytes += sz;
  }
  chronological.reverse();

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "descall-vr-cat-"));
  try {
    const silencePath = path.join(dir, "silence.mp3");
    await runFfmpeg([
      "-f",
      "lavfi",
      "-i",
      "anullsrc=r=44100:cl=stereo",
      "-t",
      "1",
      "-acodec",
      "libmp3lame",
      "-b:a",
      MP3_BITRATE,
      silencePath,
    ]);

    const parts = [];
    for (let i = 0; i < chronological.length; i += 1) {
      const row = chronological[i];
      const buf = await downloadStored(row.storage_path);
      const p = path.join(dir, `${String(i).padStart(3, "0")}.mp3`);
      fs.writeFileSync(p, buf);
      parts.push(p);
    }

    const listPath = path.join(dir, "list.txt");
    const lines = [];
    parts.forEach((p, i) => {
      lines.push(`file '${p.replace(/'/g, "'\\''")}'`);
      if (i < parts.length - 1) lines.push(`file '${silencePath.replace(/'/g, "'\\''")}'`);
    });
    fs.writeFileSync(listPath, lines.join("\n"));
    const outPath = path.join(dir, "export.mp3");
    await runFfmpeg([
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listPath,
      "-acodec",
      "libmp3lame",
      "-b:a",
      MP3_BITRATE,
      "-ar",
      "44100",
      "-ac",
      "2",
      outPath,
    ]);
    return {
      buffer: fs.readFileSync(outPath),
      count: parts.length,
      kind: parsed,
    };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function downloadFilename(row) {
  const when = parseDate(row.started_at);
  const stamp = when
    ? when
        .toLocaleString("sv-SE", { timeZone: "Europe/Istanbul" })
        .replace(/[: ]/g, "-")
        .slice(0, 16)
    : "session";
  const raw = `${row.kind || "voice"}-${row.title || "recording"}-${stamp}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return `${raw || "descall-voice"}.mp3`;
}

module.exports = {
  KINDS,
  MIN_DURATION_MS,
  DEDUPE_WINDOW_MS,
  CONCAT_LAST_N,
  CONCAT_SIZE_CAP,
  isUuid,
  parseKind,
  buildDescription,
  buildTitle,
  publicRow,
  enrichMeta,
  verifyMembership,
  findDuplicate,
  saveRecording,
  listRecordings,
  getRecording,
  concatKindToMp3,
  downloadStored,
  downloadFilename,
  uniqueUuids,
  dmUploaderAllowed,
};
