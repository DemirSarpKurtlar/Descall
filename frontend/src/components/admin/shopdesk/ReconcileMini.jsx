/** Draft A right-rail card: latest DesCoin reconciliation, last 14 runs, run now. */
import { useState } from "react";
import { adminFetch } from "../../../api/adminHttp";
import { useLocale } from "../../../context/LocaleContext";
import { AlertTriangle, CheckCircle2, History, Play, Scale } from "../../ui/Icon.jsx";
import { num, runBars } from "./shopDeskModel.js";
import { Bars, NewTag, Skel, errMsg } from "./ui.jsx";

export function runTone(v) {
  if (v == null) return "red";
  if (v === 0) return "green";
  return v >= 3 ? "red-soft" : "amber";
}

export default function ReconcileMini({ runs, reloadRuns, goTab }) {
  const { t, locale } = useLocale();
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState("");
  const data = runs?.data;
  const latest = data?.latest || null;
  const bars = runBars(data?.history || []);

  const runNow = async () => {
    setRunning(true);
    setErr("");
    try {
      await adminFetch("/descoin/reconciliation/run", { method: "POST", body: "{}" });
      await reloadRuns();
    } catch (e) {
      setErr(errMsg(t, e, "shopDesk.runError"));
    } finally {
      setRunning(false);
    }
  };

  const when = latest?.started_at ? new Date(latest.started_at) : null;
  const whenText = when ? `${when.toDateString() === new Date().toDateString() ? t("shopDesk.today") : when.toLocaleDateString(locale, { day: "numeric", month: "short" })} ${when.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}` : "";

  return (
    <section className="sdk-card sdk-recmini" aria-labelledby="sdk-recmini-h">
      <div className="sdk-card-head">
        <h2 id="sdk-recmini-h" className="sdk-card-title">
          <Scale size={20} />
          {t("shopDesk.reconcileTitle")}
        </h2>
        <button type="button" className="sdk-link" onClick={() => goTab("reconcile")}>
          {t("shopDesk.details")}
        </button>
      </div>
      {runs?.loading && !data ? (
        <Skel h={58} />
      ) : data?.installed === false ? (
        <p className="sdk-muted">{t("shopDesk.reconcileNotInstalled")}</p>
      ) : !latest ? (
        <p className="sdk-muted">{t("shopDesk.noRunYet")}</p>
      ) : latest.error ? (
        <div className="sdk-alert is-red">
          <AlertTriangle size={20} />
          <div>
            <b>{t("shopDesk.runFailed")}</b>
            <small>{latest.error}</small>
          </div>
        </div>
      ) : latest.mismatch_count > 0 ? (
        <button type="button" className="sdk-alert is-amber" onClick={() => goTab("reconcile")}>
          <AlertTriangle size={20} />
          <div>
            <b>{t("shopDesk.mismatchHead", { n: latest.mismatch_count })}</b>
            <small>{t("shopDesk.mismatchSub", { drift: num(latest.abs_drift, locale), when: whenText })}</small>
          </div>
        </button>
      ) : (
        <div className="sdk-alert is-green">
          <CheckCircle2 size={20} />
          <div>
            <b>{t("shopDesk.allMatch")}</b>
            <small>{whenText}</small>
          </div>
        </div>
      )}
      {bars.length ? (
        <>
          <div className="sdk-recmini-lab">
            <span>
              {t("shopDesk.last14")} <NewTag />
            </span>
            <span>{t("shopDesk.mismatchCount")}</span>
          </div>
          <Bars
            values={bars.map((b) => b.value)}
            toneOf={runTone}
            height={56}
            ariaLabel={t("shopDesk.last14")}
            labels={null}
          />
        </>
      ) : null}
      {err ? <p className="sdk-err">{err}</p> : null}
      <div className="sdk-row2">
        <button type="button" className="sdk-btn" onClick={runNow} disabled={running}>
          <Play size={16} />
          {running ? t("shopDesk.running") : t("shopDesk.runNow")}
        </button>
        <button type="button" className="sdk-btn" onClick={() => goTab("reconcile")}>
          <History size={16} />
          {t("shopDesk.previousRuns")}
        </button>
      </div>
    </section>
  );
}
