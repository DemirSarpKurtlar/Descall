/**
 * Views rendered into the Descall+ portal windows (AuxWindow): mini mode, the call
 * (picture-in-picture) window and the desktop sidebar. Call state and actions come from
 * desktopBus (useElectronOverlay publishes them), app lists from usePremiumAppSnapshot.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useT } from "../../context/LocaleContext";
import { Mic, MicOff, Headphones, HeadphoneOff, PhoneOff, X, Pin, PinOff, ExternalLink } from "../../components/ui/Icon.jsx";
import { DescallMark } from "../../components/social/AdminBadge.jsx";
import { appAction, appSlot, callSlot, runCallAction } from "./desktopBus.js";
import { hasPremiumFeature } from "../premiumStore.js";

const bridge = () => (typeof window !== "undefined" ? window.descallPremium : null);

export function useCall() {
  return useSyncExternalStore(callSlot.subscribe, callSlot.get, callSlot.get);
}

export function useApp() {
  return useSyncExternalStore(appSlot.subscribe, appSlot.get, appSlot.get);
}

function useElapsed(since, on) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on || !since) return undefined;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [since, on]);
  if (!since) return "";
  const s = Math.max(0, Math.floor((now - since) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

function initials(name) {
  return String(name || "?").trim().slice(0, 1).toUpperCase() || "?";
}

function Avatar({ url, name, small }) {
  return (
    <span className={`ax-avatar${small ? " sm" : ""}`} style={url ? { backgroundImage: `url("${String(url).replace(/"/g, "")}")` } : undefined} aria-hidden="true">
      {url ? null : initials(name)}
    </span>
  );
}

function usePinned(kind) {
  const [pinned, setPinned] = useState(true);
  useEffect(() => {
    let live = true;
    bridge()?.invoke("premium:window:pinned", kind).then((r) => { if (live && r?.ok) setPinned(Boolean(r.pinned)); }).catch(() => {});
    return () => { live = false; };
  }, [kind]);
  const toggle = () => {
    bridge()?.invoke("premium:window:pin", kind, !pinned).then((r) => { if (r?.ok) setPinned(Boolean(r.pinned)); }).catch(() => {});
  };
  return [pinned, toggle];
}

function Bar({ kind, title, onClose, extra }) {
  const t = useT();
  const canPin = hasPremiumFeature("always_on_top");
  const [pinned, togglePin] = usePinned(kind);
  return (
    <div className="ax-bar" title={t("premium.win.dragHint")}>
      <DescallMark size={16} className="ax-mark" />
      <span className="ax-title">{title}</span>
      {extra}
      {canPin ? (
        <button type="button" className={`ax-ib${pinned ? " on" : ""}`} aria-pressed={pinned} aria-label={t("premium.win.pin")} title={t("premium.win.pin")} onClick={togglePin}>
          {pinned ? <Pin size={15} /> : <PinOff size={15} />}
        </button>
      ) : null}
      <button type="button" className="ax-ib" aria-label={t("premium.win.openApp")} title={t("premium.win.openApp")} onClick={() => bridge()?.invoke("premium:focus-main").catch(() => {})}>
        <ExternalLink size={15} />
      </button>
      <button type="button" className="ax-ib" aria-label={t("premium.win.close")} title={t("premium.win.close")} onClick={onClose}>
        <X size={15} />
      </button>
    </div>
  );
}

export function CallControls({ call, compact }) {
  const t = useT();
  return (
    <div className="ax-controls">
      <button type="button" className={`ax-btn${compact ? " icon" : ""}${call.muted ? " active" : ""}`} aria-pressed={call.muted} aria-label={call.muted ? t("premium.win.unmute") : t("premium.win.mute")} title={call.muted ? t("premium.win.unmute") : t("premium.win.mute")} data-action="mute" onClick={() => runCallAction("mute")}>
        {call.muted ? <MicOff size={16} /> : <Mic size={16} />}
      </button>
      <button type="button" className={`ax-btn${compact ? " icon" : ""}${call.deafened ? " active" : ""}`} aria-pressed={call.deafened} aria-label={call.deafened ? t("premium.win.undeafen") : t("premium.win.deafen")} title={call.deafened ? t("premium.win.undeafen") : t("premium.win.deafen")} data-action="deafen" onClick={() => runCallAction("deafen")}>
        {call.deafened ? <HeadphoneOff size={16} /> : <Headphones size={16} />}
      </button>
      <button type="button" className={`ax-btn danger${compact ? " icon" : ""}`} aria-label={t("premium.win.hangup")} title={t("premium.win.hangup")} data-action="leave" onClick={() => runCallAction("leave")}>
        <PhoneOff size={16} />
      </button>
    </div>
  );
}

function CallCard({ call }) {
  const t = useT();
  const elapsed = useElapsed(call.since, call.active && !call.pending);
  return (
    <div className="ax-call">
      <Avatar url={call.avatarUrl} name={call.title} />
      <div className="ax-call-text">
        <div className="ax-call-title">{call.title}</div>
        <div className="ax-call-sub">{call.pending ? t("premium.win.connecting") : <span className="ax-live">{elapsed}</span>}</div>
      </div>
    </div>
  );
}

export function MiniView({ onClose }) {
  const t = useT();
  const call = useCall();
  const app = useApp();
  return (
    <div className="ax-shell" data-testid="premium-mini">
      <Bar
        kind="mini"
        title={t("premium.win.mini")}
        onClose={onClose}
        extra={
          <span className="ax-unread ax-nodrag" aria-live="polite">
            {app.unread > 0 ? <span className="ax-pill" title={t("premium.win.unread", { n: app.unread })}>{app.unread > 99 ? "99+" : app.unread}</span> : null}
          </span>
        }
      />
      <div className="ax-body">
        {call.active ? (
          <>
            <CallCard call={call} />
            <CallControls call={call} />
          </>
        ) : (
          <>
            <div className="ax-empty">{t("premium.win.noCall")}</div>
            <div className="ax-unread">{app.unread > 0 ? t("premium.win.unread", { n: app.unread }) : t("premium.win.allRead")}</div>
          </>
        )}
      </div>
    </div>
  );
}

/** The best live video of the call in the main document: largest painted, else largest stream. */
export function pickCallVideo(doc = document) {
  const vids = [...doc.querySelectorAll("video")].filter((v) => {
    const s = v.srcObject;
    return s && typeof s.getVideoTracks === "function" && s.getVideoTracks().some((tr) => tr.readyState === "live" && tr.enabled !== false);
  });
  if (!vids.length) return null;
  const isLocal = (v) => Boolean(v.closest?.("[data-local='true'], [data-self='true'], .is-local, .is-self, .self-view"));
  const remote = vids.filter((v) => !isLocal(v));
  const pool = remote.length ? remote : vids;
  const score = (v) => {
    const r = v.getBoundingClientRect?.() || { width: 0, height: 0 };
    return r.width * r.height * 10 + (v.videoWidth || 0) * (v.videoHeight || 0);
  };
  return pool.sort((a, b) => score(b) - score(a))[0];
}

