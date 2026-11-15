/**
 * Draft B "Mutabakat": health banner, schedule, run now, CSV, run stats, the last 14 runs,
 * mismatched balances with a fix button and a row menu (user file, ledger, check only this
 * user, wallet freeze via the shared wallet dialog, ban via BanDialog), and previous runs.
 */
import { useEffect, useRef, useState } from "react";
import { adminFetch } from "../../../api/adminHttp";
import { useLocale } from "../../../context/LocaleContext";
import DossierMenu from "../dossier/DossierMenu.jsx";
import {
  AlertTriangle, Ban, CheckCircle2, Clock, Download, History, List, MoreHorizontal, Play, RefreshCw, Scale, Snowflake, TrendingUp, User, XCircle,
} from "../../ui/Icon.jsx";
import { num, reconcileCsv, runBars, runSeconds, signed } from "./shopDeskModel.js";
import { Ava, Bars, Dropdown, Empty, NewTag, Pill, Skel, downloadText, errMsg } from "./ui.jsx";
import { runTone } from "./ReconcileMini.jsx";
import ReconcileFixDialog from "./ReconcileFixDialog.jsx";

function useSchedule() {
  const [s, setS] = useState(null);
  useEffect(() => {
    adminFetch("/descoin/reconciliation/settings").then(setS).catch(() => setS(null));
  }, []);
  return [s, setS];
}

