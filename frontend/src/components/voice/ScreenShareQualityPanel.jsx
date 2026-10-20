import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Monitor, X, Check, Loader2, Maximize2, Gauge, Info, Sparkles, Type, Gamepad2, Zap, SlidersHorizontal, ChevronDown, Activity } from "../ui/Icon.jsx";
import {
  GROUP_SCREEN_DEFAULT_QUALITY,
  SCREEN_QUALITY_PRESETS,
  estimateScreenShareMbps,
  matchScreenQualityPreset,
} from "../../lib/webrtcScreenShare";
import { useIsNarrowViewport } from "../../lib/useIsNarrowViewport";
import { useT } from "../../context/LocaleContext";
import { usePressFeedbackScope } from "../../hooks/usePressFeedback";
import { SPRINGS, framerSpring, REDUCED_MOTION_FADE } from "../../lib/fluid/springs";

const CHECK_SPRING = Object.freeze({ dampingRatio: 0.75, response: 0.28 });

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

const PRESET_CARDS = [
  {
    id: "smooth",
    icon: Zap,
    titleKey: "Smooth",
    descKey: "Low bandwidth, fluid",
    accent: "#34d399",
  },
  {
    id: "balanced",
    icon: Gauge,
    titleKey: "Balanced",
    descKey: "Best for most shares",
    accent: "#818cf8",
  },
  {
    id: "high",
    icon: Activity,
    titleKey: "High",
    descKey: "Full HD, 30 FPS",
    accent: "#60a5fa",
  },
  {
    id: "ultra",
    icon: Gamepad2,
    titleKey: "Ultra",
    descKey: "QHD gaming / video",
    accent: "#f472b6",
  },
  {
    id: "text",
    icon: Type,
    titleKey: "Text",
    descKey: "Code, docs, slides",
    accent: "#fbbf24",
  },
];

const CONTENT_MODES = [
  { value: "motion", labelKey: "Motion", descKey: "Games & video" },
  { value: "detail", labelKey: "Detail", descKey: "UI & photos" },
  { value: "text", labelKey: "Text", descKey: "Code & docs" },
];

function SectionLabel({ icon: Icon, children }) {
  return (
    <div className="ssq-label">
      {Icon ? <Icon size={12} /> : null}
      {children}
    </div>
  );
}

