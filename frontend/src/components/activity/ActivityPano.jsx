/* Activity page, approved draft A "Pano" (2026-11-08): a live "now" card with a running
 * timer, this week's summary, the most played games, a 7-day chart coloured by game and
 * the history grouped by day, each session placed on a 24-hour line. Numbers come from
 * lib/activityStats.js; the timer ticks in its own component so the page does not
 * re-render every second. */
import { createContext, memo, useContext, useEffect, useMemo, useState } from "react";
import { X, Edit3, Monitor } from "../ui/Icon.jsx";
import { useLocale, useT } from "../../context/LocaleContext";
import {
  activityName, buildGameColors, cleanHistory, dayPosition, gameColor, gameMonogram, groupByDay, lastSevenDays,
  liveRow, parseActivityLabel, splitDuration, streakDays, topGames, weekSummary,
} from "../../lib/activityStats.js";

/** Name -> colour for the games on this page (see buildGameColors). */
const GameColorContext = createContext(gameColor);
export const GameColorProvider = GameColorContext.Provider;
export const useGameColor = () => useContext(GameColorContext);

/** "1 sa 5 dk" / "42 dk" / "2 sa". */
export function useFormatDuration() {
  const t = useT();
  return (seconds) => {
    const { h, m } = splitDuration(seconds);
    if (h && m) return t("act.dur.hm", { h, m });
    if (h) return t("act.dur.h", { h });
    return t("act.dur.m", { m });
  };
}

/** "Using Discord" -> "Discord kullanıyor"; free text (a custom status) stays as typed. */
export function useActivityLabel() {
  const t = useT();
  return (label) => {
    const { verb, name } = parseActivityLabel(label);
    return verb ? t(`act.label.${verb}`, { name }) : name;
  };
}

/** Re-render once a minute (totals that include the live session). */
function useMinuteTick(active) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    setNow(Date.now());
    let timer;
    const tick = () => {
      setNow(Date.now());
      timer = setTimeout(tick, 60000 - (Date.now() % 60000) + 50);
    };
    timer = setTimeout(tick, 60000 - (Date.now() % 60000) + 50);
    return () => clearTimeout(timer);
  }, [active]);
  return now;
}

/** hh:mm:ss since `since`, ticking every second; only this text re-renders. */
const LiveTimer = memo(function LiveTimer({ since, className }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const s = Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000));
  const pad = (n) => String(n).padStart(2, "0");
  return (
    <span className={className} role="timer" aria-live="off">
      {pad(Math.floor(s / 3600))}:{pad(Math.floor((s % 3600) / 60))}:{pad(s % 60)}
    </span>
  );
});

export function GameTile({ name, size = "md", manual = false }) {
  const colorOf = useGameColor();
  const style = manual ? { background: "var(--primary)" } : { background: colorOf(name) };
  return (
    <span className={`act-tile act-tile-${size}`} style={style} aria-hidden="true">
      {manual ? <Edit3 size={size === "lg" ? 28 : 16} /> : gameMonogram(name)}
    </span>
  );
}

function eyebrowKey(verb) {
  return ["playing", "listening", "watching", "coding"].includes(verb) ? verb : "other";
}

function NowCard({ activity, manualOverride, onClearManual, isElectron, rows, sameGameFriends }) {
  const colorOf = useGameColor();
  const t = useT();
  const { locale } = useLocale();
  const fmt = useFormatDuration();
  const now = useMinuteTick(Boolean(activity?.startedAt));

  if (!activity) {
    return (
      <div className="act-card act-now act-now-idle">
        <div className="act-now-idle-body">
          <span className="act-tile act-tile-lg act-tile-idle" aria-hidden="true"><Monitor size={28} /></span>
          <div>
            <div className="act-now-title">{t("act.now.idleTitle")}</div>
            <div className="act-sub">{isElectron ? t("act.now.idleDesktop") : t("act.now.idleWeb")}</div>
          </div>
        </div>
      </div>
    );
  }

  const isManual = activity.appType === "manual" || Boolean(manualOverride);
  const { verb } = parseActivityLabel(activity.displayName);
  const name = activityName(activity);
  const started = activity.startedAt ? new Date(activity.startedAt) : null;
  const startedText = started ? new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(started) : "";
  const live = liveRow(activity, now);
  const todayRows = groupByDay(live ? [live, ...rows] : rows, now).find((d) => d.offset === 0);
  const todaySec = todayRows?.totalSec || 0;
  const sessionIndex = todayRows ? todayRows.items.filter((r) => activityName(r) === name).length : 1;

  return (
    <div className="act-card act-now" style={isManual ? undefined : { "--act-glow": colorOf(name) }}>
      <div className="act-now-top">
        <span className="act-live">
          <span className="act-live-dot" aria-hidden="true" />
          <span className="act-eyebrow act-eyebrow-live">
            {isManual ? t("act.now.manual") : t(`act.now.eyebrow.${eyebrowKey(verb)}`)}
          </span>
        </span>
        {manualOverride && (
          <button type="button" className="act-icon-btn" onClick={onClearManual} title={t("act.now.clear")} aria-label={t("act.now.clear")}>
            <X size={16} />
          </button>
        )}
      </div>
      <div className="act-now-main">
        <GameTile name={name} size="lg" manual={isManual} />
        <div className="act-now-text">
          <div className="act-now-title">{isManual ? activity.displayName : name}</div>
          <div className="act-sub">
            {startedText && t("act.now.started", { time: startedText })}
            {!isManual && sessionIndex > 1 && <> · {t("act.now.sessionOfDay", { n: sessionIndex })}</>}
          </div>
        </div>
      </div>
      <div className="act-now-bottom">
        {started && (
          <div>
            <div className="act-eyebrow">{t("act.now.session")}</div>
            <LiveTimer since={activity.startedAt} className="act-timer act-num" />
          </div>
        )}
        <div className="act-chips">
          {todaySec >= 60 && <span className="act-chip act-num">{t("act.now.today", { duration: fmt(todaySec) })}</span>}
          {sameGameFriends > 0 && <span className="act-chip">{t("act.now.friends", { count: sameGameFriends })}</span>}
        </div>
      </div>
      {!isElectron && (
        <div className="act-web-note">
          <Monitor size={14} aria-hidden="true" />
          <span>{t("act.now.idleWeb")}</span>
        </div>
      )}
    </div>
  );
}

