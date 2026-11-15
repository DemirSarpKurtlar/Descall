/**
 * Canlı popup › Canlı tab (Draft B frame b1): five counters, the live tracking
 * card (funnel, seen speed, waiting on screen, platform tiles, live event feed,
 * language split, recent acknowledgements) and the queue + history column.
 */
import { useRef, useState } from "react";
import {
  Bell,
  Calendar,
  Check,
  Clock,
  Download,
  Eye,
  EyeOff,
  Globe,
  History,
  MailOpen,
  Monitor,
  MoreHorizontal,
  MousePointer,
  Plus,
  RefreshCw,
  Send,
  Smartphone,
  Sparkles,
  Square,
  Undo2,
  Users,
} from "../../ui/Icon.jsx";
import { Avatar } from "../../ui/Avatar";
import { useLocale } from "../../../context/LocaleContext";
import { livePopupIcon } from "../../../lib/livePopupIcons";
import { Chip, Menu, NewBadge, Skeleton } from "./ui.jsx";
import {
  TONE_CHIP,
  TONE_COLOR,
  audienceLabel,
  countdown,
  dayTime,
  distinctLanguages,
  eventLine,
  fmtNumber,
  funnelRows,
  secondsLabel,
  shortAgo,
  sparkHeights,
} from "./livePopupModel.js";

const FUNNEL_ICON = { targeted: Send, delivered: MailOpen, seen: Eye, acked: Check, clicked: MousePointer, missed: Clock };
const PLATFORM_ICON = { desktop: Monitor, web: Globe, ios: Smartphone, android: Smartphone };

function PctText({ n, locale }) {
  return <>{locale === "tr" ? `%${n}` : `${n}%`}</>;
}

export function KpiRow({ kpis, loading }) {
  const { t, locale } = useLocale();
  const k = kpis || {};
  const delta = k.connectedDelta;
  const n = (v) => fmtNumber(v, locale);
  const share = (v) => (k.connected ? Math.round((v / k.connected) * 100) : 0);
  const tiles = [
    {
      id: "connected",
      label: (
        <>
          <i className="lp-dotc" style={{ background: "#34c77b" }} />
          {t("livePopup.kpi.connected")}
        </>
      ),
      value: n(k.connected),
      sub: delta != null ? t("livePopup.kpi.connectedDelta", { delta: `${delta >= 0 ? "+" : ""}${n(delta)}` }) : t("livePopup.kpi.connectedNoDelta"),
      subTone: delta != null && delta >= 0 ? "green" : null,
    },
    { id: "visible", label: <><Eye size={15} />{t("livePopup.kpi.visible")}</>, value: n(k.visible), sub: <PctText n={share(k.visible)} locale={locale} /> },
    { id: "invisible", label: <><EyeOff size={15} />{t("livePopup.kpi.invisible")}</>, value: n(k.invisible), sub: <PctText n={share(k.invisible)} locale={locale} /> },
    {
      id: "open",
      label: <><Bell size={15} />{t("livePopup.kpi.openOnScreen")}<NewBadge label={t("livePopup.newBadge")} /></>,
      value: n(k.openOnScreen),
      sub: t("livePopup.kpi.openOnScreenSub"),
      subTone: "gold",
    },
    {
      id: "today",
      label: <><History size={15} />{t("livePopup.kpi.sentToday")}<NewBadge label={t("livePopup.newBadge")} /></>,
      value: n(k.sentToday),
      sub: t("livePopup.kpi.dailyLimit", { n: k.dailyLimit ?? 10 }),
      subTone: k.sentToday >= (k.dailyLimit ?? 10) ? "red" : null,
    },
  ];
  return (
    <div className="lp-kpis">
      {tiles.map((tile) => (
        <div key={tile.id} className="lp-kpi" data-testid={`lp-kpi-${tile.id}`}>
          <span className="lp-kpi-l">{tile.label}</span>
          {loading ? <Skeleton h={26} w={80} /> : <b className="tnum">{tile.value}</b>}
          <em className={tile.subTone ? `is-${tile.subTone}` : ""}>{loading ? "" : tile.sub}</em>
        </div>
      ))}
    </div>
  );
}

function StatusBadge({ campaign, t }) {
  if (campaign.status === "live") return <span className="lp-livebadge">{t("livePopup.status.live")}</span>;
  const key = campaign.recallMode === "resolved" ? "resolved" : campaign.status;
  const tone = { recalled: "red", ended: "gray", canceled: "gray", resolved: "green", scheduled: "blue" }[key] || "gray";
  return <Chip tone={tone} upper>{t(`livePopup.status.${key}`)}</Chip>;
}

