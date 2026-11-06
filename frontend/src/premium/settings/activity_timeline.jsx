import { useEffect, useMemo, useState } from "react";
import { useT, useLocale } from "../../context/LocaleContext";
import { formatDuration } from "../gaming/ui.jsx";
import { buildTimeline, dayBounds, dayKey } from "../gaming/timeline.js";
import { fetchGameSessions, localSessions } from "../gaming/gameData.js";
import { premiumEvents } from "../gaming/bridge.js";
import { fetchCallHistory } from "../../api/calls.js";
import { formatDate, formatTime } from "../../i18n/format.js";
import { Group, IconBtn, Note } from "../story/kit.jsx";

export const key = "activity_timeline";
const ds = (s) => `${key}.${s}`;

export function Panel() {
  const t = useT();
  const { locale } = useLocale();
  const [day, setDay] = useState(() => dayKey());
  const [src, setSrc] = useState({ calls: [], games: [], loading: true });

  useEffect(() => {
    let live = true;
    const b = dayBounds(day);
    setSrc((s) => ({ ...s, loading: true }));
    Promise.all([
      fetchCallHistory({ limit: 200 }).catch(() => ({ calls: [] })),
      fetchGameSessions({ from: new Date(b.start - 86_400_000), to: new Date(b.end) }),
    ]).then(([c, g]) => {
      if (!live) return;
      setSrc({ calls: Array.isArray(c?.calls) ? c.calls : [], games: [...g.sessions, ...localSessions()], loading: false });
    });
    return () => { live = false; };
  }, [day]);

  const tl = useMemo(() => buildTimeline({
    day,
    calls: src.calls,
    games: src.games,
    events: premiumEvents().map((e) => ({ ...e, label: e.kind === "profile" ? t("premiumGaming.timeline.ev.profile", { name: e.label }) : t(`premiumGaming.timeline.ev.${["clip", "automation", "lock", "action"].includes(e.kind) ? e.kind : "other"}`, { name: e.label }) })),
    labels: { dmCall: (n) => t("premiumGaming.timeline.call", { name: n }), groupCall: (n) => t("premiumGaming.timeline.groupCall", { name: n }), unknown: t("premiumGaming.timeline.unknown") },
  }), [day, src, t]);

  const shift = (n) => {
    const b = dayBounds(day);
    setDay(dayKey(new Date(b.start + n * 86_400_000 + 3_600_000)));
  };
  const span = tl.end - tl.start;
  return (
    <>
      <Group title={t("premiumGaming.timeline.title")}>
        <Note ds={ds("desc")}>{t("premiumGaming.timeline.desc")}</Note>
        <div className="ps-dayline" data-s={ds("day")}>
          <IconBtn icon="chevL" label={t("premiumGaming.timeline.prev")} onClick={() => shift(-1)} />
          <b>{day === dayKey() ? t("premiumGaming.timeline.today") : formatDate(tl.start, locale, { dateStyle: "full" })}</b>
          <IconBtn icon="chev" label={t("premiumGaming.timeline.next")} onClick={() => shift(1)} disabled={day === dayKey()} />
        </div>
        <Note ds={ds("summary")}>{t("premiumGaming.timeline.summary", { games: formatDuration(t, tl.summary.gameSec), calls: formatDuration(t, tl.summary.callSec) })}</Note>
        <div className="ps-tlbar" aria-hidden="true" data-s={ds("bar")}>
          {tl.items.filter((i) => i.kind !== "event").map((i, n) => (
            <span key={n} className={`is-${i.kind}`} style={{ left: `${((i.start - tl.start) / span) * 100}%`, width: `${Math.max(0.4, ((i.end - i.start) / span) * 100)}%` }} />
          ))}
        </div>
      </Group>
      <Group title={t("premiumStory.g.dayList")}>
        {tl.items.length ? (
          <ol className="ps-tl" data-testid="pg-timeline" data-s={ds("list")}>
            {tl.items.map((i, n) => (
              <li key={n} className={`is-${i.kind}`}>
                <small className="tnum">{formatTime(i.start, locale)}</small>
                <span>{i.label}</span>
                {i.kind !== "event" ? <small className="tnum">{formatDuration(t, i.durationSec)}</small> : null}
              </li>
            ))}
          </ol>
        ) : <p className="ps-empty" data-s={ds("list")}>{src.loading ? "" : t("premiumGaming.timeline.empty")}</p>}
      </Group>
    </>
  );
}

export default Panel;
