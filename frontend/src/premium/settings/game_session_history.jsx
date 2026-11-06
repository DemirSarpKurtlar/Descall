import { useEffect, useMemo, useState } from "react";
import { useT, useLocale } from "../../context/LocaleContext";
import { formatDuration } from "../gaming/ui.jsx";
import { fetchGameSessions, localSessions, mergeSessions, totalsByGame } from "../gaming/gameData.js";
import { formatDate } from "../../i18n/format.js";
import { Badge, Group, Hint, Item, List, Note, Seg } from "../story/kit.jsx";
import { usePublish } from "../story/bus.js";

export const key = "game_session_history";
const ds = (s) => `${key}.${s}`;
const RANGES = [7, 30, 90];

export function Panel() {
  const t = useT();
  const { locale } = useLocale();
  const [days, setDays] = useState(7);
  const [data, setData] = useState({ sessions: [], ok: true, loading: true });
  useEffect(() => {
    let live = true;
    setData((d) => ({ ...d, loading: true }));
    fetchGameSessions({ days }).then((r) => {
      if (!live) return;
      const cutoff = Date.now() - days * 86_400_000;
      const local = localSessions().filter((s) => Date.parse(s.started_at) >= cutoff);
      setData({ sessions: mergeSessions(r.sessions, local), ok: r.ok, loading: false });
    });
    return () => { live = false; };
  }, [days]);
  const totals = useMemo(() => totalsByGame(data.sessions), [data.sessions]);
  const total = totals.reduce((n, g) => n + g.totalSec, 0);
  const max = totals[0]?.totalSec || 1;
  const bars = useMemo(() => totals.slice(0, 4).map((g) => g.totalSec), [totals]);
  usePublish("game_session_history.totals", bars.length ? bars : undefined);
  return (
    <>
      <Group title={t("premiumGaming.gameHistory.title")}>
        <Note ds={ds("desc")}>{t("premiumGaming.gameHistory.desc")}</Note>
        <Seg value={days} onChange={(v) => setDays(Number(v))} label={t("premiumGaming.gameHistory.title")} ds={ds("range")} options={RANGES.map((d) => ({ value: d, label: t("premiumGaming.gameHistory.lastDays", { count: d }) }))} />
        <div className="ps-stat" data-s={ds("total")}><span>{t("premiumGaming.gameHistory.total", { duration: formatDuration(t, total) })}</span></div>
        {!data.ok ? <Hint tone="err">{t("premiumGaming.gameHistory.offline")}</Hint> : null}
        {totals.length ? (
          <div className="ps-bars" data-s={ds("totals")}>
            {totals.slice(0, 8).map((g) => (
              <div key={g.game} className="ps-barrow">
                <span>{g.game}</span>
                <small className="tnum">{t("premiumGaming.gameHistory.sessions", { count: g.count })} · {formatDuration(t, g.totalSec)}</small>
                <i aria-hidden="true"><b style={{ width: `${Math.max(2, (g.totalSec / max) * 100)}%` }} /></i>
              </div>
            ))}
          </div>
        ) : null}
      </Group>
      <Group title={t("premiumStory.g.sessions")}>
        <List ds={ds("list")} empty={!data.sessions.length && !data.loading ? t("premiumGaming.gameHistory.empty") : null}>
          {data.sessions.slice(0, 100).map((s, i) => (
            <Item key={`${s.game}-${s.started_at}-${i}`} icon="gamepad" title={s.game} sub={formatDate(s.started_at, locale, { dateStyle: "medium", timeStyle: "short" })}>
              <span className="tnum ps-dur">{formatDuration(t, s.duration_sec)}</span>
              {s.source === "local" ? <Badge>{t("premiumGaming.gameHistory.local")}</Badge> : null}
            </Item>
          ))}
        </List>
      </Group>
    </>
  );
}

export default Panel;
