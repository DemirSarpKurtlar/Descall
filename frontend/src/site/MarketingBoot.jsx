import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import MarketingApp from "./MarketingApp";
import {
  login as apiLogin,
  register as apiRegister,
  verify2faLogin as apiVerify2fa,
  loginWithGoogle as apiGoogleLogin,
  isSocialSignupRequired,
} from "../api/auth";
import { setToken, setUser } from "../lib/storage";
import { noteSignIn } from "../lib/passkeys/visual.js";

/** Draft A: a password / Google sign-in here may be followed by the passkey suggestion card. */
function notePasskeySuggestion(method) {
  try {
    noteSignIn(window.localStorage, method);
    sessionStorage.setItem("descall.pk.lastMethod", method);
  } catch {
    /* storage off */
  }
}
import { markHeardAboutPending } from "../lib/heardAbout";
import { banStateFromError } from "../lib/banState.js";
import { serverMessage } from "../i18n/serverText.js";
import { useT } from "../context/localeContextInstance";

// Ban notice (docs/design/ban-experience), loaded only when a sign-in is refused for a ban.
const BanScreen = lazy(() => import("../components/ban/BanScreenStandalone.jsx"));

/** onVerify2fa(pendingToken, code) or onVerify2fa({ pendingToken, code }). */
export function verify2faArgs(payloadOrToken, codeArg) {
  if (payloadOrToken && typeof payloadOrToken === "object") {
    return {
      pendingToken: payloadOrToken.pendingToken || payloadOrToken.token || "",
      code: String(payloadOrToken.code || payloadOrToken.otp || "").trim(),
    };
  }
  return { pendingToken: String(payloadOrToken || ""), code: String(codeArg || "").trim() };
}

/**
 * Lightweight marketing shell, avoids importing the authenticated App/LiveKit tree
 * until the visitor actually signs in.
 */
