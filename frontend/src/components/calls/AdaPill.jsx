import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Bluetooth, Car, Cast, Check, Headphones, Maximize2, MessageSquare, Mic, MicOff, Monitor, Phone, PhoneOff,
  RotateCcw, Smartphone, Video, Volume2,
} from "../ui/Icon.jsx";
import { Avatar } from "../ui/Avatar";
import { ServerIcon } from "../servers/ServerIcon.jsx";
import CallTimer from "../call/CallTimer";
import { useT } from "../../context/LocaleContext";
import useModalFocus from "../../hooks/useModalFocus";
import { hapticImpactLight, hapticImpactMedium, hapticSelection, hapticWarning } from "../../lib/fluid/haptics";
import { ADA, adaChrome, adaEvents, adaGestureOnEnd, adaGestureOnMove, adaLongPressAlive } from "../../lib/adaPill";
import { setCallIslandChrome } from "../../lib/glassDisplay.js";
import "./AdaPill.css";

/**
 * Phone in-call pill "Ada" (draft A). A minimized call wraps the hardware Dynamic
 * Island; it never sits over the header, the messages, the composer or the keyboard.
 *   tap / pull down     full-screen call (onExpand)
 *   touch and hold      quick panel: mute, audio output, go to chat, full screen, hold-to-end
 *   swipe sideways      mute / unmute, with a short Undo
 * Events (joined, left, reconnecting, screen share, camera) briefly widen it.
 * State comes from lib/adaPill.js (AdaCallHost builds the model).
 */

function reducedMotion() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function Face({ person, size = 25, speaking = false, className = "" }) {
  return (
    <span className={`ada-face${speaking ? " is-speaking" : ""}${className ? ` ${className}` : ""}`} style={{ "--s": `${size}px` }}>
      <Avatar user={person?.user || person} name={person?.name} imageUrl={person?.avatarUrl || undefined} size={size} frame={false} animate={false} />
    </span>
  );
}

function Wave({ tone = "green", active = false, big = false }) {
  return (
    <span className={`ada-wave is-${tone}${active ? " is-active" : ""}${big ? " is-big" : ""}`} aria-hidden="true">
      <i /><i /><i /><i /><i />
    </span>
  );
}

function Bars({ tone = "amber", level = 1 }) {
  return (
    <span className={`ada-bars is-${tone}`} data-level={level} aria-hidden="true">
      <i /><i /><i /><i />
    </span>
  );
}

function routeIcon(kind, size = 21) {
  switch (kind) {
    case "receiver":
      return <Smartphone size={size} aria-hidden="true" />;
    case "bluetooth":
      return <Bluetooth size={size} aria-hidden="true" />;
    case "headphones":
      return <Headphones size={size} aria-hidden="true" />;
    case "car":
      return <Car size={size} aria-hidden="true" />;
    case "airplay":
      return <Cast size={size} aria-hidden="true" />;
    default:
      return <Volume2 size={size} aria-hidden="true" />;
  }
}

export function routeLabel(option, t) {
  if (!option) return t("ada.btn.output");
  switch (option.kind) {
    case "speaker":
      return t("ada.route.speaker");
    case "receiver":
      return t("ada.route.receiver");
    case "bluetooth":
      return option.name || t("ada.route.bluetooth");
    case "headphones":
      return option.name || t("ada.route.headphones");
    case "car":
      return option.name || t("ada.route.car");
    case "airplay":
      return option.name || t("ada.route.airplay");
    default:
      return option.name || t("ada.route.other");
  }
}

function qualityLabel(model, t) {
  if (model.quality === "excellent" || model.quality === "good") return t("ada.quality.good");
  if (model.quality === "fair") return t("ada.quality.fair");
  if (model.quality === "poor" || model.quality === "bad") return t("ada.quality.poor");
  return "";
}

function statusText(model, face, t) {
  if (model.phase === "ended") return t("ada.status.ended");
  if (model.phase === "reconnecting") return t("ada.status.reconnecting");
  if (model.phase === "ringing") return t("ada.status.ringing");
  if (model.phase === "connecting") return t("ada.status.connecting");
  if (face?.mode === "muted") return t("ada.status.muted");
  return t("ada.status.live");
}

