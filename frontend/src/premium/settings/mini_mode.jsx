/**
 * Descall+ mini mode: the floating call card. When the member minimises a call, a small
 * draggable glass card (avatar, name, mute / deafen / hang up) stays on screen and docks to
 * a corner or an edge. Free accounts get only a slim "Return to call" bar instead.
 * The panel picks the spot the card docks to (the card also remembers where it was dragged).
 */
import { useState } from "react";
import { useT } from "../../context/LocaleContext";
import { ANCHORS, readDockAnchor, writeDockAnchor } from "../../lib/miniCallDock.js";

export const key = "mini_mode";

export function Panel() {
  const t = useT();
  const [anchor, setAnchor] = useState(() => readDockAnchor());
  const pick = (a) => { writeDockAnchor(a); setAnchor(readDockAnchor()); };
  return (
    <div className="pp-mini">
      <p className="pp-mini-info">{t("premium.panel.miniInfo")}</p>
      <div className="pp-mini-label" id="pp-mini-dock">{t("premium.panel.miniDock")}</div>
      <div className="pp-mini-screen" role="radiogroup" aria-labelledby="pp-mini-dock">
        {ANCHORS.map((a) => (
          <button
            key={a}
            type="button"
            role="radio"
            aria-checked={anchor === a}
            aria-label={t(`premium.panel.dock.${a}`)}
            title={t(`premium.panel.dock.${a}`)}
            className={`pp-mini-spot is-${a}${anchor === a ? " is-on" : ""}`}
            data-testid={`premium-mini-dock-${a}`}
            onClick={() => pick(a)}
          >
            <span className="pp-mini-card" aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  );
}
