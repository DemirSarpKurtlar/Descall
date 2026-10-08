import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { useT } from "../context/LocaleContext";
import { getNativePushPermission, isNativeIosPush } from "../lib/nativePush";
import "./IosPushPermissionPrompt.css";

const SNOOZE_KEY = "descall:ios-push-prompt-snoozed-until";
const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;
const SHOW_DELAY_MS = 1500;

function snoozed() {
  try {
    return Number(localStorage.getItem(SNOOZE_KEY) || 0) > Date.now();
  } catch {
    return false;
  }
}

/**
 * Native iOS only: after sign-in, explain notifications once and then show the
 * iOS permission dialog. "Not now" asks again in 3 days; the notification
 * settings tab can always ask.
 */
export default function IosPushPermissionPrompt({ enabled, onAllow }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!enabled || !isNativeIosPush() || snoozed()) return undefined;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const permission = await getNativePushPermission();
      if (!cancelled && permission === "prompt") setOpen(true);
    }, SHOW_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [enabled]);

  if (!open) return null;

  const later = () => {
    try {
      localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  const allow = async () => {
    setBusy(true);
    try {
      await onAllow?.();
    } finally {
      setBusy(false);
      setOpen(false);
    }
  };

  return (
    <div className="ios-push-prompt" role="dialog" aria-modal="true" aria-labelledby="ios-push-prompt-title">
      <div className="ios-push-prompt__card">
        <div className="ios-push-prompt__icon" aria-hidden="true">
          <Bell size={26} />
        </div>
        <h2 id="ios-push-prompt-title">{t("Turn on notifications")}</h2>
        <p>
          {t("Get notified about DMs, group messages, server messages, mentions and friend requests, even when Descall is closed.")}
        </p>
        <button type="button" className="ios-push-prompt__allow" onClick={allow} disabled={busy}>
          {t("Allow notifications")}
        </button>
        <button type="button" className="ios-push-prompt__later" onClick={later} disabled={busy}>
          {t("Not now")}
        </button>
      </div>
    </div>
  );
}
