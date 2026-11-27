import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useT, useLocale } from "../../context/LocaleContext";
import { Avatar } from "../ui/Avatar";
import {
  Headphones,
  AtSign,
  Hash,
  Flame,
  Mail,
  Moon,
  Star,
  Search,
  X,
  Check,
  Plus,
  ChevronRight,
  BellOff,
  MicOff,
  Loader2,
  AlertTriangle,
  RefreshCw,
} from "../ui/Icon.jsx";
import { notifyCenter } from "../../api/reengage";
import { putPref } from "../../lib/notifyPrefs";
import { trGenitive } from "../../lib/trSuffix.js";
import {
  TYPE_KEYS,
  IMPORTANT_MAX,
  badgeOf,
  personLine,
  serverLine,
  sortPeople,
  filterBySearch,
  nextWindowText,
  quietLabel,
  digestLabel,
  applyPersonPatch,
  parseCenterState,
} from "./notifyCenterModel.js";
import { useModalFocusRef } from "../../hooks/useModalFocus.js";
import "../../styles/reengage.css";

/** The app name as iOS prints it on a notification (same in every language). */
const APP_LABEL = "DESCALL";

const TYPE_ICON = { friendVoice: Headphones, mentions: AtSign, unread: Hash, streak: Flame, digest: Mail };
const TYPE_TILE = { friendVoice: "var(--rg-green)", mentions: "var(--rg-blue)", unread: "var(--rg-teal)", streak: "var(--rg-orange)", digest: "var(--rg-violet)" };

/** On / off switch (draft toggles). */
export function RgSwitch({ value, onChange, label, disabled = false, small = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={Boolean(value)}
      aria-label={label}
      disabled={disabled}
      className={`rg-switch${value ? " on" : ""}${small ? " sm" : ""}`}
      onClick={() => !disabled && onChange(!value)}
    >
      <i />
    </button>
  );
}

/** Segmented choice ("Her zaman / Uzaktaysam / Hiç"). */
export function RgSegment({ value, options, onChange, label, disabled = false }) {
  return (
    <div className="rg-seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          className={value === o.id ? "on" : ""}
          disabled={disabled}
          onClick={() => value !== o.id && onChange(o.id)}
        >
          {o.icon ? <o.icon size={13} /> : null}
          {o.label}
        </button>
      ))}
    </div>
  );
}

