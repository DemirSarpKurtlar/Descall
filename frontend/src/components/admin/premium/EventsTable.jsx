import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight } from "../../ui/Icon.jsx";
import { PlanChip, When } from "./PremiumUi.jsx";

function endText(unlimited, endsAt, locale, t) {
  if (unlimited) return t("premiumAdmin.unlimited");
  return endsAt ? <When value={endsAt} locale={locale} /> : "–";
}

export function actorLabel(ev, t) {
  const name = ev.actor_username || ev.actor?.username || ev.actor_name;
  if (name) return `@${name}`;
  return t(`premiumAdmin.actorKind.${ev.actor_kind || "system"}`);
}

export function userLabel(ev) {
  const u = ev.user || {};
  return u.display_name || u.username || ev.username || (ev.user_id ? String(ev.user_id).slice(0, 8) : "–");
}

/**
 * subscription_events rows (append-only). showUser adds the member column
 * (global Abonelik Geçmişi); a row opens to show the note, request id and batch.
 */
export default function EventsTable({ events, locale, t, showUser = false, onPickUser = null }) {
  const [open, setOpen] = useState(null);
  if (!events?.length) return <p className="pa-empty">{t("premiumAdmin.hist.empty")}</p>;
  return (
    <div className="pa-table-wrap">
      <table className="agr-table pa-table">
        <thead>
          <tr>
            <th aria-label={t("premiumAdmin.details")} />
            <th>{t("premiumAdmin.f.date")}</th>
            {showUser ? <th>{t("premiumAdmin.f.user")}</th> : null}
            <th>{t("premiumAdmin.f.kind")}</th>
            <th>{t("premiumAdmin.f.plan")}</th>
            <th>{t("premiumAdmin.f.end")}</th>
            <th>{t("premiumAdmin.f.actor")}</th>
            <th>{t("premiumAdmin.f.reason")}</th>
          </tr>
        </thead>
        <tbody>
          {events.map((ev) => {
            const id = ev.id || `${ev.created_at}-${ev.user_id}-${ev.kind}`;
            const isOpen = open === id;
            return (
              <Fragment key={id}>
                <tr className={isOpen ? "is-open" : ""}>
                  <td className="pa-td-x">
                    <button type="button" className="pa-expand" aria-expanded={isOpen} aria-label={t("premiumAdmin.details")} onClick={() => setOpen(isOpen ? null : id)}>
                      {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                  </td>
                  <td><When value={ev.created_at} locale={locale} /></td>
                  {showUser ? (
                    <td>
                      {onPickUser ? <button type="button" className="pa-link" onClick={() => onPickUser(ev.user_id)}>{userLabel(ev)}</button> : userLabel(ev)}
                    </td>
                  ) : null}
                  <td><span className={`pa-kind is-${ev.kind}`}>{t(`premiumAdmin.kind.${ev.kind}`)}</span>{ev.is_free ? <span className="pa-mini">{t("premiumAdmin.free")}</span> : null}</td>
                  <td className="pa-planmove">
                    {ev.prev_plan && ev.prev_plan !== ev.new_plan ? <><PlanChip plan={ev.prev_plan} t={t} /><span aria-hidden="true" className="mt-muted">{"→"}</span></> : null}
                    {ev.new_plan || ev.prev_plan ? <PlanChip plan={ev.new_plan || ev.prev_plan} t={t} /> : <span className="mt-muted">–</span>}
                  </td>
                  <td>{endText(ev.new_unlimited, ev.new_ends_at, locale, t)}</td>
                  <td>{actorLabel(ev, t)}</td>
                  <td className="pa-reason" title={ev.reason || ""}>{ev.reason || <span className="mt-muted">–</span>}</td>
                </tr>
                {isOpen ? (
                  <tr className="pa-detail-row">
                    <td colSpan={showUser ? 8 : 7}>
                      <dl className="pa-dl">
                        <div><dt>{t("premiumAdmin.f.prevEnd")}</dt><dd>{endText(ev.prev_unlimited, ev.prev_ends_at, locale, t)}</dd></div>
                        <div><dt>{t("premiumAdmin.f.newEnd")}</dt><dd>{endText(ev.new_unlimited, ev.new_ends_at, locale, t)}</dd></div>
                        <div><dt>{t("premiumAdmin.f.note")}</dt><dd>{ev.note || "–"}</dd></div>
                        <div><dt>{t("premiumAdmin.f.actorKind")}</dt><dd>{t(`premiumAdmin.actorKind.${ev.actor_kind || "system"}`)}</dd></div>
                        <div><dt>{t("premiumAdmin.f.batch")}</dt><dd className="pa-mono">{ev.batch_id || "–"}</dd></div>
                        <div><dt>{t("premiumAdmin.f.requestId")}</dt><dd className="pa-mono">{ev.request_id || "–"}</dd></div>
                      </dl>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
