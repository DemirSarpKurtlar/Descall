import { useEffect, useState } from "react";
import { useT, useLocale } from "../../context/localeContextInstance";
import { notificationHistory } from "../notify/notificationHistory.js";
import { Actions, Btn, Group, IconBtn, Item, List, Note } from "../story/kit.jsx";
import { usePublish } from "../story/bus.js";

export const key = "notification_history";
// Settings > Descall+ shows the on/off switch; the Electron module uses the same default.
export const defaultEnabled = true;
const ds = (s) => `${key}.${s}`;

function useHistory() {
  const store = notificationHistory();
  const [items, setItems] = useState(() => store.list());
  useEffect(() => store.subscribe(setItems), [store]);
  return [items, store];
}

function when(at, locale) {
  try {
    return new Intl.DateTimeFormat(locale || undefined, { dateStyle: "short", timeStyle: "short" }).format(new Date(at));
  } catch {
    return "";
  }
}

export function Panel() {
  const t = useT();
  const { locale } = useLocale() || {};
  const [items, store] = useHistory();
  const unread = items.filter((x) => !x.read).length;
  usePublish("notification_history.unread", unread);

  const open = (item) => {
    store.markRead(item.id);
    if (item.data?.type) window.dispatchEvent(new CustomEvent("descall:notification-click", { detail: { ...item.data } }));
  };

  return (
    <>
      <Group title={t("premiumAudio.history.title")}>
        <Note ds={ds("hint")}>{t("premiumAudio.history.hint", { cap: 200 })}</Note>
        <div className="ps-r">
          <span className="ps-ri" aria-hidden="true"><span className="ps-dotn" /></span>
          <div className="ps-rc"><b data-s={ds("unread")}>{t("premiumAudio.history.unread", { count: unread })}</b></div>
        </div>
        <Actions>
          <Btn icon="check" ds={ds("markAllRead")} onClick={() => store.markAllRead()} disabled={!unread}>{t("premiumAudio.history.markAllRead")}</Btn>
          <Btn icon="trash" className="is-danger" ds={ds("clear")} onClick={() => store.clear()} disabled={!items.length}>{t("premiumAudio.history.clear")}</Btn>
        </Actions>
      </Group>
      <Group title={t("premiumAudio.history.listTitle")}>
        <List ds={ds("list")} label={t("premiumAudio.history.listTitle")} empty={items.length === 0 ? t("premiumAudio.history.empty") : null}>
          {items.map((item) => (
            <Item
              key={item.id}
              icon="bell"
              unread={!item.read}
              title={`${item.title || t(`premiumAudio.rules.cat.${item.category}`)}${item.count > 1 ? ` (${item.count})` : ""}`}
              sub={[when(item.at, locale), item.body].filter(Boolean).join(" · ")}
            >
              {item.data?.type ? <Btn ds={ds("open")} onClick={() => open(item)}>{t("premiumAudio.history.open")}</Btn> : null}
              <IconBtn icon="trash" danger label={t("premiumAudio.common.delete")} ds={ds("delete")} onClick={() => store.remove(item.id)} />
            </Item>
          ))}
        </List>
      </Group>
    </>
  );
}

export default Panel;
