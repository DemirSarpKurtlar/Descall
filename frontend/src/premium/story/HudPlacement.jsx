/**
 * Corner, size, opacity and edge distance of a HUD (voice_hud, gaming_hud), in the E style:
 * a corner picker, a size segment and two sliders. Replaces gaming/ui.jsx OverlayPlacement
 * (selects and native ranges). Values and their meaning are unchanged:
 * corner tl|tr|bl|br, scale 0.85|1|1.25, opacity 0.3..1 (step 0.05), margin 0..200 px (step 4).
 */
import { useT } from "../../context/LocaleContext";
import { Group, Seg, SetRow, Slider, SpotPicker } from "./kit.jsx";

const CORNERS = ["tl", "tr", "bl", "br"];
const SCALES = [[0.85, "premiumGaming.common.small"], [1, "premiumGaming.common.medium"], [1.25, "premiumGaming.common.large"]];

export default function HudPlacement({ value, onChange, fkey }) {
  const t = useT();
  const ds = (s) => `${fkey}.${s}`;
  return (
    <Group title={t("premiumGaming.common.position")}>
      <SpotPicker
        value={value.corner}
        spots={CORNERS.map((c) => ({ id: c, label: t(`premiumGaming.common.corner.${c}`) }))}
        onChange={(corner) => onChange({ corner })}
        label={t("premiumGaming.common.position")}
        ds={ds("corner")}
      />
      <SetRow icon="size" label={t("premiumGaming.common.size")}>
        <Seg value={value.scale} onChange={(v) => onChange({ scale: Number(v) })} label={t("premiumGaming.common.size")} ds={ds("size")} options={SCALES.map(([v, k]) => ({ value: v, label: t(k) }))} />
      </SetRow>
      <SetRow icon="drop" label={t("premiumGaming.common.opacity")} stack>
        <Slider value={Math.round(value.opacity * 100)} min={30} max={100} step={5} ds={ds("opacity")} onChange={(v) => onChange({ opacity: v / 100 })} label={t("premiumGaming.common.opacity")} format={(v) => t("premium.panel.opacityValue", { value: v })} />
      </SetRow>
      <SetRow icon="edge" label={t("premiumGaming.common.margin")} stack>
        <Slider value={value.margin} min={0} max={200} step={4} ds={ds("margin")} onChange={(margin) => onChange({ margin })} label={t("premiumGaming.common.margin")} format={(v) => `${v}px`} />
      </SetRow>
    </Group>
  );
}
