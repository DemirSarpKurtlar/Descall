import { useEffect, useMemo, useState } from "react";
import { useT, useLocale } from "../../context/LocaleContext";
import { PanelShell, formatDuration } from "../gaming/ui.jsx";
import { fetchGameSessions, localSessions, mergeSessions, totalsByGame } from "../gaming/gameData.js";
import { formatDate } from "../../i18n/format.js";

export const key = "game_session_history";
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
  return (
    <PanelShell title={t("premiumGaming.gameHistory.title")} desc={t("premiumGaming.gameHistory.desc")} testId="pg-panel-game_session_history">
      <div className="pg-row">
        {RANGES.map((d) => (
          <button key={d} type="button" className={`pg-btn is-small${d === days ? " is-primary" : ""}`} onClick={() => setDays(d)}>{t("premiumGaming.gameHistory.lastDays", { count: d })}</button>
        ))}
        <span className="pg-grow" />
        <span className="pg-muted pg-num">{t("premiumGaming.gameHistory.total", { duration: formatDuration(t, total) })}</span>
      </div>
      {!data.ok ? <p className="pg-error">{t("premiumGaming.gameHistory.offline")}</p> : null}
      {totals.length ? (
        <div className="pg-card">
          {totals.slice(0, 8).map((g) => (
            <div key={g.game} className="pg-row">
              <span className="pg-grow">{g.game}</span>
              <span className="pg-muted pg-num">{t("premiumGaming.gameHistory.sessions", { count: g.count })} · {formatDuration(t, g.totalSec)}</span>
              <div className="pg-tl-bar" style={{ width: "100%" }}><span className="is-game" style={{ left: 0, width: `${Math.max(2, (g.totalSec / max) * 100)}%` }} /></div>
            </div>
          ))}
        </div>
      ) : null}
      {data.sessions.length ? (
        <ul className="pg-list" data-testid="pg-game-sessions">
          {data.sessions.slice(0, 100).map((s, i) => (
            <li key={`${s.game}-${s.started_at}-${i}`}>
              <span className="pg-grow">{s.game}</span>
              <span className="pg-muted pg-num">{formatDate(s.started_at, locale, { dateStyle: "medium", timeStyle: "short" })}</span>
              <span className="pg-num">{formatDuration(t, s.duration_sec)}</span>
              {s.source === "local" ? <span className="pg-chip">{t("premiumGaming.gameHistory.local")}</span> : null}
            </li>
          ))}
        </ul>
      ) : !data.loading ? <p className="pg-muted">{t("premiumGaming.gameHistory.empty")}</p> : null}
    </PanelShell>
  );
}

export default Panel;
