/**
 * https://descall.com/passkey/desktop#c=<one-time code>: the browser half of the desktop
 * passkey handoff (lib/passkeys/handoff.js). The Descall desktop app (Electron, or the Tauri app
 * on Windows older than 1903) opened this page in the default browser and waits; this page runs
 * the passkey ceremony at the real origin, the app collects the result with its own poll secret.
 *
 * The code is read from the fragment and removed from the address bar at once (never sent to a
 * server in a URL, not left in history). The 4-digit match code must equal the one in the app.
 * The browser itself is never signed in by this page.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, KeyRound } from "../ui/Icon.jsx";
import { useT } from "../../context/LocaleContext";
import { passkeyApi } from "../../lib/passkeys/api.js";
import { toCreationOptions, toRequestOptions, registrationToJSON, authenticationToJSON } from "../../lib/passkeys/codec.js";
import { normalizePasskeyError, passkeyErrorKey, isSilentPasskeyError } from "../../lib/passkeys/errors.js";
import { webAuthnSupported, hostMatchesRpId } from "../../lib/passkeys/platform.js";
import "../../styles/passkeys.css";

/** The one-time code from "#c=<43 base64url chars>", or "". */
export function handoffCodeFromHash(hash) {
  const m = /(?:^#|&)c=([A-Za-z0-9_-]{43})(?:&|$)/.exec(String(hash || ""));
  return m ? m[1] : "";
}

export default function PasskeyDesktopPage() {
  const t = useT();
  const code = useMemo(() => (typeof window !== "undefined" ? handoffCodeFromHash(window.location.hash) : ""), []);
  const [info, setInfo] = useState(null);
  const [state, setState] = useState(code ? "loading" : "nocode"); // loading | ready | busy | done | expired | nocode | unsupported
  const [error, setError] = useState("");
  const started = useRef(false);
  // Options fetched as soon as the link is known, so the click opens the passkey sheet at once
  // (Safari only allows it while the click is fresh).
  const optionsRef = useRef(null);

  useEffect(() => {
    try {
      document.documentElement.setAttribute("data-react-ready", "1");
      window.__descallDismissBootSplash?.({ minMs: 0 });
      if (window.location.hash) window.history.replaceState(null, "", window.location.pathname);
    } catch {
      /* ignore */
    }
    if (!code) return;
    if (!webAuthnSupported(window) || !hostMatchesRpId(window.location.hostname, "descall.com")) {
      setState("unsupported");
      return;
    }
    let alive = true;
    passkeyApi
      .handoffInfo(code)
      .then(async (res) => {
        if (!alive) return;
        try {
          optionsRef.current = res.kind === "register" ? await passkeyApi.handoffRegisterOptions(code) : await passkeyApi.handoffAuthOptions(code);
        } catch {
          optionsRef.current = null; // fetched again on click
        }
        if (!alive) return;
        setInfo(res);
        setState("ready");
      })
      .catch(() => alive && setState("expired"));
    return () => {
      alive = false;
    };
  }, [code]);

  const run = async () => {
    if (started.current && state === "busy") return;
    started.current = true;
    setState("busy");
    setError("");
    try {
      const ready = optionsRef.current;
      optionsRef.current = null; // single use
      if (info.kind === "register") {
        const options = ready || (await passkeyApi.handoffRegisterOptions(code));
        const cred = await navigator.credentials.create({ publicKey: toCreationOptions(options) });
        await passkeyApi.handoffRegisterVerify(code, registrationToJSON(cred));
      } else {
        const options = ready || (await passkeyApi.handoffAuthOptions(code));
        const cred = await navigator.credentials.get({ publicKey: toRequestOptions(options) });
        await passkeyApi.handoffAuthVerify(code, authenticationToJSON(cred));
      }
      setState("done");
    } catch (err) {
      const e = normalizePasskeyError(err);
      if (e.serverCode === "HANDOFF_EXPIRED" || e.serverCode === "HANDOFF_USED") {
        setState("expired");
        return;
      }
      setState("ready");
      // Fresh options for the next click.
      (info.kind === "register" ? passkeyApi.handoffRegisterOptions(code) : passkeyApi.handoffAuthOptions(code))
        .then((o) => {
          optionsRef.current = o;
        })
        .catch(() => {});
      if (!isSilentPasskeyError(e)) {
        const key = passkeyErrorKey(e);
        if (key) setError(t(key));
      }
    }
  };

  const lead = info?.kind === "register" ? t("passkey.desktop.registerLead", { username: info.username || "" }) : t("passkey.desktop.signinLead");

  return (
    <main className="pk-desktop-page">
      <section className="pk-desktop-card" aria-live="polite">
        <span className="pk-desktop-icon" aria-hidden="true">
          {state === "done" ? <CheckCircle2 size={28} weight="fill" /> : <KeyRound size={28} weight="bold" />}
        </span>
        <h1>{t("passkey.desktop.title")}</h1>
        {state === "loading" ? <p className="pk-note">{t("passkey.desktop.loading")}</p> : null}
        {state === "nocode" ? <p className="pk-note">{t("passkey.desktop.noCode")}</p> : null}
        {state === "unsupported" ? <p className="pk-error">{t("passkey.desktop.unsupported")}</p> : null}
        {state === "expired" ? <p className="pk-error">{t("passkey.desktop.expired")}</p> : null}
        {state === "done" ? (
          <p className="pk-ok">{info?.kind === "register" ? t("passkey.desktop.doneRegister") : t("passkey.desktop.doneSignin")}</p>
        ) : null}
        {state === "ready" || state === "busy" ? (
          <>
            <p className="pk-note">{lead}</p>
            <div>
              <p className="pk-note">{t("passkey.desktop.matchLabel")}</p>
              <div className="pk-desktop-code tnum">{info?.matchCode}</div>
              <p className="pk-note">{t("passkey.desktop.matchHint")}</p>
            </div>
            <button type="button" className="pk-signin-btn" onClick={run} disabled={state === "busy"}>
              <KeyRound size={18} weight="bold" aria-hidden="true" />
              <span>
                {state === "busy" ? t("passkey.signIn.busy") : info?.kind === "register" ? t("passkey.desktop.registerButton") : t("passkey.desktop.signinButton")}
              </span>
            </button>
            {error ? <p className="pk-error" role="alert">{error}</p> : null}
          </>
        ) : null}
      </section>
    </main>
  );
}
