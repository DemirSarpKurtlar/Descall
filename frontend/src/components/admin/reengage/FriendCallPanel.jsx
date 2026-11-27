import { useEffect, useState } from "react";
import { Shield, AlertTriangle, RefreshCw, Coins } from "../../ui/Icon.jsx";
import { reengageAdmin } from "../../../api/reengage";

/**
 * Growth 3B "Arkadaştan çağrı · bu hafta": suggestions shown -> called -> returned, the
 * friend-call return rate next to the system message's, DesCoin paid, the abuse rules
 * and the log (rewards, refusals with their reason, the owner's reward decisions).
 */
export default function FriendCallPanel({ t, locale, isOwner, onDialog }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let alive = true;
    reengageAdmin
      .friendCall()
      .then((r) => alive && setD(r))
      .catch(() => alive && setErr(t("rg3.errors.load")));
    return () => {
      alive = false;
    };
  }, [nonce, t]);
  if (err)
    return (
      <div className="rg-state-card" role="alert">
        <AlertTriangle size={18} />
        <b>{err}</b>
        <button type="button" className="rg-btn" onClick={() => setNonce((n) => n + 1)}>
          <RefreshCw size={14} /> {t("rg3.common.retry")}
        </button>
      </div>
    );
  if (!d) return <div className="rg-skel tall" />;
  const max = Math.max(1, d.shown);
  const fmt = (iso) => new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" }).format(new Date(iso));
  const changeReward = () =>
    onDialog({
      title: t("rg3.fc.rewardTitle"),
      body: t("rg3.fc.rewardBody", { amount: d.reward }),
      confirmLabel: t("rg3.common.save"),
      number: { label: t("rg3.fc.rewardPrompt"), value: d.reward, min: 0, max: 200 },
      onConfirm: async (reason, n) => {
        await reengageAdmin.settings({ callReward: n, reason });
        setNonce((x) => x + 1);
      },
    });
  return (
    <div className="rg-fc">
      <div className="rg-funnel wide">
        {[
          ["shown", d.shown],
          ["called", d.called],
          ["returned", d.returned],
        ].map(([k, v]) => (
          <div key={k}>
            <span>{t(`rg3.fc.${k}`)}</span>
            <i className={k === "returned" ? "green" : ""} style={{ width: `${Math.max(4, (v / max) * 100)}%` }}>
              {v}
            </i>
          </div>
        ))}
      </div>
      <div className="rg-kpis two">
        <div className="rg-kpi green">
          <small>{t("rg3.fc.rateCall")}</small>
          <b>{d.rate != null ? `%${d.rate}` : "—"}</b>
          <em>{t("rg3.fc.rateSystem", { pct: d.systemRate != null ? `%${d.systemRate}` : "—" })}</em>
        </div>
        <div className="rg-kpi">
          <small>{t("rg3.fc.paid")}</small>
          <b>
            <Coins size={16} /> {new Intl.NumberFormat(locale).format(d.descoin)}
          </b>
          <em>{t("rg3.fc.paidSub", { count: d.rewarded, amount: d.reward })}</em>
        </div>
      </div>
      <div className="rg-rulebox">
        <b>
          <Shield size={14} /> {t("rg3.fc.rulesTitle")}
        </b>
        <p>{t("rg3.fc.rules", { week: d.rules.callerPerWeek, month: d.rules.targetPerMonth, days: d.rules.callerMinAccountDays, minutes: d.rules.minActiveMinutes })}</p>
        {isOwner ? (
          <button type="button" className="rg-btn sm" onClick={changeReward}>
            {t("rg3.fc.changeReward", { amount: d.reward })}
          </button>
        ) : null}
      </div>
      <b className="rg-card-t">{t("rg3.fc.log")}</b>
      <div className="rg-log">
        {d.log.map((l) => (
          <div key={l.id} className="rg-logrow">
            <time>{fmt(l.at)}</time>
            <span className="tx">
              <b>{t(`rg3.fc.log_${l.status}`, { caller: l.caller.name || "?", target: l.target.name || "?" })}</b>
              <small>
                {l.status === "rewarded"
                  ? t("rg3.fc.logRewarded", { amount: l.amount, minutes: l.activeMinutes, target: l.target.name || "?" })
                  : l.denyReason
                    ? t(`rg3.fc.deny_${l.denyReason}`)
                    : ""}
              </small>
            </span>
          </div>
        ))}
        {(d.decisions || []).map((x, i) => (
          <div key={`d${i}`} className="rg-logrow">
            <time>{fmt(x.at)}</time>
            <span className="tx">
              <b>{t("rg3.fc.decision", { by: x.by || "?" })}</b>
              <small>{x.reason}</small>
            </span>
          </div>
        ))}
        {!d.log.length && !(d.decisions || []).length ? <p className="rg-empty sm">{t("rg3.admin.logEmpty")}</p> : null}
      </div>
    </div>
  );
}
