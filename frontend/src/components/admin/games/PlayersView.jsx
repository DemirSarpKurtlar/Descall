/**
 * Draft B frame 1: player list (left) + the selected player's workspace (right):
 * hero with chips and six stat tiles, grouped actions with "Daha fazla", the
 * 30-day balance chart, per game, active limits and the credit ledger with the
 * running balance.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { adminFetch } from "../../../api/adminHttp";
import { useLocale } from "../../../context/LocaleContext";
import { formatNumber } from "../../../i18n/format.js";
import { formatAppDate, formatTimeAgo } from "../../../lib/datetime";
import {
  ArrowLeft,
  Ban,
  Calendar,
  Coins,
  Download,
  Ellipsis,
  EyeOff,
  Eye,
  History,
  Maximize2,
  PenLine,
  Search,
  Send,
  SlidersHorizontal,
  Snowflake,
  Spade,
  TrendingUp,
  Undo2,
} from "../../ui/Icon.jsx";
import DossierMenu from "../dossier/DossierMenu.jsx";
import GamesChart from "./GamesChart.jsx";
import { Delta, GAvatar, GDialog, ICONS, Pills, Seg, Skel, downloadCsv } from "./GamesUi.jsx";
import { errorText, limitSummaryText } from "./GamesDialogs.jsx";
import { LEDGER_FILTERS, flagDot, gameKey, ledgerView, qs } from "./gamesModel.js";

/* ======================= List ======================= */

export function PlayerList({ state, query, setQuery, filter, setFilter, sort, setSort, selectedId, onSelect, searchRef }) {
  const { t, locale } = useLocale();
  const n = (v) => formatNumber(v, locale);
  const counts = state.counts || {};
  const listRef = useRef(null);
  const onKeyDown = (e) => {
    if (!["ArrowDown", "ArrowUp"].includes(e.key)) return;
    const items = [...(listRef.current?.querySelectorAll("button.agm-pr") || [])];
    const i = items.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    items[e.key === "ArrowDown" ? Math.min(items.length - 1, i + 1) : Math.max(0, i - 1)]?.focus();
  };
  return (
    <section className="agm-glass agm-plist" aria-label={t("gamesAdmin.list.label")}>
      <label className="agm-search">
        <Search size={18} aria-hidden="true" />
        <input ref={searchRef} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("gamesAdmin.list.search")} aria-label={t("gamesAdmin.list.search")} data-testid="agm-search" />
        <kbd>{t("gamesAdmin.list.shortcut")}</kbd>
      </label>
      <Pills
        label={t("gamesAdmin.list.filter")}
        value={filter}
        onChange={setFilter}
        items={[
          { id: "all", label: t("gamesAdmin.list.f_all", { n: n(counts.all || 0) }) },
          { id: "risky", label: t("gamesAdmin.list.f_risky", { n: n(counts.risky || 0) }) },
          { id: "limited", label: t("gamesAdmin.list.f_limited", { n: n(counts.limited || 0) }) },
          { id: "frozen", label: t("gamesAdmin.list.f_frozen", { n: n(counts.frozen || 0) }) },
        ]}
      />
      <Seg
        label={t("gamesAdmin.list.sort")}
        value={sort}
        onChange={setSort}
        className="agm-seg-start"
        items={[
          { id: "balance", label: t("gamesAdmin.list.s_balance") },
          { id: "hands", label: t("gamesAdmin.list.s_hands") },
          { id: "winrate", label: t("gamesAdmin.list.s_winrate") },
          { id: "recent", label: t("gamesAdmin.list.s_recent") },
        ]}
      />
      <div className="agm-plist-scroll" ref={listRef} onKeyDown={onKeyDown} aria-busy={state.loading}>
        {state.loading && !state.players.length ? (
          Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="agm-pr is-skel">
              <Skel w={34} h={34} r={11} />
              <div style={{ flex: 1 }}>
                <Skel w="60%" h={12} />
                <Skel w="40%" h={10} style={{ marginTop: 6 }} />
              </div>
            </div>
          ))
        ) : state.err ? (
          <p className="agm-err" role="alert">
            {state.err}
          </p>
        ) : !state.players.length ? (
          <div className="agm-empty">{query ? t("gamesAdmin.empty.search") : t("gamesAdmin.empty.players")}</div>
        ) : (
          state.players.map((p) => {
            const dot = flagDot(p.flags);
            return (
              <button key={p.id} type="button" className={`agm-pr${p.id === selectedId ? " is-on" : ""}`} aria-current={p.id === selectedId ? "true" : undefined} onClick={() => onSelect(p.id)} data-testid="agm-player">
                <GAvatar user={p} size={34} />
                <div className="agm-pr-t">
                  <b>
                    @{p.username || "?"}
                    {dot ? <span className={`agm-flag is-${dot}`} role="img" aria-label={t(`gamesAdmin.list.flag_${dot}`)} /> : null}
                  </b>
                  <small>
                    {t("gamesAdmin.list.sub", {
                      hands: n(p.hands || 0),
                      rate: p.winRate == null ? "—" : t("gamesAdmin.pct", { n: formatNumber(Math.round(p.winRate), locale) }),
                    })}
                  </small>
                </div>
                <div className="agm-bal">
                  <span className="tnum">{n(p.credits)}</span>
                  <small>{t("gamesAdmin.credits")}</small>
                </div>
              </button>
            );
          })
        )}
        {state.players.length < state.total ? <p className="agm-muted agm-more-note">{t("gamesAdmin.list.more", { n: n(state.total - state.players.length) })}</p> : null}
      </div>
    </section>
  );
}

