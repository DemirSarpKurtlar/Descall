import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { localizedField } from "../../i18n/serverText.js";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Bug, CheckCircle2, ChevronLeft, Clock, Heart, ImagePlus, Lightbulb, Loader2,
  MessageSquare, Monitor, PenLine, RefreshCw, Send, Star, X,
} from "../ui/Icon.jsx";
import { DescallMark } from "../social/AdminBadge.jsx";
import { useT } from "../../context/LocaleContext";
import { markFeedbackSubmitted } from "../../lib/feedbackNudge";
import { resolveRuntimeVersion } from "../../lib/appVersion";
import {
  AREAS, AREA_LABEL, FREQUENCIES, FREQ_LABEL, KINDS, LIKES, LIKE_LABEL, MAX_SHOTS, MAX_SHOT_BYTES,
  MAX_TEXT, STATUS_LABEL, buildSubmitBody, canSubmit, emptyForm, relTime, totalUnread,
} from "../../lib/feedbackForm";
import {
  getMyFeedback, getMyFeedbackUnread, listMyFeedback, replyMyFeedback, submitFeedback, uploadFeedbackShot,
} from "../../api/feedback";
import "../../styles/feedback-a.css";

const KIND_ICON = { suggestion: Lightbulb, bug: Bug, praise: Heart };
const VALID_TYPES = new Set(["suggestion", "bug", "praise"]);

function KindTile({ kind, size = 17 }) {
  const Icon = KIND_ICON[kind] || Lightbulb;
  return (
    <span className={`fbk-ti is-${kind}`} aria-hidden="true">
      <Icon size={size} weight="fill" />
    </span>
  );
}

function StatusPill({ status, t }) {
  return <span className={`fbk-pill is-${status || "new"}`}>{t(STATUS_LABEL[status] || STATUS_LABEL.new)}</span>;
}

function TeamName({ t, time }) {
  return (
    <div className="fbk-who">
      <span className="fbk-mark" aria-hidden="true"><DescallMark size={11} /></span>
      <b>{t("fbk.team")}</b>
      <span className="fbk-team">{t("fbk.teamBadge")}</span>
      {time ? <time>{time}</time> : null}
    </div>
  );
}

/**
 * Geri bildirim penceresi (3.7.14, owner pick "A"). Two tabs: "Yeni" (type
 * cards, a question per type, where / how often / stars / likes, up to 3
 * screenshots, device info toggle) and "Geri bildirimlerim" (the sender's
 * list with status and unread, and each thread with the Descall team, where
 * they can reply). Opened by the `descall:open-feedback` window event
 * (lib/feedbackNudge.openFeedbackModal) with { type, tab, feedbackId }.
 */
