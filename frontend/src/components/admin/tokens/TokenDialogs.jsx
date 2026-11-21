/**
 * Admin Token dialogs (Draft B frames B-create, M-revoke, M-panic, M-ip):
 *   CreateDrawer   right drawer: live summary, name, expiry, IP / CIDR list, full-access
 *                  notice, 6-digit code; then the one-time reveal ("Kaydettim" closes it)
 *   RotateDialog   grace period (hemen / 1 saat / 24 saat), code, then the reveal
 *   RevokeDialog   reason, note, type the token name
 *   RestoreDialog  undo a revoke within 10 minutes (code)
 *   PanicDialog    every live token, reason, type TÜMÜNÜ İPTAL ET, code
 *   IpDialog       allowlist editor with the IPs seen in the last 7 days
 * Opaque surfaces; bottom sheets on a phone (admin-tokens.css).
 */
import { useEffect, useMemo, useState } from "react";
import { copyText } from "../../../lib/copyText.js";
import GlassCheckbox from "../../ui/GlassCheckbox";
import { AlertCircle, AlertTriangle, Ban, Check, Copy, Eye, EyeOff, Globe, KeyRound, Lock, Plus, RefreshCw, RotateCcw, Trash2 } from "../../ui/Icon.jsx";
import { Dialog, Drawer, Otp, Pill, TokenIcon, useFmt } from "./TokenUi.jsx";
import { SnipFoot, Snippets } from "./TokenWorkspace.jsx";
import { tokenApi } from "./tokenApi.js";
import {
  DEFAULT_EXPIRY,
  DEFAULT_GRACE,
  EXPIRY_OPTIONS,
  GRACE_OPTIONS,
  NAME_MAX,
  PANIC_WORD,
  REVOKE_REASONS,
  clock,
  createBody,
  createErrors,
  errorKey,
  expiryEnd,
  expiryKey,
  ipAllowedBy,
  isLive,
  isValidIpOrCidr,
  maskToken,
  otpReady,
  panicReady,
  parseIpList,
  restoreLeft,
  revokeReady,
  typedMatches,
} from "./tokenModel.js";

function useErr() {
  const { t } = useFmt();
  return (e) => t(errorKey(e));
}

/* ---------------- one-time reveal ---------------- */

export function RevealBody({ token, secret, what, mcpUrl, onDone, onOpenapi }) {
  const f = useFmt();
  const { t } = f;
  const [hidden, setHidden] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState("claudeCode");
  const ips = token?.ipAllowlist || [];
  return (
    <div className="atk-reveal" data-testid="atk-reveal">
      <div className="atk-okline">
        <Check size={13} aria-hidden="true" />
        <span>{t("atok.reveal.ok", { what, name: token?.name || "" })}</span>
      </div>
      <div className="atk-rv-warn" role="alert">
        <AlertCircle size={24} aria-hidden="true" />
        <div>
          <b>{t("atok.reveal.warnTitle")}</b>
          <p>{t("atok.reveal.warnBody")}</p>
        </div>
      </div>
      <div className="atk-tokbox">
        <code className={hidden ? "is-hid" : ""} data-testid="atk-secret">
          {secret}
        </code>
        <button type="button" className="atk-btn is-sm is-ghost is-ic" onClick={() => setHidden((v) => !v)} aria-label={hidden ? t("atok.reveal.show") : t("atok.reveal.hide")} title={hidden ? t("atok.reveal.show") : t("atok.reveal.hide")}>
          {hidden ? <Eye size={14} /> : <EyeOff size={14} />}
        </button>
        <button
          type="button"
          className="atk-btn is-sm is-pri"
          onClick={async () => {
            const ok = await copyText(secret);
            if (ok) setCopied(true);
          }}
          data-testid="atk-secret-copy"
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? t("atok.copied") : t("atok.copy")}
        </button>
      </div>
      <div className="atk-rv-grid">
        <div>
          <span className="l">{t("atok.reveal.prefix")}</span>
          <span className="v atk-mono atk-ell">{maskToken(token)}</span>
        </div>
        <div>
          <span className="l">{t("atok.reveal.validity")}</span>
          <span className="v">
            {t(expiryKey(token?.expiresIn))}
            {token?.expiresAt ? ` · ${f.day(token.expiresAt)}` : ""}
          </span>
        </div>
        <div>
          <span className="l">{t("atok.reveal.ip")}</span>
          <span className="v">{ips.length ? t("atok.hero.ipRules", { n: ips.length }) : t("atok.hero.ipNone")}</span>
        </div>
        <div>
          <span className="l">{t("atok.reveal.access")}</span>
          <span className="v atk-red">{t("atok.fullAccess")}</span>
        </div>
      </div>
      <div>
        <div className="atk-sec-h">
          <h4>{t("atok.reveal.connect")}</h4>
          <span className="atk-sub">{t("atok.reveal.connectSub")}</span>
        </div>
        <Snippets mcpUrl={mcpUrl} secret={secret} tab={tab} onTab={setTab} testId="atk-rv-snip" />
        <SnipFoot full onOpenapi={onOpenapi} />
      </div>
      <div className="atk-ffoot is-line">
        <label className="atk-chk">
          <GlassCheckbox checked={saved} onChange={(e) => setSaved(e.target.checked)} data-testid="atk-saved" />
          <span>{t("atok.reveal.saved")}</span>
        </label>
        <button type="button" className="atk-btn is-pri" disabled={!saved} onClick={onDone} data-testid="atk-reveal-done">
          {t("atok.close")}
        </button>
      </div>
    </div>
  );
}

