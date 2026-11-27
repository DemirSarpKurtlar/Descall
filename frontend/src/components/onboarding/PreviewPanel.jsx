/**
 * "Katılmadan önizle": the right panel on desktop, a bottom sheet on the phone. Live messages
 * of a public channel (polled, read-only, nobody sees the viewer), the busiest hours, today's
 * count, the voice room, then "Katıl ve selam ver" with a ready first sentence the user can
 * edit. After sending: replies / reactions counters and a 10-second undo.
 */
import { useEffect, useRef, useState } from "react";
import useModalFocus from "../../hooks/useModalFocus";
import { useLocale, useT } from "../../context/LocaleContext";
import { useOnboarding } from "./OnboardingContext";
import { Avatar, Coin, ServerIcon } from "./parts";
import { crowdBars, hhmm } from "../../lib/onboarding";
import { Award, Eye, Hash, Heart, Lock, Loader2, RefreshCw, Reply, Send, Sparkles, Undo2, Volume2, X, AlertCircle, ArrowRight, Check } from "../ui/Icon.jsx";
import { serverMessage } from "../../i18n/serverText";

function errorText(t, send) {
  if (send.code === "OFFLINE" || (typeof navigator !== "undefined" && navigator.onLine === false)) return t("onb.preview.offline");
  if (send.code === "TIMEOUT") return t("onb.preview.timeout");
  if (send.code === "BANNED") return t("onb.preview.banned");
  if (send.code === "JOINS_PAUSED") return t("onb.preview.paused");
  return t("onb.preview.failed", { reason: send.text ? serverMessage(send.text, "error", t) : t("onb.preview.unknown") });
}

