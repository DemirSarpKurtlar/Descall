import { useMemo } from "react";
import { useT } from "../../context/LocaleContext";
import { useFeatureSettings } from "../featureSettings.js";
import { DEFAULTS } from "../gaming/ui.jsx";
import { isDesktop } from "../gaming/bridge.js";
import { Group, Hint, Ico, IconBtn, Item, List, Note, SetRow, Switch } from "../story/kit.jsx";
import { usePublish } from "../story/bus.js";

export const key = "widgets";
const ds = (s) => `${key}.${s}`;
const KINDS = [["friends", "users"], ["calls", "phone"], ["notifications", "bell"]];
const ICON = Object.fromEntries(KINDS);
const MAX = 4;

function num(v, d) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : d;
}

export function Panel() {
  const t = useT();
  const [s, update] = useFeatureSettings(key, DEFAULTS.widgets);
  const list = Array.isArray(s.widgets) ? s.widgets : [];
  const kinds = useMemo(() => list.map((w) => w.kind), [list]);
  usePublish("widgets.kinds", kinds);
  const set = (id, patch) => update({ widgets: list.map((w) => (w.id === id ? { ...w, ...patch } : w)) });
  const add = (kind) => {
    if (list.length >= MAX) return;
    const i = list.length;
    update({ widgets: [...list, { id: `${kind}${Date.now().toString(36)}`, kind, x: 60 + i * 40, y: 120 + i * 40, width: 240, height: 220, opacity: 0.95 }] });
  };
  const field = (w, k, label, width) => (
    <label>
      {label}
      <input className="ps-in is-num" type="number" style={{ width }} value={w[k]} onChange={(e) => set(w.id, { [k]: num(e.target.value, w[k]) })} />
    </label>
  );
  return (
    <>
      <Group title={t("premiumGaming.widgets.title")}>
        <Note ds={ds("desc")}>{t("premiumGaming.widgets.desc")}</Note>
        {!isDesktop() ? <Hint>{t("premiumGaming.common.desktopOnly")}</Hint> : null}
        <SetRow icon="dash" label={t("premiumGaming.widgets.show")}>
          <Switch checked={s.on} onChange={(on) => update({ on })} label={t("premiumGaming.widgets.show")} disabled={!isDesktop()} testId="pg-widgets-on" ds={ds("on")} />
        </SetRow>
      </Group>
      <Group title={t("premiumStory.g.yourWidgets")} aside={<span className="tnum">{`${list.length} / ${MAX}`}</span>}>
        <div className="ps-adds" data-s={ds("add")}>
          {KINDS.map(([k, icon]) => (
            <button key={k} type="button" className="ps-add" onClick={() => add(k)} disabled={list.length >= MAX} data-testid={`pg-widget-add-${k}`}>
              <Ico n="plus" size={13} /><Ico n={icon} size={13} />{t(`premiumGaming.widgets.kinds.${k}`)}
            </button>
          ))}
        </div>
        <List ds={ds("list")} empty={list.length ? null : t("premiumGaming.widgets.empty")}>
          {list.map((w) => (
            <Item key={w.id} icon={ICON[w.kind] || "dash"} title={t(`premiumGaming.widgets.kinds.${w.kind}`)} sub={(
              <span className="ps-wfields">
                {field(w, "x", t("premiumGaming.widgets.x"), 70)}
                {field(w, "y", t("premiumGaming.widgets.y"), 70)}
                {field(w, "width", t("premiumGaming.widgets.w"), 64)}
                {field(w, "height", t("premiumGaming.widgets.h"), 64)}
              </span>
            )}>
              <IconBtn icon="trash" danger label={t("premiumGaming.common.remove")} onClick={() => update({ widgets: list.filter((x) => x.id !== w.id) })} />
            </Item>
          ))}
        </List>
      </Group>
      <Hint ds={ds("help")}>{t("premiumGaming.widgets.help", { max: MAX })}</Hint>
    </>
  );
}

export default Panel;
