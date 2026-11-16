// Market 2.0 (C4) voice cosmetics for React surfaces:
//   VoiceTileSkin        skin layer inside a server voice / call tile (first child)
//   voiceTileHostClass   "vt2-on" for the host tile when a skin is shown
//   VoiceJoinChip        "<name> katıldı" chip on the joiner's tile while their sound plays
//   VoiceTilePreview     shop / inventory preview (demo tile breathing into "speaking")
//   JoinSoundPreview     play button + waveform + length for a join sound item
//   VoiceCosmeticPreview picks the right preview for a voice_tile / join_sound item
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Play, Square, Volume2 } from "../ui/Icon.jsx";
import { voiceTileKeyOf, voiceTileSkin, VOICE_TILE_DESIGNS } from "../../lib/voiceTiles.js";
import { JOIN_SOUND_EVENT, prepareJoinSound, previewJoinSound } from "../../lib/joinSounds.js";
import { useVoiceText } from "../../lib/shopVoiceText.js";
import { localizeShopItem } from "../../lib/shopItemI18n.js";
import { useLocale } from "../../context/localeContextInstance.js";
import "../../styles/shop2-c4.css";

/** Skin descriptor for a user (or an explicit effect key), or null. */
export function skinFor(userOrKey) {
  const key = typeof userOrKey === "string" ? userOrKey : voiceTileKeyOf(userOrKey);
  return key ? voiceTileSkin(key) : null;
}

/** Class for the host tile ("vt2-on") when it shows a skin. */
export function voiceTileHostClass(user, { video = false } = {}) {
  return !video && voiceTileKeyOf(user) ? " vt2-on" : "";
}

export const VoiceTileSkin = memo(function VoiceTileSkin({ user = null, effectKey = null }) {
  const skin = skinFor(effectKey || user);
  if (!skin) return null;
  return (
    <div className={skin.className} style={skin.style} aria-hidden="true" data-vt={skin.key}>
      <i className="vt2-fx" />
    </div>
  );
});

/** Shows "<name> katıldı" on the joiner's tile while their join sound plays. */
export function VoiceJoinChip({ userId, name }) {
  const tv = useVoiceText();
  const [shownAt, setShownAt] = useState(0);
  useEffect(() => {
    if (!userId || typeof window === "undefined") return undefined;
    const id = String(userId);
    const onSound = (e) => {
      if (String(e?.detail?.userId || "") === id) setShownAt(Date.now());
    };
    window.addEventListener(JOIN_SOUND_EVENT, onSound);
    return () => window.removeEventListener(JOIN_SOUND_EVENT, onSound);
  }, [userId]);
  useEffect(() => {
    if (!shownAt) return undefined;
    const timer = setTimeout(() => setShownAt(0), 2700);
    return () => clearTimeout(timer);
  }, [shownAt]);
  if (!shownAt) return null;
  return (
    <span key={shownAt} className="js2-joined-chip" role="status">
      <Volume2 size={12} />
      <span>{tv("joined", { name: name || "" })}</span>
    </span>
  );
}

export function VoiceTilePreview({ item = null, effectKey = null, name = "", initials = "DA", wide = false, demo = true }) {
  const tv = useVoiceText();
  const key = effectKey || item?.effect_key || null;
  const skin = key && VOICE_TILE_DESIGNS[key] ? voiceTileSkin(key) : null;
  const label = name || tv("demoName");
  return (
    <div
      className={`vt2-preview${wide ? " is-wide" : ""}${demo ? " is-demo" : " vt2-demo-speaking"}`}
      style={skin ? skin.style : undefined}
      role="img"
      aria-label={tv("tilePreview")}
    >
      {skin ? (
        <div className={skin.className} style={skin.style} aria-hidden="true">
          <i className="vt2-fx" />
        </div>
      ) : null}
      <span className="vt2-preview-avatar" aria-hidden="true">
        {initials}
      </span>
      <span className="vt2-preview-name" aria-hidden="true">
        <i />
        {label}
      </span>
    </div>
  );
}

