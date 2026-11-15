/**
 * Canlı popup › recipients (Draft B frame b3): status filters with counts,
 * user search, platform filter, the table (checkbox, user, platform, language,
 * delivered / seen times, clicked, status chip, row menu), CSV, resend selected.
 * Row menu: resend to this person, open the user file, their popup history,
 * keep out of future info popups, ban (always the shared BanDialog).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Ban, BellOff, BellRing, Check, ChevronLeft, ChevronRight, Download, Filter, MessageCircle, MoreHorizontal, RefreshCw, Search, User } from "../../ui/Icon.jsx";
import { Avatar } from "../../ui/Avatar";
import GlassCheckbox from "../../ui/GlassCheckbox";
import { useLocale } from "../../../context/LocaleContext";
import { livePopupApi } from "./livePopupApi.js";
import { Chip, Menu, Skeleton } from "./ui.jsx";
import { FILTERS, PLATFORMS, clock, fmtNumber, rowStatus, selectionKind, toggleSet } from "./livePopupModel.js";

const PAGE = 50;

function TimeCell({ at, locale }) {
  if (!at) return <span className="lp-dash">—</span>;
  return (
    <span className="lp-tick">
      <Check size={14} />
      <span className="tnum">{clock(at, locale)}</span>
    </span>
  );
}

function RowMenu({ row, actions, canBan, canDossier, live }) {
  const { t } = useLocale();
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  const items = [
    ...(live
      ? [{ id: "resend", label: t("livePopup.rowMenu.resend"), sub: t(row.online ? "livePopup.rowMenu.resendOnline" : "livePopup.rowMenu.resendOffline"), icon: RefreshCw, onSelect: () => actions.resendTo([row.userId]) }]
      : []),
    ...(canDossier ? [{ id: "dossier", label: t("livePopup.rowMenu.dossier"), sub: t("livePopup.rowMenu.dossierSub"), icon: User, onSelect: () => actions.openUser(row.userId) }] : []),
    { id: "history", label: t("livePopup.rowMenu.history"), sub: t("livePopup.rowMenu.historySub"), icon: MessageCircle, onSelect: () => actions.userHistory(row) },
    {
      id: "exempt",
      label: t(row.exempt ? "livePopup.rowMenu.unexempt" : "livePopup.rowMenu.exempt"),
      sub: t(row.exempt ? "livePopup.rowMenu.unexemptSub" : "livePopup.rowMenu.exemptSub"),
      icon: BellOff,
      onSelect: () => actions.exempt(row),
    },
    ...(canBan ? ["sep", { id: "ban", label: t("livePopup.rowMenu.ban"), sub: t("livePopup.rowMenu.banSub"), icon: Ban, danger: true, trail: <ChevronRight size={14} />, onSelect: () => actions.ban(row) }] : []),
  ];
  return (
    <>
      <button
        ref={ref}
        type="button"
        className={`lp-rowbtn${open ? " is-on" : ""}`}
        aria-label={t("livePopup.table.rowMenu", { user: row.username })}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        data-testid={`lp-row-menu-${row.username}`}
      >
        <MoreHorizontal size={18} />
      </button>
      <Menu open={open} anchorRef={ref} onClose={() => setOpen(false)} items={items} label={t("livePopup.table.rowMenu", { user: row.username })} testId="lp-row-menu" />
    </>
  );
}

export default function RecipientsView({ campaign, reloadRef, onBack, actions, canBan, canDossier, errText }) {
  const { t, locale } = useLocale();
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [platforms, setPlatforms] = useState([]);
  const [data, setData] = useState(null);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const platRef = useRef(null);
  const [platOpen, setPlatOpen] = useState(false);
  const live = campaign.status === "live";
  const n = (v) => fmtNumber(v, locale);

  useEffect(() => {
    const id = window.setTimeout(() => setQDebounced(q.trim()), 250);
    return () => window.clearTimeout(id);
  }, [q]);

  const load = useCallback(
    async (keep = false) => {
      try {
        const out = await livePopupApi.receipts(campaign.id, { filter, q: qDebounced, platform: platforms.join(","), offset: 0, limit: keep ? Math.max(PAGE, rows.length) : PAGE });
        setData(out);
        setRows(out.rows || []);
        setError("");
      } catch (err) {
        setError(errText(err));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [campaign.id, filter, qDebounced, platforms, errText]
  );

  useEffect(() => {
    load(false);
  }, [load]);

  const rowsLenRef = useRef(0);
  rowsLenRef.current = rows.length;
  useEffect(() => {
    if (!reloadRef) return undefined;
    reloadRef.current = () => load(true);
    return () => {
      reloadRef.current = null;
    };
  }, [reloadRef, load]);

  const more = async () => {
    setLoadingMore(true);
    try {
      const out = await livePopupApi.receipts(campaign.id, { filter, q: qDebounced, platform: platforms.join(","), offset: rows.length, limit: PAGE });
      setRows((prev) => [...prev, ...(out.rows || [])]);
    } catch (err) {
      setError(errText(err));
    } finally {
      setLoadingMore(false);
    }
  };

  const counts = data?.counts || {};
  const visibleIds = useMemo(() => rows.map((r) => r.userId), [rows]);
  const allChecked = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const kind = selectionKind(rows, selected);

  const resendSelected = async () => {
    setBusy(true);
    const ok = await actions.resendTo([...selected]);
    setBusy(false);
    if (ok) setSelected(new Set());
  };

  const platItems = PLATFORMS.map((p) => ({
    id: p,
    label: t(`livePopup.platform.${p}`),
    checked: platforms.includes(p),
    onSelect: () => setPlatforms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p])),
  }));

  return (
    <div className="lp-recipients" data-testid="lp-recipients">
      <header className="lp-hdr">
        <span className="lp-hdr-ic" aria-hidden="true">
          <BellRing size={22} />
        </span>
        <div className="lp-hdr-txt">
          <h1>{t("livePopup.title")}</h1>
          <p>{t("livePopup.recipientsSubtitle", { title: campaign.title })}</p>
        </div>
        <span className="lp-sp" />
        <button type="button" className="lp-btn" onClick={onBack} data-testid="lp-back">
          <ChevronLeft size={16} />
          {t("livePopup.table.back")}
        </button>
        <button type="button" className="lp-btn" onClick={() => actions.csv(campaign.id)} data-testid="lp-csv">
          <Download size={16} />
          {t("livePopup.table.csv")}
        </button>
        {live ? (
          <button type="button" className="lp-btn is-bq" disabled={!selected.size || busy} onClick={resendSelected} data-testid="lp-resend-selected">
            <RefreshCw size={16} />
            {t("livePopup.table.resendSelected", { n: n(selected.size) })}
          </button>
        ) : null}
      </header>

      <div className="lp-rbar">
        <div className="lp-filters" role="tablist" aria-label={t("livePopup.table.status")}>
          {FILTERS.map((f) => (
            <button key={f} type="button" role="tab" aria-selected={filter === f} className={`lp-fp${filter === f ? " is-on" : ""}`} onClick={() => setFilter(f)} data-testid={`lp-filter-${f}`}>
              {t(`livePopup.table.filters.${f}`)} · {n(counts[f] || 0)}
            </button>
          ))}
        </div>
        <span className="lp-sp" />
        <label className="lp-search">
          <Search size={17} aria-hidden="true" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("livePopup.table.search")} aria-label={t("livePopup.table.search")} />
        </label>
        <button ref={platRef} type="button" className={`lp-btn${platforms.length ? " is-bq" : ""}`} aria-haspopup="menu" aria-expanded={platOpen} onClick={() => setPlatOpen((v) => !v)} data-testid="lp-platform-filter">
          <Filter size={16} />
          {t("livePopup.table.platformFilter")}
          {platforms.length ? ` · ${platforms.length}` : ""}
        </button>
        <Menu open={platOpen} anchorRef={platRef} onClose={() => setPlatOpen(false)} items={platItems} label={t("livePopup.table.platformFilter")} width={220} keepOpen />
      </div>

      <div className="lp-card lp-tablecard">
        <div className="lp-tbl" role="table" aria-label={t("livePopup.recipientsSubtitle", { title: campaign.title })}>
          <div className="lp-tr is-h" role="row">
            <span role="columnheader">
              <GlassCheckbox checked={allChecked} onChange={() => setSelected(allChecked ? new Set([...selected].filter((id) => !visibleIds.includes(id))) : new Set([...selected, ...visibleIds]))} aria-label={t("livePopup.table.selectAll")} />
            </span>
            <span role="columnheader">{t("livePopup.table.user")}</span>
            <span role="columnheader">{t("livePopup.table.platform")}</span>
            <span role="columnheader">{t("livePopup.table.language")}</span>
            <span role="columnheader">{t("livePopup.table.delivered")}</span>
            <span role="columnheader">{t("livePopup.table.seen")}</span>
            <span role="columnheader">{t("livePopup.table.clicked")}</span>
            <span role="columnheader">{t("livePopup.table.status")}</span>
            <span role="columnheader" />
          </div>
          {!data && !error
            ? [0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="lp-tr" role="row">
                  <Skeleton h={18} w={18} r={5} />
                  <Skeleton h={28} w={180} />
                  <Skeleton h={14} w={70} />
                  <Skeleton h={14} w={30} />
                  <Skeleton h={14} w={50} />
                  <Skeleton h={14} w={50} />
                  <Skeleton h={14} w={20} />
                  <Skeleton h={20} w={100} r={999} />
                  <span />
                </div>
              ))
            : null}
          {rows.map((row) => {
            const st = rowStatus(row);
            const on = selected.has(row.userId);
            return (
              <div key={row.userId} className={`lp-tr${on ? " is-sel" : ""}`} role="row" data-testid={`lp-row-${row.username}`}>
                <span role="cell">
                  <GlassCheckbox checked={on} onChange={() => setSelected((s) => toggleSet(s, row.userId))} aria-label={t("livePopup.table.selectRow", { user: row.username })} />
                </span>
                <span role="cell" className="lp-uc">
                  <Avatar name={row.username || "?"} size={28} user={{ id: row.userId, username: row.username, avatar_url: row.avatarUrl }} animate="none" />
                  <span>
                    <b>{row.username}</b>
                    <small>@{row.username}</small>
                  </span>
                </span>
                <span role="cell">{row.platform ? t(`livePopup.platform.${row.platform}`) : "—"}</span>
                <span role="cell">{row.language ? String(row.language).slice(0, 2).toUpperCase() : "—"}</span>
                <span role="cell"><TimeCell at={row.deliveredAt} locale={locale} /></span>
                <span role="cell"><TimeCell at={row.seenAt} locale={locale} /></span>
                <span role="cell">{row.clickedAt ? <span className="lp-tick"><Check size={14} /></span> : <span className="lp-dash">—</span>}</span>
                <span role="cell">
                  <Chip tone={st.tone}>{t(st.key, { time: clock(row.ackedAt, locale) })}</Chip>
                </span>
                <span role="cell" className="lp-rowact">
                  <RowMenu row={row} actions={actions} canBan={canBan} canDossier={canDossier} live={live} />
                </span>
              </div>
            );
          })}
          {data && !rows.length ? <p className="lp-empty-line">{t("livePopup.table.empty")}</p> : null}
          {error ? (
            <p className="lp-empty-line is-bad" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <div className="lp-tfoot">
          <span className="lp-legend">
            {selected.size
              ? t("livePopup.table.footerSelected", {
                  n: n(selected.size),
                  kind: kind === "unseen-missed" ? t("livePopup.table.kindUnseenMissed") : "",
                  total: n(data?.total || 0),
                  shown: n(rows.length),
                })
              : t("livePopup.table.footer", { shown: n(rows.length), total: n(data?.filtered ?? 0) })}
          </span>
          {data && rows.length < (data.filtered || 0) ? (
            <button type="button" className="lp-btn is-sm" onClick={more} disabled={loadingMore}>
              {t("livePopup.table.loadMore")}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
