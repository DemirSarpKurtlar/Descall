import { useState } from "react";
import {
  Check,
  Hash,
  MessageSquare,
  Pencil,
  Send,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { Avatar } from "../ui/Avatar";
import { useT } from "../../context/LocaleContext";

function typeCopy(type, t) {
  if (type === "dm") return { label: t("dimaai.actionDm"), Icon: MessageSquare };
  if (type === "group") return { label: t("dimaai.actionGroup"), Icon: Users };
  if (type === "channel") return { label: t("dimaai.actionChannel"), Icon: Hash };
  if (type === "friend_request" || type === "friend_accept" || type === "friend_decline") {
    return { label: t("dimaai.actionFriend"), Icon: UserPlus };
  }
  if (type === "custom_status") return { label: t("dimaai.actionStatus"), Icon: Pencil };
  return { label: t("dimaai.agentAction"), Icon: Send };
}

export default function DimaPendingActionCard({
  action,
  labels,
  onConfirm,
  onReject,
  busy,
}) {
  const t = useT();
  const status = String(action?.status || "pending");
  const preview = action?.preview || {};
  const recipient = preview.recipient || {};
  const recipientLabel =
    recipient.displayName || recipient.username || preview.title || labels.agentAction || "Action";
  const username = recipient.username ? `@${String(recipient.username).replace(/^@/, "")}` : "";
  const canEdit = ["dm", "channel", "group"].includes(action?.type) && status === "pending";
  const isMessage = ["dm", "channel", "group"].includes(action?.type);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(preview.body || ""));
  const [error, setError] = useState("");
  const { label: typeLabel, Icon } = typeCopy(action?.type, t);

  if (!action?.id) return null;

  const submit = async () => {
    setError("");
    try {
      await onConfirm?.(action, canEdit ? draft : undefined);
    } catch (err) {
      if (err?.action?.status && err.action.status !== "pending") {
        return;
      }
      const raw = String(err?.message || "");
      if (/no longer pending/i.test(raw) || err?.status === 409) {
        setError(t("dimaai.actionNoLongerPending") || labels.agentFailed);
        return;
      }
      setError(raw || labels.agentFailed || t("dimaai.agentFailed"));
    }
  };

  const cancel = async () => {
    setError("");
    try {
      await onReject?.(action);
    } catch (err) {
      setError(err?.message || labels.agentFailed || "Could not cancel.");
    }
  };

  return (
    <div
      className={`dima-agent-card is-${status}${isMessage ? " is-message" : ""}`}
      role="region"
      aria-label={`${typeLabel}: ${recipientLabel}`}
    >
      <div className="dima-agent-card-head">
        <span className="dima-agent-card-type">
          <Icon size={14} />
          {typeLabel}
        </span>
        {status === "pending" ? (
          <span className="dima-agent-card-pill">{t("dimaai.actionNeedsApproval")}</span>
        ) : null}
      </div>

      {recipientLabel ? (
        <div className="dima-agent-to">
          <Avatar
            name={recipientLabel}
            size={36}
            imageUrl={recipient.avatarUrl || recipient.avatar_url || null}
            animate="never"
          />
          <div className="dima-agent-to-copy">
            <span className="dima-agent-to-label">{t("dimaai.actionTo")}</span>
            <strong>{recipientLabel}</strong>
            {username && username.toLowerCase() !== `@${String(recipientLabel).toLowerCase()}` ? (
              <em>{username}</em>
            ) : null}
          </div>
        </div>
      ) : null}

      {preview.body ? (
        editing && canEdit ? (
          <textarea
            className="dima-agent-card-edit"
            value={draft}
            rows={4}
            maxLength={4000}
            onChange={(e) => setDraft(e.target.value)}
          />
        ) : isMessage ? (
          <div className="dima-agent-preview">
            <span className="dima-agent-preview-label">{t("dimaai.actionYourMessage")}</span>
            <p className="dima-agent-bubble">{preview.body}</p>
          </div>
        ) : (
          <p className="dima-agent-card-body">{preview.body}</p>
        )
      ) : null}

      {preview.warning ? <p className="dima-agent-card-warn">{preview.warning}</p> : null}
      {status === "pending" ? (
        <p className="dima-agent-card-hint">{t("dimaai.actionReviewHint")}</p>
      ) : null}

      {status === "pending" ? (
        <div className="dima-agent-card-actions">
          {canEdit ? (
            <button
              type="button"
              className="dima-agent-btn is-ghost"
              onClick={() => setEditing((v) => !v)}
              disabled={busy}
            >
              <Pencil size={14} />
              {editing ? labels.agentDoneEdit || t("common.done") : t("common.edit")}
            </button>
          ) : null}
          <button type="button" className="dima-agent-btn is-ghost" onClick={cancel} disabled={busy}>
            <X size={14} />
            {labels.agentCancel || "Cancel"}
          </button>
          <button type="button" className="dima-agent-btn is-primary" onClick={submit} disabled={busy || (canEdit && !draft.trim())}>
            <Send size={14} />
            {labels.agentApprove || "Approve & send"}
          </button>
        </div>
      ) : (
        <div className={`dima-agent-card-status is-${status}`}>
          {status === "confirmed" ? <Check size={14} /> : <X size={14} />}
          <span>
            {status === "confirmed"
              ? labels.agentSent || "Done"
              : status === "rejected"
                ? labels.agentCancelled || "Cancelled"
                : status === "expired"
                  ? labels.agentExpired || "Expired"
                  : labels.agentFailed || "Failed"}
          </span>
        </div>
      )}
      {error ? <p className="dima-agent-card-error">{error}</p> : null}
    </div>
  );
}
