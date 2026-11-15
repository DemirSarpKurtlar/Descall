/**
 * Canlı popup › Kuyruk (scheduled: countdown, send now, edit, cancel with a
 * reason), Geçmiş (every popup of the last weeks with its rates; opens in the
 * live view) and Şablonlar (built-in + saved templates with a mini preview).
 */
import { useEffect, useId, useMemo, useState } from "react";
import { Calendar, Download, Pencil, Search, Send, Trash2, X } from "../../ui/Icon.jsx";
import { useLocale } from "../../../context/LocaleContext";
import { livePopupIcon } from "../../../lib/livePopupIcons";
import { livePopupApi } from "./livePopupApi.js";
import { Chip, Dialog, FieldLabel, Skeleton } from "./ui.jsx";
import { BUILTIN_TEMPLATES, TONE_CHIP, TONE_COLOR, audienceLabel, countdown, dayTime, fmtNumber, pct } from "./livePopupModel.js";

function pctText(v, locale) {
  try {
    return new Intl.NumberFormat(locale || "tr", { style: "percent", maximumFractionDigits: 0 }).format((Number(v) || 0) / 100);
  } catch {
    return `${v}%`;
  }
}

export function QueueView({ overview, onEdit, onChanged, say, errText }) {
  const { t, locale } = useLocale();
  const [cancelFor, setCancelFor] = useState(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const reasonId = useId();
  const queue = overview?.queue || [];
  const sendNow = async (c) => {
    setBusy(true);
    try {
      await livePopupApi.sendNow(c.id);
      say(t("livePopup.queueView.sentNow"));
      onChanged();
    } catch (err) {
      say(errText(err), "bad");
    } finally {
      setBusy(false);
    }
  };
  const cancel = async () => {
    setBusy(true);
    try {
      await livePopupApi.cancel(cancelFor.id, reason.trim());
      setCancelFor(null);
      say(t("livePopup.queueView.canceled"));
      onChanged();
    } catch (err) {
      say(errText(err), "bad");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="lp-card lp-list" data-testid="lp-queue">
      <h3>
        <Calendar size={17} />
        {t("livePopup.queueView.title")}
      </h3>
      {!overview ? [0, 1].map((i) => <Skeleton key={i} h={62} r={13} />) : null}
      {overview && !queue.length ? <p className="lp-empty-line">{t("livePopup.queueEmpty")}</p> : null}
      <div className="lp-hist">
        {queue.map((c) => {
          const Glyph = livePopupIcon(c);
          return (
            <div key={c.id} className="lp-q is-row">
              <span className="lp-hic" style={{ "--c": TONE_COLOR[c.severity] }} aria-hidden="true"><Glyph size={16} /></span>
              <span className="lp-qt">
                <b>{c.title}</b>
                <small>
                  {dayTime(c.scheduledAt, locale)} · {audienceLabel(c.audience, t)} · @{c.createdBy?.username || "admin"}
                </small>
              </span>
              <Chip tone={TONE_CHIP[c.severity]} upper>{t(`livePopup.tone.${c.severity}`)}</Chip>
              <span className="lp-cd tnum">{t("livePopup.queueView.in", { time: countdown(c.scheduledAt, t) })}</span>
              <button type="button" className="lp-btn is-sm" onClick={() => onEdit(c)} disabled={busy}>
                <Pencil size={15} />
                {t("livePopup.queueView.edit")}
              </button>
              <button type="button" className="lp-btn is-sm is-bq" onClick={() => sendNow(c)} disabled={busy}>
                <Send size={15} />
                {t("livePopup.queueView.sendNow")}
              </button>
              <button type="button" className="lp-btn is-sm is-rq" onClick={() => { setReason(""); setCancelFor(c); }} disabled={busy}>
                <X size={15} />
                {t("livePopup.queueView.cancel")}
              </button>
            </div>
          );
        })}
      </div>
      <Dialog open={Boolean(cancelFor)} onClose={() => setCancelFor(null)} busy={busy} icon={X} tone="red" title={t("livePopup.queueView.cancelTitle")} subtitle={cancelFor ? `“${cancelFor.title}” · ${dayTime(cancelFor.scheduledAt, locale)}` : ""} width={480}>
        <div className="lp-f">
          <FieldLabel htmlFor={reasonId}>{t("livePopup.queueView.cancelReason")}</FieldLabel>
          <input id={reasonId} className="lp-inp" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} data-autofocus />
        </div>
        <div className="lp-row">
          <button type="button" className="lp-btn" onClick={() => setCancelFor(null)} disabled={busy}>{t("livePopup.review.cancel")}</button>
          <button type="button" className="lp-btn is-dng" onClick={cancel} disabled={busy}>{t("livePopup.queueView.cancelSubmit")}</button>
        </div>
      </Dialog>
    </div>
  );
}

export function HistoryView({ onOpen, onCsv }) {
  const { t, locale } = useLocale();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    let alive = true;
    livePopupApi
      .history(150)
      .then((out) => alive && setRows(out.campaigns || []))
      .catch((err) => alive && setError(err?.message || "error"));
    return () => {
      alive = false;
    };
  }, []);
  const shown = useMemo(() => {
    const term = q.trim().toLocaleLowerCase(locale || "tr");
    return (rows || []).filter((c) => !term || String(c.title).toLocaleLowerCase(locale || "tr").includes(term));
  }, [rows, q, locale]);
  const n = (v) => fmtNumber(v, locale);
  return (
    <div className="lp-card lp-list" data-testid="lp-history">
      <h3>
        {t("livePopup.historyView.title")}
        <span className="lp-sp" />
        <label className="lp-search is-sm">
          <Search size={15} aria-hidden="true" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("livePopup.historyView.search")} aria-label={t("livePopup.historyView.search")} />
        </label>
      </h3>
      <div className="lp-tbl" role="table">
        <div className="lp-tr is-h lp-htable" role="row">
          <span role="columnheader">{t("livePopup.composer.titleLabel")}</span>
          <span role="columnheader">{t("livePopup.historyView.when")}</span>
          <span role="columnheader">{t("livePopup.historyView.audience")}</span>
          <span role="columnheader">{t("livePopup.historyView.delivered")}</span>
          <span role="columnheader">{t("livePopup.historyView.seen")}</span>
          <span role="columnheader">{t("livePopup.historyView.acked")}</span>
          <span role="columnheader">{t("livePopup.historyView.clicked")}</span>
          <span role="columnheader">{t("livePopup.historyView.status")}</span>
          <span role="columnheader" />
        </div>
        {!rows && !error ? [0, 1, 2, 3].map((i) => <Skeleton key={i} h={44} r={11} />) : null}
        {error ? <p className="lp-empty-line is-bad" role="alert">{error}</p> : null}
        {rows && !shown.length ? <p className="lp-empty-line">{t("livePopup.historyEmpty")}</p> : null}
        {shown.map((c) => {
          const Glyph = livePopupIcon(c);
          const s = c.stats || {};
          const del = Number(s.delivered) || 0;
          const statusKey = c.recallMode === "resolved" ? "resolved" : c.status;
          return (
            <div key={c.id} className="lp-tr lp-htable is-click" role="row">
              <button type="button" role="cell" className="lp-uc lp-cellbtn" onClick={() => onOpen(c.id)} aria-label={`${c.title} · ${t("livePopup.historyView.open")}`}>
                <span className="lp-hic" style={{ "--c": TONE_COLOR[c.severity] }} aria-hidden="true"><Glyph size={15} /></span>
                <span>
                  <b>{c.title}</b>
                  <small>@{c.createdBy?.username || "admin"}</small>
                </span>
              </button>
              <span role="cell">{dayTime(c.sentAt || c.createdAt, locale)}</span>
              <span role="cell" className="lp-ellipsis">{audienceLabel(c.audience, t)}</span>
              <span role="cell" className="tnum">{n(del)}</span>
              <span role="cell" className="tnum">{pctText(pct(s.seen, del), locale)}</span>
              <span role="cell" className="tnum">{pctText(pct(s.acked, del), locale)}</span>
              <span role="cell" className="tnum">{pctText(pct(s.clicked, del), locale)}</span>
              <span role="cell">
                {c.status === "live" ? <span className="lp-livebadge">{t("livePopup.status.live")}</span> : <Chip tone={{ recalled: "red", resolved: "green", canceled: "gray" }[statusKey] || "gray"}>{t(`livePopup.status.${statusKey}`)}</Chip>}
              </span>
              <span role="cell" className="lp-rowact">
                {c.sentAt ? (
                  <button type="button" className="lp-rowbtn" onClick={() => onCsv(c.id)} aria-label={t("livePopup.actions.csv")}>
                    <Download size={16} />
                  </button>
                ) : null}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MiniPop({ tpl, t }) {
  const Glyph = livePopupIcon(tpl);
  return (
    <div className="lp-minipop" style={{ "--c": TONE_COLOR[tpl.severity] }} aria-hidden="true">
      <span className="lp-minipop-ic"><Glyph size={15} /></span>
      <b>{tpl.title}</b>
      <i />
      <i className="s" />
      {tpl.ctaLabel ? <u>{tpl.ctaLabel}</u> : <u>{t("Got it")}</u>}
    </div>
  );
}

export function TemplatesView({ templates, onUse, onChanged, say, errText }) {
  const { t } = useLocale();
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState(null);
  const builtins = BUILTIN_TEMPLATES.map((b) => ({
    ...b,
    name: t(`livePopup.templates.${b.key}.name`),
    title: t(`livePopup.templates.${b.key}.title`),
    ctaLabel: b.cta ? t(`livePopup.templates.${b.key}.cta`) : "",
  }));
  const remove = async () => {
    setBusy(true);
    try {
      await livePopupApi.deleteTemplate(del.id);
      setDel(null);
      onChanged();
    } catch (err) {
      say(errText(err), "bad");
    } finally {
      setBusy(false);
    }
  };
  const Card = ({ tpl, builtin }) => (
    <div className="lp-tpl">
      <div className="lp-tpl-v">
        <MiniPop tpl={tpl} t={t} />
      </div>
      <div className="lp-tpl-m">
        <div>
          <b>{tpl.name}</b>
          <small>
            {t(`livePopup.tone.${tpl.severity}`)}
            {builtin ? ` · ${t("livePopup.templates.builtin")}` : tpl.useCount ? ` · ${t("livePopup.templates.used", { n: tpl.useCount })}` : ""}
          </small>
        </div>
        <span className="lp-sp" />
        {!builtin ? (
          <button type="button" className="lp-rowbtn" onClick={() => setDel(tpl)} aria-label={`${t("livePopup.templates.delete")} · ${tpl.name}`}>
            <Trash2 size={16} />
          </button>
        ) : null}
        <button type="button" className="lp-btn is-sm is-bq" onClick={() => onUse(tpl)}>
          {t("livePopup.templates.use")}
        </button>
      </div>
    </div>
  );
  return (
    <div className="lp-card lp-list" data-testid="lp-templates">
      <h3>{t("livePopup.templates.builtin")}</h3>
      <div className="lp-tpls">
        {builtins.map((tpl) => (
          <Card key={tpl.id} tpl={tpl} builtin />
        ))}
      </div>
      <h3>{t("livePopup.templates.saved")}</h3>
      {!templates.loaded ? <Skeleton h={120} r={16} /> : null}
      {templates.loaded && !templates.persistent ? <p className="lp-empty-line">{t("livePopup.templates.unavailable")}</p> : null}
      {templates.loaded && templates.persistent && !templates.list.length ? <p className="lp-empty-line">{t("livePopup.templates.empty")}</p> : null}
      <div className="lp-tpls">
        {templates.list.map((tpl) => (
          <Card key={tpl.id} tpl={tpl} />
        ))}
      </div>
      <Dialog open={Boolean(del)} onClose={() => setDel(null)} busy={busy} icon={Trash2} tone="red" title={del ? t("livePopup.templates.deleteConfirm", { name: del.name }) : ""} width={460}>
        <div className="lp-row">
          <button type="button" className="lp-btn" onClick={() => setDel(null)} disabled={busy} data-autofocus>{t("livePopup.review.cancel")}</button>
          <button type="button" className="lp-btn is-dng" onClick={remove} disabled={busy}>
            <Trash2 size={16} />
            {t("livePopup.templates.delete")}
          </button>
        </div>
      </Dialog>
    </div>
  );
}
