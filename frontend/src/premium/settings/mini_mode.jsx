/**
 * Descall+ mini mode: the floating call card. When the member minimises a call, a small
 * draggable glass card (avatar, name, mute / deafen / hang up) stays on screen and docks to
 * a corner or an edge. Free accounts get only a slim "Return to call" bar instead.
 * The panel picks the spot the card docks to (the card also remembers where it was dragged).
 */
import { useState } from "react";
import { useT } from "../../context/LocaleContext";
import { ANCHORS, readDockAnchor, writeDockAnchor } from "../../lib/miniCallDock.js";
import { Group, Note, SpotPicker } from "../story/kit.jsx";
import { usePublish } from "../story/bus.js";

export const key = "mini_mode";
const ds = (s) => `${key}.${s}`;

export function Panel() {
  const t = useT();
  const [anchor, setAnchor] = useState(() => readDockAnchor());
  usePublish("mini_mode.dock", anchor);
  const pick = (a) => { writeDockAnchor(a); setAnchor(readDockAnchor()); };
  return (
    <>
      <Group title={t("premium.panel.miniDock")}>
        <SpotPicker
          value={anchor}
          spots={ANCHORS.map((a) => ({ id: a, label: t(`premium.panel.dock.${a}`) }))}
          onChange={pick}
          label={t("premium.panel.miniDock")}
          ds={ds("dock")}
          testIdPrefix="premium-mini-dock-"
        />
      </Group>
      <Group title={t("premiumStory.g.howItWorks")}>
        <Note ds={ds("info")}>{t("premium.panel.miniInfo")}</Note>
      </Group>
    </>
  );
}
