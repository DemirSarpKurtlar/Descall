/*
 * Yönetici Paneli › Geri Bildirim (Descall 3.0, mockups 37 / 38 / 39).
 * Desktop: window with the section sidebar, list (440px) and detail.
 * iPad: same window without the sidebar, list 400px.
 * iPhone: large-title list, the detail is pushed on top.
 * Server side is admin-only (routes/admin.js → requireAdmin).
 * Text: adminx.fb catalog keys (i18n/locales/adminx.<id>.js).
 */
import { localizedField } from "../../../i18n/serverText.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adminFetch } from "../../../api/adminHttp";
import { useLocale } from "../../../context/LocaleContext";
import { upper } from "../../../i18n/format.js";
import { S3Glyph as I } from "../../settings/SettingsV3.jsx";
import logoIcon from "../../../assets/admin-logo-icon.png";
import {
  TYPES, PRIORITIES, STATUSES, QUICK_TYPES, SORTS,
  avatarColor, relTime, sentAt, memberSince, deleteMessage, titleOf,
  isUnread, replyCount, counts as countAll, applyFilters, fileName, formatBytes,
} from "./fbModel.js";
import "../../../styles/admin-feedback-v3.css";

/** The 10 sections the mockup sidebar lists, then "+N more sections". [id, label key, icon]. */
export const FB3_NAV = [
  ["overview", "adminx.fb.nav.overview", "gear"],
  ["directory", "adminx.fb.nav.directory", "users"],
  ["analytics", "adminx.fb.nav.analytics", "bolt"],
  ["reports", "adminx.fb.nav.reports", "flag"],
  ["feedback", "adminx.fb.nav.feedback", "msg"],
  ["signupStats", "adminx.fb.nav.signupStats", "list"],
  ["announcements", "adminx.fb.nav.announcements", "mega"],
  ["moderation", "adminx.fb.nav.moderation", "shield"],
  ["system", "adminx.fb.nav.system", "gear"],
  ["audit", "adminx.fb.nav.audit", "eye"],
];

/** 3.7.14 form answers shown under the meta row: type, where, how often, stars, what they like. */
const KINDS = ["suggestion", "bug", "praise"];
const AREAS = ["chat", "voice", "server", "shop", "settings", "other"];
const FREQS = ["once", "sometimes", "always"];
const LIKES = ["voice", "design", "screen", "servers", "shop", "speed"];
export function formFacts(f, t) {
  const out = [];
  if (KINDS.includes(f?.kind)) out.push(t("adminx.fb.factType", { value: t(`adminx.fb.kind.${f.kind}`) }));
  if (AREAS.includes(f?.details?.area)) out.push(t("adminx.fb.factArea", { value: t(`adminx.fb.area.${f.details.area}`) }));
  if (FREQS.includes(f?.details?.frequency)) out.push(t(`adminx.fb.freq.${f.details.frequency}`));
  if (Number.isInteger(f?.rating)) out.push(t("adminx.fb.factRating", { count: f.rating }));
  for (const l of f?.details?.likes || []) if (LIKES.includes(l)) out.push(t("adminx.fb.factLikes", { value: t(`adminx.fb.like.${l}`) }));
  return out;
}

const QUICK_REPLIES = ["adminx.fb.quick1", "adminx.fb.quick2", "adminx.fb.quick3"];

function Av({ name, url, size }) {
  const { locale } = useLocale();
  const style = { width: size, height: size, fontSize: size * 0.42 };
  if (url) style.backgroundImage = `url("${String(url).replace(/"/g, "%22")}")`;
  else style.background = avatarColor(name, locale);
  return <span className="mu-av" style={style} aria-hidden="true">{url ? "" : upper(String(name || "?").charAt(0), locale)}</span>;
}

function Tag({ map, k, dot }) {
  const { t } = useLocale();
  const [label, c] = map[k] || map.general || [null, "#9AA3B8"];
  return (
    <span className="tg" style={{ background: `color-mix(in srgb,${c} 17%,transparent)`, color: `color-mix(in srgb,${c} 80%,#fff)` }}>
      {dot ? <em style={{ background: c }} /> : null}
      {label ? t(label) : "?"}
    </span>
  );
}

