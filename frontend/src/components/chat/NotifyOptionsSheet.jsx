import { useState } from "react";
import { Check, AlertCircle, Bell, BellOff, AtSign } from "../ui/Icon.jsx";
import GroupSheet from "../groups/GroupSheet";
import { useLocale } from "../../context/LocaleContext";
import { formatDate } from "../../i18n/format";
import { hapticSelection } from "../../lib/fluid/haptics";
import { MUTE_CHOICES, getPref, muteUntil, putPref } from "../../lib/notifyPrefs";
import useNotifyLevel from "../../hooks/useNotifyLevel";
import "../../styles/messaging-sheets.css";

const LEVEL_ROWS = [
  { id: "all", label: "msg4.notify.all", sub: "msg4.notify.allSub", Icon: Bell },
  { id: "mentions", label: "msg4.notify.mentions", sub: "msg4.notify.mentionsSub", Icon: AtSign },
  { id: "none", label: "msg4.notify.none", sub: "msg4.notify.noneSub", Icon: BellOff },
];

/**
 * Notification options for one DM or group (messaging phase 4): all
 * messages / only @mentions / nothing, and a timed mute (1 h, 8 h, 1 day,
 * 1 week). Saved at once (optimistic, rolled back if the server refuses);
 * the server filters pushes, lib/notifyPrefs the app's own notifications.
 */
export default function NotifyOptionsSheet({ open, target, save, onClose }) {
  const { t, locale } = useLocale();
  const [error, setError] = useState("");
  const convType = target?.convType;
  const convId = target?.convId;
  const pref = getPref(convType, convId);
  const level = pref?.level || "all";
  const effective = useNotifyLevel(convType, convId);
  const until = pref?.mutedUntil && Date.parse(pref.mutedUntil) > Date.now() ? pref.mutedUntil : null;

  const apply = async (next) => {
    const before = getPref(convType, convId) || { convType, convId, level: "all", mutedUntil: null };
    const merged = { convType, convId, level: before.level || "all", mutedUntil: before.mutedUntil || null, ...next };
    hapticSelection();
    setError("");
    putPref(merged);
    try {
      await save(merged);
    } catch (err) {
      putPref(before);
      setError(err?.status === 503 ? t("msg4.notify.notReady") : t("msg4.notify.saveError"));
    }
  };

  return (
    <GroupSheet
      open={open}
      onClose={onClose}
      title={t("msg4.notify.title")}
      subtitle={target?.name || ""}
      testId="notify-sheet"
      closeLabel={t("Close")}
      className="ms-sheet"
    >
      {until ? (
        <div className="gs-banner is-ok ms-muted-banner" role="status" data-testid="notify-muted">
          <BellOff size={16} />
          <span>{t("msg4.notify.mutedUntil", { time: formatDate(until, locale, { weekday: "short", hour: "2-digit", minute: "2-digit" }) })}</span>
          <button type="button" className="gs-text-btn is-primary" onClick={() => apply({ mutedUntil: null })}>{t("msg4.notify.unmute")}</button>
        </div>
      ) : null}
      {error ? (
        <div className="gs-banner is-error" role="alert">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      ) : null}

      <section className="gs-section">
        <h3 className="gs-section-title"><span>{t("msg4.notify.levelTitle")}</span></h3>
        <div className="gs-group">
          {LEVEL_ROWS.map((row) => (
            <button
              key={row.id}
              type="button"
              className="gs-row ms-option"
              role="radio"
              aria-checked={level === row.id}
              data-testid={`notify-level-${row.id}`}
              onClick={() => apply({ level: row.id })}
            >
              <span className="gs-row-icon"><row.Icon size={18} /></span>
              <span className="gs-row-text">
                <span className="gs-row-title">{t(row.label)}</span>
                <span className="gs-row-sub">{t(row.sub)}</span>
              </span>
              {level === row.id ? <Check size={18} strokeWidth={2.6} className="ms-tick" /> : null}
            </button>
          ))}
        </div>
      </section>

      <section className="gs-section">
        <h3 className="gs-section-title"><span>{t("msg4.notify.muteTitle")}</span></h3>
        <div className="gs-group">
          {MUTE_CHOICES.map((c) => (
            <button
              key={c.id}
              type="button"
              className="gs-row ms-option"
              data-testid={`notify-mute-${c.id}`}
              onClick={() => apply({ mutedUntil: muteUntil(c.id) })}
            >
              <span className="gs-row-text"><span className="gs-row-title">{t(c.label)}</span></span>
            </button>
          ))}
        </div>
        <p className="gs-footnote"><span>{effective === "none" ? t("msg4.notify.footSilent") : t("msg4.notify.foot")}</span></p>
      </section>
    </GroupSheet>
  );
}