function Wave({ peaks, progress = -1, colorA, colorB }) {
  const bars = peaks && peaks.length ? peaks : new Array(36).fill(0.15);
  const n = bars.length;
  const [id] = useState(() => `jsw${Math.round(Math.random() * 1e9)}`);
  return (
    <svg className="js2-wave" viewBox={`0 0 ${n * 2.6} 26`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={colorB || "#9fb3ff"} />
          <stop offset="1" stopColor={colorA || "#587af5"} />
        </linearGradient>
      </defs>
      {bars.map((v, i) => {
        const h = Math.max(2, v * 24);
        const played = progress >= 0 && i / n <= progress;
        return <rect key={i} x={i * 2.6} y={13 - h / 2} width="1.7" height={h} rx="0.8" fill={`url(#${id})`} opacity={progress < 0 || played ? 1 : 0.38} />;
      })}
    </svg>
  );
}

/** Join sound preview: tap to listen, waveform with live progress, length. */
export function JoinSoundPreview({ item, compact = false, accent = null }) {
  const tv = useVoiceText();
  const { locale } = useLocale();
  const [info, setInfo] = useState(null); // { peaks, duration }
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(-1);
  const [failed, setFailed] = useState(false);
  const stopRef = useRef(null);
  const rafRef = useRef(0);
  const rootRef = useRef(null);

  // Prepare (render + waveform) once the card is on screen.
  useEffect(() => {
    if (!item) return undefined;
    let cancelled = false;
    const el = rootRef.current;
    const go = () =>
      prepareJoinSound(item).then((p) => {
        if (!cancelled) {
          if (p) setInfo({ peaks: p.peaks, duration: p.duration });
          else setFailed(true);
        }
      });
    if (typeof IntersectionObserver === "undefined" || !el) {
      go();
      return () => {
        cancelled = true;
      };
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        go();
      }
    });
    io.observe(el);
    return () => {
      cancelled = true;
      io.disconnect();
    };
  }, [item]);

  const stop = useCallback(() => {
    stopRef.current?.stop?.();
    stopRef.current = null;
    cancelAnimationFrame(rafRef.current);
    setPlaying(false);
    setProgress(-1);
  }, []);

  useEffect(() => stop, [stop]);

  const toggle = useCallback(async () => {
    if (playing) {
      stop();
      return;
    }
    const res = await previewJoinSound(item);
    if (!res) {
      setFailed(true);
      return;
    }
    stopRef.current = res;
    setInfo((prev) => prev || { peaks: res.peaks, duration: res.duration });
    setPlaying(true);
    const t0 = performance.now();
    const tick = () => {
      const p = (performance.now() - t0) / 1000 / Math.max(0.1, res.duration);
      if (p >= 1) {
        stop();
        return;
      }
      setProgress(p);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [item, playing, stop]);

  if (!item) return null;
  const { name } = localizeShopItem(item, locale);
  const secs = info ? Math.round(info.duration * 10) / 10 : null;
  const secsText = secs != null ? tv("seconds", { n: secs.toLocaleString(locale || undefined) }) : "";
  const style = accent ? { "--js-a": accent[0], "--js-b": accent[1] || accent[0] } : undefined;
  return (
    <div ref={rootRef} className={`js2-preview${compact ? " is-compact" : ""}`} style={style}>
      <button
        type="button"
        className="js2-play"
        onClick={toggle}
        aria-label={playing ? tv("stop") : tv("previewOf", { name })}
        aria-pressed={playing}
        disabled={failed}
        title={failed ? tv("unavailable") : undefined}
      >
        {playing ? <Square size={14} /> : <Play size={16} />}
      </button>
      {compact ? null : (
        <span className="js2-meta">
          <b>{name}</b>
          <small>
            {tv("joinSound")}
            {secsText ? ` · ${secsText}` : ""}
          </small>
        </span>
      )}
      <Wave peaks={info?.peaks} progress={playing ? progress : -1} colorA={accent?.[0]} colorB={accent?.[1]} />
    </div>
  );
}

/** Preview for any C4 item (voice_tile or join_sound); null for other categories. */
export function VoiceCosmeticPreview({ item, compact = false }) {
  if (!item) return null;
  if (item.category === "voice_tile") return <VoiceTilePreview item={item} />;
  if (item.category === "join_sound") return <JoinSoundPreview item={item} compact={compact} />;
  return null;
}

export default VoiceCosmeticPreview;
