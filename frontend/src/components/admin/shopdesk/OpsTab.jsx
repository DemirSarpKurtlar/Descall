/** "DesCoin işlemleri": recent admin grants / revokes / ledger corrections + the quick panel. */
import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "../../../api/adminHttp";
import { useLocale } from "../../../context/LocaleContext";
import { Coins, MoreHorizontal } from "../../ui/Icon.jsx";
import { num, signed } from "./shopDeskModel.js";
import { Ava, Empty, Pill, Skel, errMsg } from "./ui.jsx";
import OpsStrip from "./OpsStrip.jsx";
import QuickPanel from "./QuickPanel.jsx";

export default function OpsTab({ data, items, kpis, mismatchCount, goTab, focusQuick, afterWrite, showToast, openPerson, openUserAction }) {
  const { t, locale } = useLocale();
  const [ops, setOps] = useState(null);
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    try {
      setOps(await adminFetch("/descoin/ops?limit=80"));
      setErr("");
    } catch (e) {
      setErr(errMsg(t, e, "shopDesk.loadError"));
    }
  }, [t]);
  useEffect(() => {
    load();
  }, [load]);
  const done = async (msg, action) => {
    await afterWrite(msg, action);
    load();
  };
  const reasonTone = { admin_grant: "green", admin_revoke: "red", reconcile_adjust: "amber" };
  return (
    <div className="sdk-ops">
      <OpsStrip kpis={kpis} mismatchCount={mismatchCount} reconcileAt={data?.reconcile?.started_at} onReconcile={() => goTab("reconcile")} />
      <div className="sdk-desk">
        <section className="sdk-card" aria-labelledby="sdk-ops-h">
          <div className="sdk-card-head">
            <h2 id="sdk-ops-h" className="sdk-card-title">
              <Coins size={20} />
              {t("shopDesk.opsTitle")}
            </h2>
            {ops?.week ? (
              <span className="sdk-muted">
                {t("shopDesk.opsWeek", { given: num(ops.week.given, locale), taken: num(ops.week.taken, locale), n: num(ops.week.count, locale) })}
              </span>
            ) : null}
          </div>
          {err ? <p className="sdk-err">{err}</p> : null}
          {!ops && !err ? (
            <Skel h={300} />
          ) : ops && !ops.ops.length ? (
            <Empty icon={Coins} title={t("shopDesk.noOps")} />
          ) : ops ? (
            <div className="sdk-table-wrap">
              <table className="sdk-table">
                <thead>
                  <tr>
                    <th>{t("shopDesk.col.user")}</th>
                    <th>{t("shopDesk.col.amount")}</th>
                    <th>{t("shopDesk.col.reason")}</th>
                    <th>{t("shopDesk.col.by")}</th>
                    <th>{t("shopDesk.col.time")}</th>
                    <th aria-label={t("shopDesk.col.actions")} />
                  </tr>
                </thead>
                <tbody>
                  {ops.ops.map((o) => (
                    <tr key={o.id} className="sdk-row">
                      <td>
                        <div className="sdk-item">
                          <Ava user={o.user} size={32} />
                          <div>
                            <b>{o.user?.displayName || t("shopDesk.deletedUser")}</b>
                            <small className="sdk-muted">{o.user ? `@${o.user.username}` : ""}</small>
                          </div>
                        </div>
                      </td>
                      <td className={`tnum ${o.amount >= 0 ? "sdk-green" : "sdk-red"}`}>
                        <b>{signed(o.amount, locale)}</b>
                        <small className="sdk-muted"> → {num(o.balanceAfter, locale)}</small>
                      </td>
                      <td>
                        <Pill tone={reasonTone[o.reason] || "gray"}>{t(`shopDesk.opReason.${o.reason}`)}</Pill>
                        {o.note ? <div className="sdk-muted sdk-clip">{o.note}</div> : null}
                        {o.message ? <div className="sdk-clip sdk-quote">{o.message}</div> : null}
                      </td>
                      <td className="sdk-muted">{o.by ? `@${o.by.username}` : "-"}</td>
                      <td className="sdk-muted">{new Date(o.at).toLocaleString(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                      <td>
                        {o.user ? (
                          <span className="sdk-rowacts">
                            <button type="button" className="sdk-link" onClick={() => openUserAction("wallet", { id: o.user.id, username: o.user.username, displayName: o.user.displayName }, { walletMode: "give" })}>
                              {t("shopDesk.wallet")}
                            </button>
                            <button type="button" className="sdk-icon-btn" onClick={() => openPerson(o.user.id)} aria-label={t("shopDesk.userFile")}>
                              <MoreHorizontal size={17} />
                            </button>
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
        <aside className="sdk-rail">
          <QuickPanel items={items} focusSignal={focusQuick} onDone={done} showToast={showToast} />
        </aside>
      </div>
    </div>
  );
}
