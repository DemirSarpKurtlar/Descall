/**
 * 3D world view (lazy chunk). Renders the Babylon canvas and the overlay UI of the
 * approved draft (docs/design/3d-world/approved-ui-3.png, drafts.html #s3):
 * room switcher, member pill + Ayrıl, name tags with speaking ring, room chat,
 * control dock and the emote wheel (G), plus the Ayar menu (quality, camera,
 * performance overlay) and the controls help (H).
 *
 * Voice keeps running underneath: this view only reads the call state and calls
 * the call's own toggles. "Ayrıl" leaves the world (back to the flat call view).
 *
 * React stays out of the frame loop: name tags are positioned by the engine, speaking
 * edges toggle a class on the tag, the performance overlay polls on its own. The view
 * itself re-renders only when something visible changes (memo on the semantic props;
 * callbacks are read from `api.current` at call time).
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useT } from "../context/LocaleContext";
import { connectWorld, appPlatform } from "./net/worldSocket.js";
import { PRESETS, resolvePreset } from "./engine/quality.js";
import { CAMERA_MODES, FOV_RANGE, SENSITIVITY_RANGE, loadCameraPrefs, saveCameraPrefs } from "./engine/cameraModes.js";
import { probeRenderer, rendererVerdict } from "./gate.js";
import { createSpeakingMonitor } from "./speakingMonitor.js";
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

const ACTIVITY_KEYS = { dance: "world3d.activity.dancing", laugh: "world3d.activity.laughing", clap: "world3d.activity.clapping", wave: "world3d.activity.waving", guitar: "world3d.activity.guitar" };

/** Controls help: [keys, action] per section. Key names that differ by language are catalog keys. */
const HELP = [
  { section: "world3d.help.everywhere", rows: [
    [["W", "A", "S", "D"], "world3d.help.walk", "world3d.keys.arrows"],
    [["@world3d.keys.shift"], "world3d.help.run"],
    [["E"], "world3d.help.sit"],
    [["G"], "world3d.help.emotes"],
    [["B"], "world3d.help.guitar"],
    [["V"], "world3d.help.camera"],
    [["@world3d.keys.enter"], "world3d.help.chat"],
    [["H", "?"], "world3d.help.help"],
  ] },
  { section: "world3d.camera.third", rows: [
    [["@world3d.keys.click"], "world3d.help.clickWalk"],
    [["@world3d.keys.drag"], "world3d.help.orbit"],
    [["@world3d.keys.wheel"], "world3d.help.zoom"],
  ] },
  { section: "world3d.camera.first", rows: [
    [["@world3d.keys.click"], "world3d.help.look"],
    [["@world3d.keys.esc"], "world3d.help.release"],
  ] },
  { section: "world3d.camera.free", rows: [
    [["W", "A", "S", "D"], "world3d.help.fly"],
    [["Q", "E"], "world3d.help.flyUpDown"],
    [["@world3d.keys.shift"], "world3d.help.faster"],
    [["R"], "world3d.help.back"],
  ] },
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
const HUD_KEY = "descall:world3d:hud";

function readStore(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : v;
  } catch {
    return fallback;
  }
}

function writeStore(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode */
  }
}

function initials(name) {
  const s = String(name || "?").trim();
  return (s[0] || "?").toLocaleUpperCase();
}

/** A member's name tag: static markup, moved by the engine, speaking toggled by class. */
const NameTag = memo(function NameTag({ id, name, activity, tagRef }) {
  return (
    <div ref={tagRef} className="w3d-tag" data-id={id}>
      <span className="w3d-dot" aria-hidden />
      <span className="w3d-tag-name">{name}</span>
      {activity ? <span className="w3d-tag-act">{`· ${activity}`}</span> : null}
    </div>
  );
});

