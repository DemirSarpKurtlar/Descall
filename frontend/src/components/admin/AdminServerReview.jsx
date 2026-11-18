import { useModalFocusRef } from "../../hooks/useModalFocus";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  EyeOff,
  Eye,
  Flag,
  Globe,
  Hash,
  Link2,
  Lock,
  Mic,
  Paperclip,
  Pin,
  RefreshCw,
  ScrollText,
  Search,
  Server,
  Shield,
  Trash2,
  Users,
  Volume2,
  X,
} from "../ui/Icon.jsx";
import { adminFetch } from "../../api/adminHttp";
import { confirmAction } from "../../lib/glassConfirm";
import { copyText } from "../../lib/copyText.js";
import { Avatar } from "../ui/Avatar";
import OverlayPortal from "../ui/OverlayPortal.jsx";
import { useLocale } from "../../context/LocaleContext";
import { formatAppDate, formatAppDateTime, formatTimeAgo } from "../../lib/datetime";
import { formatNumber } from "../../i18n/format.js";
import { usePrivateMediaUrl } from "../../lib/privateMediaUrls.js";
import BanDialog from "./BanDialog.jsx";
import {
  SERVER_VIEW_PURPOSES,
  SERVER_REASON_MIN,
  DETAIL_TABS,
  LIST_FILTERS,
  LIST_SORTS,
  auditActionKey,
  canConfirmDelete,
  canSubmitView,
  errorKey,
  flatChannels,
  isReadableChannel,
  listQuery,
  mergePage,
  reportReasonKey,
  roleColor,
} from "./serverReviewModel.js";
import "../../styles/admin-server-review.css";

/**
 * Sunucu inceleme (admin, section serverReview). Mirrors DM inceleme: the
 * server list, the server detail and the member list are metadata only. The
 * text of one channel opens after a purpose + written reason; the server asks
 * for the step-up code and writes every page that is read to the audit log.
 * There is no export and no way to read more than the opened channel.
 */

const pathOf = (serverId) => `/server-review/servers/${encodeURIComponent(serverId)}`;

function useErrorText(t) {
  return useCallback(
    (err) => {
      const key = errorKey(err);
      if (key) return t(key);
      // Server faults answer in English; show the translated generic line instead.
      if (!err?.status || err.status >= 500) return t("serverReview.loadError");
      return err?.message || t("serverReview.loadError");
    },
    [t]
  );
}

function Escape({ onClose }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return null;
}

/* ---------- Dialogs ---------- */

function ViewReasonDialog({ target, busy, error, onCancel, onSubmit, t }) {
  const modalTrapRef = useModalFocusRef();
  const [purpose, setPurpose] = useState("report");
  const [reason, setReason] = useState("");
  const ok = canSubmitView(purpose, reason);
  return (
    <OverlayPortal>
      <div className="asr-scrim is-center" onClick={onCancel} role="presentation">
        <Escape onClose={onCancel} />
        <form ref={modalTrapRef}
          className="asr-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="asr-view-title"
          onClick={(e) => e.stopPropagation()}
          onSubmit={(e) => {
            e.preventDefault();
            if (ok && !busy) onSubmit({ purpose, reason: reason.trim() });
          }}
        >
          <div className="asr-dialog-icon is-warn"><Lock size={20} /></div>
          <h3 id="asr-view-title">{t("serverReview.viewTitle")}</h3>
          <p className="asr-dialog-who">{t("serverReview.viewWho", { server: target.serverName, channel: target.channel.name })}</p>
          <p className="asr-dialog-note">{t("serverReview.viewNote")}</p>
          <div className="asr-purposes" role="radiogroup" aria-label={t("serverReview.viewPurpose")}>
            {SERVER_VIEW_PURPOSES.map((id) => (
              <button key={id} type="button" role="radio" aria-checked={purpose === id} className={purpose === id ? "is-on" : ""} onClick={() => setPurpose(id)}>
                {t(`serverReview.purpose_${id}`)}
              </button>
            ))}
          </div>
          <label className="asr-label" htmlFor="asr-view-reason">{t("serverReview.viewReason")}</label>
          <textarea
            id="asr-view-reason"
            className="asr-input"
            rows={3}
            maxLength={300}
            value={reason}
            autoFocus
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("serverReview.viewReasonPh")}
          />
          <span className="asr-count">{reason.trim().length < SERVER_REASON_MIN ? t("serverReview.viewReasonMin", { n: SERVER_REASON_MIN }) : ""}</span>
          {error ? <p className="asr-err" role="alert">{error}</p> : null}
          <div className="asr-dialog-actions">
            <button type="button" className="asr-btn" onClick={onCancel}>{t("serverReview.cancel")}</button>
            <button type="submit" className="asr-btn is-warn" disabled={!ok || busy}>
              {busy ? t("serverReview.viewOpening") : t("serverReview.viewOpen")}
            </button>
          </div>
        </form>
      </div>
    </OverlayPortal>
  );
}

function HideDialog({ server, busy, error, onCancel, onSubmit, t }) {
  const modalTrapRef = useModalFocusRef();
  const [note, setNote] = useState("");
  return (
    <OverlayPortal>
      <div className="asr-scrim is-center" onClick={onCancel} role="presentation">
        <Escape onClose={onCancel} />
        <form ref={modalTrapRef}
          className="asr-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="asr-hide-title"
          onClick={(e) => e.stopPropagation()}
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy) onSubmit(note.trim());
          }}
        >
          <div className="asr-dialog-icon"><EyeOff size={20} /></div>
          <h3 id="asr-hide-title">{t("serverReview.hideTitle")}</h3>
          <p className="asr-dialog-who">{server.name}</p>
          <p className="asr-dialog-note">{t("serverReview.hideBody")}</p>
          <label className="asr-label" htmlFor="asr-hide-note">{t("serverReview.hideNoteLabel")}</label>
          <textarea id="asr-hide-note" className="asr-input" rows={3} maxLength={300} value={note} autoFocus onChange={(e) => setNote(e.target.value)} placeholder={t("serverReview.hideNotePh")} />
          {error ? <p className="asr-err" role="alert">{error}</p> : null}
          <div className="asr-dialog-actions">
            <button type="button" className="asr-btn" onClick={onCancel}>{t("serverReview.cancel")}</button>
            <button type="submit" className="asr-btn is-primary" disabled={busy}>{t("serverReview.hideConfirm")}</button>
          </div>
        </form>
      </div>
    </OverlayPortal>
  );
}

