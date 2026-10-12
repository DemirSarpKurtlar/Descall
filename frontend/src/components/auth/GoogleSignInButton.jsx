import { useEffect, useRef, useState } from "react";
import { getGoogleAuthConfig } from "../../api/auth";
import { useT } from "../../context/LocaleContext";
import { isNativeIOS } from "../../lib/platform";

const GIS_SRC = "https://accounts.google.com/gsi/client";

function loadGoogleScript() {
  if (typeof window === "undefined") return Promise.reject(new Error("No window"));
  if (window.google?.accounts?.id) return Promise.resolve();

  const existing = document.querySelector(`script[src="${GIS_SRC}"]`);
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load Google script")));
      if (window.google?.accounts?.id) resolve();
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google script"));
    document.head.appendChild(script);
  });
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3.1l5.7-5.7C34.2 6.1 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 12 24 12c3.1 0 5.8 1.2 8 3.1l5.7-5.7C34.2 6.1 29.4 4 24 4 16.3 4 9.6 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.3C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-1.1 3.2-3.5 5.7-6.7 7.1l6.3 5.3C37.4 38.3 44 33 44 24c0-1.2-.1-2.3-.4-3.5z" />
    </svg>
  );
}

/**
 * Renders Google Identity Services button.
 * onCredential(credentialJwt) is called after successful Google picker.
 * appearance="glass" paints a frosted face and keeps the official button as the hit target.
 */
function GoogleSignInButtonInner({ onCredential, disabled = false, appearance = "standard" }) {
  const t = useT();
  const buttonRef = useRef(null);
  const callbackRef = useRef(onCredential);
  const [status, setStatus] = useState("loading"); // loading | ready | unavailable
  const [error, setError] = useState("");

  useEffect(() => {
    callbackRef.current = onCredential;
  }, [onCredential]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const envClientId =
          typeof import.meta !== "undefined" && import.meta.env?.VITE_GOOGLE_CLIENT_ID
            ? String(import.meta.env.VITE_GOOGLE_CLIENT_ID).trim()
            : "";

        let clientId = envClientId;
        if (!clientId) {
          const config = await getGoogleAuthConfig();
          clientId = config?.clientId || "";
        }

        if (!clientId) {
          if (!cancelled) setStatus("unavailable");
          return;
        }

        await loadGoogleScript();
        if (cancelled || !buttonRef.current) return;

        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => {
            if (response?.credential) {
              callbackRef.current?.(response.credential);
            }
          },
          auto_select: false,
          cancel_on_tap_outside: true,
        });

        buttonRef.current.innerHTML = "";
        const hostWidth = Math.round(buttonRef.current.parentElement?.getBoundingClientRect?.().width || 0);
        const width = Math.max(240, Math.min(400, hostWidth || 320));
        window.google.accounts.id.renderButton(buttonRef.current, {
          type: "standard",
          theme: appearance === "glass" ? "filled_black" : "outline",
          size: "large",
          text: "continue_with",
          shape: appearance === "glass" ? "pill" : "rectangular",
          logo_alignment: "left",
          width,
        });

        if (!cancelled) setStatus("ready");
      } catch (err) {
        if (!cancelled) {
          setStatus("unavailable");
          setError(err.message || t("Google Sign-In unavailable"));
        }
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [appearance]);

  if (status === "unavailable") {
    return (
      <p className="google-signin-hint" role="note">
        {error || t("Google Sign-In is not configured yet.")}
      </p>
    );
  }

  const glass = appearance === "glass";
  return (
    <div
      className={`google-signin-wrap${glass ? " google-signin-wrap--glass" : ""}${disabled ? " is-disabled" : ""}`}
      aria-busy={status === "loading"}
    >
      {glass && (
        <div className="google-signin-glass-face" aria-hidden="true">
          <GoogleMark />
          <span>{t("Continue with Google")}</span>
        </div>
      )}
      {!glass && status === "loading" && <p className="google-signin-hint">{t("Loading Google…")}</p>}
      <div ref={buttonRef} className={`google-signin-button${glass ? " google-signin-button--glass-hit" : ""}`} />
    </div>
  );
}

/** Google sign-in is web/desktop only; the native iOS app uses Sign in with Apple. */
export default function GoogleSignInButton(props) {
  if (isNativeIOS()) return null;
  return <GoogleSignInButtonInner {...props} />;
}