/** Performance overlay: polls the engine twice a second, re-renders only itself. */
function PerfHud({ engineRef, t }) {
  const [s, setS] = useState(null);
  useEffect(() => {
    const tick = () => {
      const eng = engineRef.current;
      if (eng?.perfStats) setS(eng.perfStats());
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [engineRef]);
  if (!s) return null;
  const ms = (v) => t("world3d.perf.ms", { value: (v || 0).toFixed(1) });
  const rows = [
    ["world3d.perf.fps", Math.round(s.fps)],
    ["world3d.perf.low1", Math.round(s.low1)],
    ["world3d.perf.p95", ms(s.p95)],
    ["world3d.perf.p99", ms(s.p99)],
    ["world3d.perf.drawCalls", s.drawCalls],
    ["world3d.perf.triangles", s.triangles >= 1000 ? `${(s.triangles / 1000).toFixed(0)}k` : s.triangles],
    ["world3d.perf.scale", t("world3d.perf.scaleValue", { percent: Math.round(s.scale * 100), width: s.renderW, height: s.renderH })],
    ...(s.gpuMs != null ? [["world3d.perf.gpuTime", ms(s.gpuMs)]] : []),
    ["world3d.perf.quality", t(`world3d.quality.${s.quality}`)],
  ];
  return (
    <div className="w3d-hud w3d-glass" role="status" aria-live="off" aria-label={t("world3d.perf.title")}>
      <dl>
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{t(k)}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <p className="w3d-hud-gpu" title={s.renderer}>
        <span>{t("world3d.perf.gpu")}</span>
        {s.renderer || "?"}
      </p>
    </div>
  );
}

/** On / off switch in the overlay's style (a button with role="switch"). */
function Toggle({ on, label, onChange }) {
  return (
    <button type="button" role="switch" aria-checked={Boolean(on)} className={`w3d-switch${on ? " is-on" : ""}`} onClick={() => onChange(!on)}>
      <span>{label}</span>
      <i aria-hidden />
    </button>
  );
}

function KeyCap({ k, t }) {
  return <kbd className="w3d-kbd">{k.startsWith("@") ? t(k.slice(1)) : k}</kbd>;
}

function HelpOverlay({ t, mode, onClose }) {
  const closeRef = useRef(null);
  useEffect(() => {
    closeRef.current?.focus();
  }, []);
  return (
    <div className="w3d-help w3d-glass" role="dialog" aria-modal="false" aria-label={t("world3d.help.title")}>
      <div className="w3d-help-head">
        <b>{t("world3d.help.title")}</b>
        <button ref={closeRef} type="button" className="w3d-help-x" onClick={onClose}>
          {t("world3d.help.close")}
        </button>
      </div>
      <div className="w3d-help-grid">
        {HELP.map((sec) => (
          <section key={sec.section} className={sec.section === `world3d.camera.${mode}` ? "is-on" : ""}>
            <h3>{t(sec.section)}</h3>
            {sec.rows.map(([keys, action, alt]) => (
              <p key={action}>
                <span className="w3d-keys-caps">
                  {keys.map((k) => (
                    <KeyCap key={k} k={k} t={t} />
                  ))}
                  {alt ? <em>{t(alt)}</em> : null}
                </span>
                <span>{t(action)}</span>
              </p>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

function World3DView(props) {
  const {
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
    activeSpeakerIds = null,
    allowSoftware = false,
    worldSocketFactory = connectWorld,
    lookOverrides = null,
  } = props;
  // latest props for callbacks (the parent keeps `api` fresh while this view is memoised)
  const own = useRef(props);
  own.current = props;
  const api = props.api || own;
  const t = useT();
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const netRef = useRef(null);
  const chatInputRef = useRef(null);
  const tagEls = useRef(new Map());
  const tagRefFns = useRef(new Map());
  const monitorRef = useRef(null);
  const [phase, setPhase] = useState("loading"); // loading | ready | error
  const [error, setError] = useState("");
  const [roster, setRoster] = useState([]); // members in the world (from the server)
  const [wheel, setWheel] = useState(false);
  const [settings, setSettings] = useState(false);
  const [help, setHelp] = useState(false);
  const [seatHint, setSeatHint] = useState(null);
  const [chat, setChat] = useState([]);
  const [draft, setDraft] = useState("");
  const [activities, setActivities] = useState({});
  const [cameraMode, setCameraMode] = useState(null);
  const [modeToast, setModeToast] = useState(null);
  const [locked, setLocked] = useState(false);
  const [quality, setQuality] = useState(() => readStore(QUALITY_KEY, "auto"));
  const [hud, setHud] = useState(() => readStore(HUD_KEY, "0") === "1");
  const selfId = String(me?.id || "me");
  const [camPrefs, setCamPrefs] = useState(() => loadCameraPrefs(typeof localStorage !== "undefined" ? localStorage : null, selfId));

  const nameOf = useCallback(
    (id) => {
      const sid = String(id);
      if (sid === selfId) return me?.displayName || me?.display_name || me?.username || t("You");
      const m = api.current.members?.find((x) => String(x.id) === sid) || roster.find((x) => String(x.id) === sid);
      return m?.name || m?.displayName || m?.display_name || m?.username || t("world3d.member");
    },
    [roster, me, selfId, t, api]
  );
  const nameOfRef = useRef(nameOf);
  nameOfRef.current = nameOf;

  // ---------------------------------------------------------------- speaking (no React state)
  const applySpeaking = useCallback((id, v) => {
    engineRef.current?.setSpeaking(id, v);
    const el = tagEls.current.get(String(id));
    if (el) el.classList.toggle("is-talk", Boolean(v));
  }, []);
  useEffect(() => {
    const monitor = createSpeakingMonitor({ onChange: applySpeaking });
    monitorRef.current = monitor;
    return () => {
      monitor.dispose();
      monitorRef.current = null;
    };
  }, [applySpeaking]);
  useEffect(() => {
    monitorRef.current?.update(members.map((m) => ({ id: String(m.id), stream: m.stream || null, muted: Boolean(m.muted) })));
  }, [members]);
  useEffect(() => {
    monitorRef.current?.setExternal(activeSpeakerIds ? [...activeSpeakerIds] : []);
  }, [activeSpeakerIds]);

  // ---------------------------------------------------------------- engine + network
  useEffect(() => {
    let disposed = false;
    let engine = null;
    let net = null;
    const probe = probeRenderer();
    const verdict = rendererVerdict({ ...probe, allowSoftware });
    if (!verdict.ok) {
      api.current.onFallback?.(verdict.reason);
      return undefined;
    }
    const report = (p) => api.current.onProgress?.(p);
    (async () => {
      try {
        report(0.01);
        const { WorldEngine } = await loadEngineModule();
        if (disposed) return;
        const preset = resolvePreset(quality, {
          renderer: probe.renderer,
          cores: navigator.hardwareConcurrency || 4,
          memoryGb: navigator.deviceMemory || 8,
          software: verdict.software,
        });
        engine = new WorldEngine(canvasRef.current, {
          assetBase,
          quality: preset,
          selfId,
          lookOverrides,
          cameraPrefs: camPrefs,
          onProgress: report,
          onSeatHint: (h) => setSeatHint(h),
          onEmoteWheel: (cmd) => setWheel((w) => (cmd === "close" ? false : !w)),
          onHelp: (cmd) => setHelp((h) => (cmd === "close" ? false : !h)),
          onChatFocus: () => chatInputRef.current?.focus(),
          onLocalSnapshot: (snap) => netRef.current?.sendSnapshot(snap),
          onActivity: (id, name) => setActivities((prev) => {
            const next = { ...prev };
            if (name) next[id] = name;
            else delete next[id];
            return next;
          }),
          onCameraMode: (mode, prev) => {
            setCameraMode(mode);
            if (prev) setModeToast({ mode, at: Date.now() });
            setCamPrefs((p) => saveCameraPrefs(localStorage, selfId, { ...p, mode }));
          },
          onPointerLock: (v) => setLocked(v),
        });
        engineRef.current = engine;
        for (const [id, el] of tagEls.current) engine.setTagElement(id, el);
        await engine.init();
        if (disposed) {
          engine.dispose();
          return;
        }
        setCameraMode(engine.rig.mode);
        // Electron on Windows: the discrete GPU from the next launch (dual-GPU laptops)
        try {
          window.electronAPI?.world3dPreferHighPerformanceGpu?.();
        } catch {
          /* not Electron */
        }
        window.__descallWorld = engine; // dev / e2e inspection only (no secrets)
        window.__descallWorldClass = WorldEngine; // leak checks: WorldEngine.live
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
        net.socket.on("world:kicked", () => api.current.onExit?.("kicked"));
        const solo = () => {
          const list = [{ id: selfId, name: nameOfRef.current(selfId) }];
          setRoster(list);
          engine.setMembers(list);
        };
        const doJoin = async () => {
          const res = await net.join(kind, roomId);
          if (disposed) return;
          if (!res?.ok) {
            setError(res?.error || "join_failed");
            // offline / not authorised: still show the room alone
            solo();
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
          if (!engine.avatars.size) solo();
        });
        setPhase("ready");
        api.current.onReady?.();
      } catch (err) {
        if (!disposed) {
          console.error("[world3d] engine failed", err);
          setPhase("error");
          setError(String(err?.message || err));
          api.current.onFallback?.("engine");
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

  // mode change label (V): shows for a moment
  useEffect(() => {
    if (!modeToast) return undefined;
    const id = setTimeout(() => setModeToast(null), 1400);
    return () => clearTimeout(id);
  }, [modeToast]);

  // ---------------------------------------------------------------- chat
  useEffect(() => {
    if (kind !== "group" || !mainSocket) return undefined;
    const onMsg = (payload) => {
      if (String(payload?.groupId) !== String(roomId)) return;
      const m = payload.message || {};
      const text = String(m.content || "").trim();
      if (!text || m.media_type) return;
      const name = m.sender?.displayName || m.sender?.display_name || m.sender?.username || nameOfRef.current(m.sender_id);
      setChat((prev) => (prev.some((x) => x.id === m.id) ? prev : prev.concat([{ id: m.id, name, userId: m.sender_id, text }]).slice(-30)));
    };
    mainSocket.on("group:message", onMsg);
    return () => mainSocket.off("group:message", onMsg);
  }, [kind, mainSocket, roomId]);

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
    writeStore(QUALITY_KEY, q);
    const eng = engineRef.current;
    if (!eng) return;
    const preset = q === "auto" ? resolvePreset("auto", { renderer: eng.renderer, cores: navigator.hardwareConcurrency || 4, memoryGb: navigator.deviceMemory || 8 }) : PRESETS[q];
    eng.setQuality(preset);
  }, []);

  const changeCamera = useCallback(
    (patch) => {
      setCamPrefs((p) => {
        const next = saveCameraPrefs(localStorage, selfId, { ...p, ...patch });
        const eng = engineRef.current;
        if (eng) {
          if (patch.mode && patch.mode !== eng.rig.mode) eng.setCameraMode(patch.mode);
          eng.setCameraPrefs(next);
        }
        return next;
      });
    },
    [selfId]
  );

  const toggleHud = useCallback(() => {
    setHud((v) => {
      writeStore(HUD_KEY, v ? "0" : "1");
      return !v;
    });
  }, []);

  // stable ref callback per member: registers the tag with the engine
  const tagRefFor = useCallback((id) => {
    let fn = tagRefFns.current.get(id);
    if (!fn) {
      fn = (el) => {
        if (el) tagEls.current.set(id, el);
        else tagEls.current.delete(id);
        engineRef.current?.setTagElement(id, el || null);
        if (el && monitorRef.current?.isSpeaking(id)) el.classList.add("is-talk");
      };
      tagRefFns.current.set(id, fn);
    }
    return fn;
  }, []);

  // everyone in the world (server roster), with call info merged for avatars / names
  const people = useMemo(() => {
    const ids = roster.length ? roster.map((m) => String(m.id)) : [selfId];
    return ids.map((id) => {
      const call = members.find((m) => String(m.id) === id);
      return { id, name: nameOf(id), avatarUrl: call?.avatarUrl || null };
    });
  }, [roster, members, selfId, nameOf]);

  const countLabel = t("world3d.peopleInRoom", { count: people.length });
  const sitLabel = seatHint === "stand" ? t("world3d.dock.stand") : t("world3d.dock.sit");
  const mode = cameraMode || camPrefs.mode;
  const showLockHint = phase === "ready" && (mode === "first" || mode === "free") && !locked && !wheel && !help && !settings;

  return (
    <div className="w3d-root" data-phase={phase} data-camera={mode}>
      <canvas ref={canvasRef} className="w3d-canvas" aria-label={t("world3d.canvasLabel")} tabIndex={0} />

      <div className="w3d-tags" aria-hidden>
        {people.map((p) => (
          <NameTag key={p.id} id={p.id} name={p.name} activity={activities[p.id] ? t(ACTIVITY_KEYS[activities[p.id]]) : null} tagRef={tagRefFor(p.id)} />
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
        <button type="button" className="w3d-leave" onClick={() => api.current.onExit?.("leave")} title={t("world3d.leaveHint")}>
          {t("world3d.leave")}
        </button>
      </div>

      {modeToast ? (
        <div className="w3d-mode-toast" role="status" key={modeToast.at}>
          {t(`world3d.camera.${modeToast.mode}`)}
        </div>
      ) : null}
      {showLockHint ? <div className="w3d-lock-hint">{mode === "free" ? t("world3d.camera.freeHint") : t("world3d.camera.lockHint")}</div> : null}
      {mode === "first" && locked ? <i className="w3d-reticle" aria-hidden /> : null}

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
          ref={chatInputRef}
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
        <button type="button" className={voice.muted ? "" : "is-on"} aria-pressed={!voice.muted} onClick={() => api.current.voice?.toggleMute?.()} title={voice.muted ? t("Unmute") : t("Mute")}>
          {t("world3d.dock.mic")}
        </button>
        <button type="button" className={voice.deafened ? "is-red" : ""} aria-pressed={Boolean(voice.deafened)} onClick={() => api.current.voice?.toggleDeafen?.()} title={voice.deafened ? t("Undeafen") : t("Deafen")}>
          {t("world3d.dock.sound")}
        </button>
        <button type="button" className={wheel ? "is-on" : ""} aria-pressed={wheel} onClick={() => setWheel((w) => !w)} title={t("world3d.emote.label")}>
          {t("world3d.dock.emoji")}
        </button>
        <button type="button" className={voice.isScreenSharing ? "is-on" : ""} aria-pressed={Boolean(voice.isScreenSharing)} disabled={!voice.toggleScreen || voice.canVideo === false} onClick={() => api.current.voice?.toggleScreen?.()} title={t("Share Screen")}>
          {t("world3d.dock.screen")}
        </button>
        <i className="w3d-sep" aria-hidden />
        <button type="button" className={seatHint === "stand" ? "is-on" : ""} disabled={!seatHint} onClick={() => engineRef.current?.toggleSit()} title={t("world3d.sitHint")}>
          {sitLabel}
        </button>
        <button type="button" className={voice.isCameraOn ? "is-on" : ""} aria-pressed={Boolean(voice.isCameraOn)} disabled={!voice.toggleCamera || voice.canVideo === false} onClick={() => api.current.voice?.toggleCamera?.()} title={t("Camera")}>
          {t("world3d.dock.camera")}
        </button>
        <button type="button" className={settings ? "is-on" : ""} aria-expanded={settings} onClick={() => setSettings((s) => !s)} title={t("world3d.dock.settings")}>
          {t("world3d.dock.settings")}
        </button>
      </div>

      {settings ? (
        <div className="w3d-settings w3d-glass" role="dialog" aria-label={t("world3d.dock.settings")}>
          <p className="w3d-settings-h">{t("world3d.quality.label")}</p>
          <div className="w3d-seg" role="radiogroup" aria-label={t("world3d.quality.label")}>
            {["auto", "low", "medium", "high"].map((q) => (
              <button key={q} type="button" role="radio" aria-checked={quality === q} className={quality === q ? "is-on" : ""} onClick={() => changeQuality(q)}>
                {t(`world3d.quality.${q}`)}
              </button>
            ))}
          </div>
          <p className="w3d-settings-h">{t("world3d.camera.label")}</p>
          <div className="w3d-seg" role="radiogroup" aria-label={t("world3d.camera.label")}>
            {CAMERA_MODES.map((m) => (
              <button key={m} type="button" role="radio" aria-checked={mode === m} className={mode === m ? "is-on" : ""} onClick={() => changeCamera({ mode: m })}>
                {t(`world3d.camera.${m}`)}
              </button>
            ))}
          </div>
          <label className="w3d-range">
            <span>{t("world3d.camera.fov")}</span>
            <output>{`${camPrefs.fov}°`}</output>
            <input type="range" min={FOV_RANGE[0]} max={FOV_RANGE[1]} step={1} value={camPrefs.fov} onChange={(e) => changeCamera({ fov: Number(e.target.value) })} />
          </label>
          <label className="w3d-range">
            <span>{t("world3d.camera.sensitivity")}</span>
            <output>{`${camPrefs.sensitivity.toFixed(2)}x`}</output>
            <input type="range" min={SENSITIVITY_RANGE[0]} max={SENSITIVITY_RANGE[1]} step={0.05} value={camPrefs.sensitivity} onChange={(e) => changeCamera({ sensitivity: Number(e.target.value) })} />
          </label>
          <Toggle on={camPrefs.invertY} label={t("world3d.camera.invertY")} onChange={(v) => changeCamera({ invertY: v })} />
          <Toggle on={camPrefs.headBob} label={t("world3d.camera.headBob")} onChange={(v) => changeCamera({ headBob: v })} />
          <Toggle on={hud} label={t("world3d.perf.toggle")} onChange={toggleHud} />
          <div className="w3d-settings-rows">
            <button type="button" className="w3d-row" onClick={() => { setSettings(false); setHelp(true); }}>
              {t("world3d.help.open")}
            </button>
            <button type="button" className="w3d-row" onClick={() => engineRef.current?.resetCamera()}>
              {t("world3d.resetCamera")}
            </button>
            <button type="button" className="w3d-row" onClick={() => api.current.onExit?.("flat")}>
              {t("world3d.flatView")}
            </button>
          </div>
        </div>
      ) : null}

      {help ? <HelpOverlay t={t} mode={mode} onClose={() => setHelp(false)} /> : null}
      {hud && phase === "ready" ? <PerfHud engineRef={engineRef} t={t} /> : null}

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

/** Re-render only when something the view shows changed (callbacks come through `api`). */
function memberKey(members) {
  let k = "";
  for (const m of members || []) k += `${m.id}:${m.name || ""}:${m.muted ? 1 : 0}:${m.stream?.id || ""}:${m.avatarUrl || ""}|`;
  return k;
}
function speakerKey(ids) {
  return ids ? [...ids].map(String).sort().join(",") : "";
}
export function worldPropsEqual(a, b) {
  const va = a.voice || {};
  const vb = b.voice || {};
  return (
    a.kind === b.kind &&
    a.roomId === b.roomId &&
    a.title === b.title &&
    (a.me?.id ?? null) === (b.me?.id ?? null) &&
    (a.me?.displayName || a.me?.username) === (b.me?.displayName || b.me?.username) &&
    memberKey(a.members) === memberKey(b.members) &&
    Boolean(va.muted) === Boolean(vb.muted) &&
    Boolean(va.deafened) === Boolean(vb.deafened) &&
    Boolean(va.isScreenSharing) === Boolean(vb.isScreenSharing) &&
    Boolean(va.isCameraOn) === Boolean(vb.isCameraOn) &&
    Boolean(va.toggleScreen) === Boolean(vb.toggleScreen) &&
    Boolean(va.toggleCamera) === Boolean(vb.toggleCamera) &&
    va.canVideo === vb.canVideo &&
    speakerKey(a.activeSpeakerIds) === speakerKey(b.activeSpeakerIds) &&
    a.mainSocket === b.mainSocket &&
    a.socketUrl === b.socketUrl &&
    a.token === b.token &&
    a.assetBase === b.assetBase &&
    a.allowSoftware === b.allowSoftware &&
    a.lookOverrides === b.lookOverrides &&
    a.api === b.api
  );
}

export default memo(World3DView, worldPropsEqual);
