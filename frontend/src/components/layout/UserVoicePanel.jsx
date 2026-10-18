import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { ChevronUp, Gamepad2, Headphones, HeadphoneOff, Mic, MicOff, MonitorUp, PhoneOff, Settings } from "lucide-react";
import { Avatar } from "../ui/Avatar";
import { CallDeviceMenu } from "../call/DevicePicker";
import { STATUS_META } from "../../lib/presence";
import { getUser } from "../../lib/storage";
import { resolveAvatarUrl, resolveDisplayName } from "../../lib/userProfile";
import { useT } from "../../context/LocaleContext";
import { inputMenuGroups, outputMenuGroups } from "../../lib/callDeviceMenus";
import { readAudioPrefs, writeAudioPref } from "../../lib/callAudioDevices";
import { readLocalMute, writeLocalMute } from "../../lib/voiceProfile";
import {
  activityGameName,
  deriveVoiceSession,
  matchVoiceShortcut,
  pingTone,
  readDeafenPref,
  sessionRoomLabel,
  smoothPing,
  statusSubline,
  writeDeafenPref,
  UVP_STATUS_EVENT,
} from "../../lib/userVoicePanel";

const NARROW_MAX = 1000;
const COMPACT_PANEL_PX = 372;
const PING_EVERY_MS = 5000;

/** Compact mode follows the panel's own width (sidebar width varies with the window). */
function usePanelCompact(ref) {
  const [compact, setCompact] = useState(() => (typeof window !== "undefined" ? window.innerWidth < NARROW_MAX : false));
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry?.contentRect?.width || el.clientWidth;
      setCompact(w < COMPACT_PANEL_PX || window.innerWidth < NARROW_MAX);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return compact;
}

