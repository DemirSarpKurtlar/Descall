import { useCallback, useEffect, useMemo, useState } from "react";
import { BellRing, RefreshCw, Send, Users, Eye, EyeOff, Clock, Link2, AlertTriangle } from "lucide-react";
import { adminFetch } from "../../api/adminHttp";
import RippleButton from "../ui/RippleButton";
import { Avatar } from "../ui/Avatar";
import { useLocale } from "../../context/LocaleContext";
import { formatAppDateTime } from "../../lib/datetime";
import AdminBroadcastPopup from "./AdminBroadcastPopup";

const EMOJIS = ["📢", "🚨", "⚠️", "✅", "🎉", "🔧", "🔒", "💬"];
const DURATIONS = [
  { value: 0, label: "Until dismissed" },
  { value: 10_000, label: "10 seconds" },
  { value: 30_000, label: "30 seconds" },
  { value: 60_000, label: "1 minute" },
];
const SEVERITIES = [
  { id: "info", label: "Info", color: "#6ea0ff" },
  { id: "success", label: "Success", color: "#23a55a" },
  { id: "warning", label: "Warning", color: "#f0b232" },
  { id: "urgent", label: "Urgent", color: "#da373c" },
];

const EMPTY_DRAFT = {
  title: "",
  body: "",
  severity: "info",
  emoji: "📢",
  durationMs: 0,
  audience: "connected",
  includeSelf: true,
  requireAck: false,
  ctaLabel: "",
  ctaUrl: "",
};

function formatWhen(iso, locale) {
  if (!iso) return "";
  return formatAppDateTime(iso, locale) || iso;
}

