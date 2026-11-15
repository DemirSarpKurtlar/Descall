/**
 * "İstatistik" tab: KPIs with sparklines, credits in circulation and hands per
 * day (7 / 30 / 90 days) with admin adjustment markers, anomaly alerts, per-game
 * stats (player win rate, observed dealer edge, biggest win), the leaderboard with
 * the hide switch and the latest hands. "Kurallar" tab: the fixed game rules.
 */
import { useLocale } from "../../../context/LocaleContext";
import { formatNumber } from "../../../i18n/format.js";
import { formatTimeAgo } from "../../../lib/datetime";
import { AlertTriangle, Coins, EyeOff, Eye, History, RefreshCw, Shield, Spade, TrendingUp, Trophy } from "../../ui/Icon.jsx";
import GamesChart, { Spark } from "./GamesChart.jsx";
import { Delta, GAvatar, ICONS, ResultChip, Seg, Skel } from "./GamesUi.jsx";
import { STAT_DAYS, anomalyView, gameKey } from "./gamesModel.js";

const GAME_ICON = { blackjack: Spade, slot: Coins, coinflip: RefreshCw };

function Kpi({ label, value, delta, deltaTone, values, color }) {
  return (
    <div className="agm-kpi">
      <span>{label}</span>
      <div className="agm-kpi-v">
        <b className="tnum">{value}</b>
        {delta ? <small className={deltaTone}>{delta}</small> : null}
      </div>
      <Spark values={values} color={color} />
    </div>
  );
}

