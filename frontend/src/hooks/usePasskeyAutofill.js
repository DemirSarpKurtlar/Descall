import { useEffect, useRef } from "react";
import { startConditional } from "../lib/passkeys/index.js";
import { isSilentPasskeyError } from "../lib/passkeys/errors.js";

/**
 * Passkey autofill while `enabled` (the sign-in screen):
 *   web       WebAuthn conditional mediation: the browser lists the account's passkeys in
 *             the username field's suggestions (autoComplete="username webauthn",
 *             PASSKEY_AUTOCOMPLETE). Picking one signs in without a click.
 *   iPhone    the suggestion above the keyboard (DescallPasskey.autofill, iOS 16+).
 * The other paths return at once.
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
        // A background suggestion: "no passkey support here" is not worth a message.
        if (!isSilentPasskeyError(err) && err?.code !== "unsupported") handlers.current.onError?.(err);
      },
    });
    return stop;
  }, [enabled]);
}