/** Signalling RTT over the socket (app:ping ack), median of the last 3. */
function useSocketPing(socket, active) {
  const [ms, setMs] = useState(null);
  useEffect(() => {
    if (!active || !socket) {
      setMs(null);
      return undefined;
    }
    let alive = true;
    const samples = [];
    const probe = () => {
      if (!socket.connected || typeof socket.timeout !== "function") return;
      const t0 = performance.now();
      socket.timeout(4000).emit("app:ping", (err) => {
        if (!alive) return;
        if (err) return; // no ack: keep the last value rather than inventing one
        samples.push(performance.now() - t0);
        while (samples.length > 3) samples.shift();
        setMs(smoothPing(samples));
      });
    };
    probe();
    const id = setInterval(probe, PING_EVERY_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [socket, active]);
  return ms;
}

/** Device lists while idle (choices are saved and used on the next join). */
function useIdleDevices(enabled) {
  const [devices, setDevices] = useState({ input: [], output: [] });
  const [prefs, setPrefs] = useState(() => readAudioPrefs());
  const refresh = useCallback(async () => {
    try {
      const list = await navigator.mediaDevices?.enumerateDevices?.();
      if (!list) return;
      setDevices({
        input: list.filter((d) => d.kind === "audioinput"),
        output: list.filter((d) => d.kind === "audiooutput"),
      });
    } catch {
      /* unsupported */
    }
  }, []);
  useEffect(() => {
    if (!enabled) return undefined;
    refresh();
    const md = navigator.mediaDevices;
    md?.addEventListener?.("devicechange", refresh);
    return () => md?.removeEventListener?.("devicechange", refresh);
  }, [enabled, refresh]);
  return useMemo(
    () => ({
      audioInputDevices: devices.input,
      audioOutputDevices: devices.output,
      selectedAudioInput: prefs.input,
      selectedAudioOutput: prefs.output,
      setAudioInput: (id) => {
        writeAudioPref("input", id);
        setPrefs(readAudioPrefs());
      },
      setAudioOutput: (id) => {
        writeAudioPref("output", id);
        setPrefs(readAudioPrefs());
      },
      refresh,
    }),
    [devices, prefs, refresh]
  );
}

function SignalBars({ tone, connecting }) {
  return (
    <svg className={`uvp-signal tone-${tone}${connecting ? " is-connecting" : ""}`} viewBox="0 0 20 20" aria-hidden="true">
      <rect x="2" y="12" width="3.2" height="5" rx="1.2" />
      <rect x="8.4" y="8" width="3.2" height="9" rx="1.2" />
      <rect x="14.8" y="3.5" width="3.2" height="13.5" rx="1.2" />
    </svg>
  );
}

function SplitControl({ off, open, icon, label, menuLabel, onToggle, onMenu, anchorRef, shortcut }) {
  return (
    <div ref={anchorRef} className={`uvp-split${off ? " is-off" : ""}${open ? " is-open" : ""}`}>
      <button type="button" className="uvp-split-main" aria-pressed={off} aria-label={label} title={shortcut ? `${label} (${shortcut})` : label} onClick={onToggle}>
        {icon}
      </button>
      <button
        type="button"
        className="uvp-split-chev"
        aria-label={menuLabel}
        title={menuLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={onMenu}
      >
        <ChevronUp size={11} strokeWidth={2.6} aria-hidden />
      </button>
    </div>
  );
}

export default function UserVoicePanel({
  me,
  myStatus = "online",
  currentActivity,
  call,
  groupCall,
  serverVoice,
  groups,
  servers,
  socket,
  onOpenSettings,
  onOpenDm,
  onOpenGroup,
  onOpenServer,
}) {
  const t = useT();
  const reduce = useReducedMotion();
  const panelRef = useRef(null);
  const narrow = usePanelCompact(panelRef);
  const session = deriveVoiceSession({ call, groupCall, serverVoice, groups, servers });
  const live = session.kind !== "none";
  const hook = session.kind === "server" ? serverVoice : session.kind === "group" ? groupCall : session.kind === "dm" ? call : null;

  // Idle mute/deafen are preferences the hooks honour on the next join.
  const [idleMuted, setIdleMuted] = useState(() => readLocalMute());
  const [idleDeafened, setIdleDeafened] = useState(() => readDeafenPref());
  const muted = live ? session.muted : idleMuted || idleDeafened;
  const deafened = live ? session.deafened : idleDeafened;

  // Apply an idle deafen choice once per session start.
  const appliedRef = useRef("");
  const sessionKey = live ? `${session.kind}:${session.title}:${session.subtitle}` : "";
  useEffect(() => {
    if (!live || session.phase !== "connected") {
      if (!live) appliedRef.current = "";
      return;
    }
    if (appliedRef.current === sessionKey) return;
    appliedRef.current = sessionKey;
    if (readDeafenPref() && !session.deafened) hook?.toggleDeafen?.();
  }, [live, session.phase, sessionKey, session.deafened, hook]);

  const socketPing = useSocketPing(socket, live && session.phase === "connected");
  const ping = session.mediaRtt ?? socketPing;
  const tone = session.phase === "connecting" ? "warn" : pingTone(ping);

  const idleDevices = useIdleDevices(!live);
  const deviceHook = hook || idleDevices;
  const [menu, setMenu] = useState(null); // "in" | "out" | null
  const micRef = useRef(null);
  const outRef = useRef(null);
  const closeMenu = useCallback(() => setMenu(null), []);

  const toggleMute = useCallback(() => {
    if (live) {
      // Deafened + unmute: undeafen first (Discord behaviour), mic follows.
      if (session.deafened) hook?.toggleDeafen?.();
      else hook?.toggleMute?.();
      return;
    }
    if (idleDeafened) {
      setIdleDeafened(false);
      writeDeafenPref(false);
      setIdleMuted(false);
      writeLocalMute(false);
      return;
    }
    const next = !idleMuted;
    setIdleMuted(next);
    writeLocalMute(next);
  }, [live, session.deafened, hook, idleDeafened, idleMuted]);

  const toggleDeafen = useCallback(() => {
    if (live) {
      hook?.toggleDeafen?.();
      writeDeafenPref(!session.deafened);
      return;
    }
    const next = !idleDeafened;
    setIdleDeafened(next);
    writeDeafenPref(next);
  }, [live, hook, session.deafened, idleDeafened]);

  const toggleScreen = useCallback(async () => {
    if (!hook || !session.canScreenShare) return;
    try {
      if (session.screenSharing) await hook.stopScreenShare?.();
      else await hook.startScreenShare?.();
    } catch {
      /* hooks toast their own errors */
    }
  }, [hook, session.canScreenShare, session.screenSharing]);

  const disconnect = useCallback(() => {
    if (session.kind === "server") serverVoice?.leave?.();
    else if (session.kind === "group") groupCall?.leaveCall?.();
    else if (session.kind === "dm") call?.endCall?.(call?.peer?.id);
  }, [session.kind, serverVoice, groupCall, call]);

  const openRoom = useCallback(() => {
    if (session.kind === "dm" && call?.peer) onOpenDm?.(call.peer);
    else if (session.kind === "group") {
      const g = (groups || []).find((x) => String(x?.id) === String(groupCall?.activeGroupId));
      if (g) onOpenGroup?.(g);
    } else if (session.kind === "server") {
      const s = (servers || []).find((x) => String(x?.id) === String(serverVoice?.activeServerId));
      if (s) onOpenServer?.(s);
    }
  }, [session.kind, call, groups, groupCall, servers, serverVoice, onOpenDm, onOpenGroup, onOpenServer]);

  // Ctrl/⌘+Shift+M · Ctrl/⌘+Shift+D (not while typing in a field that wants them).
  useEffect(() => {
    const onKey = (e) => {
      const action = matchVoiceShortcut(e);
      if (!action) return;
      e.preventDefault();
      if (action === "mute") toggleMute();
      else toggleDeafen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleMute, toggleDeafen]);

  // User row
  const stored = getUser();
  const user = me?.avatarUrl || me?.avatar_url ? me : stored && (!me?.id || stored.id === me.id) ? { ...me, ...stored } : me;
  const avatarUrl = resolveAvatarUrl(user) || resolveAvatarUrl(stored) || null;
  const displayName = resolveDisplayName(user) || t("You");
  const statusKey = STATUS_META[myStatus] ? myStatus : "online";
  const statusLabel = t(statusKey === "dnd" ? "Do Not Disturb" : STATUS_META[statusKey]?.label || "Online");
  const game = activityGameName(currentActivity);
  const sub = statusSubline({
    statusLabel,
    customStatus: me?.customStatus || me?.custom_status || "",
    game,
    narrow,
    t,
  });
  const avatarRef = useRef(null);
  const openStatus = () => {
    const r = avatarRef.current?.getBoundingClientRect();
    window.dispatchEvent(new CustomEvent(UVP_STATUS_EVENT, { detail: r ? { left: r.left, top: r.top, bottom: r.bottom, right: r.right } : null }));
  };

  const mod = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || "") ? "⌘" : "Ctrl";
  const roomLabel = sessionRoomLabel(session, t);
  const transition = reduce ? { duration: 0.15 } : { type: "spring", bounce: 0, duration: 0.38 };

  const micIcon = muted ? <MicOff size={17} strokeWidth={2} /> : <Mic size={17} strokeWidth={2} />;
  const outIcon = deafened ? <HeadphoneOff size={17} strokeWidth={2} /> : <Headphones size={17} strokeWidth={2} />;

  return (
    <section ref={panelRef} className={`uvp${narrow ? " is-narrow" : ""}${live ? " is-live" : ""}`} aria-label={t("uvp.panel")} data-phase={session.phase}>
      <AnimatePresence initial={false} mode="popLayout">
        {live ? (
          <motion.div
            key="live"
            className="uvp-voice"
            initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, height: "auto" }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={transition}
          >
            <div className="uvp-voice-inner">
              <div className="uvp-vtop">
                <span className="uvp-signal-wrap" title={ping != null ? t("uvp.pingTitle", { ms: ping }) : undefined}>
                  <SignalBars tone={tone} connecting={session.phase === "connecting"} />
                </span>
                <button type="button" className="uvp-vtext" onClick={openRoom} title={roomLabel}>
                  <span className={`uvp-status ${session.phase === "connecting" ? "is-connecting" : ""}`}>
                    {session.phase === "connecting" ? t("uvp.connecting") : t("uvp.connected")}
                  </span>
                  <span className="uvp-room">
                    <span className="uvp-room-name">{roomLabel}</span>
                    {session.phase === "connected" && ping != null ? (
                      <span className={`uvp-ping tone-${tone}`}> · {ping} ms</span>
                    ) : null}
                  </span>
                </button>
                <button type="button" className="uvp-hang" onClick={disconnect} aria-label={t("Disconnect")} title={t("Disconnect")}>
                  <PhoneOff size={17} strokeWidth={2.1} />
                </button>
              </div>
              <div className="uvp-btns">
                <button
                  type="button"
                  className={`uvp-pill${session.screenSharing ? " is-on" : ""}`}
                  onClick={toggleScreen}
                  disabled={!session.canScreenShare}
                  aria-pressed={session.screenSharing}
                >
                  <MonitorUp size={16} strokeWidth={2} />
                  <span>{session.screenSharing ? t("uvp.stopShare") : narrow ? t("uvp.shareShort") : t("uvp.share")}</span>
                </button>
                <button type="button" className={`uvp-pill${muted ? " is-off" : ""}`} onClick={toggleMute} aria-pressed={muted}>
                  {micIcon}
                  <span>{muted ? t("uvp.muted") : t("Microphone")}</span>
                </button>
                <button type="button" className={`uvp-pill${deafened ? " is-off" : ""}`} onClick={toggleDeafen} aria-pressed={deafened}>
                  {outIcon}
                  <span>{deafened ? t("uvp.deafened") : t("Deafen")}</span>
                </button>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="idle"
            className="uvp-idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={reduce ? { duration: 0.12 } : { duration: 0.2 }}
          >
            <span className="uvp-dot" aria-hidden="true" />
            <span>{t("uvp.noVoice")}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="uvp-user">
        <button
          type="button"
          ref={avatarRef}
          data-uvp-avatar=""
          className="uvp-avatar"
          onClick={openStatus}
          aria-haspopup="menu"
          aria-label={`${displayName}, ${t("change status")}`}
        >
          <Avatar name={displayName} size={narrow ? 36 : 40} user={user} imageUrl={avatarUrl} animate="always" loading="eager" />
          <span className={`uvp-status-dot status-${statusKey}`} />
        </button>
        <div className="uvp-name">
          <b>{displayName}</b>
          {sub.text ? (
            <small title={sub.title || sub.text}>
              {sub.hasGame ? <Gamepad2 size={13} strokeWidth={2} aria-hidden /> : null}
              <span>{sub.text}</span>
            </small>
          ) : null}
        </div>
        <SplitControl
          anchorRef={micRef}
          off={muted}
          open={menu === "in"}
          icon={micIcon}
          label={muted ? t("Unmute") : t("Mute")}
          menuLabel={t("Choose microphone")}
          shortcut={`${mod}+Shift+M`}
          onToggle={toggleMute}
          onMenu={() => setMenu((m) => (m === "in" ? null : "in"))}
        />
        <SplitControl
          anchorRef={outRef}
          off={deafened}
          open={menu === "out"}
          icon={outIcon}
          label={deafened ? t("Undeafen") : t("Deafen")}
          menuLabel={t("Choose speaker")}
          shortcut={`${mod}+Shift+D`}
          onToggle={toggleDeafen}
          onMenu={() => setMenu((m) => (m === "out" ? null : "out"))}
        />
        <button type="button" className="uvp-gear" onClick={onOpenSettings} aria-label={t("settings.title")} title={t("settings.title")}>
          <Settings size={18} strokeWidth={1.9} />
        </button>
      </div>

      <CallDeviceMenu
        open={menu === "in"}
        anchorRef={micRef}
        title={t("Choose microphone")}
        groups={inputMenuGroups(deviceHook, t)}
        onClose={closeMenu}
        menuId="uvp-mic-menu"
      />
      <CallDeviceMenu
        open={menu === "out"}
        anchorRef={outRef}
        title={t("Choose speaker")}
        groups={outputMenuGroups(deviceHook, t)}
        onClose={closeMenu}
        menuId="uvp-out-menu"
      />
    </section>
  );
}