export function StatsView({ data, loading, err, days, setDays, onOpenPlayer, onToggleHidden }) {
  const { t, locale } = useLocale();
  const n = (v) => formatNumber(v, locale);
  const pctText = (v) => (v == null ? "—" : t("gamesAdmin.pct", { n: formatNumber(v, locale, { maximumFractionDigits: 1 }) }));
  const signed = (v) => (v == null ? null : `${v > 0 ? "+" : v < 0 ? "−" : ""}${pctText(Math.abs(v))}`);
  if (err) {
    return (
      <p className="agm-err" role="alert">
        {err}
      </p>
    );
  }
  if (!data) {
    return (
      <div className="agm-stats" aria-busy={loading}>
        <div className="agm-kpis">
          {Array.from({ length: 5 }, (_, i) => (
            <Skel key={i} h={84} r={18} />
          ))}
        </div>
        <Skel h={260} r={18} />
      </div>
    );
  }
  const k = data.kpis;
  const series = data.series || [];
  const credits = series.map((d) => d.credits);
  const hands = series.map((d) => d.hands);
  const avg = series.map((d) => (k.players ? d.credits / k.players : 0));
  const markers = series.map((d, i) => (d.admin ? { index: i, color: "#f2a93b", text: `${d.admin > 0 ? "+" : "−"}${n(Math.abs(d.admin))}` } : null)).filter(Boolean);
  return (
    <div className="agm-stats" data-testid="agm-stats">
      <div className="agm-kpis">
        <Kpi label={t("gamesAdmin.stats.total")} value={n(k.totalCredits)} delta={signed(k.totalCreditsChange)} deltaTone={k.totalCreditsChange >= 0 ? "agm-pos" : "agm-neg"} values={credits} color="#7b93ff" />
        <Kpi label={t("gamesAdmin.stats.players")} value={n(k.players)} delta={k.newPlayers7d ? t("gamesAdmin.stats.newWeek", { n: k.newPlayers7d }) : null} deltaTone="agm-pos" values={series.map((d) => d.players || 0)} color="#b58cff" />
        <Kpi label={t("gamesAdmin.stats.hands", { n: data.days })} value={n(k.hands)} delta={signed(k.handsChange)} deltaTone={k.handsChange >= 0 ? "agm-pos" : "agm-neg"} values={hands} color="#4fe0a0" />
        <Kpi label={t("gamesAdmin.stats.avg")} value={n(k.avgCredits)} values={avg} color="#ffc773" />
        <Kpi label={t("gamesAdmin.stats.bonus")} value={n(k.bonusToday)} delta={t("gamesAdmin.stats.bonusCredits", { n: n(k.bonusTodayCredits) })} deltaTone="agm-muted" values={series.map((d) => d.bonus || 0)} color="#4fd2e0" />
      </div>
      <div className="agm-r2">
        <section className="agm-card" aria-labelledby="agm-circ-h">
          <h3 id="agm-circ-h">
            <TrendingUp size={16} />
            {t("gamesAdmin.stats.chart")}
            <Seg className="agm-ml" label={t("gamesAdmin.stats.period")} value={days} onChange={setDays} items={STAT_DAYS.map((d) => ({ id: d, label: t("gamesAdmin.stats.days", { n: d }) }))} />
          </h3>
          <GamesChart points={series} valueKey="credits" height={200} lineColor="#7b93ff" barColor="rgba(155,93,229,0.45)" markers={markers} labels={5} label={t("gamesAdmin.stats.chart")} valueLabel={t("gamesAdmin.stats.circulation")} />
          <div className="agm-legend">
            <span>
              <i style={{ background: "#7b93ff" }} />
              {t("gamesAdmin.stats.circulation")}
            </span>
            <span>
              <i style={{ background: "rgba(155,93,229,0.6)" }} />
              {t("gamesAdmin.stats.handsDaily")}
            </span>
            <span>
              <i style={{ background: "#f2a93b" }} />
              {t("gamesAdmin.stats.adminAdj")}
            </span>
          </div>
          {!data.ready?.ledger ? <p className="agm-hint">{t("gamesAdmin.stats.approx")}</p> : null}
        </section>
        <section className="agm-card" aria-labelledby="agm-anom-h" data-testid="agm-anomalies">
          <h3 id="agm-anom-h">
            <AlertTriangle size={16} />
            {t("gamesAdmin.stats.anomalies")}
            {data.anomalies.length ? <span className="agm-chip is-red">{t("gamesAdmin.stats.open", { n: data.anomalies.length })}</span> : null}
          </h3>
          {!data.anomalies.length ? (
            <div className="agm-empty">{t("gamesAdmin.empty.anomalies")}</div>
          ) : (
            <div className="agm-an-list">
              {data.anomalies.slice(0, 8).map((a, i) => {
                const v = anomalyView(a);
                const Icon = ICONS[v.icon] || AlertTriangle;
                const vars = {
                  user: a.user?.username || "?",
                  count: n(a.vars?.count || 0),
                  rate: pctText(a.vars?.rate),
                  hands: n(a.vars?.hands || 0),
                  senders: n(a.vars?.senders || 0),
                  amount: n(a.vars?.amount || 0),
                  accounts: n(a.vars?.accounts || 0),
                  from: n(a.vars?.from || 0),
                  to: n(a.vars?.to || 0),
                  minutes: n(a.vars?.minutes || 0),
                };
                return (
                  <button key={`${a.type}-${a.userId}-${i}`} type="button" className={`agm-an is-${v.color}`} onClick={() => onOpenPlayer(a.userId)}>
                    <span className={`agm-ic is-${v.color}`} aria-hidden="true">
                      <Icon size={16} />
                    </span>
                    <div>
                      <b>{t(v.titleKey)}</b>
                      <small>{t(v.subKey, vars)}</small>
                    </div>
                    <div className="agm-an-tm">
                      <span className={`agm-chip is-${v.sev}`}>{t(v.sevKey)}</span>
                      <span>{formatTimeAgo(a.at, t, new Date(), locale)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>
      <div className="agm-r3">
        {data.games.map((g) => {
          const Icon = GAME_ICON[g.game] || Spade;
          return (
            <section key={g.game} className="agm-card agm-gm" aria-label={t(gameKey(g.game, true))}>
              <h3>
                <Icon size={16} />
                {t(gameKey(g.game, true))}
                <span className="agm-chip is-gray agm-ml">{t("gamesAdmin.stats.handsWindow", { n: n(g.hands), d: data.days })}</span>
              </h3>
              <div className="agm-gbar" aria-hidden="true">
                <i style={{ width: `${g.winPct}%`, background: "#34c77b" }} />
                <i style={{ width: `${g.pushPct}%`, background: "rgba(255,255,255,0.3)" }} />
                <i style={{ width: `${g.lossPct}%`, background: "rgba(242,63,67,0.65)" }} />
              </div>
              <div className="agm-glg">
                <span>
                  {t("gamesAdmin.stats.playerWon")} <b>{pctText(g.winPct)}</b>
                </span>
                {g.pushPct ? (
                  <span>
                    {t("gamesAdmin.result.push")} <b>{pctText(g.pushPct)}</b>
                  </span>
                ) : null}
                <span>
                  {t("gamesAdmin.result.loss")} <b>{pctText(g.lossPct)}</b>
                </span>
              </div>
              <div className="agm-gmini">
                <div>
                  <b>{g.houseEdge == null ? "—" : pctText(g.houseEdge)}</b>
                  <span>{t("gamesAdmin.stats.edge")}</span>
                </div>
                <div>
                  <b className="tnum">{n(g.avgBet)}</b>
                  <span>{t("gamesAdmin.stats.avgBet")}</span>
                </div>
                <div>
                  <b>{g.biggestWin ? <Delta value={g.biggestWin.amount} /> : "—"}</b>
                  <span>{g.biggestWin ? t("gamesAdmin.stats.biggestBy", { user: g.biggestWin.username || "?" }) : t("gamesAdmin.stats.biggest")}</span>
                </div>
              </div>
            </section>
          );
        })}
      </div>
      <div className="agm-r4">
        <section className="agm-card" aria-labelledby="agm-lb-h">
          <h3 id="agm-lb-h">
            <Trophy size={16} />
            {t("gamesAdmin.stats.leaderboard")}
          </h3>
          {!data.leaderboard.length ? (
            <div className="agm-empty">{t("gamesAdmin.empty.players")}</div>
          ) : (
            data.leaderboard.map((l) => (
              <div key={l.id} className="agm-lb">
                <span className="agm-rk">{l.rank}</span>
                <button type="button" className="agm-lb-u" onClick={() => onOpenPlayer(l.id)}>
                  <GAvatar user={l} size={24} radius={8} />@{l.username || "?"}
                  {l.risk ? <span className={`agm-flag is-${l.risk === "high" ? "red" : "amber"}`} role="img" aria-label={t(`gamesAdmin.list.flag_${l.risk === "high" ? "red" : "amber"}`)} /> : null}
                </button>
                <span className="agm-ra tnum agm-strong">{n(l.credits)}</span>
                <span>{l.hidden ? <span className="agm-chip is-gray">{t("gamesAdmin.ws.hidden")}</span> : null}</span>
                <button type="button" className="agm-icbtn" onClick={() => onToggleHidden(l)} aria-label={l.hidden ? t("gamesAdmin.menu.show") : t("gamesAdmin.menu.hide")} title={l.hidden ? t("gamesAdmin.menu.show") : t("gamesAdmin.menu.hide")}>
                  {l.hidden ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            ))
          )}
        </section>
        <section className="agm-card" aria-labelledby="agm-recent-h">
          <h3 id="agm-recent-h">
            <History size={16} />
            {t("gamesAdmin.stats.recent")}
          </h3>
          <div className="agm-tb is-head" aria-hidden="true">
            <span>{t("gamesAdmin.stats.player")}</span>
            <span>{t("gamesAdmin.drawer.game")}</span>
            <span className="agm-ra">{t("gamesAdmin.drawer.stake")}</span>
            <span>{t("gamesAdmin.drawer.result")}</span>
            <span className="agm-ra">{t("gamesAdmin.drawer.delta")}</span>
            <span className="agm-ra">{t("gamesAdmin.drawer.time")}</span>
          </div>
          {!data.recent.length ? (
            <div className="agm-empty">{t("gamesAdmin.empty.hands")}</div>
          ) : (
            data.recent.map((h) => (
              <button key={h.id} type="button" className="agm-tb" onClick={() => onOpenPlayer(h.user.id)}>
                <span className="agm-tb-u">
                  <GAvatar user={h.user} size={22} radius={7} />@{h.user.username || "?"}
                </span>
                <span className="agm-muted">{t(gameKey(h.gameType))}</span>
                <span className="agm-ra tnum">{n(h.bet)}</span>
                <ResultChip result={h.result} />
                <span className="agm-ra">
                  <Delta value={h.delta} />
                </span>
                <span className="agm-ra agm-muted">{formatTimeAgo(h.at, t, new Date(), locale)}</span>
              </button>
            ))
          )}
        </section>
      </div>
    </div>
  );
}

export function RulesView({ rules }) {
  const { t, locale } = useLocale();
  const n = (v) => formatNumber(v, locale);
  if (!rules) return <Skel h={300} r={18} />;
  const rows = [
    ["bet", t("gamesAdmin.rules.betV", { min: n(rules.minBet), max: n(rules.maxBet) })],
    ["start", t("gamesAdmin.rules.startV", { n: n(rules.startingCredits) })],
    ["daily", t("gamesAdmin.rules.dailyV", { n: n(rules.dailyBonus) })],
    ["bj", t("gamesAdmin.rules.bjV", { decks: rules.blackjack?.decks || 6 })],
    ["slot", t("gamesAdmin.rules.slotV", { lines: rules.slot?.lines || 10 })],
    ["coin", t("gamesAdmin.rules.coinV")],
    ["idle", t("gamesAdmin.rules.idleV", { n: rules.idleHandMinutes || 10 })],
    ["limits", t("gamesAdmin.rules.limitsV")],
  ];
  return (
    <div className="agm-rules" data-testid="agm-rules">
      <div className="agm-info">
        <Shield size={16} aria-hidden="true" />
        <span>{t("gamesAdmin.rules.pointsOnly")}</span>
      </div>
      <section className="agm-card">
        <h3>
          <Spade size={16} />
          {t("gamesAdmin.rules.title")}
          <span className="agm-chip is-gray agm-ml">{t("gamesAdmin.rules.fixed")}</span>
        </h3>
        <dl className="agm-kv">
          {rows.map(([id, v]) => (
            <div key={id}>
              <dt>{t(`gamesAdmin.rules.${id}`)}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
