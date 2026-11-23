import { useEffect, useRef } from "react";
import { startConditional } from "../lib/passkeys/index.js";
import { isSilentPasskeyError } from "../lib/passkeys/errors.js";

/**
 * Web passkey autofill (WebAuthn conditional mediation): while `enabled`, the browser lists
 * the account's passkeys in the username field's suggestions. The field needs
 * autoComplete="username webauthn" (PASSKEY_AUTOCOMPLETE). Picking one signs in without a
 * click on "Passkey ile giriş yap". Only the web path does anything; the apps and the
 * desktop shells return at once.
 *
 * onSignedIn(body) gets the POST /login-shaped body; onError(err) only real problems
 * (a dismissed suggestion is silent).
 */
export const PASSKEY_AUTOCOMPLETE = "username webauthn";

export default function usePasskeyAutofill({ enabled, onSignedIn, onError }) {
  const handlers = useRef({ onSignedIn, onError });
  handlers.current = { onSignedIn, onError };
  useEffect(() => {
    if (!enabled) return undefined;
    const stop = startConditional({
      onResult: (body) => handlers.current.onSignedIn?.(body),
      onError: (err) => {
        if (!isSilentPasskeyError(err)) handlers.current.onError?.(err);
      },
    });
    return stop;
  }, [enabled]);
}
