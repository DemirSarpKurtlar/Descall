/**
 * Yönetici Paneli › İtirazlar (ban experience, 2026-11-14). Appeals from banned
 * accounts (written on the ban screen) and from blocked devices / networks
 * (access-appeal form, no account). Accept lifts the ban or access ban, reject
 * keeps it; the user is emailed the result. Permission section "moderation".
 * Contract: docs/design/ban-experience/CONTRACT.md, section 7.
 */
import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "../../api/adminHttp";
import { useLocale } from "../../context/LocaleContext";
import { formatAppDateTime } from "../../lib/datetime";
import { formatRelativeTime } from "../../i18n/format.js";
import { Avatar } from "../ui/Avatar";
import { SkeletonLine } from "../ui/Skeleton";
import { Check, Globe, Monitor, Network, RefreshCw, Scale, X } from "../ui/Icon.jsx";
import { APPEAL_STATUSES, appealsFromResponse, appealsQuery, decidePayload, maskEmail } from "./banDialogModel.js";
import { categoryLabel, loadModerationMeta } from "./moderationMeta.js";
import "../../styles/admin-ban.css";

const TYPES = [
  ["", "banAdmin.appeals.typeAll"],
  ["account", "banAdmin.appeals.typeAccount"],
  ["access", "banAdmin.appeals.typeAccess"],
];
const KIND_ICON = { ip: Globe, network: Network, device: Monitor };

function AppealSkeleton() {
  return (
    <div className="apl-skel" aria-hidden="true">
      <span className="apl-skel-ic" />
      <div>
        <SkeletonLine width="38%" height={14} />
        <SkeletonLine width="24%" height={11} />
        <SkeletonLine width="92%" height={40} />
      </div>
    </div>
  );
}