export default function AdminLivePopup() {
  const { t, locale } = useLocale();
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [confirm, setConfirm] = useState(null);

  const patch = (partial) => setDraft((prev) => ({ ...prev, ...partial }));

  const load = useCallback(async () => {
    const [nextStats, history] = await Promise.all([
      adminFetch("/stats"),
      adminFetch("/popup/recent").catch(() => ({ entries: [] })),
    ]);
    setStats(nextStats);
    setRecent(history.entries || []);
  }, []);

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, [load]);

  const connected = Number(stats?.connectedCount ?? stats?.onlineUsers ?? 0);
  const visible = Number(stats?.visibleCount ?? 0);
  const invisible = Number(stats?.invisibleCount ?? 0);
  const audienceCount = draft.audience === "visible" ? visible : connected;

  const previewPopup = useMemo(
    () => ({
      id: "preview",
      title: draft.title.trim() || t("Title"),
      body: draft.body.trim() || t("Write your announcement content..."),
      severity: draft.severity,
      emoji: draft.emoji,
      durationMs: draft.durationMs,
      requireAck: draft.requireAck,
      ctaLabel: draft.ctaLabel.trim(),
      ctaUrl: draft.ctaUrl.trim(),
      from: { username: "admin" },
    }),
    [draft, t],
  );

  const canCompose = draft.title.trim() && draft.body.trim();

  const startConfirm = async () => {
    if (!canCompose || busy) return;
    setError("");
    setSuccess("");
    setBusy(true);
    try {
      const result = await adminFetch("/popup", {
        method: "POST",
        body: JSON.stringify({ ...draft, preview: true }),
      });
      if (!result.count) {
        setError(t("No online recipients to send to."));
        return;
      }
      setConfirm(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const sendNow = async () => {
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      const result = await adminFetch("/popup", {
        method: "POST",
        body: JSON.stringify({ ...draft, preview: false }),
      });
      setSuccess(t("Popup delivered to {n} online members.", { n: result.delivered }));
      setConfirm(null);
      setDraft(EMPTY_DRAFT);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="admin-section admin-section-full admin-live-popup">
      <div className="admin-live-popup-head">
        <div>
          <h2>
            <BellRing size={22} /> {t("admin.livePopup")}
          </h2>
          <p className="muted">{t("Send a live popup to everyone currently online.")}</p>
        </div>
        <RippleButton type="button" onClick={() => load().catch((err) => setError(err.message))} disabled={busy}>
          <RefreshCw size={14} /> {t("Refresh")}
        </RippleButton>
      </div>

      <div className="admin-live-popup-stats">
        <div className="admin-live-popup-stat">
          <Users size={16} />
          <div>
            <strong>{connected}</strong>
            <span>{t("Connected now")}</span>
          </div>
        </div>
        <div className="admin-live-popup-stat">
          <Eye size={16} />
          <div>
            <strong>{visible}</strong>
            <span>{t("{n} visible", { n: visible })}</span>
          </div>
        </div>
        <div className="admin-live-popup-stat">
          <EyeOff size={16} />
          <div>
            <strong>{invisible}</strong>
            <span>{t("{n} invisible", { n: invisible })}</span>
          </div>
        </div>
      </div>

      <div className="admin-live-popup-grid">
        <div className="admin-live-popup-compose">
          <label>
            {t("Who receives it")}
            <div className="admin-live-popup-pills">
              <button
                type="button"
                className={draft.audience === "connected" ? "is-on" : ""}
                onClick={() => patch({ audience: "connected" })}
              >
                {t("All connected")} · {connected}
              </button>
              <button
                type="button"
                className={draft.audience === "visible" ? "is-on" : ""}
                onClick={() => patch({ audience: "visible" })}
              >
                {t("Visible only")} · {visible}
              </button>
            </div>
          </label>

          <label>
            {t("Tone")}
            <div className="admin-live-popup-pills">
              {SEVERITIES.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  className={draft.severity === row.id ? "is-on" : ""}
                  style={{ "--pill-accent": row.color }}
                  onClick={() =>
                    patch({
                      severity: row.id,
                      requireAck: row.id === "urgent" ? true : draft.requireAck,
                    })
                  }
                >
                  {t(row.label)}
                </button>
              ))}
            </div>
          </label>

          <label>
            {t("Icon")}
            <div className="admin-live-popup-emojis">
              {EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className={draft.emoji === emoji ? "is-on" : ""}
                  onClick={() => patch({ emoji })}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </label>

          <label>
            {t("Title")}
            <input
              className="admin-input"
              value={draft.title}
              maxLength={80}
              placeholder={t("Short headline")}
              onChange={(event) => patch({ title: event.target.value })}
            />
            <small>{draft.title.length}/80</small>
          </label>

          <label>
            {t("Message")}
            <textarea
              className="admin-input admin-live-popup-body"
              value={draft.body}
              maxLength={800}
              rows={5}
              placeholder={t("What should everyone see right now?")}
              onChange={(event) => patch({ body: event.target.value })}
            />
            <small>{draft.body.length}/800</small>
          </label>

          <label>
            <Clock size={14} /> {t("Auto-close")}
            <select
              className="admin-input"
              value={draft.durationMs}
              onChange={(event) => patch({ durationMs: Number(event.target.value) })}
            >
              {DURATIONS.map((row) => (
                <option key={row.value} value={row.value}>
                  {t(row.label)}
                </option>
              ))}
            </select>
          </label>

          <label className="admin-live-popup-check">
            <input
              type="checkbox"
              checked={draft.requireAck}
              onChange={(event) => patch({ requireAck: event.target.checked })}
            />
            {t("Require acknowledgement (cannot be dismissed until they tap OK)")}
          </label>
          <label className="admin-live-popup-check">
            <input
              type="checkbox"
              checked={draft.includeSelf}
              onChange={(event) => patch({ includeSelf: event.target.checked })}
            />
            {t("Also send it to me")}
          </label>

          <label>
            <Link2 size={14} /> {t("Optional button")}
            <div className="admin-live-popup-cta">
              <input
                className="admin-input"
                value={draft.ctaLabel}
                maxLength={40}
                placeholder={t("Button label")}
                onChange={(event) => patch({ ctaLabel: event.target.value })}
              />
              <input
                className="admin-input"
                value={draft.ctaUrl}
                maxLength={300}
                placeholder="/status or https://descall.com/…"
                onChange={(event) => patch({ ctaUrl: event.target.value })}
              />
            </div>
          </label>

          {error && (
            <div className="admin-live-popup-alert" role="alert">
              <AlertTriangle size={14} /> {error}
            </div>
          )}
          {success && (
            <div className="admin-live-popup-ok" role="status">
              {success}
            </div>
          )}

          {confirm ? (
            <div className="admin-live-popup-confirm">
              <p>
                {t("Send this popup to {n} online members now? It appears on their screen immediately.", {
                  n: confirm.count ?? 0,
                })}
              </p>
              <div className="admin-live-popup-faces">
                {(confirm.recipients || []).slice(0, 10).map((user) => (
                  <span key={user.id} title={user.username || user.id}>
                    <Avatar
                      name={user.username || "?"}
                      size={28}
                      user={{ username: user.username, avatar_url: user.avatar_url }}
                    />
                  </span>
                ))}
                {(confirm.count || 0) > 10 && (
                  <span className="admin-live-popup-more">+{(confirm.count || 0) - 10}</span>
                )}
              </div>
              <div className="admin-live-popup-confirm-actions">
                <RippleButton type="button" onClick={() => setConfirm(null)}>
                  {t("Cancel")}
                </RippleButton>
                <RippleButton type="button" className="admin-btn-green" disabled={busy || !confirm.count} onClick={sendNow}>
                  <Send size={14} /> {t("Send now")}
                </RippleButton>
              </div>
            </div>
          ) : (
            <RippleButton
              type="button"
              className="admin-btn-green admin-live-popup-send"
              disabled={busy || !canCompose || audienceCount <= 0}
              onClick={startConfirm}
            >
              <Send size={14} /> {t("Review and send")}
            </RippleButton>
          )}
        </div>

        <aside className="admin-live-popup-side">
          <h3>{t("Preview")}</h3>
          <AdminBroadcastPopup popup={previewPopup} preview onDismiss={() => {}} />
          <h3>{t("Recent popups")}</h3>
          {recent.length === 0 ? (
            <p className="muted">{t("No live popups sent yet.")}</p>
          ) : (
            <ul className="admin-live-popup-history">
              {recent.map((entry) => (
                <li key={entry.id}>
                  <strong>{entry.popup?.title || t("Untitled")}</strong>
                  <span>
                    {t("{n} delivered", { n: entry.delivered })} · {formatWhen(entry.at, locale)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </section>
  );
}
