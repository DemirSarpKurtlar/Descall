import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Sparkles,
  Plus,
  RefreshCw,
  Trash2,
  Star,
  Power,
  PowerOff,
  FlaskConical,
  ChevronUp,
  ChevronDown,
  Shield,
  KeyRound,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  EyeOff,
  Timer,
} from "lucide-react";
import { adminFetch } from "../../api/adminHttp";
import RippleButton from "../ui/RippleButton";
import { useLocale, useT } from "../../context/LocaleContext";
import { formatAppDateTime, parseAppDate } from "../../lib/datetime";

const STATUS_VALUES = new Set(["available", "rate-limited", "unavailable", "error"]);

function errorLabel(code, t) {
  if (!code) return "—";
  const translated = t(`admin.dimaai.errorCode.${code}`);
  if (!translated || translated.startsWith("admin.dimaai.errorCode.")) return code;
  return translated;
}

function fmt(ts, locale) {
  if (!ts) return "—";
  return formatAppDateTime(ts, locale) || "—";
}

function formatDuration(ms) {
  const total = Math.max(0, Math.ceil(Number(ms) / 1000));
  if (!Number.isFinite(total) || total <= 0) return "0s";
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m <= 0) return `${s}s`;
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
}

/** Remaining cooldown ms from API fields (defensive if absent). */
function remainingReviveMs(key, now = Date.now()) {
  if (!key || typeof key !== "object") return 0;
  const direct = Number(key.msUntilRevive);
  if (Number.isFinite(direct) && direct > 0) {
    // msUntilRevive is a snapshot from fetch time — prefer absolute timestamps when present.
  }
  for (const field of ["reviveAfterAt", "cooldownUntil"]) {
    const raw = key[field];
    if (!raw) continue;
    const at = parseAppDate(raw)?.getTime();
    if (Number.isFinite(at)) return Math.max(0, at - now);
  }
  if (Number.isFinite(direct) && direct > 0) return Math.max(0, direct);
  return 0;
}

/**
 * Map API payload → display status.
 * Prefer explicit status; else derive from available + lastError (+ cooldown).
 */
function resolveKeyStatus(key) {
  if (!key || typeof key !== "object") return "unavailable";
  const raw = String(key.status || key.state || "")
    .toLowerCase()
    .trim()
    .replace(/_/g, "-");
  if (STATUS_VALUES.has(raw)) return raw;

  if (key.available === true) return "available";

  const code = String(key.lastError || key.last_error || "")
    .toLowerCase()
    .trim();
  if (code === "quota" || code === "rate-limited" || code.includes("429")) return "rate-limited";
  if (code === "unavailable") return "unavailable";
  if (code === "error" || code === "auth" || code === "request") return "error";

  if (remainingReviveMs(key) > 0) {
    if (!code) return "rate-limited";
  }

  if (key.available === false) return "unavailable";
  return "available";
}

function statusPillClass(status) {
  if (status === "available") return "ok";
  if (status === "rate-limited") return "warn";
  return "bad";
}

const STATUS_COPY = {
  en: {
    rateLimited: "Rate-limited",
    statusError: "Error",
    revivesIn: "Revives in {time}",
    lastProbe: "Last probe",
  },
  tr: {
    rateLimited: "Rate limit",
    statusError: "Hata",
    revivesIn: "{time} içinde canlanır",
    lastProbe: "Son deneme",
  },
};

function statusCopy(locale, key) {
  const pack = STATUS_COPY[locale] || STATUS_COPY.en;
  return pack[key] || STATUS_COPY.en[key] || key;
}

function statusLabel(status, t, locale) {
  if (status === "available") return t("admin.dimaai.available");
  if (status === "rate-limited") return statusCopy(locale, "rateLimited");
  if (status === "error") return statusCopy(locale, "statusError");
  return t("admin.dimaai.unavailable");
}