/* ======================= Ledger ======================= */

function LedgerCard({ playerId, refreshKey, onNotify }) {
  const { t, locale } = useLocale();
  const [kind, setKind] = useState("all");
  const [state, setState] = useState({ loading: true, entries: [], hasMore: false, source: "ledger", err: "" });
  const [more, setMore] = useState(false);
  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true, err: "" }));
    adminFetch(`/credits/players/${playerId}/ledger${qs({ kind, limit: 30 })}`)
      .then((r) => live && setState({ loading: false, entries: r.entries || [], hasMore: Boolean(r.hasMore), source: r.source, err: "" }))
      .catch((e) => live && setState({ loading: false, entries: [], hasMore: false, source: "ledger", err: errorText(t, e) }));
    return () => {
      live = false;
    };
  }, [playerId, kind, refreshKey, t]);
  const loadMore = async () => {
    const last = state.entries[state.entries.length - 1];
    if (!last) return;
    setMore(true);
    try {
      const balance = last.balanceAfter != null ? last.balanceAfter - last.delta : undefined;
      const r = await adminFetch(`/credits/players/${playerId}/ledger${qs({ kind, limit: 30, before: last.at, balance })}`);
      setState((s) => ({ ...s, entries: [...s.entries, ...(r.entries || [])], hasMore: Boolean(r.hasMore), source: r.source === "ledger" ? s.source : "mixed" }));
    } catch (e) {
      onNotify?.(errorText(t, e), "error");
    } finally {
      setMore(false);
    }
  };
  const exportCsv = async () => {
    try {
      const r = await adminFetch(`/credits/players/${playerId}/ledger/export${qs({ kind })}`);
      downloadCsv(r.filename, r.csv);
    } catch (e) {
      onNotify?.(errorText(t, e), "error");
    }
  };
  const n = (v) => formatNumber(v, locale);
  const when = (at) => {
    const d = new Date(at);
    const age = Date.now() - d.getTime();
    if (age < 86400000) return formatTimeAgo(at, t, new Date(), locale);
    return formatAppDate(at, locale, { day: "numeric", month: "short", year: undefined });
  };
  return (
    <section className="agm-card agm-ledger" aria-labelledby="agm-ledger-h" data-testid="agm-ledger">
      <h3 id="agm-ledger-h">
        <History size={16} />
        {t("gamesAdmin.ledger.title")}
        <button type="button" className="agm-x" onClick={exportCsv}>
          {t("gamesAdmin.ledger.csv")}
        </button>
      </h3>
      <Pills label={t("gamesAdmin.ledger.filter")} value={kind} onChange={setKind} items={LEDGER_FILTERS.map((id) => ({ id, label: t(`gamesAdmin.ledger.f_${id}`) }))} />
      <div className="agm-ledger-list" aria-busy={state.loading}>
        {state.loading ? (
          [0, 1, 2, 3, 4].map((i) => <Skel key={i} h={48} r={12} style={{ display: "block", marginBottom: 6 }} />)
        ) : state.err ? (
          <p className="agm-err" role="alert">
            {state.err}
          </p>
        ) : !state.entries.length ? (
          <div className="agm-empty">{t("gamesAdmin.empty.ledger")}</div>
        ) : (
          state.entries.map((e) => {
            const v = ledgerView(e);
            const Icon = ICONS[v.icon] || Coins;
            const title = t(v.titleKey, { ...(v.titleVars || {}), game: v.titleVars?.game ? t(v.titleVars.game) : "", result: v.titleVars?.result ? t(v.titleVars.result) : "" });
            const sub = [...v.parts.map((p) => (p.text != null ? p.text : t(p.key, Object.fromEntries(Object.entries(p.vars || {}).map(([k, x]) => [k, typeof x === "number" ? n(x) : x]))))), when(e.at)].join(" · ");
            return (
              <div key={e.id} className="agm-hrow" data-testid="agm-ledger-row">
                <span className={`agm-ic is-${v.tone}`} aria-hidden="true">
                  <Icon size={16} />
                </span>
                <div className="agm-hrow-t">
                  <b>{title}</b>
                  <small title={sub}>{sub}</small>
                </div>
                <div className="agm-hrow-d">
                  <Delta value={e.delta} />
                  <small className="tnum" title={e.approximate ? t("gamesAdmin.ledger.approx") : undefined}>
                    {e.balanceAfter == null ? "—" : `${e.approximate ? "~" : ""}${n(e.balanceAfter)}`}
                  </small>
                </div>
              </div>
            );
          })
        )}
        {state.hasMore ? (
          <button type="button" className="agm-btn agm-wide" onClick={loadMore} disabled={more}>
            {more ? t("gamesAdmin.loading") : t("gamesAdmin.ledger.more")}
          </button>
        ) : null}
        {state.source !== "ledger" && state.entries.length ? <p className="agm-hint">{t("gamesAdmin.ledger.approxNote")}</p> : null}
      </div>
    </section>
  );
}

