/**
 * Draft B frame 2: "El el oyun geçmişi" drawer. Filters (game, result, period),
 * every hand with its cards, a row opens the step-by-step replay (dealt, each
 * card asked for, the dealer, the result with the balance after), the fair play
 * check, CSV, a link to the opened hand and older hands on demand.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { adminFetch } from "../../../api/adminHttp";
import { useLocale } from "../../../context/LocaleContext";
import { formatNumber } from "../../../i18n/format.js";
import { formatAppDate } from "../../../lib/datetime";
import { copyText } from "../../../lib/copyText.js";
import { Calendar, ChevronDown, Download, Link2, Play, Shield, X } from "../../ui/Icon.jsx";
import DossierMenu from "../dossier/DossierMenu.jsx";
import { CardHand, Delta, GAvatar, GDrawer, ResultChip, Seg, Skel, downloadCsv } from "./GamesUi.jsx";
import { errorText } from "./GamesDialogs.jsx";
import { HAND_DAYS, gameKey, handLink, handSummary, qs, replaySteps } from "./gamesModel.js";

const SLOT_SHORT = { wild: "W", scatter: "S", seven: "7", diamond: "D", crown: "C", bell: "B", bar: "BAR", cherry: "CH", ace: "A", king: "K", queen: "Q" };

function SlotGrid({ grid }) {
  const { t } = useLocale();
  const rows = [0, 1, 2];
  return (
    <span className="agm-slot" role="img" aria-label={t("gamesAdmin.replay.spin")}>
      {rows.map((r) => (
        <span key={r} className="agm-slot-row">
          {(grid || []).map((reel, i) => (
            <span key={i} className={`agm-slot-c is-${reel?.[r] || "x"}`} title={t(`gamesAdmin.slot.${reel?.[r] || "queen"}`)}>
              {SLOT_SHORT[reel?.[r]] || "?"}
            </span>
          ))}
        </span>
      ))}
    </span>
  );
}

function ReplayStrip({ hand }) {
  const { t, locale } = useLocale();
  const steps = useMemo(() => replaySteps(hand), [hand]);
  const [shown, setShown] = useState(steps.length);
  const timer = useRef(null);
  const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const play = useCallback(() => {
    clearInterval(timer.current);
    if (reduce) {
      setShown(steps.length);
      return;
    }
    setShown(1);
    timer.current = setInterval(() => {
      setShown((s) => {
        if (s >= steps.length) {
          clearInterval(timer.current);
          return s;
        }
        return s + 1;
      });
    }, 650);
  }, [steps.length, reduce]);
  useEffect(() => {
    play();
    return () => clearInterval(timer.current);
  }, [play]);
  const n = (v) => formatNumber(v, locale);
  return (
    <div className="agm-replay" data-testid="agm-replay">
      {steps.map((s, i) => {
        const visible = i < shown;
        const label = s.kind === "result" ? t(s.labelKey) : `${s.index} · ${t(s.labelKey)}`;
        if (s.kind === "result") {
          return (
            <div key={i} className={`agm-step is-result${visible ? "" : " is-pending"}`} aria-hidden={!visible}>
              <small>{label}</small>
              <b className="agm-step-big">
                <Delta value={s.delta} />
              </b>
              {s.balanceAfter != null ? <span className="agm-muted">{t("gamesAdmin.replay.balance", { n: n(s.balanceAfter) })}</span> : null}
            </div>
          );
        }
        let body = null;
        if (s.cards) body = <CardHand cards={s.cards} animate={visible} label={label} />;
        else if (s.grid) body = <SlotGrid grid={s.grid} />;
        else if (s.coin) body = <span className={`agm-coin is-${s.coin}`}>{t(s.noteKey)}</span>;
        const vars = {};
        for (const [k, v] of Object.entries(s.noteVars || {})) vars[k] = n(v);
        return (
          <div key={i} className={`agm-step${visible ? "" : " is-pending"}`} aria-hidden={!visible}>
            <small>{label}</small>
            {body}
            {s.cards ? <span className="agm-muted">{t(s.noteKey, vars)}</span> : s.grid && s.freeSpins ? <span className="agm-muted">{t("gamesAdmin.replay.freeSpins", { n: s.freeSpins })}</span> : null}
          </div>
        );
      })}
      <button type="button" className="agm-replay-btn" onClick={play} aria-label={t("gamesAdmin.replay.again")} title={t("gamesAdmin.replay.again")}>
        <Play size={14} />
      </button>
    </div>
  );
}

function HandRow({ hand, open, onToggle }) {
  const { t, locale } = useLocale();
  const summary = handSummary(hand);
  const time = formatAppDate(hand.at, locale, { day: "numeric", month: "short", year: undefined, hour: "2-digit", minute: "2-digit" });
  return (
    <button type="button" className={`agm-hh${open ? " is-open" : ""}`} onClick={onToggle} aria-expanded={open} data-testid="agm-hand">
      <span className="agm-muted">{time}</span>
      <span>{t(gameKey(hand.gameType))}</span>
      <span className="agm-hh-cards">
        {summary ? (
          <span className="agm-muted">{t(summary.key, { ...summary.vars, call: t(`gamesAdmin.coin.${summary.vars.call || "heads"}`), face: t(`gamesAdmin.coin.${summary.vars.face || "heads"}`), paid: formatNumber(summary.vars.paid || 0, locale) })}</span>
        ) : (
          <>
            <CardHand cards={hand.player?.cards} label={t("gamesAdmin.drawer.player")} />
            <span className="agm-vs">{t("gamesAdmin.drawer.dealer")}</span>
            <CardHand cards={hand.dealer?.cards} label={t("gamesAdmin.drawer.dealer")} />
          </>
        )}
      </span>
      <span className="agm-ra tnum">{formatNumber(hand.bet, locale)}</span>
      <ResultChip result={hand.result} />
      <span className="agm-ra">
        <Delta value={hand.delta} />
      </span>
    </button>
  );
}

export default function HistoryDrawer({ open, onClose, player, stats, focusHandId, onNotify }) {
  const { t, locale } = useLocale();
  const titleId = useId();
  const [game, setGame] = useState("all");
  const [result, setResult] = useState("all");
  const [days, setDays] = useState("7");
  const [menu, setMenu] = useState(false);
  const daysRef = useRef(null);
  const [state, setState] = useState({ loading: true, hands: [], hasMore: false, fairPlay: null, err: "" });
  const [openId, setOpenId] = useState(null);
  const [more, setMore] = useState(false);

  const load = useCallback(
    async (before = null) => {
      const q = qs({ game, result, days, limit: 30, before });
      const r = await adminFetch(`/credits/players/${player.id}/hands${q}`);
      return r;
    },
    [player?.id, game, result, days]
  );

  useEffect(() => {
    if (!open || !player?.id) return undefined;
    let live = true;
    setState((s) => ({ ...s, loading: true, err: "" }));
    load()
      .then((r) => {
        if (!live) return;
        setState({ loading: false, hands: r.hands || [], hasMore: Boolean(r.hasMore), fairPlay: r.fairPlay || null, err: "" });
        setOpenId((cur) => (focusHandId && (r.hands || []).some((h) => h.id === focusHandId) ? focusHandId : cur && (r.hands || []).some((h) => h.id === cur) ? cur : r.hands?.[0]?.id || null));
      })
      .catch((e) => live && setState({ loading: false, hands: [], hasMore: false, fairPlay: null, err: errorText(t, e) }));
    return () => {
      live = false;
    };
  }, [open, player?.id, load, focusHandId, t]);

  // A deep-linked hand outside the window: widen to every hand once.
  useEffect(() => {
    if (open && focusHandId) setDays("all");
  }, [open, focusHandId]);

  const loadMore = async () => {
    const last = state.hands[state.hands.length - 1];
    if (!last) return;
    setMore(true);
    try {
      const r = await load(last.at);
      setState((s) => ({ ...s, hands: [...s.hands, ...(r.hands || [])], hasMore: Boolean(r.hasMore) }));
    } catch (e) {
      onNotify?.(errorText(t, e), "error");
    } finally {
      setMore(false);
    }
  };

  const exportCsv = async () => {
    try {
      const r = await adminFetch(`/credits/players/${player.id}/hands/export${qs({ game, result, days })}`);
      downloadCsv(r.filename, r.csv);
    } catch (e) {
      onNotify?.(errorText(t, e), "error");
    }
  };

  const copyLink = async () => {
    if (!openId) return;
    const link = handLink(window.location.origin, player.id, openId);
    // Not copied: the toast shows the link so it can still be selected by hand.
    onNotify?.((await copyText(link)) ? t("gamesAdmin.drawer.linkCopied") : link);
  };

  const fp = state.fairPlay;
  const n = (v) => formatNumber(v, locale);
  const pct = (v) => (v == null ? "—" : t("gamesAdmin.pct", { n: formatNumber(v, locale, { maximumFractionDigits: 1 }) }));
  const dayLabel = (d) => t(`gamesAdmin.drawer.days_${d}`);

  return (
    <GDrawer open={open} onClose={onClose} labelledBy={titleId} testId="agm-drawer">
      <div className="agm-dhd">
        <div className="agm-dh">
          <GAvatar user={player} size={42} radius={14} />
          <div className="agm-dh-t">
            <h2 id={titleId}>{t("gamesAdmin.drawer.title", { user: player?.username || "" })}</h2>
            <p>
              {t("gamesAdmin.drawer.subtitle", {
                hands: n(stats?.hands || 0),
                rate: pct(stats?.winRate),
                net: `${(stats?.net30 || 0) > 0 ? "+" : (stats?.net30 || 0) < 0 ? "−" : ""}${n(Math.abs(stats?.net30 || 0))}`,
              })}
            </p>
          </div>
          <button type="button" className="agm-xbtn" onClick={onClose} aria-label={t("gamesAdmin.close")}>
            <X size={16} />
          </button>
        </div>
        <div className="agm-dfilters">
          <Seg
            label={t("gamesAdmin.drawer.gameFilter")}
            value={game}
            onChange={setGame}
            items={[
              { id: "all", label: t("gamesAdmin.all") },
              { id: "blackjack", label: t("gamesAdmin.game.blackjack") },
              { id: "slot", label: t("gamesAdmin.game.slot") },
              { id: "coinflip", label: t("gamesAdmin.game.coinflip") },
            ]}
          />
          <Seg
            label={t("gamesAdmin.drawer.resultFilter")}
            value={result}
            onChange={setResult}
            items={[
              { id: "all", label: t("gamesAdmin.drawer.anyResult") },
              { id: "win", label: t("gamesAdmin.result.win") },
              { id: "loss", label: t("gamesAdmin.result.loss") },
            ]}
          />
          <button ref={daysRef} type="button" className="agm-btn agm-ml" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((v) => !v)}>
            <Calendar size={16} />
            {dayLabel(days)}
            <ChevronDown size={14} />
          </button>
          <DossierMenu
            open={menu}
            anchorRef={daysRef}
            onClose={() => setMenu(false)}
            label={t("gamesAdmin.drawer.period")}
            width={200}
            items={HAND_DAYS.map((d) => ({ id: d, label: dayLabel(d), onSelect: () => setDays(d) }))}
          />
        </div>
      </div>
      <div className="agm-dbd">
        <div className="agm-hh is-head" aria-hidden="true">
          <span>{t("gamesAdmin.drawer.time")}</span>
          <span>{t("gamesAdmin.drawer.game")}</span>
          <span>{t("gamesAdmin.drawer.hands")}</span>
          <span className="agm-ra">{t("gamesAdmin.drawer.stake")}</span>
          <span>{t("gamesAdmin.drawer.result")}</span>
          <span className="agm-ra">{t("gamesAdmin.drawer.delta")}</span>
        </div>
        {state.loading ? (
          [0, 1, 2, 3, 4].map((i) => <Skel key={i} h={48} r={12} style={{ display: "block", marginBottom: 5 }} />)
        ) : state.err ? (
          <p className="agm-err" role="alert">
            {state.err}
          </p>
        ) : !state.hands.length ? (
          <div className="agm-empty">{t("gamesAdmin.empty.hands")}</div>
        ) : (
          <div role="list">
            {state.hands.map((h) => (
              <div key={h.id} role="listitem" className={openId === h.id ? "agm-hh-wrap is-open" : "agm-hh-wrap"}>
                <HandRow hand={h} open={openId === h.id} onToggle={() => setOpenId((cur) => (cur === h.id ? null : h.id))} />
                {openId === h.id ? <ReplayStrip hand={h} /> : null}
              </div>
            ))}
          </div>
        )}
        {fp ? (
          <div className="agm-card agm-fair" data-testid="agm-fair">
            <h3>
              <Shield size={16} />
              {t("gamesAdmin.fair.title")}
              <span className={`agm-chip ${fp.status === "review" ? "is-red" : "is-green"} agm-ml`}>{t(`gamesAdmin.fair.${fp.status}`)}</span>
            </h3>
            <div className="agm-mini4">
              <div>
                <b>{pct(fp.winRate)}</b>
                <span>{t(`gamesAdmin.fair.band_${fp.band}`)}</span>
              </div>
              <div>
                <b className="tnum">{n(fp.longestStreak)}</b>
                <span>{t("gamesAdmin.fair.streak")}</span>
              </div>
              <div>
                <b className="tnum">{n(fp.avgBet)}</b>
                <span>{t("gamesAdmin.fair.avgBet")}</span>
              </div>
              <div>
                <b className="tnum">{n(fp.openHands)}</b>
                <span>{t("gamesAdmin.fair.open")}</span>
              </div>
            </div>
          </div>
        ) : null}
      </div>
      <div className="agm-dft">
        <button type="button" className="agm-btn" onClick={exportCsv} disabled={!state.hands.length}>
          <Download size={16} />
          {t("gamesAdmin.csv")}
        </button>
        <button type="button" className="agm-btn" onClick={copyLink} disabled={!openId}>
          <Link2 size={16} />
          {t("gamesAdmin.drawer.copyLink")}
        </button>
        <button type="button" className="agm-btn is-primary agm-ml" onClick={loadMore} disabled={!state.hasMore || more}>
          {more ? t("gamesAdmin.loading") : t("gamesAdmin.drawer.older")}
        </button>
      </div>
    </GDrawer>
  );
}
