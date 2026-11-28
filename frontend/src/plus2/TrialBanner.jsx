/**
 * Moment 12: the 3-day trial in progress ("Denemen 30 Kas'ta biter · 2 gün"). One trial per account
 * (a ticket and the own trial use the same right); a reminder comes 24 h before the end. A ticket
 * trial never charges; a store / web trial can be stopped from here (it does not renew).
 */
import { useLocale, useT } from "../context/LocaleContext";
import { formatDate } from "../i18n/format.js";
import { daysLeft } from "./model.js";
import { openPlus } from "./openPlus.js";

export default function TrialBanner({ me, offer, boostedServerName = null }) {
  const t = useT();
  const { locale } = useLocale() || {};
  if (!me?.trialEndsAt) return null;
  const left = daysLeft(me.trialEndsAt) ?? 0;
  const total = Number(offer?.trial?.days) || 3;
  const remindAt = new Date(Date.parse(me.trialEndsAt) - 24 * 3600 * 1000);
  const fmt = (d) => formatDate(d, locale, { day: "numeric", month: "short" });
  const ticket = me.origin === "ticket";
  return (
    <div className="p2-moment" role="status">
      <div className="p2-row">
        <b className="p2-grow" style={{ fontSize: 14 }}>{t("plus2.trial.ends", { date: fmt(me.trialEndsAt) })}</b>
        <span className="p2-pill is-info tnum">{t("plus2.trial.daysLeft", { n: left })}</span>
      </div>
      <div className="p2-small p2-muted">{boostedServerName ? t("plus2.trial.boosted", { server: boostedServerName }) : t(ticket ? "plus2.trial.ticketNote" : "plus2.trial.note")}</div>
      <div className="p2-bar is-thin"><i style={{ width: `${Math.round(((total - Math.min(total, left)) / total) * 100)}%` }} /></div>
      <div className="p2-row">
        <span className="p2-pill">{t("plus2.trial.reminder", { date: fmt(remindAt) })}</span>
        <span className="p2-grow" />
        {!ticket && me.autoRenew ? <button type="button" className="p2-btn is-sm is-ghost" onClick={() => openPlus({ view: "manage" })}>{t("plus2.trial.stop")}</button> : null}
      </div>
    </div>
  );
}