/* ======================= Workspace ======================= */

const GAME_COLORS = { blackjack: "#587af5", coinflip: "#9b5de5", slot: "#f2a93b" };

export function Workspace({ data, loading, err, players, refreshKey, onAction, onBack, showBack, onNotify }) {
  const { t, locale } = useLocale();
  const moreRef = useRef(null);
  const [menu, setMenu] = useState(false);
  const [full, setFull] = useState(false);
  const n = (v) => formatNumber(v, locale);
  const pct = (v) => (v == null ? "—" : t("gamesAdmin.pct", { n: formatNumber(v, locale, { maximumFractionDigits: 1 }) }));

  const byGame = useMemo(() => {
    const list = (data?.byGame || []).slice().sort((a, b) => b.hands - a.hands);
    const max = Math.max(1, ...list.map((g) => g.hands));
    return list.map((g) => ({ ...g, share: (g.hands / max) * 100 }));
  }, [data]);
  const markers = useMemo(
    () =>
      (data?.series || [])
        .map((d, i) => (d.admin ? { index: i, color: "#f2a93b", text: `${d.admin > 0 ? "+" : "−"}${formatNumber(Math.abs(d.admin), locale)}` } : null))
        .filter(Boolean),
    [data, locale]
  );

  if (err) {
    return (
      <div className="agm-ws">
        <div className="agm-glass agm-ws-empty">
          <p className="agm-err" role="alert">
            {err}
          </p>
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="agm-ws" aria-busy={loading}>
        {loading ? (
          <>
            <div className="agm-glass agm-ph">
              <div className="agm-row1">
                <Skel w={64} h={64} r={20} />
                <div style={{ flex: 1 }}>
                  <Skel w="40%" h={18} />
                  <Skel w="60%" h={12} style={{ marginTop: 8 }} />
                </div>
              </div>
              <div className="agm-pstats">
                {Array.from({ length: 6 }, (_, i) => (
                  <Skel key={i} h={56} r={14} />
                ))}
              </div>
            </div>
            <Skel h={40} r={12} />
            <Skel h={300} r={18} />
          </>
        ) : (
          <div className="agm-glass agm-ws-empty">
            <Spade size={40} aria-hidden="true" />
            <p>{t("gamesAdmin.empty.pick")}</p>
          </div>
        )}
      </div>
    );
  }

  const p = data.player;
  const s = data.stats;
  const lim = data.limits || {};
  const flags = data.flags || {};
  const limitText = limitSummaryText(t, locale, { ...lim, frozenUntil: lim.frozenUntil, indefinite: lim.indefinite, frozen: lim.frozen });
  const ctx = s.lastContext;
  const ctxLabel = ctx ? (ctx.kind === "dm" ? t("gamesAdmin.ledger.ctxDm", { name: ctx.label || "?" }) : ctx.kind === "channel" ? t("gamesAdmin.ledger.ctxChannel", { name: ctx.label || "?" }) : ctx.label || t("gamesAdmin.ledger.ctxGroupUnknown")) : null;

  const menuItems = [
    {
      id: "hide",
      icon: flags.hidden ? Eye : EyeOff,
      label: flags.hidden ? t("gamesAdmin.menu.show") : t("gamesAdmin.menu.hide"),
      sub: flags.hidden ? t("gamesAdmin.menu.showSub") : t("gamesAdmin.menu.hideSub"),
      onSelect: () => onAction(flags.hidden ? "show" : "hide"),
    },
    { id: "freeze", icon: Snowflake, label: flags.frozen ? t("gamesAdmin.menu.unfreeze") : t("gamesAdmin.menu.freeze"), sub: t("gamesAdmin.menu.freezeSub"), onSelect: () => onAction("freeze") },
    {
      id: "transfers",
      icon: Send,
      label: lim.transfersEnabled === false ? t("gamesAdmin.menu.transfersOn") : t("gamesAdmin.menu.transfersOff"),
      sub: lim.transfersEnabled === false ? t("gamesAdmin.menu.transfersOnSub") : t("gamesAdmin.menu.transfersOffSub"),
      onSelect: () => onAction(lim.transfersEnabled === false ? "transfersOn" : "transfersOff"),
    },
    { id: "export", icon: Download, label: t("gamesAdmin.menu.export"), sub: t("gamesAdmin.menu.exportSub"), onSelect: () => onAction("exportLedger") },
    "sep",
    { id: "reset", icon: Undo2, danger: true, label: t("gamesAdmin.menu.reset"), sub: t("gamesAdmin.menu.resetSub", { n: n(1000) }), onSelect: () => onAction("reset") },
    { id: "ban", icon: Ban, danger: true, label: t("gamesAdmin.menu.ban"), sub: t("gamesAdmin.menu.banSub"), onSelect: () => onAction("ban") },
  ];

  const chart = (h) => (
    <GamesChart
      points={data.series}
      valueKey="balance"
      height={h}
      lineColor="#4fe0a0"
      barColor="rgba(88,122,245,0.35)"
      markers={markers}
      label={t("gamesAdmin.ws.chart")}
      valueLabel={t("gamesAdmin.ws.balance")}
      testId="agm-balance-chart"
    />
  );

  return (
    <div className="agm-ws" data-testid="agm-ws">
      <section className="agm-glass agm-ph" aria-label={t("gamesAdmin.ws.hero")}>
        <div className="agm-row1">
          {showBack ? (
            <button type="button" className="agm-xbtn agm-back" onClick={onBack} aria-label={t("gamesAdmin.back")}>
              <ArrowLeft size={16} />
            </button>
          ) : null}
          <GAvatar user={p} size={64} radius={20} />
          <div className="agm-ph-id">
            <div className="agm-nm">
              <h2>{p.displayName || p.username}</h2>
              {flags.risk ? <span className={`agm-chip ${flags.risk === "high" ? "is-red" : "is-gold"}`}>{t("gamesAdmin.ws.risky")}</span> : null}
              {flags.frozen ? <span className="agm-chip is-blue">{t("gamesAdmin.ws.frozen")}</span> : null}
              {flags.limited ? <span className="agm-chip is-gold">{t("gamesAdmin.ws.limited")}</span> : null}
              {flags.hidden ? <span className="agm-chip is-gray">{t("gamesAdmin.ws.hidden")}</span> : null}
              <span className={`agm-chip ${p.ageVerified ? "is-gray" : "is-red"}`}>{p.ageVerified ? t("gamesAdmin.ws.age") : t("gamesAdmin.ws.noAge")}</span>
            </div>
            <div className="agm-hmeta">
              <span>@{p.username}</span>
              {s.firstPlayedAt ? (
                <span>
                  <Calendar size={16} aria-hidden="true" />
                  {t("gamesAdmin.ws.firstGame", { date: formatAppDate(s.firstPlayedAt, locale, { day: "numeric", month: "short", year: "numeric" }) })}
                </span>
              ) : null}
              {s.lastPlayedAt ? (
                <span>
                  <History size={16} aria-hidden="true" />
                  {ctxLabel
                    ? t("gamesAdmin.ws.lastGameAt", { ago: formatTimeAgo(s.lastPlayedAt, t, new Date(), locale), where: ctxLabel })
                    : t("gamesAdmin.ws.lastGame", { ago: formatTimeAgo(s.lastPlayedAt, t, new Date(), locale) })}
                </span>
              ) : (
                <span>{t("gamesAdmin.ws.neverPlayed")}</span>
              )}
            </div>
          </div>
        </div>
        <div className="agm-pstats">
          <div className="agm-st">
            <b className="tnum">{data.wallet ? n(data.wallet.credits) : "—"}</b>
            <span>{t("gamesAdmin.ws.balance")}</span>
          </div>
          <div className="agm-st">
            <b className="tnum">{n(s.hands)}</b>
            <span>{t("gamesAdmin.ws.hands")}</span>
          </div>
          <div className="agm-st">
            <b>{pct(s.winRate)}</b>
            <span>{t("gamesAdmin.ws.winRate")}</span>
          </div>
          <div className="agm-st">
            <b>
              <Delta value={s.net30} />
            </b>
            <span>{t("gamesAdmin.ws.net30")}</span>
          </div>
          <div className="agm-st">
            <b>{t("gamesAdmin.ws.streakN", { n: s.bonusStreak || 0 })}</b>
            <span>{t("gamesAdmin.ws.streak")}</span>
          </div>
          <div className="agm-st">
            <b>{s.rank == null ? (flags.hidden ? t("gamesAdmin.ws.rankHidden") : "—") : `#${n(s.rank)}`}</b>
            <span>{t("gamesAdmin.ws.rank")}</span>
          </div>
        </div>
      </section>

      <div className="agm-acts" role="toolbar" aria-label={t("gamesAdmin.ws.actions")}>
        <button type="button" className="agm-btn is-primary" onClick={() => onAction("credit")} data-testid="agm-act-credit">
          <Coins size={16} />
          {t("gamesAdmin.ws.credit")}
        </button>
        <button type="button" className="agm-btn" onClick={() => onAction("limits")} data-testid="agm-act-limits">
          <SlidersHorizontal size={16} />
          {t("gamesAdmin.ws.limits")}
        </button>
        <button type="button" className="agm-btn" onClick={() => onAction("history")} data-testid="agm-act-history">
          <Spade size={16} />
          {t("gamesAdmin.ws.history")}
        </button>
        <button type="button" className="agm-btn" onClick={() => onAction("note")}>
          <PenLine size={16} />
          {t("gamesAdmin.ws.note")}
        </button>
        <button ref={moreRef} type="button" className={`agm-btn${menu ? " is-pressed" : ""}`} aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((v) => !v)} data-testid="agm-act-more">
          <Ellipsis size={16} />
          {t("gamesAdmin.ws.more")}
        </button>
        <button type="button" className="agm-btn is-ban agm-ml" onClick={() => onAction("ban")}>
          <Ban size={16} />
          {t("gamesAdmin.ws.ban")}
        </button>
        <DossierMenu open={menu} anchorRef={moreRef} onClose={() => setMenu(false)} items={menuItems} label={t("gamesAdmin.ws.more")} width={300} testId="agm-more" />
      </div>

      <div className="agm-ws-grid">
        <div className="agm-ws-col">
          <section className="agm-card" aria-labelledby="agm-chart-h">
            <h3 id="agm-chart-h">
              <TrendingUp size={16} />
              {t("gamesAdmin.ws.chart")}
              <button type="button" className="agm-x" onClick={() => setFull(true)}>
                <Maximize2 size={14} />
                {t("gamesAdmin.ws.fullscreen")}
              </button>
            </h3>
            {chart(150)}
          </section>
          <section className="agm-card" aria-labelledby="agm-bygame-h">
            <h3 id="agm-bygame-h">
              <Spade size={16} />
              {t("gamesAdmin.ws.byGame")}
            </h3>
            {byGame.map((g) => (
              <div key={g.game} className="agm-bg-row">
                <span>{t(gameKey(g.game, true))}</span>
                <div className="agm-sl" aria-hidden="true">
                  <i style={{ width: `${g.share}%`, background: GAME_COLORS[g.game] }} />
                </div>
                <span className="agm-ra tnum">{t("gamesAdmin.ws.handsN", { n: g.hands })}</span>
                <span className="agm-ra agm-muted">{g.hands ? pct(g.winPct) : "—"}</span>
              </div>
            ))}
            {limitText ? (
              <div className="agm-note-b">
                <small>{t("gamesAdmin.ws.activeLimits")}</small>
                {limitText}
              </div>
            ) : null}
          </section>
        </div>
        <LedgerCard playerId={p.id} refreshKey={refreshKey} onNotify={onNotify} />
      </div>

      <GDialog open={full} onClose={() => setFull(false)} icon={TrendingUp} title={t("gamesAdmin.ws.chart")} subtitle={`@${p.username}`} width={1040}>
        {chart(360)}
      </GDialog>
    </div>
  );
}
