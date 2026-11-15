/**
 * Aktif yaptırımlar: four lanes (ending within the hour, mutes, timed bans,
 * permanent bans) with live countdowns, progress, appeal state, Erken kaldır
 * (reason required), the extend menu (+1 / +6 / +24 h, custom, convert to a ban,
 * edit the note) and a jump to the user file.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adminFetch } from "../../../api/adminHttp";
import { useLocale } from "../../../context/LocaleContext";
import { formatAppDateTime } from "../../../lib/datetime";
import { Plus, User, MoreHorizontal, RotateCcw, Clock, Ban, Copy, AlertTriangle } from "../../ui/Icon.jsx";
import DossierMenu from "../dossier/DossierMenu.jsx";
import { ModAvatar, Chip, useNow, durationShort, remainingText, categoryText } from "./ModParts.jsx";
import { CustomExtendDialog, EditNoteDialog } from "./ModDialogs.jsx";
import { EXTEND_STEPS, elapsedShare, groupLanes } from "./modDeskModel.js";

const LANES = [
  { id: "soon", dot: "#f2a93b" },
  { id: "timeouts", dot: "#f2a93b" },
  { id: "tempBans", dot: "#f23f43" },
  { id: "permBans", dot: "#9b5de5" },
];

function SanctionCard({ it, now, t, locale, meta, onLift, onExtend, onCustom, onBan, onNote, onOpenPerson, lane }) {
  const plusRef = useRef(null);
  const moreRef = useRef(null);
  const [menu, setMenu] = useState(null); // "extend" | "more"
  const ends = it.endsAt ? Date.parse(it.endsAt) : null;
  const left = ends ? ends - now : null;
  const share = ends ? elapsedShare(it.startedAt, it.endsAt, now) : 1;
  const total = ends && it.startedAt ? Math.round((ends - Date.parse(it.startedAt)) / 1000) : null;
  const tone = lane === "permBans" ? "violet" : it.type === "ban" ? "red" : "amber";
  const who = it.auto ? t("modDesk.board.auto") : it.actor?.username ? `@${it.actor.username}` : t("modDesk.board.unknownActor");
  const tail = it.endsAt ? durationShort(total, t) : it.startedAt ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(new Date(it.startedAt)) : "";
  const canExtend = Boolean(it.endsAt);

  const extendItems = [
    ...EXTEND_STEPS.map((secs) => {
      const at = ends ? new Date(Math.max(ends, now) + secs * 1000) : null;
      const sameDay = at && new Date(now).toDateString() === at.toDateString();
      return {
        id: `x${secs}`,
        icon: Plus,
        label: t("modDesk.board.extendBy", { duration: durationShort(secs, t) }),
        sub: at ? t("modDesk.board.endsAt", { at: sameDay ? new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(at) : formatAppDateTime(at.toISOString(), locale) }) : "",
        onSelect: () => onExtend(it, secs),
      };
    }),
    { id: "custom", icon: Clock, label: t("modDesk.board.extendCustom"), sub: t("modDesk.board.extendCustomSub"), onSelect: () => onCustom(it) },
    "sep",
    ...(it.type === "timeout" ? [{ id: "ban", icon: Ban, danger: true, label: t("modDesk.board.toBan"), sub: t("modDesk.board.toBanSub"), onSelect: () => onBan(it) }] : []),
    { id: "note", icon: Copy, label: t("modDesk.board.editNote"), sub: t("modDesk.board.editNoteSub"), onSelect: () => onNote(it) },
  ];
  const moreItems = [
    ...(it.type === "timeout" ? [{ id: "ban", icon: Ban, danger: true, label: t("modDesk.board.toBan"), sub: t("modDesk.board.toBanSub"), onSelect: () => onBan(it) }] : []),
    { id: "note", icon: Copy, label: t("modDesk.board.editNote"), sub: t("modDesk.board.editNoteSub"), onSelect: () => onNote(it) },
    { id: "person", icon: User, label: t("modDesk.board.openFile"), onSelect: () => onOpenPerson?.(it.user.id) },
  ];

  return (
    <article className="mdk-sc" aria-label={`@${it.user.username}`}>
      <div className="mdk-sc-h">
        <ModAvatar user={it.user} size={30} />
        <div className="mdk-sc-who">
          <b>@{it.user.username}</b>
          <small>
            {t(`modDesk.type.${it.type}`)} · {who}
            {tail ? ` · ${tail}` : ""}
          </small>
        </div>
        <span className={`mdk-cd tnum is-${tone}`}>{ends ? remainingText(left, t) : t("modDesk.permanent")}</span>
      </div>
      <div className="mdk-sc-chips">
        <Chip tone={it.type === "ban" ? "red" : "gold"}>{categoryText(it.category, t, meta?.categories)}</Chip>
        {it.appeal?.status === "pending" ? (
          <span className="mdk-apl">
            <AlertTriangle size={12} aria-hidden="true" />
            {t("modDesk.board.appealPending")}
          </span>
        ) : null}
        {it.appeal?.status === "rejected" ? (
          <span className="mdk-apl">
            <AlertTriangle size={12} aria-hidden="true" />
            {t("modDesk.board.appealRejected")}
          </span>
        ) : null}
      </div>
      <div className="mdk-pb">
        <i className={`is-${tone}`} style={{ width: `${Math.round(share * 100)}%` }} />
      </div>
      <div className="mdk-sc-f">
        <button type="button" className="mdk-btn is-xs" onClick={() => onLift(it)}>
          <RotateCcw size={14} aria-hidden="true" />
          {t("modDesk.board.lift")}
        </button>
        <button
          ref={plusRef}
          type="button"
          className={`mdk-ib${menu === "extend" ? " is-on" : ""}`}
          aria-label={t("modDesk.board.extend")}
          aria-haspopup="menu"
          aria-expanded={menu === "extend"}
          disabled={!canExtend}
          title={canExtend ? t("modDesk.board.extend") : t("modDesk.board.cantExtend")}
          onClick={() => setMenu((m) => (m === "extend" ? null : "extend"))}
        >
          <Plus size={14} aria-hidden="true" />
        </button>
        <button type="button" className="mdk-ib" aria-label={t("modDesk.board.openFile")} title={t("modDesk.board.openFile")} onClick={() => onOpenPerson?.(it.user.id)}>
          <User size={14} aria-hidden="true" />
        </button>
        <button
          ref={moreRef}
          type="button"
          className="mdk-ib is-end"
          aria-label={t("modDesk.board.more")}
          aria-haspopup="menu"
          aria-expanded={menu === "more"}
          onClick={() => setMenu((m) => (m === "more" ? null : "more"))}
        >
          <MoreHorizontal size={14} aria-hidden="true" />
        </button>
      </div>
      <DossierMenu open={menu === "extend"} anchorRef={plusRef} onClose={() => setMenu(null)} items={extendItems} label={t("modDesk.board.extend")} width={250} />
      <DossierMenu open={menu === "more"} anchorRef={moreRef} onClose={() => setMenu(null)} items={moreItems} label={t("modDesk.board.more")} width={250} />
    </article>
  );
}

export default function SanctionsBoard({ meta, epoch, onChanged, onToast, onLift, onBan, onOpenPerson }) {
  const { t, locale } = useLocale();
  const now = useNow(1000);
  const [items, setItems] = useState(null);
  const [err, setErr] = useState("");
  const [custom, setCustom] = useState(null);
  const [note, setNote] = useState(null);

  const load = useCallback(() => {
    adminFetch("/moderation/sanctions")
      .then((d) => {
        setItems(d?.items || []);
        setErr("");
      })
      .catch((e) => setErr(e?.message || t("modDesk.loadError")));
  }, [t]);
  useEffect(() => {
    load();
  }, [load, epoch]);

  // A countdown that reaches zero drops the card (the server clears it at the next sync).
  const live = useMemo(() => (items || []).filter((i) => !i.endsAt || Date.parse(i.endsAt) > now), [items, now]);
  const lanes = useMemo(() => groupLanes(live, now), [live, now]);

  const extend = async (it, seconds) => {
    try {
      const r = await adminFetch(`/moderation/sanctions/${it.user.id}/extend`, { method: "POST", body: JSON.stringify({ type: it.type, seconds }) });
      setItems((cur) => (cur || []).map((x) => (x.key === it.key ? { ...x, endsAt: r.until } : x)));
      onToast(t("modDesk.board.extended", { user: `@${it.user.username}`, duration: durationShort(seconds, t) }));
      onChanged();
    } catch (e) {
      onToast(e?.message || t("modDesk.actionFailed"), "red");
    }
  };

  return (
    <div className="mdk-board">
      {err ? (
        <div className="mdk-banner is-red" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>{err}</span>
          <button type="button" className="mdk-btn is-xs" onClick={load}>
            {t("modDesk.retry")}
          </button>
        </div>
      ) : null}
      <div className="mdk-lanes">
        {LANES.map((lane) => (
          <section key={lane.id} className="mdk-lane" aria-label={t(`modDesk.lane.${lane.id}`)}>
            <h4>
              <span className="mdk-dot" style={{ background: lane.dot }} aria-hidden="true" />
              {t(`modDesk.lane.${lane.id}`)}
              <em>{items == null ? "…" : lanes[lane.id].length}</em>
            </h4>
            {items == null ? (
              [0, 1].map((i) => <div key={i} className="mdk-sc is-skel"><i className="mdk-skel is-line" /><i className="mdk-skel is-line" /></div>)
            ) : lanes[lane.id].length === 0 ? (
              <p className="mdk-empty is-lane">{t(`modDesk.lane.empty.${lane.id}`)}</p>
            ) : (
              lanes[lane.id].map((it) => (
                <SanctionCard
                  key={it.key}
                  it={it}
                  lane={lane.id}
                  now={now}
                  t={t}
                  locale={locale}
                  meta={meta}
                  onLift={onLift}
                  onExtend={extend}
                  onCustom={setCustom}
                  onBan={(x) => onBan([x.user], { category: x.category, message: x.message || "" })}
                  onNote={setNote}
                  onOpenPerson={onOpenPerson}
                />
              ))
            )}
          </section>
        ))}
      </div>
      <CustomExtendDialog
        item={custom}
        onClose={() => setCustom(null)}
        onSubmit={async (secs) => {
          const it = custom;
          setCustom(null);
          await extend(it, secs);
        }}
      />
      <EditNoteDialog
        item={note}
        onClose={() => setNote(null)}
        onSaved={(msg) => {
          setNote(null);
          onToast(msg);
          load();
        }}
      />
    </div>
  );
}