function TrackingCard({ campaign, stats, actions }) {
  const { t, locale } = useLocale();
  const moreRef = useRef(null);
  const [more, setMore] = useState(false);
  const Glyph = livePopupIcon(campaign);
  const color = TONE_COLOR[campaign.severity] || TONE_COLOR.info;
  const live = campaign.status === "live";
  const missed = stats?.missed || 0;
  const n = (v) => fmtNumber(v, locale);
  const p = (v) => (locale === "tr" ? `%${v}` : `${v}%`);
  const langs = distinctLanguages(stats);
  const sentAgo = campaign.sentAt ? t("livePopup.ago", { time: shortAgo(campaign.sentAt, t) }) : "";
  const moreItems = [
    { id: "recipients", label: t("livePopup.actions.recipients"), icon: Users, onSelect: actions.recipients },
    { id: "duplicate", label: t("livePopup.actions.duplicate"), sub: t("livePopup.actions.duplicateSub"), icon: Plus, onSelect: actions.duplicate },
    ...(live && campaign.autoResolve ? [{ id: "resolve", label: t("livePopup.actions.resolve"), sub: t("livePopup.actions.resolveSub"), icon: Sparkles, onSelect: actions.resolve }] : []),
    { id: "csv", label: t("livePopup.actions.csv"), sub: t("livePopup.actions.csvSub"), icon: Download, onSelect: () => actions.csv() },
    ...(live ? ["sep", { id: "end", label: t("livePopup.actions.end"), sub: t("livePopup.actions.endSub"), icon: Square, onSelect: actions.end }] : []),
  ];
  const ackers = stats?.recentAckers || [];
  const rest = Math.max(0, (stats?.ackersTotal || 0) - ackers.length);
  const names = ackers.map((a) => a.username).filter(Boolean).join(", ");
  const spark = sparkHeights(stats?.spark);

  return (
    <div className="lp-card lp-track" data-testid="lp-track">
      <div className="lp-track-head">
        <span className="lp-track-ic" style={{ "--c": color }} aria-hidden="true">
          <Glyph size={22} />
        </span>
        <div className="lp-track-id">
          <div className="lp-track-badges">
            <StatusBadge campaign={campaign} t={t} />
            <Chip tone={TONE_CHIP[campaign.severity]} upper>{t(`livePopup.tone.${campaign.severity}`)}</Chip>
            {campaign.requireAck ? <Chip tone="gray" upper>{t("livePopup.requireAckChip")}</Chip> : null}
          </div>
          <h2 className="lp-track-title">{campaign.title}</h2>
          <p className="lp-muted">
            {t("livePopup.byLine", {
              user: campaign.createdBy?.username || "admin",
              ago: sentAgo,
              audience: audienceLabel(campaign.audience, t),
              langs: t("livePopup.langsCount", { n: langs || 1 }),
            })}
          </p>
        </div>
        <span className="lp-sp" />
        {live ? (
          <>
            <button type="button" className="lp-btn is-rq" onClick={actions.recall} data-testid="lp-recall">
              <Undo2 size={16} />
              {t("livePopup.actions.recall")}
            </button>
            <button type="button" className="lp-btn is-bq" onClick={actions.resend} disabled={!missed} data-testid="lp-resend-missed">
              <RefreshCw size={16} />
              {t("livePopup.actions.resendMissed", { n: n(missed) })}
            </button>
          </>
        ) : null}
        <button ref={moreRef} type="button" className="lp-btn is-icon" aria-label={t("livePopup.actions.more")} aria-haspopup="menu" aria-expanded={more} onClick={() => setMore((v) => !v)} data-testid="lp-more">
          <MoreHorizontal size={18} />
        </button>
        <Menu open={more} anchorRef={moreRef} onClose={() => setMore(false)} items={moreItems} label={t("livePopup.actions.more")} testId="lp-more-menu" />
      </div>

      <div className="lp-track-grid">
        <div className="lp-funnel" role="list">
          {funnelRows(stats).map((row) => {
            const Ico = FUNNEL_ICON[row.id];
            return (
              <div key={row.id} className={`lp-fn${row.id === "missed" ? " is-missed" : ""}`} role="listitem">
                <span className="lp-fn-k">
                  <Ico size={16} />
                  {t(`livePopup.funnel.${row.id}`)}
                </span>
                <div className="lp-fn-bar" aria-hidden="true">
                  <i style={{ width: `${row.value ? Math.max(row.pct, 2) : 0}%`, background: row.color }} />
                </div>
                <span className="lp-fn-v tnum">
                  {n(row.value)}
                  {row.hidePct ? null : <small>{p(row.pct)}</small>}
                </span>
              </div>
            );
          })}
        </div>
        <div className="lp-track-side">
          <div className="lp-tile">
            <div className="lp-fl"><span>{t("livePopup.speed")}</span></div>
            <div className="lp-spark" aria-hidden="true">
              {spark.map((h, i) => (
                <i key={i} style={{ height: `${h}%` }} />
              ))}
            </div>
            <div className="lp-legend">{stats?.avgSeenMs != null ? t("livePopup.avgSeen", { time: secondsLabel(stats.avgSeenMs, t) }) : t("livePopup.avgSeenNone")}</div>
          </div>
          <div className="lp-tile">
            <div className="lp-fl"><span>{t("livePopup.waiting")}</span></div>
            <div className="lp-big tnum">{n(stats?.open || 0)}</div>
            <div className="lp-legend">{t("livePopup.waitingSub")}</div>
          </div>
        </div>
      </div>

      <div className="lp-fl"><span>{t("livePopup.byPlatform")}</span></div>
      <div className="lp-plats">
        {(stats?.platforms || []).map((pl) => {
          const Ico = PLATFORM_ICON[pl.id] || Globe;
          return (
            <div key={pl.id} className="lp-plat">
              <span className="lp-plat-ic" aria-hidden="true"><Ico size={17} /></span>
              <div>
                <b>{t(`livePopup.platform.${pl.id}`)}</b>
                <small>{t("livePopup.recipients", { n: n(pl.n) })}</small>
              </div>
              <span className="lp-plat-v tnum">{pl.n ? p(pl.pct) : "–"}</span>
            </div>
          );
        })}
      </div>

      <div className="lp-track-bottom">
        <div>
          <div className="lp-fl">
            <span>{t("livePopup.feed")}</span>
            <NewBadge label={t("livePopup.newBadge")} />
          </div>
          {stats?.events?.length ? (
            <ol className="lp-tl" aria-live="polite">
              {stats.events.slice(0, 4).map((e) => {
                const line = eventLine(e);
                const sub = [line.platform ? t(`livePopup.platform.${line.platform}`) : null, line.extra || (line.extraKey ? t(line.extraKey) : null) || (line.lang ? t(`livePopup.lang.${line.lang}`) : null)]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <li key={`${e.userId}-${e.kind}`} className="lp-ev" style={{ "--c": line.color }}>
                    <div>
                      <b>{t(line.key, line.vars)}</b>
                      {sub ? <p>{sub}</p> : null}
                    </div>
                    <time dateTime={e.at}>{shortAgo(e.at, t)}</time>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="lp-empty-line">{t("livePopup.feedEmpty")}</p>
          )}
        </div>
        <div>
          <div className="lp-fl"><span>{t("livePopup.byLanguage")}</span></div>
          <div className="lp-tile lp-langs">
            {(stats?.languages || []).slice(0, 4).map((l, i) => (
              <div key={l.id} className="lp-lang">
                <div className="lp-legend is-split">
                  <span>
                    <b>{t(`livePopup.lang.${l.id}`)}</b>&nbsp;{t("livePopup.people", { n: n(l.n) })}
                  </span>
                  <span>{t("livePopup.langSeen", { n: l.pct })}</span>
                </div>
                <div className="lp-meter" aria-hidden="true">
                  <i style={{ width: `${l.pct}%`, background: ["#7b93ff", "#9b5de5", "#34c77b", "#f2a93b"][i % 4] }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="lp-ackers">
        <div className="lp-faces" aria-hidden="true">
          {ackers.map((a) => (
            <span key={a.id} className="lp-face">
              <Avatar name={a.username || "?"} size={30} user={{ id: a.id, username: a.username, avatar_url: a.avatarUrl }} animate="none" />
            </span>
          ))}
        </div>
        <span className="lp-ackers-txt">
          {!ackers.length
            ? t("livePopup.ackersNone")
            : rest
              ? t("livePopup.ackers", { names, n: n(rest) })
              : t("livePopup.ackersOnly", { names })}
        </span>
        <button type="button" className="lp-btn is-sm" onClick={actions.recipients} data-testid="lp-open-recipients">
          <Users size={16} />
          {t("livePopup.actions.recipients")}
        </button>
      </div>
    </div>
  );
}

function TrackingSkeleton() {
  return (
    <div className="lp-card lp-track" aria-busy="true">
      <div className="lp-track-head">
        <Skeleton h={44} w={44} r={14} />
        <div style={{ flex: 1, display: "grid", gap: 8 }}>
          <Skeleton h={14} w={220} />
          <Skeleton h={18} w={320} />
        </div>
      </div>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <Skeleton key={i} h={26} />
      ))}
    </div>
  );
}

function QueueCard({ queue, onTab }) {
  const { t, locale } = useLocale();
  return (
    <div className="lp-card lp-side-card">
      <h3>
        <Calendar size={17} />
        {t("livePopup.queue")}
        <NewBadge label={t("livePopup.newBadge")} />
        <button type="button" className="lp-x" onClick={() => onTab("queue")}>
          {t("livePopup.calendar")}
        </button>
      </h3>
      {queue.length ? (
        <div className="lp-hist">
          {queue.slice(0, 3).map((c) => {
            const Glyph = livePopupIcon(c);
            return (
              <button key={c.id} type="button" className="lp-q" onClick={() => onTab("queue")}>
                <span className="lp-hic" style={{ "--c": TONE_COLOR[c.severity] }} aria-hidden="true"><Glyph size={16} /></span>
                <span className="lp-qt">
                  <b>{c.title}</b>
                  <small>{dayTime(c.scheduledAt, locale)} · {audienceLabel(c.audience, t)}</small>
                </span>
                <span className="lp-cd tnum">{countdown(c.scheduledAt, t)}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="lp-empty-line">{t("livePopup.queueEmpty")}</p>
      )}
    </div>
  );
}

function HistoryCard({ history: all, summary, onOpen, onTab, activeId }) {
  const { t, locale } = useLocale();
  // The popup followed on the left is not repeated here.
  const history = all.filter((c) => c.id !== activeId);
  const n = (v) => fmtNumber(v, locale);
  return (
    <div className="lp-card lp-side-card is-grow">
      <h3>
        <History size={17} />
        {t("livePopup.history")}
        <button type="button" className="lp-x" onClick={() => onTab("history")}>
          {t("livePopup.all")}
        </button>
      </h3>
      {history.length ? (
        <div className="lp-hist">
          {history.slice(0, 4).map((c) => {
            const Glyph = livePopupIcon(c);
            const delivered = Number(c.stats?.delivered) || 0;
            const seenPct = delivered ? Math.round((100 * (Number(c.stats?.seen) || 0)) / delivered) : 0;
            return (
              <button key={c.id} type="button" className={`lp-hrow${c.id === activeId ? " is-active" : ""}`} onClick={() => onOpen(c.id)}>
                <span className="lp-hic" style={{ "--c": TONE_COLOR[c.severity] }} aria-hidden="true"><Glyph size={16} /></span>
                <span className="lp-ht">
                  <b>{c.title}</b>
                  <small>{t("livePopup.historyRow", { when: dayTime(c.sentAt, locale), n: n(delivered) })}</small>
                </span>
                <span className="lp-hv tnum">
                  {locale === "tr" ? `%${seenPct}` : `${seenPct}%`}
                  <small>{t("livePopup.seenWord")}</small>
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="lp-empty-line">{t("livePopup.historyEmpty")}</p>
      )}
      <div className="lp-sep" />
      <p className="lp-legend">{t("livePopup.summary30", { n: summary?.count || 0, seen: summary?.avgSeenPct || 0, click: summary?.avgClickPct || 0 })}</p>
    </div>
  );
}

export function LiveView({ overview, campaign, stats, loading, detailError, onRetry, actions, onOpenCampaign, onTab, onNew }) {
  const { t } = useLocale();
  return (
    <div className="lp-live">
      {campaign ? (
        <TrackingCard campaign={campaign} stats={stats} actions={actions} />
      ) : loading || !overview ? (
        <TrackingSkeleton />
      ) : detailError ? (
        <div className="lp-card lp-error" role="alert">
          <p>{t("livePopup.loadError")}</p>
          <button type="button" className="lp-btn" onClick={onRetry}>{t("livePopup.retry")}</button>
        </div>
      ) : (
        <div className="lp-card lp-empty">
          <span className="lp-empty-ic" aria-hidden="true"><Bell size={26} /></span>
          <h2>{t("livePopup.noLive")}</h2>
          <p>{t("livePopup.noLiveSub")}</p>
          <button type="button" className="lp-btn is-primary" onClick={onNew}>
            <Plus size={16} />
            {t("livePopup.newPopup")}
          </button>
        </div>
      )}
      <div className="lp-side">
        <QueueCard queue={overview?.queue || []} onTab={onTab} />
        <HistoryCard history={overview?.history || []} summary={overview?.summary30d} onOpen={onOpenCampaign} onTab={onTab} activeId={campaign?.id} />
      </div>
    </div>
  );
}
