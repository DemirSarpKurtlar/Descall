import { useLivePreviewTick } from "./useLivePreviewTick.js";

/**
 * Live preview of a profile aura on a shop card: a mini profile card wearing
 * the real `cosmetic-profile-aura aura-<key>` classes (the same ones the
 * profile modal / hover card use). While visible the aura glow swells on the
 * shared preview loop (transform + opacity only); reduced motion = still card.
 */
export default function ProfileAuraPreview({ effectKey, name = "", compact = false }) {
  const { ref, still, tick } = useLivePreviewTick();
  const aura = `cosmetic-profile-aura aura-${effectKey}`;
  const letter = Array.from(String(name || "D").trim())[0] || "D";
  return (
    <div
      ref={ref}
      className={`shop-profile-aura-preview spa-live${still ? " is-still" : ""}${compact ? " is-compact" : ""}`}
      data-effect={effectKey}
      aria-hidden="true"
    >
      <div className="spa-stage">
        {/* glow twin: same aura class, fades/swells so the real glow "breathes" */}
        <span key={`g${tick}`} className={`spa-glow ${aura}${tick ? " is-pulse" : ""}`} />
        <div key={`c${tick}`} className={`spa-card ${aura}${tick ? " is-pulse" : ""}`}>
          <span className="spa-banner" />
          <span className="spa-av">{letter}</span>
          <span className="spa-line" />
          <span className="spa-line is-short" />
        </div>
      </div>
    </div>
  );
}
