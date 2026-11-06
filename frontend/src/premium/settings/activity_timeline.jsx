import { useEffect, useMemo, useState } from "react";
import { useT, useLocale } from "../../context/LocaleContext";
import { PanelShell, formatDuration } from "../gaming/ui.jsx";
import { buildTimeline, dayBounds, dayKey } from "../gaming/timeline.js";
import { fetchGameSessions, localSessions } from "../gaming/gameData.js";
import { premiumEvents } from "../gaming/bridge.js";
import { fetchCallHistory } from "../../api/calls.js";
import { formatDate, formatTime } from "../../i18n/format.js";
import { ChevronLeft, ChevronRight } from "../../components/ui/Icon.jsx";

export const key = "activity_timeline";

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
    <PanelShell title={t("premiumGaming.timeline.title")} desc={t("premiumGaming.timeline.desc")} testId="pg-panel-activity_timeline">
      <div className="pg-row">
        <button type="button" className="pg-btn is-small" onClick={() => shift(-1)} aria-label={t("premiumGaming.timeline.prev")}><ChevronLeft size={14} /></button>
        <b className="pg-grow" style={{ textAlign: "center" }}>{day === dayKey() ? t("premiumGaming.timeline.today") : formatDate(tl.start, locale, { dateStyle: "full" })}</b>
        <button type="button" className="pg-btn is-small" onClick={() => shift(1)} disabled={day === dayKey()} aria-label={t("premiumGaming.timeline.next")}><ChevronRight size={14} /></button>
      </div>
      <div className="pg-card">
        <span className="pg-muted">{t("premiumGaming.timeline.summary", { games: formatDuration(t, tl.summary.gameSec), calls: formatDuration(t, tl.summary.callSec) })}</span>
        <div className="pg-tl-bar" aria-hidden="true">
          {tl.items.filter((i) => i.kind !== "event").map((i, n) => (
            <span key={n} className={`is-${i.kind}`} style={{ left: `${((i.start - tl.start) / span) * 100}%`, width: `${Math.max(0.4, ((i.end - i.start) / span) * 100)}%` }} />
          ))}
        </div>
      </div>
      {tl.items.length ? (
        <div className="pg-tl" data-testid="pg-timeline">
          {tl.items.map((i, n) => (
            <div key={n} className={`pg-tl-item is-${i.kind}`}>
              <span className="pg-muted pg-num">{formatTime(i.start, locale)}</span>
              <span className="pg-grow">{i.label}</span>
              {i.kind !== "event" ? <span className="pg-num pg-muted">{formatDuration(t, i.durationSec)}</span> : null}
            </div>
          ))}
        </div>
      ) : !src.loading ? <p className="pg-muted">{t("premiumGaming.timeline.empty")}</p> : null}
    </PanelShell>
  );
}

export default Panel;
