/**
 * 3D world view (lazy chunk). Renders the Babylon canvas and the overlay UI of the
 * approved draft (docs/design/3d-world/approved-ui-3.png, drafts.html #s3):
 * room switcher, member pill + Ayrıl, name tags with speaking ring, room chat,
 * control dock and the emote wheel (G).
 *
 * Voice keeps running underneath: this view only reads the call state and calls
 * the call's own toggles. "Ayrıl" leaves the world (back to the flat call view).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useT } from "../context/LocaleContext";
import useSpeaking from "../hooks/useSpeaking";
import useHeldSpeaking from "../hooks/useHeldSpeaking";
import { connectWorld, appPlatform } from "./net/worldSocket.js";
import { PRESETS, resolvePreset } from "./engine/quality.js";
import { probeRenderer, rendererVerdict } from "./gate.js";
import "./world3d.css";

const ROOMS = [
  { id: "cinema", key: "world3d.rooms.cinema", enabled: false },
  { id: "games", key: "world3d.rooms.games", enabled: false },
  { id: "living", key: "world3d.rooms.living", enabled: true },
  { id: "camp", key: "world3d.rooms.camp", enabled: false },
];

// Wheel layout from the draft: Dans top, Alkış top-right, Gül bottom-right,
// Selam bottom, Otur bottom-left, Zıpla top-left.
const WHEEL = [
  { id: "dance", key: "world3d.emote.dance", style: { top: 18, left: "50%", transform: "translateX(-50%)" } },
  { id: "clap", key: "world3d.emote.clap", style: { top: 80, right: 14 } },
  { id: "laugh", key: "world3d.emote.laugh", style: { bottom: 80, right: 14 } },
  { id: "wave", key: "world3d.emote.wave", style: { bottom: 18, left: "50%", transform: "translateX(-50%)" } },
  { id: "sit", key: "world3d.emote.sit", style: { bottom: 80, left: 14 } },
  { id: "jump", key: "world3d.emote.jump", style: { top: 80, left: 14 } },
];

/**
 * The engine (Babylon.js) is a separate bundle (vite.world3d.config.js), never part of
 * the app build. In dev the source module is imported directly.
 */
function loadEngineModule() {
  if (import.meta.env.DEV) return import("./engine/index.js");
  const version = typeof __DESCALL_VERSION__ !== "undefined" ? __DESCALL_VERSION__ : "0";
  const url = new URL(`world3d/engine/engine.js?v=${encodeURIComponent(version)}`, `${window.location.origin}/`);
  return import(/* @vite-ignore */ url.href);
}

const FACE_COLORS = ["#e2556b", "#2aa198", "#d9a21b", "#587af6", "#8b6cf6", "#e07b39"];
const QUALITY_KEY = "descall:world3d:quality";

function initials(name) {
  const s = String(name || "?").trim();
  return (s[0] || "?").toLocaleUpperCase();
}

function SpeakingProbe({ id, stream, muted, onChange }) {
  const raw = useSpeaking(muted ? null : stream, { muted });
  const held = useHeldSpeaking(raw && !muted);
  useEffect(() => {
    onChange(id, Boolean(held && !muted));
  }, [id, held, muted, onChange]);
  return null;
}

function NameTag({ member, speaking, activity, tagRef }) {
  return (
    <div ref={tagRef} className={`w3d-tag${speaking ? " is-talk" : ""}`} data-id={member.id}>
      {speaking ? <span className="w3d-dot" aria-hidden /> : null}
      <span className="w3d-tag-name">{member.name}</span>
      {activity ? <span className="w3d-tag-act">{`· ${activity}`}</span> : null}
    </div>
  );
}