export default function MarketingBoot() {
  const t = useT();
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [banState, setBanState] = useState(null);
  // A ban opens the ban screen; anything else stays the one-line error.
  const fail = useCallback((err, fallback) => {
    const ban = banStateFromError(err);
    if (ban) {
      setAuthError("");
      setBanState(ban);
    } else {
      // The runtime translator is not bound in this shell, so err.message is the
      // server's English: translate the body (errorKey + vars) with the site catalog.
      const body = err?.body;
      setAuthError(
        serverMessage(body, "error", t) || serverMessage(body, "message", t) || (err?.message ? t(err.message) : t(fallback))
      );
    }
  }, [t]);

  useEffect(() => {
    // Mark React as alive (cookie banner / consent padding) but keep #seo-static
    // visible until the lazy route page commits, otherwise H1 disappears into a
    // blank Suspense gap (users reported this as a "Loading" flash on / & /features).
    document.documentElement.setAttribute("data-react-ready", "1");
    try {
      window.__descallDismissBootSplash?.({ minMs: 0 });
    } catch {
      /* ignore */
    }
  }, []);

  const enterApp = useCallback(() => {
    window.location.assign("/");
  }, []);

  const onLogin = useCallback(
    async ({ username, password, signInMs }) => {
      setAuthLoading(true);
      setAuthError("");
      try {
        const res = await apiLogin({ username, password, ...(signInMs ? { signInMs } : {}) });
        if (res?.requires2fa || res?.pendingToken) return res;
        if (res?.token) notePasskeySuggestion("password");
        if (res?.token) setToken(res.token);
        if (res?.user) setUser(res.user);
        enterApp();
        return res;
      } catch (err) {
        fail(err, "Login failed");
        throw err;
      } finally {
        setAuthLoading(false);
      }
    },
    [enterApp, fail]
  );

  const onRegister = useCallback(
    async (payload) => {
      setAuthLoading(true);
      setAuthError("");
      try {
        const res = await apiRegister(payload);
        if (!res?.token && payload?.username && payload?.password) {
          const loggedIn = await apiLogin({ username: payload.username, password: payload.password });
          if (loggedIn?.requires2fa || loggedIn?.pendingToken) return loggedIn;
          if (loggedIn?.token) {
            setToken(loggedIn.token);
            if (loggedIn.user) setUser(loggedIn.user);
            try {
              sessionStorage.setItem("descall:justRegistered", "1");
            } catch {
              /* ignore */
            }
            markHeardAboutPending(loggedIn.user?.id);
            enterApp();
            return loggedIn;
          }
        }
        if (!res?.token) {
          throw new Error("Registration succeeded but sign-in did not. Please log in.");
        }
        setToken(res.token);
        if (res?.user) setUser(res.user);
        try {
          sessionStorage.setItem("descall:justRegistered", "1");
        } catch {
          /* ignore */
        }
        markHeardAboutPending(res?.user?.id);
        enterApp();
        return res;
      } catch (err) {
        fail(err, "Registration failed");
        throw err;
      } finally {
        setAuthLoading(false);
      }
    },
    [enterApp, fail]
  );

  const onGoogleLogin = useCallback(
    async (credential, extra = {}) => {
      setAuthLoading(true);
      setAuthError("");
      try {
        // extra = { termsAccepted, birthDate, invitedBy } from the Register tab or the
        // Terms + date-of-birth step for a new Google account.
        const res = await apiGoogleLogin(credential, extra);
        // Account with two-factor (3.2.0): the modal asks for the code first.
        if (res?.requires2fa || (res?.pendingToken && !res?.token)) return res;
        if (res?.token && !res?.isNewUser) notePasskeySuggestion("google");
        if (res?.token) setToken(res.token);
        if (res?.user) setUser(res.user);
        if (res?.isNewUser) {
          try {
            sessionStorage.setItem("descall:justRegistered", "1");
          } catch {
            /* ignore */
          }
          markHeardAboutPending(res?.user?.id);
        }
        enterApp();
        return res;
      } catch (err) {
        // New Google account: the auth UI shows the Terms + date-of-birth step instead of an error.
        if (isSocialSignupRequired(err)) throw err;
        fail(err, "Google sign-in failed");
        throw err;
      } finally {
        setAuthLoading(false);
      }
    },
    [enterApp, fail]
  );

  const onVerify2fa = useCallback(
    async (payloadOrToken, codeArg) => {
      setAuthLoading(true);
      setAuthError("");
      try {
        // MarketingAuthModal calls onVerify2fa(pendingToken, code), the same
        // shape as App's handleVerify2fa. Reading only an object here sent an
        // empty body, and every correct code answered "Code is required."
        const { pendingToken, code } = verify2faArgs(payloadOrToken, codeArg);
        const res = await apiVerify2fa(pendingToken, code);
        if (res?.token) notePasskeySuggestion("2fa");
        if (res?.token) setToken(res.token);
        if (res?.user) setUser(res.user);
        enterApp();
        return res;
      } catch (err) {
        fail(err, "2FA failed");
        throw err;
      } finally {
        setAuthLoading(false);
      }
    },
    [enterApp, fail]
  );

  // Passkey sign-in (button and browser autofill): same session body as POST /login.
  const onPasskeyLogin = useCallback(
    async (res) => {
      if (!res?.token) return;
      setAuthError("");
      setToken(res.token);
      if (res.user) setUser(res.user);
      enterApp();
    },
    [enterApp]
  );
  const onPasskeyError = useCallback((err) => fail(err, "Something went wrong"), [fail]);

  return (
    <>
      <MarketingApp
        onLogin={onLogin}
        onRegister={onRegister}
        onGoogleLogin={onGoogleLogin}
        onVerify2fa={onVerify2fa}
        onPasskeyLogin={onPasskeyLogin}
        onPasskeyError={onPasskeyError}
        authLoading={authLoading}
        authError={authError}
      />
      {banState ? (
        <Suspense fallback={null}>
          <BanScreen state={banState} onClose={() => setBanState(null)} />
        </Suspense>
      ) : null}
    </>
  );
}