export default function ReconcileTab({ runs, reloadRuns, openUserAction, openPerson, showToast }) {
  const { t, locale } = useLocale();
  const [running, setRunning] = useState(false);
  const [fix, setFix] = useState(null); // mismatch row
  const [sched, setSched] = useSchedule();
  const [checked, setChecked] = useState({});
  const data = runs?.data;
  const latest = data?.latest || null;
  const history = data?.history || [];
  const bars = runBars(history);

  const runNow = async () => {
    setRunning(true);
    try {
      await adminFetch("/descoin/reconciliation/run", { method: "POST", body: "{}" });
      await reloadRuns();
      showToast(t("shopDesk.runDone"));
    } catch (e) {
      showToast(errMsg(t, e, "shopDesk.runError"), null, "bad");
    } finally {
      setRunning(false);
    }
  };

  const setSchedule = async (id) => {
    const interval = Number(id);
    try {
      const r = await adminFetch("/descoin/reconciliation/settings", { method: "PUT", body: JSON.stringify({ intervalHours: interval, hourOfDay: sched?.settings?.hour_of_day ?? 4 }) });
      setSched((s) => ({ ...(s || {}), settings: r.settings, nextAt: r.nextAt, installed: true }));
      showToast(t("shopDesk.schedSaved"));
    } catch (e) {
      showToast(errMsg(t, e), null, "bad");
    }
  };

  const checkOne = async (m) => {
    try {
      const r = await adminFetch(`/descoin/users/${m.user_id}/check`, { method: "POST", body: "{}" });
      setChecked((c) => ({ ...c, [m.user_id]: r }));
      showToast(r.drift ? t("shopDesk.checkStill", { user: m.user?.username || "", drift: signed(r.drift, locale) }) : t("shopDesk.checkClean", { user: m.user?.username || "" }));
    } catch (e) {
      showToast(errMsg(t, e), null, "bad");
    }
  };

  const hour = String(sched?.settings?.hour_of_day ?? 4).padStart(2, "0");
  const schedOptions = [
    { id: "24", label: t("shopDesk.schedDaily", { time: `${hour}:00` }) },
    { id: "12", label: t("shopDesk.schedEvery", { n: 12 }) },
    { id: "6", label: t("shopDesk.schedEvery", { n: 6 }) },
  ];
  const when = latest?.started_at ? new Date(latest.started_at) : null;
  const whenText = when ? `${when.toDateString() === new Date().toDateString() ? t("shopDesk.today") : when.toLocaleDateString(locale, { day: "numeric", month: "short" })} ${when.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}` : "";
  const mismatches = latest?.mismatches || [];

  if (runs?.loading && !data) {
    return (
      <div className="sdk-b2">
        <Skel h={220} />
        <Skel h={420} />
      </div>
    );
  }
  if (data?.installed === false || runs?.error) {
    return <Empty icon={Scale} title={t("shopDesk.reconcileNotInstalled")} body={runs?.error?.message} />;
  }

  return (
    <div className="sdk-b2">
      <div className="sdk-b2-main">
        <section className="sdk-card sdk-rec-head">
          <div className="sdk-rec-top">
            {!latest ? (
              <div className="sdk-alert">
                <Scale size={20} />
                <div>
                  <b>{t("shopDesk.noRunYet")}</b>
                </div>
              </div>
            ) : latest.error ? (
              <div className="sdk-alert is-red">
                <XCircle size={20} />
                <div>
                  <b>{t("shopDesk.runFailed")}</b>
                  <small>{latest.error}</small>
                </div>
              </div>
            ) : latest.mismatch_count ? (
              <div className="sdk-alert is-amber">
                <AlertTriangle size={20} />
                <div>
                  <b>{t("shopDesk.mismatchHeadLong", { n: latest.mismatch_count })}</b>
                  <small>{t("shopDesk.mismatchSubLong", { when: whenText, trigger: t(`shopDesk.trigger.${latest.trigger === "manual" ? "manual" : "cron"}`) })}</small>
                </div>
              </div>
            ) : (
              <div className="sdk-alert is-green">
                <CheckCircle2 size={20} />
                <div>
                  <b>{t("shopDesk.allMatch")}</b>
                  <small>{whenText}</small>
                </div>
              </div>
            )}
            <button type="button" className="sdk-btn" onClick={() => downloadText(`descoin-reconciliation-${new Date().toISOString().slice(0, 10)}.csv`, reconcileCsv(mismatches))} disabled={!mismatches.length}>
              <Download size={17} />
              {t("shopDesk.csv")}
            </button>
            <Dropdown icon={Clock} label={t("shopDesk.schedule")} value={String(sched?.settings?.interval_hours ?? 24)} options={schedOptions} onChange={setSchedule} width={240} />
            <button type="button" className="sdk-btn is-primary" onClick={runNow} disabled={running} data-testid="sdk-run-now">
              <Play size={17} />
              {running ? t("shopDesk.running") : t("shopDesk.runNow")}
            </button>
          </div>
          {latest && !latest.error ? (
            <div className="sdk-rec-stats">
              <div>
                <b className="tnum">{num(latest.users_checked, locale)}</b>
                <small>{t("shopDesk.usersChecked")}</small>
              </div>
              <div>
                <b className="tnum">{num(latest.ledger_rows, locale)}</b>
                <small>{t("shopDesk.ledgerRows")}</small>
              </div>
              <div>
                <b className={`tnum${latest.abs_drift ? " sdk-amber" : ""}`}>{num(latest.abs_drift, locale)} DC</b>
                <small>{t("shopDesk.totalDrift")}</small>
              </div>
              <div>
                <b className="tnum">{runSeconds(latest) != null ? t("shopDesk.seconds", { n: runSeconds(latest) }) : "-"}</b>
                <small>{t("shopDesk.duration")}</small>
              </div>
            </div>
          ) : null}
          {sched?.nextAt ? <p className="sdk-muted sdk-next">{t("shopDesk.nextRun", { when: new Date(sched.nextAt).toLocaleString(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) })}</p> : null}
        </section>

        <section className="sdk-card">
          <div className="sdk-card-head">
            <h2 className="sdk-card-title">
              <TrendingUp size={20} />
              {t("shopDesk.last14days")}
              <NewTag />
            </h2>
            <span className="sdk-muted">{t("shopDesk.mismatchCountLong")}</span>
          </div>
          {bars.length ? (
            <Bars
              values={bars.map((b) => b.value)}
              toneOf={runTone}
              height={130}
              tops={bars.map((b) => (b.error ? t("shopDesk.errShort") : b.value ? b.value : ""))}
              labels={bars.map((b) => new Date(b.at).toLocaleDateString(locale, { day: "numeric", month: "short" }))}
              ariaLabel={t("shopDesk.last14days")}
            />
          ) : (
            <p className="sdk-muted">{t("shopDesk.noRunYet")}</p>
          )}
        </section>

        <section className="sdk-card">
          <div className="sdk-card-head">
            <h2 className="sdk-card-title">
              <User size={20} />
              {t("shopDesk.mismatched")}
            </h2>
          </div>
          {!mismatches.length ? (
            <Empty icon={CheckCircle2} title={t("shopDesk.noMismatch")} />
          ) : (
            <div className="sdk-table-wrap">
              <table className="sdk-table sdk-rectable">
                <thead>
                  <tr>
                    <th>{t("shopDesk.col.user")}</th>
                    <th>{t("shopDesk.col.balance")}</th>
                    <th>{t("shopDesk.col.ledger")}</th>
                    <th>{t("shopDesk.col.drift")}</th>
                    <th>{t("shopDesk.col.rows")}</th>
                    <th>{t("shopDesk.col.lastAfter")}</th>
                    <th aria-label={t("shopDesk.col.actions")} />
                  </tr>
                </thead>
                <tbody>
                  {mismatches.map((m) => (
                    <MismatchRow
                      key={m.user_id}
                      m={m}
                      checked={checked[m.user_id]}
                      onFix={() => setFix(m)}
                      onCheck={() => checkOne(m)}
                      openPerson={openPerson}
                      openUserAction={openUserAction}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <aside className="sdk-card sdk-runs" aria-labelledby="sdk-runs-h">
        <div className="sdk-card-head">
          <h2 id="sdk-runs-h" className="sdk-card-title">
            <History size={20} />
            {t("shopDesk.previousRuns")}
          </h2>
          <span className="sdk-link">{t("shopDesk.nDays", { n: 14 })}</span>
        </div>
        <ul className="sdk-runlist">
          {history.map((r) => {
            const sec = runSeconds(r);
            const at = new Date(r.started_at);
            return (
              <li key={r.id}>
                <div>
                  <b>{at.toLocaleString(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</b>
                  <small>
                    {r.trigger === "manual" ? t("shopDesk.trigger.manualBy", { user: r.by ? `@${r.by}` : "-" }) : t("shopDesk.trigger.cron")}
                    {" · "}
                    {r.error ? t("shopDesk.timeout") : sec != null ? t("shopDesk.seconds", { n: sec }) : "-"}
                  </small>
                </div>
                {r.error ? <Pill tone="red">{t("shopDesk.errUpper")}</Pill> : r.mismatch_count ? <Pill tone="amber">{t("shopDesk.nMismatchUpper", { n: r.mismatch_count })}</Pill> : <Pill tone="green">{t("shopDesk.cleanUpper")}</Pill>}
              </li>
            );
          })}
          {!history.length ? <li className="sdk-muted">{t("shopDesk.noRunYet")}</li> : null}
        </ul>
        <div className="sdk-rule">
          <b>{t("shopDesk.ruleTitle")}</b>
          <p>{t("shopDesk.ruleText")}</p>
        </div>
      </aside>

      <ReconcileFixDialog
        open={Boolean(fix)}
        mismatch={fix}
        run={latest}
        onClose={() => setFix(null)}
        openPerson={openPerson}
        openUserAction={openUserAction}
        onDone={(msg) => {
          setFix(null);
          showToast(msg);
          reloadRuns();
        }}
      />
    </div>
  );
}

function MismatchRow({ m, checked, onFix, onCheck, openPerson, openUserAction }) {
  const { t, locale } = useLocale();
  const menuRef = useRef(null);
  const [open, setOpen] = useState(false);
  const user = m.user || { id: m.user_id, username: m.user_id.slice(0, 8), displayName: m.user_id.slice(0, 8) };
  const drift = checked ? checked.drift : m.drift;
  const frozen = Boolean(m.user?.frozen ?? checked?.user?.frozen);
  const fixed = m.fix || (checked && checked.drift === 0 ? { mode: "checked" } : null);
  const dossierUser = { id: user.id, username: user.username, displayName: user.displayName, avatarUrl: user.avatarUrl };
  return (
    <tr className={`sdk-row${fixed ? " is-dim" : ""}`}>
      <td>
        <div className="sdk-item">
          <Ava user={user} size={36} />
          <div>
            <b>
              {user.displayName}
              {frozen ? (
                <span className="sdk-frozen">
                  <Snowflake size={12} />
                  {t("shopDesk.frozenUpper")}
                </span>
              ) : null}
            </b>
            <small className="sdk-muted">@{user.username}</small>
          </div>
        </div>
      </td>
      <td className="tnum">
        <b>{num(checked ? checked.balance : m.balance, locale)}</b>
      </td>
      <td className="tnum">
        <b>{num(checked ? checked.ledgerSum : m.ledger_sum, locale)}</b>
      </td>
      <td className={`tnum ${drift > 0 ? "sdk-amber" : drift < 0 ? "sdk-red" : "sdk-green"}`}>
        <b>{signed(drift, locale)}</b>
      </td>
      <td className="tnum sdk-muted">{num(checked ? checked.ledgerRows : m.ledger_rows, locale)}</td>
      <td className="tnum sdk-muted">{m.last_balance_after == null ? "-" : num(m.last_balance_after, locale)}</td>
      <td className="sdk-rowacts">
        {fixed && fixed.mode !== "checked" ? (
          <Pill tone="green">{t(`shopDesk.fixedAs.${fixed.mode}`, { user: fixed.by || "-" })}</Pill>
        ) : drift === 0 && checked ? (
          <Pill tone="green">{t("shopDesk.cleanUpper")}</Pill>
        ) : (
          <button type="button" className="sdk-btn is-primary is-sm" onClick={onFix} data-testid="sdk-fix-btn">
            <Scale size={16} />
            {t("shopDesk.fix")}
          </button>
        )}
        <button type="button" className="sdk-icon-btn is-boxed" onClick={onFix} aria-label={t("shopDesk.viewLedger")}>
          <List size={17} />
        </button>
        <button ref={menuRef} type="button" className="sdk-icon-btn is-boxed" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)} aria-label={t("shopDesk.rowMenu", { name: user.username })} data-testid="sdk-rec-menu">
          <MoreHorizontal size={17} />
        </button>
        <DossierMenu
          open={open}
          anchorRef={menuRef}
          onClose={() => setOpen(false)}
          label={t("shopDesk.rowMenu", { name: user.username })}
          width={330}
          testId="sdk-rec-menu-list"
          items={[
            { id: "file", label: t("shopDesk.rm.file"), sub: t("shopDesk.rm.fileSub"), icon: User, onSelect: () => openPerson?.(user.id) },
            { id: "ledger", label: t("shopDesk.rm.ledger"), sub: t("shopDesk.rm.ledgerSub", { n: num(m.ledger_rows, locale) }), icon: List, onSelect: onFix },
            { id: "check", label: t("shopDesk.rm.check"), sub: t("shopDesk.rm.checkSub"), icon: RefreshCw, onSelect: onCheck },
            frozen
              ? { id: "unfreeze", label: t("shopDesk.rm.unfreeze"), sub: t("shopDesk.rm.unfreezeSub"), icon: Snowflake, onSelect: () => openUserAction("freeze", dossierUser) }
              : { id: "freeze", label: t("shopDesk.rm.freeze"), sub: t("shopDesk.rm.freezeSub"), icon: Snowflake, onSelect: () => openUserAction("freeze", dossierUser) },
            "sep",
            { id: "ban", label: t("shopDesk.rm.ban"), sub: t("shopDesk.rm.banSub"), icon: Ban, danger: true, onSelect: () => openUserAction("ban", dossierUser) },
          ]}
        />
      </td>
    </tr>
  );
}