export default function World3DView({
  kind,
  roomId,
  title,
  me,
  members = [],
  voice = {},
  mainSocket = null,
  socketUrl,
  socketPath = "/socket.io",
  token,
  assetBase = "/world3d/",
  onExit,
  onFallback,
  activeSpeakerIds = null,
  allowSoftware = false,
  worldSocketFactory = connectWorld,
}) {
  const t = useT();
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const netRef = useRef(null);
  const tagRefs = useRef(new Map());
  const [phase, setPhase] = useState("loading"); // loading | ready | error
  const [error, setError] = useState("");
  const [roster, setRoster] = useState([]); // members in the world (from the server)
  const [wheel, setWheel] = useState(false);
  const [settings, setSettings] = useState(false);
  const [seatHint, setSeatHint] = useState(null);
  const [chat, setChat] = useState([]);
  const [draft, setDraft] = useState("");
  const [speakingMap, setSpeakingMap] = useState({});
  const [activities, setActivities] = useState({});
  const [stats, setStats] = useState(null);
  const [quality, setQuality] = useState(() => {
    try {
      return localStorage.getItem(QUALITY_KEY) || "auto";
    } catch {
      return "auto";
    }
  });
  const selfId = String(me?.id || "me");

  const nameOf = useCallback(
    (id) => {
      const sid = String(id);
      if (sid === selfId) return me?.displayName || me?.display_name || me?.username || t("You");
      const m = members.find((x) => String(x.id) === sid) || roster.find((x) => String(x.id) === sid);
      return m?.name || m?.displayName || m?.display_name || m?.username || t("world3d.member");
    },
    [members, roster, me, selfId, t]
  );

  // ---------------------------------------------------------------- engine + network
  useEffect(() => {
    let disposed = false;
    let engine = null;
    let net = null;
    const probe = probeRenderer();
    const verdict = rendererVerdict({ ...probe, allowSoftware });
    if (!verdict.ok) {
      onFallback?.(verdict.reason);
      return undefined;
    }
    (async () => {
      try {
        const { WorldEngine } = await loadEngineModule();
        if (disposed) return;
        const preset = resolvePreset(quality, {
          renderer: probe.renderer,
          cores: navigator.hardwareConcurrency || 4,
          memoryGb: navigator.deviceMemory || 8,
          devicePixelRatio: window.devicePixelRatio || 1,
          software: verdict.software,
        });
        engine = new WorldEngine(canvasRef.current, {
          assetBase,
          quality: preset,
          selfId,
          onFrame: (rows) => {
            const map = tagRefs.current;
            for (const r of rows) {
              const el = map.get(r.id);
              if (!el) continue;
              if (!r.visible) {
                el.style.opacity = "0";
                continue;
              }
              el.style.opacity = "1";
              el.style.left = `${(r.x * 100).toFixed(2)}%`;
              el.style.top = `${(r.y * 100).toFixed(2)}%`;
            }
          },
          onSeatHint: (h) => setSeatHint(h),
          onEmoteWheel: (cmd) => setWheel((w) => (cmd === "close" ? false : !w)),
          onStats: (s) => setStats(s),
          onLocalSnapshot: (snap) => netRef.current?.sendSnapshot(snap),
        });
        engineRef.current = engine;
        await engine.init();
        if (disposed) {
          engine.dispose();
          return;
        }
        window.__descallWorld = engine; // dev / e2e inspection only (no secrets)
        net = worldSocketFactory({ url: socketUrl, token, app: appPlatform(), path: socketPath });
        netRef.current = net;
        net.socket.on("world:snaps", (batch) => engine.onSnaps(batch));
        net.socket.on("world:member", (ev) => {
          if (ev?.type === "join" && ev.member) {
            setRoster((prev) => {
              const next = prev.filter((m) => String(m.id) !== String(ev.member.id)).concat([ev.member]);
              engine.setMembers(next);
              return next;
            });
          } else if (ev?.type === "leave") {
            setRoster((prev) => {
              const next = prev.filter((m) => String(m.id) !== String(ev.id));
              engine.setMembers(next);
              return next;
            });
          }
        });
        net.socket.on("world:chat", (msg) => {
          if (kind === "group" && mainSocket) return;
          setChat((prev) => prev.concat([{ id: msg.id, name: msg.name, userId: msg.userId, text: msg.text }]).slice(-30));
        });
        net.socket.on("world:kicked", () => onExit?.("kicked"));
        const doJoin = async () => {
          const res = await net.join(kind, roomId);
          if (disposed) return;
          if (!res?.ok) {
            setError(res?.error || "join_failed");
            // offline / not authorised: still show the room alone
            const solo = [{ id: selfId, name: nameOf(selfId) }];
            setRoster(solo);
            engine.setMembers(solo);
            return;
          }
          setError("");
          const list = res.members.map((m) => ({ ...m, id: String(m.id) }));
          setRoster(list);
          engine.setMembers(list);
        };
        net.socket.on("connect", doJoin);
        net.socket.on("connect_error", (err) => {
          setError(String(err?.message || "connect_error"));
          if (!engine.avatars.size) {
            const solo = [{ id: selfId, name: nameOf(selfId) }];
            setRoster(solo);
            engine.setMembers(solo);
          }
        });
        setPhase("ready");
      } catch (err) {
        if (!disposed) {
          setPhase("error");
          setError(String(err?.message || err));
          onFallback?.("engine");
        }
      }
    })();
    return () => {
      disposed = true;
      try {
        net?.close();
      } catch {
        /* closing */
      }
      engine?.dispose();
      engineRef.current = null;
      netRef.current = null;
      if (window.__descallWorld === engine) delete window.__descallWorld;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, roomId]);

  // ---------------------------------------------------------------- speaking
  const onSpeaking = useCallback((id, v) => {
    setSpeakingMap((prev) => (prev[id] === v ? prev : { ...prev, [id]: v }));
  }, []);
  const speakingIds = useMemo(() => {
    const s = new Set(Object.entries(speakingMap).filter(([, v]) => v).map(([k]) => k));
    if (activeSpeakerIds) for (const id of activeSpeakerIds) s.add(String(id));
    return s;
  }, [speakingMap, activeSpeakerIds]);
  useEffect(() => {
    engineRef.current?.setSpeakers(speakingIds);
  }, [speakingIds]);

  // activity labels on tags (sitting, dancing...)
  useEffect(() => {
    const id = setInterval(() => {
      const eng = engineRef.current;
      if (!eng) return;
      const next = {};
      for (const [aid, av] of eng.avatars) {
        const em = av.emote?.name;
        if (em === "dance") next[aid] = t("world3d.activity.dancing");
        else if (em === "laugh") next[aid] = t("world3d.activity.laughing");
        else if (em === "clap") next[aid] = t("world3d.activity.clapping");
        else if (em === "wave") next[aid] = t("world3d.activity.waving");
      }
      setActivities((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    }, 400);
    return () => clearInterval(id);
  }, [t]);

  // ---------------------------------------------------------------- chat
  useEffect(() => {
    if (kind !== "group" || !mainSocket) return undefined;
    const onMsg = (payload) => {
      if (String(payload?.groupId) !== String(roomId)) return;
      const m = payload.message || {};
      const text = String(m.content || "").trim();
      if (!text || m.media_type) return;
      const name = m.sender?.displayName || m.sender?.display_name || m.sender?.username || nameOf(m.sender_id);
      setChat((prev) => (prev.some((x) => x.id === m.id) ? prev : prev.concat([{ id: m.id, name, userId: m.sender_id, text }]).slice(-30)));
    };
    mainSocket.on("group:message", onMsg);
    return () => mainSocket.off("group:message", onMsg);
  }, [kind, mainSocket, roomId, nameOf]);

  const sendChat = useCallback(
    async (e) => {
      e?.preventDefault?.();
      const text = draft.trim();
      if (!text) return;
      setDraft("");
      if (kind === "group" && mainSocket) {
        mainSocket.emit("group:message", { groupId: roomId, tempId: `w3d-${Date.now()}`, content: text });
      } else {
        await netRef.current?.sendChat(text);
      }
    },
    [draft, kind, mainSocket, roomId]
  );

  // ---------------------------------------------------------------- actions
  const doEmote = useCallback((id) => {
    const eng = engineRef.current;
    setWheel(false);
    if (!eng) return;
    if (id === "sit") eng.toggleSit();
    else eng.emote(id);
  }, []);

  const changeQuality = useCallback((q) => {
    setQuality(q);
    try {
      localStorage.setItem(QUALITY_KEY, q);
    } catch {
      /* private mode */
    }
    const eng = engineRef.current;
    if (!eng) return;
    const preset = q === "auto" ? resolvePreset("auto", { cores: navigator.hardwareConcurrency || 4 }) : PRESETS[q];
    eng.lockQuality = q !== "auto";
    eng.setQuality(preset);
  }, []);

  // everyone in the world (server roster), with call info merged for streams / mute
  const people = useMemo(() => {
    const ids = roster.length ? roster.map((m) => String(m.id)) : [selfId];
    return ids.map((id) => {
      const call = members.find((m) => String(m.id) === id);
      return { id, name: nameOf(id), avatarUrl: call?.avatarUrl || null, stream: call?.stream || null, muted: Boolean(call?.muted) };
    });
  }, [roster, members, selfId, nameOf]);

  const countLabel = t("world3d.peopleInRoom", { count: people.length });
  const sitLabel = seatHint === "stand" ? t("world3d.dock.stand") : t("world3d.dock.sit");

  return (
    <div className="w3d-root" data-phase={phase}>
      <canvas ref={canvasRef} className="w3d-canvas" aria-label={t("world3d.canvasLabel")} tabIndex={0} />
      {members.map((m) => (
        <SpeakingProbe key={m.id} id={String(m.id)} stream={m.stream} muted={Boolean(m.muted)} onChange={onSpeaking} />
      ))}

      <div className="w3d-tags" aria-hidden>
        {people.map((p) => (
          <NameTag
            key={p.id}
            member={p}
            speaking={speakingIds.has(p.id)}
            activity={activities[p.id]}
            tagRef={(el) => {
              if (el) tagRefs.current.set(p.id, el);
              else tagRefs.current.delete(p.id);
            }}
          />
        ))}
      </div>

      <nav className="w3d-rooms w3d-glass" aria-label={t("world3d.roomsLabel")}>
        {ROOMS.map((r) => (
          <button
            key={r.id}
            type="button"
            className={`w3d-room${r.id === "living" ? " is-on" : ""}`}
            aria-current={r.id === "living" ? "true" : undefined}
            aria-disabled={!r.enabled}
            disabled={!r.enabled}
            data-soon={r.enabled ? undefined : t("world3d.soon")}
            title={r.enabled ? undefined : t("world3d.soon")}
          >
            {t(r.key)}
          </button>
        ))}
      </nav>

      <div className="w3d-who w3d-glass">
        <div className="w3d-who-text">
          <b>{title}</b>
          <small>{countLabel}</small>
        </div>
        <div className="w3d-faces" aria-hidden>
          {people.slice(0, 3).map((p, i) =>
            p.avatarUrl ? (
              <img key={p.id} src={p.avatarUrl} alt="" />
            ) : (
              <em key={p.id} style={{ background: FACE_COLORS[i % FACE_COLORS.length] }}>
                {initials(p.name)}
              </em>
            )
          )}
        </div>
        <button type="button" className="w3d-leave" onClick={() => onExit?.("leave")} title={t("world3d.leaveHint")}>
          {t("world3d.leave")}
        </button>
      </div>

      {wheel ? (
        <div className="w3d-emote w3d-glass" role="menu" aria-label={t("world3d.emote.label")}>
          <div className="w3d-emote-c" aria-hidden>
            {t("world3d.emote.center")}
            <br />G
          </div>
          {WHEEL.map((w) => (
            <button key={w.id} type="button" role="menuitem" style={w.style} onClick={() => doEmote(w.id)}>
              {w.id === "sit" ? (seatHint === "stand" ? t("world3d.dock.stand") : t(w.key)) : t(w.key)}
            </button>
          ))}
        </div>
      ) : null}

      <form className="w3d-chat w3d-glass" onSubmit={sendChat}>
        <div className="w3d-chat-log" aria-live="polite">
          {chat.slice(-4).map((m) => (
            <p key={m.id}>
              <b>{m.name || nameOf(m.userId)}</b>
              {m.text}
            </p>
          ))}
        </div>
        <input
          className="w3d-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t("world3d.chatPlaceholder")}
          maxLength={300}
          aria-label={t("world3d.chatPlaceholder")}
          onKeyDown={(e) => {
            if (e.key === "Escape") e.currentTarget.blur();
          }}
        />
      </form>

      <div className="w3d-dock w3d-glass" role="toolbar" aria-label={t("world3d.dockLabel")}>
        <button type="button" className={voice.muted ? "" : "is-on"} aria-pressed={!voice.muted} onClick={() => voice.toggleMute?.()} title={voice.muted ? t("Unmute") : t("Mute")}>
          {t("world3d.dock.mic")}
        </button>
        <button type="button" className={voice.deafened ? "is-red" : ""} aria-pressed={Boolean(voice.deafened)} onClick={() => voice.toggleDeafen?.()} title={voice.deafened ? t("Undeafen") : t("Deafen")}>
          {t("world3d.dock.sound")}
        </button>
        <button type="button" className={wheel ? "is-on" : ""} aria-pressed={wheel} onClick={() => setWheel((w) => !w)} title={t("world3d.emote.label")}>
          {t("world3d.dock.emoji")}
        </button>
        <button type="button" className={voice.isScreenSharing ? "is-on" : ""} aria-pressed={Boolean(voice.isScreenSharing)} disabled={!voice.toggleScreen || voice.canVideo === false} onClick={() => voice.toggleScreen?.()} title={t("Share Screen")}>
          {t("world3d.dock.screen")}
        </button>
        <i className="w3d-sep" aria-hidden />
        <button type="button" className={seatHint === "stand" ? "is-on" : ""} disabled={!seatHint} onClick={() => engineRef.current?.toggleSit()} title={t("world3d.sitHint")}>
          {sitLabel}
        </button>
        <button type="button" className={voice.isCameraOn ? "is-on" : ""} aria-pressed={Boolean(voice.isCameraOn)} disabled={!voice.toggleCamera || voice.canVideo === false} onClick={() => voice.toggleCamera?.()} title={t("Camera")}>
          {t("world3d.dock.camera")}
        </button>
        <button type="button" className={settings ? "is-on" : ""} aria-expanded={settings} onClick={() => setSettings((s) => !s)} title={t("world3d.dock.settings")}>
          {t("world3d.dock.settings")}
        </button>
      </div>

      {settings ? (
        <div className="w3d-settings w3d-glass" role="dialog" aria-label={t("world3d.dock.settings")}>
          <p className="w3d-settings-h">{t("world3d.quality.label")}</p>
          <div className="w3d-seg">
            {["auto", "low", "medium", "high"].map((q) => (
              <button key={q} type="button" className={quality === q ? "is-on" : ""} onClick={() => changeQuality(q)}>
                {t(`world3d.quality.${q}`)}
              </button>
            ))}
          </div>
          <button type="button" className="w3d-row" onClick={() => engineRef.current?.resetCamera()}>
            {t("world3d.resetCamera")}
          </button>
          <button type="button" className="w3d-row" onClick={() => onExit?.("flat")}>
            {t("world3d.flatView")}
          </button>
          <p className="w3d-keys">{t("world3d.keysHelp")}</p>
          {stats ? <p className="w3d-stats">{t("world3d.stats", { fps: stats.fps, quality: t(`world3d.quality.${stats.quality}`) })}</p> : null}
        </div>
      ) : null}

      {phase === "loading" ? (
        <div className="w3d-loading" role="status">
          <span className="w3d-spinner" aria-hidden />
          {t("world3d.loading")}
        </div>
      ) : null}
      {phase === "error" ? (
        <div className="w3d-loading" role="alert">
          {t("world3d.failed")}
        </div>
      ) : null}
      {error && phase === "ready" ? <div className="w3d-net" role="status">{t("world3d.offline")}</div> : null}
    </div>
  );
}
