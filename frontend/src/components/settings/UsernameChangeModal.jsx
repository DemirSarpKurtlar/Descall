import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { AtSign, Check, Eye, EyeOff, KeyRound, Loader2, X, AlertTriangle } from "lucide-react";
import { useT } from "../../context/LocaleContext";
import { getToken, setToken } from "../../lib/storage";
import { checkUsernameAvailable, changeUsername } from "../../api/auth";
import "./UsernameChangeModal.css";

const USERNAME_RE = /^[a-zA-Z0-9_.-]+$/;

/** Mirrors the server rules so most mistakes show up before any request. */
export function localUsernameError(value) {
  if (!value) return "";
  if (value.length < 2) return "Username must be at least 2 characters.";
  if (value.length > 24) return "Username must be at most 24 characters.";
  if (!USERNAME_RE.test(value)) return "Username may only contain letters, numbers, underscores, hyphens, and dots.";
  return "";
}

export function normalizeUsernameInput(raw) {
  return String(raw || "").replace(/\s+/g, "").replace(/^@+/, "").slice(0, 32);
}

export default function UsernameChangeModal({ currentUsername, onClose, onChanged }) {
  const t = useT();
  const [value, setValue] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [check, setCheck] = useState({ state: "idle", message: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  const current = String(currentUsername || "");
  const candidate = value.trim();
  const sameAsCurrent = candidate && candidate === current;
  const localError = localUsernameError(candidate);

  useEffect(() => {
    const id = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && !busy) onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  // Debounced availability check against the server.
  useEffect(() => {
    if (!candidate) return setCheck({ state: "idle", message: "" });
    if (sameAsCurrent) return setCheck({ state: "same", message: "That's already your username." });
    if (localError) return setCheck({ state: "invalid", message: localError });
    setCheck({ state: "checking", message: "" });
    const controller = new AbortController();
    const id = setTimeout(async () => {
      try {
        const res = await checkUsernameAvailable(getToken(), candidate, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setCheck(
          res?.available
            ? { state: "ok", message: "Username is available." }
            : { state: "taken", message: res?.error || "Username is already taken." },
        );
      } catch (err) {
        if (controller.signal.aborted || err?.name === "AbortError") return;
        setCheck({ state: "unknown", message: "" });
      }
    }, 380);
    return () => {
      clearTimeout(id);
      controller.abort();
    };
  }, [candidate, sameAsCurrent, localError]);

  const canSubmit =
    !busy && candidate && !localError && !sameAsCurrent && password.length > 0 &&
    check.state !== "taken" && check.state !== "checking";

  const submit = async (e) => {
    e?.preventDefault?.();
    if (!canSubmit) return;
    setBusy(true);
    setError("");
    try {
      const res = await changeUsername(getToken(), { username: candidate, password });
      if (res?.token) setToken(res.token);
      onChanged?.(res?.user, res?.previousUsername || current);
    } catch (err) {
      setError(err?.message || "Could not change username.");
      if (err?.code === "WRONG_PASSWORD") setPassword("");
    } finally {
      setBusy(false);
    }
  };

  if (typeof document === "undefined") return null;

  const statusIcon =
    check.state === "checking" ? <Loader2 size={15} className="un-spin" aria-hidden /> :
    check.state === "ok" ? <Check size={15} aria-hidden /> :
    check.state === "taken" || check.state === "invalid" ? <X size={15} aria-hidden /> : null;

  return createPortal(
    <motion.div
      className="un-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={() => !busy && onClose?.()}
    >
      <motion.form
        className="un-modal"
        initial={{ scale: 0.96, opacity: 0, y: 8 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.96, opacity: 0, y: 8 }}
        transition={{ type: "spring", stiffness: 420, damping: 32 }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="un-title"
      >
        <div className="un-head">
          <span className="un-head-icon" aria-hidden><AtSign size={18} /></span>
          <div className="un-head-text">
            <h3 id="un-title">{t("Change username")}</h3>
            <p>{t("Your friends find and mention you with your username.")}</p>
          </div>
          <button type="button" className="un-icon-btn" onClick={onClose} aria-label={t("Close")} disabled={busy}>
            <X size={18} />
          </button>
        </div>

        <div className="un-preview" aria-live="polite">
          <span className="un-preview-old">@{current.toLowerCase()}</span>
          <span className="un-preview-arrow" aria-hidden>→</span>
          <span className={`un-preview-new${candidate ? "" : " is-empty"}`}>@{(candidate || t("new_name")).toLowerCase()}</span>
        </div>

        <label className="un-label" htmlFor="un-username">{t("New username")}</label>
        <div className={`un-field un-state-${check.state}`}>
          <span className="un-prefix" aria-hidden>@</span>
          <input
            id="un-username"
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => { setValue(normalizeUsernameInput(e.target.value)); setError(""); }}
            placeholder={current || "username"}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            maxLength={32}
            disabled={busy}
          />
          <span className="un-status" aria-hidden>{statusIcon}</span>
        </div>
        <p className={`un-hint un-hint-${check.state}`}>
          {check.message
            ? t(check.message)
            : check.state === "checking"
              ? t("Checking...")
              : t("2 to 24 characters: letters, numbers, dots, dashes and underscores.")}
        </p>

        <label className="un-label" htmlFor="un-password">{t("Current password")}</label>
        <div className="un-field">
          <span className="un-prefix" aria-hidden><KeyRound size={15} /></span>
          <input
            id="un-password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(""); }}
            placeholder={t("Enter your password to confirm")}
            autoComplete="current-password"
            disabled={busy}
          />
          <button
            type="button"
            className="un-icon-btn small"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? t("Hide password") : t("Show password")}
            tabIndex={-1}
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>

        <div className="un-note">
          <AlertTriangle size={14} aria-hidden />
          <span>{t("Your old username becomes free for others to take. Your friends, messages and servers stay the same.")}</span>
        </div>

        {error && <p className="un-error" role="alert">{t(error)}</p>}

        <div className="un-actions">
          <button type="button" className="un-btn ghost" onClick={onClose} disabled={busy}>
            {t("Cancel")}
          </button>
          <button type="submit" className="un-btn primary" disabled={!canSubmit}>
            {busy ? <Loader2 size={16} className="un-spin" /> : <Check size={16} />}
            {busy ? t("Please wait...") : t("Change username")}
          </button>
        </div>
      </motion.form>
    </motion.div>,
    document.body,
  );
}
