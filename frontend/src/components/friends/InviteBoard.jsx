import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronRight, Coins, Copy, Gift, Pause, Share2 } from "../ui/Icon.jsx";
import { getInviteDashboard } from "../../api/invites.js";
import { INVITES_UPDATE_EVENT } from "../../lib/inviteShare.js";
import { compactCount, inviteBoardView } from "../../lib/inviteBoard.js";
import { useLocale, useT } from "../../context/LocaleContext";
import "../../styles/invite-board.css";

/**
 * Friends sidebar invite card, draft B "Kazanç panosu" (owner's pick, 28 Nov 2026).
 * Live numbers from GET /api/invites/me (active invites, DesCoin earned, pending friends,
 * the next milestone), refreshed on "descall:invites-update". One fetch is shared by every
 * mounted card for a minute. The link row copies and shares; the footer opens Davet Merkezi.
 */
const TTL_MS = 60_000;
let cache = { at: 0, data: null, promise: null };

function loadDashboard(force = false) {
  const now = Date.now();
  if (!force && cache.data && now - cache.at < TTL_MS) return Promise.resolve(cache.data);
  if (cache.promise) return cache.promise;
  cache.promise = getInviteDashboard()
    .then((data) => {
      cache = { at: Date.now(), data: data || null, promise: null };
      return cache.data;
    })
    .catch(() => {
      cache = { ...cache, promise: null };
      return cache.data;
    });
  return cache.promise;
}

/** Counts up to the new value (skipped with reduced motion and on the first paint). */
function useCountUp(value) {
  const [shown, setShown] = useState(value);
  const prev = useRef(value);
  useEffect(() => {
    const from = prev.current;
    prev.current = value;
    if (from === value) return undefined;
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduce || typeof requestAnimationFrame !== "function") {
      setShown(value);
      return undefined;
    }
    const start = performance.now();
    let raf = 0;
    const tick = (ts) => {
      const k = Math.min(1, (ts - start) / 650);
      const eased = 1 - (1 - k) ** 3;
      setShown(Math.round(from + (value - from) * eased));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return shown;
}

export default function InviteBoard({ url, copied, shareBusy, onCopy, onShare, onOpenCenter, initialData = null }) {
  const t = useT();
  const { locale } = useLocale();
  const [data, setData] = useState(initialData || cache.data);
  const [bump, setBump] = useState(false);

  const refresh = useCallback((force) => {
    void loadDashboard(force).then((d) => {
      if (d) setData(d);
    });
  }, []);

  useEffect(() => {
    if (initialData) return undefined;
    refresh(false);
    const onUpdate = () => refresh(true);
    window.addEventListener(INVITES_UPDATE_EVENT, onUpdate);
    return () => window.removeEventListener(INVITES_UPDATE_EVENT, onUpdate);
  }, [initialData, refresh]);

  const v = inviteBoardView(data);
  const active = useCountUp(v.active);
  const earned = useCountUp(v.earned);

  // A short pulse on the numbers when they grow (a friend became active, a reward landed).
  const lastEarned = useRef(v.earned);
  useEffect(() => {
    if (v.earned > lastEarned.current) {
      setBump(true);
      const id = window.setTimeout(() => setBump(false), 900);
      lastEarned.current = v.earned;
      return () => window.clearTimeout(id);
    }
    lastEarned.current = v.earned;
    return undefined;
  }, [v.earned]);

  // The host shrinks first so the personal part (/r/<name>) always stays readable.
  const bare = String(url || "").replace(/^https?:\/\//, "");
  const cut = bare.indexOf("/");
  const host = cut > 0 ? bare.slice(0, cut) : bare;
  const path = cut > 0 ? bare.slice(cut) : "";

  return (
    <section className={`ib-card${copied ? " is-copied" : ""}${v.paused ? " is-paused" : ""}`} data-testid="invite-board" aria-label={t("Invite friends")}>
      <div className="ib-top">
        <div className="ib-head">
          <span className="ib-tile" aria-hidden="true"><Gift size={16} /></span>
          <div className="ib-title">
            <strong>{t("Invite friends")}</strong>
            <span>{t("dvt.board.short", { a: v.a, b: v.b })}</span>
          </div>
        </div>
        <div className={`ib-chips${bump ? " is-bump" : ""}`} aria-live="polite">
          <div className="ib-chip" data-testid="invite-board-active">
            <b className={v.loaded ? "" : "is-wait"}>{compactCount(active, locale)}</b>
            <i>{t("dvt.board.active")}</i>
          </div>
          <div className="ib-chip" data-testid="invite-board-earned">
            <b className={v.loaded ? "" : "is-wait"}><Coins size={13} aria-hidden />{compactCount(earned, locale)}</b>
            <i>{t("dvt.board.earned")}</i>
          </div>
        </div>
        {v.progress != null && v.nextLeft != null && (
          <div className="ib-next" data-testid="invite-board-next">
            <div className="ib-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v.progress * 100)}>
              <span style={{ width: `${Math.round(v.progress * 100)}%` }} />
            </div>
            <div className="ib-next-row">
              <span>{t("dvt.board.next", { n: v.nextLeft })}</span>
              {v.pendingCoins > 0 && <em>{t("dvt.board.pendingCoins", { n: v.pendingCoins })}</em>}
            </div>
          </div>
        )}
        {v.allDone && <div className="ib-next is-done"><span>{t("dvt.board.nextAll")}</span></div>}
      </div>

      <div className="ib-bot">
        {v.paused ? (
          <div className="ib-paused" role="status">
            <Pause size={13} aria-hidden />
            {t("dvt.board.paused")}
          </div>
        ) : (
          <div className="ib-field">
            <button type="button" className="ib-link" onClick={onCopy} title={url} data-testid="invite-board-link">
              {copied ? (
                <span className="ib-host">{t("dvt.board.copied")}</span>
              ) : (
                <>
                  <span className="ib-host">{host}</span>
                  <span className="ib-path">{path}</span>
                </>
              )}
            </button>
            <button type="button" className="ib-btn is-primary" onClick={onCopy} aria-label={copied ? t("Copied") : t("Copy link")} title={copied ? t("Copied") : t("Copy link")} data-testid="invite-board-copy">
              {copied ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}
            </button>
            <button type="button" className="ib-btn" onClick={onShare} disabled={shareBusy} aria-busy={shareBusy || undefined} aria-label={t("Share")} title={t("Share")}>
              <Share2 size={15} aria-hidden />
            </button>
          </div>
        )}
        <div className="ib-foot">
          <span className="ib-pending" data-testid="invite-board-pending" title={v.pendingCount > 0 ? t("dvt.board.pending", { n: v.pendingCount }) : undefined}>
            {v.pendingCount > 0 ? (
              <>
                {t("dvt.board.pending", { n: v.pendingCount })}
              </>
            ) : (
              v.loaded && v.active === 0 ? t("dvt.board.first") : null
            )}
          </span>
          <button type="button" className="ib-center" onClick={onOpenCenter} data-testid="invite-card-center">
            {t("dvt.entry.open")}
            {v.unread > 0 && <span className="ib-dot" aria-label={t("dvt.board.newNotice")} />}
            <ChevronRight size={13} aria-hidden />
          </button>
        </div>
      </div>
    </section>
  );
}