export function CallView({ onClose }) {
  const t = useT();
  const call = useCall();
  const videoRef = useRef(null);
  const [hasVideo, setHasVideo] = useState(false);

  useEffect(() => {
    if (!call.active) { setHasVideo(false); return undefined; }
    let current = null;
    const sync = () => {
      const src = pickCallVideo(document);
      const stream = src?.srcObject || null;
      const el = videoRef.current;
      if (!el) return;
      if (stream !== current) {
        current = stream;
        el.srcObject = stream;
        if (stream) el.play?.().catch(() => {});
      }
      setHasVideo(Boolean(stream));
    };
    sync();
    const id = window.setInterval(sync, 2000);
    return () => {
      window.clearInterval(id);
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [call.active]);

  return (
    <div className="ax-shell square" data-testid="premium-call">
      <Bar kind="call" title={call.active ? call.title : t("premium.win.call")} onClose={onClose} />
      <div className="ax-stage">
        {/* Muted: the call audio keeps playing from the main window. */}
        <video ref={videoRef} autoPlay playsInline muted style={hasVideo ? undefined : { visibility: "hidden" }} />
        {!hasVideo ? (
          <div className="ax-novideo">
            {call.active ? <Avatar url={call.avatarUrl} name={call.title} /> : null}
            <div>{call.active ? t("premium.win.noVideo") : t("premium.win.noCall")}</div>
          </div>
        ) : null}
        {call.active ? (
          <div className="ax-overlay-bar">
            <CallControls call={call} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function PersonRow({ p, onOpen }) {
  return (
    <button type="button" className="ax-row" onClick={() => onOpen(p)} title={p.name}>
      <Avatar small url={p.avatarUrl} name={p.name} />
      {p.presence && p.presence !== "offline" ? <span className={`ax-dot ${p.presence}`} aria-hidden="true" /> : null}
      <span className="ax-name">{p.name}</span>
      {p.unread > 0 ? <span className="ax-pill">{p.unread > 99 ? "99+" : p.unread}</span> : null}
    </button>
  );
}

export function SidebarView({ onClose }) {
  const t = useT();
  const call = useCall();
  const app = useApp();
  const open = (p) => {
    if (p?.username) appAction("navigate", `/direct/${encodeURIComponent(p.username)}`);
    bridge()?.invoke("premium:focus-main").catch(() => {});
  };
  return (
    <div className="ax-shell square" data-testid="premium-sidebar">
      <Bar kind="sidebar" title={t("premium.win.sidebar")} onClose={onClose} />
      <div className="ax-body">
        {call.active ? (
          <>
            <div className="ax-sec">{t("premium.win.call")}</div>
            <CallCard call={call} />
            <CallControls call={call} compact />
          </>
        ) : null}
        <div className="ax-scroll">
          <div className="ax-sec">{t("premium.win.dms")}</div>
          {app.dms.length ? app.dms.slice(0, 12).map((p) => <PersonRow key={`d${p.id}`} p={p} onOpen={open} />) : <div className="ax-empty">{t("premium.win.noDms")}</div>}
          <div className="ax-sec">{t("premium.win.online")}</div>
          {app.friends.length ? app.friends.map((p) => <PersonRow key={`f${p.id}`} p={p} onOpen={open} />) : <div className="ax-empty">{t("premium.win.nobodyOnline")}</div>}
        </div>
      </div>
    </div>
  );
}