function useWidth(ref) {
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver((entries) => setW(entries[0]?.contentRect?.width || 0));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

function PresenceDot({ presence }) {
  const cls = presence === "online" ? "on" : presence === "idle" ? "idle" : presence === "dnd" ? "dnd" : "off";
  return <i className={`rg-dot ${cls}`} aria-hidden="true" />;
}

function Face({ person, size = 34, ring = false }) {
  return (
    <span className={`rg-face${ring ? " ring" : ""}`} style={{ width: size, height: size }}>
      <Avatar size={size} name={person?.name} user={{ id: person?.id, username: person?.username, avatarUrl: person?.avatarUrl, display_name: person?.name }} animate="never" frame={false} />
      {person?.presence ? <PresenceDot presence={person.voice ? "online" : person.presence} /> : null}
    </span>
  );
}

function Badge({ kind, t }) {
  const label = kind === "always" ? t("rg3.center.badgeAlways") : kind === "muted" ? t("rg3.center.badgeMuted") : t("rg3.center.badgeDefault");
  return <span className={`rg-badge ${kind}`}>{label}</span>;
}

function ServerBadge({ level, t }) {
  const label = level === "mentions" ? t("rg3.center.levelMentions") : level === "muted" ? t("rg3.center.levelNone") : t("rg3.center.levelAll");
  return <span className={`rg-badge lvl-${level}`}>{label}</span>;
}

function ServerIcon({ server, size = 34 }) {
  const initials = String(server?.name || "?")
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toLocaleUpperCase("tr");
  return server?.iconUrl ? (
    <img className="rg-srv" src={server.iconUrl} alt="" width={size} height={size} style={{ width: size, height: size }} />
  ) : (
    <span className="rg-srv" style={{ width: size, height: size }}>
      {initials}
    </span>
  );
}

/* ---- live preview of the person's notification ---------------------------- */

export function PushPreview({ person, primary, t, locale, compact = false }) {
  const now = new Date();
  const date = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" }).format(now);
  const v = person?.voice;
  const title = t("rg3.preview.inVoice", { name: person?.name || "" });
  const where = v ? `${v.serverName || "Descall"} › ${v.channelName || t("rg3.preview.voiceChannel")}` : t("rg3.preview.sampleWhere");
  const others = v?.withNames?.length ? v.withNames.slice(0, 1).join(", ") : null;
  return (
    <div className={`rg-preview${compact ? " compact" : ""}`} aria-label={t("rg3.preview.aria", { name: person?.name || "" })}>
      <div className="rg-lock">
        <div className="rg-lock-date">{date}</div>
        <div className="rg-notif">
          <div className="rg-notif-h">
            <span className="rg-app" aria-hidden="true" />
            <span>{APP_LABEL}</span>
            <span className="rg-notif-time">{t("rg3.preview.now")}</span>
          </div>
          <div className="rg-notif-b">
            <Face person={{ ...person, presence: null }} size={34} ring />
            <div className="rg-notif-tx">
              <b>{title}</b>
              <small>{where}</small>
            </div>
          </div>
          <button type="button" className="rg-notif-cta" tabIndex={-1}>
            {primary === "quiet_join" ? <MicOff size={13} /> : <Headphones size={13} />}
            {primary === "quiet_join" ? t("rg3.preview.quietJoin") : t("rg3.preview.join")}
          </button>
        </div>
      </div>
      {!compact ? (
        <div className="rg-toast">
          <Face person={{ ...person, presence: null }} size={28} />
          <div>
            <b>{title}</b>
            <small>{others ? t("rg3.preview.withOthers", { where, others }) : where}</small>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ---- drawer: one person ---------------------------------------------------- */

function PersonDrawer({ person, settings, onPatch, busy, error, onClose, t, locale, sheet, timeZone }) {
  const [next, setNext] = useState(null);
  const p = person.prefs;
  useEffect(() => {
    let alive = true;
    setNext(null);
    notifyCenter
      .next(person.id)
      .then((r) => alive && setNext(r))
      .catch(() => alive && setNext(null));
    return () => {
      alive = false;
    };
  }, [person.id, p.important, p.voice, p.mutedUntil]);
  const since = person.friendSince ? new Intl.DateTimeFormat(locale, { month: "long", year: new Date(person.friendSince).getFullYear() === new Date().getFullYear() ? undefined : "numeric" }).format(new Date(person.friendSince)) : null;
  const muted = p.mutedUntil && Date.parse(p.mutedUntil) > Date.now();
  const voiceOn = p.voice !== "off";
  const mutedUntilText = muted ? new Intl.DateTimeFormat(locale, { weekday: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(p.mutedUntil)) : "";
  return (
    <section className={`rg-drawer${sheet ? " sheet" : ""}`} aria-label={t("rg3.drawer.aria", { name: person.name })}>
      <header className="rg-dhero">
        <Face person={person} size={sheet ? 58 : 64} ring={Boolean(person.voice)} />
        <div className="rg-dhero-tx">
          <b className="rg-dname">{person.name}</b>
          <small>
            {[`@${person.username}`, since ? t("rg3.drawer.friendSince", { when: since }) : null, person.mutualServers ? t("rg3.drawer.mutual", { count: person.mutualServers }) : null].filter(Boolean).join(" · ")}
          </small>
          <div className="rg-chips">
            {p.important ? (
              <span className="rg-chip gold">
                <Star size={12} /> {t("rg3.drawer.important")}
              </span>
            ) : null}
            {person.sharedStreak > 0 ? (
              <span className="rg-chip orange">
                <Flame size={12} /> {t("rg3.drawer.sharedStreak", { count: person.sharedStreak })}
              </span>
            ) : null}
            {muted ? (
              <span className="rg-chip red">
                <BellOff size={12} /> {t("rg3.drawer.mutedUntil", { when: mutedUntilText })}
              </span>
            ) : null}
          </div>
        </div>
        <div className="rg-dstat">
          <small>{t("rg3.drawer.thisMonth")}</small>
          <div>
            <b>{person.thisMonth?.called || 0}</b> <span>{t("rg3.drawer.calledYou")}</span>
          </div>
          <em>{t("rg3.drawer.joined", { count: person.thisMonth?.joined || 0 })}</em>
        </div>
        {onClose ? (
          <button type="button" className="rg-icon-btn rg-dclose" onClick={onClose} aria-label={t("rg3.common.close")}>
            <X size={16} />
          </button>
        ) : null}
      </header>
      <div className="rg-dbody">
        <div className="rg-dcol">
          <div className="rg-srow">
            <div className="tx">
              <b>{t("rg3.drawer.voiceTitle")}</b>
              <small>{p.important || p.voice === "always" ? t("rg3.drawer.voiceVip") : t("rg3.drawer.voiceDefault", { max: settings.voiceDailyMax })}</small>
            </div>
            <RgSwitch value={voiceOn} disabled={busy} label={t("rg3.drawer.voiceTitle")} onChange={(v) => onPatch({ voice: v ? (p.important ? "always" : "default") : "off" })} />
          </div>
          <div className="rg-srow stk">
            <div className="tx">
              <b>{t("rg3.drawer.msgTitle")}</b>
              <small>{t("rg3.drawer.msgSub")}</small>
            </div>
            <RgSegment
              label={t("rg3.drawer.msgTitle")}
              value={p.messages}
              disabled={busy}
              onChange={(v) => onPatch({ messages: v })}
              options={[
                { id: "always", label: t("rg3.drawer.msgAlways") },
                { id: "away", label: t("rg3.drawer.msgAway") },
                { id: "never", label: t("rg3.drawer.msgNever") },
              ]}
            />
          </div>
          <div className="rg-srow">
            <div className="tx">
              <b>{t("rg3.drawer.breakQuiet")}</b>
              <small>{settings.quietMessages ? t("rg3.drawer.breakQuietSub") : t("rg3.drawer.breakQuietOff")}</small>
            </div>
            <RgSwitch value={p.breakQuiet} disabled={busy} label={t("rg3.drawer.breakQuiet")} onChange={(v) => onPatch({ breakQuiet: v })} />
          </div>
          <div className="rg-srow">
            <div className="tx">
              <b>{t("rg3.drawer.nudges")}</b>
              <small>{t("rg3.drawer.nudgesSub", { name: person.name })}</small>
            </div>
            <RgSwitch value={p.nudges} disabled={busy} label={t("rg3.drawer.nudges")} onChange={(v) => onPatch({ nudges: v })} />
          </div>
          <div className="rg-srow stk">
            <div className="tx">
              <b>{t("rg3.drawer.primary")}</b>
              <small>{t("rg3.drawer.primarySub")}</small>
            </div>
            <RgSegment
              label={t("rg3.drawer.primary")}
              value={p.primaryAction}
              disabled={busy}
              onChange={(v) => onPatch({ primaryAction: v })}
              options={[
                { id: "join", label: t("rg3.preview.join") },
                { id: "quiet_join", label: t("rg3.preview.quietJoin") },
              ]}
            />
          </div>
          <div className="rg-srow stk">
            <div className="tx">
              <b>{t("rg3.drawer.mute")}</b>
            </div>
            <div className="rg-mute">
              {muted ? (
                <button type="button" className="rg-pillbtn" disabled={busy} onClick={() => onPatch({ mute: "off" })}>
                  <Check size={13} /> {t("rg3.drawer.unmute")}
                </button>
              ) : (
                ["1h", "8h", "1w"].map((m) => (
                  <button key={m} type="button" className="rg-pillbtn" disabled={busy} onClick={() => onPatch({ mute: m })}>
                    {m === "1h" ? <BellOff size={13} /> : null}
                    {t(`rg3.drawer.mute_${m}`)}
                  </button>
                ))
              )}
            </div>
          </div>
          <div className="rg-dfoot">
            {p.important ? (
              <button type="button" className="rg-btn danger-soft" disabled={busy} onClick={() => onPatch({ important: false, voice: p.voice === "always" ? "default" : p.voice })}>
                {t("rg3.drawer.removeImportant")}
              </button>
            ) : (
              <button type="button" className="rg-btn gold" disabled={busy} onClick={() => onPatch({ important: true })}>
                <Star size={14} /> {t("rg3.drawer.addImportant")}
              </button>
            )}
            {busy ? <Loader2 size={14} className="rg-spin" aria-label={t("rg3.common.saving")} /> : null}
          </div>
          {error ? (
            <p className="rg-err" role="alert">
              <AlertTriangle size={13} /> {error}
            </p>
          ) : null}
        </div>
        <div className="rg-dcol rg-live">
          <div className="rg-live-h">
            <b>{t("rg3.drawer.liveTitle", { name: String(locale || "").startsWith("tr") ? trGenitive(person.name) || person.name : person.name })}</b>
            <i className="rg-livedot" aria-hidden="true" />
            <span>{t("rg3.drawer.live")}</span>
          </div>
          <PushPreview person={person} primary={p.primaryAction} t={t} locale={locale} />
          <p className="rg-foot">{next ? nextWindowText(next, person, t, locale, Date.now(), timeZone) : t("rg3.drawer.nextLoading")}</p>
        </div>
      </div>
    </section>
  );
}

/* ---- drawer: one server ---------------------------------------------------- */

function ServerDrawer({ server, onLevel, busy, error, onClose, t, sheet }) {
  return (
    <section className={`rg-drawer srv${sheet ? " sheet" : ""}`} aria-label={server.name}>
      <header className="rg-dhero srv">
        <ServerIcon server={server} size={56} />
        <div className="rg-dhero-tx">
          <b className="rg-dname">{server.name}</b>
          <small>{serverLine(server, t)}</small>
        </div>
        {onClose ? (
          <button type="button" className="rg-icon-btn rg-dclose" onClick={onClose} aria-label={t("rg3.common.close")}>
            <X size={16} />
          </button>
        ) : null}
      </header>
      <div className="rg-dbody one">
        <div className="rg-dcol">
          <div className="rg-srow stk">
            <div className="tx">
              <b>{t("rg3.server.levelTitle")}</b>
              <small>{t("rg3.server.levelSub")}</small>
            </div>
            <RgSegment
              label={t("rg3.server.levelTitle")}
              value={server.level}
              disabled={busy}
              onChange={onLevel}
              options={[
                { id: "all", label: t("rg3.center.levelAll") },
                { id: "mentions", label: t("rg3.center.levelMentions") },
                { id: "muted", label: t("rg3.center.levelNone") },
              ]}
            />
          </div>
          <div className="rg-srow">
            <div className="tx">
              <b>{t("rg3.server.importantHere", { count: server.importantHere })}</b>
              <small>{t("rg3.server.importantHereSub")}</small>
            </div>
          </div>
          {server.messagesThisWeek != null ? (
            <div className="rg-srow">
              <div className="tx">
                <b>{t("rg3.server.messagesWeek", { count: server.messagesThisWeek })}</b>
                <small>{server.level === "all" ? t("rg3.server.unreadOn") : t("rg3.server.unreadOff")}</small>
              </div>
            </div>
          ) : null}
          {error ? (
            <p className="rg-err" role="alert">
              <AlertTriangle size={13} /> {error}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/* ---- the center ----------------------------------------------------------- */

function TypeCard({ id, on, onToggle, sub, t, busy }) {
  const Icon = TYPE_ICON[id];
  return (
    <div className={`rg-type${on ? " on" : ""}`}>
      <div className="t">
        <Icon size={14} style={{ color: TYPE_TILE[id] }} />
        <span>{t(`rg3.types.${id}`)}</span>
        <RgSwitch small value={on} disabled={busy} label={t(`rg3.types.${id}`)} onChange={onToggle} />
      </div>
      <small>{sub}</small>
    </div>
  );
}

function QuietPopover({ settings, onSave, onClose, t, anchor }) {
  const [start, setStart] = useState(settings.quietStart);
  const [end, setEnd] = useState(settings.quietEnd);
  const [msgs, setMsgs] = useState(settings.quietMessages);
  const [max, setMax] = useState(settings.voiceDailyMax);
  const [day, setDay] = useState(settings.digestDay);
  const [hour, setHour] = useState(settings.digestHour);
  const ref = useRef(null);
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && !anchor?.contains?.(e.target) && onClose();
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [onClose, anchor]);
  const hours = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
  const pad = (n) => `${String(n).padStart(2, "0")}:00`;
  return (
    <div className="rg-pop" ref={ref} role="dialog" aria-label={t("rg3.limits.title")}>
      <b className="rg-pop-h">{t("rg3.limits.quietTitle")}</b>
      <p className="rg-pop-sub">{t("rg3.limits.quietRule")}</p>
      <div className="rg-pop-row">
        <label>
          {t("rg3.limits.from")}
          <select value={start} onChange={(e) => setStart(Number(e.target.value))}>
            {hours(18, 23).map((h) => (
              <option key={h} value={h}>
                {pad(h)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("rg3.limits.to")}
          <select value={end} onChange={(e) => setEnd(Number(e.target.value))}>
            {hours(9, 12).map((h) => (
              <option key={h} value={h}>
                {pad(h)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="rg-srow">
        <div className="tx">
          <b>{t("rg3.limits.quietMessages")}</b>
          <small>{t("rg3.limits.quietMessagesSub")}</small>
        </div>
        <RgSwitch value={msgs} onChange={setMsgs} label={t("rg3.limits.quietMessages")} />
      </div>
      <b className="rg-pop-h">{t("rg3.limits.voiceMax")}</b>
      <RgSegment value={String(max)} onChange={(v) => setMax(Number(v))} label={t("rg3.limits.voiceMax")} options={[1, 2, 3].map((n) => ({ id: String(n), label: String(n) }))} />
      <b className="rg-pop-h">{t("rg3.limits.digest")}</b>
      <div className="rg-pop-row">
        <label>
          {t("rg3.limits.day")}
          <select value={day} onChange={(e) => setDay(Number(e.target.value))}>
            {[0, 1, 2, 3, 4, 5, 6].map((d) => (
              <option key={d} value={d}>
                {t(`rg3.days.d${d}`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("rg3.limits.hour")}
          <select value={hour} onChange={(e) => setHour(Number(e.target.value))}>
            {hours(9, 21).map((h) => (
              <option key={h} value={h}>
                {pad(h)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="rg-pop-actions">
        <button type="button" className="rg-btn ghost" onClick={onClose}>
          {t("rg3.common.cancel")}
        </button>
        <button
          type="button"
          className="rg-btn primary"
          onClick={() => onSave({ quietStart: start, quietEnd: end, quietMessages: msgs, voiceDailyMax: max, digestDay: day, digestHour: hour })}
        >
          {t("rg3.common.save")}
        </button>
      </div>
    </div>
  );
}

function ImportantPicker({ people, onPick, onClose, t }) {
  const [q, setQ] = useState("");
  const trapRef = useModalFocusRef();
  const list = filterBySearch(people.filter((p) => !p.prefs.important && p.friend), q);
  return createPortal(
    <div ref={trapRef} className="rg-sheet-wrap" role="dialog" aria-modal="true" aria-label={t("rg3.phone.addImportant")} onClick={(e) => e.target === e.currentTarget && onClose()} onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <div className="rg-sheet">
        <div className="rg-sheet-grab" aria-hidden="true" />
        <div className="rg-sheet-h">
          <b>{t("rg3.phone.addImportant")}</b>
          <button type="button" className="rg-icon-btn" onClick={onClose} aria-label={t("rg3.common.close")}>
            <X size={16} />
          </button>
        </div>
        <label className="rg-search">
          <Search size={14} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("rg3.center.search")} aria-label={t("rg3.center.search")} />
        </label>
        <div className="rg-sheet-list">
          {list.length ? (
            list.map((p) => (
              <button key={p.id} type="button" className="rg-prow" onClick={() => onPick(p)}>
                <Face person={p} size={34} />
                <span className="tx">
                  <b>{p.name}</b>
                  <small>{personLine(p, t)}</small>
                </span>
                <Plus size={16} />
              </button>
            ))
          ) : (
            <p className="rg-empty">{t("rg3.center.noMatch")}</p>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function NotifyCenter({ deviceSection = null }) {
  const t = useT();
  const { locale } = useLocale();
  const hostRef = useRef(null);
  const width = useWidth(hostRef);
  const phone = width > 0 && width < 720;
  const [state, setState] = useState(null);
  const [load, setLoad] = useState("loading");
  const [nonce, setNonce] = useState(0);
  const [sel, setSel] = useState(null); // { kind: "person"|"server", id }
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");
  const [pop, setPop] = useState(false);
  const [picker, setPicker] = useState(false);
  const popAnchor = useRef(null);
  const sheetRef = useModalFocusRef();

  useEffect(() => {
    let alive = true;
    setLoad((l) => (l === "ready" ? "ready" : "loading"));
    notifyCenter
      .state()
      .then((raw) => {
        if (!alive) return;
        const s = parseCenterState(raw);
        if (!s) {
          setLoad("failed");
          return;
        }
        setState(s);
        setLoad(s.ready === false ? "not_ready" : "ready");
      })
      .catch(() => alive && setLoad("failed"));
    return () => {
      alive = false;
    };
  }, [nonce]);

  // Another device changed something: read again.
  useEffect(() => {
    const on = () => setNonce((n) => n + 1);
    window.addEventListener("descall:notify-center-changed", on);
    return () => window.removeEventListener("descall:notify-center-changed", on);
  }, []);

  const people = useMemo(() => sortPeople(state?.people || []), [state]);
  const important = people.filter((p) => p.prefs.important);
  const others = people.filter((p) => !p.prefs.important && p.friend);
  const servers = state?.servers || [];
  const filteredImportant = filterBySearch(important, q);
  const filteredOthers = filterBySearch(others, q);
  const filteredServers = filterBySearch(servers, q);

  // Desktop: something is always selected (the first important person, else the first friend).
  useEffect(() => {
    if (phone || sel || !people.length) return;
    const first = important[0] || others[0];
    if (first) setSel({ kind: "person", id: first.id });
  }, [phone, sel, people, important, others]);

  const selected = sel?.kind === "person" ? people.find((p) => p.id === sel.id) : sel?.kind === "server" ? servers.find((s) => s.id === sel.id) : null;

  const errText = useCallback(
    (e) => {
      const code = e?.code || e?.data?.error || e?.message;
      if (code === "important_full" || /important_full/.test(String(e?.message))) return t("rg3.errors.importantFull", { max: IMPORTANT_MAX });
      if (e?.status === 503 || code === "not_ready") return t("rg3.errors.notReady");
      return t("rg3.errors.save");
    },
    [t]
  );

  const patchPerson = async (person, patch) => {
    setBusy(person.id);
    setError("");
    const prev = state;
    // Optimistic: the list badge and drawer move at once; the server answer confirms.
    setState((s) => ({ ...s, people: s.people.map((p) => (p.id === person.id ? applyPersonPatch(p, patch) : p)), importantCount: s.importantCount + (patch.important === true ? 1 : patch.important === false ? -1 : 0) }));
    try {
      const r = await notifyCenter.savePerson(person.id, patch);
      if (r?.dmPref) putPref(r.dmPref);
      setState((s) => ({ ...s, people: s.people.map((p) => (p.id === person.id ? { ...p, prefs: r.person, badge: r.badge } : p)) }));
    } catch (e) {
      setState(prev);
      setError(errText(e));
    } finally {
      setBusy(null);
    }
  };

  const saveSettings = async (patch) => {
    setBusy("settings");
    setError("");
    const prev = state;
    setState((s) => ({ ...s, settings: { ...s.settings, ...patch, types: { ...s.settings.types, ...(patch.types || {}) } } }));
    try {
      const r = await notifyCenter.saveSettings(patch);
      setState((s) => ({ ...s, settings: r.settings }));
      setPop(false);
    } catch (e) {
      setState(prev);
      setError(errText(e));
    } finally {
      setBusy(null);
    }
  };

  const setServerLevel = async (server, level) => {
    setBusy(server.id);
    setError("");
    const prev = state;
    setState((s) => ({ ...s, servers: s.servers.map((x) => (x.id === server.id ? { ...x, level } : x)) }));
    try {
      await notifyCenter.serverLevel(server.id, level);
    } catch (e) {
      setState(prev);
      setError(errText(e));
    } finally {
      setBusy(null);
    }
  };

  if (load === "loading" && !state) {
    return (
      <div className="rg-center rg-loading" ref={hostRef} aria-busy="true">
        <div className="rg-skel types" />
        <div className="rg-skel split" />
      </div>
    );
  }
  if (load === "failed" && !state) {
    return (
      <div className="rg-center" ref={hostRef}>
        <div className="rg-state-card" role="alert">
          <AlertTriangle size={18} />
          <div>
            <b>{t("rg3.errors.loadTitle")}</b>
            <small>{t("rg3.errors.loadBody")}</small>
          </div>
          <button type="button" className="rg-btn" onClick={() => setNonce((n) => n + 1)}>
            <RefreshCw size={14} /> {t("rg3.common.retry")}
          </button>
        </div>
        {deviceSection}
      </div>
    );
  }
  const s = state.settings;
  const typeSub = {
    friendVoice: t("rg3.types.friendVoiceSub"),
    mentions: t("rg3.types.mentionsSub"),
    unread: t("rg3.types.unreadSub"),
    streak: t("rg3.types.streakSub"),
    digest: digestLabel(s, t),
  };
  const notReady = load === "not_ready";

  const header = (
    <div className="rg-head">
      <div>
        <p className="rg-lead">{t("rg3.center.lead")}</p>
      </div>
      <div className="rg-head-pills">
        <button type="button" ref={popAnchor} className="rg-pill" onClick={() => setPop((v) => !v)} aria-expanded={pop}>
          <Moon size={13} /> {quietLabel(s, t)}
        </button>
        <button type="button" className="rg-pill" onClick={() => setPop((v) => !v)}>
          <Headphones size={13} /> {t("rg3.center.voiceMaxPill", { count: s.voiceDailyMax })}
        </button>
        {pop ? <QuietPopover settings={s} anchor={popAnchor.current} onClose={() => setPop(false)} onSave={saveSettings} t={t} /> : null}
      </div>
    </div>
  );

  const banner = notReady ? (
    <div className="rg-state-card warn" role="status">
      <AlertTriangle size={16} />
      <div>
        <b>{t("rg3.errors.notReadyTitle")}</b>
        <small>{t("rg3.errors.notReady")}</small>
      </div>
    </div>
  ) : null;

  const personRow = (p) => (
    <button
      key={p.id}
      type="button"
      className={`rg-prow${sel?.kind === "person" && sel.id === p.id ? " on" : ""}`}
      onClick={() => setSel({ kind: "person", id: p.id })}
      aria-pressed={sel?.kind === "person" && sel.id === p.id}
    >
      <Face person={p} size={phone ? 38 : 32} />
      <span className="tx">
        <b>{p.name}</b>
        <small>{personLine(p, t, locale)}</small>
      </span>
      <Badge kind={badgeOf(p)} t={t} />
    </button>
  );
  const serverRow = (x) => (
    <button key={x.id} type="button" className={`rg-prow${sel?.kind === "server" && sel.id === x.id ? " on" : ""}`} onClick={() => setSel({ kind: "server", id: x.id })}>
      <ServerIcon server={x} size={phone ? 38 : 32} />
      <span className="tx">
        <b>{x.name}</b>
        <small>{serverLine(x, t)}</small>
      </span>
      <ServerBadge level={x.level} t={t} />
    </button>
  );

  const drawer =
    selected && sel.kind === "person" ? (
      <PersonDrawer
        key={selected.id}
        person={selected}
        settings={s}
        busy={busy === selected.id}
        error={error}
        onPatch={(patch) => patchPerson(selected, patch)}
        onClose={phone ? () => setSel(null) : null}
        t={t}
        locale={locale}
        sheet={phone}
        timeZone={state.timezone || undefined}
      />
    ) : selected && sel.kind === "server" ? (
      <ServerDrawer key={selected.id} server={selected} busy={busy === selected.id} error={error} onLevel={(lvl) => setServerLevel(selected, lvl)} onClose={phone ? () => setSel(null) : null} t={t} sheet={phone} />
    ) : null;

  if (phone) {
    return (
      <div className="rg-center phone" ref={hostRef}>
        {banner}
        <p className="rg-lead">{t("rg3.center.lead")}</p>
        <h4 className="rg-ios-h">{t("rg3.phone.important", { count: important.length, max: IMPORTANT_MAX })}</h4>
        <div className="rg-ios-g rg-faces">
          {important.map((p) => (
            <button key={p.id} type="button" onClick={() => setSel({ kind: "person", id: p.id })}>
              <Face person={p} size={46} ring={Boolean(p.voice)} />
              <span>{p.name}</span>
            </button>
          ))}
          {important.length < IMPORTANT_MAX ? (
            <button type="button" className="add" onClick={() => setPicker(true)}>
              <span className="rg-add">
                <Plus size={18} />
              </span>
              <span>{t("rg3.phone.add")}</span>
            </button>
          ) : null}
        </div>
        <h4 className="rg-ios-h">{t("rg3.phone.types")}</h4>
        <div className="rg-ios-g">
          {TYPE_KEYS.map((k) => {
            const Icon = TYPE_ICON[k];
            return (
              <div key={k} className="rg-ios-r">
                <span className="ti" style={{ background: TYPE_TILE[k] }}>
                  <Icon size={15} />
                </span>
                <span className="tx">
                  {t(`rg3.types.${k}`)}
                  {k === "unread" || k === "digest" ? <small>{typeSub[k]}</small> : null}
                </span>
                <RgSwitch value={s.types[k]} disabled={busy === "settings"} label={t(`rg3.types.${k}`)} onChange={(v) => saveSettings({ types: { [k]: v } })} />
              </div>
            );
          })}
        </div>
        <h4 className="rg-ios-h">{t("rg3.phone.limits")}</h4>
        <div className="rg-ios-g">
          <button type="button" className="rg-ios-r" onClick={() => setPop(true)}>
            <span className="ti" style={{ background: "var(--rg-indigo)" }}>
              <Moon size={15} />
            </span>
            <span className="tx">{t("rg3.phone.quiet")}</span>
            <span className="vv">
              {quietLabel(s, t, true)} <ChevronRight size={14} />
            </span>
          </button>
          <button type="button" className="rg-ios-r" onClick={() => setPop(true)}>
            <span className="ti" style={{ background: "var(--rg-gray)" }}>
              <Headphones size={15} />
            </span>
            <span className="tx">{t("rg3.phone.voiceMax")}</span>
            <span className="vv">
              {s.voiceDailyMax} <ChevronRight size={14} />
            </span>
          </button>
        </div>
        {pop ? <QuietPopover settings={s} onClose={() => setPop(false)} onSave={saveSettings} t={t} /> : null}
        <label className="rg-search">
          <Search size={14} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("rg3.center.search")} aria-label={t("rg3.center.search")} />
        </label>
        <h4 className="rg-ios-h">{t("rg3.center.friends", { count: filteredOthers.length })}</h4>
        <div className="rg-ios-g rg-list">{filteredOthers.length ? filteredOthers.map(personRow) : <p className="rg-empty">{t("rg3.center.noFriends")}</p>}</div>
        <h4 className="rg-ios-h">{t("rg3.center.servers", { count: filteredServers.length })}</h4>
        <div className="rg-ios-g rg-list">{filteredServers.length ? filteredServers.map(serverRow) : <p className="rg-empty">{t("rg3.center.noServers")}</p>}</div>
        {error && !selected ? (
          <p className="rg-err" role="alert">
            <AlertTriangle size={13} /> {error}
          </p>
        ) : null}
        {deviceSection}
        {picker ? (
          <ImportantPicker
            people={people}
            t={t}
            onClose={() => setPicker(false)}
            onPick={(p) => {
              setPicker(false);
              patchPerson(p, { important: true });
            }}
          />
        ) : null}
        {selected
          ? createPortal(
              <div ref={sheetRef} className="rg-sheet-wrap" role="dialog" aria-modal="true" aria-label={selected.name} onClick={(e) => e.target === e.currentTarget && setSel(null)} onKeyDown={(e) => e.key === "Escape" && setSel(null)}>
                <div className="rg-sheet tall">
                  <div className="rg-sheet-grab" aria-hidden="true" />
                  {drawer}
                </div>
              </div>,
              document.body
            )
          : null}
      </div>
    );
  }

  return (
    <div className="rg-center" ref={hostRef}>
      {banner}
      {header}
      <div className="rg-types">
        {TYPE_KEYS.map((k) => (
          <TypeCard key={k} id={k} on={s.types[k]} sub={typeSub[k]} t={t} busy={busy === "settings"} onToggle={(v) => saveSettings({ types: { [k]: v } })} />
        ))}
      </div>
      <div className="rg-split">
        <div className="rg-plist" role="list">
          <label className="rg-search">
            <Search size={14} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("rg3.center.search")} aria-label={t("rg3.center.search")} />
          </label>
          <div className="rg-scroll">
            <div className="rg-grp">
              <Star size={12} /> {t("rg3.center.important")}
              <span>
                {important.length} / {IMPORTANT_MAX}
              </span>
            </div>
            {filteredImportant.length ? filteredImportant.map(personRow) : <p className="rg-empty sm">{q ? t("rg3.center.noMatch") : t("rg3.center.importantEmpty")}</p>}
            <div className="rg-grp">
              {t("rg3.center.friendsShort")}
              <span>{others.length}</span>
            </div>
            {filteredOthers.length ? filteredOthers.map(personRow) : <p className="rg-empty sm">{q ? t("rg3.center.noMatch") : t("rg3.center.noFriends")}</p>}
            <div className="rg-grp">
              {t("rg3.center.serversShort")}
              <span>{servers.length}</span>
            </div>
            {filteredServers.length ? filteredServers.map(serverRow) : <p className="rg-empty sm">{q ? t("rg3.center.noMatch") : t("rg3.center.noServers")}</p>}
          </div>
        </div>
        {drawer || (
          <div className="rg-drawer empty">
            <p className="rg-empty">{t("rg3.center.pick")}</p>
          </div>
        )}
      </div>
      {error && !selected ? (
        <p className="rg-err" role="alert">
          <AlertTriangle size={13} /> {error}
        </p>
      ) : null}
      {deviceSection}
    </div>
  );
}