function AppealRow({ appeal: a, categories, t, locale, busy, onDecide }) {
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const when = (iso) => (iso ? formatAppDateTime(iso, locale, { second: undefined }) || iso : "");
  const ago = (iso) => {
    const d = iso ? new Date(iso) : null;
    return d && !Number.isNaN(d.getTime()) ? formatRelativeTime(d, locale, { style: "short" }) : "";
  };
  const isAccess = a.type === "access";
  const KindIcon = KIND_ICON[a.access.kind] || Globe;
  const until = isAccess ? a.access.expiresAt : a.ban.expiresAt;
  const name = a.user.displayName || a.user.username || t("banAdmin.appeals.unknownUser");

  return (
    <li className="apl-card">
      {isAccess ? (
        <span className="apl-ic" title={a.access.kind ? t(`banAdmin.appeals.kind.${a.access.kind}`) : undefined}>
          <KindIcon size={18} />
        </span>
      ) : (
        <Avatar name={name} size={40} user={{ id: a.user.id, username: a.user.username, displayName: name, avatarUrl: a.user.avatarUrl }} />
      )}
      <div className="apl-main">
        <div className="apl-top">
          {isAccess ? (
            <>
              <b>{a.access.code ? t("banAdmin.appeals.accessCode", { code: a.access.code }) : t("banAdmin.appeals.typeAccess")}</b>
              {a.email ? <span>{maskEmail(a.email)}</span> : null}
              {a.access.label ? <span>{a.access.label}</span> : null}
            </>
          ) : (
            <>
              <b>{name}</b>
              {a.user.username ? <span>@{a.user.username}</span> : null}
            </>
          )}
          {a.createdAt ? (
            <time dateTime={a.createdAt} title={when(a.createdAt)}>
              {t("banAdmin.appeals.sent", { when: ago(a.createdAt) })}
            </time>
          ) : null}
        </div>
        <div className="apl-tags">
          <span className="apl-tag">{isAccess ? t("banAdmin.appeals.typeAccess") : t("banAdmin.appeals.typeAccount")}</span>
          {isAccess && a.access.kind ? <span className="apl-tag">{t(`banAdmin.appeals.kind.${a.access.kind}`)}</span> : null}
          {!isAccess && (a.ban.categoryId || a.ban.reason) ? (
            <span className="apl-tag is-red">
              {a.ban.categoryId ? categoryLabel(a.ban.categoryId, categories, t) : t(a.ban.reason)}
            </span>
          ) : null}
          <span className="apl-tag is-amber">
            {until ? t("banAdmin.appeals.until", { when: when(until) }) : t("banAdmin.appeals.permanent")}
          </span>
          {a.status !== "pending" ? (
            <span className={`apl-tag ${a.status === "accepted" ? "is-green" : "is-red"}`}>{t(`banAdmin.appeals.status.${a.status}`)}</span>
          ) : null}
        </div>
        {a.text ? <p className="apl-text">{a.text}</p> : null}
        {a.status !== "pending" && (a.decidedBy || a.decidedAt || a.note) ? (
          <p className="apl-decided">
            {t("banAdmin.appeals.decidedBy", { name: a.decidedBy || "?", when: when(a.decidedAt) })}
            {a.note ? (
              <>
                {" · "}
                <q>{a.note}</q>
              </>
            ) : null}
          </p>
        ) : null}
        {a.status === "pending" ? (
          <>
            {noteOpen ? (
              <textarea
                className="apl-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t("banAdmin.appeals.notePh")}
                maxLength={1000}
                rows={2}
                autoFocus
              />
            ) : null}
            <div className="apl-acts">
              {!noteOpen ? (
                <button type="button" className="apl-btn is-ghost" onClick={() => setNoteOpen(true)}>
                  {t("banAdmin.appeals.addNote")}
                </button>
              ) : null}
              <button type="button" className="apl-btn is-reject" disabled={busy} onClick={() => onDecide(a, "reject", note)}>
                <X size={15} />
                {t("banAdmin.appeals.reject")}
              </button>
              <button type="button" className="apl-btn is-accept" disabled={busy} onClick={() => onDecide(a, "accept", note)}>
                <Check size={15} />
                {t("banAdmin.appeals.accept")}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </li>
  );
}

export default function AdminAppeals() {
  const { t, locale } = useLocale();
  const [status, setStatus] = useState("pending");
  const [type, setType] = useState("");
  const [rows, setRows] = useState(null);
  const [categories, setCategories] = useState([]);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    setErr("");
    setLoading(true);
    return adminFetch(appealsQuery({ status, type }))
      .then((d) => setRows(appealsFromResponse(d)))
      .catch((e) => {
        setRows([]);
        setErr(e?.message || t("banAdmin.appeals.loadFailed"));
      })
      .finally(() => setLoading(false));
  }, [status, type, t]);

  useEffect(() => {
    setRows(null);
    load();
  }, [load]);

  useEffect(() => {
    loadModerationMeta()
      .then((m) => setCategories(m.categories || []))
      .catch(() => {});
  }, []);

  const decide = async (appeal, decision, note) => {
    setBusyId(appeal.id);
    setErr("");
    setOk("");
    try {
      await adminFetch(`/appeals/${encodeURIComponent(appeal.id)}/decide`, {
        method: "POST",
        body: JSON.stringify(decidePayload(decision, note)),
      });
      setOk(decision === "accept" ? t("banAdmin.appeals.acceptedOk") : t("banAdmin.appeals.rejectedOk"));
      setRows((list) => (list || []).filter((r) => r.id !== appeal.id));
    } catch (e) {
      setErr(e?.message || t("banAdmin.appeals.decideFailed"));
    } finally {
      setBusyId(null);
    }
  };

  const showSkeleton = rows == null;

  return (
    <section className="apl" aria-busy={loading || undefined}>
      <div className="apl-head">
        <span className="apl-head-ic" aria-hidden="true">
          <Scale size={20} />
        </span>
        <div>
          <h1>{t("banAdmin.appeals.title")}</h1>
          <p>{t("banAdmin.appeals.lead")}</p>
        </div>
        <button type="button" className="apl-refresh" onClick={() => load()} aria-label={t("banAdmin.appeals.refresh")} disabled={loading}>
          <RefreshCw size={15} className={loading ? "spin" : ""} />
        </button>
      </div>

      <div className="apl-bar">
        <div className="apl-seg" role="tablist" aria-label={t("banAdmin.appeals.filterStatus")}>
          {APPEAL_STATUSES.map((s) => (
            <button key={s} type="button" role="tab" aria-selected={status === s} className={status === s ? "is-on" : ""} onClick={() => setStatus(s)}>
              {t(`banAdmin.appeals.status.${s}`)}
              {s === "pending" && status === "pending" && rows?.length ? <b>{rows.length}</b> : null}
            </button>
          ))}
        </div>
        <div className="apl-chips" role="group" aria-label={t("banAdmin.appeals.filterType")}>
          {TYPES.map(([id, key]) => (
            <button key={id || "all"} type="button" className={type === id ? "is-on" : ""} aria-pressed={type === id} onClick={() => setType(id)}>
              {t(key)}
            </button>
          ))}
        </div>
      </div>

      {err ? (
        <p className="apl-msg is-err" role="alert">
          {err}
        </p>
      ) : null}
      {ok ? (
        <p className="apl-msg is-ok" role="status">
          {ok}
        </p>
      ) : null}

      {showSkeleton ? (
        <div className="apl-list" aria-hidden="true">
          <AppealSkeleton />
          <AppealSkeleton />
          <AppealSkeleton />
        </div>
      ) : rows.length === 0 ? (
        <div className="apl-empty">
          <span className="apl-empty-ic" aria-hidden="true">
            <Scale size={24} />
          </span>
          <h3>{status === "pending" ? t("banAdmin.appeals.emptyPending") : t("banAdmin.appeals.emptyOther")}</h3>
          <p>{t("banAdmin.appeals.emptyBody")}</p>
        </div>
      ) : (
        <ul className="apl-list">
          {rows.map((a) => (
            <AppealRow key={a.id} appeal={a} categories={categories} t={t} locale={locale} busy={busyId === a.id} onDecide={decide} />
          ))}
        </ul>
      )}
    </section>
  );
}
