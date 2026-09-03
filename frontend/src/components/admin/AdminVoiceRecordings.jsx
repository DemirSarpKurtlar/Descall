import { useCallback, useEffect, useState } from "react";
import { Download, Hash, MessageCircle, RefreshCw, Server, Users } from "lucide-react";
import { adminFetch } from "../../api/adminHttp";
import { API_BASE_URL } from "../../config/api";
import { getToken } from "../../lib/storage";
import RippleButton from "../ui/RippleButton";
import { Avatar } from "../ui/Avatar";
import { useLocale, useT } from "../../context/LocaleContext";
import { appDateMs, formatAppDateTime, formatTimeAgo } from "../../lib/datetime";
import AdminVoiceLive from "./AdminVoiceLive";

const KINDS = ["dm", "group", "server"];
const KIND_ICON = { dm: MessageCircle, group: Users, server: Server };

const COPY = {
  en: {
    title: "Voice recordings",
    live: "Live",
    archive: "Recordings",
    subtitle: "Download every voice chat as a quality MP3 — DM, group, and server rooms.",
    downloadAll: "Download all MP3",
    downloadMp3: "Download MP3",
    empty: "No recordings in this tab yet.",
    loading: "Loading recordings…",
    unknownPlace: "Unknown room",
    unknownUser: "Unknown",
    noUsers: "No participants listed",
    count: "{count} recordings",
    downloading: "Downloading…",
    downloadFailed: "Could not download MP3.",
    newestFirst: "Newest first",
    processing: "Processing",
    dm: "DM",
    group: "Grup",
    server: "Server",
    dmPlace: "Direct message",
    groupPlace: "Group",
    serverPlace: "Server",
  },
  tr: {
    title: "Ses kayıtları",
    live: "Canlı",
    archive: "Kayıtlar",
    subtitle: "Her sesli sohbeti kaliteli MP3 olarak indir — DM, grup ve sunucu.",
    downloadAll: "Tümünü MP3 indir",
    downloadMp3: "MP3 indir",
    empty: "Bu sekmede henüz kayıt yok.",
    loading: "Kayıtlar yükleniyor…",
    unknownPlace: "Bilinmeyen oda",
    unknownUser: "Bilinmiyor",
    noUsers: "Katılımcı yok",
    count: "{count} kayıt",
    downloading: "İndiriliyor…",
    downloadFailed: "MP3 indirilemedi.",
    newestFirst: "Yeniden eskiye",
    processing: "Hazırlanıyor",
    dm: "DM",
    group: "Grup",
    server: "Server",
    dmPlace: "Direkt mesaj",
    groupPlace: "Grup",
    serverPlace: "Sunucu",
  },
};

function txt(locale, key, vars) {
  const pack = COPY[locale] || COPY.en;
  const str = pack[key] || COPY.en[key] || key;
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : ""));
}

function asList(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  for (const key of ["recordings", "items", "rows", "results", "data"]) {
    const v = payload[key];
    if (Array.isArray(v)) return v;
    if (v && typeof v === "object") {
      if (Array.isArray(v.recordings)) return v.recordings;
      if (Array.isArray(v.items)) return v.items;
    }
  }
  return [];
}

function recKind(rec) {
  return String(rec?.kind || rec?.type || rec?.scope || "").toLowerCase();
}

function recId(rec, index) {
  return rec?.id ?? rec?._id ?? rec?.recordingId ?? rec?.uuid ?? `row-${index}`;
}

function recTime(rec) {
  return rec?.startedAt || rec?.started_at || rec?.createdAt || rec?.created_at || rec?.endedAt || rec?.ended_at || rec?.timestamp || rec?.updatedAt || "";
}

function durationMs(rec) {
  const direct = Number(rec?.durationMs ?? rec?.duration_ms ?? rec?.lengthMs);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const sec = Number(rec?.durationSec ?? rec?.duration);
  if (Number.isFinite(sec) && sec > 0 && sec < 86400 * 7) return sec * 1000;
  const start = appDateMs(rec?.startedAt || rec?.started_at);
  const end = appDateMs(rec?.endedAt || rec?.ended_at);
  if (Number.isFinite(start) && Number.isFinite(end) && end > start) return end - start;
  return 0;
}

