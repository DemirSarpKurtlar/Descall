import { useEffect, useState } from "react";
import { useFeatureSettings } from "../featureSettings.js";
import { useT, useLocale } from "../../context/localeContextInstance";
import { NOTIFY_DEFAULTS } from "../notify/premiumNotify.js";
import { notificationHistory } from "../notify/notificationHistory.js";
import { Button, Row, Section, Toggle } from "../ui/PremiumAudioKit.jsx";

export const key = "notification_history";

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
  const [s, update] = useFeatureSettings(key, NOTIFY_DEFAULTS.notification_history);
  const [items, store] = useHistory();
  const unread = items.filter((x) => !x.read).length;

  const open = (item) => {
    store.markRead(item.id);
    if (item.data?.type) window.dispatchEvent(new CustomEvent("descall:notification-click", { detail: { ...item.data } }));
  };

  return (
    <div className="pa-panel">
      <Section title={t("premiumAudio.history.title")} hint={t("premiumAudio.history.hint", { cap: 200 })}>
        <Row title={t("premiumAudio.history.enable")}>
          <Toggle value={s.enabled !== false} onChange={(v) => update({ enabled: v })} label={t("premiumAudio.history.enable")} />
        </Row>
        <div className="pa-inline">
          <span className="pa-muted">{t("premiumAudio.history.unread", { count: unread })}</span>
          <Button onClick={() => store.markAllRead()} disabled={!unread}>{t("premiumAudio.history.markAllRead")}</Button>
          <Button kind="danger" onClick={() => store.clear()} disabled={!items.length}>{t("premiumAudio.history.clear")}</Button>
        </div>
      </Section>
      <Section title={t("premiumAudio.history.listTitle")}>
        <ul className="pa-list" aria-label={t("premiumAudio.history.listTitle")}>
          {items.length === 0 ? <li className="pa-empty">{t("premiumAudio.history.empty")}</li> : null}
          {items.map((item) => (
            <li key={item.id} className={`pa-list-item${item.read ? "" : " is-unread"}`}>
              <div className="pa-list-main">
                <span className="pa-list-title">{item.title || t(`premiumAudio.rules.cat.${item.category}`)}{item.count > 1 ? ` (${item.count})` : ""}</span>
                <span className="pa-list-sub">{[when(item.at, locale), item.body].filter(Boolean).join(" · ")}</span>
              </div>
              {item.data?.type ? <Button onClick={() => open(item)}>{t("premiumAudio.history.open")}</Button> : null}
              <Button kind="danger" label={t("premiumAudio.common.delete")} onClick={() => store.remove(item.id)}>{t("premiumAudio.common.delete")}</Button>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

export default Panel;