function Pills({ map, cur, onPick, label }) {
  const { t } = useLocale();
  return (
    <div className="fb3-pills" role="radiogroup" aria-label={label}>
      {Object.entries(map).map(([k, [l, c]]) => (
        <button
          key={k}
          type="button"
          role="radio"
          aria-checked={k === cur}
          onClick={() => k !== cur && onPick(k)}
          style={k === cur ? { background: `color-mix(in srgb,${c} 24%,transparent)`, color: "#fff", boxShadow: `inset 0 0 0 1px color-mix(in srgb,${c} 60%,transparent)` } : undefined}
        >
          <em style={{ background: c }} />{t(l)}
        </button>
      ))}
    </div>
  );
}

function Menu({ items, style, onClose }) {
  return (
    <>
      <div className="fb3-scrim" onClick={onClose} />
      <div className="fb3-menu fb3-heavy" style={style} role="menu">
        {items.map((it) => (
          <button key={it.key} type="button" role="menuitemradio" aria-checked={Boolean(it.on)} onClick={() => { it.onPick(); onClose(); }}>
            {it.dot ? <em style={{ background: it.dot }} /> : null}
            <span className="x">{it.label}</span>
            {it.on ? <I name="check" size={15} stroke={2.6} /> : null}
          </button>
        ))}
      </div>
    </>
  );
}