function formatDuration(ms) {
  const total = Math.max(0, Math.round(Number(ms) / 1000));
  if (!Number.isFinite(total) || total <= 0) return "—";
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function placeName(rec, locale) {
  const kind = recKind(rec);
  const group = rec?.groupName || rec?.group_name;
  const server = rec?.serverName || rec?.server_name;
  const channel = rec?.channelName || rec?.channel_name || rec?.roomName || rec?.room_name;
  const named = rec?.title || rec?.name || rec?.placeName || group || server || channel;
  if (kind === "server" && (server || channel)) {
    if (server && channel && server !== channel) return `${server} · ${channel}`;
    return String(server || channel);
  }
  if (kind === "group" && group) return String(group);
  if (named) return String(named);
  if (kind === "dm") return txt(locale, "dmPlace");
  if (kind === "group") return txt(locale, "groupPlace");
  if (kind === "server") return txt(locale, "serverPlace");
  return txt(locale, "unknownPlace");
}

function isReady(rec) {
  if (rec?.hasAudio === true) return true;
  if (rec?.hasAudio === false) return false;
  const st = String(rec?.status || "").toLowerCase();
  if (!st) return true;
  return st === "ready" || st === "complete" || st === "completed";
}

function participantsOf(rec) {
  const raw = rec?.participants || rec?.users || rec?.members || rec?.people || [];
  const ids = rec?.participantIds || rec?.participant_ids || [];
  if (Array.isArray(raw) && raw.length) {
    return raw.filter(Boolean).map((p, i) => {
      if (typeof p === "string") return { id: p, username: p, displayName: p };
      const username = p.username || p.handle || p.userName || "";
      const displayName = p.displayName || p.name || p.display_name || username || "";
      return {
        id: p.id || p.userId || p.user_id || ids[i] || username || `p-${i}`,
        username,
        displayName: displayName || txt("en", "unknownUser"),
        avatarUrl: p.avatarUrl || p.avatar_url,
      };
    });
  }
  const names = rec?.participantUsernames || rec?.participant_usernames || [];
  if (!Array.isArray(names) || !names.length) return [];
  return names.filter(Boolean).map((name, i) => ({
    id: ids[i] || name || `p-${i}`,
    username: String(name),
    displayName: String(name),
  }));
}

function slug(value, fallback = "recording") {
  const s = String(value || fallback)
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return s || fallback;
}

function filenameFromResponse(res, fallback) {
  const cd = res?.headers?.get?.("content-disposition") || "";
  const star = cd.match(/filename\*=UTF-8''([^;]+)/i);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim().replace(/"/g, ""));
    } catch {
      /* ignore */
    }
  }
  const plain = cd.match(/filename="?([^ ";]+)"?/i);
  return plain?.[1]?.trim() || fallback;
}