function DeleteServerDialog({ server, busy, error, onCancel, onSubmit, t }) {
  const modalTrapRef = useModalFocusRef();
  const [typed, setTyped] = useState("");
  const [reason, setReason] = useState("");
  const ok = canConfirmDelete(server.name, typed, reason);
  return (
    <OverlayPortal>
      <div className="asr-scrim is-center" onClick={onCancel} role="presentation">
        <Escape onClose={onCancel} />
        <form ref={modalTrapRef}
          className="asr-dialog is-danger"
          role="dialog"
          aria-modal="true"
          aria-labelledby="asr-del-title"
          onClick={(e) => e.stopPropagation()}
          onSubmit={(e) => {
            e.preventDefault();
            if (ok && !busy) onSubmit({ confirmName: typed.trim(), reason: reason.trim() });
          }}
        >
          <div className="asr-dialog-icon is-bad"><AlertTriangle size={20} /></div>
          <h3 id="asr-del-title">{t("serverReview.deleteTitle")}</h3>
          <p className="asr-dialog-note">{t("serverReview.deleteBody", { name: server.name })}</p>
          <label className="asr-label" htmlFor="asr-del-name">{t("serverReview.deleteTypeLabel", { name: server.name })}</label>
          <input id="asr-del-name" className="asr-input" value={typed} autoFocus autoComplete="off" spellCheck={false} onChange={(e) => setTyped(e.target.value)} />
          <label className="asr-label" htmlFor="asr-del-reason">{t("serverReview.deleteReasonLabel")}</label>
          <textarea id="asr-del-reason" className="asr-input" rows={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("serverReview.deleteReasonPh")} />
          {error ? <p className="asr-err" role="alert">{error}</p> : null}
          <div className="asr-dialog-actions">
            <button type="button" className="asr-btn" onClick={onCancel}>{t("serverReview.cancel")}</button>
            <button type="submit" className="asr-btn is-bad" disabled={!ok || busy}>{busy ? t("serverReview.deleting") : t("serverReview.deleteGo")}</button>
          </div>
        </form>
      </div>
    </OverlayPortal>
  );
}

/* ---------- Channel content (opened only through the gate) ---------- */

function Attachment({ m, t }) {
  const { url, onMediaError } = usePrivateMediaUrl(m.mediaUrl);
  if (!m.mediaUrl) return null;
  if (m.kind === "image") {
    return (
      <a className="asr-media" href={url} target="_blank" rel="noreferrer noopener">
        <img src={url} alt={t("serverReview.kind_image")} loading="lazy" onError={onMediaError} />
      </a>
    );
  }
  if (m.kind === "video") return <video className="asr-media" src={url} controls preload="metadata" onError={onMediaError} />;
  if (m.kind === "voice") {
    return (
      <div className="asr-voice">
        <Mic size={14} />
        <span>{m.voiceSeconds ? t("serverReview.kind_voiceSec", { n: m.voiceSeconds }) : t("serverReview.kind_voice")}</span>
        <audio src={url} controls preload="none" onError={onMediaError} />
      </div>
    );
  }
  return (
    <a className="asr-file" href={url} target="_blank" rel="noreferrer noopener">
      <Paperclip size={14} /> {t("serverReview.kind_file")}
    </a>
  );
}

function ReviewMessage({ m, onDelete, t, locale }) {
  return (
    <article className={`asr-msg ${m.pinnedAt ? "is-pinned" : ""}`}>
      <Avatar user={{ avatar_url: m.authorAvatarUrl, username: m.authorUsername }} name={m.authorDisplayName} size={34} />
      <div className="asr-msg-body">
        <header>
          <strong>{m.authorDisplayName}</strong>
          <span className="asr-msg-user">@{m.authorUsername}</span>
          <time dateTime={m.timestamp || undefined}>{m.timestamp ? formatAppDateTime(m.timestamp, locale) : ""}</time>
          {m.editedAt ? <span className="asr-chip">{t("serverReview.edited")}</span> : null}
          {m.pinnedAt ? (
            <span className="asr-chip is-pin" title={m.pinnedBy ? t("serverReview.pinnedBy", { username: m.pinnedBy }) : undefined}>
              <Pin size={11} /> {t("serverReview.pinned")}
            </span>
          ) : null}
          <button type="button" className="asr-icon-btn" onClick={() => onDelete(m)} aria-label={t("serverReview.deleteMessage")} title={t("serverReview.deleteMessage")}>
            <Trash2 size={14} />
          </button>
        </header>
        {m.kind === "system" ? <p className="asr-kind">{t("serverReview.kind_system")}{m.systemKind ? ` · ${m.systemKind}` : ""}</p> : null}
        {m.kind === "poll" ? <p className="asr-kind">{t("serverReview.kind_poll")}</p> : null}
        {m.kind === "card" ? <p className="asr-kind">{t("serverReview.kind_card")}</p> : null}
        {m.text ? <p className="asr-msg-text">{m.text}</p> : null}
        <Attachment m={m} t={t} />
        {m.edits?.length ? (
          <details className="asr-edits">
            <summary>{t("serverReview.editsCount", { count: m.edits.length })}</summary>
            <ol>
              {m.edits.map((e, i) => (
                <li key={`${m.id}-e${i}`}>
                  <time>{e.editedAt ? t("serverReview.editReplaced", { when: formatAppDateTime(e.editedAt, locale) }) : ""}</time>
                  <p>{e.text}</p>
                </li>
              ))}
            </ol>
          </details>
        ) : null}
      </div>
    </article>
  );
}