function ScreenThumb({ stream, label }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !stream) return undefined;
    el.srcObject = stream;
    el.play?.().catch(() => {});
    return () => {
      if (el.srcObject === stream) el.srcObject = null;
    };
  }, [stream]);
  return (
    <span className="ada-thumb" aria-hidden="true">
      {stream ? <video ref={ref} muted playsInline autoPlay /> : null}
      {label ? <em>{label}</em> : null}
    </span>
  );
}

function PillLeft({ model, face }) {
  if (face.left === "end") {
    return (
      <span className="ada-end-dot">
        <PhoneOff size={15} aria-hidden="true" />
      </span>
    );
  }
  if (face.left === "spinner") return <span className="ada-spin" aria-hidden="true" />;
  if (face.left === "server") {
    return (
      <span className="ada-srv">
        <ServerIcon server={model.server?.raw || model.server} name={model.server?.name || model.title} className="ada-srv-img" fallbackClassName="ada-srv-fb" />
      </span>
    );
  }
  if (face.left === "stack") {
    const second = model.people.find((p) => p.id !== model.speaker?.id);
    return (
      <span className="ada-stack">
        <Face person={model.speaker} speaking={model.speaking} />
        {second ? <Face person={second} className="is-second" /> : null}
      </span>
    );
  }
  return <Face person={model.speaker} speaking={model.speaking && face.mode !== "muted"} />;
}

function PillRight({ model, face }) {
  switch (face.right) {
    case "timer":
      return (
        <span className="ada-r is-red tnum">
          <CallTimer startedAt={model.startedAt} stoppedAt={model.stoppedAt || model.endedAt} />
        </span>
      );
    case "signal":
      return (
        <span className="ada-r is-amber">
          <Bars tone="amber" level={1} />
        </span>
      );
    case "mic-off":
      return (
        <span className="ada-r is-red">
          {face.count ? <b className="tnum">{face.count}</b> : null}
          <MicOff size={18} aria-hidden="true" />
        </span>
      );
    case "screen":
      return (
        <span className="ada-r is-blue">
          <Monitor size={18} aria-hidden="true" />
        </span>
      );
    case "video":
      return (
        <span className="ada-r is-blue">
          <Video size={19} aria-hidden="true" />
        </span>
      );
    case "dots":
      return (
        <span className="ada-r is-blue">
          <span className="ada-dots" aria-hidden="true"><i /><i /><i /></span>
        </span>
      );
    case "count-wave":
      return (
        <span className="ada-r">
          <b className="tnum">{face.count}</b>
          <Wave tone="green" active={model.speaking} />
        </span>
      );
    default:
      return (
        <span className="ada-r">
          <Wave tone={face.tone === "blue" ? "blue" : "green"} active={model.speaking} />
        </span>
      );
  }
}