function nearestIndex(options, value) {
  let best = 0;
  let dist = Infinity;
  options.forEach((option, index) => {
    const gap = Math.abs(option.value - value);
    if (gap < dist) {
      dist = gap;
      best = index;
    }
  });
  return best;
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
  const reduceMotion = useReducedMotion();
  const panelRef = useRef(null);
  usePressFeedbackScope(panelRef, { enabled: open });
  const [applying, setApplying] = useState(false);
  const [appliedFlash, setAppliedFlash] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const quality = screenQuality || GROUP_SCREEN_DEFAULT_QUALITY;
  const narrow = useIsNarrowViewport(720);
  const activePreset = useMemo(() => matchScreenQualityPreset(quality), [quality]);
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

  useEffect(() => {
    if (open && activePreset === "custom") setShowAdvanced(true);
  }, [open, activePreset]);

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

  const pickPreset = (presetId) => {
    const preset = SCREEN_QUALITY_PRESETS[presetId];
    if (!preset) return;
    if (isGroupCall && participantCount >= 3 && (preset.resolution === "1440p" || preset.fps > 24)) {
      void applyChange({
        ...preset,
        resolution: preset.resolution === "1440p" ? "1080p" : preset.resolution,
        fps: Math.min(preset.fps, 24),
      });
      return;
    }
    void applyChange({ ...preset });
  };

  const pickResolution = (resolution) => {
    void applyChange({ ...quality, resolution });
  };

  const pickFps = (fps) => {
    void applyChange({ ...quality, fps });
  };

  const pickContentHint = (contentHint) => {
    void applyChange({ ...quality, contentHint });
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

  const contentLabel =
    quality.contentHint === "text"
      ? t("Text")
      : quality.contentHint === "detail"
        ? t("Detail")
        : t("Motion");
  const fpsValue = Number(quality.fps) || 24;
  const fpsIndex = nearestIndex(fpsOptions, fpsValue);
  const activeFps = fpsOptions[fpsIndex];
  const motionTransition = reduceMotion ? REDUCED_MOTION_FADE : framerSpring(SPRINGS.materialize);
  const checkTransition = reduceMotion ? REDUCED_MOTION_FADE : framerSpring(CHECK_SPRING);
  const exactFps = fpsOptions.find((option) => option.value === Number(quality.fps));
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
                <div className="ssq-mark" aria-hidden="true">
                  <Monitor size={18} />
                </div>
                <div className="ssq-head-copy">
                  <h2 className="ssq-title">{t("Screen share quality")}</h2>
                  <p className="ssq-sub">
                    {isScreenSharing
                      ? t("Live, changes will restart sharing")
                      : t("Choose a preset or fine-tune below")}
                  </p>
                </div>
                <button type="button" className="ssq-close" onClick={onClose} aria-label={t("Close")}>
                  <X size={16} />
                </button>
              </div>

              <div className="ssq-chips" aria-live="polite">
                <span className="ssq-chip">{quality.resolution}</span>
                <span className="ssq-chip">{fpsValue} FPS</span>
                <span className="ssq-chip" title={t("Estimated encode bitrate")}>
                  ~{mbps} Mbps
                </span>
                <span className="ssq-chip is-muted">{contentLabel}</span>
                <span className="ssq-chip is-muted">
                  {activePreset !== "custom" ? t("Preset") : t("Custom")}
                </span>
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

              <SectionLabel icon={Sparkles}>{t("Presets")}</SectionLabel>
              <div className="ssq-grid" role="radiogroup" aria-label={t("Presets")}>
                {PRESET_CARDS.map((card) => {
                  const Icon = card.icon;
                  const active = activePreset === card.id;
                  const preset = SCREEN_QUALITY_PRESETS[card.id];
                  const locked =
                    isGroupCall &&
                    participantCount >= 3 &&
                    (preset.resolution === "1440p" || preset.fps > 24) &&
                    card.id === "ultra";
                  const cardClass = [
                    "ssq-card",
                    card.id === "text" ? "is-wide" : "",
                    active ? "is-on" : "",
                    locked ? "is-locked" : "",
                    applying && !locked ? "is-busy" : "",
                  ]
                    .filter(Boolean)
                    .join(" ");
                  return (
                    <button
                      key={card.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      disabled={applying || locked}
                      onClick={() => pickPreset(card.id)}
                      className={cardClass}
                      style={{ "--ssq-accent": card.accent }}
                    >
                      <span className="ssq-card-icon" aria-hidden="true">
                        <Icon size={22} />
                      </span>
                      <span className="ssq-card-copy">
                        <span className="ssq-card-title">{t(card.titleKey)}</span>
                        <span className="ssq-card-desc">{t(card.descKey)}</span>
                        <span className="ssq-card-meta">
                          {preset.resolution} · {preset.fps} FPS
                        </span>
                      </span>
                      <AnimatePresence>
                        {active && (
                          <motion.span
                            className="ssq-check"
                            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.4 }}
                            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }}
                            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.4 }}
                            transition={checkTransition}
                          >
                            <Check size={14} />
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                className="ssq-advanced"
                aria-expanded={showAdvanced}
                onClick={() => setShowAdvanced((v) => !v)}
              >
                <span className="ssq-advanced-label">
                  <SlidersHorizontal size={14} />
                  {t("Advanced settings")}
                </span>
                <motion.span
                  aria-hidden="true"
                  animate={{ rotate: showAdvanced ? 180 : 0 }}
                  transition={reduceMotion ? REDUCED_MOTION_FADE : framerSpring(SPRINGS.default)}
                  style={{ display: "inline-flex" }}
                >
                  <ChevronDown size={16} />
                </motion.span>
              </button>

              <motion.div
                className="ssq-advanced-body"
                initial={false}
                animate={{ height: showAdvanced ? "auto" : 0, opacity: showAdvanced ? 1 : 0 }}
                transition={reduceMotion ? REDUCED_MOTION_FADE : framerSpring(SPRINGS.default)}
                aria-hidden={!showAdvanced}
                {...(showAdvanced ? {} : { inert: "" })}
              >
                <div className="ssq-block">
                  <SectionLabel icon={Maximize2}>{t("Resolution")}</SectionLabel>
                  <div className="ssq-seg is-res" role="radiogroup" aria-label={t("Resolution")}>
                    {resolutionOptions.map((res) => {
                      const active = quality.resolution === res.value;
                      return (
                        <button
                          key={res.value}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          className={active ? "is-on" : undefined}
                          disabled={applying}
                          title={t(res.hintKey)}
                          onClick={() => pickResolution(res.value)}
                        >
                          <div className="ssq-seg-title">{res.label}</div>
                          <div className="ssq-seg-desc">{res.desc}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="ssq-block">
                  <SectionLabel icon={Gauge}>{t("Frame rate")}</SectionLabel>
                  <div className="ssq-slider-wrap">
                    <input
                      className="ssq-slider"
                      type="range"
                      min={0}
                      max={Math.max(0, fpsOptions.length - 1)}
                      step={1}
                      value={fpsIndex}
                      disabled={applying || fpsOptions.length < 2}
                      aria-label={t("Frame rate")}
                      aria-valuemin={fpsOptions[0]?.value}
                      aria-valuemax={fpsOptions[fpsOptions.length - 1]?.value}
                      aria-valuenow={activeFps?.value ?? fpsValue}
                      aria-valuetext={activeFps ? `${activeFps.value} FPS` : `${fpsValue} FPS`}
                      onChange={(e) => {
                        const next = fpsOptions[Number(e.target.value)];
                        if (next) pickFps(next.value);
                      }}
                    />
                  </div>
                  <div className="ssq-ticks" role="group" aria-label={t("Frame rate")}>
                    {fpsOptions.map((fps) => (
                      <button
                        key={fps.value}
                        type="button"
                        className={`ssq-tick${Number(quality.fps) === fps.value ? " is-on" : ""}`}
                        disabled={applying}
                        title={t(fps.hintKey)}
                        onClick={() => pickFps(fps.value)}
                      >
                        {fps.label}
                      </button>
                    ))}
                  </div>
                  {exactFps ? <p className="ssq-hint">{t(exactFps.hintKey)}</p> : null}
                </div>

                <div className="ssq-block">
                  <SectionLabel icon={Type}>{t("Optimize for")}</SectionLabel>
                  <div className="ssq-seg is-mode" role="radiogroup" aria-label={t("Optimize for")}>
                    {CONTENT_MODES.map((mode) => {
                      const isActive = (quality.contentHint || "motion") === mode.value;
                      return (
                        <button
                          key={mode.value}
                          type="button"
                          role="radio"
                          aria-checked={isActive}
                          className={isActive ? "is-on" : undefined}
                          disabled={applying}
                          onClick={() => pickContentHint(mode.value)}
                        >
                          <div className="ssq-seg-title">{t(mode.labelKey)}</div>
                          <div className="ssq-seg-desc">{t(mode.descKey)}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </motion.div>

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
                  {applying ? <Loader2 size={16} className="ssq-spin" /> : <Monitor size={16} />}
                  {t("Share with these settings")}
                </button>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