function useAttachmentSize(url, locale) {
  const [size, setSize] = useState(null);
  useEffect(() => {
    let live = true;
    if (!url || !/^https?:|^\//.test(url)) return undefined;
    fetch(url, { method: "HEAD" })
      .then((r) => (r.ok ? Number(r.headers.get("content-length")) : null))
      .then((n) => live && setSize(formatBytes(n, locale)))
      .catch(() => {});
    return () => { live = false; };
  }, [url, locale]);
  return size;
}

function Attachment({ url, device, onZoom }) {
  const { t, locale } = useLocale();
  const size = useAttachmentSize(url, locale);
  const isImg = /\.(png|jpe?g|gif|webp|heic|avif)(\?|$)/i.test(url) || /\/image\//.test(url);
  return (
    <div className="fb3-att">
      {isImg ? <img src={url} alt="" loading="lazy" /> : null}
      <div className="f">
        <b>{fileName(url, t)}</b><br />
        {[size, device].filter(Boolean).join(" · ") || t("adminx.fb.attachment")}<br />
        {isImg ? <><button type="button" onClick={() => onZoom(url)}>{t("adminx.fb.zoom")}</button><span style={{ color: "#8FA6FF" }}> · </span></> : null}
        <a href={url} target="_blank" rel="noreferrer noopener" download>{t("adminx.fb.download")}</a>
      </div>
    </div>
  );
}

function Thread({ f, now, onZoom }) {
  const { t, locale } = useLocale();
  return (
    <div className="fb3-th">
      <div className="fb3-msg">
        <Av name={f.user.username} url={f.user.avatarUrl} size={28} />
        <div className="bb">
          <div className="h">{f.user.username} · {relTime(f.created_at, locale, now)}</div>
          {f.message}
          {f.attachments.map((u) => <Attachment key={u} url={u} device={f.meta?.device} onZoom={onZoom} />)}
        </div>
      </div>
      {f.replies.map((r) => {
        if (r.type === "system") return <div key={r.id} className="fb3-sys">{localizedField(r, "text")} · {relTime(r.created_at, locale, now)}</div>;
        const note = r.type === "note";
        if (r.type === "reply" && r.isAdmin === false) {
          return (
            <div key={r.id} className="fb3-msg">
              <Av name={f.user.username} url={f.user.avatarUrl} size={28} />
              <div className="bb"><div className="h">{f.user.username} · {relTime(r.created_at, locale, now)}</div>{localizedField(r, "text")}</div>
            </div>
          );
        }
        return (
          <div key={r.id} className={`fb3-msg me${note ? " note" : ""}`}>
            <Av name={r.adminUsername || t("adminx.fb.adminName")} size={28} />
            <div className="bb">
              <div className="h">{r.adminUsername || t("adminx.fb.adminRole")} · {note ? t("adminx.fb.internalNote") : t("adminx.fb.adminRole")} · {relTime(r.created_at, locale, now)}</div>
              {localizedField(r, "text")}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Composer({ onSend, busy }) {
  const { t } = useLocale();
  const [mode, setMode] = useState("reply");
  const [text, setText] = useState("");
  const [menu, setMenu] = useState(false);
  const ta = useRef(null);
  useEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "20px";
    el.style.height = `${Math.min(120, el.scrollHeight)}px`;
  }, [text]);
  const send = async () => {
    const v = text.trim();
    if (!v || busy) return;
    if (await onSend(v, mode === "note")) setText("");
  };
  return (
    <div className="fb3-cmp">
      <div className="md" role="tablist">
        <button type="button" role="tab" aria-selected={mode === "reply"} className={mode === "reply" ? "on" : ""} onClick={() => setMode("reply")}>{t("adminx.fb.modeReply")}</button>
        <button type="button" role="tab" aria-selected={mode === "note"} className={mode === "note" ? "on" : ""} onClick={() => setMode("note")}>{t("adminx.fb.modeNote")}</button>
      </div>
      <div className="in">
        <button type="button" className="pl" aria-label={t("adminx.fb.quickReplies")} onClick={() => setMenu(true)}><I name="plus" size={18} stroke={2.2} /></button>
        <textarea
          ref={ta}
          rows={1}
          value={text}
          maxLength={4000}
          aria-label={mode === "note" ? t("adminx.fb.modeNote") : t("adminx.fb.modeReply")}
          placeholder={mode === "note" ? t("adminx.fb.phNote") : t("adminx.fb.phReply")}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
        />
        <button type="button" className="snd" disabled={!text.trim() || busy} onClick={send}><I name="send" size={13} stroke={2.4} />{t("adminx.fb.send")}</button>
      </div>
      {menu ? (
        <Menu
          style={{ left: 8, bottom: "calc(100% + 6px)", width: 320 }}
          onClose={() => setMenu(false)}
          items={QUICK_REPLIES.map((key) => {
            const q = t(key);
            return { key, label: q, onPick: () => { setText(q); ta.current?.focus(); } };
          })}
        />
      ) : null}
    </div>
  );
}

function Detail({ f, now, phone, onPatch, onDelete, onReply, onCopyId, onProfile, onZoom, busy }) {
  const { t, locale } = useLocale();
  const userLine = [
    t("adminx.fb.member"),
    memberSince(f.user.createdAt, t, locale),
    t("adminx.fb.feedbackCount", { count: f.user.feedbackCount || 1 }),
  ].filter(Boolean).join(" · ");
  const m = f.meta || {};
  const facts = formFacts(f, t);
  return (
    <>
      {phone ? null : (
        <div className="fb3-dh">
          <Tag map={TYPES} k={f.category} />
          <span className="ti">{titleOf(f, t)}</span>
          <span style={{ marginLeft: "auto" }} />
          <button type="button" className="qa g" disabled={f.status === "resolved"} onClick={() => onPatch({ status: "resolved" })}><I name="check" size={14} stroke={2.6} />{t("adminx.fb.status.resolved")}</button>
          <button type="button" className="qa" disabled={f.status === "closed"} onClick={() => onPatch({ status: "closed" })}><I name="x" size={14} stroke={2.4} />{t("adminx.fb.close")}</button>
          <button type="button" className="qa r" aria-label={t("adminx.fb.delete")} onClick={onDelete}><I name="trash" size={15} stroke={2.1} /></button>
        </div>
      )}
      <div className="fb3-ds">
        {phone ? <div className="fb3-ttl"><Tag map={TYPES} k={f.category} />{titleOf(f, t)}</div> : null}
        <div className="fb3-user">
          <Av name={f.user.username} url={f.user.avatarUrl} size={46} />
          <div style={{ minWidth: 0 }}>
            <div className="n">{f.user.username}</div>
            <div className="s">{userLine}</div>
          </div>
          <div className="lk">
            <button type="button" className="fb3-chip" aria-label={t("adminx.fb.copyId")} onClick={onCopyId}><I name="copy" size={13} stroke={2} />{t("adminx.fb.copyId")}</button>
            <button type="button" className="fb3-chip" aria-label={t("adminx.fb.profile")} onClick={onProfile}><I name="user" size={13} stroke={2} />{t("adminx.fb.profile")}</button>
          </div>
        </div>
        <div className="fb3-meta">
          <div><small>{t("adminx.fb.metaPlatform")}</small>{m.platform || "—"}</div>
          <div><small>{t("adminx.fb.metaVersion")}</small>{m.version || "—"}</div>
          <div><small>{t("adminx.fb.metaDevice")}</small>{m.device || "—"}</div>
          <div><small>{t("adminx.fb.metaSent")}</small>{sentAt(f.created_at, locale)}</div>
        </div>
        {facts.length ? (
          <div className="fb3-facts">{facts.map((x) => <span key={x}>{x}</span>)}</div>
        ) : null}
        <div className="fb3-ctl">
          <div><div className="lb">{t("adminx.fb.labelStatus")}</div><Pills map={STATUSES} cur={f.status} label={t("adminx.fb.statusAria")} onPick={(status) => onPatch({ status })} /></div>
          <div><div className="lb">{t("adminx.fb.labelPriority")}</div><Pills map={PRIORITIES} cur={f.priority} label={t("adminx.fb.priorityAria")} onPick={(priority) => onPatch({ priority })} /></div>
        </div>
        <Thread f={f} now={now} onZoom={onZoom} />
      </div>
      <Composer key={f.id} busy={busy} onSend={onReply} />
    </>
  );
}

function Row({ f, sel, now, onOpen }) {
  const { t, locale } = useLocale();
  const att = f.attachments.length;
  const rep = replyCount(f);
  return (
    <button type="button" className={`fb3-row${sel ? " sel" : ""}`} aria-current={sel ? "true" : undefined} onClick={() => onOpen(f)}>
      <Av name={f.user.username} url={f.user.avatarUrl} size={38} />
      <div className="c">
        <div className="l1">
          {isUnread(f) ? <span className="ud" aria-label={t("adminx.fb.unread")} /> : null}
          <span className="nm">{f.user.username}</span>
          <span className="ago">{relTime(f.created_at, locale, now)}</span>
        </div>
        <div className="pv">{f.message}</div>
        <div className="bd">
          <Tag map={TYPES} k={f.category} />
          <Tag map={PRIORITIES} k={f.priority} dot />
          <Tag map={STATUSES} k={f.status} dot />
          <span className="meta">
            {att ? <span><I name="img" size={12} stroke={2} />{att}</span> : null}
            {rep ? <span><I name="msg" size={12} stroke={2} />{rep}</span> : null}
          </span>
        </div>
      </div>
    </button>
  );
}

function isMacLike() {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || "");
}

export default function AdminFeedbackV3({ socket, layout = "desktop", extraNav = [], onGoto, onClose, onOpenProfile, onUnread, embedded = false }) {
  const { t, locale } = useLocale();
  const phone = layout === "phone";
  const ipad = layout === "ipad";
  const [items, setItems] = useState([]);
  const [sample, setSample] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadErr, setLoadErr] = useState(false);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [type, setType] = useState("all");
  const [priority, setPriority] = useState("all");
  const [sort, setSort] = useState("newest");
  const [selId, setSelId] = useState(null);
  const [pushed, setPushed] = useState(false);
  const [menu, setMenu] = useState(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState(null);
  const [navMore, setNavMore] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const searchRef = useRef(null);
  const toastTimer = useRef(null);

  const flash = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2200);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(id); }, []);

  const load = useCallback(async () => {
    try {
      const d = await adminFetch("/feedback?sort=newest");
      setItems(Array.isArray(d?.feedbacks) ? d.feedbacks : []);
      setSample(Boolean(d?.sample));
      setLoadErr(false);
    } catch {
      setLoadErr(true);
    } finally {
      setLoaded(true);
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!socket?.on) return undefined;
    const onNew = () => load();
    socket.on("feedback:new", onNew);
    socket.on("feedback:user_reply", onNew);
    return () => {
      socket.off?.("feedback:new", onNew);
      socket.off?.("feedback:user_reply", onNew);
    };
  }, [socket, load]);

  const all = useMemo(() => countAll(items), [items]);
  useEffect(() => { onUnread?.(all.unread); }, [all.unread, onUnread]);
  const list = useMemo(() => applyFilters(items, { q, status, type, priority, sort, locale }), [items, q, status, type, priority, sort, locale]);
  // Desktop / iPad keep a row open; the first one is shown without marking it read.
  const sel = useMemo(() => {
    const hit = list.find((f) => f.id === selId);
    if (hit) return hit;
    return phone ? null : list[0] || null;
  }, [list, selId, phone]);

  useEffect(() => {
    if (phone) return undefined;
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      } else if (e.key === "Escape" && !embedded && !confirmDel && !menu && !zoom) {
        onClose?.();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phone, embedded, confirmDel, menu, zoom, onClose]);

  const merge = (f) => f && setItems((prev) => prev.map((x) => (x.id === f.id ? f : x)));

  const open = async (f) => {
    setSelId(f.id);
    if (phone) setPushed(true);
    if (isUnread(f)) {
      setItems((prev) => prev.map((x) => (x.id === f.id ? { ...x, viewed: true } : x)));
      adminFetch(`/feedback/${encodeURIComponent(f.id)}/view`, { method: "POST" }).catch(() => {});
    }
  };

  const patch = async (body) => {
    if (!sel) return;
    const before = sel;
    setItems((prev) => prev.map((x) => (x.id === before.id ? { ...x, ...body } : x)));
    try {
      const d = await adminFetch(`/feedback/${encodeURIComponent(before.id)}`, { method: "PATCH", body: JSON.stringify(body) });
      merge(d?.feedback);
    } catch {
      merge(before);
      flash(t("adminx.fb.saveError"));
    }
  };

  const reply = async (text, internal) => {
    if (!sel) return false;
    setBusy(true);
    try {
      const d = await adminFetch(`/feedback/${encodeURIComponent(sel.id)}/reply`, { method: "POST", body: JSON.stringify({ text, internal }) });
      merge(d?.feedback);
      flash(internal ? t("adminx.fb.noteAdded") : t("adminx.fb.replySent"));
      return true;
    } catch {
      flash(t("adminx.fb.sendError"));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const f = sel;
    setConfirmDel(false);
    if (!f) return;
    try {
      await adminFetch(`/feedback/${encodeURIComponent(f.id)}`, { method: "DELETE" });
      setItems((prev) => prev.filter((x) => x.id !== f.id));
      setSelId(null);
      setPushed(false);
      flash(t("adminx.fb.deleted"));
    } catch {
      flash(t("adminx.fb.deleteError"));
    }
  };

  const copyId = async () => {
    if (!sel) return;
    try {
      await navigator.clipboard.writeText(String(sel.user.id));
      flash(t("adminx.fb.idCopied"));
    } catch {
      flash(t("adminx.fb.copyError"));
    }
  };

  const allLabel = t("adminx.fb.all");
  const typeItems = [{ key: "all", label: allLabel, on: type === "all", onPick: () => setType("all") },
    ...Object.entries(TYPES).filter(([k]) => k !== "other" || all.byType.other).map(([k, [l, c]]) => ({ key: k, label: `${t(l)} · ${all.byType[k] || 0}`, dot: c, on: type === k, onPick: () => setType(k) }))];
  const prioItems = [{ key: "all", label: allLabel, on: priority === "all", onPick: () => setPriority("all") },
    ...Object.entries(PRIORITIES).map(([k, [l, c]]) => ({ key: k, label: t(l), dot: c, on: priority === k, onPick: () => setPriority(k) }))];
  const sortItems = Object.entries(SORTS).map(([k, l]) => ({ key: k, label: t(l), on: sort === k, onPick: () => setSort(k) }));
  const statusTabs = [["all", "adminx.fb.all"], ...Object.entries(STATUSES).map(([k, [l]]) => [k, l])];

  const toolbar = (
    <>
      <div className="fb3-srch">
        <label className="f">
          <I name="search" size={15} stroke={2.2} />
          <input ref={searchRef} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("adminx.fb.searchPlaceholder")} aria-label={t("adminx.fb.searchAria")} />
          {phone || ipad || q ? null : <kbd>{isMacLike() ? "⌘ K" : "Ctrl K"}</kbd>}
        </label>
        <button type="button" className="fb3-sort" aria-haspopup="menu" onClick={() => setMenu("sort")}><I name="down" size={13} stroke={2.4} />{t(SORTS[sort])}</button>
      </div>
      <div className="fb3-seg" role="tablist" aria-label={t("adminx.fb.statusAria")}>
        {statusTabs.map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={status === k} className={status === k ? "on" : ""} onClick={() => setStatus(k)}>{t(l)}<i>{all.byStatus[k] || 0}</i></button>
        ))}
      </div>
      <div className="fb3-chips">
        <button type="button" className={`fb3-chip${type !== "all" && !QUICK_TYPES.includes(type) ? " on" : ""}`} aria-haspopup="menu" onClick={() => setMenu("type")}>
          <I name="filter" size={13} stroke={2} />{t("adminx.fb.chipType", { value: type === "all" ? allLabel : t(TYPES[type][0]) })} <I name="down" size={12} stroke={2.4} />
        </button>
        <button type="button" className={`fb3-chip${priority !== "all" ? " on" : ""}`} aria-haspopup="menu" onClick={() => setMenu("prio")}>
          {t("adminx.fb.chipPriority", { value: priority === "all" ? allLabel : t(PRIORITIES[priority][0]) })} <I name="down" size={12} stroke={2.4} />
        </button>
        {QUICK_TYPES.filter((k) => all.byType[k]).map((k) => (
          <button key={k} type="button" aria-pressed={type === k} className={`fb3-chip${type === k ? " on" : ""}`} onClick={() => setType(type === k ? "all" : k)}>
            <em style={{ background: TYPES[k][1] }} />{t(TYPES[k][0])} {all.byType[k]}
          </button>
        ))}
      </div>
      {menu === "sort" ? <Menu items={sortItems} onClose={() => setMenu(null)} style={{ right: 14, top: 54 }} /> : null}
      {menu === "type" ? <Menu items={typeItems} onClose={() => setMenu(null)} style={{ left: 14, top: phone ? 92 : 132 }} /> : null}
      {menu === "prio" ? <Menu items={prioItems} onClose={() => setMenu(null)} style={{ left: 120, top: phone ? 92 : 132 }} /> : null}
    </>
  );

  const rows = (
    <div className="fb3-list">
      {list.map((f) => <Row key={f.id} f={f} now={now} sel={!phone && sel?.id === f.id} onOpen={open} />)}
      {loaded && !list.length ? (
        <div className="fb3-empty">{loadErr ? t("adminx.fb.loadError") : items.length ? t("adminx.fb.emptyFiltered") : t("adminx.fb.emptyNone")}</div>
      ) : null}
    </div>
  );

  const detail = sel ? (
    <Detail
      f={sel}
      now={now}
      phone={phone}
      busy={busy}
      onPatch={patch}
      onDelete={() => setConfirmDel(true)}
      onReply={reply}
      onCopyId={copyId}
      onProfile={() => onOpenProfile?.(sel.user.id)}
      onZoom={setZoom}
    />
  ) : null;

  const overlays = (
    <>
      {confirmDel && sel ? (
        <div className="fb3-alertwrap">
          <div className="fb3-dim" onClick={() => setConfirmDel(false)} />
          <div className="fb3-alert fb3-heavy" role="alertdialog" aria-modal="true" aria-labelledby="fb3-del-t">
            <div className="bd"><h4 id="fb3-del-t">{t("adminx.fb.deleteTitle")}</h4><p>{deleteMessage(sel, t, locale)}</p></div>
            <div className="bt">
              <button type="button" autoFocus onClick={() => setConfirmDel(false)}>{t("adminx.fb.cancel")}</button>
              <button type="button" className="red" onClick={remove}>{t("adminx.fb.delete")}</button>
            </div>
          </div>
        </div>
      ) : null}
      {zoom ? <div className="fb3-lightbox" onClick={() => setZoom(null)}><img src={zoom} alt={t("adminx.fb.attachment")} /></div> : null}
      {toast ? <div className="fb3-toast fb3-heavy" role="status"><I name="check" size={16} stroke={2.6} />{toast}</div> : null}
    </>
  );

  if (phone) {
    const inDetail = pushed && sel;
    return (
      <div className={`fb3 fb3-phone${embedded ? " is-embedded" : ""}`} data-fb3="phone">
        {embedded ? null : <div className="fb3-dim" />}
        {inDetail ? (
          <div className="fb3-fp fb3-heavy">
            <div className="fb3-nv">
              <span className="l"><button type="button" onClick={() => setPushed(false)}><I name="chevl" size={22} stroke={2.4} /><span>{t("adminx.fb.nav.feedback")}</span></button></span>
              <span />
              <span className="r" style={{ gap: 16 }}>
                <button type="button" aria-label={t("adminx.fb.status.resolved")} style={{ color: "#7CF0A0" }} onClick={() => patch({ status: "resolved" })}><I name="check" size={20} stroke={2.6} /></button>
                <button type="button" aria-label={t("adminx.fb.delete")} style={{ color: "#FF7A70" }} onClick={() => setConfirmDel(true)}><I name="trash" size={20} stroke={2.1} /></button>
              </span>
            </div>
            <div className="fb3-det" style={{ flex: 1 }}>{detail}</div>
          </div>
        ) : (
          <div className="fb3-fp fb3-heavy">
            <div className="fb3-nv">
              <span className="l">{embedded ? null : <button type="button" onClick={() => onGoto?.("overview")}><I name="chevl" size={22} stroke={2.4} /><span>{t("adminx.fb.phoneAdmin")}</span></button>}</span>
              <span />
              <span className="r" style={{ gap: 14 }}>
                <button type="button" aria-label={t("adminx.fb.sortAria")} onClick={() => setMenu("sort")}><I name="down" size={20} stroke={2.2} /></button>
                <button type="button" aria-label={t("adminx.fb.moreAria")} onClick={() => setMenu("more")}><I name="more" size={20} stroke={2.2} /></button>
              </span>
            </div>
            {embedded ? null : <div className="lt">{t("adminx.fb.nav.feedback")}{sample ? <span className="ex">{t("adminx.fb.sample")}</span> : null}</div>}
            <div className="tb">{toolbar}</div>
            {rows}
            {menu === "more" ? (
              <Menu
                onClose={() => setMenu(null)}
                style={{ right: 12, top: 100 }}
                items={[{ key: "r", label: t("adminx.fb.refresh"), onPick: load }, { key: "c", label: t("adminx.fb.closePanel"), onPick: () => onClose?.() }]}
              />
            ) : null}
          </div>
        )}
        {overlays}
      </div>
    );
  }

  // Inside the 3.1 admin shell (its sidebar lists every section): list + detail only.
  if (embedded) {
    return (
      <div className="fb3 is-embedded" data-fb3={layout}>
        <div className="fb3-body">
          <div className="fb3-col" style={{ "--lw": ipad ? "360px" : "420px" }}>
            <div className="fb3-tb">{toolbar}</div>
            {rows}
          </div>
          <div className="fb3-det">{detail || <div className="fb3-empty" style={{ margin: "auto" }}>{loaded ? t("adminx.fb.pickOne") : ""}</div>}</div>
        </div>
        {overlays}
      </div>
    );
  }

  return (
    <div className="fb3" data-fb3={layout}>
      <div className="fb3-dim" onClick={onClose} />
      <div className="fb3-win fb3-heavy" role="dialog" aria-modal="true" aria-label={t("adminx.fb.windowAria")} style={{ "--w": ipad ? "1150px" : "1360px", "--h": ipad ? "790px" : "840px" }}>
        <div className="fb3-hd">
          <button type="button" className="home" onClick={() => onGoto?.("overview")} title={t("adminx.fb.sections")}>
            <img src={logoIcon} alt="" />
            <span className="tt">{t("adminx.fb.panelTitle")}<small>{t("adminx.fb.panelSubtitle", { count: items.length })}</small></span>
          </button>
          {sample ? <span className="fb3-ex">{t("adminx.fb.sampleData")}</span> : null}
          <button type="button" className="x" aria-label={t("adminx.fb.close")} onClick={onClose} style={sample ? undefined : { marginLeft: "auto" }}><I name="x" size={15} stroke={2.4} /></button>
        </div>
        <div className="fb3-body">
          {ipad ? null : (
            <nav className="fb3-nav" aria-label={t("adminx.fb.sections")}>
              {FB3_NAV.map(([id, label, icon]) => (
                <button key={id} type="button" className={id === "feedback" ? "on" : ""} aria-current={id === "feedback" ? "page" : undefined} onClick={() => id !== "feedback" && onGoto?.(id)}>
                  <I name={icon} size={16} stroke={2} />{t(label)}{id === "feedback" && all.unread ? <b>{all.unread}</b> : null}
                </button>
              ))}
              {navMore || !extraNav.length ? null : (
                <button type="button" className="more" onClick={() => setNavMore(true)}><I name="more" size={16} stroke={2} />{t("adminx.fb.moreSections", { count: extraNav.length })}</button>
              )}
              {navMore ? extraNav.map(([id, label]) => (
                <button key={id} type="button" onClick={() => onGoto?.(id)}><I name="more" size={16} stroke={2} />{label}</button>
              )) : null}
            </nav>
          )}
          <div className="fb3-col" style={{ "--lw": ipad ? "400px" : "440px" }}>
            <div className="fb3-tb">{toolbar}</div>
            {rows}
          </div>
          <div className="fb3-det">{detail || <div className="fb3-empty" style={{ margin: "auto" }}>{loaded ? t("adminx.fb.pickOne") : ""}</div>}</div>
        </div>
      </div>
      {overlays}
    </div>
  );
}
