/**
 * Üyelik ve takviyeler (draft 5B section 3, frame 6): plan and renewal, your boosts with "Taşı"
 * (once every 7 days, the owner hears it 24 h before), the gifts you sent with their live status,
 * and cancelling with its real effect on your servers in numbers ("İptal edersen ...") and a
 * required reason. Store subscriptions (App Store) are cancelled in the store; we link there.
 */
import { useEffect, useState } from "react";
import { useLocale, useT } from "../context/LocaleContext";
import { AlertTriangle, Loader2, Rocket, Undo2 } from "../components/ui/Icon.jsx";
import { formatDate } from "../i18n/format.js";
import { PlanPill, PlusWindow, ErrorLine } from "./ui.jsx";
import { usePlus, refreshHub } from "./plusStore.js";
import { cancelBoostMove, cancelMembership, getCancelImpact, moveBoost, resumeMembership } from "./plusApi.js";
import { errorKey, giftChip } from "./model.js";
import { openPlus } from "./openPlus.js";

export const CANCEL_REASONS = ["not_using", "too_expensive", "missing_feature", "technical", "temporary", "other"];

export default function ManageMembership({ onClose }) {
  const t = useT();
  const { locale } = useLocale() || {};
  const { hub } = usePlus({ load: "hub" });
  const [impact, setImpact] = useState(null);
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const [moveFor, setMoveFor] = useState(null);
  const [moveTo, setMoveTo] = useState("");
  const [done, setDone] = useState(null);

  useEffect(() => {
    getCancelImpact().then(setImpact).catch(() => setImpact(null));
  }, [hub?.me?.cancelAtPeriodEnd]);

  const me = hub?.me || {};
  const servers = hub?.servers || [];
  const nameOf = (id) => servers.find((s) => s.id === id)?.name || t("plus2.manage.aServer");
  const d = (v) => formatDate(v, locale, { day: "numeric", month: "short" });
  const boosts = hub?.boosts?.list || [];
  const sent = hub?.gifts?.sent || [];
  const store = me.provider === "apple" || me.provider === "google" || me.provider === "revenuecat";
  const manual = me.source === "admin" || me.source === "campaign" || me.unlimited;

  const run = async (key, fn) => {
    setBusy(key);
    setErr(null);
    try {
      await fn();
      await refreshHub();
    } catch (e) {
      setErr(errorKey(e?.code));
    } finally {
      setBusy(null);
    }
  };

  const doCancel = () => run("cancel", async () => {
    const out = await cancelMembership(reason);
    if (out?.store && out.manageUrl) {
      window.open(out.manageUrl, "_blank", "noopener,noreferrer");
      return;
    }
    setDone("cancelled");
    setConfirm(false);
  });

  const statusPill = () => {
    if (!me.active) return <span className="p2-pill">{t("plus2.manage.inactive")}</span>;
    if (me.unlimited) return <span className="p2-pill is-ok">{t("plus2.manage.unlimited")}</span>;
    if (me.cancelAtPeriodEnd) return <span className="p2-pill is-warn">{t("plus2.manage.endsOn", { date: d(me.endsAt) })}</span>;
    if (me.autoRenew) return <span className="p2-pill is-ok">{t("plus2.manage.renews", { date: d(me.endsAt) })}</span>;
    return <span className="p2-pill is-info">{t("plus2.manage.endsOn", { date: d(me.endsAt) })}</span>;
  };

  return (
    <PlusWindow title={t("plus2.manage.title")} onClose={onClose} size="mid" busy={Boolean(busy)}>
      {!hub ? <div className="p2-empty"><Loader2 className="p2-spin" /></div> : (
        <div className="p2-ck">
          <div className="p2-row">
            <PlanPill plan={me.plan || me.lastPlan} />
            <span className="p2-small p2-muted">{me.period ? t(me.period === "yearly" ? "plus2.ck.yearly" : "plus2.ck.monthly") : ""}{me.provider ? ` · ${t(`plus2.provider.${me.provider}`)}` : ""}</span>
            <span className="p2-grow" />
            {statusPill()}
          </div>

          <div>
            <div className="p2-eyebrow" style={{ marginBottom: 6 }}>{t("plus2.manage.boosts")}</div>
            {boosts.length === 0 ? <div className="p2-small p2-muted">{t("plus2.manage.noBoosts")}</div> : (
              <table className="p2-table">
                <thead><tr><th>{t("plus2.manage.server")}</th><th>{t("plus2.manage.given")}</th><th>{t("plus2.manage.movable")}</th><th className="r" /></tr></thead>
                <tbody>
                  {boosts.map((b) => (
                    <tr key={b.id}>
                      <td><b>{nameOf(b.serverId)}</b>{b.status === "moving" ? <div className="p2-sub">{t("plus2.manage.movingTo", { server: nameOf(b.moveTo), date: d(b.moveAt) })}</div> : null}{b.status === "grace" ? <div className="p2-sub">{t("plus2.manage.grace", { date: d(b.graceUntil) })}</div> : null}</td>
                      <td className="tnum">{d(b.createdAt)}</td>
                      <td>{b.movableNow ? t("plus2.manage.now") : d(b.movableAt)}</td>
                      <td className="r">
                        {b.status === "moving" ? (
                          <button type="button" className="p2-btn is-sm" onClick={() => run(`m${b.id}`, () => cancelBoostMove(b.id))}><Undo2 />{t("plus2.manage.keep")}</button>
                        ) : moveFor === b.id ? (
                          <span className="p2-row" style={{ justifyContent: "flex-end" }}>
                            <select className="p2-select" style={{ width: 160 }} value={moveTo} onChange={(e) => setMoveTo(e.target.value)} aria-label={t("plus2.manage.moveTo")}>
                              <option value="">{t("plus2.manage.moveTo")}</option>
                              {servers.filter((s) => s.id !== b.serverId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                            <button type="button" className="p2-btn is-sm is-cta" disabled={!moveTo || busy} onClick={() => run(`m${b.id}`, async () => { await moveBoost(b.id, moveTo); setMoveFor(null); setMoveTo(""); })}>{t("plus2.manage.move")}</button>
                          </span>
                        ) : (
                          <button type="button" className="p2-btn is-sm" disabled={!b.movableNow} onClick={() => setMoveFor(b.id)}>{t("plus2.manage.move")}</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {hub.boosts?.free > 0 ? <button type="button" className="p2-btn is-sm" style={{ marginTop: 8 }} onClick={() => openPlus({ view: "hub" })}><Rocket />{t("plus2.manage.useFree", { n: hub.boosts.free })}</button> : null}
          </div>

          <div>
            <div className="p2-eyebrow" style={{ marginBottom: 6 }}>{t("plus2.manage.sentGifts")}</div>
            {sent.length === 0 ? <div className="p2-small p2-muted">{t("plus2.manage.noGifts")}</div> : (
              <table className="p2-table">
                <thead><tr><th>{t("plus2.manage.to")}</th><th>{t("plus2.manage.length")}</th><th>{t("plus2.manage.status")}</th></tr></thead>
                <tbody>
                  {sent.slice(0, 8).map((g) => {
                    const chip = giftChip(g);
                    return (
                      <tr key={g.id} style={{ cursor: "pointer" }} onClick={() => openPlus({ view: "gift", giftId: g.id })}>
                        <td>{g.to?.displayName || g.to?.username}</td>
                        <td>{t("plus2.ck.months", { n: g.months })}</td>
                        <td><span className={`p2-pill is-${chip.tone === "warn" ? "warn" : chip.tone === "ok" ? "ok" : chip.tone === "info" ? "info" : "muted"}`}>{t(`plus2.giftStatus.${chip.key}`)}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {me.active && !manual ? (
            me.cancelAtPeriodEnd || done === "cancelled" ? (
              <div className="p2-impact" style={{ background: "var(--surface-0)" }}>
                <h4>{t("plus2.manage.cancelled", { date: d(me.endsAt) })}</h4>
                {!store ? <button type="button" className="p2-btn is-cta is-sm" style={{ alignSelf: "flex-start" }} disabled={Boolean(busy)} onClick={() => run("resume", async () => { await resumeMembership(); setDone(null); })}>{t("plus2.manage.resume")}</button> : null}
              </div>
            ) : (
              <div className="p2-impact">
                <h4><AlertTriangle />{t("plus2.manage.ifCancel", { date: d(me.endsAt) })}</h4>
                <div className="p2-small" style={{ color: "var(--p2-t2)" }}>
                  {(impact?.servers || []).length === 0 ? t("plus2.manage.noImpact") : (impact.servers.map((s) => (
                    s.levelAfter < s.levelNow
                      ? t("plus2.manage.impactDrop", { server: s.name, from: s.boostsNow, to: s.boostsAfter, level: s.levelNow, members: s.membersAffected ?? 0 })
                      : t("plus2.manage.impactKeep", { server: s.name, from: s.boostsNow, to: s.boostsAfter, level: s.levelAfter })
                  )).join(" "))}
                  {" "}{t("plus2.manage.ownersNotice", { days: impact?.noticeDays ?? 3 })}
                </div>
                <div className="p2-row">
                  <select className="p2-select" value={reason} onChange={(e) => { setReason(e.target.value); setConfirm(false); }} aria-label={t("plus2.manage.reason")}>
                    <option value="">{t("plus2.manage.reasonPick")}</option>
                    {CANCEL_REASONS.map((r) => <option key={r} value={r}>{t(`plus2.reason.${r}`)}</option>)}
                  </select>
                  {confirm ? (
                    <button type="button" className="p2-btn is-danger" disabled={!reason || Boolean(busy)} onClick={doCancel}>{busy === "cancel" ? <Loader2 className="p2-spin" /> : null}{t("plus2.manage.confirmCancel")}</button>
                  ) : (
                    <button type="button" className="p2-btn is-danger" disabled={!reason} onClick={() => setConfirm(true)}>{store ? t("plus2.manage.cancelInStore") : t("plus2.manage.cancel")}</button>
                  )}
                </div>
              </div>
            )
          ) : manual && me.active ? <div className="p2-note">{t("plus2.manage.manualNote")}</div> : null}
          <ErrorLine code={err} />
        </div>
      )}
    </PlusWindow>
  );
}
