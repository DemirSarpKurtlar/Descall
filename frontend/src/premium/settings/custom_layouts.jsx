import { useCallback, useEffect, useState } from "react";
import { useT } from "../../context/LocaleContext";
import { useFeatureSettings } from "../featureSettings.js";
import { DEFAULTS } from "../gaming/ui.jsx";
import { failMessage, isDesktop, pinvoke, reportFailure } from "../gaming/bridge.js";
import { Badge, Btn, Group, Hint, IconBtn, Item, List, Note, TextField } from "../story/kit.jsx";
import { usePublish } from "../story/bus.js";

export const key = "custom_layouts";
const ds = (s) => `${key}.${s}`;
const THUMBS = ["c", "d", "a", "b"];

export function Panel() {
  const t = useT();
  const [w, updateWidgets] = useFeatureSettings("widgets", DEFAULTS.widgets);
  const [data, setData] = useState({ layouts: [], active: null });
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const reload = useCallback(async () => {
    const r = await pinvoke("premium:custom_layouts:list");
    if (r?.ok) setData({ layouts: r.layouts || [], active: r.active });
  }, []);
  useEffect(() => { reload(); }, [reload]);
  usePublish("custom_layouts.active", data.layouts.find((l) => l.id === data.active)?.name || null);
  const save = async () => {
    const r = await pinvoke("premium:custom_layouts:save", { name, widgets: w.widgets || [] });
    if (r?.ok) { setName(""); setErr(""); setData({ layouts: r.layouts, active: r.active }); }
    else {
      if (r?.error !== "limit") reportFailure("custom_layouts", r);
      setErr(r?.error === "limit" ? t("premiumGaming.layouts.limit") : failMessage(t, r));
    }
  };
  const apply = async (l) => {
    await updateWidgets({ widgets: l.widgets || [], on: true });
    await pinvoke("premium:custom_layouts:apply", l.id);
    reload();
  };
  return (
    <>
      <Group title={t("premiumGaming.layouts.title")}>
        <Note>{t("premiumGaming.layouts.desc")}</Note>
        {!isDesktop() ? <Hint>{t("premiumGaming.common.desktopOnly")}</Hint> : null}
        <List ds={ds("list")} label={t("premiumGaming.layouts.title")} empty={data.layouts.length ? null : t("premiumGaming.layouts.empty")}>
          {data.layouts.map((l, i) => (
            <Item
              key={l.id}
              active={data.active === l.id}
              thumb={<span className={`ps-lt v-${THUMBS[i % THUMBS.length]}`} aria-hidden="true"><i /><i /><i /></span>}
              title={l.name}
              sub={t("premiumGaming.layouts.count", { count: (l.widgets || []).length })}
            >
              {data.active === l.id ? <Badge tone="ok" ds={ds("active")}>{t("premiumGaming.workspace.active")}</Badge> : null}
              <Btn kind={data.active === l.id ? "ghost" : "primary"} ds={ds("apply")} onClick={() => apply(l)}>{t("premiumGaming.layouts.apply")}</Btn>
              <IconBtn icon="trash" danger label={t("premiumGaming.common.remove")} ds={ds("remove")} onClick={async () => { await pinvoke("premium:custom_layouts:remove", l.id); reload(); }} />
            </Item>
          ))}
        </List>
      </Group>
      <Group title={t("premiumStory.g.newLayout")}>
        <div className="ps-form">
          <TextField value={name} maxLength={40} onChange={setName} placeholder={t("premiumGaming.layouts.name")} ds={ds("name")} />
          <Btn kind="primary" icon="plus" ds={ds("save")} disabled={!name.trim() || !isDesktop()} onClick={save}>{t("premiumGaming.layouts.save")}</Btn>
        </div>
        {err ? <Hint tone="err" live>{err}</Hint> : null}
      </Group>
    </>
  );
}

export default Panel;
