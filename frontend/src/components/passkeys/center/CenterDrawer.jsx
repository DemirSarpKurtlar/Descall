/**
 * The control center's side panel (draft A): the selected passkey with in-place rename,
 * details, 30-day bars and removal that asks for a reason and a confirmation; the "added"
 * card (name ideas, undo); the full activity list.
 */
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Cloud, Info, Pencil, Shield, Trash2, Undo2, X } from "../../ui/Icon.jsx";
import { useT, useLocale } from "../../../context/LocaleContext";
import { passkeyKind, usageBars, nameSuggestions } from "../../../lib/passkeys/visual.js";
import GlassCheckbox from "../../ui/GlassCheckbox.jsx";
import { KindTile, Spark } from "./bits.jsx";
import { fullDate, relativeUse, placeName, syncText, providerText, viaText, shortWhen } from "./centerFormat.js";

export const REMOVE_REASONS = ["lost", "unused", "readd", "other"];

function Pills({ p, current, t }) {
  const kind = passkeyKind(p);
  return (
    <div className="pkc-pills">
      {current ? <em className="pkc-pill brand">{t("passkey.center.pill.thisDevice")}</em> : null}
      {p.suspended ? (
        <em className="pkc-pill err">{t("passkey.center.pill.off")}</em>
      ) : (
        <em className="pkc-pill ok">
          <Shield size={11} /> {t("passkey.center.pill.counts2fa")}
        </em>
      )}
      {kind === "key" ? (
        <em className="pkc-pill">{t("passkey.center.pill.noSync")}</em>
      ) : p.synced ? (
        <em className="pkc-pill teal">
          <Cloud size={11} /> {t("passkey.center.pill.synced")}
        </em>
      ) : (
        <em className="pkc-pill">{t("passkey.center.pill.localOnly")}</em>
      )}
    </div>
  );
}

