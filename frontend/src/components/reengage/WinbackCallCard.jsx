import { useCallback, useEffect, useState } from "react";
import { useT, useLocale } from "../../context/LocaleContext";
import { Avatar } from "../ui/Avatar";
import { BellRing, Check, Loader2, AlertTriangle, ChevronDown, Pencil } from "../ui/Icon.jsx";
import { winbackApi } from "../../api/reengage";
import { defaultCallMessage, parseSuggestion } from "./winbackModel.js";
import "../../styles/reengage.css";

/**
 * Growth 3B "Arkadaştan çağrı" (day 7): the closest friend of someone who has been away a
 * week sees this card on their home list. One tap calls them back with the friend's own
 * words (editable); if they return, both get the DesCoin reward. "Şimdi değil" hides it.
 * Shows nothing when there is no suggestion (most of the time).
 */
export default function WinbackCallCard({ compact = false }) {
  const t = useT();
  const { locale } = useLocale();
  const [s, setS] = useState(null);
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState(false);
  const [why, setWhy] = useState(false);
  const [phase, setPhase] = useState("idle"); // idle | calling | called | returned | rewarded | error
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    winbackApi
      .suggestion()
      .then((r) => {
        const sug = parseSuggestion(r?.suggestion);
        setS(sug);
        if (sug) setMessage(defaultCallMessage(sug, t, locale));
      })
      .catch(() => setS(null));
  }, [t, locale]);

  useEffect(() => {
    load();
  }, [load]);

  // A new suggestion while the app is open; the friend came back; the reward landed
  // (socket events re-sent as window events by ReengageBridge).
  useEffect(() => {
    const on = (e) => {
      const { event, payload } = e.detail || {};
      if (event === "winback:suggestion") load();
      else if (event === "winback:returned") setPhase((cur) => (cur === "called" && (!s || payload?.targetId === s?.target?.id) ? "returned" : cur));
      else if (event === "winback:rewarded") setPhase((cur) => (cur === "called" || cur === "returned" ? "rewarded" : cur));
    };
    window.addEventListener("descall:rg", on);
    return () => window.removeEventListener("descall:rg", on);
  }, [load, s]);

  if (!s) return null;
  const name = s.target.name;

  const doCall = async () => {
    setPhase("calling");
    setErr("");
    try {
      await winbackApi.call(s.id, message.trim());
      setPhase("called");
    } catch (e) {
      const code = e?.code || e?.message;
      setErr(
        code === "caller_week"
          ? t("rg3.winback.errWeek")
          : code === "target_month"
            ? t("rg3.winback.errMonth", { name })
            : code === "expired" || code === "not_open"
              ? t("rg3.winback.errExpired")
              : code === "off"
                ? t("rg3.winback.errOff")
                : t("rg3.errors.save")
      );
      setPhase("error");
    }
  };

  const dismiss = async () => {
    const id = s.id;
    setS(null);
    try {
      await winbackApi.dismiss(id);
    } catch {
      /* hidden here anyway; the server lets it expire */
    }
  };

  if (phase === "called" || phase === "returned" || phase === "rewarded") {
    return (
      <section className={`rg-wb done${compact ? " compact" : ""}`} aria-live="polite">
        <div className="rg-wb-h">
          <Avatar size={40} name={name} user={{ id: s.target.id, username: s.target.username, avatarUrl: s.target.avatarUrl, display_name: name }} animate="never" frame={false} />
          <div className="tx">
            <b>{phase === "rewarded" ? t("rg3.winback.rewardedTitle", { name }) : phase === "returned" ? t("rg3.winback.returnedTitle", { name }) : t("rg3.winback.calledTitle", { name })}</b>
            <small>{phase === "rewarded" ? t("rg3.winback.rewardedSub", { amount: s.reward }) : phase === "returned" ? t("rg3.winback.returnedSub", { amount: s.reward }) : t("rg3.winback.calledSub", { amount: s.reward })}</small>
          </div>
          <Check size={18} className="rg-wb-ok" />
        </div>
      </section>
    );
  }

  return (
    <section className={`rg-wb${compact ? " compact" : ""}`} aria-label={t("rg3.winback.aria", { name })}>
      <div className="rg-wb-h">
        <span className="rg-wb-av">
          <Avatar size={44} name={name} user={{ id: s.target.id, username: s.target.username, avatarUrl: s.target.avatarUrl, display_name: name }} animate="never" frame={false} />
          <i className="rg-dot off" aria-hidden="true" />
        </span>
        <div className="tx">
          <b>{t("rg3.winback.title", { name, days: s.target.absentDays })}</b>
          <small>{s.serverName ? t("rg3.winback.subServer", { server: s.serverName }) : t("rg3.winback.sub")}</small>
        </div>
      </div>
      {editing ? (
        <textarea
          className="rg-wb-msg edit"
          value={message}
          maxLength={200}
          rows={3}
          onChange={(e) => setMessage(e.target.value)}
          aria-label={t("rg3.winback.editAria")}
          autoFocus
        />
      ) : (
        <button type="button" className="rg-wb-msg" onClick={() => setEditing(true)} aria-label={t("rg3.winback.editAria")}>
          &ldquo;{message}&rdquo;
          <Pencil size={12} />
        </button>
      )}
      <p className="rg-wb-coin">
        <i aria-hidden="true">D</i> {t("rg3.winback.reward", { amount: s.reward })}
      </p>
      {err ? (
        <p className="rg-err" role="alert">
          <AlertTriangle size={13} /> {err}
        </p>
      ) : null}
      <div className="rg-wb-actions">
        <button type="button" className="rg-btn primary" onClick={doCall} disabled={phase === "calling" || !message.trim()}>
          {phase === "calling" ? <Loader2 size={14} className="rg-spin" /> : <BellRing size={14} />} {t("rg3.winback.call")}
        </button>
        <button type="button" className="rg-btn" onClick={dismiss} disabled={phase === "calling"}>
          {t("rg3.winback.notNow")}
        </button>
      </div>
      <button type="button" className="rg-wb-why" onClick={() => setWhy((v) => !v)} aria-expanded={why}>
        {t("rg3.winback.whyTitle")} <ChevronDown size={13} style={{ transform: why ? "rotate(180deg)" : "none" }} />
      </button>
      {why ? <p className="rg-wb-whytext">{t("rg3.winback.why", { name })}</p> : null}
    </section>
  );
}