function probeText(key) {
  if (!key || typeof key !== "object") return "";
  const candidates = [
    key.lastProbe,
    key.lastProbeText,
    key.lastProbeError,
    key.probeText,
    key.lastTestMessage,
    key.lastProbeMessage,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return "";
}

export default function AdminDimaai() {
  const t = useT();
  const { locale } = useLocale();
  const [keys, setKeys] = useState([]);
  const [counts, setCounts] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [label, setLabel] = useState("");
  const [secret, setSecret] = useState("");
  const [provider, setProvider] = useState("gemini");
  const [testingId, setTestingId] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const wasCoolingRef = useRef(new Set());

  const load = useCallback(async () => {
    const data = await adminFetch("/dimaai/keys");
    setKeys(data.keys || []);
    setCounts(data.counts || null);
    setNow(Date.now());
  }, []);

  const reload = () => {
    setErr("");
    load().catch((e) => setErr(e.message));
  };

  useEffect(() => {
    load().catch((e) => setErr(e.message));
  }, [load]);

  const cooling = useMemo(
    () => keys.some((k) => remainingReviveMs(k, now) > 0 || Number(k?.msUntilRevive) > 0),
    [keys, now],
  );

  // Live countdown tick while any key is cooling down.
  useEffect(() => {
    if (!cooling) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [cooling]);

  // When a countdown we were showing hits zero, refresh once (auto-revive / available flip).
  useEffect(() => {
    let shouldReload = false;
    const nextCooling = new Set();
    for (const k of keys) {
      const id = String(k?.id ?? "");
      if (!id) continue;
      const left = remainingReviveMs(k, now);
      if (left > 0) {
        nextCooling.add(id);
        wasCoolingRef.current.add(id);
      } else if (wasCoolingRef.current.has(id)) {
        wasCoolingRef.current.delete(id);
        shouldReload = true;
      }
    }
    // Drop ids no longer in the list
    for (const id of [...wasCoolingRef.current]) {
      if (![...keys].some((k) => String(k?.id) === id) && !nextCooling.has(id)) {
        wasCoolingRef.current.delete(id);
      }
    }
    if (shouldReload) load().catch(() => {});
  }, [keys, now, load]);

  const act = async (fn, successMsg) => {
    setBusy(true);
    setErr("");
    setOk("");
    try {
      await fn();
      await load();
      if (successMsg) setOk(successMsg);
    } catch (e) {
      setErr(e.message || t("admin.dimaai.saveFailed"));
    } finally {
      setBusy(false);
    }
  };

  const addKey = (e) => {
    e.preventDefault();
    const raw = secret.trim();
    if (raw.length < 20) {
      setErr(t("admin.dimaai.keyIncomplete"));
      return;
    }
    act(async () => {
      const created = await adminFetch("/dimaai/keys", {
        method: "POST",
        body: JSON.stringify({
          label: label.trim() || (provider === "groq" ? "GROQ" : "GEMINI"),
          secret: raw,
          provider,
        }),
      });
      setLabel("");
      setSecret("");
      const newId = created?.key?.id;
      if (newId) {
        try {
          const data = await adminFetch(`/dimaai/keys/${encodeURIComponent(newId)}/test`, { method: "POST" });
          if (!data.ok) {
            setErr(data.code ? t(`admin.dimaai.testCode.${data.code}`) : (data.error || t("admin.dimaai.testFail")));
          }
        } catch {
          /* list still saved; Test on row remains */
        }
      }
    }, t("admin.dimaai.keyAdded"));
  };

  const patch = (id, body, msg) =>
    act(
      () => adminFetch(`/dimaai/keys/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
      msg,
    );

  const remove = (id) => {
    if (!window.confirm(t("admin.dimaai.confirmDelete"))) return;
    act(
      () => adminFetch(`/dimaai/keys/${id}`, { method: "DELETE" }),
      t("admin.dimaai.keyRemoved"),
    );
  };

  const test = async (id) => {
    setTestingId(id);
    setErr("");
    setOk("");
    try {
      const data = await adminFetch(`/dimaai/keys/${encodeURIComponent(id)}/test`, { method: "POST" });
      if (data.ok) setOk(t("admin.dimaai.testOk"));
      else setErr(data.code ? t(`admin.dimaai.testCode.${data.code}`) : (data.error || t("admin.dimaai.testFail")));
      await load();
    } catch (e) {
      setErr(e.message || t("admin.dimaai.testFail"));
    } finally {
      setTestingId(null);
    }
  };

  const move = (index, dir) => {
    const db = keys.filter((k) => k.source === "database");
    const env = keys.filter((k) => k.source !== "database");
    const next = [...db];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    const tmp = next[index];
    next[index] = next[j];
    next[j] = tmp;
    act(
      () =>
        adminFetch("/dimaai/keys/reorder", {
          method: "POST",
          body: JSON.stringify({ ids: next.map((k) => k.id) }),
        }),
      t("admin.dimaai.orderSaved"),
    );
    setKeys([...next, ...env]);
  };

  const dbKeys = keys.filter((k) => k.source === "database");
  const envKeys = keys.filter((k) => k.source === "environment");
  const availableCount = keys.filter((k) => resolveKeyStatus(k) === "available").length;

  const renderStatusPill = (k) => {
    const status = resolveKeyStatus(k);
    return (
      <span className={`dima-admin-pill ${statusPillClass(status)}`} title={status}>
        {statusLabel(status, t, locale)}
      </span>
    );
  };

  const renderReviveMeta = (k) => {
    const left = remainingReviveMs(k, now);
    if (left <= 0) return null;
    const when = k.reviveAfterAt || k.cooldownUntil;
    const labelText = statusCopy(locale, "revivesIn").replace("{time}", formatDuration(left));
    return (
      <span className="dima-admin-revive" title={when ? fmt(when, locale) : undefined}>
        <Timer size={12} /> {labelText}
      </span>
    );
  };

  const renderProbeMeta = (k) => {
    const text = probeText(k);
    if (!text) return null;
    return (
      <span>
        <AlertTriangle size={12} /> {statusCopy(locale, "lastProbe")}: {text}
      </span>
    );
  };

  return (
    <section className="admin-section admin-section-full dima-admin">
      <div className="dima-admin-head">
        <div>
          <h2>
            <Sparkles size={20} /> DimaAI
          </h2>
          <p className="muted">{t("admin.dimaai.subtitle")}</p>
        </div>
        <RippleButton type="button" onClick={() => act(load)} disabled={busy}>
          <RefreshCw size={14} /> {t("common.refresh")}
        </RippleButton>
      </div>

      <div className="dima-admin-stats">
        <div className="dima-admin-stat">
          <KeyRound size={16} />
          <strong>{counts?.database ?? dbKeys.length}</strong>
          <span>{t("admin.dimaai.savedKeys")}</span>
        </div>
        <div className="dima-admin-stat">
          <CheckCircle2 size={16} />
          <strong>{availableCount}</strong>
          <span>{t("admin.dimaai.available")}</span>
        </div>
        <div className="dima-admin-stat">
          <Shield size={16} />
          <strong>{envKeys.length}</strong>
          <span>{t("admin.dimaai.envKeys")}</span>
        </div>
      </div>

      <div className="dima-admin-note">
        <EyeOff size={14} />
        {t("admin.dimaai.privacyNote")}
      </div>

      {err && (
        <div className="dima-admin-banner is-err" role="alert">
          <AlertTriangle size={14} /> <span>{err}</span>
          <button type="button" className="dima-admin-action" onClick={reload} disabled={busy}>
            <RefreshCw size={14} /> {t("common.retry") || "Retry"}
          </button>
        </div>
      )}
      {ok && (
        <div className="dima-admin-banner is-ok">
          <CheckCircle2 size={14} /> {ok}
        </div>
      )}

      <form className="dima-admin-add" onSubmit={addKey}>
        <h3>
          <Plus size={16} /> {t("admin.dimaai.addKey")}
        </h3>
        <p className="muted">{provider === "groq" ? (t("admin.dimaai.addHintGroq") || t("admin.dimaai.addHint")) : t("admin.dimaai.addHint")}</p>
        <div className="dima-admin-add-row">
          <select
            className="dima-admin-input"
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            aria-label={t("admin.dimaai.provider")}
          >
            <option value="gemini">{t("admin.dimaai.providerGemini")}</option>
            <option value="groq">{t("admin.dimaai.providerGroq")}</option>
          </select>
          <input
            className="dima-admin-input"
            placeholder={t("admin.dimaai.labelPlaceholder")}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={80}
          />
          <input
            className="dima-admin-input"
            type="password"
            autoComplete="off"
            placeholder={
              provider === "groq"
                ? (t("admin.dimaai.secretPlaceholderGroq") || "gsk_…")
                : t("admin.dimaai.secretPlaceholder")
            }
            value={secret}
            onChange={(e) => {
              const v = e.target.value;
              setSecret(v);
              if (v.trim().startsWith("gsk_")) setProvider("groq");
            }}
          />
          <RippleButton type="submit" className="admin-btn-green" disabled={busy || secret.trim().length < 20}>
            <Plus size={14} /> {t("admin.dimaai.saveKey")}
          </RippleButton>
        </div>
      </form>

      <h3>{t("admin.dimaai.pool")}</h3>
      {dbKeys.length === 0 && (
        <p className="muted">{t("admin.dimaai.emptyPool")}</p>
      )}
      <div className="dima-admin-table-wrap">
        {dbKeys.map((k, index) => (
          <article key={k.id} className={`dima-admin-key ${k.enabled ? "" : "is-off"}${k.isPreferred ? " is-preferred" : ""}`}>
            <div className="dima-admin-key-top">
              <div className="dima-admin-key-title">
                <span className="dima-admin-key-mark" aria-hidden="true">
                  {k.isPreferred ? <Star size={16} /> : <KeyRound size={16} />}
                </span>
                <div className="dima-admin-key-id">
                  <strong>{k.label}</strong>
                  <code>{k.mask}</code>
                  <span className={`dima-admin-provider-badge is-${k.provider || "gemini"}`}>{(k.provider || "gemini").toUpperCase()}</span>
                </div>
              </div>
              <div className="dima-admin-key-status">
                {renderStatusPill(k)}
                {renderReviveMeta(k)}
              </div>
            </div>
            <div className="dima-admin-key-meta">
              <span>
                <Clock size={12} /> {t("admin.dimaai.lastOk")}: {fmt(k.lastOkAt, locale)}
              </span>
              <span>
                {k.lastError ? <XCircle size={12} /> : <CheckCircle2 size={12} />}
                {t("admin.dimaai.lastError")}: {errorLabel(k.lastError, t)}
              </span>
              <span>{t("admin.dimaai.order")}: {index + 1}</span>
              {renderProbeMeta(k)}
            </div>
            <div className="dima-admin-key-actions">
              <button type="button" className="dima-admin-action is-test" disabled={busy || testingId === k.id} onClick={() => test(k.id)}>
                <FlaskConical size={14} /> {testingId === k.id ? t("common.loading") : t("admin.dimaai.test")}
              </button>
              <button type="button" className="dima-admin-action" disabled={busy} onClick={() => patch(k.id, { isPreferred: true }, t("admin.dimaai.preferredSet"))}>
                <Star size={14} /> {t("admin.dimaai.setPreferred")}
              </button>
              <button type="button" className="dima-admin-action" disabled={busy} onClick={() => patch(k.id, { enabled: !k.enabled })}>
                {k.enabled ? <PowerOff size={14} /> : <Power size={14} />}
                {k.enabled ? t("admin.dimaai.disable") : t("admin.dimaai.enable")}
              </button>
              <button type="button" className="dima-admin-action" disabled={busy || index === 0} onClick={() => move(index, -1)}>
                <ChevronUp size={14} /> {t("admin.dimaai.moveUp")}
              </button>
              <button type="button" className="dima-admin-action" disabled={busy || index === dbKeys.length - 1} onClick={() => move(index, 1)}>
                <ChevronDown size={14} /> {t("admin.dimaai.moveDown")}
              </button>
              <button type="button" className="dima-admin-action is-danger" disabled={busy} onClick={() => remove(k.id)}>
                <Trash2 size={14} /> {t("common.delete")}
              </button>
            </div>
          </article>
        ))}
      </div>

      {envKeys.length > 0 && (
        <>
          <h3>{t("admin.dimaai.envSection")}</h3>
          <p className="muted">{t("admin.dimaai.envHint")}</p>
          {envKeys.map((k) => (
            <article key={k.id} className="dima-admin-key is-env">
              <div className="dima-admin-key-top">
                <div className="dima-admin-key-title">
                  <span className="dima-admin-key-mark" aria-hidden="true">
                    <KeyRound size={16} />
                  </span>
                  <div className="dima-admin-key-id">
                    <strong>{k.label}</strong>
                    <code>{k.mask}</code>
                    <span className={`dima-admin-provider-badge is-${k.provider || "gemini"}`}>{(k.provider || "gemini").toUpperCase()}</span>
                  </div>
                </div>
                <div className="dima-admin-key-status">
                  {renderStatusPill(k)}
                  <span className="dima-admin-pill ok">{t("admin.dimaai.readOnly")}</span>
                  {renderReviveMeta(k)}
                </div>
              </div>
              <div className="dima-admin-key-meta">
                <span>
                  <Clock size={12} /> {t("admin.dimaai.lastOk")}: {fmt(k.lastOkAt, locale)}
                </span>
                <span>
                  {k.lastError ? <XCircle size={12} /> : <CheckCircle2 size={12} />}
                  {t("admin.dimaai.lastError")}: {errorLabel(k.lastError, t)}
                </span>
                {renderProbeMeta(k)}
              </div>
              <div className="dima-admin-key-actions">
                <button type="button" className="dima-admin-action is-test" disabled={testingId === k.id} onClick={() => test(k.id)}>
                  <FlaskConical size={14} /> {t("admin.dimaai.test")}
                </button>
              </div>
            </article>
          ))}
        </>
      )}
    </section>
  );
}
