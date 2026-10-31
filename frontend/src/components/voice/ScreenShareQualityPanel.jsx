import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Monitor, X, Check, Loader2, Info, Type, Gamepad2, Layout, Wifi } from "../ui/Icon.jsx";
import {
  GROUP_SCREEN_DEFAULT_QUALITY,
  SCREEN_QUALITY_PRESETS,
  estimateScreenShareMbps,
} from "../../lib/webrtcScreenShare";
import { useIsNarrowViewport } from "../../lib/useIsNarrowViewport";
import { useLocale, useT } from "../../context/LocaleContext";
import { usePressFeedbackScope } from "../../hooks/usePressFeedback";
import { SPRINGS, framerSpring, REDUCED_MOTION_FADE } from "../../lib/fluid/springs";

export const SCREEN_RESOLUTION_PRESETS = [
  { value: "480p", label: "480p", desc: "854×480", hintKey: "Smoothest, low bandwidth" },
  { value: "720p", label: "720p HD", desc: "1280×720", hintKey: "Recommended balance" },
  { value: "1080p", label: "1080p FHD", desc: "1920×1080", hintKey: "Sharp text / UI" },
  { value: "1440p", label: "1440p QHD", desc: "2560×1440", hintKey: "Ultra clarity (1:1)" },
];

export const SCREEN_FPS_PRESETS = [
  { value: 15, label: "15", hintKey: "Presentations / slides" },
  { value: 20, label: "20", hintKey: "Default" },
  { value: 24, label: "24", hintKey: "Smooth motion" },
  { value: 30, label: "30", hintKey: "1:1 calls" },
  { value: 60, label: "60", hintKey: "Game capture (1:1)" },
];

/**
 * 3.7.15 design A (owner pick): three plain questions. What you share sets the
 * encoder content hint and a sensible starting resolution / frame rate; the two
 * segmented rows fine-tune it. Same quality object as before
 * ({ resolution, fps, contentHint }), so the capture / restart code is unchanged.
 */
export const CONTENT_CHOICES = [
  { value: "motion", icon: Gamepad2, labelKey: "Games, video" },
  { value: "detail", icon: Layout, labelKey: "Apps" },
  { value: "text", icon: Type, labelKey: "Text, code" },
];

/** Frame-rate segments: 15 / 20 / 30 / 60, plus 24 only when that is the current value. */
export function fpsSegments(options, current) {
  const base = options.filter((o) => o.value !== 24);
  if (Number(current) === 24 && options.some((o) => o.value === 24)) return options;
  return base.length ? base : options;
}

/** Highest allowed value not above `want` (falls back to the lowest option). */
function clampTo(options, want, key = "value", order = (o) => o[key]) {
  const sorted = [...options].sort((x, y) => order(x) - order(y));
  let pick = sorted[0];
  for (const o of sorted) if (order(o) <= want) pick = o;
  return pick ? pick[key] : want;
}

const RES_RANK = { "480p": 480, "720p": 720, "1080p": 1080, "1440p": 1440 };

/**
 * The quality a content choice starts from: motion keeps the resolution and
 * raises the frame rate to 30; apps = 1080p at 24-30; text = the "text" preset
 * (1080p 20). Clamped to what this call allows (group calls).
 */
export function qualityForContent(value, quality, resolutionOptions, fpsOptions) {
  const resOf = (want) => clampTo(resolutionOptions, RES_RANK[want] || 720, "value", (o) => RES_RANK[o.value] || 0);
  const fpsOf = (want) => clampTo(fpsOptions, want);
  if (value === "text") {
    const p = SCREEN_QUALITY_PRESETS.text;
    return { ...quality, resolution: resOf(p.resolution), fps: fpsOf(p.fps), contentHint: "text" };
  }
  if (value === "detail") {
    const fps = (Number(quality.fps) || 24) >= 30 ? 30 : 24;
    return { ...quality, resolution: resOf("1080p"), fps: fpsOf(fps), contentHint: "detail" };
  }
  const fps = Math.max(30, Number(quality.fps) || 30);
  return { ...quality, resolution: resOf(quality.resolution || "720p"), fps: fpsOf(fps), contentHint: "motion" };
}