function ChannelViewer({ view, onClose, onPage, onDeleteMessage, t, locale }) {
  const modalTrapRef = useModalFocusRef();
  const listRef = useRef(null);
  const lastDirection = useRef("latest");
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (lastDirection.current === "latest" || lastDirection.current === "newer") el.scrollTop = el.scrollHeight;
  }, [view.messages]);
  const page = (direction) => {
    lastDirection.current = direction;
    onPage(direction);
  };
  return (
    <OverlayPortal>
      <div className="asr-scrim" onClick={onClose} role="presentation">
        <Escape onClose={onClose} />
        <aside ref={modalTrapRef} className="asr-drawer" role="dialog" aria-modal="true" aria-labelledby="asr-viewer-title" onClick={(e) => e.stopPropagation()}>
          <header className="asr-drawer-head">
            <span className="asr-drawer-ic"><Hash size={18} /></span>
            <div>
              <h2 id="asr-viewer-title">{view.channel.name}</h2>
              <p>{view.server.name}</p>
            </div>
            <button type="button" className="asr-icon-btn is-lg" onClick={onClose} aria-label={t("serverReview.close")}><X size={18} /></button>
          </header>
          <p className="asr-logged" role="status">
            <Lock size={14} />
            <span>{t("serverReview.viewerLogged", { purpose: t(`serverReview.purpose_${view.purpose}`), when: formatAppDateTime(view.viewedAt, locale) })}</span>
          </p>
          {view.error ? <p className="asr-err" role="alert">{view.error}</p> : null}
          <div className="asr-msgs" ref={listRef} aria-busy={view.loading ? "true" : "false"}>
            {view.hasOlder ? (
              <button type="button" className="asr-page-btn" onClick={() => page("older")} disabled={view.loading}>
                {t("serverReview.loadOlder")}
              </button>
            ) : view.messages.length ? (
              <p className="asr-edge">{t("serverReview.channelStart")}</p>
            ) : null}
            {view.messages.length === 0 && !view.loading ? <p className="asr-muted asr-pad">{t("serverReview.channelEmpty")}</p> : null}
            {view.messages.map((m) => (
              <ReviewMessage key={m.id} m={m} t={t} locale={locale} onDelete={onDeleteMessage} />
            ))}
            {view.loading ? <MessageRowsSkeleton count={3} /> : null}
            {view.messages.length ? (
              <button type="button" className="asr-page-btn" onClick={() => page("newer")} disabled={view.loading}>
                {view.noNewer ? t("serverReview.noNewer") : t("serverReview.loadNewer")}
              </button>
            ) : null}
          </div>
        </aside>
      </div>
    </OverlayPortal>
  );
}

