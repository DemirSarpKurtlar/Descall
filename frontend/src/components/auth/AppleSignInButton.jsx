import { useState } from "react";
import { registerPlugin } from "@capacitor/core";
import { useT } from "../../context/LocaleContext";
import { isNativeIOS } from "../../lib/platform";

const AppleSignIn = registerPlugin("AppleSignIn");

function randomNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function AppleLogo() {
  return (
    <svg width="16" height="19" viewBox="0 0 814 1000" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M788 341c-6 4-108 62-108 190 0 149 131 201 135 203-1 3-21 72-69 142-43 62-88 124-156 124s-86-40-164-40c-77 0-104 41-166 41s-106-57-156-127C46 792 0 666 0 546c0-193 125-295 249-295 66 0 121 43 162 43 39 0 101-46 176-46 29 0 131 3 201 93zM555 159c31-37 53-88 53-139 0-7-1-14-2-20-50 2-110 34-146 76-28 32-55 83-55 135 0 8 1 16 2 18 3 1 9 2 14 2 45 0 101-30 134-72z"
      />
    </svg>
  );
}

/**
 * Native "Sign in with Apple" button (iOS app only; renders nothing elsewhere).
 * onApple(result) receives { identityToken, authorizationCode, givenName, familyName, email, nonce }.
 */
export default function AppleSignInButton({ onApple, disabled = false, label }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!isNativeIOS()) return null;

  const start = async () => {
    if (disabled || busy) return;
    setBusy(true);
    setError("");
    try {
      const nonce = randomNonce();
      const result = await AppleSignIn.authorize({ nonce: await sha256Hex(nonce) });
      await onApple?.({ ...result, nonce });
    } catch (err) {
      const code = err?.code || err?.data?.code;
      if (code !== "canceled") {
        setError(err?.message && !/^\w+$/.test(err.message) ? err.message : t("Sign in with Apple failed."));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="apple-signin-wrap">
      <button
        type="button"
        className="apple-signin-btn"
        onClick={start}
        disabled={disabled || busy}
        aria-busy={busy || undefined}
      >
        <AppleLogo />
        <span>{label || t("Continue with Apple")}</span>
      </button>
      {error ? (
        <p className="auth-field-hint apple-signin-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