export function PasskeyDetail({ p, current, offline, busy, onRename, onRemove }) {
  const t = useT();
  const { locale } = useLocale();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(p.name);
  const [confirm, setConfirm] = useState(false);
  const [reason, setReason] = useState("");
  const [endSessions, setEndSessions] = useState(true);
  const inputRef = useRef(null);

  useEffect(() => {
    setEditing(false);
    setConfirm(false);
    setReason("");
    setEndSessions(true);
    setValue(p.name);
  }, [p.id, p.name]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const kind = passkeyKind(p);
  const bars = usageBars(p.uses30 || []);
  const total30 = bars.reduce((a, b) => a + b, 0);
  const save = async () => {
    const v = value.trim();
    if (!v || v === p.name) {
      setEditing(false);
      setValue(p.name);
      return;
    }
    const ok = await onRename?.(p, v);
    if (ok !== false) setEditing(false);
  };

  return (
    <div className="pkc-detail">
      <div className="pkc-detail-head">
        <KindTile kind={kind} size={46} />
        <div className="grow min0">
          {editing ? (
            <input
              ref={inputRef}
              className="pkc-name-input"
              value={value}
              maxLength={64}
              aria-label={t("passkey.settings.nameLabel")}
              onChange={(e) => setValue(e.target.value)}
              onBlur={save}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
                if (e.key === "Escape") {
                  setValue(p.name);
                  setEditing(false);
                }
              }}
            />
          ) : (
            <button type="button" className="pkc-name-btn" onClick={() => !offline && setEditing(true)} title={t("passkey.center.drawer.rename")} disabled={offline}>
              <b>{p.name}</b>
              <Pencil size={13} className="muted" />
            </button>
          )}
          <div className="pkc-small muted">{providerText(p, t)}</div>
        </div>
      </div>
      <Pills p={p} current={current} t={t} />
      <dl className="pkc-mgrid">
        <dt>{t("passkey.center.drawer.sync")}</dt>
        <dd>{syncText(p, t)}</dd>
        <dt>{t("passkey.center.drawer.created")}</dt>
        <dd>{fullDate(p.createdAt, locale)}</dd>
        <dt>{t("passkey.center.drawer.where")}</dt>
        <dd>{viaText(p, t)}</dd>
        <dt>{t("passkey.center.drawer.lastUsed")}</dt>
        <dd>{relativeUse(p.lastUsedAt, t, locale)}</dd>
        <dt>{t("passkey.center.drawer.place")}</dt>
        <dd>{placeName(p.lastCity, p.lastCountry, locale) || placeName(p.createdCity, p.createdCountry, locale) || t("passkey.center.drawer.placeUnknown")}</dd>
        <dt>{t("passkey.center.drawer.total")}</dt>
        <dd className="tnum">{p.useCount || 0}</dd>
      </dl>
      <div className="pkc-sep" />
      <div className="pkc-small muted pkc-row between">
        <span>{t("passkey.center.drawer.last30")}</span>
        <span className="tnum">{t("passkey.center.drawer.count30", { count: total30 })}</span>
      </div>
      <Spark values={bars} width={248} height={36} stretch label={t("passkey.center.drawer.count30", { count: total30 })} />
      {p.suspended ? (
        <div className="pkc-ibox err">
          <AlertTriangle size={15} />
          <span>{t("passkey.settings.suspended")}</span>
        </div>
      ) : null}
      {confirm ? (
        <div className="pkc-confirm solid" role="group" aria-label={t("passkey.center.remove.title", { name: p.name })}>
          <b>{t("passkey.center.remove.title", { name: p.name })}</b>
          <p className="pkc-small muted">{t("passkey.center.remove.lead")}</p>
          {current ? <p className="pkc-small warn-t">{t("passkey.center.remove.current")}</p> : null}
          <div className="pkc-small strong">{t("passkey.center.remove.reason")}</div>
          <div className="pkc-rchips" role="radiogroup" aria-label={t("passkey.center.remove.reason")}>
            {REMOVE_REASONS.map((r) => (
              <button key={r} type="button" role="radio" aria-checked={reason === r} className={`pkc-rchip${reason === r ? " on" : ""}`} onClick={() => setReason(r)}>
                {t(`passkey.center.remove.reasons.${r}`)}
              </button>
            ))}
          </div>
          <label className="pkc-cbx">
            <GlassCheckbox checked={endSessions} onChange={(e) => setEndSessions(e.target.checked)} />
            <span>{t("passkey.center.remove.endSessions")}</span>
          </label>
          <div className="pkc-row">
            <button type="button" className="pkc-btn sm ghost grow" onClick={() => setConfirm(false)}>
              {t("passkey.settings.cancel")}
            </button>
            <button type="button" className="pkc-btn sm dangerf grow2" disabled={!reason || busy || offline} onClick={() => onRemove?.(p, { reason, endSessions })}>
              <Trash2 size={14} /> {t("passkey.settings.remove")}
            </button>
          </div>
        </div>
      ) : (
        <>
          {p.suspended ? null : (
            <div className="pkc-ibox">
              <Info size={15} />
              <span>{t("passkey.center.drawer.info")}</span>
            </div>
          )}
          <div className="pkc-row">
            <button type="button" className="pkc-btn sm grow" onClick={() => setEditing(true)} disabled={offline}>
              <Pencil size={14} /> {t("passkey.center.drawer.rename")}
            </button>
            <button type="button" className="pkc-btn sm danger grow" onClick={() => setConfirm(true)} disabled={offline}>
              <Trash2 size={14} /> {t("passkey.settings.remove")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** Right after adding: the name with ideas, undo, save (draft A, "Ekleme sonrası"). */
export function AddedCard({ p, busy, onSave, onUndo }) {
  const t = useT();
  const kind = passkeyKind(p);
  const [value, setValue] = useState(p.name);
  const inputRef = useRef(null);
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);
  return (
    <div className="pkc-added solid">
      <div className="pkc-row">
        <span className="pkc-bigic g" style={{ width: 40, height: 40 }}>
          <Check size={20} weight="bold" />
        </span>
        <div className="grow min0">
          <b>{t("passkey.center.added.title")}</b>
          <div className="pkc-small muted">{t("passkey.center.added.sub", { provider: providerText(p, t) })}</div>
        </div>
      </div>
      <label className="pkc-small strong" htmlFor="pkc-added-name">
        {t("passkey.center.added.name")}
      </label>
      <input
        id="pkc-added-name"
        ref={inputRef}
        className="pkc-input"
        value={value}
        maxLength={64}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onSave?.(p, value.trim())}
      />
      <div className="pkc-rchips">
        {nameSuggestions(kind).map((k) => {
          const label = t(`passkey.center.names.${k}`);
          return (
            <button key={k} type="button" className={`pkc-rchip${value === label ? " on" : ""}`} onClick={() => setValue(label)}>
              {label}
            </button>
          );
        })}
      </div>
      <div className="pkc-row">
        <button type="button" className="pkc-btn sm ghost" onClick={() => onUndo?.(p)} disabled={busy}>
          <Undo2 size={14} /> {t("passkey.center.added.undo")}
        </button>
        <button type="button" className="pkc-btn sm pri push" onClick={() => onSave?.(p, value.trim())} disabled={busy || !value.trim()}>
          {t("passkey.settings.save")}
        </button>
      </div>
    </div>
  );
}

const DOT = { signin: "g", added: "", renamed: "", removed: "r", new_place: "y", report_confirmed: "g", report_revoked: "r", suspended: "r" };

export function eventLine(e, t) {
  return t(`passkey.center.activity.${e.kind}`, { name: e.name || "Passkey" });
}

export function ActivityList({ events = [], onClose }) {
  const t = useT();
  const { locale } = useLocale();
  return (
    <div className="pkc-activity-full">
      <div className="pkc-row between">
        <b>{t("passkey.center.activity.title")}</b>
        <button type="button" className="pkc-icon-btn" onClick={onClose} aria-label={t("passkey.settings.cancel")}>
          <X size={16} />
        </button>
      </div>
      {events.length ? (
        <ol className="pkc-tl">
          {events.map((e) => (
            <li key={e.id} className="ev">
              <span className={`dot ${DOT[e.kind] || ""}`} aria-hidden="true" />
              <div>
                {eventLine(e, t)}
                <span>{[placeName(e.city, e.country, locale), e.device].filter(Boolean).join(" · ")}</span>
              </div>
              <em>{shortWhen(e.at, t, locale)}</em>
            </li>
          ))}
        </ol>
      ) : (
        <p className="pkc-small muted">{t("passkey.center.activity.empty")}</p>
      )}
    </div>
  );
}
