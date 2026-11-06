/** Descall Ultra named window layouts: save, apply, delete. */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale } from "../../context/LocaleContext";
import { formatDate } from "../../i18n/format.js";
import { premiumBridge } from "../panelUi.jsx";
import { Btn, Group, Item, List, TextField } from "../story/kit.jsx";
import { usePublish } from "../story/bus.js";

export const key = "window_layouts";
const ds = (s) => `${key}.${s}`;
const THUMBS = ["a", "b", "c", "d"];

export function Panel() {
  const { t, locale } = useLocale();
  const [name, setName] = useState("");
  const [list, setList] = useState([]);
  const load = useCallback(() => {
    premiumBridge()?.invoke("premium:layouts:list").then((r) => setList(r?.ok ? r.layouts || [] : [])).catch(() => setList([]));
  }, []);
  useEffect(() => { load(); }, [load]);
  const names = useMemo(() => list.map((l) => l.name), [list]);
  usePublish("window_layouts.names", names);
  const save = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    await premiumBridge()?.invoke("premium:layouts:save", name.trim()).catch(() => null);
    setName("");
    load();
  };
  return (
    <>
      <Group title={t("premiumStory.g.savedLayouts")}>
        <List ds={ds("list")} label={t("premiumStory.g.savedLayouts")} empty={list.length ? null : t("premium.panel.layoutEmpty")}>
          {list.map((l, i) => (
            <Item
              key={l.id}
              thumb={<span className={`ps-lt v-${THUMBS[i % THUMBS.length]}`} aria-hidden="true"><i /><i /><i /></span>}
              title={l.name}
              sub={`${t("premium.panel.layoutWindows", { n: l.windows })} · ${formatDate(l.createdAt, locale)}`}
            >
              <Btn kind="primary" ds={ds("apply")} onClick={() => premiumBridge()?.invoke("premium:layouts:apply", l.id).catch(() => {})}>{t("premium.panel.layoutApply")}</Btn>
              <Btn ds={ds("delete")} onClick={() => premiumBridge()?.invoke("premium:layouts:delete", l.id).then(load).catch(() => {})}>{t("premium.panel.layoutDelete")}</Btn>
            </Item>
          ))}
        </List>
      </Group>
      <Group title={t("premiumStory.g.newLayout")}>
        <form className="ps-form" onSubmit={save}>
          <TextField value={name} onChange={(v) => setName(v.slice(0, 40))} placeholder={t("premium.panel.layoutName")} ds={ds("name")} />
          <Btn type="submit" icon="plus" ds={ds("save")} disabled={!name.trim()}>{t("premium.panel.layoutSave")}</Btn>
        </form>
      </Group>
    </>
  );
}