/* ---------------- create ---------------- */

function AccessBox() {
  const { t } = useFmt();
  return (
    <div className="atk-access">
      <b>
        <AlertTriangle size={14} aria-hidden="true" />
        {t("atok.create.accessTitle")}
      </b>
      <ul>
        {["access1", "access2", "access3"].map((k) => (
          <li key={k}>
            <Check size={12} aria-hidden="true" />
            {t(`atok.create.${k}`)}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CreateDrawer({ open, preset, myIp, mcpUrl, onClose, onCreated, onOpenapi }) {
  const f = useFmt();
  const { t } = f;
  const toErr = useErr();
  const [name, setName] = useState("");
  const [expiresIn, setExpiresIn] = useState(DEFAULT_EXPIRY);
  const [ipText, setIpText] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [codeBad, setCodeBad] = useState(false);
  const [tried, setTried] = useState(false);
  const [result, setResult] = useState(null); // { token, secret }
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!open) return;
    setName(preset?.name || "");
    setExpiresIn(preset?.expiresIn || DEFAULT_EXPIRY);
    setIpText(preset?.ipText || "");
    setCode("");
    setBusy(false);
    setError("");
    setCodeBad(false);
    setTried(false);
    setResult(null);
    setNow(Date.now());
  }, [open, preset]);

  const errors = createErrors({ name, ipText, code });
  const parsed = parseIpList(ipText);
  const end = expiryEnd(expiresIn, now);
  const ready = !errors.length && !busy;

  const submit = async (e) => {
    e?.preventDefault?.();
    setTried(true);
    if (!ready) return;
    setBusy(true);
    setError("");
    setCodeBad(false);
    try {
      try {
        await tokenApi.verifyCode(code);
      } catch (err) {
        setCodeBad(true);
        setCode("");
        setError(toErr(err));
        return;
      }
      const r = await tokenApi.create(createBody({ name, expiresIn, ipText }));
      setResult(r);
      onCreated(r);
    } catch (err) {
      setError(toErr(err));
    } finally {
      setBusy(false);
    }
  };

  const addMyIp = () => {
    if (!myIp || parsed.list.includes(myIp.toLowerCase())) return;
    setIpText((v) => (v.trim() ? `${v.replace(/\s+$/, "")}\n${myIp}` : myIp));
  };

  return (
    <Drawer open={open} onClose={onClose} busy={busy} locked={Boolean(result)} icon={KeyRound} title={t("atok.create.title")} subtitle={t("atok.create.sub")} testId="atk-create">
      {result ? (
        <RevealBody token={result.token} secret={result.secret} what={t("atok.reveal.created")} mcpUrl={mcpUrl} onDone={onClose} onOpenapi={onOpenapi} />
      ) : (
        <form className="atk-form" onSubmit={submit} noValidate>
          <div className="atk-sumcard" aria-live="polite">
            <div className="atk-sum-h">
              <span>{t("atok.create.sumTitle")}</span>
              <span className="atk-live is-xs">{t("atok.create.sumLive")}</span>
            </div>
            <div className="atk-sumrow">
              <span>{t("atok.create.sumName")}</span>
              <b className="atk-ell">{name.trim() || t("atok.dash")}</b>
            </div>
            <div className="atk-sumrow">
              <span>{t("atok.create.sumPrefix")}</span>
              <b className="atk-mono">{maskToken(null)}</b>
            </div>
            <div className="atk-sumrow">
              <span>{t("atok.create.sumExp")}</span>
              <b>{end ? t("atok.create.expSum", { exp: t(expiryKey(expiresIn)), when: f.dt(end) }) : t("atok.exp.never")}</b>
            </div>
            <div className="atk-sumrow">
              <span>{t("atok.create.sumIp")}</span>
              <b className="atk-ell">{parsed.list.length ? t("atok.create.sumIpList", { n: parsed.list.length, list: parsed.list.slice(0, 2).join(", ") + (parsed.list.length > 2 ? "…" : "") }) : t("atok.create.sumIpNone")}</b>
            </div>
            <div className="atk-sumrow">
              <span>{t("atok.create.sumAccess")}</span>
              <b className="atk-red">{t("atok.create.sumAccessV")}</b>
            </div>
            <div className="atk-sumrow">
              <span>{t("atok.create.sumChannel")}</span>
              <b>{t("atok.create.sumChannelV")}</b>
            </div>
          </div>

          <div className="atk-field">
            <label htmlFor="atk-c-name">
              {t("atok.create.name")} <em>{t("atok.create.nameHint")}</em>
            </label>
            <input id="atk-c-name" className={`atk-inp${tried && errors.includes("name") ? " is-bad" : ""}`} value={name} maxLength={NAME_MAX} onChange={(e) => setName(e.target.value)} placeholder={t("atok.create.namePh")} autoComplete="off" data-autofocus="" data-testid="atk-c-name" />
            {tried && errors.includes("name") ? <div className="atk-fh is-bad">{t("atok.create.nameErr")}</div> : null}
          </div>

          <div className="atk-field">
            <span className="atk-lb">{t("atok.create.exp")}</span>
            <div className="atk-chips" role="radiogroup" aria-label={t("atok.create.exp")}>
              {EXPIRY_OPTIONS.map((k) => (
                <button key={k} type="button" role="radio" aria-checked={expiresIn === k} className={`atk-chipb${expiresIn === k ? " is-on" : ""}${k === "never" ? " is-warnc" : ""}`} onClick={() => setExpiresIn(k)} data-testid={`atk-c-exp-${k}`}>
                  {t(expiryKey(k))}
                </button>
              ))}
            </div>
            <div className={`atk-fh${end ? "" : " is-amber"}`}>{end ? t("atok.create.expEnd", { when: f.dt(end) }) : t("atok.create.expNever")}</div>
          </div>

          <div className="atk-field">
            <label htmlFor="atk-c-ips">
              {t("atok.create.ip")} <em>{t("atok.create.ipHint")}</em>
            </label>
            <textarea id="atk-c-ips" className={`atk-inp is-area${parsed.invalid.length ? " is-bad" : ""}`} value={ipText} onChange={(e) => setIpText(e.target.value)} placeholder={t("atok.create.ipPh")} spellCheck={false} data-testid="atk-c-ips" />
            <div className="atk-row-wrap">
              {myIp ? (
                <button type="button" className="atk-btn is-sm" onClick={addMyIp} disabled={parsed.list.includes(myIp.toLowerCase())}>
                  <Plus size={13} />
                  {t("atok.create.myIp", { ip: myIp })}
                </button>
              ) : null}
              <span className="atk-fh is-inline">{t("atok.create.ipEmpty")}</span>
            </div>
            {parsed.invalid.length ? <div className="atk-fh is-bad">{t("atok.create.ipBad", { list: parsed.invalid.slice(0, 4).join(", ") })}</div> : null}
          </div>

          <AccessBox />

          <div className="atk-field">
            <span className="atk-lb">
              {t("atok.create.code")} <em>{t("atok.create.codeHint")}</em>
            </span>
            <Otp value={code} onChange={(v) => { setCode(v); setCodeBad(false); }} invalid={codeBad || (tried && !otpReady(code))} testId="atk-c-otp" />
            <div className="atk-fh">{t("atok.create.codeFoot")}</div>
          </div>

          {error ? (
            <p className="atk-err" role="alert">
              {error}
            </p>
          ) : null}

          <div className="atk-ffoot">
            <span className="atk-ffoot-sp">
              <Lock size={12} aria-hidden="true" /> {t("atok.create.foot")}
            </span>
            <button type="button" className="atk-btn is-ghost" onClick={onClose} disabled={busy}>
              {t("atok.cancel")}
            </button>
            <button type="submit" className="atk-btn is-pri" disabled={!ready} data-testid="atk-c-submit">
              <KeyRound size={14} />
              {busy ? t("atok.create.busy") : t("atok.create.submit")}
            </button>
          </div>
        </form>
      )}
    </Drawer>
  );
}

/* ---------------- rotate ---------------- */

export function RotateDialog({ open, token, mcpUrl, onClose, onRotated, onOpenapi }) {
  const f = useFmt();
  const { t } = f;
  const toErr = useErr();
  const [grace, setGrace] = useState(DEFAULT_GRACE);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [codeBad, setCodeBad] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!open) return;
    setGrace(DEFAULT_GRACE);
    setCode("");
    setBusy(false);
    setError("");
    setCodeBad(false);
    setResult(null);
  }, [open]);

  if (!token) return null;
  const ips = token.ipAllowlist || [];
  const submit = async () => {
    if (busy || !otpReady(code)) return;
    setBusy(true);
    setError("");
    setCodeBad(false);
    try {
      try {
        await tokenApi.verifyCode(code);
      } catch (err) {
        setCodeBad(true);
        setCode("");
        setError(toErr(err));
        return;
      }
      const r = await tokenApi.rotate(token.id, grace);
      setResult(r);
      onRotated(r, grace);
    } catch (err) {
      setError(toErr(err));
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    const graceUntil = result.token?.graceUntil;
    return (
      <Dialog open={open} onClose={onClose} locked icon={KeyRound} title={t("atok.reveal.rotTitle")} subtitle={graceUntil ? t("atok.reveal.rotGrace", { when: f.dt(graceUntil) }) : t("atok.reveal.rotNow")} width={680} testId="atk-rotate-reveal">
        <RevealBody token={result.token} secret={result.secret} what={t("atok.reveal.rotated")} mcpUrl={mcpUrl} onDone={onClose} onOpenapi={onOpenapi} />
      </Dialog>
    );
  }
  return (
    <Dialog
      open={open}
      onClose={onClose}
      busy={busy}
      icon={RefreshCw}
      title={t("atok.rotate.title", { name: token.name })}
      subtitle={t("atok.rotate.sub")}
      width={680}
      testId="atk-rotate"
      footer={
        <>
          <button type="button" className="atk-btn is-ghost" onClick={onClose} disabled={busy}>
            {t("atok.cancel")}
          </button>
          <button type="button" className="atk-btn is-pri" disabled={busy || !otpReady(code)} onClick={submit} data-testid="atk-rotate-submit">
            <RefreshCw size={14} />
            {busy ? t("atok.rotate.busy") : t("atok.rotate.submit")}
          </button>
        </>
      }
    >
      <div className="atk-form">
        <div className="atk-field">
          <span className="atk-lb">{t("atok.rotate.grace")}</span>
          <div className="atk-chips" role="radiogroup" aria-label={t("atok.rotate.grace")}>
            {GRACE_OPTIONS.map((g) => (
              <button key={g} type="button" role="radio" aria-checked={grace === g} className={`atk-chipb${grace === g ? " is-on" : ""}`} onClick={() => setGrace(g)} data-testid={`atk-grace-${g}`}>
                {t(`atok.rotate.g${g}`)}
              </button>
            ))}
          </div>
          <div className="atk-fh">{t("atok.rotate.graceHint")}</div>
        </div>
        <div className="atk-field">
          <span className="atk-lb">{t("atok.rotate.validity")}</span>
          <div className="atk-sub">{ips.length ? t("atok.rotate.validityIp", { exp: t(expiryKey(token.expiresIn)), n: ips.length }) : t("atok.rotate.validityBody", { exp: t(expiryKey(token.expiresIn)) })}</div>
        </div>
        <div className="atk-field">
          <span className="atk-lb">{t("atok.otp.label")}</span>
          <Otp value={code} onChange={(v) => { setCode(v); setCodeBad(false); }} invalid={codeBad} autoFocus testId="atk-rotate-otp" />
        </div>
        {error ? (
          <p className="atk-err" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}

/* ---------------- revoke ---------------- */

export function RevokeDialog({ open, token, onClose, onRevoked }) {
  const f = useFmt();
  const { t } = f;
  const toErr = useErr();
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setReason("");
    setNote("");
    setTyped("");
    setBusy(false);
    setError("");
  }, [open]);

  if (!token) return null;
  const ready = revokeReady({ reason, typed, name: token.name, busy });
  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    setError("");
    try {
      const r = await tokenApi.revoke(token.id, { reason, note: note.trim(), confirmName: typed.trim() });
      onRevoked(r);
    } catch (err) {
      setError(toErr(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      busy={busy}
      icon={Ban}
      tone="red"
      title={t("atok.revoke.title", { name: token.name })}
      subtitle={t("atok.revoke.sub")}
      width={680}
      testId="atk-revoke"
      footer={
        <>
          <button type="button" className="atk-btn is-ghost" onClick={onClose} disabled={busy}>
            {t("atok.cancel")}
          </button>
          <button type="button" className="atk-btn is-dan is-solid" disabled={!ready} onClick={submit} data-testid="atk-revoke-submit">
            <Ban size={14} />
            {busy ? t("atok.revoke.busy") : t("atok.revoke.submit")}
          </button>
        </>
      }
    >
      <div className="atk-form">
        <div className="atk-field">
          <span className="atk-lb">{t("atok.revoke.reason")}</span>
          <div className="atk-chips" role="radiogroup" aria-label={t("atok.revoke.reason")}>
            {REVOKE_REASONS.map((r) => (
              <button key={r} type="button" role="radio" aria-checked={reason === r} className={`atk-chipb${reason === r ? " is-on" : ""}`} onClick={() => setReason(r)} data-testid={`atk-reason-${r}`}>
                {t(`atok.revoke.r.${r}`)}
              </button>
            ))}
          </div>
        </div>
        <div className="atk-field">
          <label htmlFor="atk-rv-note">
            {t("atok.revoke.note")} <em>{t("atok.revoke.noteHint")}</em>
          </label>
          <textarea id="atk-rv-note" className="atk-inp is-area is-text" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder={t("atok.revoke.notePh")} />
        </div>
        <div className="atk-field">
          <label htmlFor="atk-rv-name">
            <span>{t("atok.revoke.confirm")}</span>
            <b className="atk-strong">{token.name}</b>
          </label>
          <input id="atk-rv-name" className={`atk-inp${typed && typed.trim() !== token.name ? " is-bad" : ""}`} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} data-testid="atk-revoke-name" />
        </div>
        <div className="atk-warnbox is-flat">
          <AlertTriangle size={15} aria-hidden="true" />
          <span>{t("atok.revoke.warn", { n: f.n(token.requests24h || 0) })}</span>
        </div>
        {error ? (
          <p className="atk-err" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}

/* ---------------- restore ---------------- */

export function RestoreDialog({ open, token, now, onClose, onRestored }) {
  const { t } = useFmt();
  const toErr = useErr();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [codeBad, setCodeBad] = useState(false);
  useEffect(() => {
    if (!open) return;
    setCode("");
    setBusy(false);
    setError("");
    setCodeBad(false);
  }, [open]);
  if (!token) return null;
  const left = restoreLeft(token, now);
  const submit = async () => {
    if (busy || !otpReady(code) || left <= 0) return;
    setBusy(true);
    setError("");
    try {
      try {
        await tokenApi.verifyCode(code);
      } catch (err) {
        setCodeBad(true);
        setCode("");
        setError(toErr(err));
        return;
      }
      const r = await tokenApi.restore(token.id);
      onRestored(r);
    } catch (err) {
      setError(toErr(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      busy={busy}
      icon={Lock}
      title={t("atok.restore.title", { name: token.name })}
      subtitle={t("atok.restore.sub")}
      testId="atk-restore"
      footer={
        <>
          <button type="button" className="atk-btn is-ghost" onClick={onClose} disabled={busy}>
            {t("atok.cancel")}
          </button>
          <button type="button" className="atk-btn is-pri" disabled={busy || !otpReady(code) || left <= 0} onClick={submit} data-testid="atk-restore-submit">
            <RotateCcw size={14} />
            {busy ? t("atok.restore.busy") : t("atok.restore.submit")}
          </button>
        </>
      }
    >
      <div className="atk-form">
        <div className={`atk-fh${left > 0 ? "" : " is-bad"}`}>{left > 0 ? t("atok.restore.left", { t: clock(left) }) : t("atok.restore.expired")}</div>
        <div className="atk-field">
          <span className="atk-lb">{t("atok.otp.label")}</span>
          <Otp value={code} onChange={(v) => { setCode(v); setCodeBad(false); }} invalid={codeBad} autoFocus testId="atk-restore-otp" />
        </div>
        {error ? (
          <p className="atk-err" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}

/* ---------------- panic ---------------- */

export function PanicDialog({ open, tokens, onClose, onDone }) {
  const f = useFmt();
  const { t } = f;
  const toErr = useErr();
  const list = useMemo(() => (tokens || []).filter(isLive), [tokens]);
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [codeBad, setCodeBad] = useState(false);
  useEffect(() => {
    if (!open) return;
    setReason("");
    setTyped("");
    setCode("");
    setBusy(false);
    setError("");
    setCodeBad(false);
  }, [open]);
  const ready = panicReady({ reason, typed, code, count: list.length, busy });
  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    setError("");
    try {
      try {
        await tokenApi.verifyCode(code);
      } catch (err) {
        setCodeBad(true);
        setCode("");
        setError(toErr(err));
        return;
      }
      // The free-text reason goes in the note; the reason code stays one of the contract's.
      const r = await tokenApi.revokeAll({ reason: "other", note: reason.trim(), confirm: PANIC_WORD });
      onDone(r);
    } catch (err) {
      setError(toErr(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      busy={busy}
      icon={AlertCircle}
      tone="red"
      title={t("atok.panic.title")}
      subtitle={t("atok.panic.sub")}
      width={680}
      testId="atk-panic"
      footer={
        <>
          <span className="atk-sub atk-mf-sp">{t("atok.panic.count", { n: list.length })}</span>
          <button type="button" className="atk-btn is-ghost" onClick={onClose} disabled={busy}>
            {t("atok.cancel")}
          </button>
          <button type="button" className="atk-btn is-dan is-solid" disabled={!ready} onClick={submit} data-testid="atk-panic-submit">
            <AlertCircle size={14} />
            {busy ? t("atok.panic.busy") : t("atok.panic.submit")}
          </button>
        </>
      }
    >
      <div className="atk-form">
        <div className="atk-tlist">
          {list.length ? (
            list.map((tok) => (
              <div key={tok.id}>
                <TokenIcon token={tok} size="xs" />
                <span className="nm atk-ell">
                  {tok.name} <span className="atk-mask">{maskToken(tok)}</span>
                </span>
                <Pill status={tok.status} small />
                <span className="atk-sub atk-nowrap tnum">{t("atok.panic.row", { n: f.n(tok.requests24h || 0) })}</span>
              </div>
            ))
          ) : (
            <div>
              <span className="nm">{t("atok.panic.none")}</span>
            </div>
          )}
        </div>
        <div className="atk-field">
          <label htmlFor="atk-pn-reason">
            {t("atok.panic.reason")} <em>{t("atok.panic.reasonHint")}</em>
          </label>
          <textarea id="atk-pn-reason" className="atk-inp is-area is-text" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} placeholder={t("atok.panic.reasonPh")} data-testid="atk-panic-reason" />
        </div>
        <div className="atk-field">
          <label htmlFor="atk-pn-word">
            <span>
              {t("atok.panic.typeBefore")} <b className="atk-red">{PANIC_WORD}</b> {t("atok.panic.typeAfter")}
            </span>
            <em>{t("atok.panic.typeHint")}</em>
          </label>
          <input id="atk-pn-word" className={`atk-inp is-typed${typed && !typedMatches(typed, PANIC_WORD) ? " is-bad" : ""}`} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} data-testid="atk-panic-word" />
        </div>
        <div className="atk-field">
          <span className="atk-lb">{t("atok.otp.label")}</span>
          <Otp value={code} onChange={(v) => { setCode(v); setCodeBad(false); }} invalid={codeBad} testId="atk-panic-otp" />
        </div>
        {error ? (
          <p className="atk-err" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}

/* ---------------- IP allowlist ---------------- */

export function IpDialog({ open, token, seen, myIp, initialAdd, onClose, onSaved }) {
  const f = useFmt();
  const { t } = f;
  const toErr = useErr();
  const [list, setList] = useState([]);
  const [input, setInput] = useState("");
  const [bad, setBad] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open || !token) return;
    const base = [...(token.ipAllowlist || [])];
    if (initialAdd && !base.includes(initialAdd)) base.push(initialAdd);
    setList(base);
    setInput("");
    setBad(false);
    setBusy(false);
    setError("");
  }, [open, token, initialAdd]);
  if (!token) return null;
  const add = (v) => {
    const s = String(v || "").trim().toLowerCase();
    if (!isValidIpOrCidr(s)) {
      setBad(true);
      return false;
    }
    setBad(false);
    setList((l) => (l.includes(s) ? l : [...l, s]));
    return true;
  };
  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await tokenApi.patch(token.id, { ipAllowlist: list });
      onSaved(r, token.ipAllowlist || []);
    } catch (err) {
      setError(toErr(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      busy={busy}
      icon={Globe}
      title={t("atok.ipdlg.title", { name: token.name })}
      subtitle={t("atok.ipdlg.sub")}
      width={680}
      testId="atk-ipdlg"
      footer={
        <>
          <button type="button" className="atk-btn is-ghost" onClick={onClose} disabled={busy}>
            {t("atok.cancel")}
          </button>
          <button type="button" className="atk-btn is-pri" onClick={save} disabled={busy} data-testid="atk-ip-save">
            <Check size={14} />
            {busy ? t("atok.ipdlg.busy") : t("atok.ipdlg.save")}
          </button>
        </>
      }
    >
      <div className="atk-form">
        <div>
          <div className="atk-sec-h">
            <h4>{t("atok.ipdlg.allowed")}</h4>
            <span className="atk-sub">{list.length ? t("atok.ipdlg.rules", { n: list.length }) : t("atok.ipdlg.noRules")}</span>
          </div>
          {list.length ? (
            list.map((ip) => (
              <div key={ip} className="atk-iprow">
                <Lock size={13} aria-hidden="true" />
                <code>{ip}</code>
                <button type="button" className="atk-btn is-sm is-ghost" onClick={() => setList((l) => l.filter((x) => x !== ip))}>
                  <Trash2 size={13} />
                  {t("atok.ipdlg.remove")}
                </button>
              </div>
            ))
          ) : (
            <div className="atk-warnbox is-flat">
              <AlertTriangle size={15} aria-hidden="true" />
              <span>{t("atok.ipdlg.emptyWarn")}</span>
            </div>
          )}
          <form
            className="atk-ipadd"
            onSubmit={(e) => {
              e.preventDefault();
              if (add(input)) setInput("");
            }}
          >
            <input className={`atk-inp${bad ? " is-bad" : ""}`} value={input} onChange={(e) => { setInput(e.target.value); setBad(false); }} placeholder={t("atok.ipdlg.inputPh")} aria-label={t("atok.ipdlg.inputLabel")} spellCheck={false} data-testid="atk-ip-input" />
            <button type="submit" className="atk-btn">
              <Plus size={14} />
              {t("atok.ipdlg.add")}
            </button>
          </form>
          {bad ? <div className="atk-fh is-bad">{t("atok.ipdlg.bad")}</div> : null}
          {myIp ? (
            <button type="button" className="atk-btn is-sm atk-mt8" onClick={() => add(myIp)} disabled={list.includes(myIp.toLowerCase())}>
              <Plus size={13} />
              {t("atok.create.myIp", { ip: myIp })}
            </button>
          ) : null}
        </div>
        <div>
          <div className="atk-sec-h">
            <h4>{t("atok.ip.seen")}</h4>
          </div>
          {(seen || []).length ? (
            <div className="atk-seen">
              {seen.map((s) => {
                const inList = ipAllowedBy(s.ip, list);
                return (
                  <div key={s.ip}>
                    <span className={`atk-cc${!inList && list.length ? " is-new" : ""}`}>{String(s.country || "--").toUpperCase()}</span>
                    <code className="atk-ell">{s.ip}</code>
                    <span className="atk-sub atk-ell">{t("atok.ip.seenRow", { country: f.country(s.country) || t("atok.dash"), n: f.n(s.count || 0) })}</span>
                    {inList ? (
                      <span className="atk-ok">{t("atok.ip.inList")}</span>
                    ) : (
                      <button type="button" className="atk-link" onClick={() => add(s.ip)}>
                        {t("atok.ip.add")}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="atk-empty-s">{t("atok.ip.seenNone")}</p>
          )}
        </div>
        <div className="atk-fh">{t("atok.ipdlg.foot")}</div>
        {error ? (
          <p className="atk-err" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
