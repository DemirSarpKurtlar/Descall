import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { LayoutGrid, Pin, RectangleHorizontal } from "lucide-react";
import { useT } from "../../context/LocaleContext";
import { framerSpring, REDUCED_MOTION_FADE, SPRINGS } from "../../lib/fluid/springs";

export function ShareGridVideo({ stream }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.muted = true;
    if (!stream) {
      if (el.srcObject) el.srcObject = null;
      return;
    }
    if (el.srcObject !== stream) el.srcObject = stream;
    el.play?.().catch(() => {});
  }, [stream]);
  return <video ref={ref} className="share-film-video" autoPlay playsInline muted />;
}

/**
 * Glass filmstrip of every live screen share. Press feedback is instant on
 * pointerdown; the selected card springs into place and can be pinned.
 */
export default function ShareFilmstrip({
  sharers,
  activeId,
  pinnedId,
  layout = "stage",
  onSelect,
  onTogglePin,
  onToggleLayout,
}) {
  const t = useT();
  const reduce = useReducedMotion();
  const spring = reduce ? REDUCED_MOTION_FADE : framerSpring(SPRINGS.move);
  if (!sharers?.length) return null;
  const grid = layout === "grid";

  return (
    <div className="share-filmstrip" role="listbox" aria-label={t("Screens:")}>
      <button
        type="button"
        className={`share-film-tool${grid ? " is-on" : ""}`}
        aria-pressed={grid}
        aria-label={grid ? t("One screen") : t("Share grid")}
        onClick={onToggleLayout}
      >
        {grid ? <RectangleHorizontal size={15} /> : <LayoutGrid size={15} />}
      </button>
      <div className="share-film-row">
        {sharers.map((sharer) => {
          const active = String(sharer.id) === String(activeId);
          const pinned = pinnedId != null && String(sharer.id) === String(pinnedId);
          const label = sharer.label || sharer.username || "";
          return (
            <motion.div
              key={sharer.id}
              layout
              role="option"
              aria-selected={active}
              transition={spring}
              className={`share-film-card${active ? " is-active" : ""}${pinned ? " is-pinned" : ""}`}
              onPointerDown={(event) => event.currentTarget.classList.add("is-pressed")}
              onPointerUp={(event) => event.currentTarget.classList.remove("is-pressed")}
              onPointerCancel={(event) => event.currentTarget.classList.remove("is-pressed")}
              onClick={() => onSelect?.(sharer.id)}
            >
              <ShareGridVideo stream={sharer.stream} />
              <span className="share-film-live">{t("Live")}</span>
              <span className="share-film-name">{label}</span>
              <button
                type="button"
                className="share-film-pin"
                aria-label={pinned ? t("Unpin") : t("Pin")}
                aria-pressed={pinned}
                onClick={(event) => {
                  event.stopPropagation();
                  onTogglePin?.(sharer.id);
                }}
              >
                <Pin size={12} />
              </button>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
