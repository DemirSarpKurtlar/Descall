// Market 2.0 live previews: the user's real profile card, chat message, member row, voice
// tile and join sound, drawn with the app's cosmetic renderers (Avatar + avatar effect,
// NameEffectText, profile colour / aura classes, chat bubble skins, voice tile skins). The
// `user` passed in is the signed-in user with try-on items equipped (composeTryOnUser).
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "../../context/LocaleContext";
import { Avatar } from "../ui/Avatar";
import { CountryBadge, NameEffectText, profileAuraClass, presenceFlareClass } from "../ui/Cosmetics";
import { cssUrl } from "../../lib/cssUrl";
import { profileColorClass, profileColorStyle } from "../../lib/profileColors";
import { localText } from "../../lib/shop2Logic.js";
import { Mic, Pause, Play, Volume2 } from "./shop2Icons.jsx";

const imgOf = (item) => item?.preview_url || item?.asset_url || null;
const keyOf = (item) => item?.effect_key || "";

export function displayNameOf(user, fallback = "") {
  return user?.displayName || user?.display_name || user?.username || fallback;
}

/** Avatar with the worn frame (SVG art) and presence flare over it. */
export function S2Avatar({ user, size = 40, status = null, className = "" }) {
  const frame = user?.equippedAvatarFrame;
  const frameSrc = imgOf(frame);
  return (
    <span className={`s2-av ${frame ? "has-frame" : ""} ${className}`.trim()} style={{ "--av": `${size}px` }}>
      <Avatar user={user} size={size} name={displayNameOf(user)} animate="always" />
      {frame ? (
        frameSrc ? (
          <img className="s2-av-frame" src={frameSrc} alt="" draggable={false} />
        ) : (
          <span className={`s2-av-frame cosmetic-avatar-frame frame-${keyOf(frame)}`} />
        )
      ) : null}
      {status ? <span className={`s2-av-status status-badge status-${status} ${presenceFlareClass(user)}`.trim()} /> : null}
    </span>
  );
}

/** Profile badge next to the name (badge art or icon). */
export function S2Badge({ item, size = 16 }) {
  if (!item) return null;
  const src = imgOf(item) || (typeof item.badge_icon === "string" && item.badge_icon.startsWith("data:") ? item.badge_icon : null);
  return src ? (
    <img className="s2-badge" src={src} alt="" width={size} height={size} draggable={false} />
  ) : (
    <span className={`s2-badge cosmetic-profile-badge badge-${keyOf(item)}`} style={{ width: size, height: size }} />
  );
}

/** Name in the worn name colour + name effect, with the badge. */
export function S2Name({ user, children, badge = true }) {
  const style = user?.equippedProfileColor ? { "--s2-name-color": user.equippedProfileColor.name_color || user.equippedProfileColor.color || undefined } : undefined;
  return (
    <span className={`s2-name${user?.equippedProfileColor ? ` has-color pcolor-name-${keyOf(user.equippedProfileColor)}` : ""}`} style={style}>
      <NameEffectText user={user}>{children}</NameEffectText>
      {badge ? <S2Badge item={user?.equippedBadge} /> : null}
    </span>
  );
}

