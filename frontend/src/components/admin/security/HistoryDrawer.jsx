/**
 * "Ayar değişikliği geçmişi" (Draft A frame A3): every change of the security (and
 * Sistem) settings with who did it, the old and new value (diff), the reason, and
 * "Geri al" with a confirmation popover that asks for a reason. A lock that is still
 * on can be undone (= lifted); one that already ended reads "Süresi doldu".
 */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { History, Pencil, Undo2, X } from "../../ui/Icon.jsx";
import { Drawer, Popover } from "./ui.jsx";
import { securityApi } from "./securityApi.js";
import { HISTORY_CATEGORIES, avatarOf, diffLines, entryTitle, errorKey, fmtStamp, revertSentence, settingName, unitValue } from "./securityModel.js";

function RevertText({ entry, t, locale }) {
  const changes = (entry.changes || []).filter((c) => !String(c.key).startsWith("lock."));
  if (!entry.isLock && changes.length === 1) {
    const c = changes[0];
    const text = t("secCenter.hist.revertOne", { name: settingName(c.key, t), to: "\u0001", from: "\u0002" });
    const [a, rest = ""] = text.split("\u0001");
    const [b, tail = ""] = rest.split("\u0002");
    return (
      <p>
        {a}
        <b>{unitValue(c.key, c.to, t, locale)}</b>
        {b}
        <b>{unitValue(c.key, c.from, t, locale)}</b>
        {tail} {t("secCenter.hist.revertAudited")}
      </p>
    );
  }
  return (
    <p>
      {revertSentence(entry, t, locale)} {t("secCenter.hist.revertAudited")}
    </p>
  );
}

