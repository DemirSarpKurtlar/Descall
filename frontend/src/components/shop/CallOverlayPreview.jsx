import { useLivePreviewTick } from "./useLivePreviewTick.js";

/**
 * Live preview of a call overlay on a shop card: a mini call screen wearing
 * the real `cosmetic-call-overlay overlay-<key>` classes (the ones
 * CallOverlay.jsx puts on the call root) with two participant tiles and a
 * control capsule. (Not `.call-control-bar`: glass-desktop pins that one.) While visible the speaking ring
 * hands over between the tiles like a real call; reduced motion = still frame.
 */
export default function CallOverlayPreview({ effectKey, name = "", compact = false }) {
  const { ref, still, tick } = useLivePreviewTick();
  const speaker = tick % 2;
  const me = Array.from(String(name || "D").trim())[0] || "D";
  return (
    <div
      ref={ref}
      className={`shop-call-overlay-preview cosmetic-call-overlay overlay-${effectKey} sco-live${still ? " is-still" : ""}${compact ? " is-compact" : ""}`}
      data-effect={effectKey}
      aria-hidden="true"
    >
      {compact ? (
        <span className="sco-tiles"><span className="sco-tile is-speaking"><span className="sco-av">{me}</span></span></span>
      ) : (
        <>
          <span className="sco-tiles">
            {[me, "S"].map((l, i) => (
              <span key={i} className={`sco-tile${speaker === i ? " is-speaking" : ""}`}>
                {speaker === i ? <span key={tick} className="sco-ring" /> : null}
                <span className={`sco-av${i ? " is-b" : ""}`}>{l}</span>
              </span>
            ))}
          </span>
          <span className="sco-bar">
            <i /><i /><i /><i className="is-end" />
          </span>
        </>
      )}
    </div>
  );
}
