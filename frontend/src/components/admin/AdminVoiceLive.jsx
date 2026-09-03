import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Headphones, MessageCircle, Radio, RefreshCw, Server, Users, Volume2, VolumeX, Wifi, WifiOff } from "lucide-react";
import { adminFetch } from "../../api/adminHttp";
import { API_BASE_URL, SOCKET_URL } from "../../config/api";
import { getToken } from "../../lib/storage";
import RippleButton from "../ui/RippleButton";
import { Avatar } from "../ui/Avatar";
import { useLocale, useT } from "../../context/LocaleContext";

const KINDS = ["dm", "group", "server"];
const KIND_ICON = { dm: MessageCircle, group: Users, server: Server };

const COPY = {
  en: {
    title: "Live listen",
    subtitle: "Who is speaking. Listen live — DM, group, server.",
    empty: "No live call right now",
    connecting: "Connecting listen…",
    muted: "Muted",
    volume: "Listen volume",
    mute: "Mute",
    unmute: "Unmute",
    qualityLive: "Live",
    qualityOff: "No stream",
    speaking: "Speaking",
    liveCount: "{n} live",
    all: "All",
    dm: "DM",
    group: "Group",
    server: "Server",
    pick: "Select a room",
    unknown: "Unknown",
    noUsers: "No one in call",
  },
  tr: {
    title: "Canlı dinleme",
    subtitle: "Kim konuşuyor. Canlı dinle — DM, grup, sunucu.",
    empty: "Şu an canlı call yok",
    connecting: "Dinleme bağlanıyor…",
    muted: "Sessiz",
    volume: "Dinleme sesi",
    mute: "Sustur",
    unmute: "Sesi aç",
    qualityLive: "Canlı",
    qualityOff: "Akış yok",
    speaking: "Konuşuyor",
    liveCount: "{n} canlı",
    all: "Tümü",
    dm: "DM",
    group: "Grup",
    server: "Server",
    pick: "Oda seç",
    unknown: "Bilinmiyor",
    noUsers: "Call’da kimse yok",
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
  for (const key of ["rooms", "calls", "sessions", "live", "items", "data"]) {
    if (Array.isArray(payload[key])) return payload[key];
  }
  if (payload.room) return [payload.room];
  return [];
}

function asRoom(payload) {
  if (!payload || typeof payload !== "object") return null;
  const inner = payload.room || payload.call || payload.session;
  return inner && typeof inner === "object" && !Array.isArray(inner) ? { ...payload, ...inner } : payload;
}

function roomId(room, index = 0) {
  return room?.id ?? room?._id ?? room?.callId ?? room?.roomId ?? room?.sessionId ?? `live-${index}`;
}

function roomKind(room) {
  return String(room?.kind || room?.type || room?.scope || "").toLowerCase();
}

function placeName(room, locale) {
  const kind = roomKind(room);
  const group = room?.groupName || room?.group_name;
  const server = room?.serverName || room?.server_name;
  const channel = room?.channelName || room?.channel_name || room?.roomName || room?.room_name;
  const named = room?.title || room?.name || room?.placeName || group || server || channel;
  if (kind === "server" && (server || channel)) {
    return server && channel && server !== channel ? `${server} · ${channel}` : String(server || channel);
  }
  if (kind === "group" && group) return String(group);
  if (named) return String(named);
  if (kind === "dm") return "DM";
  if (kind === "group") return txt(locale, "group");
  if (kind === "server") return txt(locale, "server");
  return txt(locale, "unknown");
}

function peopleOf(room) {
  const raw = room?.participants || room?.users || room?.members || [];
  const ids = room?.participantIds || room?.participant_ids || [];
  if (!Array.isArray(raw) || !raw.length) {
    const names = room?.participantUsernames || room?.participant_usernames || [];
    return (Array.isArray(names) ? names : []).filter(Boolean).map((name, i) => ({
      id: ids[i] || name || `p-${i}`, username: String(name), displayName: String(name),
    }));
  }
  return raw.filter(Boolean).map((p, i) => {
    if (typeof p === "string") return { id: p, username: p, displayName: p };
    const username = p.username || p.handle || p.userName || "";
    return {
      id: p.id || p.userId || p.user_id || ids[i] || username || `p-${i}`,
      username,
      displayName: p.displayName || p.name || p.display_name || username || txt("en", "unknown"),
      avatarUrl: p.avatarUrl || p.avatar_url,
      speaking: p.speaking ?? p.isSpeaking ?? p.speakingNow,
      level: p.level ?? p.audioLevel ?? p.volume ?? p.rms,
    };
  });
}

function liveCount(room, people) {
  const n = Number(room?.liveCount ?? room?.participantCount ?? people.length);
  return Number.isFinite(n) && n > 0 ? n : people.length;
}

function levelOf(p) {
  const n = Number(p?.level);
  if (!Number.isFinite(n)) return 0;
  return n > 1 ? Math.min(1, n / 100) : Math.max(0, Math.min(1, n));
}

function speakerIdOf(room) {
  const s = room?.speakingUserId ?? room?.speakingId ?? room?.speakerId;
  if (s != null && s !== "") return String(s);
  const obj = room?.speaking || room?.speaker;
  if (obj && typeof obj === "object") return String(obj.id || obj.userId || obj.username || "");
  if (typeof obj === "string" || typeof obj === "number") return String(obj);
  return "";
}

function isSpeaking(p, room) {
  if (p?.speaking === true || p?.isSpeaking === true) return true;
  if (p?.speaking === false) return false;
  const sid = speakerIdOf(room);
  if (sid && [p.id, p.userId, p.username].some((v) => v != null && String(v) === sid)) return true;
  return levelOf(p) > 0.08;
}

export default function AdminVoiceLive({ socket }) {
  const t = useT();
  const { locale } = useLocale();
  const [kind, setKind] = useState("all");
  const [rooms, setRooms] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [volume, setVolume] = useState(0.85);
  const [muted, setMuted] = useState(false);
  const [listen, setListen] = useState("idle");
  const audioRef = useRef(null);
  const objUrlRef = useRef("");
  const abortRef = useRef(null);
  const emptyAtRef = useRef(0);
  const backoffUntilRef = useRef(0);

  const applyRooms = useCallback((list) => {
    if (list.length) {
      emptyAtRef.current = 0;
      setRooms(list);
      setSelectedId((prev) => {
        if (prev && list.some((row, i) => String(roomId(row, i)) === String(prev))) return prev;
        return prev || String(roomId(list[0], 0));
      });
      return;
    }
    if (!emptyAtRef.current) emptyAtRef.current = Date.now();
    if (Date.now() - emptyAtRef.current < 2800) return;
    setRooms([]);
    setSelectedId(null);
    setDetail(null);
  }, []);

  const stopAudio = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    const audio = audioRef.current;
    if (audio) { audio.pause(); audio.removeAttribute("src"); audio.load(); }
    if (objUrlRef.current) { URL.revokeObjectURL(objUrlRef.current); objUrlRef.current = ""; }
    setListen("idle");
  }, []);

  const loadList = useCallback(async (nextKind = kind, { quiet } = {}) => {
    if (Date.now() < backoffUntilRef.current) return;
    if (!quiet) setLoading(true);
    try {
      const q = nextKind && nextKind !== "all" ? `?kind=${encodeURIComponent(nextKind)}` : "";
      const data = await adminFetch(`/voice-live${q}`);
      const list = asList(data).filter((row) => {
        const k = roomKind(row);
        return nextKind === "all" || !k || k === nextKind;
      });
      applyRooms(list);
      setError("");
      backoffUntilRef.current = 0;
    } catch (err) {
      if (Number(err?.status) === 429) {
        backoffUntilRef.current = Date.now() + 20000;
        return;
      }
      setError(err?.status === 404 || err?.status === 501 ? "" : (err?.message || t("admin.loadError") || "Error"));
    } finally {
      setLoading(false);
    }
  }, [kind, t, applyRooms]);

  const loadDetail = useCallback(async (id) => {
    if (id == null || id === "") { setDetail(null); return; }
    try {
      setDetail(asRoom(await adminFetch(`/voice-live/${encodeURIComponent(id)}`)));
    } catch (err) {
      if (err?.status === 404 || err?.status === 501) setDetail(null);
    }
  }, []);

  useEffect(() => {
    loadList(kind).catch(() => {});
    const tick = setInterval(() => loadList(kind, { quiet: true }).catch(() => {}), 10000);
    return () => clearInterval(tick);
  }, [kind, loadList]);

  useEffect(() => {
    if (!selectedId) { setDetail(null); return undefined; }
    loadDetail(selectedId).catch(() => {});
  }, [selectedId, loadDetail]);

  useEffect(() => {
    if (!socket?.on) return undefined;
    const onLive = (payload) => {
      const body = payload?.payload || payload;
      if (!body || (!Array.isArray(body) && !Array.isArray(body.rooms) && !body.room)) return;
      const list = asList(body).filter((row) => {
        const rk = roomKind(row);
        return kind === "all" || !rk || rk === kind;
      });
      applyRooms(list);
      const one = asRoom(body);
      const id = one ? roomId(one) : "";
      if (id && String(id) === String(selectedId)) setDetail((prev) => ({ ...(prev || {}), ...one }));
    };
    socket.on("admin:voice-live", onLive);
    return () => socket.off("admin:voice-live", onLive);
  }, [socket, kind, selectedId]);

  useEffect(() => {
    stopAudio();
    if (!selectedId) return undefined;
    const audio = audioRef.current;
    if (!audio) return undefined;
    setListen("connecting");
    const token = getToken();
    const origin = String(SOCKET_URL || API_BASE_URL || "").replace(/\/$/, "");
    const url = `${origin}/admin/voice-live/${encodeURIComponent(selectedId)}/audio?token=${encodeURIComponent(token || "")}`;
    audio.volume = volume;
    audio.muted = muted;
    audio.src = url;
    const onLive = () => setListen("live");
    const onWaiting = () => setListen((s) => (s === "live" ? "live" : "connecting"));
    audio.addEventListener("playing", onLive);
    audio.addEventListener("canplay", onLive);
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("error", onWaiting);
    audio.play().catch(() => { if (!audio.src) return; setListen("connecting"); });
    return () => {
      audio.removeEventListener("playing", onLive);
      audio.removeEventListener("canplay", onLive);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("error", onWaiting);
    };
  }, [selectedId, stopAudio]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.muted = muted;
  }, [volume, muted]);

  useEffect(() => () => stopAudio(), [stopAudio]);

  const selected = useMemo(() => {
    const fromList = rooms.find((row, i) => String(roomId(row, i)) === String(selectedId));
    if (detail && String(roomId(detail)) === String(selectedId)) return { ...(fromList || {}), ...detail };
    return fromList || detail;
  }, [rooms, detail, selectedId]);

  const people = selected ? peopleOf(selected) : [];
  const KindIcon = KIND_ICON[kind] || Radio;
  const badge = muted ? txt(locale, "muted") : listen === "live" ? txt(locale, "qualityLive") : listen === "connecting" ? txt(locale, "connecting") : txt(locale, "qualityOff");
  const badgeKind = muted ? "muted" : listen === "live" ? "live" : listen === "connecting" ? "wait" : "off";

  return (
    <div className="avl">
      <div className="activity-header">
        <div className="activity-title-section">
          <h2>{txt(locale, "title")}</h2>
          <p className="activity-subtitle">{txt(locale, "subtitle")}</p>
        </div>
        <div className="admin-row">
          <span className="muted">{txt(locale, "liveCount", { n: rooms.length })}</span>
          <RippleButton type="button" onClick={() => loadList(kind)} disabled={loading} className="refresh-btn">
            <RefreshCw size={16} className={loading ? "spin" : ""} />
            {t("Refresh")}
          </RippleButton>
        </div>
      </div>

      <div className="admin-voice-tabs" role="tablist">
        {["all", ...KINDS].map((k) => {
          const Icon = KIND_ICON[k] || Radio;
          return (
            <button key={k} type="button" role="tab" aria-selected={kind === k} className={`admin-voice-tab ${kind === k ? "is-active" : ""}`} onClick={() => setKind(k)}>
              <Icon size={14} />
              {txt(locale, k)}
            </button>
          );
        })}
      </div>

      {error ? <p className="admin-inline-error">{error}</p> : null}

      {!rooms.length && !loading ? (
        <div className="empty-state compact avl-empty">
          <KindIcon size={32} className="empty-icon" />
          <p>{txt(locale, "empty")}</p>
        </div>
      ) : (
        <div className="avl-board">
          <aside className="avl-rail" aria-label={txt(locale, "title")}>
            {loading && !rooms.length ? (
              [0, 1, 2].map((n) => <div key={n} className="avl-room is-skeleton" />)
            ) : rooms.map((room, index) => {
              const id = String(roomId(room, index));
              const roster = peopleOf(room);
              const now = roster.find((p) => isSpeaking(p, room));
              return (
                <button key={id} type="button" className={`avl-room ${id === String(selectedId) ? "is-active" : ""}`} onClick={() => { setSelectedId(id); const a = audioRef.current; if (a && String(id) === String(selectedId)) a.play().catch(() => {}); }}>
                  <div className="avl-room-top">
                    <strong>{placeName(room, locale)}</strong>
                    <span className="avl-count">{liveCount(room, roster)}</span>
                  </div>
                  <div className="avl-room-avatars">
                    {roster.slice(0, 5).map((p) => (
                      <Avatar key={String(p.id)} user={p} name={p.displayName || p.username} size={22} animate="never" />
                    ))}
                    {roster.length > 5 ? <em>+{roster.length - 5}</em> : null}
                  </div>
                  {now ? (
                    <span className="avl-chip"><Radio size={11} />{txt(locale, "speaking")}: {now.displayName || now.username}</span>
                  ) : (
                    <span className="avl-chip is-idle">{txt(locale, "liveCount", { n: liveCount(room, roster) })}</span>
                  )}
                </button>
              );
            })}
          </aside>

          <div className="avl-stage">
            {!selected ? (
              <div className="empty-state compact">
                <Headphones size={32} className="empty-icon" />
                <p>{txt(locale, "pick")}</p>
              </div>
            ) : (
              <>
                <div className="avl-stage-head">
                  <span className={`admin-voice-badge kind-${roomKind(selected) || kind}`}>{txt(locale, KINDS.includes(roomKind(selected)) ? roomKind(selected) : kind)}</span>
                  <strong>{placeName(selected, locale)}</strong>
                  <span className="muted">{txt(locale, "liveCount", { n: liveCount(selected, people) })}</span>
                </div>
                {people.length === 0 ? (
                  <p className="muted avl-none">{txt(locale, "noUsers")}</p>
                ) : (
                  <ul className="avl-cast">
                    {people.map((p) => {
                      const speaking = isSpeaking(p, selected);
                      const lvl = Math.max(speaking ? 0.35 : 0, levelOf(p));
                      return (
                        <li key={String(p.id)} className={`avl-person ${speaking ? "is-speaking" : "is-quiet"}`}>
                          <div className="avl-orb" style={{ "--lvl": lvl }}>
                            <span className="avl-ring" />
                            <Avatar user={p} name={p.displayName || p.username} size={speaking ? 72 : 56} animate="speaking" isSpeaking={speaking} />
                          </div>
                          <strong>{p.displayName || p.username || txt(locale, "unknown")}</strong>
                          {p.username ? <em>@{p.username}</em> : null}
                          {speaking ? <span className="avl-now">{txt(locale, "speaking")}</span> : null}
                          <span className="avl-vu" aria-hidden="true"><i style={{ transform: `scaleY(${0.12 + lvl * 0.88})` }} /></span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <footer className="avl-foot">
        <label className="avl-vol">
          {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          <span>{txt(locale, "volume")}</span>
          <input type="range" min="0" max="1" step="0.01" value={muted ? 0 : volume} onChange={(e) => { setVolume(Number(e.target.value)); if (muted) setMuted(false); }} disabled={!selectedId} />
        </label>
        <RippleButton type="button" onClick={() => setMuted((v) => !v)} disabled={!selectedId}>
          {muted ? <Volume2 size={14} /> : <VolumeX size={14} />}
          {muted ? txt(locale, "unmute") : txt(locale, "mute")}
        </RippleButton>
        <span className={`avl-badge is-${badgeKind}`}>
          {listen === "live" && !muted ? <Wifi size={13} /> : <WifiOff size={13} />}
          {listen === "connecting" && selectedId && !muted ? txt(locale, "connecting") : badge}
        </span>
        <audio ref={audioRef} preload="none" />
      </footer>
    </div>
  );
}
