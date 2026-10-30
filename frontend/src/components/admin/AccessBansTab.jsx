/**
 * Yönetici Paneli › Erişim Yasakları (3.5.0). Block an IP address, a whole
 * network (/24) or the devices and addresses an account signed in from.
 * Server: routes/adminAccess.js + lib/accessBans.js (hashed values only, the
 * screen shows masked labels like "88.230.x.x"). Admin accounts are never
 * blocked by these bans.
 */
import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "../../api/adminHttp";
import { confirmAction } from "../../lib/glassConfirm";
import { useLocale } from "../../context/LocaleContext";
import GlassCheckbox from "../ui/GlassCheckbox";
import { Ban, Globe, Monitor, Network, RefreshCw, ShieldWarning, AlertTriangle } from "../ui/Icon.jsx";
import { formatAppDateTime } from "../../lib/datetime";
import "../../styles/admin-access.css";

const KIND_ICON = { ip: Globe, network: Network, device: Monitor };
const DURATIONS = ["1d", "7d", "30d", "90d", "permanent"];
const MODES = ["ip", "network", "account"];
const IP_RE = /^(\d{1,3}\.){3}\d{1,3}$|^[0-9a-f:]{3,}$/i;

/** Form validity, pure (tested in accessBans.selftest.mjs). */
export function canSubmitBan({ mode, ip, username }) {
  if (mode === "account") return String(username || "").trim().replace(/^@/, "").length >= 2;
  return IP_RE.test(String(ip || "").trim());
}

