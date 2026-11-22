// Market 2.0 live previews: the user's real profile card, chat message, member row, voice
// tile and join sound, drawn with the app's cosmetic renderers (Avatar + avatar effect,
// NameEffectText, profile colour / aura classes, chat bubble skins, voice tile skins). The
// `user` passed in is the signed-in user with try-on items equipped (composeTryOnUser).
import { useRef, useState } from "react";
import { useLocale } from "../../context/LocaleContext";
import { Avatar } from "../ui/Avatar";
import { CountryBadge, NameEffectText, profileAuraClass, presenceFlareClass } from "../ui/Cosmetics";
import { JoinSoundPreview, VoiceTileSkin, voiceTileHostClass } from "../voice/VoiceCosmetics.jsx";
// Asset URLs stay on the primary: rendered images must not break when a node drains.
import { primaryApiBase } from "../../lib/nodeRouting";
import { absoluteAssetUrl } from "../../lib/callCoinPrefs.js";
import { cssUrl } from "../../lib/cssUrl";
import { profileColorClass, profileColorStyle } from "../../lib/profileColors";
import { localText } from "../../lib/shop2Logic.js";
import { Mic, Volume2 } from "./shop2Icons.jsx";

/** Item art URL: s2 art is served as /api/shop2/assets/:id (relative to the API host). */
export function assetSrc(item, prefer = "preview") {
  const raw = prefer === "asset" ? item?.asset_url || item?.preview_url : item?.preview_url || item?.asset_url;
  return absoluteAssetUrl(raw, primaryApiBase()) || null;
}
const imgOf = (item) => assetSrc(item);
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

/** Name in the worn name colour (set pieces: .pcolor-name gradient) + name effect + badge. */
export function S2Name({ user, children, badge = true }) {
  const pc = profileColorClass(user);
  return (
    <span className={`s2-name${pc ? ` ${pc}` : ""}`} style={pc ? profileColorStyle(user) || undefined : undefined}>
      <span className="pcolor-name"><NameEffectText user={user}>{children}</NameEffectText></span>
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

/** Server voice / call tile with the worn voice tile theme (agent C4's skin renderer). */
export function S2VoiceTile({ user, speaking = true, joined = null, size = "lg", label }) {
  const { t } = useLocale();
  const host = voiceTileHostClass(user);
  return (
    <div className={`s2-vtile is-${size}${speaking ? " is-speaking" : ""}${joined ? " has-joined" : ""}${host}`} data-voice-tile={user?.equippedVoiceTile?.effect_key || undefined}>
      <VoiceTileSkin user={user} />
      {joined ? (
        <span className="s2-vtile-joined">
          <Volume2 size={12} />
          <b>{joined.who}</b>
          <JoinWave />
          {joined.sound ? <span>{joined.sound}</span> : null}
        </span>
      ) : null}
      {/* "sm" tiles are ~96px tall: the joined chip and the name pill sit above and below a 30px
          avatar instead of covering a 40px one (owner report, set page voice tile). */}
      <S2Avatar user={user} size={size === "lg" ? 76 : size === "md" ? 56 : 30} className="s2-vtile-av" />
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

/** Join sound row: play, live waveform, length (agent C4's player and recipe renderer). */
export function S2JoinSound({ item, compact = false, accent = null }) {
  if (!item) return null;
  return (
    <div className={`s2-sound${compact ? " is-compact" : ""}`}>
      <JoinSoundPreview item={item} compact={compact} accent={accent} />
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