function StatTiles({ rows, now }) {
  const t = useT();
  const fmt = useFormatDuration();
  const week = weekSummary(rows, now);
  const streak = streakDays(rows, now);
  const change = week.change == null
    ? <span className="act-tile-note">{t("act.stats.noPrev")}</span>
    : week.change >= 0
      ? <span className="act-tile-note act-up">{t("act.stats.up", { pct: week.change })}</span>
      : <span className="act-tile-note act-down">{t("act.stats.down", { pct: Math.abs(week.change) })}</span>;
  return (
    <div className="act-stats">
      <div className="act-card act-stat">
        <span className="act-stat-label">{t("act.stats.week")}</span>
        <b className="act-num">{fmt(week.weekSec)}</b>
        {change}
      </div>
      <div className="act-card act-stat">
        <span className="act-stat-label">{t("act.stats.sessions")}</span>
        <b className="act-num">{week.sessions}</b>
        <span className="act-tile-note">{week.sessions ? t("act.stats.avg", { duration: fmt(week.avgSec) }) : " "}</span>
      </div>
      <div className="act-card act-stat">
        <span className="act-stat-label">{t("act.stats.streak")}</span>
        <b className="act-num">{t("act.stats.streakDays", { count: streak })}</b>
        <span className="act-tile-note">{streak ? t("act.stats.streakSub") : t("act.stats.streakNone")}</span>
      </div>
    </div>
  );
}