/** The profile card as friends see it (banner, framed avatar, name, badge, about). */
export function S2ProfileCard({ user, compact = false, about = true, className = "" }) {
  const { t } = useLocale();
  const name = displayNameOf(user, t("shop2.preview.you"));
  const banner = imgOf(user?.equippedBanner) || user?.bannerUrl || user?.banner_url || null;
  const colorStyle = profileColorStyle(user) || undefined;
  const bio = user?.bio || "";
  return (
    <div
      className={`s2-pcard user-profile-card ${profileAuraClass(user)} ${profileColorClass(user)} ${compact ? "is-compact" : ""} ${className}`.trim()}
      style={colorStyle}
    >
      <div className="s2-pcard-banner" style={banner ? { backgroundImage: cssUrl(banner) } : undefined} />
      <div className="s2-pcard-body">
        <S2Avatar user={user} size={compact ? 52 : 76} status={user?.status === "invisible" ? "offline" : user?.status || "online"} className="s2-pcard-av" />
        <div className="s2-pcard-name">
          <S2Name user={user}>{name}</S2Name>
        </div>
        <div className="s2-pcard-handle">
          @{String(user?.username || "descall").toLowerCase()} · {t("shop2.preview.online")}
          <CountryBadge user={user} />
        </div>
        {about && !compact ? (
          <div className="s2-pcard-about">
            <span>{t("shop2.preview.about")}</span>
            <p>{bio || t("shop2.preview.aboutSample")}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** One chat message by the user with the worn bubble, name colour and avatar. */
export function S2ChatMessage({ user, text, time = "21:41", highlight = false }) {
  const { t } = useLocale();
  const bubble = keyOf(user?.equippedChatBubble);
  return (
    <div className={`s2-msg${highlight ? " is-hl" : ""}`}>
      <S2Avatar user={user} size={34} />
      <div className="s2-msg-body">
        <div className="s2-msg-head">
          <S2Name user={user}>{displayNameOf(user, t("shop2.preview.you"))}</S2Name>
          <time>{time}</time>
        </div>
        <div className={`s2-msg-bubble message-bubble${bubble ? ` own cosmetic-chat-bubble bubble-${bubble}` : ""}`}>
          <span className="message-text">{text}</span>
        </div>
      </div>
    </div>
  );
}

/** Someone else's chat line (plain bubble). */
export function S2OtherMessage({ name, letter, text, time, tone = 0 }) {
  return (
    <div className="s2-msg is-other">
      <span className={`s2-letter tone-${tone % 6}`}>{letter || String(name || "?").charAt(0)}</span>
      <div className="s2-msg-body">
        <div className="s2-msg-head">
          <b>{name}</b>
          <time>{time}</time>
        </div>
        <div className="s2-msg-bubble is-plain">{text}</div>
      </div>
    </div>
  );
}

/** Server voice / call tile with the worn voice tile theme. */
export function S2VoiceTile({ user, speaking = true, joined = null, size = "lg", label }) {
  const { t } = useLocale();
  const tile = user?.equippedVoiceTile;
  const k = keyOf(tile);
  const art = imgOf(tile);
  return (
    <div
      className={`s2-vtile is-${size}${speaking ? " is-speaking" : ""}${tile ? ` cosmetic-voice-tile vtile-${k}` : ""}`}
      data-voice-tile={k || undefined}
      style={art ? { "--vtile-art": cssUrl(art) } : undefined}
    >
      {art ? <span className="s2-vtile-art" aria-hidden="true" /> : null}
      {joined ? (
        <span className="s2-vtile-joined">
          <Volume2 size={12} />
          <b>{joined.who}</b>
          <JoinWave />
          <span>{joined.sound}</span>
        </span>
      ) : null}
      <S2Avatar user={user} size={size === "lg" ? 76 : size === "md" ? 56 : 40} className="s2-vtile-av" />
      <span className="s2-vtile-name">
        <Mic size={12} />
        {label || displayNameOf(user, t("shop2.preview.you"))}
      </span>
    </div>
  );
}

/** A plain voice tile of another member (letter avatar). */
export function S2PeerTile({ name, tone = 0, small = false }) {
  return (
    <div className={`s2-vtile is-peer${small ? " is-sm" : ""}`}>
      <span className={`s2-letter is-lg tone-${tone % 6}`}>{String(name || "?").charAt(0)}</span>
      <span className="s2-vtile-name">
        <Mic size={12} />
        {name}
      </span>
    </div>
  );
}

/** Member list row (server member list / friends list). */
export function S2MemberRow({ user, sub }) {
  const { t } = useLocale();
  return (
    <div className="s2-member">
      <S2Avatar user={user} size={30} status="online" />
      <span className="s2-member-text">
        <S2Name user={user}>{displayNameOf(user, t("shop2.preview.you"))}</S2Name>
        {sub ? <small>{sub}</small> : null}
      </span>
    </div>
  );
}

export function JoinWave({ playing = false, bars = 9 }) {
  return (
    <span className={`s2-wave${playing ? " is-playing" : ""}`} aria-hidden="true">
      {Array.from({ length: bars }, (_, i) => (
        <i key={i} style={{ "--i": i, "--h": `${30 + ((i * 37) % 70)}%` }} />
      ))}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Join sound playback. The sound is a WebAudio recipe stored with the item (agent C4:
// item.recipe / item.sound). Volume is capped; nothing plays when the user muted join
// sounds. A missing recipe falls back to a short chime from the palette of the item.

let audioCtx = null;
function ctx() {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!audioCtx) audioCtx = new AC();
  return audioCtx;
}

function recipeOf(item) {
  const raw = item?.recipe || item?.sound || item?.join_sound || null;
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return raw;
}

function hashKey(s) {
  let h = 2166136261;
  for (const c of String(s || "")) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** Plays the join sound; returns its length in ms. */
export function playJoinSound(item, { volume = 0.22 } = {}) {
  if (typeof window !== "undefined" && typeof window.__descallPlayJoinSound === "function") {
    try {
      return window.__descallPlayJoinSound(item, { volume, preview: true }) || 1400;
    } catch {
      /* fall back below */
    }
  }
  const ac = ctx();
  if (!ac) return 0;
  if (ac.state === "suspended") ac.resume().catch(() => {});
  const r = recipeOf(item);
  const master = ac.createGain();
  master.gain.value = Math.min(0.3, Math.max(0, volume));
  master.connect(ac.destination);
  const t0 = ac.currentTime + 0.02;
  const notes = Array.isArray(r?.notes) && r.notes.length
    ? r.notes
    : (() => {
        const h = hashKey(item?.effect_key || item?.sku || "join");
        const base = 392 + (h % 7) * 37;
        return [[base, 0, 0.5], [base * 1.25, 0.12, 0.55], [base * 1.5, 0.24, 0.8]];
      })();
  let end = 0;
  for (const n of notes) {
    const [freq, start = 0, dur = 0.4, gain = 0.8] = Array.isArray(n) ? n : [n.f ?? n.freq, n.t ?? n.start, n.d ?? n.dur, n.g ?? n.gain];
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = r?.wave || "sine";
    o.frequency.value = Number(freq) || 440;
    g.gain.setValueAtTime(0.0001, t0 + start);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, Math.min(1, gain)), t0 + start + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + start + dur);
    o.connect(g).connect(master);
    o.start(t0 + start);
    o.stop(t0 + start + dur + 0.05);
    end = Math.max(end, start + dur);
  }
  return Math.round(end * 1000) + 120;
}

/** Play / pause row for a join sound: button, bouncing bars, length. */
export function S2JoinSound({ item, compact = false, title }) {
  const { t, locale } = useLocale();
  const [playing, setPlaying] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const play = useCallback(() => {
    if (!item) return;
    const len = playJoinSound(item);
    setPlaying(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setPlaying(false), len || 1400);
  }, [item]);
  const secs = Number(item?.duration_ms || item?.durationMs || 1400) / 1000;
  return (
    <div className={`s2-sound${compact ? " is-compact" : ""}${playing ? " is-playing" : ""}`}>
      <button type="button" className="s2-sound-play" onClick={play} aria-label={t("shop2.preview.listen")} disabled={!item}>
        {playing ? <Pause size={16} weight="fill" /> : <Play size={16} weight="fill" />}
      </button>
      {!compact && title ? (
        <span className="s2-sound-text">
          <b>{title}</b>
          <small>{t("shop2.preview.joinSoundLen", { s: secs.toLocaleString(locale, { maximumFractionDigits: 1 }) })}</small>
        </span>
      ) : null}
      <JoinWave playing={playing} bars={compact ? 9 : 22} />
      {compact ? <small className="s2-sound-len">{t("shop2.preview.seconds", { s: secs.toLocaleString(locale, { maximumFractionDigits: 1 }) })}</small> : null}
    </div>
  );
}

/** Desktop window / phone frame around a preview. */
export function DeviceFrame({ mode = "desktop", children, light = false, reduced = false, className = "" }) {
  return (
    <div className={`s2-device is-${mode}${light ? " is-light" : ""}${reduced ? " is-reduced" : ""} ${className}`.trim()}>
      {mode === "desktop" ? (
        <div className="s2-device-bar" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
      ) : (
        <div className="s2-device-notch" aria-hidden="true" />
      )}
      <div className="s2-device-body">{children}</div>
    </div>
  );
}

/**
 * Before / after: the left part shows the current look, the right part the try-on.
 * Drag the divider; on release it springs to the nearest edge or the middle.
 */
export function BeforeAfter({ before, after, labels }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(0.5);
  const [dragging, setDragging] = useState(false);
  const setFrom = (clientX) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r?.width) return;
    setPos(Math.min(1, Math.max(0, (clientX - r.left) / r.width)));
  };
  const release = () => {
    setDragging(false);
    setPos((p) => (p < 0.2 ? 0 : p > 0.8 ? 1 : Math.abs(p - 0.5) < 0.15 ? 0.5 : p));
  };
  return (
    <div
      ref={ref}
      className={`s2-ba${dragging ? " is-dragging" : ""}`}
      style={{ "--ba": pos }}
      onPointerDown={(e) => {
        setDragging(true);
        e.currentTarget.setPointerCapture?.(e.pointerId);
        setFrom(e.clientX);
      }}
      onPointerMove={(e) => dragging && setFrom(e.clientX)}
      onPointerUp={release}
      onPointerCancel={release}
    >
      <div className="s2-ba-layer is-after">{after}</div>
      <div className="s2-ba-layer is-before" aria-hidden={pos < 0.02}>{before}</div>
      <div
        className="s2-ba-handle"
        role="slider"
        tabIndex={0}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pos * 100)}
        aria-label={labels?.slider}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setPos((p) => Math.max(0, p - 0.05));
          if (e.key === "ArrowRight") setPos((p) => Math.min(1, p + 0.05));
        }}
      >
        <i />
      </div>
      {labels ? (
        <div className="s2-ba-labels" aria-hidden="true">
          <span>{labels.before}</span>
          <span>{labels.after}</span>
        </div>
      ) : null}
    </div>
  );
}

/** Item name in the UI language (s2- items carry 7-language names). */
export function itemNameOf(item, locale, localize) {
  if (!item) return "";
  if (item.name && typeof item.name === "object") return localText(item.name, locale);
  return localize ? localize(item, locale).name : String(item.name || "");
}
