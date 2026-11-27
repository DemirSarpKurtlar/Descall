/**
 * Ayarlar > Güvenlik > Passkey'ler, draft A "Güvenlik kontrol merkezi":
 *   summary numbers (count, passkey share of sign-ins, sign-in speed, security score),
 *   the passkey list with 30-day bars, the side panel of the selected passkey (rename in
 *   place, remove with a reason and a confirmation), the live preview of the system window
 *   it opens (desktop + phone, states with a platform switcher), recent activity, the
 *   unused-passkey warning, the backup advice, the security e-mail and the new-place alert.
 *
 * Data: GET /api/auth/passkeys/center (routes/passkeys.js). Live: "descall:passkeys-changed"
 * (socket passkeys:changed). Layout by the space it gets (ResizeObserver): wide = list,
 * panel, preview side by side; medium = list + panel with the preview under it; narrow
 * (phones) = list, the panel in a bottom sheet.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence } from "framer-motion";
import { AlertTriangle, ChevronRight, KeyRound, Lock, Plus, RefreshCw, Smartphone, WifiOff } from "../../ui/Icon.jsx";
import GlassConfirm from "../../ui/GlassConfirm.jsx";
import useModalFocus from "../../../hooks/useModalFocus.js";
import { useT, useLocale } from "../../../context/LocaleContext";
import { useToast } from "../../../context/ToastContext";
import { isAvailable, loadCenter, renamePasskey, removePasskey, resolvePasskeyAlert, normalizePasskeyError, passkeyErrorKey, forgetLocalPasskey, detectPasskeyPath } from "../../../lib/passkeys/index.js";
import { passkeyKind, kindFamily, usageBars, stalePasskeys, mixPercent, seconds, backupAdvice, idleDays, signInStyle, suggestionState, resetSuggestion, answerSuggestion } from "../../../lib/passkeys/visual.js";
import { KindTile, Spark, ScoreRing } from "./bits.jsx";
import { relativeUse, whereText, dayMonth, yearOf, providerText, shortWhen } from "./centerFormat.js";
import { PasskeyDetail, AddedCard, ActivityList, eventLine } from "./CenterDrawer.jsx";
import { BackupCard, EmailCard, AlertCard } from "./CenterCards.jsx";
import CenterPreview from "./CenterPreview.jsx";
import AddPanel from "./AddPanel.jsx";
import "../../../styles/passkey-center.css";

const COLS = "34px minmax(0,1.5fr) minmax(0,1.25fr) minmax(0,.8fr) 64px";

function useWidth(ref) {
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    setW(el.getBoundingClientRect().width);
    if (typeof ResizeObserver !== "function") return undefined;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

function useOnline() {
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine !== false);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

function Kpis({ data, t }) {
  const s = data.summary || {};
  const mix = mixPercent(s.mix);
  const kinds = new Set((data.passkeys || []).filter((p) => !p.suspended).map((p) => kindFamily(passkeyKind(p))));
  const pk = seconds(s.avgPasskeyMs);
  const pw = seconds(s.avgPasswordMs);
  const score = s.score || { value: 0, level: "weak", methods: 0, checks: [] };
  const [open, setOpen] = useState(false);
  const fmt = (n) => (n == null ? "" : String(n).replace(".", t("passkey.center.kpi.decimal")));
  return (
    <div className="pkc-kpis">
      <div className="pkc-kpi glass">
        <div className="l">{t("passkey.center.kpi.count")}</div>
        <div className="v tnum">{(data.passkeys || []).length}</div>
        <div className="s">{t("passkey.center.kpi.platforms", { count: kinds.size })}</div>
      </div>
      <div className="pkc-kpi glass" title={s.mix?.total ? t("passkey.center.kpi.basis", { count: s.mix.total }) : undefined}>
        <div className="l">{t("passkey.center.kpi.share")}</div>
        <div className="v tnum">{mix ? `%${mix.passkey}` : "-"}</div>
        {mix ? (
          <div className="pkc-mixbar" role="img" aria-label={t("passkey.center.kpi.mixLabel", { passkey: mix.passkey, password: mix.password, social: mix.social })}>
            <i className="pk" style={{ width: `${mix.passkey}%` }} />
            <i className="pw" style={{ width: `${mix.password}%` }} />
            <i className="so" style={{ width: `${mix.social}%` }} />
          </div>
        ) : (
          <div className="s">{t("passkey.center.kpi.noData")}</div>
        )}
      </div>
      <div className="pkc-kpi glass">
        <div className="l">{t("passkey.center.kpi.speed")}</div>
        <div className="v tnum">{pk ? t("passkey.center.kpi.seconds", { s: fmt(pk) }) : "-"}</div>
        <div className="s">{pw ? t("passkey.center.kpi.passwordSpeed", { s: fmt(Math.round(pw)) }) : t("passkey.center.kpi.noMeasure")}</div>
      </div>
      <button type="button" className="pkc-kpi glass score" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <ScoreRing value={score.value} level={score.level} />
        <div>
          <div className="l">{t("passkey.center.kpi.security")}</div>
          <div className={`lv lv-${score.level}`}>{t(`passkey.center.level.${score.level}`)}</div>
          <div className="s">{t("passkey.center.kpi.methods", { count: score.methods })}</div>
        </div>
        {open ? (
          <div className="pkc-score-pop heavy" role="list">
            {score.checks.map((c) => (
              <div key={c.id} role="listitem" className={c.ok ? "ok" : "no"}>
                <i aria-hidden="true" />
                <span>{t(`passkey.center.check.${c.id}`)}</span>
                <em>+{c.weight}</em>
              </div>
            ))}
          </div>
        ) : null}
      </button>
    </div>
  );
}

function MethodChips({ data, t }) {
  const s = data.summary || {};
  const count = (data.passkeys || []).length;
  return (
    <div className="pkc-chips">
      <span className="pkc-chip">
        <Lock size={13} /> {t("passkey.center.chip.password")} <em className="pkc-pill ok">{s.password ? t("passkey.center.chip.alwaysOn") : t("passkey.center.chip.none")}</em>
      </span>
      <span className="pkc-chip">
        <Smartphone size={13} /> {t("passkey.center.chip.app")} <em className={`pkc-pill ${s.totp ? "ok" : ""}`}>{s.totp ? t("passkey.center.chip.on") : t("passkey.center.chip.off")}</em>
      </span>
      {s.email2fa ? (
        <span className="pkc-chip">
          <Lock size={13} /> {t("passkey.center.chip.email2fa")} <em className="pkc-pill ok">{t("passkey.center.chip.on")}</em>
        </span>
      ) : null}
      <span className="pkc-chip">
        <KeyRound size={13} /> {t("passkey.center.chip.passkey")} <em className="pkc-pill brand">{t("passkey.center.chip.registered", { count })}</em>
      </span>
    </div>
  );
}

export default function PasskeyCenter({ onBack, me, onHidden }) {
  const t = useT();
  const { locale } = useLocale();
  const { toast } = useToast();
  const rootRef = useRef(null);
  const sheetRef = useRef(null);
  const width = useWidth(rootRef);
  const online = useOnline();
  const layout = width >= 1080 ? "wide" : width >= 720 ? "medium" : "narrow";
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [avail, setAvail] = useState({ available: false, path: null });
  const [sel, setSel] = useState(null);
  const [mode, setMode] = useState("detail"); // detail | add | added | activity
  const [prefer, setPrefer] = useState(undefined);
  const [added, setAdded] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [alertConfirm, setAlertConfirm] = useState(null);
  const [suggestOn, setSuggestOn] = useState(() => {
    try {
      return !suggestionState(window.localStorage).never;
    } catch {
      return true;
    }
  });

  const load = useCallback(async () => {
    try {
      const res = await loadCenter();
      setData(res);
      setStatus("ready");
    } catch (err) {
      const e = normalizePasskeyError(err);
      if (e.serverCode === "PASSKEYS_UNAVAILABLE" || e.serverCode === "PASSKEYS_DISABLED") {
        onHidden?.();
        setStatus("hidden");
        return;
      }
      setStatus((s) => (s === "ready" ? s : "error"));
    }
  }, [onHidden]);

  useEffect(() => {
    load();
    isAvailable()
      .then(setAvail)
      .catch(() => setAvail({ available: false, path: detectPasskeyPath() }));
    const onChanged = () => load();
    window.addEventListener("descall:passkeys-changed", onChanged);
    window.addEventListener("online", onChanged);
    return () => {
      window.removeEventListener("descall:passkeys-changed", onChanged);
      window.removeEventListener("online", onChanged);
    };
  }, [load]);

  const passkeys = useMemo(() => data?.passkeys || [], [data]);
  const selected = passkeys.find((p) => p.id === sel) || passkeys[0] || null;
  useEffect(() => {
    if (!sel && passkeys[0]) setSel(passkeys[0].id);
    if (sel && passkeys.length && !passkeys.some((p) => p.id === sel)) setSel(passkeys[0].id);
  }, [passkeys, sel]);

  const stale = stalePasskeys(passkeys, Date.now(), data?.staleDays || 30);
  const suspended = passkeys.filter((p) => p.suspended);
  const alerts = data?.alerts || [];
  const advice = backupAdvice(passkeys, avail.path);
  const atMax = data && passkeys.length >= (data.max || 20);
  const canAdd = avail.available && !atMax && online;
  const style = signInStyle(avail.path);
  const account = me?.username || "";
  const isCurrent = (p) => Boolean(p && data?.currentPasskeyId && p.id === data.currentPasskeyId);

  const pick = (id) => {
    setSel(id);
    setMode("detail");
    if (layout === "narrow") setSheet(true);
  };
  const openAdd = (pref) => {
    setPrefer(pref === "remoteDevice" || pref === "securityKey" ? pref : undefined);
    setMode("add");
    if (layout === "narrow") setSheet(true);
  };

  const errText = (err) => t(passkeyErrorKey(err) || "passkey.err.server");

  const rename = async (p, name) => {
    setBusy(true);
    try {
      const res = await renamePasskey(p.id, name);
      setData((d) => ({ ...d, passkeys: d.passkeys.map((x) => (x.id === p.id ? { ...x, ...res.passkey } : x)) }));
      toast(t("passkey.settings.renamed"), "success");
      return true;
    } catch (err) {
      toast(errText(err), "error");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const remove = async (p, { reason, endSessions }) => {
    setBusy(true);
    try {
      const res = await removePasskey(p.id, { reason, endSessions });
      if (isCurrent(p) || reason === "undo") forgetLocalPasskey();
      setData((d) => ({ ...d, passkeys: d.passkeys.filter((x) => x.id !== p.id) }));
      setSheet(false);
      const n = Number(res?.sessionsEnded) || 0;
      toast(n ? `${t("passkey.settings.removed")} ${t("passkey.center.remove.sessionsEnded", { count: n })}` : t("passkey.settings.removed"), "success");
      load();
    } catch (err) {
      toast(errText(err), "error");
    } finally {
      setBusy(false);
    }
  };

  const onAdded = (res) => {
    const p = res?.passkey;
    if (!p) {
      load();
      setMode("detail");
      return;
    }
    setData((d) => (d ? { ...d, passkeys: [{ ...p, uses30: [], places: [] }, ...(d.passkeys || []).filter((x) => x.id !== p.id)] } : d));
    setSel(p.id);
    setAdded(p);
    setMode("added");
    try {
      answerSuggestion(window.localStorage, "added");
    } catch {
      /* storage off */
    }
    load();
  };

  const saveAdded = async (p, name) => {
    if (name && name !== p.name) await rename(p, name);
    else toast(t("passkey.settings.added"), "success");
    setAdded(null);
    setMode("detail");
  };

  const undoAdded = async (p) => {
    await remove(p, { reason: "undo", endSessions: false });
    setAdded(null);
    setMode("detail");
    toast(t("passkey.center.added.undone"), "success");
  };

  const resolveAlert = async (alert, action) => {
    if (action === "revoke" && !alertConfirm) {
      setAlertConfirm(alert);
      return;
    }
    setBusy(true);
    try {
      const res = await resolvePasskeyAlert(alert.id, action);
      setAlertConfirm(null);
      toast(action === "revoke" ? t("passkey.center.alert.doneRevoke", { count: Number(res?.sessionsEnded) || 0 }) : t("passkey.center.alert.doneMe"), "success");
      load();
    } catch (err) {
      setAlertConfirm(null);
      toast(errText(err), "error");
    } finally {
      setBusy(false);
    }
  };

  const toggleSuggest = () => {
    try {
      if (suggestOn) answerSuggestion(window.localStorage, "never");
      else resetSuggestion(window.localStorage);
    } catch {
      /* storage off */
    }
    setSuggestOn((v) => !v);
  };

  useModalFocus(layout === "narrow" && sheet, sheetRef);

  if (status === "hidden") return null;

  const drawerBody =
    mode === "add" ? (
      <AddPanel path={avail.path} methods={data?.reauthMethods || []} fresh={Boolean(data?.freshSignIn)} prefer={prefer} onAdded={onAdded} onCancel={() => { setMode("detail"); setSheet(false); }} />
    ) : mode === "added" && added ? (
      <AddedCard p={passkeys.find((x) => x.id === added.id) || added} busy={busy} onSave={saveAdded} onUndo={undoAdded} />
    ) : mode === "activity" ? (
      <ActivityList events={data?.activity || []} onClose={() => { setMode("detail"); setSheet(false); }} />
    ) : selected ? (
      <PasskeyDetail p={selected} current={isCurrent(selected)} offline={!online} busy={busy} onRename={rename} onRemove={remove} />
    ) : (
      <div className="pkc-detail-empty">
        <span className="pkc-bigic b">
          <KeyRound size={26} />
        </span>
        <b>{t("passkey.center.empty.title")}</b>
        <p className="pkc-small muted">{t(`passkey.center.empty.lead.${style}`)}</p>
      </div>
    );

  const preview = selected && mode !== "activity" ? <CenterPreview passkey={selected} account={account} compact={layout === "narrow"} /> : null;

  const main = (
    <div className="pkc-main">
      <nav className="pkc-crumb" aria-label={t("passkey.center.crumbLabel")}>
        <button type="button" onClick={onBack}>
          {t("passkey.center.crumbSecurity")}
        </button>
        <ChevronRight size={12} aria-hidden="true" />
        <b aria-current="page">{t("passkey.settings.title")}</b>
      </nav>
      <div className="pkc-head">
        <div className="grow">
          <h3>{t("passkey.settings.title")}</h3>
          <p className="pkc-small muted">{t("passkey.center.lead")}</p>
        </div>
        <button type="button" className="pkc-btn sm pri" onClick={() => openAdd()} disabled={!canAdd || !data} title={!avail.available ? t("passkey.settings.unavailableHere") : atMax ? t("passkey.err.limit") : undefined}>
          <Plus size={15} weight="bold" /> {t("passkey.settings.add")}
        </button>
      </div>

      {!online ? (
        <div className="pkc-ibox warn" role="status">
          <WifiOff size={15} />
          <span>{t("passkey.center.offline")}</span>
        </div>
      ) : null}

      {status === "loading" ? (
        <div className="pkc-skeleton" aria-busy="true" aria-label={t("passkey.desktop.loading")}>
          <div className="pkc-kpis">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="pkc-kpi glass sk" />
            ))}
          </div>
          <div className="pkc-list glass sk" style={{ height: 220 }} />
        </div>
      ) : status === "error" ? (
        <div className="pkc-ibox err" role="alert">
          <AlertTriangle size={15} />
          <span className="grow">{t("passkey.settings.loadFailed")}</span>
          <button type="button" className="pkc-btn xs" onClick={load}>
            <RefreshCw size={13} /> {t("passkey.settings.retry")}
          </button>
        </div>
      ) : (
        <>
          <Kpis data={data} t={t} />
          <MethodChips data={data} t={t} />
          {alerts[0] ? (
            <div className="pkc-ibox err">
              <AlertTriangle size={15} />
              <span className="grow">{t(alerts[0].city ? "passkey.center.alert.titleCity" : "passkey.center.alert.titleCountry", { name: alerts[0].name || "Passkey" })}</span>
              <button type="button" className="pkc-btn xs" onClick={() => document.getElementById("pkc-alert")?.scrollIntoView({ behavior: "smooth", block: "center" })}>
                {t("passkey.center.review")}
              </button>
            </div>
          ) : null}
          {suspended[0] ? (
            <div className="pkc-ibox err">
              <AlertTriangle size={15} />
              <span className="grow">
                <b>{suspended[0].name}</b> {t("passkey.center.suspendedShort")}
              </span>
              <button type="button" className="pkc-btn xs" onClick={() => pick(suspended[0].id)}>
                {t("passkey.center.review")}
              </button>
            </div>
          ) : null}
          {stale[0] ? (
            <div className="pkc-ibox warn">
              <AlertTriangle size={15} />
              <span className="grow">{t("passkey.center.stale", { name: stale[0].name, count: idleDays(stale[0]) })}</span>
              <button type="button" className="pkc-btn xs" onClick={() => pick(stale[0].id)}>
                {t("passkey.center.review")}
              </button>
            </div>
          ) : null}
          {!avail.available && data ? <p className="pkc-small muted">{t("passkey.settings.unavailableHere")}</p> : null}
          {atMax ? <p className="pkc-small muted">{t("passkey.err.limit")}</p> : null}

          {passkeys.length ? (
            <div className="pkc-list glass" role="listbox" aria-label={t("passkey.settings.count", { count: passkeys.length })}>
              {layout !== "narrow" ? (
                <div className="pkc-lrow lhead" style={{ gridTemplateColumns: COLS }} aria-hidden="true">
                  <span />
                  <span>{t("passkey.center.col.passkey")}</span>
                  <span>{t("passkey.center.col.last")}</span>
                  <span>{t("passkey.center.col.added")}</span>
                  <span>{t("passkey.center.col.usage")}</span>
                </div>
              ) : null}
              {passkeys.map((p) => {
                const idle = idleDays(p);
                const isStale = !p.suspended && idle >= (data.staleDays || 30);
                return (
                  <div
                    key={p.id}
                    role="option"
                    tabIndex={0}
                    aria-selected={selected?.id === p.id}
                    className={`pkc-lrow${selected?.id === p.id && layout !== "narrow" ? " sel" : ""}`}
                    style={layout !== "narrow" ? { gridTemplateColumns: COLS } : undefined}
                    onClick={() => pick(p.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        pick(p.id);
                      }
                    }}
                  >
                    <KindTile kind={passkeyKind(p)} />
                    <div className="min0">
                      <div className="nm">
                        <span className="ell">{p.name}</span>
                        {isCurrent(p) ? <em className="pkc-pill brand">{t("passkey.center.pill.thisDevice")}</em> : null}
                        {p.suspended ? <em className="pkc-pill err">{t("passkey.center.pill.off")}</em> : isStale ? <em className="pkc-pill warn">{t("passkey.center.pill.days", { count: idle })}</em> : null}
                      </div>
                      <div className="meta ell">{layout === "narrow" ? `${providerText(p, t)} · ${relativeUse(p.lastUsedAt, t, locale)}` : providerText(p, t)}</div>
                    </div>
                    {layout !== "narrow" ? (
                      <>
                        <div className="min0">
                          <div className="ell">{relativeUse(p.lastUsedAt, t, locale)}</div>
                          <div className="meta ell">{whereText(p, t, locale)}</div>
                        </div>
                        <div className="tnum">
                          {dayMonth(p.createdAt, locale)}
                          <div className="meta">{yearOf(p.createdAt)}</div>
                        </div>
                        <Spark values={usageBars(p.uses30 || [])} />
                      </>
                    ) : (
                      <ChevronRight size={16} className="muted" />
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="pkc-empty glass">
              <span className="pkc-bigic b">
                <KeyRound size={26} />
              </span>
              <b>{t("passkey.center.empty.title")}</b>
              <p className="pkc-small muted">{t(`passkey.center.empty.lead.${style}`)}</p>
              <button type="button" className="pkc-btn sm pri" onClick={() => openAdd()} disabled={!canAdd}>
                <Plus size={15} weight="bold" /> {t("passkey.settings.add")}
              </button>
            </div>
          )}

          <div className="pkc-activity glass">
            <b>{t("passkey.center.activity.title")}</b>
            {(data.activity || []).slice(0, 3).map((e) => (
              <span key={e.id} className="ev">
                <i className={e.kind === "signin" ? "g" : e.kind === "removed" || e.kind === "report_revoked" ? "r" : ""} aria-hidden="true" />
                {shortWhen(e.at, t, locale)} {eventLine(e, t)}
              </span>
            ))}
            {!(data.activity || []).length ? <span className="ev muted">{t("passkey.center.activity.empty")}</span> : null}
            <button
              type="button"
              className="pkc-link push"
              onClick={() => {
                setMode("activity");
                if (layout === "narrow") setSheet(true);
              }}
            >
              {t("passkey.center.activity.all")}
            </button>
          </div>

          <div className="pkc-cards">
            <BackupCard advice={advice} disabled={!canAdd} onAdd={openAdd} />
            <EmailCard passkey={passkeys[0]} emailOn={data.summary?.emailConfirmed !== false} />
            <AlertCard alert={alerts[0]} passkey={passkeys.find((p) => p.id === alerts[0]?.passkeyId)} busy={busy} offline={!online} geo={data.geo} onResolve={resolveAlert} />
          </div>

          <div className="pkc-setting glass">
            <span className="grow" id="pkc-suggest-label">
              <b>{t("passkey.center.suggestToggle")}</b>
              <span className="pkc-small muted">{t("passkey.center.suggestToggleSub")}</span>
            </span>
            <button type="button" role="switch" aria-checked={suggestOn} aria-labelledby="pkc-suggest-label" className={`pkc-switch${suggestOn ? " on" : ""}`} onClick={toggleSuggest} />
          </div>
        </>
      )}
    </div>
  );

  return (
    <div ref={rootRef} className={`pkc pkc-${layout}`} data-testid="passkey-center">
      {main}
      {layout !== "narrow" && status === "ready" ? (
        <aside className="pkc-side">
          <div className="pkc-drawer" aria-live="polite">
            {drawerBody}
          </div>
          {layout === "medium" ? preview : null}
        </aside>
      ) : null}
      {layout === "wide" && status === "ready" ? <div className="pkc-prevcol">{preview}</div> : null}
      {layout === "narrow" && sheet && typeof document !== "undefined"
        ? createPortal(
            <div className="pkc-sheet-layer" onMouseDown={(e) => e.target === e.currentTarget && setSheet(false)}>
              <div ref={sheetRef} className="pkc-sheet heavy" role="dialog" aria-modal="true" aria-label={selected?.name || t("passkey.settings.title")}>
                <div className="grab" aria-hidden="true" />
                <div className="pkc-drawer">{drawerBody}</div>
                {mode === "detail" ? preview : null}
              </div>
            </div>,
            document.body
          )
        : null}
      <AnimatePresence>
        {alertConfirm ? (
          <GlassConfirm
            key="pkc-alert-revoke"
            title={t("passkey.center.alert.confirmTitle")}
            message={t("passkey.center.alert.confirmLead", { name: alertConfirm.name || "Passkey" })}
            confirmLabel={t("passkey.center.alert.revoke")}
            cancelLabel={t("passkey.settings.cancel")}
            danger
            busy={busy}
            onConfirm={() => resolveAlert(alertConfirm, "revoke")}
            onCancel={() => setAlertConfirm(null)}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}