function TopGames({ rows, now }) {
  const colorOf = useGameColor();
  const t = useT();
  const fmt = useFormatDuration();
  const [days, setDays] = useState(7);
  const games = topGames(rows, days, now).slice(0, 4);
  const max = games[0]?.seconds || 1;
  return (
    <div className="act-card act-top">
      <div className="act-row-between">
        <span className="act-eyebrow">{t("act.top.title")}</span>
        <div className="act-seg" role="group" aria-label={t("act.top.title")}>
          {[7, 30].map((d) => (
            <button key={d} type="button" className={days === d ? "on" : ""} aria-pressed={days === d} onClick={() => setDays(d)}>
              {t(d === 7 ? "act.top.d7" : "act.top.d30")}
            </button>
          ))}
        </div>
      </div>
      {games.length === 0 ? (
        <p className="act-sub act-top-empty">{t("act.top.empty")}</p>
      ) : (
        <ol className="act-top-list">
          {games.map((g) => (
            <li key={g.name} className="act-top-item">
              <GameTile name={g.name} size="sm" />
              <div className="act-top-name">
                <b title={g.name}>{g.name}</b>
                <div className="act-share"><i style={{ width: `${Math.max(4, (g.seconds / max) * 100)}%`, background: colorOf(g.name) }} /></div>
              </div>
              <span className="act-num act-top-dur">{fmt(g.seconds)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function WeekChart({ rows, now }) {
  const colorOf = useGameColor();
  const t = useT();
  const { locale } = useLocale();
  const fmt = useFormatDuration();
  const days = lastSevenDays(rows, now);
  const max = Math.max(3600, ...days.map((d) => d.totalSec));
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "short" });
  const fullDay = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" });
  return (
    <div className="act-card act-chart">
      <div className="act-row-between">
        <span className="act-eyebrow">{t("act.chart.title")}</span>
        <span className="act-sub act-small">{t("act.chart.legend")}</span>
      </div>
      <div className="act-bars">
        <div className="act-bars-grid" aria-hidden="true"><i /><i /><i /></div>
        {days.map((d) => {
          const dayLabel = d.offset === 0 ? t("act.chart.today") : weekday.format(new Date(d.dayStart));
          return (
            <div
              key={d.dayStart}
              className={`act-bar${d.offset === 0 ? " is-today" : ""}`}
              role="img"
              aria-label={t("act.chart.aria", { day: fullDay.format(new Date(d.dayStart)), duration: fmt(d.totalSec) })}
            >
              <span className="act-bar-val act-num">{d.totalSec >= 60 ? fmt(d.totalSec) : ""}</span>
              <div className="act-bar-stack" style={{ height: `${(d.totalSec / max) * 100}%` }}>
                {d.parts.map((p) => (
                  <i key={p.name} title={`${p.name} · ${fmt(p.seconds)}`} style={{ flexGrow: p.seconds, background: colorOf(p.name) }} />
                ))}
              </div>
              <small>{dayLabel}</small>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SessionRow({ row }) {
  const colorOf = useGameColor();
  const t = useT();
  const { locale } = useLocale();
  const fmt = useFormatDuration();
  const name = activityName(row);
  const manual = row.is_manual || row.app_type === "manual";
  const time = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" });
  const start = time.format(new Date(row.started_at));
  const end = row.live ? t("act.row.now") : row.ended_at ? time.format(new Date(row.ended_at)) : "";
  const pos = dayPosition(row);
  return (
    <div className={`act-sess${row.live ? " is-live" : ""}`}>
      <GameTile name={name} manual={manual} />
      <div className="act-sess-text">
        <div className="act-sess-name">
          <span title={name}>{name}</span>
          {row.live && <span className="act-chip act-chip-live">{t("act.row.live")}</span>}
        </div>
        <div className="act-sess-when act-num">{end ? t("act.row.range", { start, end }) : start}</div>
      </div>
      <div className="act-dayline" aria-hidden="true">
        <i style={{ left: `${pos.left}%`, width: `${pos.width}%`, background: manual ? "var(--primary)" : colorOf(name) }} />
      </div>
      <div className="act-sess-dur act-num">{fmt(row.duration_sec)}</div>
    </div>
  );
}

export function DayHistory({ rows, now }) {
  const t = useT();
  const { locale } = useLocale();
  const fmt = useFormatDuration();
  const [shown, setShown] = useState(2);
  const days = useMemo(() => groupByDay(rows, now), [rows, now]);
  const weekdayLong = new Intl.DateTimeFormat(locale, { weekday: "long" });
  const dateLine = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long" });
  const title = (d) => {
    if (d.offset === 0) return t("act.day.today");
    if (d.offset === 1) return t("act.day.yesterday");
    const w = weekdayLong.format(new Date(d.dayStart));
    return w.charAt(0).toLocaleUpperCase(locale) + w.slice(1);
  };
  return (
    <div className="act-history">
      {days.slice(0, shown).map((d) => (
        <section key={d.dayStart} className="act-day">
          <div className="act-day-head">
            <b>{title(d)}</b>
            <span className="act-sub act-small">{dateLine.format(new Date(d.dayStart))}</span>
            <span className="act-day-line" aria-hidden="true" />
            <span className="act-num act-day-total">{fmt(d.totalSec)}</span>
          </div>
          {d.items.map((r) => <SessionRow key={r.id || r.started_at} row={r} />)}
        </section>
      ))}
      {days.length > 2 && (
        <div className="act-more">
          <button
            type="button"
            className="act-btn"
            onClick={() => setShown((n) => (n >= days.length ? 2 : n + 5))}
          >
            {shown >= days.length ? t("act.history.less") : t("act.history.more")}
          </button>
        </div>
      )}
    </div>
  );
}

/** Live session merged in front of the cleaned history (both the chart and the list use it). */
export function usePanoRows(history, currentActivity) {
  const now = useMinuteTick(Boolean(currentActivity?.startedAt));
  const rows = useMemo(() => {
    const clean = cleanHistory(history);
    const live = liveRow(currentActivity, now);
    return live && live.duration_sec >= 60 ? [live, ...clean] : clean;
  }, [history, currentActivity, now]);
  const historyOnly = useMemo(() => cleanHistory(history), [history]);
  const colorOf = useMemo(() => buildGameColors(rows), [rows]);
  return { rows, now, historyOnly, colorOf };
}

export default function ActivityPano({
  currentActivity, manualOverride, onClearManual, isElectron, rows, historyOnly, now, sameGameFriends,
}) {
  return (
    <div className="act-pano">
      <div className="act-grid">
        <NowCard
          activity={currentActivity}
          manualOverride={manualOverride}
          onClearManual={onClearManual}
          isElectron={isElectron}
          rows={historyOnly}
          sameGameFriends={sameGameFriends}
        />
        <div className="act-side">
          <StatTiles rows={rows} now={now} />
          <TopGames rows={rows} now={now} />
        </div>
      </div>
      <WeekChart rows={rows} now={now} />
    </div>
  );
}
