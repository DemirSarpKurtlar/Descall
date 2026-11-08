import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { checkSignupUsername } from "../../api/auth";
import { emailIssue, fieldOfCode, passwordIssue, signupMessage, usernameIssue, usernameSuggestion } from "../../lib/signupRules";

const SHOW_WHILE_TYPING = new Set(["username_chars", "username_long", "username_reserved", "password_long"]);

/**
 * As-you-type checks for the email register form (lib/signupRules.js, same rules as
 * the server). A field shows its problem once the person left it (or tried to submit);
 * rules that typing more cannot fix (a character that is not allowed, too long, a
 * reserved name) show right away. The username is checked for availability after a
 * short pause. `serverError` (the failed register response) marks its field too.
 *
 * Returns { fields: { username, password, email }, blur(field), touchAll(), hasErrors,
 *           noteServerError(err), clearServerError() }; each field is
 *           { code, message, visible, suggestion?, state? }.
 */
export default function useSignupFieldChecks({ username, password, email, enabled, check = checkSignupUsername, debounceMs = 400 }) {
  const [touched, setTouched] = useState({});
  const [availability, setAvailability] = useState({ value: "", state: "idle", suggestions: [] });
  const [server, setServer] = useState(null); // { field, code, value }
  const seq = useRef(0);

  const u = String(username ?? "").trim();
  const localUsername = enabled && u ? usernameIssue(u) : null;

  useEffect(() => {
    if (!enabled || !u || localUsername) {
      seq.current += 1;
      setAvailability({ value: "", state: "idle", suggestions: [] });
      return undefined;
    }
    const id = ++seq.current;
    setAvailability({ value: u, state: "checking", suggestions: [] });
    const timer = setTimeout(async () => {
      try {
        const res = await check(u);
        if (id !== seq.current) return;
        if (res?.available) setAvailability({ value: u, state: "ok", suggestions: [] });
        else setAvailability({ value: u, state: "taken", suggestions: Array.isArray(res?.suggestions) ? res.suggestions.slice(0, 3) : [] });
      } catch {
        // Rate limited / offline: say nothing, the server checks again on submit.
        if (id === seq.current) setAvailability({ value: u, state: "idle", suggestions: [] });
      }
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [enabled, u, localUsername, check, debounceMs]);

  // Leaving the register form (Login tab, modal closed) forgets what was shown.
  useEffect(() => {
    if (enabled) return;
    setTouched({});
    setServer(null);
  }, [enabled]);

  const blur = useCallback((field) => {
    if (!enabled) return;
    setTouched((t) => (t[field] ? t : { ...t, [field]: true }));
  }, [enabled]);
  const touchAll = useCallback(() => setTouched({ username: true, password: true, email: true }), []);
  const noteServerError = useCallback((err) => {
    const field = err?.body?.field || fieldOfCode(err?.code);
    if (!field) return;
    const code = signupMessage(err?.body?.code) ? err.body.code : null;
    const value = field === "username" ? String(username ?? "").trim() : field === "email" ? String(email ?? "").trim() : String(password ?? "");
    setServer({ field, code, value, message: err?.message || null, suggestions: Array.isArray(err?.body?.suggestions) ? err.body.suggestions.slice(0, 3) : [] });
  }, [username, email, password]);
  const clearServerError = useCallback(() => setServer(null), []);

  const fields = useMemo(() => {
    if (!enabled) return { username: null, password: null, email: null };
    const make = (field, value, code, extra = {}) => {
      const fromServer = server && server.field === field && server.value === value ? server : null;
      const finalCode = code || (fromServer ? fromServer.code || "server" : null);
      const message = code ? signupMessage(code) : fromServer ? signupMessage(fromServer.code) || fromServer.message : null;
      const visible = Boolean(message) && (Boolean(fromServer) || touched[field] || SHOW_WHILE_TYPING.has(code));
      return { code: finalCode, message, visible, ...extra };
    };
    const takenNow = availability.state === "taken" && availability.value === u;
    const nameCode = u ? localUsername || (takenNow ? "username_taken" : null) : touched.username ? "username_short" : null;
    const serverSuggestions = server?.field === "username" && server.value === u ? server.suggestions : [];
    const userField = make("username", u, nameCode, {
      state: localUsername ? "invalid" : availability.value === u ? availability.state : "idle",
      suggestion: localUsername === "username_chars" ? usernameSuggestion(username) : "",
      suggestions: takenNow ? availability.suggestions : serverSuggestions,
    });
    if (takenNow) userField.visible = true;
    const p = String(password ?? "");
    const passField = make("password", p, p ? passwordIssue(p) : touched.password ? "password_short" : null);
    const em = String(email ?? "").trim();
    const mailField = make("email", em, em || touched.email ? emailIssue(email) : null);
    return { username: userField, password: passField, email: mailField };
  }, [enabled, server, touched, availability, u, localUsername, username, password, email]);

  // What blocks the submit button: the local rules and a username we know is taken.
  const hasErrors = Boolean(enabled && (usernameIssue(u) || passwordIssue(password) || emailIssue(email) || fields.username?.code === "username_taken"));

  return { fields, blur, touchAll, hasErrors, noteServerError, clearServerError };
}