function SentCard({ o, t, compact }) {
  const s = o.send;
  const tr = o.track || {};
  const undoLeft = o.undoSecondsLeft;
  return (
    <div className="onb-sent" role="status" aria-live="polite">
      <div className="top">
        {s.joinedOnly ? <span className="onb-badge-ico" style={{ background: "linear-gradient(150deg,#5be38a,#1e9e5e)", color: "#04210f" }}><Check size={17} /></span> : <span className="onb-badge-ico"><Award size={17} /></span>}
        <div>
          {s.joinedOnly ? (
            <b>{t("onb.sent.joinedTitle", { name: s.name || "" })}</b>
          ) : s.helloBefore ? (
            <b>{t("onb.sent.sentTitle")}</b>
          ) : (
            <b>{t("onb.sent.rewardTitle", { n: (s.rewardAmount || 50) + (s.joinBonus || 0) })}</b>
          )}
          <br />
          <span className="onb-muted">{s.joinedOnly ? (s.helloBefore ? t("onb.sent.joinedTitle", { name: s.name || "" }) : t("onb.sent.joinedSub")) : t("onb.sent.sub", { name: s.name || "" })}</span>
        </div>
      </div>
      {s.messageId ? (
        <div className="stats">
          <span className={tr.reactions ? "is-on" : ""}><Heart size={13} />{t("onb.sent.reactions", { n: tr.reactions || 0 })}</span>
          <span className={tr.replies ? "is-on" : ""}><Reply size={13} />{t("onb.sent.replies", { n: tr.replies || 0 })}</span>
          {!tr.replies && undoLeft <= 0 ? <span>{t("onb.sent.waiting")}</span> : null}
          {undoLeft > 0 ? (
            <button type="button" className="u" onClick={() => void o.undo()} aria-label={t("onb.sent.undoAria", { n: undoLeft })}>
              <Undo2 size={14} />
              {t("onb.sent.undo", { n: undoLeft })}
            </button>
          ) : null}
        </div>
      ) : undoLeft > 0 ? (
        <div className="stats">
          <button type="button" className="u" onClick={() => void o.undo()} aria-label={t("onb.sent.undoAria", { n: undoLeft })}>
            <Undo2 size={14} />
            {t("onb.sent.undo", { n: undoLeft })}
          </button>
        </div>
      ) : null}
      {!compact ? (
        <div className="row" style={{ display: "flex", gap: 6 }}>
          <button type="button" className="onb-btn pri sm" style={{ flex: 1 }} onClick={() => o.openChannel?.(s.serverId, s.channelId || undefined)}>
            {t("onb.sent.goChannel")}
            <ArrowRight size={14} />
          </button>
          <button type="button" className="onb-btn gh sm" onClick={() => { o.dismissSend(); o.closePreview(); }}>
            {t("onb.sent.done")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function PreviewBody({ variant = "panel", onClose }) {
  const t = useT();
  const { locale } = useLocale();
  const o = useOnboarding();
  const [showRules, setShowRules] = useState(false);
  const listRef = useRef(null);
  const target = o?.previewTarget;
  const pv = o?.preview;
  const phone = variant === "sheet";

  useEffect(() => {
    const el = listRef.current;
    if (el && !phone) el.scrollTop = el.scrollHeight;
  }, [pv?.messages?.length, phone]);

  if (!o || !target) return null;
  const server = pv?.server || target;
  const busy = o.send.phase === "joining" || o.send.phase === "sending" || o.send.phase === "undoing";
  const sentHere = o.send.phase === "sent" && String(o.send.serverId) === String(target.id);
  const intro = pv?.introChannel;
  const canSend = Boolean(intro);
  const rewardNow = (o.data?.checklist?.items || []).reduce((n, i) => n + (!i.done && (i.id === "join" || i.id === "first_message") ? i.reward : 0), 0);
  const member = (o.data?.myServers || []).some((s) => String(s.id) === String(target.id));

  return (
    <>
      <div className="onb-pv-hd">
        <ServerIcon server={server} size={phone ? 48 : 44} official={Boolean(pv?.server?.official)} />
        <div>
          <b>{server.name}</b>
          <small>
            {pv?.server?.online != null ? <span className="onb-live">{t("onb.card.online", { n: pv.server.online })}</span> : null}
            {pv?.server?.members != null ? <span> · {t("onb.card.members", { n: pv.server.members })}</span> : null}
          </small>
        </div>
        {phone ? (
          <button type="button" className="x" onClick={onClose} aria-label={t("onb.preview.close")}>
            <X size={16} />
          </button>
        ) : null}
      </div>

      {o.previewState === "loading" && !pv ? (
        <div className="onb-pv-state" aria-busy="true">
          <Loader2 size={18} className="spin" />
          {t("onb.preview.loading")}
          <div className="onb-skel" style={{ width: "100%", height: 120 }} />
        </div>
      ) : o.previewState === "error" && !pv ? (
        <div className="onb-pv-state">
          <AlertCircle size={20} />
          {t("onb.preview.error")}
          <button type="button" className="onb-btn gh sm" onClick={() => o.setPreviewChannel((c) => (c === null ? undefined : null))}>
            <RefreshCw size={13} />
            {t("onb.preview.retry")}
          </button>
        </div>
      ) : pv ? (
        <>
          {pv.channels?.length ? (
            <div className="onb-pv-tabs" role="tablist" aria-label={t("onb.preview.channels")}>
              {pv.channels.slice(0, 4).map((c) => (
                <button key={c.id} type="button" role="tab" aria-selected={c.id === pv.channelId} className={c.id === pv.channelId ? "is-on" : ""} onClick={() => o.setPreviewChannel(c.id)}>
                  <Hash size={13} />
                  {c.name}
                </button>
              ))}
            </div>
          ) : null}
          <div className="onb-pv-meta">
            <div>
              <small>{t("onb.preview.crowd")}</small>
              <div className="onb-hb" aria-hidden="true">
                {crowdBars(pv.crowd).map((b, i) => (
                  <i key={i} className={b.peak ? "pk" : ""} style={{ height: `${b.h}%` }} />
                ))}
              </div>
            </div>
            <div>
              <small>{t("onb.preview.today")}</small>
              <b className="tnum">{pv.today ?? 0}</b> <span className="onb-muted" style={{ fontSize: 12 }}>{t("onb.preview.msgWord", { n: pv.today ?? 0 })}</span>
              <br />
              <span className="onb-muted" style={{ fontSize: 11.5 }}>
                {pv.replyMinutes != null ? t("onb.preview.replyIn", { n: pv.replyMinutes }) : t("onb.preview.replyNone")}
              </span>
            </div>
          </div>
          <div className="onb-msgs" ref={listRef} aria-live="polite" aria-label={t("onb.preview.liveMessages")}>
            {pv.messages?.length ? (
              pv.messages.map((m) => (
                <div key={m.id} className={`onb-m${m.author?.me ? " is-mine" : ""}`}>
                  <Avatar name={m.author?.name} src={m.author?.avatarUrl} size={phone ? 36 : 30} />
                  <div>
                    <div className="hd">
                      <b>{m.author?.name}</b>
                      <time dateTime={m.at}>{hhmm(m.at, locale)}</time>
                    </div>
                    {m.text ? <p>{m.text}</p> : <p className="media">{m.media === "voice" ? t("onb.preview.voiceMsg") : t("onb.preview.media")}</p>}
                  </div>
                </div>
              ))
            ) : (
              <div className="onb-msgs-empty">{t("onb.preview.noMessages")}</div>
            )}
          </div>
          {pv.voice ? (
            <div className="onb-voice">
              <Volume2 size={18} />
              <div>
                <b>{pv.voice.name}</b>
                <small>{t("onb.preview.voiceIn", { n: pv.voice.count || 0 })}</small>
              </div>
              {pv.voice.people?.length ? (
                <span className="onb-stack">
                  {pv.voice.people.map((p, i) => (
                    <Avatar key={p.id || i} name={p.name} src={p.avatarUrl} size={24} speaking={p.speaking} />
                  ))}
                </span>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}

      {pv && sentHere ? <SentCard o={o} t={t} compact={phone} /> : null}
      {pv && !sentHere ? (
        <div className="onb-join">
          <div className="onb-lbl" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {t("onb.preview.joinAndSay")}
            {intro ? <span className="onb-dim" style={{ textTransform: "none", letterSpacing: 0 }}>· #{intro.name}</span> : null}
          </div>
          {canSend ? (
            <>
              <label className="onb-sr" htmlFor={`onb-ta-${variant}`}>{t("onb.preview.textLabel")}</label>
              <textarea
                id={`onb-ta-${variant}`}
                className="onb-ta"
                rows={phone ? 3 : 3}
                value={o.draft}
                maxLength={300}
                onChange={(e) => o.editDraft(e.target.value)}
                disabled={busy}
              />
              <div className="row" hidden={phone}>
                <span className="onb-pill gl"><Sparkles size={12} />{o.draftEdited ? t("onb.preview.edited") : t("onb.preview.prepared")}</span>
                {rewardNow > 0 ? <span className="onb-pill gd" style={{ marginLeft: "auto" }}><Coin size={11} />+{rewardNow}</span> : null}
              </div>
            </>
          ) : (
            <p className="onb-muted" style={{ margin: 0, fontSize: 12.5 }}>{t("onb.preview.cantSend")}</p>
          )}
          {o.send.phase === "error" && String(o.send.serverId) === String(target.id) ? (
            <div className="onb-err" role="alert"><AlertCircle size={15} />{errorText(t, o.send)}</div>
          ) : null}
          {o.send.phase === "undone" && String(o.send.serverId) === String(target.id) ? (
            <div className="onb-err" role="status" style={{ background: "rgba(255,255,255,.06)", color: "var(--onb-t2)", boxShadow: "none" }}>
              <Undo2 size={15} />
              {t("onb.sent.undone")}
            </div>
          ) : null}
          <div className="row">
            {canSend ? (
              <button type="button" className="onb-btn pri" onClick={o.joinAndSend} disabled={busy || !o.draft.trim()}>
                {busy ? <Loader2 size={15} className="spin" /> : <Send size={15} />}
                {o.send.phase === "joining" ? t("onb.preview.joining") : o.send.phase === "sending" ? t("onb.preview.sending") : member ? t("onb.preview.send") : t("onb.preview.joinAndSend")}
                {phone && rewardNow > 0 ? <span className="onb-pill gd" style={{ marginLeft: 2 }}>+{rewardNow}</span> : null}
              </button>
            ) : null}
            {!phone && !member ? (
              <button type="button" className="onb-btn gh" onClick={o.joinOnly} disabled={busy} style={canSend ? undefined : { flex: 1 }}>
                {t("onb.preview.justJoin")}
              </button>
            ) : null}
          </div>
          {phone ? (
            <p className="note" style={{ justifyContent: "center", margin: 0 }}>
              {!member ? <button type="button" onClick={o.joinOnly} disabled={busy}>{t("onb.preview.justJoin")}</button> : null}
              <span>{!member ? " · " : ""}{t("onb.preview.privacy")}</span>
            </p>
          ) : (
            <p className="note" style={{ margin: 0 }}>
              <Lock size={12} style={{ marginTop: 2, flex: "none" }} />
              <span>
                {t("onb.preview.privacy")}{" "}
                {pv.rulesCount ? (
                  <>
                    {t("onb.preview.rules", { n: pv.rulesCount })}{" "}
                    <button type="button" onClick={() => setShowRules((v) => !v)} aria-expanded={showRules}>
                      {showRules ? t("onb.preview.hideRules") : t("onb.preview.showRules")}
                    </button>
                  </>
                ) : null}
              </span>
            </p>
          )}
          {showRules && pv.rules?.length ? (
            <ol className="rules">
              {pv.rules.map((r, i) => <li key={i}>{r}</li>)}
            </ol>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

/** Desktop right panel. Without a selected server it says what the panel is for. */
export default function PreviewPanel() {
  const t = useT();
  const o = useOnboarding();
  if (!o) return null;
  return (
    <aside className="onb-panel" aria-label={t("onb.preview.title")}>
      <div className="onb-ph">
        <Eye size={16} />
        <h2>{t("onb.preview.title")}</h2>
        {o.previewTarget ? (
          <span className="onb-pill gl">
            {(o.data?.myServers || []).some((s) => String(s.id) === String(o.previewTarget.id)) || o.send.phase === "sent" ? t("onb.preview.member") : t("onb.preview.notJoined")}
          </span>
        ) : null}
        {o.previewTarget ? (
          <button type="button" className="x" onClick={o.closePreview} aria-label={t("onb.preview.close")}>
            <X size={16} />
          </button>
        ) : null}
      </div>
      {o.previewTarget ? (
        <div className="onb-pv-scroll">
          <PreviewBody variant="panel" />
        </div>
      ) : (
        <div className="onb-pv-empty">
          <Eye size={26} />
          <b>{t("onb.preview.emptyTitle")}</b>
          <span style={{ fontSize: 12.5, lineHeight: 1.45 }}>{t("onb.preview.emptyBody")}</span>
        </div>
      )}
    </aside>
  );
}

/** Phone bottom sheet. */
export function PreviewSheet() {
  const o = useOnboarding();
  const t = useT();
  const sheetRef = useRef(null);
  useModalFocus(Boolean(o?.previewTarget), sheetRef);
  useEffect(() => {
    if (!o?.previewTarget) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") o.closePreview();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [o]);
  if (!o?.previewTarget) return null;
  return (
    <div className="onb">
      <div className="onb-scrim" onClick={o.closePreview} aria-hidden="true" />
      <div className="onb-sheet" ref={sheetRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={t("onb.preview.title")}>
        <div className="grab" aria-hidden="true" />
        <div className="onb-pv-scroll">
          <PreviewBody variant="sheet" onClose={o.closePreview} />
        </div>
      </div>
    </div>
  );
}
