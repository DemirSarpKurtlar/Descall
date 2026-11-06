/* Command center (Ultra): messages, friends, calls and notifications in one panel. */
import { useEffect, useState } from "react";
import { useT, useLocale } from "../../context/LocaleContext";
import { useAppBridge } from "./bridge.js";
import { fetchCallHistory } from "../../api/calls.js";
import { formatTime } from "../../i18n/format.js";
import { useFeatureSettings } from "../featureSettings.js";
import { runAction } from "./actions.js";
import { Bell, MessageSquare, Phone, Settings, Users, X, Zap } from "../../components/ui/Icon.jsx";
import "./gaming.css";

const nameOf = (u) => u?.displayName || u?.display_name || u?.username || "";

export default function CommandCenterView({ onClose }) {
  const t = useT();
  const { locale } = useLocale();
  const app = useAppBridge();
  const [calls, setCalls] = useState([]);
  const [qa] = useFeatureSettings("quick_actions", { items: [] });
  useEffect(() => {
    fetchCallHistory({ limit: 6 }).then((r) => setCalls(Array.isArray(r?.calls) ? r.calls : [])).catch(() => setCalls([]));
  }, []);
  const go = (fn) => { fn?.(); onClose?.(); };
  const online = (app.friends || []).filter((f) => app.statusOf?.(f.id) && app.statusOf(f.id) !== "offline").slice(0, 10);
  const dms = (app.recentDms || []).slice(0, 8);
  const notes = app.notifications || [];
  return (
    <div className="pg-modal-backdrop" onClick={onClose} data-testid="pg-command-center">
      <div className="pg-modal" role="dialog" aria-modal="true" aria-label={t("premiumGaming.commandCenter.title")} onClick={(e) => e.stopPropagation()}>
        <div className="pg-modal-head">
          <h2>{t("premiumGaming.commandCenter.title")}</h2>
          <button type="button" className="pg-btn is-small" data-testid="pg-cc-hub" onClick={() => { onClose?.(); try { window.dispatchEvent(new CustomEvent("descall:premium:gaming-hub", { detail: { key: null } })); } catch { /* ignore */ } }}><Settings size={14} />{t("premiumGaming.hub.open")}</button>
          <button type="button" className="pg-btn is-small" onClick={onClose} aria-label={t("premiumGaming.common.close")}><X size={14} /></button>
        </div>
        {Array.isArray(qa.items) && qa.items.length ? (
          <div className="pg-row" style={{ marginBottom: 12 }}>
            <Zap size={14} />
            {qa.items.slice(0, 8).map((it) => (
              <button key={it.id} type="button" className="pg-btn is-small" onClick={() => go(() => runAction(it.action))}>{it.label}</button>
            ))}
          </div>
        ) : null}
        <div className="pg-cc">
          <div className="pg-card">
            <h3><MessageSquare size={14} />{t("premiumGaming.commandCenter.messages")}</h3>
            {dms.length ? (
              <ul className="pg-list">
                {dms.map((d) => (
                  <li key={d.id}>
                    <button type="button" className="pg-link" onClick={() => go(() => app.actions?.openDm?.(d.user))}>{nameOf(d.user)}</button>
                    {d.preview ? <span className="pg-muted pg-grow" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.preview}</span> : null}
                    {d.unread ? <span className="pg-chip is-on">{t("premiumGaming.commandCenter.unread", { count: d.unread })}</span> : null}
                  </li>
                ))}
              </ul>
            ) : <p className="pg-muted">{t("premiumGaming.commandCenter.noMessages")}</p>}
          </div>
          <div className="pg-card">
            <h3><Users size={14} />{t("premiumGaming.commandCenter.friends")}</h3>
            {online.length ? (
              <ul className="pg-list">
                {online.map((f) => (
                  <li key={f.id}>
                    <span className={`pg-dot ${app.statusOf(f.id)}`} />
                    <button type="button" className="pg-link" onClick={() => go(() => app.actions?.openDm?.(f))}>{nameOf(f)}</button>
                    {app.gameOf?.(f.id) ? <span className="pg-muted">{app.gameOf(f.id)}</span> : null}
                  </li>
                ))}
              </ul>
            ) : <p className="pg-muted">{t("premiumGaming.commandCenter.noFriends")}</p>}
          </div>
          <div className="pg-card">
            <h3><Phone size={14} />{t("premiumGaming.commandCenter.calls")}</h3>
            {app.callInfo?.active ? (
              <div className="pg-row"><span className="pg-chip is-on">{t("premiumGaming.commandCenter.inCall")}</span><span className="pg-grow">{app.callInfo.title}</span></div>
            ) : null}
            {calls.length ? (
              <ul className="pg-list">
                {calls.map((c) => (
                  <li key={c.id}>
                    <span className="pg-grow">{c.kind === "group" ? (c.group?.name || "") : nameOf(c.peer)}</span>
                    <span className="pg-muted pg-num">{formatTime(c.startedAt || c.createdAt, locale)}</span>
                  </li>
                ))}
              </ul>
            ) : !app.callInfo?.active ? <p className="pg-muted">{t("premiumGaming.commandCenter.noCalls")}</p> : null}
          </div>
          <div className="pg-card">
            <h3><Bell size={14} />{t("premiumGaming.commandCenter.notifications")}</h3>
            {notes.length ? (
              <ul className="pg-list">
                {notes.slice(0, 8).map((n) => (
                  <li key={n.id}>
                    <button type="button" className="pg-link" onClick={() => go(n.open)}>{n.label}</button>
                  </li>
                ))}
              </ul>
            ) : <p className="pg-muted">{t("premiumGaming.commandCenter.noNotifications")}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