export default function HistoryDrawer({ open, onClose, t, locale, now, liveModes, refreshKey, onReverted }) {
  const titleId = useId();
  const [category, setCategory] = useState("all");
  const [state, setState] = useState({ entries: [], loading: true, error: "", persistent: true, nextBefore: null });
  const [more, setMore] = useState(false);
  const [confirm, setConfirm] = useState(null); // { entry }
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [popErr, setPopErr] = useState("");
  const anchorRef = useRef(null);

  const load = useCallback(
    async (cat, { quiet = false } = {}) => {
      if (!quiet) setState((s) => ({ ...s, loading: true, error: "" }));
      try {
        const d = await securityApi.history({ category: cat });
        setState({ entries: d.entries || [], loading: false, error: "", persistent: d.persistent !== false, nextBefore: d.nextBefore || null });
      } catch (err) {
        setState((s) => ({ ...s, loading: false, error: err?.message || t("secCenter.err.generic") }));
      }
    },
    [t]
  );

  useEffect(() => {
    if (!open) return;
    load(category);
  }, [open, category, load]);

  useEffect(() => {
    if (open && refreshKey) load(category, { quiet: true });
    // reload on live settings pushes only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const loadMore = async () => {
    if (!state.nextBefore || more) return;
    setMore(true);
    try {
      const d = await securityApi.history({ category, before: state.nextBefore });
      setState((s) => ({ ...s, entries: [...s.entries, ...(d.entries || [])], nextBefore: (d.entries || []).length ? d.nextBefore : null }));
    } catch {
      /* keep what we have */
    } finally {
      setMore(false);
    }
  };

  const openConfirm = (entry, el) => {
    anchorRef.current = el;
    setReason("");
    setPopErr("");
    setConfirm({ entry });
  };

  const doRevert = async () => {
    if (!confirm || reason.trim().length < 3 || busy) return;
    setBusy(true);
    setPopErr("");
    try {
      await securityApi.revert(confirm.entry.id, reason.trim());
      setConfirm(null);
      onReverted?.(confirm.entry);
      await load(category, { quiet: true });
    } catch (err) {
      const key = errorKey(err);
      setPopErr(key ? t(key) : err?.message || t("secCenter.err.generic"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer open={open} onClose={onClose} labelledBy={titleId} suspended={Boolean(confirm)} className="sc-hist" testId="sc-history">
      <header className="sc-dh">
        <span className="sc-dh-ic is-blue" aria-hidden="true">
          <History size={20} />
        </span>
        <div>
          <h2 id={titleId}>{t("secCenter.hist.heading")}</h2>
          <p>{t("secCenter.hist.sub")}</p>
        </div>
        <button type="button" className="sc-btn sc-close" onClick={onClose} aria-label={t("secCenter.close")} data-autofocus>
          <X size={16} />
        </button>
      </header>
      <div className="sc-filters" role="tablist" aria-label={t("secCenter.hist.filters")}>
        {HISTORY_CATEGORIES.map((c) => (
          <button key={c} type="button" role="tab" aria-selected={category === c} className={`sc-fp${category === c ? " is-on" : ""}`} onClick={() => setCategory(c)} data-testid={`sc-hcat-${c}`}>
            {t(`secCenter.hist.cat.${c}`)}
          </button>
        ))}
      </div>
      {!state.persistent ? <p className="sc-warnline">{t("secCenter.hist.memoryOnly")}</p> : null}
      {state.error ? <p className="sc-err" role="alert">{state.error}</p> : null}
      <div className="sc-hist-list">
        {state.loading ? (
          Array.from({ length: 4 }).map((_, i) => <div key={i} className="sc-skel" style={{ height: 128 }} />)
        ) : !state.entries.length ? (
          <div className="sc-empty">
            <History size={22} aria-hidden="true" />
            <b>{t("secCenter.hist.emptyTitle")}</b>
            <span>{t("secCenter.hist.emptyBody")}</span>
          </div>
        ) : (
          state.entries.map((e) => {
            const av = avatarOf(e.actorUsername || "system");
            const lines = diffLines(e, t, locale, { now, liveModes });
            const expired = e.isLock && !e.lockLive && !e.revertedAt && !e.revertOf && String(e.title || "").startsWith("lock.") && !["lock.lift", "lock.expired"].includes(e.title);
            return (
              <article key={e.id} className={`sc-chg${confirm?.entry.id === e.id ? " is-sel" : ""}`} data-testid="sc-hist-entry">
                <div className="sc-chg-h">
                  <span className={`sc-av is-${e.actorUsername ? av.tone : "gray"}`} aria-hidden="true">{e.actorUsername ? av.letter : "S"}</span>
                  <b>{entryTitle(e, t)}</b>
                  <span className="sc-muted">{e.actorUsername ? `@${e.actorUsername}` : t("secCenter.hist.system")}</span>
                  <time dateTime={e.at}>{fmtStamp(e.at, t, locale, now)}</time>
                </div>
                <div className="sc-diff" role="list">
                  {lines.map((l, i) => (
                    <div key={i} className={`is-${l.sign}`} role="listitem">
                      <span aria-hidden="true">{l.sign === "m" ? "−" : "+"}</span> <span className="sr-only">{l.sign === "m" ? t("secCenter.hist.before") : t("secCenter.hist.after")}</span>
                      {l.text}
                    </div>
                  ))}
                </div>
                <div className="sc-why">
                  <Pencil size={15} aria-hidden="true" />
                  <span className={e.reason ? "" : "sc-muted"}>{e.reason || (e.title === "lock.expired" ? t("secCenter.hist.autoExpired") : t("secCenter.hist.noReason"))}</span>
                  {e.revertedAt ? (
                    <span className="sc-chip is-gray">{t("secCenter.hist.reverted", { user: e.revertedBy ? `@${e.revertedBy}` : "" })}</span>
                  ) : e.revertOf ? (
                    <span className="sc-chip is-blue">{t("secCenter.hist.isRevert")}</span>
                  ) : e.revertible ? (
                    <button type="button" className="sc-sb" onClick={(ev) => openConfirm(e, ev.currentTarget)} data-testid="sc-hist-revert">
                      <Undo2 size={13} aria-hidden="true" />
                      {t("secCenter.hist.revert")}
                    </button>
                  ) : expired ? (
                    <span className="sc-chip is-gray">{t("secCenter.hist.expired")}</span>
                  ) : null}
                </div>
              </article>
            );
          })
        )}
        {state.nextBefore && !state.loading ? (
          <button type="button" className="sc-more" onClick={loadMore} disabled={more}>
            {more ? t("secCenter.loading") : t("secCenter.hist.loadMore")}
          </button>
        ) : null}
      </div>
      <Popover open={Boolean(confirm)} anchorRef={anchorRef} onClose={() => !busy && setConfirm(null)} width={400} label={t("secCenter.hist.confirmTitle")} busy={busy} testId="sc-revert-pop">
        {confirm ? (
          <>
            <h4>
              <Undo2 size={16} aria-hidden="true" />
              {t("secCenter.hist.confirmTitle")}
            </h4>
            <RevertText entry={confirm.entry} t={t} locale={locale} />
            {confirm.entry.stale?.length ? <p className="sc-warnline">{t("secCenter.hist.stale")}</p> : null}
            <label className="sc-field">
              <span className="sc-lab">{t("secCenter.reason")}</span>
              <textarea className="sc-ta" rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("secCenter.hist.reasonPh")} data-autofocus data-testid="sc-revert-reason" />
            </label>
            {popErr ? <p className="sc-err" role="alert">{popErr}</p> : null}
            <div className="sc-row">
              <button type="button" className="sc-btn" onClick={() => setConfirm(null)} disabled={busy}>
                {t("secCenter.cancel")}
              </button>
              <button type="button" className="sc-btn is-p" onClick={doRevert} disabled={busy || reason.trim().length < 3} data-testid="sc-revert-go">
                <Undo2 size={15} aria-hidden="true" />
                {busy ? t("secCenter.hist.reverting") : t("secCenter.hist.revert")}
              </button>
            </div>
          </>
        ) : null}
      </Popover>
    </Drawer>
  );
}