/** End button: hold to hang up (the confirmation). Keyboard / VoiceOver: two activations. */
function HoldToEnd({ label, onEnd, onHoldChange }) {
  const t = useT();
  const [holding, setHolding] = useState(false);
  const [hint, setHint] = useState("");
  const timer = useRef(null);
  const confirmAt = useRef(0);
  const firedRef = useRef(false);
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => () => clear(), []);
  useEffect(() => {
    if (!hint) return undefined;
    const id = setTimeout(() => setHint(""), 2400);
    return () => clearTimeout(id);
  }, [hint]);
  const start = (event) => {
    if (event.button != null && event.button !== 0) return;
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      /* synthetic / already released pointer */
    }
    firedRef.current = false;
    setHolding(true);
    onHoldChange?.(true);
    hapticSelection();
    clear();
    timer.current = setTimeout(() => {
      timer.current = null;
      firedRef.current = true;
      setHolding(false);
      onHoldChange?.(false);
      hapticImpactMedium();
      onEnd();
    }, ADA.HOLD_END_MS);
  };
  const stop = () => {
    if (!holding) return;
    clear();
    setHolding(false);
    onHoldChange?.(false);
    if (!firedRef.current) setHint(t("ada.btn.holdHint"));
  };
  return (
    <button
      type="button"
      className={`ada-btn is-end${holding ? " is-holding" : ""}`}
      style={{ "--hold": `${ADA.HOLD_END_MS}ms` }}
      aria-describedby={hint ? "ada-end-hint" : undefined}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerCancel={stop}
      onPointerLeave={stop}
      onContextMenu={(e) => e.preventDefault()}
      onClick={(event) => {
        // Pointer presses are handled by the hold; detail 0 = keyboard / assistive tech.
        if (event.detail !== 0) return;
        const now = Date.now();
        if (now - confirmAt.current < 4000) {
          confirmAt.current = 0;
          onEnd();
          return;
        }
        confirmAt.current = now;
        hapticWarning();
        setHint(t("ada.btn.confirmEnd"));
      }}
    >
      <i>
        <svg className="ada-hold-ring" viewBox="0 0 60 60" aria-hidden="true">
          <circle cx="30" cy="30" r="28" />
        </svg>
        <PhoneOff size={21} aria-hidden="true" />
      </i>
      <em>{label}</em>
      {hint ? (
        <span id="ada-end-hint" className="ada-end-hint" role="status">
          {hint}
        </span>
      ) : null}
    </button>
  );
}

function eventCopy(ev, model, t) {
  switch (ev.kind) {
    case "joined":
      return { title: t("ada.event.joined", { name: ev.name || "" }), person: ev.person };
    case "left":
      return { title: t("ada.event.left", { name: ev.name || "" }), person: ev.person, dim: true };
    case "reconnecting":
      return { title: t("ada.event.reconnecting"), sub: t("ada.event.reconnectingSub"), icon: "spinner" };
    case "reconnected":
      return { title: t("ada.event.reconnected"), icon: "signal-ok" };
    case "screen":
      return { title: t("ada.event.screen", { name: ev.name || "" }), sub: t("ada.event.screenSub"), icon: "screen", action: "full" };
    case "video":
      return { title: ev.name ? t("ada.event.video", { name: ev.name }) : t("ada.event.videoAnon"), icon: "video", action: "full" };
    case "muted":
      return { title: t("ada.event.muted"), icon: "mic-off", action: "undo" };
    case "unmuted":
      return { title: t("ada.event.unmuted"), icon: "mic", action: "undo" };
    case "ended":
      return {
        title: model.source === "server" ? t("ada.event.endedVoice") : t("ada.event.ended"),
        icon: "end",
        timer: true,
        action: model.callBack ? (model.callBack.kind === "server" ? "rejoin" : "callBack") : null,
      };
    default:
      return null;
  }
}

/**
 * @param {object} props
 * @param {object} props.model     adaPill model (adaFrom* / adaEndedModel)
 * @param {object} props.face      adaFace(model)
 * @param {object} props.layout    adaLayout()
 * @param {object} props.route     adaRouteModel()
 * @param {object} props.actions   { expand(rect), toggleMute(), end(), chat(), callBack(), selectRoute(id), refreshRoute() }
 */