function MessageRowsSkeleton({ count = 4 }) {
  return (
    <div className="asr-skel-msgs" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="asr-skel-msg">
          <span className="asr-skel asr-skel-dot" />
          <div>
            <span className="asr-skel" style={{ width: "30%" }} />
            <span className="asr-skel" style={{ width: `${60 + ((i * 13) % 30)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function ListSkeleton({ count = 6 }) {
  return (
    <ul className="asr-list" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="asr-row is-skel">
          <span className="asr-skel asr-skel-icon" />
          <div className="asr-row-main">
            <span className="asr-skel" style={{ width: `${45 + ((i * 17) % 35)}%` }} />
            <span className="asr-skel" style={{ width: "30%" }} />
          </div>
          <span className="asr-skel asr-skel-pill" />
        </li>
      ))}
    </ul>
  );
}

/* ---------- Server detail (metadata) ---------- */

function Flags({ row, t }) {
  return (
    <span className="asr-flags">
      {row.directory?.hidden ? <span className="asr-chip is-bad"><EyeOff size={11} /> {t("serverReview.flagHidden")}</span> : row.directory?.listed ? <span className="asr-chip is-brand"><Globe size={11} /> {t("serverReview.flagListed")}</span> : null}
      {row.isPublic ? <span className="asr-chip">{t("serverReview.flagPublic")}</span> : null}
      {row.communityEnabled ? <span className="asr-chip">{t("serverReview.flagCommunity")}</span> : null}
    </span>
  );
}

function RiskBadge({ risk, t }) {
  if (!risk) return null;
  const title = risk.factors?.length ? risk.factors.map((f) => t(`serverReview.risk_${f}`)).join(" · ") : t("serverReview.riskNone");
  return (
    <span className={`asr-risk is-${risk.level || "low"}`} title={title}>
      <span className="tnum">{risk.score}</span>
      <small>{t(`serverReview.riskLevel_${risk.level || "low"}`)}</small>
    </span>
  );
}

function PersonLine({ user, onOpenPerson, t, extra = null }) {
  if (!user) return null;
  return (
    <div className="asr-person">
      <Avatar user={{ avatar_url: user.avatarUrl, username: user.username }} name={user.displayName || user.username} size={28} />
      <div className="asr-person-main">
        <strong>{user.displayName || user.username || t("serverReview.unknownUser")}</strong>
        <span>@{user.username || "-"}{user.isAdmin ? ` · ${t("serverReview.platformAdmin")}` : ""}</span>
      </div>
      {extra}
      {onOpenPerson && user.id ? (
        <button type="button" className="asr-btn is-sm" onClick={() => onOpenPerson(user.id)}>{t("serverReview.openFile")}</button>
      ) : null}
    </div>
  );
}

function ChannelsTab({ detail, onOpen, t, locale }) {
  const tree = detail.channels;
  const all = flatChannels(tree);
  if (!all.length) return <p className="asr-muted asr-pad">{t("serverReview.noChannels")}</p>;
  const row = (c) => (
    <li key={c.id} className="asr-ch">
      <span className="asr-ch-ic">{c.type === "voice" || c.type === "stage" ? <Volume2 size={15} /> : <Hash size={15} />}</span>
      <div className="asr-ch-main">
        <strong>{c.name}</strong>
        <span>
          {t(`serverReview.type_${["text", "voice", "stage"].includes(c.type) ? c.type : "text"}`)}
          {" · "}
          {t("serverReview.channelMsgs", { count: c.messages })}
          {" · "}
          {c.lastAt ? t("serverReview.lastActivity", { when: formatTimeAgo(c.lastAt, t, undefined, locale) }) : t("serverReview.noActivity")}
        </span>
      </div>
      {c.nsfw ? <span className="asr-chip is-bad">{t("serverReview.nsfw")}</span> : null}
      {isReadableChannel(c) ? (
        <button type="button" className="asr-btn is-sm is-warn-ghost" onClick={() => onOpen(c)}>
          <Lock size={13} /> {t("serverReview.actOpenContent")}
        </button>
      ) : null}
    </li>
  );
  return (
    <div className="asr-tree">
      {detail.stats.countsApproximate ? <p className="asr-note">{t("serverReview.countsApproximate")}</p> : null}
      {tree.loose.length ? (
        <section>
          <h4>{t("serverReview.uncategorized")}</h4>
          <ul>{tree.loose.map(row)}</ul>
        </section>
      ) : null}
      {tree.categories.map((cat) => (
        <section key={cat.id}>
          <h4>{cat.name}</h4>
          {cat.children.length ? <ul>{cat.children.map(row)}</ul> : <p className="asr-muted">{t("serverReview.noChannels")}</p>}
        </section>
      ))}
    </div>
  );
}

function MembersTab({ serverId, canBan, onBan, onOpenPerson, t, locale, errorText }) {
  const [q, setQ] = useState("");
  const [state, setState] = useState({ members: [], total: 0, loading: true, error: "" });
  const load = useCallback(
    async (offset, query) => {
      setState((s) => ({ ...s, loading: true, error: "" }));
      try {
        const p = new URLSearchParams({ offset: String(offset) });
        if (query) p.set("q", query);
        const data = await adminFetch(`${pathOf(serverId)}/members?${p}`);
        setState((s) => ({ members: offset ? [...s.members, ...(data.members || [])] : data.members || [], total: data.total || 0, loading: false, error: "" }));
      } catch (err) {
        setState((s) => ({ ...s, loading: false, error: errorText(err) }));
      }
    },
    [serverId, errorText]
  );
  useEffect(() => {
    const h = setTimeout(() => load(0, q.trim()), q ? 250 : 0);
    return () => clearTimeout(h);
  }, [load, q]);
  return (
    <div className="asr-members">
      <label className="asr-search is-inline">
        <Search size={14} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("serverReview.membersSearchPh")} aria-label={t("serverReview.membersSearchPh")} />
      </label>
      {state.error ? <p className="asr-err">{state.error}</p> : null}
      {!state.loading && !state.members.length ? <p className="asr-muted asr-pad">{t("serverReview.noMembers")}</p> : null}
      <ul className="asr-people">
        {state.members.map((m) => (
          <li key={m.id}>
            <PersonLine
              user={m}
              t={t}
              onOpenPerson={onOpenPerson}
              extra={
                <div className="asr-member-meta">
                  {m.isOwner ? <span className="asr-chip is-brand">{t("serverReview.ownerBadge")}</span> : null}
                  {m.staff?.length ? <span className="asr-chip is-warn">{t("serverReview.staffBadge")}</span> : null}
                  {m.roles?.slice(0, 3).map((r) => (
                    <span key={r.id} className="asr-role" style={roleColor(r.color) ? { "--asr-role": roleColor(r.color) } : undefined}>{r.name}</span>
                  ))}
                  <span className="asr-date">{m.joinedAt ? t("serverReview.joined", { date: formatAppDate(m.joinedAt, locale) }) : ""}</span>
                </div>
              }
            />
            {canBan && !m.isAdmin ? (
              <button type="button" className="asr-btn is-sm is-bad-ghost" onClick={() => onBan(m)}>
                <Ban size={13} /> {t("serverReview.actBan")}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {state.loading ? <ListSkeleton count={3} /> : null}
      {!state.loading && state.members.length < state.total ? (
        <button type="button" className="asr-page-btn" onClick={() => load(state.members.length, q.trim())}>
          {t("serverReview.loadMore", { shown: state.members.length, total: state.total })}
        </button>
      ) : null}
    </div>
  );
}

function StaffTab({ detail, onOpenPerson, canBan, onBan, t, locale }) {
  return (
    <div className="asr-staff">
      <p className="asr-note">{t("serverReview.staffNote")}</p>
      {detail.everyoneDangerous?.length ? (
        <p className="asr-warn-line"><AlertTriangle size={14} /> {t("serverReview.everyoneWarn", { perms: detail.everyoneDangerous.map((p) => t(`serverReview.perm_${p}`)).join(", ") })}</p>
      ) : null}
      <ul className="asr-people">
        <li>
          <PersonLine user={detail.owner} t={t} onOpenPerson={onOpenPerson} extra={<div className="asr-member-meta"><span className="asr-chip is-brand">{t("serverReview.ownerBadge")}</span></div>} />
          {canBan && !detail.owner.isAdmin ? (
            <button type="button" className="asr-btn is-sm is-bad-ghost" onClick={() => onBan(detail.owner)}><Ban size={13} /> {t("serverReview.actBan")}</button>
          ) : null}
        </li>
        {detail.staff.map((s) => (
          <li key={s.id}>
            <PersonLine
              user={s}
              t={t}
              onOpenPerson={onOpenPerson}
              extra={
                <div className="asr-member-meta">
                  {s.permissions.map((p) => (
                    <span key={p} className={`asr-chip ${p === "ADMINISTRATOR" ? "is-bad" : "is-warn"}`}>{t(`serverReview.perm_${p}`)}</span>
                  ))}
                  <span className="asr-date">{s.joinedAt ? t("serverReview.joined", { date: formatAppDate(s.joinedAt, locale) }) : ""}</span>
                </div>
              }
            />
            {canBan && !s.isAdmin ? (
              <button type="button" className="asr-btn is-sm is-bad-ghost" onClick={() => onBan(s)}><Ban size={13} /> {t("serverReview.actBan")}</button>
            ) : null}
          </li>
        ))}
      </ul>
      {!detail.staff.length ? <p className="asr-muted">{t("serverReview.noStaff")}</p> : null}
      <h4 className="asr-sub">{t("serverReview.rolesTitle")}</h4>
      <ul className="asr-roles">
        {detail.roles.map((r) => (
          <li key={r.id}>
            <span className="asr-role" style={roleColor(r.color) ? { "--asr-role": roleColor(r.color) } : undefined}>{r.name}</span>
            <span className="asr-muted">{t("serverReview.roleMembers", { count: r.members })}</span>
            <span className="asr-flags">
              {r.dangerous.map((p) => (
                <span key={p} className={`asr-chip ${p === "ADMINISTRATOR" ? "is-bad" : "is-warn"}`}>{t(`serverReview.perm_${p}`)}</span>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function InvitesTab({ detail, onDelete, t, locale }) {
  if (!detail.invites.length) return <p className="asr-muted asr-pad">{t("serverReview.noInvites")}</p>;
  return (
    <ul className="asr-table">
      {detail.invites.map((i) => (
        <li key={i.code}>
          <div className="asr-cell-main">
            <strong className="asr-code">{i.code}</strong>
            <span>
              {t("serverReview.inviteBy", { username: i.creator?.username || "-" })}
              {" · "}
              {i.maxUses ? t("serverReview.inviteUses", { uses: i.uses, max: i.maxUses }) : t("serverReview.inviteUsesUnlimited", { uses: i.uses })}
              {" · "}
              {i.expiresAt ? t("serverReview.inviteExpires", { date: formatAppDate(i.expiresAt, locale) }) : t("serverReview.inviteNever")}
            </span>
          </div>
          {i.isDirectoryInvite ? <span className="asr-chip is-brand">{t("serverReview.directoryInvite")}</span> : null}
          <span className={`asr-chip ${i.state === "active" ? "is-ok" : ""}`}>{t(`serverReview.inviteState_${i.state}`)}</span>
          <button type="button" className="asr-icon-btn" onClick={() => onDelete(i)} aria-label={t("serverReview.actDeleteInvite")} title={t("serverReview.actDeleteInvite")}>
            <Trash2 size={14} />
          </button>
        </li>
      ))}
    </ul>
  );
}

function AuditTab({ detail, t, locale }) {
  if (!detail.audit.length) return <p className="asr-muted asr-pad">{t("serverReview.noAudit")}</p>;
  return (
    <ul className="asr-table">
      {detail.audit.map((a) => {
        const key = auditActionKey(a.action);
        return (
          <li key={a.id}>
            <div className="asr-cell-main">
              <strong>{key ? t(key) : a.action}</strong>
              <span>
                {a.actorUsername ? `@${a.actorUsername}` : t("serverReview.unknownUser")}
                {a.targetType ? ` · ${a.targetType}` : ""}
                {a.reason ? ` · ${a.reason}` : ""}
              </span>
            </div>
            <time className="asr-date">{a.createdAt ? formatAppDateTime(a.createdAt, locale) : ""}</time>
          </li>
        );
      })}
    </ul>
  );
}

function ReportsTab({ detail, onOpenPerson, t, locale }) {
  if (!detail.reports.length) return <p className="asr-muted asr-pad">{t("serverReview.noReports")}</p>;
  return (
    <ul className="asr-table">
      {detail.reports.map((r) => (
        <li key={r.id}>
          <div className="asr-cell-main">
            <strong>{t(reportReasonKey(r.reason))}</strong>
            <span>
              {t(`serverReview.about_${r.about}`)}
              {" · "}
              {t("serverReview.reportTarget", { username: r.target?.username || "-" })}
              {" · "}
              {t("serverReview.reportBy", { username: r.reporter?.username || "-" })}
            </span>
            {r.note ? <span className="asr-quote">{r.note}</span> : null}
          </div>
          <span className={`asr-chip ${r.status === "open" ? "is-warn" : ""}`}>{t(`serverReview.reportStatus_${["open", "dismissed", "actioned"].includes(r.status) ? r.status : "open"}`)}</span>
          <time className="asr-date">{r.createdAt ? formatAppDate(r.createdAt, locale) : ""}</time>
          {onOpenPerson && r.target?.id ? (
            <button type="button" className="asr-btn is-sm" onClick={() => onOpenPerson(r.target.id)}>{t("serverReview.openFile")}</button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function DirectoryTab({ detail, t, locale }) {
  const d = detail.directory;
  if (!d.available) return <p className="asr-muted asr-pad">{t("serverReview.dirUnavailable")}</p>;
  const facts = [
    [t("serverReview.dirCategory"), d.category || "-"],
    [t("serverReview.dirLanguage"), d.language || "-"],
    [t("serverReview.dirTags"), d.tags?.length ? d.tags.join(", ") : "-"],
    [t("serverReview.dirListedAt"), d.listedAt ? formatAppDate(d.listedAt, locale) : "-"],
  ];
  return (
    <div className="asr-dir">
      <p className={`asr-state ${d.hidden ? "is-bad" : d.listed ? "is-ok" : ""}`}>
        {d.hidden ? <EyeOff size={15} /> : <Globe size={15} />}
        {d.hidden ? t("serverReview.dirHidden") : d.listed ? t("serverReview.dirListed") : t("serverReview.dirNotListed")}
      </p>
      {d.hidden && d.hiddenReason ? <p className="asr-quote">{t("serverReview.dirHiddenReason")}: {d.hiddenReason}</p> : null}
      {d.description ? <p className="asr-quote">{d.description}</p> : null}
      <dl className="asr-facts">
        {facts.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function ServerDetail({ serverId, onBack, onChanged, canBan, onOpenPerson, onOpenChannel, notify, t, locale, errorText }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("channels");
  const [dialog, setDialog] = useState(null);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [dialogError, setDialogError] = useState("");
  const [banTarget, setBanTarget] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setDetail(await adminFetch(pathOf(serverId)));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }, [serverId, errorText]);

  useEffect(() => {
    setTab("channels");
    setDetail(null);
    load();
  }, [load]);

  const closeDialog = () => {
    setDialog(null);
    setDialogError("");
    setDialogBusy(false);
  };

  const hide = async (note) => {
    setDialogBusy(true);
    setDialogError("");
    try {
      await adminFetch(`${pathOf(serverId)}/directory`, { method: "POST", body: JSON.stringify({ hidden: true, reason: note || null }) });
      closeDialog();
      notify(t("serverReview.hiddenDone"));
      await load();
      onChanged();
    } catch (err) {
      setDialogBusy(false);
      setDialogError(errorText(err));
    }
  };

  const show = async () => {
    if (!(await confirmAction({ message: t("serverReview.showConfirm"), confirmLabel: t("serverReview.actShow"), cancelLabel: t("serverReview.cancel"), danger: false }))) return;
    try {
      await adminFetch(`${pathOf(serverId)}/directory`, { method: "POST", body: JSON.stringify({ hidden: false }) });
      notify(t("serverReview.shownDone"));
      await load();
      onChanged();
    } catch (err) {
      setError(errorText(err));
    }
  };

  const revokeAll = async () => {
    if (!(await confirmAction({ message: t("serverReview.revokeAllConfirm"), confirmLabel: t("serverReview.actCloseInvites"), cancelLabel: t("serverReview.cancel") }))) return;
    try {
      const res = await adminFetch(`${pathOf(serverId)}/invites/revoke-all`, { method: "POST", body: "{}" });
      notify(t("serverReview.invitesClosed", { count: res?.removed || 0 }));
      await load();
      onChanged();
    } catch (err) {
      setError(errorText(err));
    }
  };

  const reopenInvites = async () => {
    if (!(await confirmAction({ message: t("serverReview.reopenInvitesConfirm"), confirmLabel: t("serverReview.actReopenInvites"), cancelLabel: t("serverReview.cancel"), danger: false }))) return;
    try {
      await adminFetch(`${pathOf(serverId)}/invites/resume`, { method: "POST", body: "{}" });
      notify(t("serverReview.invitesReopened"));
      await load();
      onChanged();
    } catch (err) {
      setError(errorText(err));
    }
  };

  const deleteInvite = async (invite) => {
    if (!(await confirmAction({ message: t("serverReview.deleteInviteConfirm", { code: invite.code }), confirmLabel: t("serverReview.actDeleteInvite"), cancelLabel: t("serverReview.cancel") }))) return;
    try {
      await adminFetch(`${pathOf(serverId)}/invites/${encodeURIComponent(invite.code)}`, { method: "DELETE" });
      notify(t("serverReview.inviteDeleted"));
      await load();
    } catch (err) {
      setError(errorText(err));
    }
  };

  const deleteServer = async ({ confirmName, reason }) => {
    setDialogBusy(true);
    setDialogError("");
    try {
      await adminFetch(pathOf(serverId), { method: "DELETE", body: JSON.stringify({ confirmName, reason }) });
      const name = detail?.server?.name || "";
      closeDialog();
      notify(t("serverReview.deletedDone", { name }));
      onChanged();
      onBack(true);
    } catch (err) {
      setDialogBusy(false);
      setDialogError(errorText(err));
    }
  };

  if (loading && !detail) {
    return (
      <div className="asr-detail">
        <div className="asr-detail-head is-skel">
          <span className="asr-skel asr-skel-hero" />
          <div className="asr-row-main">
            <span className="asr-skel" style={{ width: "40%" }} />
            <span className="asr-skel" style={{ width: "25%" }} />
          </div>
        </div>
        <ListSkeleton count={5} />
      </div>
    );
  }
  if (error && !detail) {
    return (
      <div className="asr-detail">
        <button type="button" className="asr-btn is-sm asr-back" onClick={() => onBack(false)}><ArrowLeft size={14} /> {t("serverReview.back")}</button>
        <div className="asr-empty"><AlertTriangle size={26} /><strong>{error}</strong></div>
      </div>
    );
  }
  if (!detail) return null;
  const s = detail.server;
  const d = detail.directory;
  const stats = [
    ["stat_members", detail.stats.members],
    ["stat_joins7d", detail.stats.joins7d],
    ["stat_channels", detail.stats.channels],
    ["stat_messages7d", detail.stats.messages7d],
    ["stat_messages30d", detail.stats.messages30d],
    ["stat_invites", detail.stats.invitesActive],
    ["stat_reports", detail.stats.openReports, detail.stats.openReports > 0],
    ["stat_bans", detail.stats.bans],
  ];
  const tabCount = { members: detail.stats.members, staff: detail.staff.length + 1, invites: detail.invites.length, audit: detail.audit.length, reports: detail.reports.length, channels: flatChannels(detail.channels).length };

  return (
    <div className="asr-detail">
      <button type="button" className="asr-btn is-sm asr-back" onClick={() => onBack(false)}><ArrowLeft size={14} /> {t("serverReview.back")}</button>
      <div className="asr-detail-head">
        <Avatar user={{ avatar_url: s.iconUrl, username: s.name }} name={s.name} size={52} />
        <div className="asr-detail-title">
          <h2>{s.name}</h2>
          <div className="asr-meta">
            <button type="button" className="asr-id" onClick={() => { copyText(s.id).then((ok) => notify(ok ? t("serverReview.copied") : t("Could not copy to clipboard"))); }} title={t("serverReview.copyId")} aria-label={t("serverReview.copyId")}>
              <Copy size={11} /> {s.id.slice(0, 8)}
            </button>
            <span><Clock size={11} /> {t("serverReview.createdOn", { date: formatAppDate(s.createdAt, locale) })}</span>
            <Flags row={{ ...s, directory: d }} t={t} />
          </div>
        </div>
        <button type="button" className="asr-icon-btn is-lg" onClick={load} disabled={loading} aria-label={t("serverReview.refresh")} title={t("serverReview.refresh")}>
          <RefreshCw size={16} className={loading ? "spin" : ""} />
        </button>
      </div>

      <PersonLine user={detail.owner} t={t} onOpenPerson={onOpenPerson} extra={<span className="asr-chip is-brand">{t("serverReview.ownerBadge")}</span>} />

      {error ? <p className="asr-err" role="alert">{error}</p> : null}
      {detail.server?.invitesPausedAt ? <p className="asr-err" role="status">{t("serverReview.invitesPausedNote")}</p> : null}

      <div className="asr-actions">
        {d.available && (d.listed || d.hidden) ? (
          d.hidden ? (
            <button type="button" className="asr-btn" onClick={show}><Eye size={14} /> {t("serverReview.actShow")}</button>
          ) : (
            <button type="button" className="asr-btn" onClick={() => setDialog("hide")}><EyeOff size={14} /> {t("serverReview.actHide")}</button>
          )
        ) : null}
        {detail.server?.invitesPausedAt ? (
          <button type="button" className="asr-btn" onClick={reopenInvites}><Link2 size={14} /> {t("serverReview.actReopenInvites")}</button>
        ) : (
          <button type="button" className="asr-btn" onClick={revokeAll}><Link2 size={14} /> {t("serverReview.actCloseInvites")}</button>
        )}
        {canBan && !detail.owner.isAdmin ? (
          <button type="button" className="asr-btn is-bad-ghost" onClick={() => setBanTarget(detail.owner)}><Ban size={14} /> {t("serverReview.actBanOwner")}</button>
        ) : null}
        <button type="button" className="asr-btn is-bad" onClick={() => setDialog("delete")}><Trash2 size={14} /> {t("serverReview.actDelete")}</button>
      </div>

      <div className="asr-stats">
        {stats.map(([key, value, hot]) => (
          <div key={key} className={hot ? "is-warn" : ""}>
            <span>{t(`serverReview.${key}`)}</span>
            <b className="tnum">{formatNumber(value || 0, locale)}</b>
          </div>
        ))}
      </div>

      <div className="asr-tabs" role="tablist" aria-label={t("serverReview.tabsLabel")}>
        {DETAIL_TABS.map((id) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "is-on" : ""} onClick={() => setTab(id)}>
            {t(`serverReview.tab_${id}`)}
            {tabCount[id] != null ? <span className="asr-tab-n tnum">{formatNumber(tabCount[id], locale)}</span> : null}
          </button>
        ))}
      </div>

      <div className="asr-tabpanel" role="tabpanel">
        {tab === "channels" && <ChannelsTab detail={detail} t={t} locale={locale} onOpen={(c) => onOpenChannel({ serverId: s.id, serverName: s.name, channel: c })} />}
        {tab === "members" && <MembersTab serverId={s.id} canBan={canBan} onBan={setBanTarget} onOpenPerson={onOpenPerson} t={t} locale={locale} errorText={errorText} />}
        {tab === "staff" && <StaffTab detail={detail} canBan={canBan} onBan={setBanTarget} onOpenPerson={onOpenPerson} t={t} locale={locale} />}
        {tab === "invites" && <InvitesTab detail={detail} onDelete={deleteInvite} t={t} locale={locale} />}
        {tab === "audit" && <AuditTab detail={detail} t={t} locale={locale} />}
        {tab === "reports" && <ReportsTab detail={detail} onOpenPerson={onOpenPerson} t={t} locale={locale} />}
        {tab === "directory" && <DirectoryTab detail={detail} t={t} locale={locale} />}
      </div>

      {dialog === "hide" ? <HideDialog server={s} busy={dialogBusy} error={dialogError} onCancel={closeDialog} onSubmit={hide} t={t} /> : null}
      {dialog === "delete" ? <DeleteServerDialog server={s} busy={dialogBusy} error={dialogError} onCancel={closeDialog} onSubmit={deleteServer} t={t} /> : null}
      <BanDialog
        open={Boolean(banTarget)}
        target={banTarget ? { id: banTarget.id, username: banTarget.username, displayName: banTarget.displayName, avatarUrl: banTarget.avatarUrl, isAdmin: banTarget.isAdmin } : null}
        onClose={() => setBanTarget(null)}
        onBanned={({ message }) => {
          setBanTarget(null);
          notify(message || t("serverReview.bannedDone"));
        }}
      />
    </div>
  );
}

/* ---------- The section ---------- */

export default function AdminServerReview({ canBan = false, onOpenPerson, initialQuery = "", initialServerId = "" }) {
  const { t, locale } = useLocale();
  const errorText = useErrorText(t);
  // The user file opens this page pre-filtered (owner "@username" or a server name / id).
  const [query, setQuery] = useState(initialQuery || "");
  const [debounced, setDebounced] = useState((initialQuery || "").trim());
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("risk");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState(initialServerId || "");
  const [notice, setNotice] = useState("");
  const [asking, setAsking] = useState(null);
  const [askError, setAskError] = useState("");
  const [askBusy, setAskBusy] = useState(false);
  const [view, setView] = useState(null);
  const [detailEpoch, setDetailEpoch] = useState(0);
  const noticeTimer = useRef(null);

  const notify = useCallback((text) => {
    setNotice(text);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 4000);
  }, []);
  useEffect(() => () => clearTimeout(noticeTimer.current), []);

  useEffect(() => {
    // A new search starts at page 1 (the effect only runs when the text changes).
    const h = setTimeout(() => {
      setDebounced(query.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(h);
  }, [query]);

  const load = useCallback(
    async (refresh = false) => {
      setLoading(true);
      setError("");
      try {
        setData(await adminFetch(`/server-review/servers${listQuery({ q: debounced, filter, sort, page, refresh })}`));
      } catch (err) {
        setError(errorText(err));
      } finally {
        setLoading(false);
      }
    },
    [debounced, filter, sort, page, errorText]
  );
  useEffect(() => {
    load(false);
  }, [load]);

  /* Gated channel view: every page re-sends the same purpose + reason and is audited. */
  const fetchPage = useCallback(async (target, gate, cursor = {}) => {
    return adminFetch(`${pathOf(target.serverId)}/channels/${encodeURIComponent(target.channel.id)}/view`, {
      method: "POST",
      body: JSON.stringify({ purpose: gate.purpose, reason: gate.reason, ...cursor }),
    });
  }, []);

  const openChannel = async (gate) => {
    if (!asking) return;
    setAskBusy(true);
    setAskError("");
    try {
      const res = await fetchPage(asking, gate);
      const merged = mergePage(null, res);
      setView({ target: asking, gate, server: res.server, channel: res.channel, purpose: gate.purpose, viewedAt: res.viewedAt, ...merged, loading: false, error: "", noNewer: false });
      setAsking(null);
    } catch (err) {
      setAskError(errorText(err));
    } finally {
      setAskBusy(false);
    }
  };

  const pageChannel = async (direction) => {
    if (!view || view.loading) return;
    const msgs = view.messages;
    const cursor = direction === "older" ? { before: msgs[0]?.timestamp } : { after: msgs[msgs.length - 1]?.timestamp };
    setView((v) => ({ ...v, loading: true, error: "" }));
    try {
      const res = await fetchPage(view.target, view.gate, cursor);
      setView((v) => ({ ...v, ...mergePage(v, res), viewedAt: res.viewedAt, loading: false, noNewer: direction === "newer" && !(res.messages || []).length }));
    } catch (err) {
      setView((v) => ({ ...v, loading: false, error: errorText(err) }));
    }
  };

  const deleteMessage = async (m) => {
    if (!view) return;
    if (!(await confirmAction({ message: t("serverReview.deleteMessageConfirm"), confirmLabel: t("serverReview.deleteMessage"), cancelLabel: t("serverReview.cancel") }))) return;
    try {
      await adminFetch(`${pathOf(view.target.serverId)}/channels/${encodeURIComponent(view.target.channel.id)}/messages/${encodeURIComponent(m.id)}`, { method: "DELETE" });
      setView((v) => (v ? { ...v, messages: v.messages.filter((x) => x.id !== m.id) } : v));
      notify(t("serverReview.messageDeleted"));
    } catch (err) {
      setView((v) => (v ? { ...v, error: errorText(err) } : v));
    }
  };

  const summary = data?.summary;
  const kpis = useMemo(
    () => [
      ["kpiServers", summary?.total, Server, ""],
      ["kpiListed", summary?.listed, Globe, ""],
      ["kpiReported", summary?.reported, Flag, summary?.reported ? "is-warn" : ""],
      ["kpiHighRisk", summary?.highRisk, Shield, summary?.highRisk ? "is-bad" : ""],
      ["kpiNew", summary?.new7d, Clock, ""],
    ],
    [summary]
  );
  const servers = data?.servers || [];

  return (
    <section className={`asr ${selectedId ? "is-detail-open" : ""}`}>
      <header className="asr-head">
        <span className="asr-head-ic"><Server size={20} /></span>
        <div>
          <h1>{t("serverReview.title")}</h1>
          <p>{t("serverReview.subtitle")}</p>
        </div>
        <button type="button" className="asr-btn" onClick={() => load(true)} disabled={loading}>
          <RefreshCw size={14} className={loading ? "spin" : ""} /> {t("serverReview.refresh")}
        </button>
      </header>

      <div className="asr-kpis">
        {kpis.map(([key, value, Icon, tone]) => (
          <div key={key} className={`asr-kpi ${tone}`}>
            <span><Icon size={13} /> {t(`serverReview.${key}`)}</span>
            {value == null ? <span className="asr-skel asr-skel-num" /> : <b className="tnum">{formatNumber(value, locale)}</b>}
          </div>
        ))}
      </div>

      <div className="asr-bar">
        <label className="asr-search">
          <Search size={14} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("serverReview.searchPh")} aria-label={t("serverReview.searchPh")} />
          {query ? (
            <button type="button" className="asr-icon-btn" onClick={() => setQuery("")} aria-label={t("serverReview.clear")}><X size={13} /></button>
          ) : null}
        </label>
        <div className="asr-seg" role="tablist" aria-label={t("serverReview.filterLabel")}>
          {LIST_FILTERS.map((id) => (
            <button key={id} type="button" role="tab" aria-selected={filter === id} className={filter === id ? "is-on" : ""} onClick={() => { setFilter(id); setPage(1); }}>
              {t(`serverReview.filter_${id}`)}
            </button>
          ))}
        </div>
        <label className="asr-sort">
          <span>{t("serverReview.sortLabel")}</span>
          <select className="asr-select" value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }}>
            {LIST_SORTS.map((id) => (
              <option key={id} value={id}>{t(`serverReview.sort_${id}`)}</option>
            ))}
          </select>
        </label>
      </div>

      {notice ? <p className="asr-notice" role="status">{notice}</p> : null}
      {error ? <p className="asr-err" role="alert"><AlertTriangle size={14} /> {error}</p> : null}
      {data?.approximate ? <p className="asr-note">{t("serverReview.approximate")}</p> : null}

      <div className={`asr-split ${selectedId ? "has-detail" : ""}`}>
        <div className="asr-list-pane">
          {loading && !data ? (
            <ListSkeleton count={7} />
          ) : servers.length === 0 ? (
            <div className="asr-empty">
              <Server size={28} />
              <strong>{t("serverReview.emptyTitle")}</strong>
              <span>{t("serverReview.emptyBody")}</span>
            </div>
          ) : (
            <>
              <p className="asr-count-line">{t("serverReview.resultCount", { count: data?.total || 0 })}</p>
              <ul className={`asr-list ${loading ? "is-loading" : ""}`}>
                {servers.map((row) => (
                  <li key={row.id}>
                    <button type="button" className={`asr-row ${selectedId === row.id ? "is-active" : ""}`} onClick={() => setSelectedId(row.id)} aria-current={selectedId === row.id ? "true" : undefined}>
                      <Avatar user={{ avatar_url: row.iconUrl, username: row.name }} name={row.name} size={38} />
                      <div className="asr-row-main">
                        <strong className="asr-row-title">{row.name}</strong>
                        <span className="asr-row-meta">
                          @{row.owner?.username || "-"}
                          {" · "}
                          {t("serverReview.createdShort", { date: formatAppDate(row.createdAt, locale) })}
                        </span>
                        <span className="asr-row-nums">
                          <span><Users size={12} /> {formatNumber(row.members, locale)}{row.joins7d ? <em className="tnum"> +{formatNumber(row.joins7d, locale)}</em> : null}</span>
                          <span><Hash size={12} /> {formatNumber(row.channels, locale)}</span>
                          <span title={t("serverReview.msgsTitle", { d7: row.messages.d7, d30: row.messages.d30 })}><ScrollText size={12} /> {formatNumber(row.messages.d7, locale)} / {formatNumber(row.messages.d30, locale)}</span>
                          {row.invites.active ? <span><Link2 size={12} /> {formatNumber(row.invites.active, locale)}</span> : null}
                          {row.reports.server + row.reports.members > 0 ? (
                            <span className="is-warn"><Flag size={12} /> {formatNumber(row.reports.server + row.reports.members, locale)}</span>
                          ) : null}
                          {row.modEvents7d ? <span><Shield size={12} /> {formatNumber(row.modEvents7d, locale)}</span> : null}
                        </span>
                        <Flags row={row} t={t} />
                      </div>
                      <RiskBadge risk={row.risk} t={t} />
                    </button>
                  </li>
                ))}
              </ul>
              {data?.pages > 1 ? (
                <div className="asr-pager">
                  <button type="button" className="asr-icon-btn" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1 || loading} aria-label={t("serverReview.prev")}><ChevronLeft size={16} /></button>
                  <span className="tnum">{t("serverReview.pageOf", { page: data.page, pages: data.pages })}</span>
                  <button type="button" className="asr-icon-btn" onClick={() => setPage((p) => Math.min(data.pages, p + 1))} disabled={page >= data.pages || loading} aria-label={t("serverReview.next")}><ChevronRight size={16} /></button>
                </div>
              ) : null}
            </>
          )}
        </div>

        <div className="asr-detail-pane">
          {selectedId ? (
            <ServerDetail
              key={`${selectedId}:${detailEpoch}`}
              serverId={selectedId}
              canBan={canBan}
              onOpenPerson={onOpenPerson}
              notify={notify}
              t={t}
              locale={locale}
              errorText={errorText}
              onChanged={() => load(true)}
              onBack={(gone) => {
                setSelectedId("");
                if (gone) setDetailEpoch((n) => n + 1);
              }}
              onOpenChannel={(target) => {
                setAskError("");
                setAsking(target);
              }}
            />
          ) : (
            <div className="asr-empty is-tall">
              <Lock size={28} />
              <strong>{t("serverReview.selectTitle")}</strong>
              <span>{t("serverReview.selectBody")}</span>
            </div>
          )}
        </div>
      </div>

      {asking ? <ViewReasonDialog target={asking} busy={askBusy} error={askError} t={t} onCancel={() => setAsking(null)} onSubmit={openChannel} /> : null}
      {view ? <ChannelViewer view={view} t={t} locale={locale} onClose={() => setView(null)} onPage={pageChannel} onDeleteMessage={deleteMessage} /> : null}
    </section>
  );
}