function Kpi({ label, value, tone }) {
  return (
    <div className={`aba-kpi${tone ? ` is-${tone}` : ""}`}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function NewBan({ t, onDone }) {
  const [mode, setMode] = useState("ip");
  const [ip, setIp] = useState("");
  const [username, setUsername] = useState("");
  const [reason, setReason] = useState("");
  const [duration, setDuration] = useState("30d");
  const [includeNetwork, setIncludeNetwork] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const valid = canSubmitBan({ mode, ip, username });

  const submit = async () => {
    if (!valid || busy) return;
    const ok = await confirmAction({
      title: t(`admin.abConfirm_${mode}`),
      message: mode === "network" || includeNetwork ? t("admin.abNetworkWarn") : t("admin.abConfirmBody"),
      confirmLabel: t("admin.abBan"),
      cancelLabel: t("Cancel"),
    });
    if (!ok) return;
    setBusy(true);
    setMsg(null);
    try {
      const body =
        mode === "account"
          ? { mode: "account", username: username.trim().replace(/^@/, ""), duration, reason, includeNetwork }
          : { mode: "address", kind: mode, ip: ip.trim(), duration, reason };
      const d = await adminFetch("/access-bans", { method: "POST", body: JSON.stringify(body) });
      setMsg({ ok: true, text: t("admin.abAdded", { n: d.added?.length || 0, kicked: d.kicked || 0 }) });
      setIp("");
      setUsername("");
      setReason("");
      onDone?.();
    } catch (e) {
      setMsg({ ok: false, text: e?.message || t("admin.abFailed") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="aba-card aba-new">
      <h2>{t("admin.abNew")}</h2>
      <div className="aba-seg" role="tablist" aria-label={t("admin.abNew")}>
        {MODES.map((m) => (
          <button key={m} type="button" role="tab" aria-selected={mode === m} className={mode === m ? "is-on" : ""} onClick={() => setMode(m)}>
            {t(`admin.abMode_${m}`)}
          </button>
        ))}
      </div>
      <p className="aba-hint">{t(`admin.abModeHint_${mode}`)}</p>
      {mode === "account" ? (
        <label className="aba-field">
          <span>{t("admin.abUsername")}</span>
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="@kullaniciadi" autoComplete="off" spellCheck={false} />
        </label>
      ) : (
        <label className="aba-field">
          <span>{t("admin.abIp")}</span>
          <input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="88.230.12.34" inputMode="decimal" autoComplete="off" spellCheck={false} />
        </label>
      )}
      <label className="aba-field">
        <span>{t("admin.abReason")}</span>
        <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder={t("admin.abReasonPh")} />
      </label>
      <div className="aba-field">
        <span>{t("admin.abDuration")}</span>
        <div className="aba-chips">
          {DURATIONS.map((d) => (
            <button key={d} type="button" className={duration === d ? "is-on" : ""} aria-pressed={duration === d} onClick={() => setDuration(d)}>
              {t(`admin.abDur_${d}`)}
            </button>
          ))}
        </div>
      </div>
      {mode === "account" ? (
        <label className="aba-check">
          <GlassCheckbox checked={includeNetwork} onChange={(e) => setIncludeNetwork(e.target.checked)} />
          <span>{t("admin.abIncludeNetwork")}</span>
        </label>
      ) : null}
      {mode === "network" || includeNetwork ? (
        <p className="aba-warn">
          <AlertTriangle size={14} /> {t("admin.abNetworkWarn")}
        </p>
      ) : null}
      {msg ? (
        <p className={msg.ok ? "aba-ok" : "aba-err"} role={msg.ok ? "status" : "alert"}>
          {msg.text}
        </p>
      ) : null}
      <div className="aba-actions">
        <button type="button" className="aba-danger" disabled={!valid || busy} onClick={submit}>
          <Ban size={15} /> {busy ? t("admin.abBanning") : t("admin.abBan")}
        </button>
      </div>
    </section>
  );
}

const ACTION_KEY = { login: "admin.abAct_login", register: "admin.abAct_register", socket: "admin.abAct_socket", oauth: "admin.abAct_oauth" };

export default function AccessBansTab() {
  const { t, locale } = useLocale();
  const [status, setStatus] = useState("active");
  const [data, setData] = useState(null);
  const [hits, setHits] = useState([]);
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => {
    setErr("");
    adminFetch(`/access-bans?status=${status}`)
      .then(setData)
      .catch((e) => setErr(e?.message || t("admin.abLoadFailed")));
    adminFetch("/access-bans/hits")
      .then((d) => setHits(Array.isArray(d?.hits) ? d.hits : []))
      .catch(() => setHits([]));
  }, [status, t]);
  useEffect(() => {
    load();
  }, [load]);

  const revoke = async (b) => {
    const ok = await confirmAction({
      title: t("admin.abRevokeTitle", { label: b.label }),
      message: t("admin.abRevokeBody"),
      confirmLabel: t("admin.abRevoke"),
      cancelLabel: t("Cancel"),
    });
    if (!ok) return;
    setBusyId(b.id);
    try {
      await adminFetch(`/access-bans/${encodeURIComponent(b.id)}`, { method: "DELETE" });
      load();
    } catch (e) {
      setErr(e?.message || t("admin.abFailed"));
    } finally {
      setBusyId(null);
    }
  };

  const s = data?.stats;
  const when = (iso) => (iso ? formatAppDateTime(iso, locale) || iso : "");

  return (
    <section className="aba">
      <div className="aba-head">
        <span className="aba-head-ic" aria-hidden="true">
          <ShieldWarning size={20} />
        </span>
        <div>
          <h1>{t("admin.accessBans")}</h1>
          <p>{t("admin.abLead")}</p>
        </div>
        <button type="button" className="aba-ghost" onClick={load} aria-label={t("common.refresh")}>
          <RefreshCw size={15} />
        </button>
      </div>

      {data && data.available === false ? <p className="aba-warn">{t("admin.abUnavailable")}</p> : null}
      {err ? (
        <p className="aba-err" role="alert">
          {err}
        </p>
      ) : null}

      <div className="aba-kpis">
        <Kpi label={t("admin.abKpiActive")} value={s?.active ?? "–"} tone="brand" />
        <Kpi label={t("admin.abKind_ip")} value={s?.byKind?.ip ?? "–"} />
        <Kpi label={t("admin.abKind_network")} value={s?.byKind?.network ?? "–"} />
        <Kpi label={t("admin.abKind_device")} value={s?.byKind?.device ?? "–"} />
        <Kpi label={t("admin.abKpiHits")} value={s?.hits24h ?? "–"} tone={s?.hits24h ? "warn" : ""} />
      </div>

      <div className="aba-grid">
        <NewBan t={t} onDone={load} />

        <section className="aba-card aba-list">
          <div className="aba-list-head">
            <h2>{t("admin.abList")}</h2>
            <div className="aba-chips">
              {["active", "ended", "all"].map((k) => (
                <button key={k} type="button" className={status === k ? "is-on" : ""} aria-pressed={status === k} onClick={() => setStatus(k)}>
                  {t(`admin.abStatus_${k}`)}
                </button>
              ))}
            </div>
          </div>
          {!data ? <p className="aba-muted">{t("Loading...")}</p> : null}
          {data && !data.bans.length ? <p className="aba-muted">{t("admin.abEmpty")}</p> : null}
          <ul className="aba-rows">
            {(data?.bans || []).map((b) => {
              const Icon = KIND_ICON[b.kind] || Globe;
              return (
                <li key={b.id} className={`aba-row${b.active ? "" : " is-ended"}`}>
                  <span className={`aba-kind is-${b.kind}`} title={t(`admin.abKind_${b.kind}`)}>
                    <Icon size={15} />
                  </span>
                  <div className="aba-row-main">
                    <div className="aba-row-top">
                      <b>{b.label}</b>
                      <span className="aba-tag">{t(`admin.abKind_${b.kind}`)}</span>
                      {b.sourceUsername ? <span className="aba-tag">@{b.sourceUsername}</span> : null}
                    </div>
                    {b.reason ? <p className="aba-reason">{b.reason}</p> : null}
                    <p className="aba-meta">
                      {t("admin.abBy", { name: b.createdBy || "?", when: when(b.createdAt) })}
                      {" · "}
                      {b.revokedAt
                        ? t("admin.abRevokedAt", { name: b.revokedBy || "?", when: when(b.revokedAt) })
                        : b.expiresAt
                          ? t("admin.abUntil", { when: when(b.expiresAt) })
                          : t("admin.abPermanent")}
                      {" · "}
                      {t("admin.abHits", { n: b.hits })}
                      {b.lastHitAt ? ` (${when(b.lastHitAt)})` : ""}
                    </p>
                  </div>
                  {b.active ? (
                    <button type="button" className="aba-ghost" disabled={busyId === b.id} onClick={() => revoke(b)}>
                      {t("admin.abRevoke")}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <section className="aba-card">
        <h2>{t("admin.abHitsTitle")}</h2>
        {!hits.length ? <p className="aba-muted">{t("admin.abNoHits")}</p> : null}
        <ul className="aba-hits">
          {hits.map((h) => (
            <li key={h.id}>
              <time>{when(h.at)}</time>
              <span className="aba-tag">{t(ACTION_KEY[h.action] || "admin.abAct_login")}</span>
              <span>{h.ipMasked || "?"}</span>
              <span className="aba-muted">{h.username ? `@${h.username}` : t("admin.abAnon")}</span>
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}