/** Locale decimal separator: "4,4" in Turkish, "4.4" in English. */
export function formatMbps(mbps, locale = "tr") {
  const n = Number(mbps) || 0;
  try {
    return n.toLocaleString(locale, { maximumFractionDigits: 2 });
  } catch {
    return String(n);
  }
}

/**
 * Advanced screen-share quality picker, presets + resolution / FPS / content mode.
 */
export default function ScreenShareQualityPanel({
  open,
  onClose,
  anchorRef,
  screenQuality,
  setScreenQuality,
  isScreenSharing,
  isGroupCall,
  participantCount = 2,
  onStartWithQuality,
  onRestartWithQuality,
}) {
  const t = useT();
  const { locale } = useLocale() || {};
  const reduceMotion = useReducedMotion();
  const panelRef = useRef(null);
  usePressFeedbackScope(panelRef, { enabled: open });
  const [applying, setApplying] = useState(false);
  const [appliedFlash, setAppliedFlash] = useState(false);
  const quality = screenQuality || GROUP_SCREEN_DEFAULT_QUALITY;
  const narrow = useIsNarrowViewport(720);
  const mbps = useMemo(
    () => estimateScreenShareMbps(quality, participantCount),
    [quality, participantCount]
  );

  const resolutionOptions = useMemo(() => {
    if (isGroupCall && participantCount >= 3) {
      return SCREEN_RESOLUTION_PRESETS.filter((r) => r.value !== "1440p");
    }
    return SCREEN_RESOLUTION_PRESETS;
  }, [isGroupCall, participantCount]);

  const fpsOptions = useMemo(() => {
    if (isGroupCall && participantCount >= 3) {
      return SCREEN_FPS_PRESETS.filter((f) => f.value <= 24);
    }
    if (isGroupCall) {
      return SCREEN_FPS_PRESETS.filter((f) => f.value <= 30);
    }
    return SCREEN_FPS_PRESETS;
  }, [isGroupCall, participantCount]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e) => {
      if (panelRef.current?.contains(e.target)) return;
      if (anchorRef?.current?.contains(e.target)) return;
      onClose?.();
    };
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [open, onClose, anchorRef]);

  const applyChange = useCallback(
    async (nextQuality) => {
      setScreenQuality(nextQuality);
      if (!isScreenSharing) return;
      if (!onRestartWithQuality) return;
      setApplying(true);
      try {
        await onRestartWithQuality(nextQuality);
        setAppliedFlash(true);
        setTimeout(() => setAppliedFlash(false), 1200);
      } finally {
        setApplying(false);
      }
    },
    [isScreenSharing, onRestartWithQuality, setScreenQuality]
  );

  const pickContent = (value) => {
    void applyChange(qualityForContent(value, quality, resolutionOptions, fpsOptions));
  };

  const pickResolution = (resolution) => {
    void applyChange({ ...quality, resolution });
  };

  const pickFps = (fps) => {
    void applyChange({ ...quality, fps });
  };

  const handleStart = async () => {
    setApplying(true);
    try {
      await onStartWithQuality?.(quality);
      onClose?.();
    } finally {
      setApplying(false);
    }
  };

  const meshWarning =
    isGroupCall &&
    participantCount >= 3 &&
    (quality.resolution === "1080p" ||
      quality.resolution === "1440p" ||
      (quality.fps || 20) > 24);

  const fpsValue = Number(quality.fps) || 24;
  const fpsShown = fpsSegments(fpsOptions, fpsValue);
  const contentValue = quality.contentHint === "text" || quality.contentHint === "detail" ? quality.contentHint : "motion";
  const motionTransition = reduceMotion ? REDUCED_MOTION_FADE : framerSpring(SPRINGS.materialize);
  const popStyle = narrow
    ? {
        position: "fixed",
        left: 12,
        right: 12,
        bottom: "max(12px, calc(env(safe-area-inset-bottom, 0px) + 88px))",
        width: "auto",
        zIndex: 10050,
      }
    : {
        position: "absolute",
        bottom: "calc(100% + 14px)",
        left: "50%",
        width: "min(420px, calc(100vw - 32px))",
        zIndex: 50,
      };
  const hidden = reduceMotion
    ? narrow
      ? { opacity: 0 }
      : { opacity: 0, x: "-50%" }
    : narrow
      ? { opacity: 0, y: 16 }
      : { opacity: 0, y: 10, x: "-50%", scale: 0.96 };
  const shown = reduceMotion
    ? narrow
      ? { opacity: 1 }
      : { opacity: 1, x: "-50%" }
    : narrow
      ? { opacity: 1, y: 0 }
      : { opacity: 1, y: 0, x: "-50%", scale: 1 };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={panelRef}
          className={`ssq-pop${narrow ? " is-narrow" : ""}`}
          role="dialog"
          aria-label={t("Screen share quality")}
          initial={hidden}
          animate={shown}
          exit={hidden}
          transition={motionTransition}
          style={popStyle}
        >
          <div className="ssq-sheet">
            <div className="ssq-sheen" aria-hidden="true" />
            <div className="ssq-scroll">
              <div className="ssq-head">
                <div className="ssq-head-copy">
                  <h2 className="ssq-title">{t("Screen share")}</h2>
                  <p className="ssq-sub">
                    {isScreenSharing
                      ? t("Live, changes will restart sharing")
                      : t("Pick the quality before you share")}
                  </p>
                </div>
                <button type="button" className="ssq-close" onClick={onClose} aria-label={t("Close")}>
                  <X size={16} />
                </button>
              </div>

              {meshWarning && (
                <div className="ssq-warn">
                  <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>
                    {t(
                      "In a group call ({count} people), high resolution/FPS can cause lag. 720p / 20 FPS is recommended.",
                      { count: participantCount }
                    )}
                  </span>
                </div>
              )}

              <div className="ssq-label" id="ssq-what">{t("What are you sharing?")}</div>
              <div className="ssq-seg is-tall" role="radiogroup" aria-labelledby="ssq-what">
                {CONTENT_CHOICES.map((choice) => {
                  const Icon = choice.icon;
                  const on = contentValue === choice.value;
                  return (
                    <button
                      key={choice.value}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      className={on ? "is-on" : undefined}
                      disabled={applying}
                      onClick={() => pickContent(choice.value)}
                    >
                      <Icon size={20} aria-hidden="true" />
                      <span>{t(choice.labelKey)}</span>
                    </button>
                  );
                })}
              </div>

              <div className="ssq-label" id="ssq-res">{t("Resolution")}</div>
              <div className="ssq-seg" role="radiogroup" aria-labelledby="ssq-res">
                {resolutionOptions.map((res) => {
                  const on = quality.resolution === res.value;
                  return (
                    <button
                      key={res.value}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      className={on ? "is-on" : undefined}
                      disabled={applying}
                      title={`${res.desc} · ${t(res.hintKey)}`}
                      onClick={() => pickResolution(res.value)}
                    >
                      {res.value}
                    </button>
                  );
                })}
              </div>

              <div className="ssq-label" id="ssq-fps">{t("Frame rate")}</div>
              <div className="ssq-seg" role="radiogroup" aria-labelledby="ssq-fps">
                {fpsShown.map((fps) => {
                  const on = fpsValue === fps.value;
                  return (
                    <button
                      key={fps.value}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      aria-label={`${fps.value} FPS`}
                      className={on ? "is-on" : undefined}
                      disabled={applying}
                      title={t(fps.hintKey)}
                      onClick={() => pickFps(fps.value)}
                    >
                      {fps.label}
                    </button>
                  );
                })}
              </div>

              <div className="ssq-sum" aria-live="polite" title={t("Estimated encode bitrate")}>
                <Wifi size={16} aria-hidden="true" />
                <span>
                  <b>{quality.resolution} · {fpsValue} FPS</b>
                  {" · "}
                  {t("about {mbps} Mbps", { mbps: formatMbps(mbps, locale) })}
                </span>
              </div>

              {applying && (
                <div className="ssq-status">
                  <Loader2 size={14} className="ssq-spin" />
                  {t("Applying…")}
                </div>
              )}
              {appliedFlash && !applying && (
                <div className="ssq-status is-ok">
                  <Check size={14} />
                  {t("Settings applied")}
                </div>
              )}
              {!isScreenSharing && (
                <button type="button" className="ssq-cta" onClick={handleStart} disabled={applying}>
                  {applying ? <Loader2 size={16} className="ssq-spin" /> : <Monitor size={16} weight="fill" />}
                  {t("Start sharing")}
                </button>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
