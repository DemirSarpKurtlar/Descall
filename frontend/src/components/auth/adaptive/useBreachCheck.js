import { useEffect, useRef, useState } from "react";
import { checkPasswordBreach } from "../../../lib/adaptiveSignup/breach.js";
import { fetchBreachRange } from "../../../api/adaptiveSignup.js";
import { passwordIssue } from "../../../lib/signupRules.js";

/**
 * Live breach check of the password being typed (growth 1B "Yazarken sızıntı kontrolü").
 * Runs after a short pause, cancels the previous lookup, only for passwords that already
 * pass the length rule. The common list of lib/signupRules.js answers at once.
 * -> { status: "idle" | "checking" | "clean" | "breached" | "unknown", count, value }
 */
export default function useBreachCheck(password, { enabled = true, debounceMs = 450, fetchRange = fetchBreachRange } = {}) {
  const [state, setState] = useState({ status: "idle", count: 0, value: "" });
  const seq = useRef(0);
  useEffect(() => {
    const pw = String(password ?? "");
    const id = ++seq.current;
    if (!enabled || !pw) {
      setState({ status: "idle", count: 0, value: pw });
      return undefined;
    }
    const issue = passwordIssue(pw);
    if (issue === "password_breached") {
      setState({ status: "breached", count: 0, value: pw });
      return undefined;
    }
    if (issue) {
      setState({ status: "idle", count: 0, value: pw });
      return undefined;
    }
    setState((s) => (s.value === pw && s.status !== "idle" ? s : { status: "checking", count: 0, value: pw }));
    const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = setTimeout(async () => {
      const r = await checkPasswordBreach(pw, { fetchRange, signal: ctl?.signal });
      if (id !== seq.current || r.aborted) return;
      setState({ status: r.status, count: r.count || 0, value: pw });
    }, debounceMs);
    return () => {
      clearTimeout(timer);
      ctl?.abort();
    };
  }, [password, enabled, debounceMs, fetchRange]);
  return state;
}