export default function QuickFeedbackModal({
  isOpen,
  onClose,
  initialType = "suggestion",
  initialTab = "new",
  initialId = null,
}) {
  const t = useT();
  const reduce = useReducedMotion();
  const [tab, setTab] = useState("new");
  const [form, setForm] = useState(() => emptyForm());
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(null);
  const [device, setDevice] = useState({ platform: "", version: "" });
  const [unread, setUnread] = useState(0);
  const [list, setList] = useState({ items: null, loading: false, error: "" });
  const [openId, setOpenId] = useState(null);
  const [thread, setThread] = useState({ item: null, loading: false, error: "" });
  const [reply, setReply] = useState("");
  const [replying, setReplying] = useState(false);
  const [replyError, setReplyError] = useState("");
  const fileRef = useRef(null);
  const threadEndRef = useRef(null);

  // Reset on every open; jump to a thread when asked (notification / toast tap).
  useEffect(() => {
    if (!isOpen) return;
    setForm(emptyForm(VALID_TYPES.has(initialType) ? initialType : "suggestion"));
    setSending(false);
    setError("");
    setSent(null);
    setReply("");
    setReplyError("");
    setTab(initialTab === "mine" || initialId ? "mine" : "new");
    setOpenId(initialId || null);
    setThread({ item: null, loading: false, error: "" });
    getMyFeedbackUnread().then((d) => setUnread(Number(d?.unread) || 0)).catch(() => {});
    resolveRuntimeVersion().then((v) => setDevice({ platform: v?.platform || "", version: v?.version || "" })).catch(() => {});
  }, [isOpen, initialType, initialTab, initialId]);

  const loadList = useCallback(async () => {
    setList((l) => ({ ...l, loading: true, error: "" }));
    try {
      const d = await listMyFeedback();
      const items = Array.isArray(d?.items) ? d.items : [];
      setList({ items, loading: false, error: "" });
      setUnread(totalUnread(items));
    } catch {
      setList((l) => ({ ...l, loading: false, error: t("fbk.loadFailed") }));
    }
  }, [t]);

  const loadThread = useCallback(async (id, { quiet = false } = {}) => {
    if (!id) return;
    if (!quiet) setThread({ item: null, loading: true, error: "" });
    try {
      const d = await getMyFeedback(id);
      setThread({ item: d?.item || null, loading: false, error: "" });
      setList((l) => (l.items ? { ...l, items: l.items.map((i) => (i.id === id ? { ...i, unread: 0, status: d?.item?.status || i.status } : i)) } : l));
      getMyFeedbackUnread().then((u) => setUnread(Number(u?.unread) || 0)).catch(() => {});
    } catch {
      if (!quiet) setThread({ item: null, loading: false, error: t("fbk.loadFailed") });
    }
  }, [t]);

  useEffect(() => {
    if (!isOpen || tab !== "mine") return;
    if (openId) loadThread(openId);
    else loadList();
  }, [isOpen, tab, openId, loadList, loadThread]);

  // Live: the team answered / changed the status while the window is open.
  useEffect(() => {
    if (!isOpen) return undefined;
    const onLive = (e) => {
      const id = e?.detail?.feedbackId;
      if (openId && id === openId) loadThread(openId, { quiet: true });
      else if (tab === "mine" && !openId) loadList();
      else setUnread((n) => n + 1);
    };
    window.addEventListener("descall:feedback-live", onLive);
    return () => window.removeEventListener("descall:feedback-live", onLive);
  }, [isOpen, openId, tab, loadList, loadThread]);

  useEffect(() => {
    if (thread.item) threadEndRef.current?.scrollIntoView?.({ block: "end" });
  }, [thread.item]);

  const close = () => onClose?.();
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  const kindMeta = useMemo(() => KINDS.find((k) => k.id === form.kind) || KINDS[0], [form.kind]);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const addShots = async (files) => {
    const room = MAX_SHOTS - form.shots.length;
    const picked = [...(files || [])].filter((f) => /^image\//.test(f.type)).slice(0, Math.max(0, room));
    for (const file of picked) {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      if (file.size > MAX_SHOT_BYTES) {
        setError(t("fbk.shotTooBig"));
        continue;
      }
      const preview = URL.createObjectURL(file);
      setForm((f) => ({ ...f, shots: [...f.shots, { id, preview, uploading: true }] }));
      try {
        const url = await uploadFeedbackShot(file);
        setForm((f) => ({ ...f, shots: f.shots.map((s) => (s.id === id ? { ...s, url, uploading: false } : s)) }));
      } catch {
        setForm((f) => ({ ...f, shots: f.shots.map((s) => (s.id === id ? { ...s, uploading: false, error: true } : s)) }));
        setError(t("fbk.shotFailed"));
      }
    }
  };
  const removeShot = (id) => setForm((f) => {
    const s = f.shots.find((x) => x.id === id);
    if (s?.preview) try { URL.revokeObjectURL(s.preview); } catch { /* ignore */ }
    return { ...f, shots: f.shots.filter((x) => x.id !== id) };
  });

  const submit = async () => {
    if (!canSubmit(form)) {
      if (form.text.trim().length < 5) setError(t("fbk.tooShort"));
      return;
    }
    setSending(true);
    setError("");
    try {
      const d = await submitFeedback(buildSubmitBody(form, device));
      markFeedbackSubmitted();
      setSent({ id: d?.feedbackId || d?.item?.id || null });
      setList({ items: null, loading: false, error: "" });
    } catch (err) {
      setError(err?.status === 429 ? t("fbk.rateLimited") : t("fbk.sendFailed"));
    } finally {
      setSending(false);
    }
  };

  const sendReply = async () => {
    const text = reply.trim();
    if (!text || !openId || replying) return;
    setReplying(true);
    setReplyError("");
    try {
      const d = await replyMyFeedback(openId, text);
      setReply("");
      if (d?.item) setThread({ item: d.item, loading: false, error: "" });
    } catch (err) {
      setReplyError(err?.message && err.status === 409 ? err.message : t("fbk.replyFailed"));
    } finally {
      setReplying(false);
    }
  };

  const openThread = (id) => {
    setTab("mine");
    setOpenId(id);
  };

  if (typeof document === "undefined") return null;

  const deviceText = [device.platform, device.version].filter(Boolean).join(" · ");

  const renderForm = () => (
    <>
      <div className="fbk-bd">
        <div className="fbk-types" role="radiogroup" aria-label={t("fbk.title")}>
          {KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              role="radio"
              aria-checked={form.kind === k.id}
              className={`fbk-type is-${k.id}${form.kind === k.id ? " is-on" : ""}`}
              onClick={() => set({ kind: k.id })}
            >
              <KindTile kind={k.id} />
              <b>{t(k.label)}</b>
              <small>{t(k.hint)}</small>
            </button>
          ))}
        </div>

        {form.kind === "praise" ? (
          <div className="fbk-box fbk-rate">
            <div>
              <b>{t("fbk.overall")}</b>
              <small>{form.rating ? t("fbk.ratingLabels").split("|")[form.rating - 1] : " "}</small>
            </div>
            <div className="fbk-stars" role="radiogroup" aria-label={t("fbk.overall")}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" role="radio" aria-checked={form.rating === n}
                  className={form.rating >= n ? "is-on" : ""} onClick={() => set({ rating: n })}
                  aria-label={t("fbk.ratingLabels").split("|")[n - 1]}>
                  <Star size={22} weight="fill" />
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <label className="fbk-sec" htmlFor="quick-feedback-text">{t(kindMeta.q)}</label>
        <div className="fbk-ta-wrap">
          <textarea
            id="quick-feedback-text"
            className="fbk-ta"
            value={form.text}
            maxLength={MAX_TEXT}
            rows={4}
            placeholder={t(kindMeta.ph)}
            onChange={(e) => { set({ text: e.target.value }); if (error) setError(""); }}
            aria-invalid={error ? "true" : undefined}
          />
          <span className="fbk-count">{form.text.length}/{MAX_TEXT}</span>
        </div>

        {form.kind === "praise" ? (
          <>
            <div className="fbk-sec">{t("fbk.likesQ")}</div>
            <div className="fbk-chips">
              {LIKES.map((l) => {
                const on = form.likes.includes(l);
                return (
                  <button key={l} type="button" aria-pressed={on} className={`fbk-chip${on ? " is-on" : ""}`}
                    onClick={() => setForm((f) => ({ ...f, likes: f.likes.includes(l) ? f.likes.filter((x) => x !== l) : [...f.likes, l] }))}>
                    {t(LIKE_LABEL[l])}
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <div className="fbk-sec">{t("fbk.where")}</div>
            <div className="fbk-chips">
              {AREAS.map((a) => (
                <button key={a} type="button" aria-pressed={form.area === a} className={`fbk-chip${form.area === a ? " is-on" : ""}`}
                  onClick={() => set({ area: form.area === a ? null : a })}>
                  {t(AREA_LABEL[a])}
                </button>
              ))}
            </div>
          </>
        )}

        {form.kind === "bug" ? (
          <>
            <div className="fbk-sec">{t("fbk.howOften")}</div>
            <div className="fbk-seg is-inline" role="radiogroup" aria-label={t("fbk.howOften")}>
              {FREQUENCIES.map((f) => (
                <button key={f} type="button" role="radio" aria-checked={form.frequency === f}
                  className={form.frequency === f ? "is-on" : ""} onClick={() => set({ frequency: f })}>
                  {t(FREQ_LABEL[f])}
                </button>
              ))}
            </div>
          </>
        ) : null}

        {form.kind !== "praise" ? (
          <>
            <div className="fbk-sec">{t("fbk.shots", { max: MAX_SHOTS })}</div>
            <div className="fbk-shots">
              {form.shots.map((s) => (
                <span key={s.id} className={`fbk-shot${s.error ? " is-error" : ""}`}>
                  <img src={s.preview} alt="" />
                  {s.uploading ? <span className="fbk-shot-busy"><Loader2 size={16} className="spin" /></span> : null}
                  <button type="button" className="fbk-shot-x" aria-label={t("fbk.removeShot")} onClick={() => removeShot(s.id)}>
                    <X size={11} weight="bold" />
                  </button>
                </span>
              ))}
              {form.shots.length < MAX_SHOTS ? (
                <button type="button" className="fbk-shot-add" aria-label={t("fbk.addShot")} onClick={() => fileRef.current?.click()}>
                  <ImagePlus size={20} />
                </button>
              ) : null}
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden
                onChange={(e) => { addShots(e.target.files); e.target.value = ""; }} />
            </div>
          </>
        ) : null}

        <button
          type="button"
          role="switch"
          aria-checked={form.includeDevice}
          className="fbk-box fbk-device"
          onClick={() => set({ includeDevice: !form.includeDevice })}
        >
          <Monitor size={18} />
          <span>
            <b>{t("fbk.device")}</b>
            <small>{deviceText || t("fbk.deviceHint")}</small>
          </span>
          <span className={`fbk-switch${form.includeDevice ? " is-on" : ""}`} aria-hidden="true" />
        </button>

        {error ? <p className="fbk-error" role="alert">{error}</p> : null}
      </div>
      <div className="fbk-ft">
        <small>{t("fbk.footer")}</small>
        <button type="button" className="fbk-btn" disabled={!canSubmit(form) || sending} aria-busy={sending} onClick={submit}>
          {sending ? <Loader2 size={16} className="spin" /> : <Send size={16} weight="fill" />}
          {sending ? t("fbk.sending") : t("fbk.send")}
        </button>
      </div>
    </>
  );

  const renderSent = () => (
    <div className="fbk-bd fbk-done">
      <span className="fbk-done-ic"><CheckCircle2 size={34} weight="fill" /></span>
      <h3>{t("fbk.sentTitle")}</h3>
      <p>{t("fbk.sentBody")}</p>
      <div className="fbk-done-row">
        <button type="button" className="fbk-btn is-ghost" onClick={close}>{t("fbk.sentClose")}</button>
        {sent?.id ? <button type="button" className="fbk-btn" onClick={() => openThread(sent.id)}>{t("fbk.sentOpen")}</button> : null}
      </div>
    </div>
  );

  const renderList = () => {
    if (list.loading && !list.items) return <div className="fbk-bd fbk-state"><Loader2 size={22} className="spin" /></div>;
    if (list.error && !list.items) {
      return (
        <div className="fbk-bd fbk-state">
          <p>{list.error}</p>
          <button type="button" className="fbk-btn is-ghost" onClick={loadList}><RefreshCw size={14} /> {t("fbk.retry")}</button>
        </div>
      );
    }
    const items = list.items || [];
    if (!items.length) {
      return (
        <div className="fbk-bd fbk-state">
          <span className="fbk-empty-ic"><MessageSquare size={26} /></span>
          <b>{t("fbk.emptyTitle")}</b>
          <p>{t("fbk.emptyBody")}</p>
          <button type="button" className="fbk-btn" onClick={() => setTab("new")}>{t("fbk.emptyCta")}</button>
        </div>
      );
    }
    return (
      <div className="fbk-bd">
        <div className="fbk-list">
          {items.map((i) => (
            <button key={i.id} type="button" className={`fbk-it${i.unread ? " is-unread" : ""}`} onClick={() => openThread(i.id)}>
              <KindTile kind={i.kind} size={15} />
              <span className="fbk-it-tx">
                <span className="fbk-it-t1">
                  <b>{i.subject || i.message}</b>
                  <StatusPill status={i.status} t={t} />
                </span>
                <span className="fbk-it-p">
                  {i.last ? (
                    <>
                      <em>{i.last.fromTeam ? t("fbk.teamPrefix") : t("fbk.youPrefix")}</em> {localizedField(i.last, "text")}
                    </>
                  ) : t("fbk.waiting")}
                </span>
              </span>
              <span className="fbk-it-side">
                <time>{relTime(i.updated_at || i.created_at, t)}</time>
                {i.unread ? <span className="fbk-dot" aria-label={String(i.unread)} /> : null}
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  };

  const renderThread = () => {
    const it = thread.item;
    if (thread.loading && !it) return <div className="fbk-bd fbk-state"><Loader2 size={22} className="spin" /></div>;
    if (!it) {
      return (
        <div className="fbk-bd fbk-state">
          <p>{thread.error || t("fbk.loadFailed")}</p>
          <button type="button" className="fbk-btn is-ghost" onClick={() => loadThread(openId)}><RefreshCw size={14} /> {t("fbk.retry")}</button>
        </div>
      );
    }
    const kind = KINDS.find((k) => k.id === it.kind) || KINDS[0];
    const KIcon = KIND_ICON[it.kind] || Lightbulb;
    return (
      <>
        <div className="fbk-bd fbk-thread-bd">
          <div className="fbk-thread-hd">
            <button type="button" className="fbk-back" onClick={() => { setOpenId(null); setThread({ item: null, loading: false, error: "" }); }} aria-label={t("fbk.back")}>
              <ChevronLeft size={18} />
            </button>
            <b>{it.subject || it.message}</b>
            <StatusPill status={it.status} t={t} />
          </div>
          <div className="fbk-kv">
            <span><KIcon size={12} weight="fill" /> {t(kind.label)}</span>
            {it.details?.area ? <span>{t(AREA_LABEL[it.details.area])}</span> : null}
            {it.details?.frequency ? <span>{t(FREQ_LABEL[it.details.frequency])}</span> : null}
            {it.rating ? <span><Star size={12} weight="fill" /> {it.rating}/5</span> : null}
            {it.device ? <span><Monitor size={12} /> {it.device}</span> : null}
            <span><Clock size={12} /> {relTime(it.created_at, t)}</span>
          </div>
          <div className="fbk-th">
            <div className="fbk-msg is-me">
              {it.message}
              {it.details?.likes?.length ? (
                <div className="fbk-msg-tags">{it.details.likes.map((l) => <span key={l}>{t(LIKE_LABEL[l])}</span>)}</div>
              ) : null}
              {it.attachments?.length ? (
                <div className="fbk-msg-shots">
                  {it.attachments.map((u) => <a key={u} href={u} target="_blank" rel="noreferrer"><img src={u} alt="" /></a>)}
                </div>
              ) : null}
            </div>
            {(it.thread || []).map((m) => {
              if (m.type === "status") {
                return (
                  <div key={m.id} className="fbk-sys">
                    {m.status === "resolved" ? <CheckCircle2 size={13} weight="fill" className="is-ok" /> : <RefreshCw size={12} />}
                    {t("fbk.statusLine", { status: t(STATUS_LABEL[m.status] || STATUS_LABEL.new) })}
                    {m.created_at ? ` · ${relTime(m.created_at, t)}` : ""}
                  </div>
                );
              }
              return (
                <div key={m.id} className={`fbk-msg ${m.fromTeam ? "is-team" : "is-me"}`}>
                  {m.fromTeam ? <TeamName t={t} time={relTime(m.created_at, t)} /> : null}
                  {localizedField(m, "text")}
                  {m.attachments?.length ? (
                    <div className="fbk-msg-shots">
                      {m.attachments.map((u) => <a key={u} href={u} target="_blank" rel="noreferrer"><img src={u} alt="" /></a>)}
                    </div>
                  ) : null}
                </div>
              );
            })}
            {!(it.thread || []).some((m) => m.type === "message" && m.fromTeam) ? (
              <div className="fbk-sys"><Clock size={12} /> {t("fbk.waiting")}</div>
            ) : null}
            <span ref={threadEndRef} />
          </div>
        </div>
        <div className="fbk-ft is-thread">
          {it.canReply ? (
            <>
              <div className="fbk-comp">
                <textarea
                  value={reply}
                  rows={1}
                  maxLength={MAX_TEXT}
                  placeholder={t("fbk.replyPh")}
                  onChange={(e) => { setReply(e.target.value); if (replyError) setReplyError(""); }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      sendReply();
                    }
                  }}
                />
                <button type="button" className="fbk-send" disabled={!reply.trim() || replying} aria-label={t("fbk.replySend")} onClick={sendReply}>
                  {replying ? <Loader2 size={16} className="spin" /> : <Send size={16} weight="fill" />}
                </button>
              </div>
              {replyError ? <p className="fbk-error" role="alert">{replyError}</p> : null}
              {it.status === "resolved" ? <small>{t("fbk.resolvedNote")}</small> : null}
            </>
          ) : (
            <small className="fbk-closed">{t("fbk.closedNote")}</small>
          )}
        </div>
      </>
    );
  };

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="feedback-overlay fbk-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <motion.div
            className="feedback-modal fbk"
            role="dialog"
            aria-modal="true"
            aria-labelledby="fbk-title"
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: 14 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: 14 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="fbk-hd">
              <span className="fbk-tile" aria-hidden="true"><MessageSquare size={19} weight="fill" /></span>
              <div className="fbk-hd-tx">
                <h2 id="fbk-title">{t("fbk.title")}</h2>
                <p>{t("fbk.subtitle")}</p>
              </div>
              <button type="button" className="fbk-x" onClick={close} aria-label={t("fbk.close")}>
                <X size={16} />
              </button>
            </div>
            <div className="fbk-seg" role="tablist">
              <button type="button" role="tab" aria-selected={tab === "new"} className={tab === "new" ? "is-on" : ""}
                onClick={() => { setTab("new"); setOpenId(null); }}>
                <PenLine size={15} /> {t("fbk.tabNew")}
              </button>
              <button type="button" role="tab" aria-selected={tab === "mine"} className={tab === "mine" ? "is-on" : ""}
                onClick={() => { setTab("mine"); setOpenId(null); }}>
                <MessageSquare size={15} /> {t("fbk.tabMine")}
                {unread > 0 ? <span className="fbk-badge">{unread > 9 ? "9+" : unread}</span> : null}
              </button>
            </div>
            {tab === "new" ? (sent ? renderSent() : renderForm()) : openId ? renderThread() : renderList()}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

