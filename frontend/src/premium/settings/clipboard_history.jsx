import { useState } from "react";
import { useT } from "../../context/LocaleContext";
import { useFeatureSettings } from "../featureSettings.js";
import { DEFAULTS } from "../gaming/ui.jsx";
import { useLocalStore } from "../gaming/bridge.js";
import { clearClipboardHistory, removeClipboardItem, MAX_ITEMS } from "../gaming/clipboardHistory.js";
import { copyText } from "../../lib/copyText.js";
import { Badge, Btn, Group, Hint, IconBtn, Item, List, Note, SetRow, Switch } from "../story/kit.jsx";

export const key = "clipboard_history";
const ds = (s) => `${key}.${s}`;
const EMPTY = [];

export function Panel() {
  const t = useT();
  const [s, update] = useFeatureSettings(key, DEFAULTS.clipboard_history);
  const [items] = useLocalStore("clipboard", EMPTY);
  const [copied, setCopied] = useState(0);
  return (
    <>
      <Group title={t("premiumGaming.clipboard.title")}>
        <Note ds={ds("desc")}>{t("premiumGaming.clipboard.desc")}</Note>
        <SetRow icon="clipboard" label={t("premiumGaming.clipboard.enable")}>
          <Switch checked={s.on} onChange={(on) => update({ on })} label={t("premiumGaming.clipboard.enable")} ds={ds("on")} />
        </SetRow>
        <Hint ds={ds("help")}>{t("premiumGaming.clipboard.help")}</Hint>
      </Group>
      <Group title={t("premiumStory.g.clipItems")} aside={<span className="tnum" data-s={ds("count")}>{t("premiumGaming.clipboard.count", { count: items.length, max: MAX_ITEMS })}</span>}>
        <List ds={ds("list")} empty={items.length ? null : t("premiumGaming.clipboard.empty")}>
          {items.map((it) => (
            <Item key={it.at} icon={it.source === "paste" ? "clipboard" : "copy"} title={it.text}>
              <Badge>{it.source === "paste" ? t("premiumGaming.clipboard.pasted") : t("premiumGaming.clipboard.copied")}</Badge>
              <Btn icon={copied === it.at ? "check" : "copy"} aria-label={t("premiumGaming.clipboard.copy")} onClick={async () => { await copyText(it.text); setCopied(it.at); }}>
                {copied === it.at ? t("premiumGaming.clipboard.done") : null}
              </Btn>
              <IconBtn icon="trash" danger label={t("premiumGaming.common.remove")} onClick={() => removeClipboardItem(it.at)} />
            </Item>
          ))}
        </List>
        <div className="ps-act">
          <Btn icon="trash" className="is-danger" ds={ds("clear")} onClick={clearClipboardHistory} disabled={!items.length}>{t("premiumGaming.clipboard.clear")}</Btn>
        </div>
      </Group>
    </>
  );
}

export default Panel;