export default function AdaPill({ model, face, layout, route, actions }) {
  const t = useT();
  const [panel, setPanel] = useState(false);
  const [routeOpen, setRouteOpen] = useState(false);
  const [bubble, setBubble] = useState(null);
  const [pressed, setPressed] = useState(false);
  const [drag, setDrag] = useState(null);
  const hitRef = useRef(null);
  const panelRef = useRef(null);
  const gesture = useRef(null);
  const queue = useRef([]);
  const idleTimer = useRef(null);
  const holdingRef = useRef(false);
  const prevModel = useRef(null);
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const island = layout.kind === "island";
  const ended = model.phase === "ended";

  // ---- event bubbles ----------------------------------------------------------------
  const bubbleRef = useRef(null);
  const showNext = useCallback(() => {
    const next = queue.current.shift() || null;
    bubbleRef.current = next;
    setBubble(next);
  }, []);
  const pushEvent = useCallback(
    (ev, { replace = false } = {}) => {
      if (replace) queue.current = [];
      queue.current.push({ ...ev, id: `${ev.kind}:${Date.now()}:${Math.random().toString(36).slice(2, 6)}` });
      if (queue.current.length > 3) queue.current.splice(0, queue.current.length - 3);
      if (replace || !bubbleRef.current) showNext();
    },
    [showNext]
  );
  // Each bubble folds after its time (a timer per bubble, so a remount never strands one).
  useEffect(() => {
    if (!bubble) return undefined;
    const id = setTimeout(showNext, bubble.ms || ADA.EVENT_MS);
    return () => clearTimeout(id);
  }, [bubble, showNext]);
  useEffect(() => () => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
  }, []);

  useEffect(() => {
    const prev = prevModel.current;
    prevModel.current = model;
    if (ended) {
      if (!prev || prev.phase !== "ended") {
        setPanel(false);
        pushEvent({ kind: "ended", ms: ADA.ENDED_MS - 1400 }, { replace: true });
      }
      return;
    }
    if (panel) return;
    for (const ev of adaEvents(prev, model)) pushEvent(ev);
  }, [model, ended, panel, pushEvent]);

  // ---- panel ------------------------------------------------------------------------
  const armIdle = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      if (holdingRef.current) {
        armIdle();
        return;
      }
      setPanel(false);
    }, ADA.PANEL_IDLE_MS);
  }, []);
  const openPanel = useCallback(() => {
    if (ended) return;
    queue.current = [];
    bubbleRef.current = null;
    setBubble(null);
    setRouteOpen(false);
    setPanel(true);
    actionsRef.current.refreshRoute?.();
    armIdle();
  }, [armIdle, ended]);
  const closePanel = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    setPanel(false);
    setRouteOpen(false);
    requestAnimationFrame(() => hitRef.current?.focus?.({ preventScroll: true }));
  }, []);
  // Modal while open: Tab stays in the panel, the app behind is inert, focus returns.
  useModalFocus(panel, panelRef);
  useEffect(() => {
    if (!panel) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closePanel();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [panel, closePanel]);
  // Leaving the app (Live Activity takes over): fold the panel so the status bar comes back.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        setPanel(false);
        setRouteOpen(false);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // ---- native chrome: status bar steps aside while expanded, no scroll-to-top fight ----
  const expanded = panel || Boolean(bubble);
  useEffect(() => {
    setCallIslandChrome(adaChrome({ visible: true, expanded, layout }));
  }, [expanded, layout]);
  useEffect(() => () => setCallIslandChrome(adaChrome({ visible: false })), []);

  // ---- the app moves down when the pill needs room (no island) ----------------------
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (!layout.reserve) {
      root.classList.remove("ada-reserve");
      root.style.removeProperty("--ada-reserve");
      return undefined;
    }
    root.style.setProperty("--ada-reserve", `${layout.reserve}px`);
    root.classList.add("ada-reserve");
    return () => {
      root.classList.remove("ada-reserve");
      root.style.removeProperty("--ada-reserve");
    };
  }, [layout.reserve]);

  // ---- gestures ---------------------------------------------------------------------
  const expand = useCallback(() => {
    const r = hitRef.current?.querySelector(".ada-pill")?.getBoundingClientRect?.();
    setPanel(false);
    actionsRef.current.expand(r ? { x: r.left, y: r.top, w: r.width, h: r.height } : null);
  }, []);
  const swipeMute = useCallback(() => {
    hapticSelection();
    const wasMuted = Boolean(model.muted);
    actionsRef.current.toggleMute();
    pushEvent({ kind: wasMuted ? "unmuted" : "muted", ms: ADA.UNDO_MS }, { replace: true });
  }, [model.muted, pushEvent]);

  const onPointerDown = (event) => {
    if (event.button != null && event.button !== 0) return;
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      /* synthetic / already released pointer */
    }
    const g = { x: event.clientX, y: event.clientY, at: performance.now(), long: false, decided: "still", timer: null };
    if (!ended) {
      g.timer = setTimeout(() => {
        if (!gesture.current || !adaLongPressAlive(gesture.current.delta || { dx: 0, dy: 0 })) return;
        gesture.current.long = true;
        setPressed(false);
        hapticImpactMedium();
        openPanel();
      }, ADA.LONG_PRESS_MS);
    }
    gesture.current = g;
    setPressed(true);
  };
  const onPointerMove = (event) => {
    const g = gesture.current;
    if (!g || g.long) return;
    const dx = event.clientX - g.x;
    const dy = event.clientY - g.y;
    g.delta = { dx, dy };
    const kind = adaGestureOnMove({ dx, dy });
    g.decided = kind;
    if (kind !== "still" && g.timer) {
      clearTimeout(g.timer);
      g.timer = null;
    }
    if (kind === "swipe" || kind === "moving") setDrag({ dx: Math.max(-24, Math.min(24, dx * 0.35)), dy: 0 });
    else if (kind === "pull") setDrag({ dx: 0, dy: Math.min(18, dy * 0.3) });
    else setDrag(null);
  };
  const finish = (event, cancelled = false) => {
    const g = gesture.current;
    gesture.current = null;
    setPressed(false);
    setDrag(null);
    if (!g) return;
    if (g.timer) clearTimeout(g.timer);
    if (cancelled) return;
    const dx = (event?.clientX ?? g.x) - g.x;
    const dy = (event?.clientY ?? g.y) - g.y;
    const kind = adaGestureOnEnd({ dx, dy, elapsedMs: performance.now() - g.at, longPressed: g.long });
    if (ended) {
      if (kind === "tap" && model.callBack) actionsRef.current.callBack();
      return;
    }
    if (kind === "tap" || kind === "pull") {
      hapticImpactLight();
      expand();
    } else if (kind === "swipe") {
      swipeMute();
    }
  };

  const status = statusText(model, face, t);
  const a11yTitle = model.source === "server" ? `${model.title}${model.serverName ? `, ${model.serverName}` : ""}` : model.title;
  const pillStyle = {
    "--ada-w": `${layout.width}px`,
    "--ada-h": `${layout.visualH}px`,
    top: layout.visualTop - layout.hitTop,
    transform: drag ? `translate(${drag.dx}px, ${drag.dy}px)` : undefined,
  };

  // ---- render ------------------------------------------------------------------------
  const bubbleCopy = bubble ? eventCopy(bubble, model, t) : null;
  const sub = model.source === "group" || model.source === "server";
  const panelSub = (
    <>
      {model.source === "server" ? (model.serverName || t("ada.sub.channel")) : model.source === "group" ? model.title : model.callType === "video" ? t("ada.sub.video") : t("ada.sub.voice")}
      {model.startedAt ? <CallTimer startedAt={model.startedAt} stoppedAt={model.stoppedAt} prefix=" · " className="tnum" /> : null}
      {sub ? ` · ${t("ada.sub.people", { count: model.count })}` : null}
    </>
  );
  const panelTitle =
    sub && model.speaking && model.speaker ? t("ada.sub.speaking", { name: model.speaker.name }) : model.source === "server" ? model.title : sub ? model.title : model.speaker?.name || model.title;

  return (
    <div className={`ada-root is-${layout.kind}${expanded ? " is-expanded" : ""}`} data-testid="ada-root">
      {!panel ? (
        <div
          ref={hitRef}
          className={`ada-hit${pressed ? " is-pressed" : ""}${bubble ? " has-bubble" : ""}`}
          role="button"
          tabIndex={0}
          data-testid="ada-pill"
          aria-haspopup="dialog"
          aria-label={t("ada.a11y.pill", { title: a11yTitle, status })}
          style={{ top: layout.hitTop, height: layout.hitH, width: Math.max(layout.width + 16, ADA.TOUCH) }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(e) => finish(e)}
          onPointerCancel={(e) => finish(e, true)}
          onContextMenu={(e) => {
            e.preventDefault();
            if (!gesture.current?.long) openPanel();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              if (ended) {
                if (model.callBack) actionsRef.current.callBack();
              } else expand();
            } else if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) {
              e.preventDefault();
              openPanel();
            } else if (e.key === "m" || e.key === "M") {
              e.preventDefault();
              swipeMute();
            }
          }}
        >
          <div className={`ada-pill is-${face.mode}`} style={pillStyle} aria-hidden="true">
            <span className="ada-l">
              <PillLeft model={model} face={face} />
            </span>
            {!island ? (
              <span className="ada-mid tnum" aria-hidden="true">
                {model.phase === "live" && model.startedAt ? (
                  <CallTimer startedAt={model.startedAt} stoppedAt={model.stoppedAt} />
                ) : model.phase === "ended" ? null : (
                  <span className="ada-mid-text">{status}</span>
                )}
              </span>
            ) : null}
            <PillRight model={model} face={face} />
          </div>
        </div>
      ) : null}

      {bubble && bubbleCopy && !panel ? (
        <div
          key={bubble.id}
          className={`ada-bubble is-${bubble.kind}`}
          role="status"
          aria-live="polite"
          style={{ top: layout.expandedTop, left: layout.expandedInset, right: layout.expandedInset, paddingTop: layout.expandedPadTop }}
          data-testid="ada-bubble"
          onClick={(event) => {
            if (event.target.closest?.("button")) return;
            // Body tap: a share / camera opens the full screen, anything else folds away.
            if (bubbleCopy.action === "full") expand();
            else showNext();
          }}
        >
          <div className="ada-bubble-row">
            {bubble.kind === "screen" ? (
              <ScreenThumb stream={model.screen?.stream || null} label={model.screen?.name || ""} />
            ) : bubbleCopy.person ? (
              <Face person={bubbleCopy.person} size={40} className={bubbleCopy.dim ? "is-dim" : ""} />
            ) : (
              <span className={`ada-bubble-ic is-${bubbleCopy.icon}`} aria-hidden="true">
                {bubbleCopy.icon === "spinner" ? <span className="ada-spin is-big" /> : null}
                {bubbleCopy.icon === "signal-ok" ? <Bars tone="green" level={4} /> : null}
                {bubbleCopy.icon === "video" ? <Video size={20} /> : null}
                {bubbleCopy.icon === "mic-off" ? <MicOff size={20} /> : null}
                {bubbleCopy.icon === "mic" ? <Mic size={20} /> : null}
                {bubbleCopy.icon === "end" ? <PhoneOff size={20} /> : null}
                {bubbleCopy.icon === "screen" ? <Monitor size={20} /> : null}
              </span>
            )}
            <div className="ada-bubble-text">
              <b>{bubbleCopy.title}</b>
              {bubbleCopy.timer ? (
                <span className="tnum">
                  {model.title}
                  <CallTimer startedAt={model.startedAt} stoppedAt={model.stoppedAt || model.endedAt} prefix=" · " />
                </span>
              ) : bubbleCopy.sub ? (
                <span>{bubbleCopy.sub}</span>
              ) : null}
            </div>
            {bubbleCopy.action === "full" ? (
              <button type="button" className="ada-chip is-accent" onClick={expand}>
                <Maximize2 size={16} aria-hidden="true" />
                {t("ada.btn.full")}
              </button>
            ) : bubbleCopy.action === "undo" ? (
              <button
                type="button"
                className="ada-chip"
                onClick={() => {
                  hapticSelection();
                  actionsRef.current.toggleMute();
                  showNext();
                }}
              >
                <RotateCcw size={16} aria-hidden="true" />
                {t("ada.btn.undo")}
              </button>
            ) : bubbleCopy.action === "callBack" || bubbleCopy.action === "rejoin" ? (
              <button
                type="button"
                className="ada-chip is-green"
                onClick={() => {
                  hapticImpactLight();
                  actionsRef.current.callBack();
                }}
              >
                <Phone size={16} aria-hidden="true" />
                {bubbleCopy.action === "rejoin" ? t("ada.btn.rejoin") : t("ada.btn.callBack")}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {panel ? (
        <>
          <div className="ada-dim" onClick={closePanel} aria-hidden="true" />
          <div
            ref={panelRef}
            className="ada-panel"
            role="dialog"
            aria-modal="true"
            aria-label={t("ada.a11y.panel")}
            data-testid="ada-panel"
            style={{ top: layout.expandedTop, left: layout.expandedInset, right: layout.expandedInset, paddingTop: layout.expandedPadTop }}
            onPointerDown={(e) => {
              armIdle();
              const g = { y: e.clientY };
              panelRef.current.dataset.swipeY = String(g.y);
            }}
            onPointerUp={(e) => {
              const y0 = Number(panelRef.current?.dataset.swipeY);
              if (Number.isFinite(y0) && y0 - e.clientY > 48 && !holdingRef.current) closePanel();
            }}
            onFocus={armIdle}
          >
            <div className="ada-ph">
              {model.source === "server" && !model.speaking ? (
                <span className="ada-srv is-big">
                  <ServerIcon server={model.server?.raw || model.server} name={model.server?.name || model.title} className="ada-srv-img" fallbackClassName="ada-srv-fb" />
                </span>
              ) : (
                <Face person={model.speaker} size={54} speaking={model.speaking && !model.muted} />
              )}
              <div className="ada-pn">
                <b>{panelTitle}</b>
                <span>{panelSub}</span>
              </div>
              {model.phase === "reconnecting" ? (
                <span className="ada-spin is-big" aria-hidden="true" />
              ) : model.muted ? (
                <span className="ada-r is-red is-big"><MicOff size={24} aria-hidden="true" /></span>
              ) : (
                <Wave tone={model.source === "server" ? "blue" : "green"} active={model.speaking} big />
              )}
            </div>

            {sub && model.people.length ? (
              <div className="ada-ppl" aria-hidden="true">
                {model.people.slice(0, 6).map((p) => (
                  <Face key={p.id} person={p} size={30} speaking={model.speaking && p.id === model.speaker?.id} />
                ))}
                {model.people.length > 6 ? <span className="ada-more tnum">+{model.people.length - 6}</span> : null}
              </div>
            ) : null}

            {model.screen ? (
              <button type="button" className="ada-share" onClick={expand}>
                <ScreenThumb stream={model.screen.stream} label={model.screen.name} />
                <span>
                  <b>{t("ada.event.screen", { name: model.screen.name })}</b>
                  <span>{t("ada.event.screenSub")}</span>
                </span>
              </button>
            ) : model.phase === "reconnecting" ? (
              <div className="ada-q is-amber" role="status">
                <Bars tone="amber" level={1} />
                <span>{t("ada.event.reconnectingSub")}</span>
              </div>
            ) : (
              <div className="ada-q">
                {qualityLabel(model, t) ? (
                  <>
                    <Bars tone={model.quality === "poor" || model.quality === "bad" ? "amber" : "dim"} level={model.quality === "fair" ? 3 : model.quality === "poor" || model.quality === "bad" ? 1 : 4} />
                    <span>
                      {qualityLabel(model, t)}
                      {model.rttMs ? ` · ${t("ada.quality.ms", { ms: model.rttMs })}` : ""}
                    </span>
                  </>
                ) : (
                  <span>{statusText(model, face, t)}</span>
                )}
                <span className="ada-sp" />
                {route.current ? (
                  <span className="ada-q-route">
                    {routeIcon(route.current.kind, 14)}
                    {routeLabel(route.current, t)}
                  </span>
                ) : null}
              </div>
            )}

            {routeOpen ? (
              <div className="ada-routes" role="group" aria-label={t("ada.route.title")}>
                <div className="ada-routes-h">{t("ada.route.title")}</div>
                {route.options.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    className={`ada-route${o.selected ? " is-on" : ""}`}
                    aria-pressed={o.selected}
                    onClick={() => {
                      hapticSelection();
                      actionsRef.current.selectRoute(o.id);
                      setRouteOpen(false);
                      armIdle();
                    }}
                  >
                    {routeIcon(o.kind, 18)}
                    <span>{routeLabel(o, t)}</span>
                    {o.selected ? (
                      <>
                        <em>{t("ada.route.now")}</em>
                        <Check size={16} aria-hidden="true" />
                      </>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="ada-btns">
              <button
                type="button"
                className={`ada-btn${model.muted ? " is-alert" : ""}`}
                aria-pressed={model.muted}
                onClick={() => {
                  hapticSelection();
                  actionsRef.current.toggleMute();
                  armIdle();
                }}
              >
                <i>{model.muted ? <MicOff size={21} aria-hidden="true" /> : <Mic size={21} aria-hidden="true" />}</i>
                <em>{model.muted ? t("ada.btn.unmute") : t("ada.btn.mute")}</em>
              </button>
              {route.action !== "none" ? (
                <button
                  type="button"
                  className={`ada-btn${route.speakerOn ? " is-on" : ""}${routeOpen ? " is-open" : ""}`}
                  aria-label={`${t("ada.btn.output")}: ${routeLabel(route.current, t)}`}
                  aria-expanded={route.action === "menu" ? routeOpen : undefined}
                  onClick={() => {
                    hapticSelection();
                    armIdle();
                    if (route.action === "toggle" && route.toggleTo) actionsRef.current.selectRoute(route.toggleTo);
                    else setRouteOpen((v) => !v);
                  }}
                >
                  <i>{routeIcon(route.current?.kind)}</i>
                  <em>{routeLabel(route.current, t)}</em>
                </button>
              ) : null}
              <button
                type="button"
                className="ada-btn"
                onClick={() => {
                  hapticSelection();
                  closePanel();
                  actionsRef.current.chat();
                }}
              >
                <i><MessageSquare size={21} aria-hidden="true" /></i>
                <em>{t("ada.btn.chat")}</em>
              </button>
              <button type="button" className="ada-btn is-accent" onClick={expand}>
                <i><Maximize2 size={21} aria-hidden="true" /></i>
                <em>{t("ada.btn.full")}</em>
              </button>
              <HoldToEnd
                label={model.source === "server" || model.source === "group" ? t("ada.btn.leave") : t("ada.btn.end")}
                onHoldChange={(v) => {
                  holdingRef.current = v;
                  armIdle();
                }}
                onEnd={() => {
                  setPanel(false);
                  actionsRef.current.end();
                }}
              />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

/**
 * Pill -> full screen: the black pill grows into the call screen (spring, 0.36 s),
 * reduced motion: a 0.16 s fade. Rendered by the host so it outlives the pill.
 */
export function AdaMorph({ rect, onCovered, onDone }) {
  const ref = useRef(null);
  const reduce = reducedMotion();
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const coveredRef = useRef(onCovered);
  coveredRef.current = onCovered;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const total = reduce ? ADA.MORPH_REDUCED_MS : ADA.MORPH_MS;
    const raf = requestAnimationFrame(() => el.classList.add("is-open"));
    const covered = setTimeout(() => coveredRef.current?.(), Math.round(total * 0.62));
    const fade = setTimeout(() => el.classList.add("is-fading"), total + 60);
    const done = setTimeout(() => doneRef.current?.(), total + 260);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(covered);
      clearTimeout(fade);
      clearTimeout(done);
    };
  }, [reduce]);
  const r = rect || { x: window.innerWidth / 2 - 107, y: 11, w: 214, h: 37 };
  return (
    <div
      ref={ref}
      className={`ada-morph${reduce ? " is-reduced" : ""}`}
      aria-hidden="true"
      style={{
        "--mx": `${r.x}px`,
        "--my": `${r.y}px`,
        "--mw": `${r.w}px`,
        "--mh": `${r.h}px`,
        "--mdur": `${reduce ? ADA.MORPH_REDUCED_MS : ADA.MORPH_MS}ms`,
      }}
    />
  );
}