async function downloadMp3(path, fallbackName, failMsg) {
  const token = getToken();
  const url = `${API_BASE_URL}/admin${path}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const ctype = res.headers.get("content-type") || "";
  if (!res.ok || ctype.includes("application/json")) {
    let msg = failMsg;
    try {
      const body = await res.json();
      msg = body?.error || body?.message || failMsg;
    } catch {
      /* not json */
    }
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filenameFromResponse(res, fallbackName);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

export default function AdminVoiceRecordings({ socket }) {
  const t = useT();
  const { locale } = useLocale();
  const [kind, setKind] = useState("dm");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(null);
  const [pane, setPane] = useState("live");

  const load = useCallback(async (nextKind = kind) => {
    setLoading(true);
    setError("");
    try {
      const data = await adminFetch(`/voice-recordings?kind=${encodeURIComponent(nextKind)}`);
      const list = asList(data)
        .filter((rec) => {
          const k = recKind(rec);
          return !k || k === nextKind;
        })
        .sort((a, b) => {
          const tb = appDateMs(recTime(b));
          const ta = appDateMs(recTime(a));
          return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
        });
      setRows(list);
    } catch (err) {
      setRows([]);
      setError(err?.message || t("admin.loadError") || txt(locale, "downloadFailed"));
    } finally {
      setLoading(false);
    }
  }, [kind, locale, t]);

  useEffect(() => {
    if (pane !== "archive") return;
    load(kind).catch(() => {});
  }, [kind, load, pane]);

  const switchKind = (next) => {
    if (next === kind) return;
    setKind(next);
    setRows([]);
  };

  const onDownloadOne = async (rec) => {
    const id = rec?.id ?? rec?._id ?? rec?.recordingId;
    if (id == null || id === "") return;
    setBusy(String(id));
    setError("");
    try {
      await downloadMp3(
        `/voice-recordings/${encodeURIComponent(id)}/mp3`,
        `voice-${slug(kind)}-${slug(id)}.mp3`,
        txt(locale, "downloadFailed"),
      );
    } catch (err) {
      setError(err?.message || txt(locale, "downloadFailed"));
    } finally {
      setBusy(null);
    }
  };

  const onDownloadAll = async () => {
    setBusy("all");
    setError("");
    try {
      await downloadMp3(
        `/voice-recordings/export.mp3?kind=${encodeURIComponent(kind)}`,
        `voice-${slug(kind)}-all.mp3`,
        txt(locale, "downloadFailed"),
      );
    } catch (err) {
      setError(err?.message || txt(locale, "downloadFailed"));
    } finally {
      setBusy(null);
    }
  };

  const KindIcon = KIND_ICON[kind] || Hash;

  return (
    <section className="admin-section admin-section-full admin-voice">
      <div className="avl-mode" role="tablist" aria-label={txt(locale, "title")}>
        <button type="button" role="tab" aria-selected={pane === "live"} className={pane === "live" ? "is-active" : ""} onClick={() => setPane("live")}>
          <span className="avl-live-dot" aria-hidden="true" />
          {txt(locale, "live")}
        </button>
        <button type="button" role="tab" aria-selected={pane === "archive"} className={`is-archive${pane === "archive" ? " is-active" : ""}`} onClick={() => setPane("archive")}>
          {txt(locale, "archive")}
        </button>
      </div>
      {pane === "live" ? <AdminVoiceLive socket={socket} /> : (
      <>
      <div className="activity-header">
        <div className="activity-title-section">
          <h2>{txt(locale, "title")}</h2>
          <p className="activity-subtitle">{txt(locale, "subtitle")}</p>
        </div>
        <div className="admin-row">
          <span className="muted">{txt(locale, "count", { count: rows.length })} · {txt(locale, "newestFirst")}</span>
          <RippleButton type="button" onClick={() => load(kind)} disabled={loading} className="refresh-btn">
            <RefreshCw size={16} className={loading ? "spin" : ""} />
            {t("Refresh")}
          </RippleButton>
          <RippleButton type="button" onClick={onDownloadAll} disabled={busy === "all" || loading || !rows.length}>
            <Download size={16} />
            {busy === "all" ? txt(locale, "downloading") : txt(locale, "downloadAll")}
          </RippleButton>
        </div>
      </div>

      <div className="admin-voice-tabs" role="tablist">
        {KINDS.map((k) => {
          const Icon = KIND_ICON[k];
          return (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={kind === k}
              className={`admin-voice-tab ${kind === k ? "is-active" : ""}`}
              onClick={() => switchKind(k)}
            >
              <Icon size={14} />
              {txt(locale, k)}
            </button>
          );
        })}
      </div>

      {error ? <p className="admin-inline-error">{error}</p> : null}

      {loading && !rows.length ? (
        <div className="admin-voice-list" aria-busy="true">
          {[0, 1, 2].map((n) => (
            <div key={n} className="admin-voice-card is-skeleton" />
          ))}
          <p className="muted">{txt(locale, "loading")}</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="empty-state compact">
          <KindIcon size={32} className="empty-icon" />
          <p>{txt(locale, "empty")}</p>
        </div>
      ) : (
        <ul className="admin-voice-list">
          {rows.map((rec, index) => {
            const id = recId(rec, index);
            const people = participantsOf(rec);
            const when = recTime(rec);
            const kindBadge = recKind(rec) || kind;
            const RowIcon = KIND_ICON[kindBadge] || Hash;
            const downloadId = rec?.id ?? rec?._id ?? rec?.recordingId;
            const ready = isReady(rec);
            const canDl = downloadId != null && downloadId !== "" && ready;
            const isBusy = busy === String(downloadId);
            return (
              <li key={String(id)} className="admin-voice-card">
                <div className="admin-voice-card-top">
                  <span className={`admin-voice-badge kind-${kindBadge}`}>
                    <RowIcon size={12} />
                    {txt(locale, KINDS.includes(kindBadge) ? kindBadge : "dm")}
                  </span>
                  <strong className="admin-voice-place">{placeName(rec, locale)}</strong>
                </div>
                <div className="admin-voice-people">
                  {people.length === 0 ? (
                    <span className="muted">{txt(locale, "noUsers")}</span>
                  ) : (
                    people.map((p) => (
                      <span key={String(p.id)} className="admin-voice-chip">
                        <Avatar user={p} name={p.displayName || p.username} size={20} />
                        <span className="admin-voice-chip-text">
                          {p.displayName || p.username || txt(locale, "unknownUser")}
                          {p.username ? <em>@{p.username}</em> : null}
                        </span>
                      </span>
                    ))
                  )}
                </div>
                <div className="admin-voice-meta">
                  <span>
                    {when ? formatAppDateTime(when, locale) : "—"}
                    {when ? <em> · {formatTimeAgo(when, t, undefined, locale)}</em> : null}
                  </span>
                  <span className="admin-voice-duration">{formatDuration(durationMs(rec))}</span>
                  <RippleButton type="button" onClick={() => onDownloadOne(rec)} disabled={!canDl || Boolean(busy)}>
                    <Download size={14} />
                    {isBusy ? txt(locale, "downloading") : ready ? txt(locale, "downloadMp3") : txt(locale, "processing")}
                  </RippleButton>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      </>
      )}
    </section>
  );
}
